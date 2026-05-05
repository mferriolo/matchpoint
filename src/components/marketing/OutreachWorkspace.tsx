import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Mail, Phone, Linkedin, Wand2, Copy, Check, Star,
  RotateCw, Send, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

// Reuse the existing pickBestContact-style mappings & script types from
// the modal so the Workspace and the Generate-Script flow stay in sync.
import { ScriptJobInput } from './ScriptGeneratorModal';

// ===========================================================
// Types
// ===========================================================

interface ContactRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  middle_name?: string | null;
  suffix?: string | null;
  title?: string | null;
  email?: string | null;
  phone_work?: string | null;
  phone_home?: string | null;
  phone_cell?: string | null;
  linkedin_url?: string | null;
  outreach_status?: string | null;
  last_outreach_at?: string | null;
  company_id?: string | null;
  company_name?: string | null;
}

interface ScoredContact {
  c: ContactRow;
  score: number;
  reasons: string[];
}

interface ScriptOutputs {
  coldCall: string;
  email: { subject: string; body: string };
  linkedin: string;
  voicemail: string;
  objectionResponse: string;
}

// ===========================================================
// Outreach scoring (the recommender)
// ===========================================================

/** Title-fit weight by role category. The job's job_type drives which
 *  audiences are most likely to influence the hire — a CMO search
 *  reaches the C-suite, an APP search lives at the practice level. */
function titleFitScore(title: string, roleCategory: string): { score: number; reason?: string } {
  const t = (title || '').toLowerCase();
  const role = (roleCategory || '').toLowerCase();
  if (!t) return { score: 0 };

  const has = (re: RegExp) => re.test(t);

  const isCMO = has(/\bcmo\b|chief medical officer/);
  const isCEO = has(/\bceo\b|chief executive|founder|president/);
  const isCOO = has(/\bcoo\b|chief operating|chief of operations/);
  const isMD  = has(/medical director/);
  const isVPClinical = has(/vp .*clinical|vice president .*clinical/);
  const isPracticeAdmin = has(/practice administrator|practice manager/);
  const isTA  = has(/talent acquisition|head of ta|director of ta|recruit/);
  const isHR  = has(/\bhr\b|human resources/);
  const isPE  = has(/operating partner|private equity/);

  // Default heuristic: senior clinical / operational ranks well, HR mid.
  let score = 30;
  const reasons: string[] = [];

  // CMO / Medical Director searches → reach the clinical chain
  if (role.includes('cmo') || role.includes('chief medical')) {
    if (isCEO) { score = 95; reasons.push('CEO/Founder owns C-suite hires'); }
    else if (isCMO) { score = 90; reasons.push('CMO is peer to the role'); }
    else if (isCOO) { score = 80; reasons.push('COO often partners on CMO hires'); }
    else if (isPE) { score = 85; reasons.push('PE Operating Partner drives executive hires'); }
    else if (isVPClinical) { score = 65; reasons.push('VP Clinical can refer up'); }
    else if (isTA) { score = 45; reasons.push('TA — gatekeeper, not decision-maker'); }
    else if (isHR) { score = 35; reasons.push('HR — secondary'); }
    else if (isMD) { score = 40; reasons.push('Medical Director — peer, not hiring'); }
  } else if (role.includes('medical director')) {
    if (isCMO) { score = 95; reasons.push('CMO hires Medical Directors'); }
    else if (isCEO) { score = 75; reasons.push('CEO involved on smaller orgs'); }
    else if (isCOO) { score = 70; reasons.push('COO partners on the hire'); }
    else if (isMD) { score = 55; reasons.push('Medical Director — peer'); }
    else if (isTA) { score = 50; reasons.push('TA — coordinator'); }
    else if (isHR) { score = 35; reasons.push('HR — secondary'); }
  } else if (role.includes('pcp') || role.includes('primary care') || role.includes('physician')) {
    if (isMD) { score = 90; reasons.push('Medical Director hires clinicians'); }
    else if (isCMO) { score = 80; reasons.push('CMO oversees clinical hiring'); }
    else if (isPracticeAdmin) { score = 75; reasons.push('Practice Admin owns the seat'); }
    else if (isTA) { score = 60; reasons.push('TA owns clinician pipelines'); }
    else if (isHR) { score = 50; reasons.push('HR runs the process'); }
    else if (isCEO) { score = 55; reasons.push('CEO involved on smaller orgs'); }
  } else if (role.includes('app') || role.includes('np') || role.includes('pa') ||
             role.includes('nurse practitioner') || role.includes('physician assistant')) {
    if (isPracticeAdmin) { score = 90; reasons.push('Practice Admin owns APP hires'); }
    else if (isMD) { score = 80; reasons.push('Medical Director supervises APPs'); }
    else if (isTA) { score = 70; reasons.push('TA owns APP pipelines'); }
    else if (isHR) { score = 55; reasons.push('HR runs the process'); }
    else if (isCMO) { score = 50; reasons.push('CMO — too senior for APP'); }
  } else {
    // Unknown / generic role — fall back to seniority signal.
    if (isCMO || isCEO) { score = 75; reasons.push('Senior clinical/exec'); }
    else if (isCOO || isPE) { score = 70; reasons.push('Senior operations'); }
    else if (isMD || isVPClinical) { score = 60; reasons.push('Mid-senior clinical'); }
    else if (isPracticeAdmin) { score = 55; reasons.push('Operational owner'); }
    else if (isTA) { score = 50; reasons.push('Talent Acquisition'); }
    else if (isHR) { score = 40; reasons.push('HR'); }
  }

  return { score, reason: reasons[0] };
}

/** Coarse seniority signal independent of role-fit, so a senior person
 *  at a non-ideal title still ranks above a junior one. */
function senioritySignal(title: string): { score: number; reason?: string } {
  const t = (title || '').toLowerCase();
  if (!t) return { score: 30 };
  if (/(chief|president|founder|^ceo$|^cmo$|^coo$|^cfo$|operating partner)/.test(t))
    return { score: 100, reason: 'C-suite' };
  if (/\bvp\b|vice president|svp|evp/.test(t)) return { score: 80, reason: 'VP-level' };
  if (/director|head of/.test(t)) return { score: 60, reason: 'Director-level' };
  if (/manager|administrator|lead/.test(t)) return { score: 45, reason: 'Manager-level' };
  if (/recruiter|coordinator|specialist|analyst/.test(t)) return { score: 30, reason: 'IC' };
  return { score: 30 };
}

function reachability(c: ContactRow): { score: number; reason?: string } {
  const channels: string[] = [];
  if (c.email) channels.push('email');
  if (c.linkedin_url) channels.push('LinkedIn');
  if (c.phone_work || c.phone_cell || c.phone_home) channels.push('phone');
  if (channels.length === 0) return { score: 0, reason: 'no contact info' };
  const score = Math.min(100, 40 + channels.length * 20);
  return { score, reason: channels.join(' + ') };
}

function recencyOfContactRecord(c: ContactRow): number {
  // We don't have a "first_seen_at" but `last_outreach_at` distinguishes
  // recently-touched-but-stale contacts from never-touched. Default mid.
  return 60;
}

function outreachGap(c: ContactRow): { score: number; reason?: string } {
  // Reward contacts we haven't touched recently — avoids over-touching.
  if (!c.last_outreach_at) return { score: 100, reason: 'never contacted' };
  const days = Math.max(0, Math.floor((Date.now() - new Date(c.last_outreach_at).getTime()) / 86_400_000));
  if (days >= 30) return { score: 90, reason: `last contact ${days}d ago` };
  if (days >= 14) return { score: 65, reason: `last contact ${days}d ago` };
  if (days >= 7)  return { score: 40, reason: `last contact ${days}d ago — recently touched` };
  return { score: 15, reason: `contacted ${days}d ago — back off` };
}

export function scoreContact(c: ContactRow, roleCategory: string): ScoredContact {
  const fit = titleFitScore(c.title || '', roleCategory);
  const sen = senioritySignal(c.title || '');
  const reach = reachability(c);
  const fresh = recencyOfContactRecord(c);
  const gap = outreachGap(c);

  const score =
    fit.score   * 0.40 +
    sen.score   * 0.20 +
    reach.score * 0.20 +
    fresh       * 0.10 +
    gap.score   * 0.10;

  const reasons = [fit.reason, sen.reason, reach.reason, gap.reason].filter(Boolean) as string[];
  return { c, score: Math.round(score), reasons };
}

// ===========================================================
// Helpers
// ===========================================================

function fullName(c: ContactRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '(unnamed)';
}

function preferredPhone(c: ContactRow): string {
  return (c.phone_work || c.phone_cell || c.phone_home || '').trim();
}

function fmtRel(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const STATUS_BADGE: Record<string, string> = {
  Cold:    'bg-amber-100 text-amber-800 border-amber-200',
  Replied: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Booked:  'bg-blue-100 text-blue-800 border-blue-200',
  Dead:    'bg-gray-200 text-gray-600 border-gray-300',
};

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500">
        Not contacted
      </span>
    );
  }
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {status}
    </span>
  );
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
      }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ===========================================================
// Main component
// ===========================================================

export function OutreachWorkspace({
  job,
  onClose,
}: {
  job: ScriptJobInput | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [outputs, setOutputs] = useState<ScriptOutputs | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');

  const reloadContacts = async (j: ScriptJobInput) => {
    if (!j.company_id && !j.company_name) {
      setContacts([]);
      return;
    }
    setLoadingContacts(true);
    let q = supabase.from('marketing_contacts').select('id, first_name, last_name, middle_name, suffix, title, email, phone_work, phone_home, phone_cell, linkedin_url, outreach_status, last_outreach_at, company_id, company_name');
    if (j.company_id) q = q.eq('company_id', j.company_id);
    else q = q.eq('company_name', j.company_name);
    const { data } = await q;
    setContacts((data || []) as ContactRow[]);
    setLoadingContacts(false);
  };

  useEffect(() => {
    if (!job) return;
    setContacts([]);
    setOutputs(null);
    setSelectedContactId(null);
    setEditedSubject('');
    setEditedBody('');
    reloadContacts(job);
  }, [job?.id]);

  const ranked = useMemo<ScoredContact[]>(() => {
    if (!job) return [];
    const role = job.job_type || '';
    return contacts
      .map(c => scoreContact(c, role))
      .sort((a, b) => b.score - a.score);
  }, [contacts, job?.job_type]);

  // Auto-select the top-ranked contact once contacts load.
  useEffect(() => {
    if (!selectedContactId && ranked.length > 0) {
      setSelectedContactId(ranked[0].c.id);
    }
  }, [ranked, selectedContactId]);

  const selected = ranked.find(r => r.c.id === selectedContactId)?.c || null;

  const loadSender = async (): Promise<{ first_name?: string; last_name?: string; title?: string; company?: string }> => {
    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['outreach.sender_first_name', 'outreach.sender_last_name', 'outreach.sender_title', 'outreach.sender_company']);
    const out: Record<string, string> = {};
    for (const r of data || []) {
      // jsonb may come back as the raw JS value (string) OR, in some
      // supabase-js paths, as a JSON-encoded string ("Matthew" with
      // literal quotes). Strip surrounding quotes defensively.
      let raw: any = (r as any).value;
      if (typeof raw === 'string' && raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
        try { raw = JSON.parse(raw); } catch {}
      }
      const v = typeof raw === 'string' ? raw : (raw == null ? '' : String(raw));
      const key = (r as any).key as string;
      if (key === 'outreach.sender_first_name') out.first_name = v;
      else if (key === 'outreach.sender_last_name') out.last_name = v;
      else if (key === 'outreach.sender_title') out.title = v;
      else if (key === 'outreach.sender_company') out.company = v;
    }
    return out;
  };

  /** Belt-and-suspenders scrubber: replace any remaining bracketed
   *  placeholders with the sender's real values. Runs on every output
   *  string after the model returns. */
  const scrubPlaceholders = (s: string, sender: { first_name?: string; last_name?: string; title?: string; company?: string }): string => {
    if (!s) return s;
    const fullName = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim();
    const title = (sender.title || '').trim();
    const company = (sender.company || '').trim();
    let out = s;
    if (fullName) {
      out = out.replace(/\[your name\]/gi, fullName).replace(/\[name\]/gi, fullName);
    }
    if (title) {
      out = out.replace(/\[your title\]/gi, title).replace(/\[title\]/gi, title);
    }
    if (company) {
      out = out.replace(/\[your company\]/gi, company).replace(/\[company\]/gi, company);
    }
    return out;
  };

  const applyScrub = (out: ScriptOutputs, sender: { first_name?: string; last_name?: string; title?: string; company?: string }): ScriptOutputs => ({
    coldCall: scrubPlaceholders(out.coldCall, sender),
    email: { subject: scrubPlaceholders(out.email.subject, sender), body: scrubPlaceholders(out.email.body, sender) },
    linkedin: scrubPlaceholders(out.linkedin, sender),
    voicemail: scrubPlaceholders(out.voicemail, sender),
    objectionResponse: scrubPlaceholders(out.objectionResponse, sender),
  });

  const generate = async () => {
    if (!job || !selected) return;
    setGenerating(true);
    try {
      const sender = await loadSender();
      // Tailor the form inputs to the selected contact. Mirrors the
      // mapping used in ScriptGeneratorModal's auto-fill logic.
      const title = (selected.title || '').toLowerCase();
      let audience = 'Chief Medical Officer';
      if (/\bcmo\b|chief medical officer/.test(title)) audience = 'Chief Medical Officer';
      else if (/\bceo\b|chief executive|founder|president/.test(title)) audience = 'CEO / Founder';
      else if (/\bcoo\b|chief operating|chief of operations/.test(title)) audience = 'COO / Chief of Operations';
      else if (/operating partner|private equity/.test(title)) audience = 'Private Equity Operating Partner';
      else if (/medical director/.test(title)) audience = 'Regional Medical Director';
      else if (/vp .*clinical|vice president .*clinical/.test(title)) audience = 'VP of Clinical Operations';
      else if (/practice administrator|practice manager/.test(title)) audience = 'Practice Administrator';
      else if (/talent acquisition|head of ta|director of ta/.test(title)) audience = 'Head of Talent Acquisition';
      else if (/recruit/.test(title)) audience = 'Recruiting Manager';

      const isPhys = /\bcmo\b|chief medical officer|medical director/.test(title) ||
                     /\bm\.?d\.?\b|\bd\.?o\.?\b/.test((selected.suffix || '').toLowerCase());
      const hiringName = isPhys && selected.last_name
        ? `Dr. ${selected.last_name}`
        : (selected.first_name || selected.last_name || '');

      const inputs = {
        audience,
        audienceOther: '',
        problem: 'Role has likely been open too long',
        problemOther: '',
        service: 'Direct hire contingency search',
        serviceOther: '',
        companyType: job.company_type || '',
        roleCategory: job.job_type || '',
        urgency: 'Moderate urgency',
        tone: 'MedCentric-branded professional tone',
        proof: 'Experience recruiting clinicians and clinical leaders',
        proofOther: '',
        cta: 'Schedule a 15-minute introductory call',
        ctaOther: '',
        objections: [],
        customOpener: '',
        specificPain: '',
        companyInsight: '',
        hiringManagerName: hiringName,
        caseStudy: '',
        notes: '',
        avoidLanguage: '',
      };

      const ageDays = (() => {
        const iso = job.date_posted || job.created_at;
        if (!iso) return null;
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
      })();

      const payload = {
        sender,
        job: {
          company_name: job.company_name,
          job_title: job.job_title,
          city: job.city,
          state: job.state,
          job_url: job.job_url,
          date_posted: job.date_posted,
          age_days: ageDays,
          company_type: job.company_type,
          compensation: job.compensation,
          priority_score: job.priority_score,
          company_description: job.company_description,
          job_description: job.description,
        },
        inputs,
      };
      // 45s client guard so a hung upstream doesn't leave the
      // workspace stuck in Drafting… forever. Edge function caps
      // OpenAI at 30s + retry-on-transient, so 45s is the natural
      // ceiling.
      const ac = new AbortController();
      const guard = setTimeout(() => ac.abort(), 45_000);
      const result = await supabase.functions.invoke('generate-job-script', { body: payload, signal: ac.signal as any })
        .finally(() => clearTimeout(guard));
      const { data, error } = result;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const raw = data.outputs as ScriptOutputs;
      const out = applyScrub(raw, sender);
      setOutputs(out);
      setEditedSubject(out.email.subject);
      setEditedBody(out.email.body);
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const markContacted = async (c: ContactRow, status: 'Cold' | 'Replied' | 'Booked' | 'Dead' = 'Cold') => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('marketing_contacts')
      .update({ outreach_status: status, last_outreach_at: now, updated_at: now })
      .eq('id', c.id);
    if (error) {
      toast({ title: 'Status update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, outreach_status: status, last_outreach_at: now } : x));
  };

  // Build the channel hrefs declaratively so the launchers can be real
  // <a> tags. Using an anchor (vs. window.open(_, '_self')) is more
  // reliable for mailto: / tel: — the browser hands the URL to the OS
  // without unloading the page or tripping popup blockers.
  const buildMailtoHref = (c: ContactRow): string => {
    if (!c.email) return '';
    const subject = editedSubject || outputs?.email.subject || '';
    const body = editedBody || outputs?.email.body || '';
    return `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const buildTelHref = (c: ContactRow): string => {
    const phone = preferredPhone(c);
    if (!phone) return '';
    return `tel:${phone.replace(/[^\d+]/g, '')}`;
  };

  const onLaunchEmail = async (c: ContactRow) => {
    // The browser handles the actual mailto navigation via the anchor's
    // href; this side-effect just records that we kicked off outreach.
    markContacted(c, 'Cold');
  };

  const onLaunchLinkedIn = async (c: ContactRow) => {
    const msg = outputs?.linkedin || '';
    if (msg) {
      try { await navigator.clipboard.writeText(msg); toast({ title: 'LinkedIn message copied to clipboard' }); } catch {}
    }
    markContacted(c, 'Cold');
  };

  const onLaunchPhone = async (c: ContactRow) => {
    if (outputs?.coldCall) {
      try { await navigator.clipboard.writeText(outputs.coldCall); toast({ title: 'Cold-call opener copied to clipboard' }); } catch {}
    }
    markContacted(c, 'Cold');
  };

  if (!job) return null;

  const closeIfIdle = () => {
    if (generating) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch justify-end" onClick={closeIfIdle}>
      {/* Top-of-modal banner that stays visible while the OpenAI call
          is in flight. Without this, the only loading hint was buried
          deep in the right column and impatient users were clicking
          the dim background — which closed the modal mid-generation
          and looked like a hang. */}
      {generating && (
        <div className="absolute top-0 left-0 right-0 bg-[#911406] text-white text-xs px-4 py-1.5 flex items-center justify-center gap-2 z-10">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Drafting message — please wait, this can take 10–15 seconds.
        </div>
      )}
      <div
        className="bg-white shadow-xl w-full max-w-[1400px] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Send className="w-4 h-4 text-[#911406]" />
              Outreach Workspace
            </h3>
            <p className="text-xs text-gray-500">
              {[job.job_title, job.company_name].filter(Boolean).join(' · ') || '(untitled)'}
              {job.city && job.state ? ` · ${job.city}, ${job.state}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Close"
            title={generating ? 'Wait for the draft to finish' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_360px_1fr] overflow-hidden">
          {/* LEFT: job summary */}
          <div className="p-4 border-r border-gray-100 overflow-y-auto bg-gray-50">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">Job</div>
            <Row label="Company" value={job.company_name || '—'} />
            <Row label="Role" value={job.job_title || '—'} />
            <Row label="Job type" value={job.job_type || '—'} />
            <Row label="Location" value={[job.city, job.state].filter(Boolean).join(', ') || '—'} />
            <Row label="Company type" value={job.company_type || '—'} />
            {job.priority_score != null && <Row label="Priority" value={String(job.priority_score)} />}
            {job.job_url && (
              <Row
                label="Posting"
                value={<a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={job.job_url}>Open</a>}
              />
            )}
          </div>

          {/* MIDDLE: ranked contacts */}
          <div className="border-r border-gray-100 overflow-y-auto">
            <div className="px-4 py-3 border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                  Recommended contacts ({ranked.length})
                </div>
                <button
                  onClick={() => job && reloadContacts(job)}
                  className="text-[11px] text-gray-500 hover:text-gray-800 hover:underline inline-flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">Click a contact to tailor the message to them.</p>
            </div>
            {loadingContacts ? (
              <div className="p-6 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading contacts…
              </div>
            ) : ranked.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500">
                No contacts on file for this company.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {ranked.map((r, idx) => {
                  const active = r.c.id === selectedContactId;
                  return (
                    <li
                      key={r.c.id}
                      className={`p-3 cursor-pointer ${active ? 'bg-red-50/60 border-l-2 border-l-[#911406]' : 'hover:bg-gray-50 border-l-2 border-l-transparent'}`}
                      onClick={() => setSelectedContactId(r.c.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col items-center w-8 flex-shrink-0">
                          <div className="text-[11px] font-bold text-gray-900">{r.score}</div>
                          {idx === 0 && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{fullName(r.c)}</span>
                            <StatusBadge status={r.c.outreach_status} />
                          </div>
                          {r.c.title && <div className="text-xs text-gray-700 truncate">{r.c.title}</div>}
                          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-500">
                            {r.c.email && <span title={r.c.email}><Mail className="w-3 h-3" /></span>}
                            {r.c.linkedin_url && <span><Linkedin className="w-3 h-3" /></span>}
                            {preferredPhone(r.c) && <span><Phone className="w-3 h-3" /></span>}
                            <span className="ml-1">·</span>
                            <span title={r.c.last_outreach_at || ''}>last: {fmtRel(r.c.last_outreach_at)}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-1 line-clamp-2" title={r.reasons.join(' · ')}>
                            {r.reasons.slice(0, 2).join(' · ')}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* RIGHT: message + send */}
          <div className="overflow-y-auto">
            {!selected ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Select a contact to draft a message.
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{fullName(selected)}</div>
                    <div className="text-xs text-gray-600">{selected.title || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!outputs ? (
                      <Button onClick={generate} disabled={generating} className="bg-[#911406] hover:bg-[#7a1005] text-white">
                        {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                        Draft message
                      </Button>
                    ) : (
                      <Button onClick={generate} disabled={generating} variant="outline">
                        {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCw className="w-4 h-4 mr-1" />}
                        Regenerate
                      </Button>
                    )}
                  </div>
                </div>

                {/* Channel launchers — real anchors so the browser
                    handles mailto: / tel: natively (popup-blocker-safe
                    and won't unload the page mid-edit). */}
                <div className="grid grid-cols-3 gap-2">
                  <ChannelLink
                    label="Email"
                    icon={<Mail className="w-4 h-4" />}
                    href={buildMailtoHref(selected)}
                    detail={selected.email || 'No email'}
                    onClick={() => onLaunchEmail(selected)}
                  />
                  <ChannelLink
                    label="LinkedIn"
                    icon={<Linkedin className="w-4 h-4" />}
                    href={selected.linkedin_url || ''}
                    target="_blank"
                    detail={selected.linkedin_url ? 'Opens profile + copies message' : 'No LinkedIn'}
                    onClick={() => onLaunchLinkedIn(selected)}
                  />
                  <ChannelLink
                    label="Call"
                    icon={<Phone className="w-4 h-4" />}
                    href={buildTelHref(selected)}
                    detail={preferredPhone(selected) || 'No phone'}
                    onClick={() => onLaunchPhone(selected)}
                  />
                </div>

                {!outputs && !generating && (
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    <Info className="w-4 h-4 mx-auto mb-2" />
                    Click <span className="font-semibold">Draft message</span> to generate an outreach message tailored to {fullName(selected)}.
                  </div>
                )}

                {generating && (
                  <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Drafting…
                  </div>
                )}

                {outputs && (
                  <>
                    {/* Email — editable */}
                    <div className="rounded-md border border-gray-200 bg-white">
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                        <div className="text-xs font-semibold text-gray-700">Email</div>
                        <CopyBtn text={`Subject: ${editedSubject}\n\n${editedBody}`} label="Copy email" />
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Subject</Label>
                          <Input value={editedSubject} onChange={e => setEditedSubject(e.target.value)} className="mt-1 text-sm" />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Body</Label>
                          <Textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={9} className="mt-1 text-sm font-sans" />
                        </div>
                      </div>
                    </div>

                    {/* LinkedIn */}
                    <OutputBlock title="LinkedIn message" body={outputs.linkedin} />
                    {/* Voicemail / Cold call */}
                    <OutputBlock title="Cold call opener" body={outputs.coldCall} />
                    <OutputBlock title="Voicemail" body={outputs.voicemail} />
                    <OutputBlock title="If you hit an objection" body={outputs.objectionResponse} />
                  </>
                )}

                {/* Status controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <span className="text-[11px] text-gray-500 mr-1">Mark as:</span>
                  {(['Cold', 'Replied', 'Booked', 'Dead'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => markContacted(selected, s)}
                      className={`text-[11px] px-2 py-1 rounded border ${selected.outreach_status === s ? STATUS_BADGE[s] : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex text-xs py-1">
      <span className="w-24 text-gray-500">{label}</span>
      <span className="text-gray-900 truncate">{value}</span>
    </div>
  );
}

function ChannelLink({
  label, icon, href, target, detail, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
  target?: string;
  detail: string;
  onClick?: () => void;
}) {
  if (!href) {
    return (
      <div
        aria-disabled="true"
        className="flex flex-col items-start gap-1 p-3 rounded-md border border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed text-left"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <div className="text-[11px] truncate w-full">{detail}</div>
      </div>
    );
  }
  return (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      className="flex flex-col items-start gap-1 p-3 rounded-md border border-gray-200 hover:border-[#911406]/50 hover:bg-red-50 text-gray-800 text-left transition-colors"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-[11px] truncate w-full">{detail}</div>
    </a>
  );
}

function OutputBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <CopyBtn text={body} label="Copy" />
      </div>
      <pre className="px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap font-sans">{body}</pre>
    </div>
  );
}
