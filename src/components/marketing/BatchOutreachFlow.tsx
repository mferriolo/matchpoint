// Batch outreach flow — two phases inside one full-screen workspace.
//
//   Phase 1 (picker): user has selected N jobs on the Jobs tab. For
//   each job's company we show the contact list with checkboxes, and
//   pre-check the top-ranked recipient per scoreContact(). User can
//   pick multiple recipients per company; final queue size = sum of
//   selected recipients across selected jobs.
//
//   Phase 2 (queue): one row per (job × recipient) outbound message.
//   Scripts generate in parallel in the background (concurrency 5)
//   the moment the queue opens. Each row has Send (opens Gmail
//   compose, mailto: with subject + body prefilled — same path as
//   OutreachWorkspace.tsx, commit c4c2a02), Skip, and Regenerate.
//   Preview pane on the right shows the focused row's script.
//
// Persistence: nothing. Closing the modal discards the queue. v2
// could write rows to a new outreach_queue_rows table so a user
// can resume mid-batch across sessions.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, X, Send, SkipForward, RefreshCw, AlertCircle, CheckCircle, Mail, Users, Search } from 'lucide-react';
import {
  ContactRow,
  ScoredContact,
  ScriptOutputs,
  MessageType,
  SenderIdentity,
  scoreContact,
  loadSenderIdentity,
  applyScrubToOutputs,
} from './OutreachWorkspace';
import type { ScriptJobInput } from './ScriptGeneratorModal';

type Phase = 'picker' | 'queue';

interface QueueRow {
  // Stable key for React. Built from jobId + contactId at queue-build time.
  key: string;
  job: ScriptJobInput;
  recipient: ContactRow;
  status: 'pending' | 'generating' | 'ready' | 'sent' | 'skipped' | 'failed';
  scripts: ScriptOutputs | null;
  error?: string;
}

const BATCH_SOFT_CAP = 25;
const GENERATE_CONCURRENCY = 5;

// One Gmail compose tab per row — same encoding as
// OutreachWorkspace.buildMailtoHref so the existing tested path is
// reused verbatim.
function buildMailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function fullName(c: ContactRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(unnamed)';
}

export function BatchOutreachFlow({
  jobs,
  onClose,
  onRequestRescanContacts,
}: {
  jobs: ScriptJobInput[];
  onClose: () => void;
  // Called when the user clicks "Find more contacts" on a company
  // card during the picker phase. Delegates to the parent's existing
  // handleFindContacts so we don't fork that flow.
  onRequestRescanContacts?: (companyId: string, companyName: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('picker');

  // Contacts per company. Loaded once on mount for every distinct
  // company across the selected jobs.
  const [contactsByCompanyId, setContactsByCompanyId] = useState<Record<string, ContactRow[]>>({});
  const [loadingContacts, setLoadingContacts] = useState(true);

  // Picker selections: jobId → set of contact ids the user wants to
  // message for that job. Defaults to the top scoreContact result.
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<MessageType>('email');
  const [sender, setSender] = useState<SenderIdentity>({});

  // Load contacts for every distinct company across the selected
  // jobs in a single round-trip. We index by company_id (the canonical
  // key) and fall back to company_name when a job has no company_id
  // (rare — usually means the row was imported before companies got
  // joined). For name fallbacks we still bucket the resulting contacts
  // under their actual company_id so the picker UI is consistent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companyIds = Array.from(new Set(jobs.map(j => j.company_id).filter(Boolean) as string[]));
        const companyNamesWithoutId = Array.from(new Set(
          jobs.filter(j => !j.company_id && j.company_name).map(j => String(j.company_name).toLowerCase().trim())
        ));

        const byCo: Record<string, ContactRow[]> = {};
        if (companyIds.length > 0) {
          const { data } = await supabase
            .from('marketing_contacts')
            .select('id, first_name, last_name, title, email, phone_work, phone_home, phone_cell, linkedin_url, outreach_status, last_outreach_at, company_id, company_name')
            .in('company_id', companyIds);
          for (const c of (data || []) as ContactRow[]) {
            const k = c.company_id || '';
            if (!k) continue;
            if (!byCo[k]) byCo[k] = [];
            byCo[k].push(c);
          }
        }
        if (companyNamesWithoutId.length > 0) {
          const { data } = await supabase
            .from('marketing_contacts')
            .select('id, first_name, last_name, title, email, phone_work, phone_home, phone_cell, linkedin_url, outreach_status, last_outreach_at, company_id, company_name')
            .in('company_name', companyNamesWithoutId);
          for (const c of (data || []) as ContactRow[]) {
            // No company_id on the job — bucket by lowercased name so
            // the picker still finds them.
            const k = `name:${String(c.company_name || '').toLowerCase().trim()}`;
            if (!byCo[k]) byCo[k] = [];
            byCo[k].push(c);
          }
        }
        if (cancelled) return;
        setContactsByCompanyId(byCo);

        // Auto-pre-select the top-ranked contact per job. Users can
        // adjust before advancing.
        const initialPicks: Record<string, Set<string>> = {};
        for (const job of jobs) {
          const bucket = bucketKey(job);
          const list = byCo[bucket] || [];
          if (list.length === 0) {
            initialPicks[job.id] = new Set();
            continue;
          }
          const top = pickTopContact(list, job.job_type || '');
          initialPicks[job.id] = new Set(top ? [top.id] : []);
        }
        setPicks(initialPicks);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-load the sender identity so the generation step doesn't pay
  // the round-trip later (and so the picker can display "From: ..."
  // for context).
  useEffect(() => {
    loadSenderIdentity().then(setSender).catch(() => setSender({}));
  }, []);

  // ===========================================================
  // PICKER PHASE
  // ===========================================================
  const totalPicked = useMemo(() =>
    Object.values(picks).reduce((sum, s) => sum + s.size, 0),
  [picks]);

  const togglePick = (jobId: string, contactId: string) => {
    setPicks(prev => {
      const next = { ...prev };
      const current = new Set(next[jobId] || []);
      if (current.has(contactId)) current.delete(contactId);
      else current.add(contactId);
      next[jobId] = current;
      return next;
    });
  };

  const advance = () => {
    if (totalPicked === 0) return;
    if (totalPicked > BATCH_SOFT_CAP) {
      // Soft cap — confirm before continuing.
      const ok = window.confirm(
        `You're about to queue ${totalPicked} outbound messages (${BATCH_SOFT_CAP} is the recommended ceiling for a single sitting). Continue?`
      );
      if (!ok) return;
    }
    const built: QueueRow[] = [];
    for (const job of jobs) {
      const sel = picks[job.id];
      if (!sel || sel.size === 0) continue;
      const bucket = bucketKey(job);
      const all = contactsByCompanyId[bucket] || [];
      for (const c of all) {
        if (!sel.has(c.id)) continue;
        built.push({
          key: `${job.id}::${c.id}`,
          job,
          recipient: c,
          status: 'pending',
          scripts: null,
        });
      }
    }
    setRows(built);
    setFocusedRowKey(built[0]?.key || null);
    setPhase('queue');
  };

  // ===========================================================
  // QUEUE PHASE — background generation
  // ===========================================================
  // generateOne takes the row object directly (not just a key) so it
  // doesn't rely on stale closure-captured `rows`. Both the initial
  // batch effect and the regenerate button call this.
  const generateOne = async (row: QueueRow) => {
    setRows(prev => prev.map(r => r.key === row.key ? { ...r, status: 'generating' } : r));

    try {
      const ageDays = (() => {
        const iso = row.job.date_posted || row.job.created_at;
        if (!iso) return null;
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
      })();

      // Defaults for FormInputs — the user can still open the per-job
      // OutreachWorkspace for full customization. The recipient
      // classifier inside the edge function uses the recipient's title
      // to pick persona framing, so the batch picker's top selection
      // drives the message tone without exposing the legacy audience
      // dropdown in the batch path.
      const inputs = {
        audience: 'Hiring decision-maker',
        audienceOther: '',
        problem: 'An unfilled critical role',
        problemOther: '',
        service: 'Specialized healthcare recruiting',
        serviceOther: '',
        companyType: row.job.company_type || '',
        roleCategory: row.job.job_type || '',
        urgency: 'High — recent posting',
        tone: 'Confident, peer-to-peer',
        proof: 'Specialized healthcare recruiting expertise',
        proofOther: '',
        cta: 'A brief intro call',
        ctaOther: '',
        objections: [] as string[],
        customOpener: '',
        specificPain: '',
        companyInsight: '',
        hiringManagerName: fullName(row.recipient),
        caseStudy: '',
        notes: '',
        avoidLanguage: '',
      };

      const recipient = {
        title: row.recipient.title || '',
        first_name: row.recipient.first_name || '',
        last_name: row.recipient.last_name || '',
      };

      const payload = {
        sender,
        job: {
          company_name: row.job.company_name,
          job_title: row.job.job_title,
          city: row.job.city,
          state: row.job.state,
          job_url: row.job.job_url,
          date_posted: row.job.date_posted,
          age_days: ageDays,
          company_type: row.job.company_type,
          compensation: row.job.compensation,
          priority_score: row.job.priority_score,
          company_description: row.job.company_description,
          job_description: row.job.description,
        },
        inputs,
        recipient,
      };

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 65_000);
      const result = await supabase.functions.invoke('generate-job-script', { body: payload, signal: ac.signal as any });
      clearTimeout(timer);

      if (result.error) {
        throw new Error(result.error.message || 'generate-job-script failed');
      }
      const outputs = (result.data as any)?.outputs as ScriptOutputs | undefined;
      if (!outputs) throw new Error('No outputs in response');

      const scrubbed = applyScrubToOutputs(outputs, sender);
      setRows(prev => prev.map(r => r.key === row.key ? { ...r, status: 'ready', scripts: scrubbed, error: undefined } : r));
    } catch (e: any) {
      setRows(prev => prev.map(r => r.key === row.key ? { ...r, status: 'failed', error: e?.message || String(e) } : r));
    }
  };

  // Initial batch generation. Fires once when phase flips to queue.
  // Concurrency-bounded so we don't fan out a 25-message batch into
  // 25 simultaneous OpenAI calls.
  useEffect(() => {
    if (phase !== 'queue' || rows.length === 0) return;
    let cancelled = false;
    (async () => {
      const queue = rows.filter(r => r.status === 'pending');
      const inFlight: Promise<void>[] = [];
      for (const row of queue) {
        if (cancelled) return;
        while (inFlight.length >= GENERATE_CONCURRENCY) {
          await Promise.race(inFlight);
        }
        if (cancelled) return;
        const p = generateOne(row).finally(() => {
          const idx = inFlight.indexOf(p);
          if (idx >= 0) inFlight.splice(idx, 1);
        });
        inFlight.push(p);
      }
      await Promise.all(inFlight);
    })();
    return () => { cancelled = true; };
    // Run once per (phase, sender) transition. rows is intentionally
    // not in the dep list — we don't want every status update to
    // restart the batch loop. Sender is included so a late-arriving
    // sender identity doesn't get baked in as undefined for the first
    // batch (the load is async).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sender]);

  const regenerateOne = (rowKey: string) => {
    const row = rows.find(r => r.key === rowKey);
    if (!row) return;
    // Inline trigger — don't wait for an effect to pick this up.
    generateOne({ ...row, status: 'pending', scripts: null, error: undefined });
  };

  const skipOne = (rowKey: string) => {
    setRows(prev => prev.map(r => r.key === rowKey ? { ...r, status: 'skipped' } : r));
  };

  const sendOne = (rowKey: string, format: MessageType) => {
    const row = rows.find(r => r.key === rowKey);
    if (!row || !row.scripts) return;
    const email = (row.recipient.email || '').trim();
    if (!email && format !== 'coldCall' && format !== 'linkedin') {
      window.alert(`${fullName(row.recipient)} has no email on file. Use LinkedIn or Cold Call instead.`);
      return;
    }
    if (format === 'email' || format === 'followUpEmail') {
      const block = format === 'email' ? row.scripts.email : row.scripts.followUpEmail;
      window.open(buildMailtoHref(email, block.subject, block.body), '_blank', 'noopener');
    } else if (format === 'linkedin') {
      // LinkedIn doesn't have a compose URL; copy the script + open
      // the recipient's LinkedIn profile if known.
      const url = (row.recipient.linkedin_url || '').trim();
      navigator.clipboard?.writeText(row.scripts.linkedin).catch(() => {});
      if (url) window.open(url, '_blank', 'noopener');
      else window.alert('LinkedIn message copied to clipboard. (No LinkedIn URL on file for this contact.)');
    } else if (format === 'coldCall') {
      navigator.clipboard?.writeText(row.scripts.coldCall).catch(() => {});
      window.alert('Cold call script copied to clipboard.');
    }
    // Optimistically mark as sent. (We don't have Gmail-send
    // confirmation; the row goes to "sent" once the user clicks Send.)
    setRows(prev => prev.map(r => r.key === rowKey ? { ...r, status: 'sent' } : r));
  };

  // ===========================================================
  // RENDER
  // ===========================================================
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center">
      <div className="bg-white w-full max-w-7xl m-4 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Batch Outreach</h2>
            <p className="text-xs text-gray-500">
              {phase === 'picker'
                ? `Pick recipients for ${jobs.length} job${jobs.length === 1 ? '' : 's'}.`
                : `${rows.length} message${rows.length === 1 ? '' : 's'} queued.`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase === 'picker' && (
          <PickerView
            jobs={jobs}
            contactsByCompanyId={contactsByCompanyId}
            picks={picks}
            loading={loadingContacts}
            onTogglePick={togglePick}
            onRequestRescanContacts={onRequestRescanContacts}
          />
        )}

        {phase === 'queue' && (
          <QueueView
            rows={rows}
            focusedRowKey={focusedRowKey}
            activeFormat={activeFormat}
            onFocusRow={setFocusedRowKey}
            onActiveFormat={setActiveFormat}
            onSendOne={sendOne}
            onSkipOne={skipOne}
            onRegenerateOne={regenerateOne}
          />
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between bg-gray-50">
          {phase === 'picker' ? (
            <>
              <div className="text-xs text-gray-500">
                {totalPicked > 0
                  ? `${totalPicked} message${totalPicked === 1 ? '' : 's'} will be queued`
                  : 'Select at least one recipient'}
                {totalPicked > BATCH_SOFT_CAP && (
                  <span className="ml-2 text-amber-600">
                    Above {BATCH_SOFT_CAP}-message recommended limit — you'll be asked to confirm.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border hover:bg-white">
                  Cancel
                </button>
                <button
                  onClick={advance}
                  disabled={totalPicked === 0 || loadingContacts}
                  className="px-3 py-1.5 text-sm rounded bg-[#911406] text-white hover:bg-[#7a1005] disabled:opacity-40"
                >
                  Open Queue →
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-gray-500">
                {rows.filter(r => r.status === 'sent').length} sent ·{' '}
                {rows.filter(r => r.status === 'skipped').length} skipped ·{' '}
                {rows.filter(r => r.status === 'failed').length} failed ·{' '}
                {rows.filter(r => r.status === 'ready' || r.status === 'pending' || r.status === 'generating').length} open
              </div>
              <button onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-[#911406] text-white hover:bg-[#7a1005]">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================
// Picker view
// ===========================================================
function PickerView({
  jobs,
  contactsByCompanyId,
  picks,
  loading,
  onTogglePick,
  onRequestRescanContacts,
}: {
  jobs: ScriptJobInput[];
  contactsByCompanyId: Record<string, ContactRow[]>;
  picks: Record<string, Set<string>>;
  loading: boolean;
  onTogglePick: (jobId: string, contactId: string) => void;
  onRequestRescanContacts?: (companyId: string, companyName: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading contacts…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      {jobs.map(job => {
        const bucket = bucketKey(job);
        const contacts = contactsByCompanyId[bucket] || [];
        const ranked = contacts
          .map(c => scoreContact(c, job.job_type || ''))
          .sort((a, b) => b.score - a.score);
        const sel = picks[job.id] || new Set();

        return (
          <div key={job.id} className="border rounded-lg p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{job.job_title || '(untitled role)'}</div>
                <div className="text-xs text-gray-500 truncate">
                  {job.company_name || '(no company)'}
                  {job.city || job.state ? ` · ${[job.city, job.state].filter(Boolean).join(', ')}` : ''}
                </div>
              </div>
              {job.company_id && onRequestRescanContacts && (
                <button
                  onClick={() => onRequestRescanContacts(job.company_id!, job.company_name || '')}
                  className="text-[11px] text-emerald-700 hover:underline whitespace-nowrap flex items-center gap-1 px-2"
                  title="Run the find-contacts edge function against this company to surface more decision-makers"
                >
                  <Search className="w-3 h-3" />
                  Find more
                </button>
              )}
            </div>

            {ranked.length === 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded">
                No contacts on file for this company.{' '}
                {job.company_id && onRequestRescanContacts && (
                  <button
                    onClick={() => onRequestRescanContacts(job.company_id!, job.company_name || '')}
                    className="underline font-medium"
                  >
                    Find contacts now
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {ranked.map(({ c, score, reasons }) => {
                  const checked = sel.has(c.id);
                  const has = (s?: string | null) => s && s.trim().length > 0;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${checked ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onTogglePick(job.id, c.id)}
                        className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600/30"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{fullName(c)}</span>
                          <span className="text-xs text-gray-500 truncate">{c.title || '(no title)'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 tabular-nums">
                            fit {score}
                          </span>
                          {!has(c.email) && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">no email</span>
                          )}
                        </div>
                        {reasons[0] && (
                          <div className="text-[11px] text-gray-500 italic mt-0.5">{reasons[0]}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================
// Queue view
// ===========================================================
function QueueView({
  rows,
  focusedRowKey,
  activeFormat,
  onFocusRow,
  onActiveFormat,
  onSendOne,
  onSkipOne,
  onRegenerateOne,
}: {
  rows: QueueRow[];
  focusedRowKey: string | null;
  activeFormat: MessageType;
  onFocusRow: (key: string) => void;
  onActiveFormat: (fmt: MessageType) => void;
  onSendOne: (key: string, format: MessageType) => void;
  onSkipOne: (key: string) => void;
  onRegenerateOne: (key: string) => void;
}) {
  const focused = rows.find(r => r.key === focusedRowKey) || rows[0];

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Row list */}
      <div className="w-[360px] border-r overflow-y-auto">
        {rows.map(r => (
          <button
            key={r.key}
            onClick={() => onFocusRow(r.key)}
            className={`w-full text-left px-3 py-2 border-b text-sm transition-colors ${
              focused?.key === r.key ? 'bg-blue-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <StatusBadge status={r.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{fullName(r.recipient)}</div>
                <div className="text-xs text-gray-500 truncate">{r.recipient.title || '(no title)'}</div>
                <div className="text-xs text-gray-700 truncate mt-0.5">
                  {r.job.job_title || '(role)'} · {r.job.company_name || ''}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Preview pane */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {!focused ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a row.
          </div>
        ) : (
          <PreviewPane
            row={focused}
            activeFormat={activeFormat}
            onActiveFormat={onActiveFormat}
            onSend={() => onSendOne(focused.key, activeFormat)}
            onSkip={() => onSkipOne(focused.key)}
            onRegenerate={() => onRegenerateOne(focused.key)}
          />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: QueueRow['status'] }) {
  if (status === 'pending') return <Loader2 className="w-4 h-4 text-gray-300 mt-0.5" />;
  if (status === 'generating') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin mt-0.5" />;
  if (status === 'ready') return <Mail className="w-4 h-4 text-emerald-600 mt-0.5" />;
  if (status === 'sent') return <CheckCircle className="w-4 h-4 text-emerald-700 mt-0.5" />;
  if (status === 'skipped') return <SkipForward className="w-4 h-4 text-gray-400 mt-0.5" />;
  return <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />;
}

function PreviewPane({
  row,
  activeFormat,
  onActiveFormat,
  onSend,
  onSkip,
  onRegenerate,
}: {
  row: QueueRow;
  activeFormat: MessageType;
  onActiveFormat: (fmt: MessageType) => void;
  onSend: () => void;
  onSkip: () => void;
  onRegenerate: () => void;
}) {
  const formats: { key: MessageType; label: string }[] = [
    { key: 'email',         label: 'Email' },
    { key: 'followUpEmail', label: 'Follow-Up' },
    { key: 'linkedin',      label: 'LinkedIn' },
    { key: 'coldCall',      label: 'Cold Call' },
  ];

  return (
    <>
      <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {fullName(row.recipient)} · <span className="text-gray-500 font-normal">{row.recipient.title || ''}</span>
          </div>
          <div className="text-xs text-gray-500 truncate">
            {row.job.job_title} · {row.job.company_name}
            {row.recipient.email && <> · <span className="text-gray-600">{row.recipient.email}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRegenerate}
            disabled={row.status === 'generating' || row.status === 'pending'}
            className="px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 inline-flex items-center gap-1"
            title="Regenerate the script for this row"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
          <button
            onClick={onSkip}
            disabled={row.status === 'sent' || row.status === 'skipped'}
            className="px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <SkipForward className="w-3 h-3" />
            Skip
          </button>
          <button
            onClick={onSend}
            disabled={row.status !== 'ready'}
            className="px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Send className="w-3 h-3" />
            Send
          </button>
        </div>
      </div>

      {/* Format tabs */}
      <div className="px-4 py-1.5 border-b bg-gray-50 flex items-center gap-1">
        {formats.map(f => (
          <button
            key={f.key}
            onClick={() => onActiveFormat(f.key)}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${activeFormat === f.key ? 'bg-white border shadow-sm' : 'text-gray-600 hover:bg-white'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Script body */}
      <div className="flex-1 overflow-y-auto p-4">
        {row.status === 'pending' && <div className="text-sm text-gray-400">Waiting in queue…</div>}
        {row.status === 'generating' && (
          <div className="text-sm text-gray-500 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Generating script…
          </div>
        )}
        {row.status === 'failed' && (
          <div className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">
            <div className="font-semibold">Generation failed</div>
            <div className="mt-1 font-mono text-[11px] whitespace-pre-wrap">{row.error || 'Unknown error'}</div>
            <button onClick={onRegenerate} className="mt-2 text-xs underline">Retry</button>
          </div>
        )}
        {(row.status === 'ready' || row.status === 'sent' || row.status === 'skipped') && row.scripts && (
          <FormatBody scripts={row.scripts} format={activeFormat} />
        )}
      </div>
    </>
  );
}

function FormatBody({ scripts, format }: { scripts: ScriptOutputs; format: MessageType }) {
  if (format === 'email') {
    return (
      <div className="space-y-2 text-sm">
        <div><span className="text-gray-500 text-xs">Subject:</span> <span className="font-medium">{scripts.email.subject}</span></div>
        <div className="whitespace-pre-wrap text-gray-800">{scripts.email.body}</div>
      </div>
    );
  }
  if (format === 'followUpEmail') {
    return (
      <div className="space-y-2 text-sm">
        <div><span className="text-gray-500 text-xs">Subject:</span> <span className="font-medium">{scripts.followUpEmail.subject}</span></div>
        <div className="whitespace-pre-wrap text-gray-800">{scripts.followUpEmail.body}</div>
      </div>
    );
  }
  if (format === 'linkedin') {
    return <div className="whitespace-pre-wrap text-sm text-gray-800">{scripts.linkedin}</div>;
  }
  return <div className="whitespace-pre-wrap text-sm text-gray-800">{scripts.coldCall}</div>;
}

// ===========================================================
// Helpers
// ===========================================================

/** The bucket key under which we store a company's contacts. Prefer
 *  company_id; fall back to a normalized name when the job has no
 *  company_id (rare). Mirrors the keying in the load effect above. */
function bucketKey(job: ScriptJobInput): string {
  if (job.company_id) return job.company_id;
  return `name:${String(job.company_name || '').toLowerCase().trim()}`;
}

/** Top-ranked contact for a role, or null if the list is empty. */
function pickTopContact(contacts: ContactRow[], roleCategory: string): ContactRow | null {
  if (contacts.length === 0) return null;
  const ranked = contacts.map(c => scoreContact(c, roleCategory)).sort((a, b) => b.score - a.score);
  return ranked[0]?.c || null;
}
