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
import { Loader2, X, Send, SkipForward, RefreshCw, AlertCircle, CheckCircle, Mail, Users, Search, Settings2 } from 'lucide-react';
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
import {
  OutreachFormInputs,
  defaultOutreachInputs,
  AUDIENCE_OPTIONS,
  PROBLEM_OPTIONS,
  SERVICE_OPTIONS,
  URGENCY_OPTIONS,
  TONE_OPTIONS,
  PROOF_OPTIONS,
  CTA_OPTIONS,
  OBJECTION_OPTIONS,
} from './outreachInputs';

type Phase = 'picker' | 'queue';

interface QueueRow {
  // Stable key for React. Built from jobId + contactId at queue-build time.
  key: string;
  job: ScriptJobInput;
  recipient: ContactRow;
  status: 'pending' | 'generating' | 'ready' | 'sent' | 'skipped' | 'failed';
  scripts: ScriptOutputs | null;
  error?: string;
  // Per-row form inputs. Initialized from defaultOutreachInputs() at
  // queue-build time, with companyType / roleCategory /
  // hiringManagerName filled from the job + recipient. User can edit
  // via the Customize dialog and regenerate. customized=true once the
  // user has clicked Save in the dialog (drives the badge on the
  // Customize button so they can see which rows they've tuned).
  inputs: OutreachFormInputs;
  customized: boolean;
  // Per-format in-place edits. Each is undefined when the user
  // hasn't touched that field yet; the preview pane falls back to
  // row.scripts.* in that case. On regenerate we clear all edits
  // since the new generation is the new canonical text.
  edits: {
    emailSubject?: string;
    emailBody?: string;
    followUpSubject?: string;
    followUpBody?: string;
    linkedin?: string;
    coldCall?: string;
  };
}

function buildInitialInputs(job: ScriptJobInput, recipient: ContactRow): OutreachFormInputs {
  const base = defaultOutreachInputs();
  return {
    ...base,
    companyType: job.company_type || '',
    roleCategory: job.job_type || '',
    hiringManagerName: [recipient.first_name, recipient.last_name].filter(Boolean).join(' ').trim(),
  };
}

const BATCH_SOFT_CAP = 25;
const GENERATE_CONCURRENCY = 5;

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
  // null when closed. Holds the rowKey being customized otherwise.
  const [customizingRowKey, setCustomizingRowKey] = useState<string | null>(null);

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

  // Per-card toggle: if every contact at this company is already
  // picked → clear; otherwise → pick all of them. Empty rosters
  // (no contacts on file) are a no-op.
  const toggleAllForJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const bucket = bucketKey(job);
    const all = contactsByCompanyId[bucket] || [];
    if (all.length === 0) return;
    setPicks(prev => {
      const current = prev[jobId] || new Set<string>();
      const everyone = all.every(c => current.has(c.id));
      return { ...prev, [jobId]: everyone ? new Set<string>() : new Set(all.map(c => c.id)) };
    });
  };

  // Global toggle: if every contact across EVERY selected job is
  // currently picked → clear all picks. Otherwise → pick every
  // contact at every job. Jobs with no contacts are ignored when
  // deciding "all selected".
  const toggleAllAcrossJobs = () => {
    let everyone = true;
    let anyAvailable = false;
    for (const job of jobs) {
      const all = contactsByCompanyId[bucketKey(job)] || [];
      if (all.length === 0) continue;
      anyAvailable = true;
      const current = picks[job.id] || new Set<string>();
      if (!all.every(c => current.has(c.id))) { everyone = false; break; }
    }
    if (!anyAvailable) return;
    setPicks(() => {
      const next: Record<string, Set<string>> = {};
      for (const job of jobs) {
        const all = contactsByCompanyId[bucketKey(job)] || [];
        next[job.id] = everyone ? new Set<string>() : new Set(all.map(c => c.id));
      }
      return next;
    });
  };

  // Counts for the "Select all" buttons. totalAvailable = total
  // contacts across all selected jobs' companies; totalPicked already
  // tracked above. Both feed the picker header.
  const totalAvailable = useMemo(() =>
    jobs.reduce((sum, j) => sum + (contactsByCompanyId[bucketKey(j)] || []).length, 0),
  [jobs, contactsByCompanyId]);

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
          inputs: buildInitialInputs(job, c),
          customized: false,
          edits: {},
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

      // Per-row form inputs. Defaults to defaultOutreachInputs() at
      // queue-build time; the Customize dialog mutates row.inputs and
      // re-fires generateOne so any per-row tuning takes effect on
      // the next regeneration.
      const inputs = row.inputs;

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
    // Clear in-place edits — a regeneration replaces the canonical
    // text, so any prior tweaks would otherwise stick to the row in
    // confusing ways.
    generateOne({ ...row, status: 'pending', scripts: null, error: undefined, edits: {} });
  };

  // Field-level edit handler — called from the preview pane when the
  // user types in the subject / body / linkedin / cold-call textarea.
  const editField = (rowKey: string, field: keyof QueueRow['edits'], value: string) => {
    setRows(prev => prev.map(r => r.key === rowKey ? { ...r, edits: { ...r.edits, [field]: value } } : r));
  };

  // Save handler for the Customize dialog. Updates the row's inputs,
  // marks it customized (badge on the button), and re-fires generation
  // with the new inputs in one go. We pass the updated row directly
  // into generateOne so we don't race the setRows commit.
  const saveCustomInputs = (rowKey: string, next: OutreachFormInputs) => {
    const row = rows.find(r => r.key === rowKey);
    if (!row) return;
    const updated: QueueRow = {
      ...row,
      inputs: next,
      customized: true,
      status: 'pending',
      scripts: null,
      error: undefined,
      edits: {},
    };
    setRows(prev => prev.map(r => r.key === rowKey ? updated : r));
    setCustomizingRowKey(null);
    generateOne(updated);
  };

  const skipOne = (rowKey: string) => {
    setRows(prev => prev.map(r => r.key === rowKey ? { ...r, status: 'skipped' } : r));
  };

  // Resolve the text the user actually wants sent for a given format,
  // preferring any in-place edit over the canonical script output.
  const resolveSendable = (row: QueueRow, format: MessageType): { subject: string; body: string } => {
    if (!row.scripts) return { subject: '', body: '' };
    if (format === 'email') {
      return {
        subject: row.edits.emailSubject ?? row.scripts.email.subject,
        body:    row.edits.emailBody    ?? row.scripts.email.body,
      };
    }
    if (format === 'followUpEmail') {
      return {
        subject: row.edits.followUpSubject ?? row.scripts.followUpEmail.subject,
        body:    row.edits.followUpBody    ?? row.scripts.followUpEmail.body,
      };
    }
    if (format === 'linkedin') return { subject: '', body: row.edits.linkedin ?? row.scripts.linkedin };
    return { subject: '', body: row.edits.coldCall ?? row.scripts.coldCall };
  };

  const sendOne = (rowKey: string, format: MessageType) => {
    const row = rows.find(r => r.key === rowKey);
    if (!row || !row.scripts) return;
    const email = (row.recipient.email || '').trim();
    if (!email && format !== 'coldCall' && format !== 'linkedin') {
      window.alert(`${fullName(row.recipient)} has no email on file. Use LinkedIn or Cold Call instead.`);
      return;
    }
    const { subject, body } = resolveSendable(row, format);

    if (format === 'email' || format === 'followUpEmail') {
      // Two-step open matching OutreachWorkspace.tsx (commit c4c2a02):
      //  1. Copy the body to the clipboard so the user only needs to
      //     Cmd/Ctrl+V after Gmail opens.
      //  2. Open Gmail compose with TO + SUBJECT only. Body in the URL
      //     made Gmail open blank tabs (URL length + encoding limits),
      //     which is the exact symptom the user reported.
      navigator.clipboard?.writeText(body).catch(() => {});
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
      window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    } else if (format === 'linkedin') {
      const url = (row.recipient.linkedin_url || '').trim();
      navigator.clipboard?.writeText(body).catch(() => {});
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else window.alert('LinkedIn message copied to clipboard. (No LinkedIn URL on file for this contact.)');
    } else if (format === 'coldCall') {
      navigator.clipboard?.writeText(body).catch(() => {});
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
            onToggleAllForJob={toggleAllForJob}
            onToggleAllAcrossJobs={toggleAllAcrossJobs}
            totalPicked={totalPicked}
            totalAvailable={totalAvailable}
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
            onCustomizeOne={setCustomizingRowKey}
            onEditField={editField}
          />
        )}

        {customizingRowKey && (() => {
          const row = rows.find(r => r.key === customizingRowKey);
          if (!row) return null;
          return (
            <CustomizeDialog
              row={row}
              onSave={(next) => saveCustomInputs(customizingRowKey, next)}
              onCancel={() => setCustomizingRowKey(null)}
            />
          );
        })()}

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
  onToggleAllForJob,
  onToggleAllAcrossJobs,
  totalPicked,
  totalAvailable,
  onRequestRescanContacts,
}: {
  jobs: ScriptJobInput[];
  contactsByCompanyId: Record<string, ContactRow[]>;
  picks: Record<string, Set<string>>;
  loading: boolean;
  onTogglePick: (jobId: string, contactId: string) => void;
  onToggleAllForJob: (jobId: string) => void;
  onToggleAllAcrossJobs: () => void;
  totalPicked: number;
  totalAvailable: number;
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

  // Global "select all" state — true when every selectable contact
  // across every job is already in picks. Used to flip the button
  // label between "Select all" and "Clear all".
  const allPicked = totalAvailable > 0 && totalPicked === totalAvailable;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
      {totalAvailable > 0 && (
        <div className="flex items-center justify-between bg-gray-50 border rounded-lg px-3 py-2">
          <div className="text-xs text-gray-600">
            <span className="font-semibold text-gray-900">{totalPicked}</span> of{' '}
            <span className="font-semibold text-gray-900">{totalAvailable}</span> contact{totalAvailable === 1 ? '' : 's'} selected across{' '}
            <span className="font-semibold text-gray-900">{jobs.length}</span> job{jobs.length === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={onToggleAllAcrossJobs}
            className="text-xs font-medium text-[#911406] hover:underline"
            title={allPicked
              ? 'Clear every selection across every job'
              : 'Select every contact at every selected job\'s company'}
          >
            {allPicked ? 'Clear all' : 'Select all'}
          </button>
        </div>
      )}
      {jobs.map(job => {
        const bucket = bucketKey(job);
        const contacts = contactsByCompanyId[bucket] || [];
        const ranked = contacts
          .map(c => scoreContact(c, job.job_type || ''))
          .sort((a, b) => b.score - a.score);
        const sel = picks[job.id] || new Set();

        return (
          <div key={job.id} className="border rounded-lg p-3">
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{job.job_title || '(untitled role)'}</div>
                <div className="text-xs text-gray-500 truncate">
                  {job.company_name || '(no company)'}
                  {job.city || job.state ? ` · ${[job.city, job.state].filter(Boolean).join(', ')}` : ''}
                  {ranked.length > 0 && (
                    <> · <span className="font-medium text-gray-700">{sel.size}</span>/<span className="font-medium text-gray-700">{ranked.length}</span> selected</>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {ranked.length > 0 && (() => {
                  const allHerePicked = ranked.every(r => sel.has(r.c.id));
                  return (
                    <button
                      onClick={() => onToggleAllForJob(job.id)}
                      className="text-[11px] text-[#911406] hover:underline whitespace-nowrap font-medium"
                      title={allHerePicked
                        ? `Clear every contact at ${job.company_name || 'this company'}`
                        : `Select every contact at ${job.company_name || 'this company'} (${ranked.length})`}
                    >
                      {allHerePicked ? 'Clear' : `Select all (${ranked.length})`}
                    </button>
                  );
                })()}
                {job.company_id && onRequestRescanContacts && (
                  <button
                    onClick={() => onRequestRescanContacts(job.company_id!, job.company_name || '')}
                    className="text-[11px] text-emerald-700 hover:underline whitespace-nowrap flex items-center gap-1"
                    title="Run the find-contacts edge function against this company to surface more decision-makers"
                  >
                    <Search className="w-3 h-3" />
                    Find more
                  </button>
                )}
              </div>
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
  onCustomizeOne,
  onEditField,
}: {
  rows: QueueRow[];
  focusedRowKey: string | null;
  activeFormat: MessageType;
  onFocusRow: (key: string) => void;
  onActiveFormat: (fmt: MessageType) => void;
  onSendOne: (key: string, format: MessageType) => void;
  onSkipOne: (key: string) => void;
  onRegenerateOne: (key: string) => void;
  onCustomizeOne: (key: string) => void;
  onEditField: (key: string, field: keyof QueueRow['edits'], value: string) => void;
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
            onCustomize={() => onCustomizeOne(focused.key)}
            onEditField={(field, value) => onEditField(focused.key, field, value)}
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
  onCustomize,
  onEditField,
}: {
  row: QueueRow;
  activeFormat: MessageType;
  onActiveFormat: (fmt: MessageType) => void;
  onSend: () => void;
  onSkip: () => void;
  onRegenerate: () => void;
  onCustomize: () => void;
  onEditField: (field: keyof QueueRow['edits'], value: string) => void;
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
            onClick={onCustomize}
            className="px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1"
            title="Customize audience, problem, tone, proof, CTA, and objections for this row — same criteria as the per-job message creator"
          >
            <Settings2 className="w-3 h-3" />
            Customize
            {row.customized && (
              <span className="ml-0.5 text-[9px] uppercase tracking-wider px-1 py-px rounded bg-blue-100 text-blue-700 font-semibold">
                Tuned
              </span>
            )}
          </button>
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
          <EditableFormatBody row={row} format={activeFormat} onEditField={onEditField} />
        )}
      </div>
    </>
  );
}

function EditableFormatBody({
  row,
  format,
  onEditField,
}: {
  row: QueueRow;
  format: MessageType;
  onEditField: (field: keyof QueueRow['edits'], value: string) => void;
}) {
  const scripts = row.scripts;
  if (!scripts) return null;

  // Disable edits once Send has been clicked — the row is effectively
  // closed, and editing after the fact would mismatch what was sent.
  // Skipped rows stay editable in case the user changes their mind.
  const readOnly = row.status === 'sent';

  if (format === 'email') {
    const subject = row.edits.emailSubject ?? scripts.email.subject;
    const body    = row.edits.emailBody    ?? scripts.email.body;
    return (
      <div className="space-y-2">
        <SubjectInput value={subject} onChange={v => onEditField('emailSubject', v)} readOnly={readOnly} />
        <BodyTextarea value={body} onChange={v => onEditField('emailBody', v)} readOnly={readOnly} />
      </div>
    );
  }
  if (format === 'followUpEmail') {
    const subject = row.edits.followUpSubject ?? scripts.followUpEmail.subject;
    const body    = row.edits.followUpBody    ?? scripts.followUpEmail.body;
    return (
      <div className="space-y-2">
        <SubjectInput value={subject} onChange={v => onEditField('followUpSubject', v)} readOnly={readOnly} />
        <BodyTextarea value={body} onChange={v => onEditField('followUpBody', v)} readOnly={readOnly} />
      </div>
    );
  }
  if (format === 'linkedin') {
    const body = row.edits.linkedin ?? scripts.linkedin;
    return <BodyTextarea value={body} onChange={v => onEditField('linkedin', v)} readOnly={readOnly} />;
  }
  const body = row.edits.coldCall ?? scripts.coldCall;
  return <BodyTextarea value={body} onChange={v => onEditField('coldCall', v)} readOnly={readOnly} />;
}

function SubjectInput({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly: boolean }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Subject</label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        className={`w-full text-sm font-medium rounded-md border px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring ${readOnly ? 'bg-gray-50 text-gray-700' : 'bg-white border-input'}`}
      />
    </div>
  );
}

function BodyTextarea({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly: boolean }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Body</label>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={e => onChange(e.target.value)}
        rows={Math.max(8, Math.min(28, value.split('\n').length + 2))}
        className={`w-full text-sm rounded-md border px-2 py-2 leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-ring ${readOnly ? 'bg-gray-50 text-gray-700' : 'bg-white border-input'}`}
      />
    </div>
  );
}

// ===========================================================
// Helpers
// ===========================================================

// ===========================================================
// Customize dialog — mirrors the criteria from OutreachWorkspace's
// per-job customize panel. Takes a queue row, lets the user mutate
// every field of the inputs object, then emits the final
// OutreachFormInputs to the parent on Save.
// ===========================================================
function CustomizeDialog({
  row,
  onSave,
  onCancel,
}: {
  row: QueueRow;
  onSave: (next: OutreachFormInputs) => void;
  onCancel: () => void;
}) {
  // Local draft state so the user can cancel without mutating the row.
  const [draft, setDraft] = useState<OutreachFormInputs>(row.inputs);

  const update = <K extends keyof OutreachFormInputs>(k: K, v: OutreachFormInputs[K]) => {
    setDraft(prev => ({ ...prev, [k]: v }));
  };

  const toggleObjection = (o: string) => {
    setDraft(prev => {
      if (prev.objections.includes(o)) {
        return { ...prev, objections: prev.objections.filter(x => x !== o) };
      }
      if (prev.objections.length >= 3) return prev;
      return { ...prev, objections: [...prev.objections, o] };
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Customize message</h3>
            <p className="text-xs text-gray-500 truncate">
              {[row.recipient.first_name, row.recipient.last_name].filter(Boolean).join(' ')} · {row.job.job_title} at {row.job.company_name}
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <Field label="Audience">
            <Select value={draft.audience} options={AUDIENCE_OPTIONS} onChange={v => update('audience', v)} />
            {draft.audience === 'Other' && (
              <TextInput value={draft.audienceOther} onChange={v => update('audienceOther', v)} placeholder="Specify audience" />
            )}
          </Field>
          <Field label="Hiring manager name">
            <TextInput value={draft.hiringManagerName} onChange={v => update('hiringManagerName', v)} placeholder="(defaults to recipient name)" />
          </Field>

          <Field label="Primary problem">
            <Select value={draft.problem} options={PROBLEM_OPTIONS} onChange={v => update('problem', v)} />
            {draft.problem === 'Other' && (
              <TextInput value={draft.problemOther} onChange={v => update('problemOther', v)} placeholder="Specify problem" />
            )}
          </Field>
          <Field label="Service to pitch">
            <Select value={draft.service} options={SERVICE_OPTIONS} onChange={v => update('service', v)} />
            {draft.service === 'Other' && (
              <TextInput value={draft.serviceOther} onChange={v => update('serviceOther', v)} placeholder="Specify service" />
            )}
          </Field>

          <Field label="Urgency">
            <Select value={draft.urgency} options={URGENCY_OPTIONS} onChange={v => update('urgency', v)} />
          </Field>
          <Field label="Tone">
            <Select value={draft.tone} options={TONE_OPTIONS} onChange={v => update('tone', v)} />
          </Field>

          <Field label="Proof point">
            <Select value={draft.proof} options={PROOF_OPTIONS} onChange={v => update('proof', v)} />
            {draft.proof === 'Other' && (
              <TextInput value={draft.proofOther} onChange={v => update('proofOther', v)} placeholder="Specify proof" />
            )}
          </Field>
          <Field label="Call to action">
            <Select value={draft.cta} options={CTA_OPTIONS} onChange={v => update('cta', v)} />
            {draft.cta === 'Other' && (
              <TextInput value={draft.ctaOther} onChange={v => update('ctaOther', v)} placeholder="Specify CTA" />
            )}
          </Field>

          <div className="md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">
              Objections to address (up to 3)
            </label>
            <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1">
              {OBJECTION_OPTIONS.map(o => {
                const checked = draft.objections.includes(o);
                const disabled = !checked && draft.objections.length >= 3;
                return (
                  <label key={o} className={`flex items-center gap-2 text-xs ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleObjection(o)}
                      className="w-3.5 h-3.5 rounded border-gray-300"
                    />
                    <span>{o}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <Field label="Custom opening line (optional)">
            <TextInput value={draft.customOpener} onChange={v => update('customOpener', v)} />
          </Field>
          <Field label="Company insight (optional)">
            <TextInput value={draft.companyInsight} onChange={v => update('companyInsight', v)} />
          </Field>
          <Field label="Notes (optional)">
            <TextInput value={draft.notes} onChange={v => update('notes', v)} />
          </Field>
          <Field label="Language to avoid (optional)">
            <TextInput value={draft.avoidLanguage} onChange={v => update('avoidLanguage', v)} />
          </Field>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between bg-gray-50">
          <p className="text-[11px] text-gray-500">
            Saving regenerates this row with the inputs above. Other rows are unaffected.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded border hover:bg-white"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-3 py-1.5 text-sm rounded bg-[#911406] text-white hover:bg-[#7a1005] inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Save & regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">{label}</label>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

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
