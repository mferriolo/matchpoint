import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Loader2, Mail, Phone, Linkedin, Wand2, Copy, Check, Star,
  RotateCw, Send, Info, Zap,
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
  followUpEmail: { subject: string; body: string };
}

type MessageType = 'email' | 'followUpEmail' | 'linkedin' | 'coldCall';

const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  email:         'Email',
  followUpEmail: 'Follow-Up Email',
  linkedin:      'LinkedIn',
  coldCall:      'Cold Call Script',
};

// ===========================================================
// Customize form — option lists (same set as the legacy script modal)
// ===========================================================

const AUDIENCE_OPTIONS = [
  'CEO / Founder',
  'COO / Chief of Operations',
  'Chief Medical Officer',
  'VP of Clinical Operations',
  'Head of Talent Acquisition',
  'Recruiting Manager',
  'Practice Administrator',
  'Regional Medical Director',
  'Private Equity Operating Partner',
  'Other',
];

const PROBLEM_OPTIONS = [
  'Role has likely been open too long',
  'Internal recruiting team may be overwhelmed',
  'Hard-to-find passive candidate market',
  'Growth may be delayed by this open role',
  'Clinical leadership gap',
  'Bad hire risk is high',
  'Geographic market is difficult',
  'Specialty or model-specific experience is hard to find',
  'Other',
];

const SERVICE_OPTIONS = [
  'Direct hire contingency search',
  'Retained executive search',
  'RPO / embedded recruiting support',
  'Market mapping',
  'Hard-to-fill provider search',
  'Clinical leadership search',
  'Other',
];

const URGENCY_OPTIONS = ['Low urgency', 'Moderate urgency', 'High urgency', 'Very high urgency', 'Unknown'];

const TONE_OPTIONS = [
  'Direct and bold',
  'Warm and consultative',
  'Executive and polished',
  'Scrappy and entrepreneurial',
  'Mission-driven healthcare',
  'MedCentric-branded professional tone',
];

const PROOF_OPTIONS = [
  'Experience recruiting clinicians and clinical leaders',
  'Experience with value-based care organizations',
  'Experience with PACE / frail elderly care',
  'Experience helping startups build clinical teams',
  'Ability to access passive candidates',
  'Ability to support hard-to-fill searches',
  'Speed and focus compared with internal recruiting teams',
  'Other',
];

const CTA_OPTIONS = [
  'Schedule a 15-minute introductory call',
  'Set up a job intake conversation',
  'Discuss the open role',
  'Review our search process',
  'Explore a recruiting partnership',
  'Permission to send qualified candidates',
  'Other',
];

const OBJECTION_OPTIONS = [
  'We already have an internal recruiting team',
  'We are not using agencies right now',
  'We already have vendors',
  'Send me information',
  'We are not hiring right now',
  'Your fee is too high',
  'We tried recruiters before and it did not work',
  'We only work retained',
  'We only work contingency',
  'Budget is tight',
];

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

// Escape & < > " ' so injecting into innerHTML/clipboard HTML is safe.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip lines that contain just the jobUrl (the model occasionally
// still emits one despite the prompt) so the title-as-link isn't
// shadowed by a redundant footer URL. Used by both the preview
// renderer and the HTML clipboard write so the two stay in sync.
function stripStandaloneUrl(body: string, jobUrl?: string): string {
  if (!jobUrl) return body;
  const escapedUrl = jobUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^[ \\t]*${escapedUrl}[\\s.,;:!?]*$`, 'gm');
  return body.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();
}

// React-rendered preview. Used in EmailPanel instead of
// dangerouslySetInnerHTML — Tailwind's anchor reset
// (a { text-decoration: inherit }) was fighting inline styles in
// dangerouslySetInnerHTML, leaving the title-as-link looking like
// plain text and (in some browsers) failing to register the click.
// React rendering with explicit Tailwind classes avoids both.
function renderBody(body: string, jobTitle?: string, jobUrl?: string): React.ReactNode {
  if (!body) return <span className="text-gray-400">— empty —</span>;
  const working = stripStandaloneUrl(body, jobUrl);
  const lines = working.split('\n');
  const urlRe = /(https?:\/\/[^\s<>"']+?)([.,;:!?)\]]?)(?=\s|$)/g;

  let titleWrapped = false;
  return lines.map((line, lineIdx) => {
    const segs: React.ReactNode[] = [];
    let cursor = 0;

    // First case-insensitive occurrence of the job title (across the
    // whole body, not per line) gets wrapped as the link.
    if (!titleWrapped && jobTitle && jobUrl) {
      const idx = line.toLowerCase().indexOf(jobTitle.toLowerCase());
      if (idx >= 0) {
        if (idx > 0) segs.push(line.slice(0, idx));
        segs.push(
          <a
            key={`t-${lineIdx}`}
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#911406] underline font-semibold hover:text-[#7a1005] cursor-pointer"
          >
            {line.slice(idx, idx + jobTitle.length)}
          </a>
        );
        cursor = idx + jobTitle.length;
        titleWrapped = true;
      }
    }

    // Auto-link any remaining bare URLs in the rest of the line.
    const rest = line.slice(cursor);
    let restCursor = 0;
    for (const m of rest.matchAll(urlRe)) {
      const start = m.index ?? 0;
      if (start > restCursor) segs.push(rest.slice(restCursor, start));
      const url = m[1];
      const trail = m[2] || '';
      segs.push(
        <a
          key={`u-${lineIdx}-${start}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#911406] underline hover:text-[#7a1005] cursor-pointer"
        >
          {url}
        </a>
      );
      if (trail) segs.push(trail);
      restCursor = start + m[0].length;
    }
    if (restCursor < rest.length) segs.push(rest.slice(restCursor));

    if (segs.length === 0) segs.push(line);
    return (
      <React.Fragment key={lineIdx}>
        {segs}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// Convert plain-text body to HTML for the clipboard/Copy-HTML path.
// Same logic as renderBody but emits an HTML string so paste-into-
// Gmail keeps the formatting. Inline styles are used here (not Tailwind
// classes) because the destination email client won't have our
// stylesheet — so each <a> needs to carry its own visuals.
function bodyToHtml(body: string, jobTitle?: string, jobUrl?: string): string {
  if (!body) return '';
  const working = stripStandaloneUrl(body, jobUrl);
  let escaped = escapeHtml(working);

  // Wrap the first occurrence of jobTitle (case-insensitive) in a
  // hyperlink. We escape the title before searching so an exotic title
  // doesn't break the regex.
  if (jobTitle && jobUrl) {
    const escapedTitle = escapeHtml(jobTitle);
    const reTitle = new RegExp(
      escapedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i'
    );
    escaped = escaped.replace(
      reTitle,
      (match) =>
        `<a href="${jobUrl}" target="_blank" rel="noopener noreferrer" style="color:#911406;text-decoration:underline;font-weight:600;">${match}</a>`
    );
  }

  // Remaining bare URLs in the body (rare now, but kept as a fallback)
  // get auto-linked too. The wrapped title is already an <a> tag, so
  // the regex skips text inside angle brackets.
  const linked = escaped.replace(
    /(https?:\/\/[^\s<>"']+?)([.,;:!?)\]]?(?=\s|$|<))/g,
    (_, url: string, trail: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#911406;text-decoration:underline;">${url}</a>${trail}`
  );
  return linked.replace(/\n/g, '<br>');
}

// Editable, link-aware body field. Replaces the old textarea-plus-
// preview pair. The contenteditable div is seeded with bodyToHtml()
// output so the role title shows up as a clickable hyperlink. While
// the user types we read innerText back into the body string, but
// we deliberately DO NOT re-set innerHTML on every keystroke — that
// would yank the cursor on every change. innerHTML is only re-set
// when body changes for an outside reason (regenerate, tab switch,
// new contact selected). The lastWritten ref tracks "what we last
// pushed into the DOM" so the effect can tell self-driven updates
// from external ones.
function EditablePreview({
  body, onChange, jobTitle, jobUrl,
}: {
  body: string;
  onChange: (next: string) => void;
  jobTitle?: string;
  jobUrl?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastWritten = useRef<string>('');

  useEffect(() => {
    if (!ref.current) return;
    if (lastWritten.current === body) return; // user just typed; don't clobber the cursor
    ref.current.innerHTML = bodyToHtml(body, jobTitle, jobUrl) || '';
    lastWritten.current = body;
  }, [body, jobTitle, jobUrl]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Email body"
      onInput={(e) => {
        // innerText preserves line breaks across browsers (Chrome <div>,
        // Firefox <br>) more consistently than textContent, which would
        // collapse blocks into one line.
        const text = (e.currentTarget as HTMLDivElement).innerText;
        lastWritten.current = text;
        onChange(text);
      }}
      // Plain-text paste so a copy from Word/Gmail doesn't bring its
      // own font/colors and overwhelm the editor.
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      }}
      className="mt-1 text-sm leading-relaxed text-gray-800 border border-gray-200 rounded-md p-3 bg-white min-h-[180px] max-h-96 overflow-y-auto whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-[#911406]/30 focus:border-[#911406]/40"
    />
  );
}

// Send the current email body directly via the connected Gmail
// account (gmail-send edge fn). The email goes from the user's own
// inbox with proper HTML so the role-title hyperlink is preserved
// without a copy-paste step. Disabled until the user has connected
// Gmail in System Settings; falls back to mailto: in that case.
function GmailSendBtn({
  to, subject, body, jobTitle, jobUrl, fromName, replyTo, onSent,
}: {
  to: string;
  subject: string;
  body: string;
  jobTitle?: string;
  jobUrl?: string;
  fromName?: string;
  replyTo?: string;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  // Check connection state lazily on mount so the button can render
  // disabled with a tooltip explaining what to do.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('gmail-oauth', {
          body: { action: 'status' },
        });
        if (cancelled) return;
        if (error) { setConnected(false); return; }
        setConnected(!!data?.connected);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const send = async () => {
    if (!to) {
      toast({ title: 'No email on file', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const html = `<div style="font-family:system-ui,Arial,sans-serif;line-height:1.5;">${bodyToHtml(body, jobTitle, jobUrl)}</div>`;
      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: {
          to,
          subject,
          html,
          text: body,
          from_name: fromName,
          reply_to: replyTo,
        },
      });
      if (error) {
        let detail = error.message || 'Send failed';
        try {
          const ctx: any = (error as any).context;
          if (ctx?.text) {
            const raw = await ctx.text();
            try { const j = JSON.parse(raw); if (j?.error) detail = j.error; }
            catch { detail = raw.slice(0, 300); }
          }
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Sent via Gmail',
        description: `Delivered to ${to}${data?.from ? ` from ${data.from}` : ''}`,
      });
      onSent();
    } catch (e: any) {
      toast({ title: 'Gmail send failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || !to || connected === false;
  const title = !to
    ? 'No email on file'
    : connected === null
      ? 'Checking Gmail connection…'
      : connected
        ? 'Send the formatted HTML email directly from your connected Gmail inbox.'
        : 'Connect Gmail in System Settings to send directly with HTML preserved.';

  return (
    <button
      type="button"
      onClick={send}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-white ${
        disabled
          ? 'bg-gray-300 cursor-not-allowed'
          : 'bg-emerald-700 hover:bg-emerald-800'
      }`}
    >
      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
      Send via Gmail
    </button>
  );
}

function CopyHtmlBtn({ subject: _subject, body, jobTitle, jobUrl }: { subject: string; body: string; jobTitle?: string; jobUrl?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy as HTML — paste into Gmail/Outlook compose to keep clickable links"
      onClick={async () => {
        const htmlBody = bodyToHtml(body, jobTitle, jobUrl);
        const html = `<div>${htmlBody}</div>`;
        // Plain-text fallback for clients that don't honor text/html.
        const text = body;
        try {
          if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' }),
              }),
            ]);
          } else {
            // Older Safari / Firefox without ClipboardItem — fall back
            // to plain text. Better than failing silently.
            await navigator.clipboard.writeText(text);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          try { await navigator.clipboard.writeText(text); } catch {}
        }
      }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied HTML' : 'Copy HTML'}
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
  const [editedFollowUpSubject, setEditedFollowUpSubject] = useState('');
  const [editedFollowUpBody, setEditedFollowUpBody] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('email');
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Customize form — same dimensions the standalone Generate Script
  // modal exposed, all in one place. Auto-fill audience and hiring
  // manager name from the selected contact when the modal opens.
  const [audience, setAudience] = useState('Chief Medical Officer');
  const [audienceOther, setAudienceOther] = useState('');
  const [problem, setProblem] = useState('Role has likely been open too long');
  const [problemOther, setProblemOther] = useState('');
  const [service, setService] = useState('Direct hire contingency search');
  const [serviceOther, setServiceOther] = useState('');
  const [urgency, setUrgency] = useState('Moderate urgency');
  const [tone, setTone] = useState('MedCentric-branded professional tone');
  const [proof, setProof] = useState('Experience recruiting clinicians and clinical leaders');
  const [proofOther, setProofOther] = useState('');
  const [cta, setCta] = useState('Schedule a 15-minute introductory call');
  const [ctaOther, setCtaOther] = useState('');
  const [objections, setObjections] = useState<string[]>([]);
  const [customOpener, setCustomOpener] = useState('');
  const [companyInsight, setCompanyInsight] = useState('');
  const [hiringManagerName, setHiringManagerName] = useState('');
  const [notes, setNotes] = useState('');
  const [avoidLanguage, setAvoidLanguage] = useState('');

  const reloadContacts = async (j: ScriptJobInput, isCancelled: () => boolean) => {
    if (!j.company_id && !j.company_name) {
      if (!isCancelled()) setContacts([]);
      return;
    }
    setLoadingContacts(true);
    let q = supabase.from('marketing_contacts').select('id, first_name, last_name, middle_name, suffix, title, email, phone_work, phone_home, phone_cell, linkedin_url, outreach_status, last_outreach_at, company_id, company_name');
    if (j.company_id) q = q.eq('company_id', j.company_id);
    else q = q.eq('company_name', j.company_name);
    const { data } = await q;
    // Guard against the race where the user picked a different job
    // before this query resolved — without this, an older fetch could
    // resolve last and overwrite contacts with the wrong company's
    // people, leaving the drawer showing stale rows under a current
    // job's title.
    if (isCancelled()) return;
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
    setEditedFollowUpSubject('');
    setEditedFollowUpBody('');
    setMessageType('email');
    let cancelled = false;
    reloadContacts(job, () => cancelled);
    return () => { cancelled = true; };
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

  // Whenever the selected contact changes, refresh the audience +
  // hiring-manager-name fields so the customize panel reflects the
  // current target. The user can still override these in the form.
  useEffect(() => {
    if (!selected) return;
    const t = (selected.title || '').toLowerCase();
    let nextAudience = audience;
    if (/\bcmo\b|chief medical officer/.test(t)) nextAudience = 'Chief Medical Officer';
    else if (/operating partner|private equity/.test(t)) nextAudience = 'Private Equity Operating Partner';
    else if (/\bceo\b|chief executive|founder|president/.test(t)) nextAudience = 'CEO / Founder';
    else if (/\bcoo\b|chief operating|chief of operations/.test(t)) nextAudience = 'COO / Chief of Operations';
    else if (/vp .*clinical|vice president .*clinical/.test(t)) nextAudience = 'VP of Clinical Operations';
    else if (/medical director/.test(t)) nextAudience = 'Regional Medical Director';
    else if (/practice administrator|practice manager/.test(t)) nextAudience = 'Practice Administrator';
    else if (/talent acquisition|head of ta|director of ta/.test(t)) nextAudience = 'Head of Talent Acquisition';
    else if (/recruit/.test(t)) nextAudience = 'Recruiting Manager';
    setAudience(nextAudience);

    const isPhys = /\bcmo\b|chief medical officer|medical director/.test(t)
      || /\bm\.?d\.?\b|\bd\.?o\.?\b/.test(((selected as any).suffix || '').toLowerCase());
    const hiringName = isPhys && selected.last_name
      ? `Dr. ${selected.last_name}`
      : (selected.first_name || selected.last_name || '');
    setHiringManagerName(hiringName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContactId]);

  // Cached sender identity, populated on mount and reused by generate()
  // and the Send-via-Gmail panel. The latter just needs a display name
  // for the From: header; the former needs the full identity to enforce
  // the sender-block in generated content.
  const [senderState, setSenderState] = useState<{ first_name?: string; last_name?: string; title?: string; company?: string } | null>(null);

  const loadSender = async (): Promise<{ first_name?: string; last_name?: string; title?: string; company?: string }> => {
    // Primary source: admin_users (edited from Admin → Users tab so
    // the operator can update title/company without leaving the app).
    // Fallback: system_settings legacy keys for installs that haven't
    // populated admin_users yet.
    const { data: admins } = await supabase
      .from('admin_users')
      .select('first_name, last_name, name, title, company, role, status, last_login, created_at')
      .eq('status', 'active')
      .order('role', { ascending: false })
      .order('last_login', { ascending: false, nullsFirst: false } as any)
      .order('created_at', { ascending: false })
      .limit(1);
    const row: any = (admins && admins[0]) || null;
    if (row) {
      const fn = (row.first_name || '').trim() || (row.name ? String(row.name).split(' ')[0] : '');
      const ln = (row.last_name  || '').trim() || (row.name ? String(row.name).split(' ').slice(1).join(' ') : '');
      const t  = (row.title   || '').trim();
      const co = (row.company || '').trim();
      if (fn || ln || t || co) {
        return { first_name: fn || undefined, last_name: ln || undefined, title: t || undefined, company: co || undefined };
      }
    }

    const { data } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['outreach.sender_first_name', 'outreach.sender_last_name', 'outreach.sender_title', 'outreach.sender_company']);
    const out: Record<string, string> = {};
    for (const r of data || []) {
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
    followUpEmail: out.followUpEmail
      ? { subject: scrubPlaceholders(out.followUpEmail.subject, sender), body: scrubPlaceholders(out.followUpEmail.body, sender) }
      : { subject: '', body: '' },
  });

  const generate = async () => {
    if (!job || !selected) return;
    setGenerating(true);
    try {
      const sender = await loadSender();
      setSenderState(sender);

      // Build the customize-form payload from controlled state. The
      // form auto-fills audience + hiringManagerName whenever a
      // contact is picked, so even users who never open the Customize
      // panel get a contact-tailored prompt.
      const inputs = {
        audience,
        audienceOther,
        problem,
        problemOther,
        service,
        serviceOther,
        companyType: job.company_type || '',
        roleCategory: job.job_type || '',
        urgency,
        tone,
        proof,
        proofOther,
        cta,
        ctaOther,
        objections,
        customOpener,
        specificPain: '',
        companyInsight,
        hiringManagerName,
        caseStudy: '',
        notes,
        avoidLanguage,
      };

      const ageDays = (() => {
        const iso = job.date_posted || job.created_at;
        if (!iso) return null;
        const t = new Date(iso).getTime();
        if (!Number.isFinite(t)) return null;
        return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
      })();

      // Recipient context — the selected contact's actual title +
      // name. The generic `audience` bucket in `inputs` (hiring_mgr /
      // recruiter / etc.) is too coarse: a CEO and a VP of Talent
      // Acquisition both bucket as "hiring decision-maker" but care
      // about completely different things. Passing the raw title
      // lets the prompt-builder pick the right framing per output.
      const recipient = {
        title: selected.title || '',
        first_name: selected.first_name || '',
        last_name: selected.last_name || '',
      };
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
        recipient,
        inputs,
      };
      // 65s client guard so a hung upstream doesn't leave the
      // workspace stuck in Drafting… forever. Edge function caps
      // OpenAI at 50s and may retry once on transient (empty content,
      // empty fields) — worst case ~50s, comfortably inside 65s.
      const ac = new AbortController();
      const guard = setTimeout(() => ac.abort(), 65_000);
      const result = await supabase.functions.invoke('generate-job-script', { body: payload, signal: ac.signal as any })
        .finally(() => clearTimeout(guard));
      const { data, error } = result;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const raw = data.outputs as ScriptOutputs;
      // Defensive shape check: the function now retries on empty
      // fields, but if both attempts come back blank we should
      // surface a real error instead of clobbering any prior good
      // draft with empty strings. Fixes the "Regenerate produced a
      // blank message" path.
      const missing: string[] = [];
      if (!raw?.coldCall?.trim()) missing.push('cold call');
      if (!raw?.email?.body?.trim() || !raw?.email?.subject?.trim()) missing.push('email');
      if (!raw?.linkedin?.trim()) missing.push('LinkedIn');
      if (!raw?.followUpEmail?.body?.trim() || !raw?.followUpEmail?.subject?.trim()) missing.push('follow-up email');
      if (missing.length > 0) {
        throw new Error(`Generation returned blank ${missing.join(', ')} — try again`);
      }
      const out = applyScrub(raw, sender);
      setOutputs(out);
      setEditedSubject(out.email.subject);
      setEditedBody(out.email.body);
      setEditedFollowUpSubject(out.followUpEmail?.subject || '');
      setEditedFollowUpBody(out.followUpEmail?.body || '');
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
    // The browser handles the actual mailto navigation via the
    // anchor's href; this side-effect records that we kicked off
    // outreach AND tells the user the HTML body has been queued on
    // the clipboard. mailto: bodies are plain-text-only across every
    // major email client, so the compose window will open with our
    // plain-text body — pasting (Cmd/Ctrl+V) replaces it with the
    // formatted version that keeps the role-title hyperlink.
    toast({
      title: 'Compose opened — paste to keep the link',
      description: 'The HTML version is on your clipboard. Press Cmd/Ctrl+V inside the compose window to swap in the formatted body with the clickable role title.',
      duration: 6000,
    });
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
                  // The active message tab requires a specific channel:
                  // email/followUpEmail → email, linkedin → linkedin_url,
                  // coldCall → any phone. Contacts missing that channel
                  // can still be picked (the user might want to draft now
                  // and reach them later), but they're rendered in low
                  // contrast so the recruiter sees who's actually
                  // reachable for the message type they're composing.
                  const hasChannel =
                    messageType === 'email' || messageType === 'followUpEmail' ? !!r.c.email :
                    messageType === 'linkedin' ? !!r.c.linkedin_url :
                    messageType === 'coldCall' ? !!preferredPhone(r.c) :
                    true;
                  const channelLabel =
                    messageType === 'email' || messageType === 'followUpEmail' ? 'email' :
                    messageType === 'linkedin' ? 'LinkedIn' :
                    messageType === 'coldCall' ? 'phone' :
                    '';
                  return (
                    <li
                      key={r.c.id}
                      className={`p-3 cursor-pointer ${active ? 'bg-red-50/60 border-l-2 border-l-[#911406]' : 'hover:bg-gray-50 border-l-2 border-l-transparent'} ${!hasChannel && !active ? 'opacity-50' : ''}`}
                      onClick={() => setSelectedContactId(r.c.id)}
                      title={!hasChannel ? `No ${channelLabel} on file — click to draft anyway` : undefined}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col items-center w-8 flex-shrink-0">
                          <div className={`text-[11px] font-bold ${hasChannel ? 'text-gray-900' : 'text-gray-400'}`}>{r.score}</div>
                          {idx === 0 && <Star className={`w-3 h-3 ${hasChannel ? 'text-amber-500 fill-amber-500' : 'text-gray-300 fill-gray-300'}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-sm font-semibold ${hasChannel ? 'text-gray-900' : 'text-gray-500'}`}>{fullName(r.c)}</span>
                            <StatusBadge status={r.c.outreach_status} />
                            {!hasChannel && (
                              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                                no {channelLabel}
                              </span>
                            )}
                          </div>
                          {r.c.title && <div className={`text-xs truncate ${hasChannel ? 'text-gray-700' : 'text-gray-400'}`}>{r.c.title}</div>}
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

          {/* RIGHT: message type tabs + customize + active message */}
          <div className="overflow-y-auto">
            {!selected ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Select a contact to draft a message.
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Contact header + Generate */}
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

                {/* Message type tabs — Email default, plus the three
                    other variants the user picks between. The contents
                    of all four tabs come from a single edge-function
                    call so switching tabs is instant. */}
                <div className="flex gap-1 border-b border-gray-200">
                  {(['email', 'followUpEmail', 'linkedin', 'coldCall'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setMessageType(t)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-t-md border-b-2 transition-colors ${
                        messageType === t
                          ? 'border-[#911406] text-[#911406] bg-red-50/40'
                          : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      {MESSAGE_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>

                {/* Collapsible Customize panel — same dropdowns the
                    standalone script generator exposed, all in one
                    place. Closed by default to keep the UI focused;
                    audience + hiring manager auto-fill from the
                    selected contact regardless of whether it's open. */}
                <div className="rounded-md border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setCustomizeOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <span>Customize message</span>
                    <span className="text-[10px] text-gray-500">{customizeOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {customizeOpen && (
                    <div className="border-t border-gray-100 p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <FormSelect label="Audience" value={audience} options={AUDIENCE_OPTIONS} onChange={setAudience} />
                      {audience === 'Other' && (
                        <FormText label="Specify audience" value={audienceOther} onChange={setAudienceOther} />
                      )}
                      <FormText label="Hiring manager name" value={hiringManagerName} onChange={setHiringManagerName} />
                      <FormSelect label="Primary problem" value={problem} options={PROBLEM_OPTIONS} onChange={setProblem} />
                      {problem === 'Other' && (
                        <FormText label="Specify problem" value={problemOther} onChange={setProblemOther} />
                      )}
                      <FormSelect label="Service to pitch" value={service} options={SERVICE_OPTIONS} onChange={setService} />
                      {service === 'Other' && (
                        <FormText label="Specify service" value={serviceOther} onChange={setServiceOther} />
                      )}
                      <FormSelect label="Urgency" value={urgency} options={URGENCY_OPTIONS} onChange={setUrgency} />
                      <FormSelect label="Tone" value={tone} options={TONE_OPTIONS} onChange={setTone} />
                      <FormSelect label="Proof point" value={proof} options={PROOF_OPTIONS} onChange={setProof} />
                      {proof === 'Other' && (
                        <FormText label="Specify proof" value={proofOther} onChange={setProofOther} />
                      )}
                      <FormSelect label="Call to action" value={cta} options={CTA_OPTIONS} onChange={setCta} />
                      {cta === 'Other' && (
                        <FormText label="Specify CTA" value={ctaOther} onChange={setCtaOther} />
                      )}
                      <div className="md:col-span-2">
                        <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Objections to address (up to 3)</Label>
                        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1">
                          {OBJECTION_OPTIONS.map(o => {
                            const checked = objections.includes(o);
                            return (
                              <label key={o} className="flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setObjections(prev => {
                                      if (prev.includes(o)) return prev.filter(x => x !== o);
                                      if (prev.length >= 3) { toast({ title: 'Pick up to 3 objections' }); return prev; }
                                      return [...prev, o];
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded border-gray-300"
                                />
                                <span>{o}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <FormText label="Custom opening line (optional)" value={customOpener} onChange={setCustomOpener} />
                      <FormText label="Company insight (optional)" value={companyInsight} onChange={setCompanyInsight} />
                      <FormText label="Notes (optional)" value={notes} onChange={setNotes} />
                      <FormText label="Language to avoid (optional)" value={avoidLanguage} onChange={setAvoidLanguage} />
                    </div>
                  )}
                </div>

                {!outputs && !generating && (
                  <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                    <Info className="w-4 h-4 mx-auto mb-2" />
                    Click <span className="font-semibold">Draft message</span> to generate a {MESSAGE_TYPE_LABEL[messageType].toLowerCase()} tailored to {fullName(selected)}.
                  </div>
                )}

                {generating && (
                  <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Drafting…
                  </div>
                )}

                {outputs && messageType === 'email' && (
                  <EmailPanel
                    label="Email"
                    subject={editedSubject}
                    body={editedBody}
                    onSubjectChange={setEditedSubject}
                    onBodyChange={setEditedBody}
                    sendHref={selected.email
                      ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(editedSubject)}&body=${encodeURIComponent(editedBody)}`
                      : ''}
                    sendDetail={selected.email || 'No email on file'}
                    onSend={() => onLaunchEmail(selected)}
                    jobTitle={job?.job_title || undefined}
                    jobUrl={job?.job_url || undefined}
                    recipientEmail={selected.email || ''}
                    fromName={[senderState?.first_name, senderState?.last_name].filter(Boolean).join(' ') || undefined}
                  />
                )}

                {outputs && messageType === 'followUpEmail' && (
                  <EmailPanel
                    label="Follow-Up Email"
                    subject={editedFollowUpSubject}
                    body={editedFollowUpBody}
                    onSubjectChange={setEditedFollowUpSubject}
                    onBodyChange={setEditedFollowUpBody}
                    sendHref={selected.email
                      ? `mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(editedFollowUpSubject)}&body=${encodeURIComponent(editedFollowUpBody)}`
                      : ''}
                    sendDetail={selected.email || 'No email on file'}
                    onSend={() => onLaunchEmail(selected)}
                    jobTitle={job?.job_title || undefined}
                    jobUrl={job?.job_url || undefined}
                    recipientEmail={selected.email || ''}
                    fromName={[senderState?.first_name, senderState?.last_name].filter(Boolean).join(' ') || undefined}
                  />
                )}

                {outputs && messageType === 'linkedin' && (
                  <SimplePanel
                    label="LinkedIn Message"
                    body={outputs.linkedin}
                    sendHref={selected.linkedin_url || ''}
                    sendLabel="Open LinkedIn"
                    sendIcon={<Linkedin className="w-3.5 h-3.5" />}
                    sendDetail={selected.linkedin_url ? 'Opens profile + copies message' : 'No LinkedIn on file'}
                    target="_blank"
                    onSend={() => onLaunchLinkedIn(selected)}
                  />
                )}

                {outputs && messageType === 'coldCall' && (
                  <SimplePanel
                    label="Cold Call Script"
                    body={outputs.coldCall}
                    sendHref={buildTelHref(selected)}
                    sendLabel="Call"
                    sendIcon={<Phone className="w-3.5 h-3.5" />}
                    sendDetail={preferredPhone(selected) || 'No phone on file'}
                    onSend={() => onLaunchPhone(selected)}
                  />
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

function FormSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 block w-full h-8 text-xs rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function FormText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-8 text-xs" />
    </div>
  );
}

function EmailPanel({
  label, subject, body, onSubjectChange, onBodyChange, sendHref, sendDetail, onSend, jobTitle, jobUrl,
  recipientEmail, fromName, replyTo,
}: {
  label: string;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  sendHref: string;
  sendDetail: string;
  onSend: () => void;
  // When both are present the first occurrence of jobTitle in the
  // body becomes a clickable hyperlink to jobUrl in the HTML preview
  // and Copy-HTML output. The plain-text body itself is unchanged.
  jobTitle?: string;
  jobUrl?: string;
  // Drives the "Send via Gmail" button: target address, sender display
  // name, and reply-to (defaults to the connected Gmail address).
  recipientEmail?: string;
  fromName?: string;
  replyTo?: string;
}) {
  const copyText = `Subject: ${subject}\n\n${body}`;
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-gray-50 flex-wrap">
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <div className="flex items-center gap-2">
          <CopyBtn text={copyText} label="Copy text" />
          {/* Copy HTML writes both text/html and text/plain to the
              clipboard, so pasting into Gmail/Outlook compose keeps
              the title-as-hyperlink and any other links clickable. */}
          <CopyHtmlBtn subject={subject} body={body} jobTitle={jobTitle} jobUrl={jobUrl} />
          {/* One-click send via the connected Gmail account. Skips
              the mailto + paste dance entirely; HTML is preserved
              end-to-end. Disabled (with tooltip) until Gmail is
              connected in System Settings. */}
          {recipientEmail && (
            <GmailSendBtn
              to={recipientEmail}
              subject={subject}
              body={body}
              jobTitle={jobTitle}
              jobUrl={jobUrl}
              fromName={fromName}
              replyTo={replyTo}
              onSent={onSend}
            />
          )}
          {sendHref ? (
            <a
              href={sendHref}
              onClick={async () => {
                // mailto: bodies are plain-text-only across virtually
                // every email client, so the Send link strips our
                // title-as-link formatting on its way to the OS.
                // Copy the HTML version to the clipboard at the same
                // moment so the user can paste (Cmd/Ctrl+V) inside
                // the compose window to land the formatted version
                // on top of the plain-text body. Best cross-client
                // option that doesn't require a server-side send
                // path or Gmail OAuth.
                try {
                  const htmlBody = bodyToHtml(body, jobTitle, jobUrl);
                  const html = `<div>${htmlBody}</div>`;
                  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
                    await navigator.clipboard.write([
                      new ClipboardItem({
                        'text/html': new Blob([html], { type: 'text/html' }),
                        'text/plain': new Blob([body], { type: 'text/plain' }),
                      }),
                    ]);
                  } else {
                    await navigator.clipboard.writeText(body);
                  }
                } catch {
                  // Don't block the mailto navigation on a clipboard
                  // failure — user can still send the plain-text
                  // version manually.
                }
                onSend();
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#911406] text-white hover:bg-[#7a1005]"
              title="Opens your email client and copies the HTML version to the clipboard — paste with Cmd/Ctrl+V inside compose to keep the role title as a clickable link."
            >
              <Mail className="w-3.5 h-3.5" />
              Send
            </a>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-200 text-gray-500 cursor-not-allowed"
              title={sendDetail}
            >
              <Mail className="w-3.5 h-3.5" />
              Send
            </span>
          )}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Subject</Label>
          <Input value={subject} onChange={e => onSubjectChange(e.target.value)} className="mt-1 text-sm" />
        </div>
        {/* Single editable body field. Contenteditable + bodyToHtml
            seed renders the title-as-link inline; user can edit any
            text around it, and the link stays clickable (cmd/ctrl-
            click opens in a new tab; bare click in-app navigates). */}
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Body</Label>
          <EditablePreview
            body={body}
            onChange={onBodyChange}
            jobTitle={jobTitle}
            jobUrl={jobUrl}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            Cmd/Ctrl-click the role link to open the posting in a new tab.
          </p>
        </div>
      </div>
    </div>
  );
}

function SimplePanel({
  label, body, sendHref, sendLabel, sendIcon, sendDetail, target, onSend,
}: {
  label: string;
  body: string;
  sendHref: string;
  sendLabel: string;
  sendIcon: React.ReactNode;
  sendDetail: string;
  target?: string;
  onSend: () => void;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-gray-50 flex-wrap">
        <div className="text-xs font-semibold text-gray-700">{label}</div>
        <div className="flex items-center gap-2">
          <CopyBtn text={body} label="Copy" />
          {sendHref ? (
            <a
              href={sendHref}
              target={target}
              rel={target === '_blank' ? 'noopener noreferrer' : undefined}
              onClick={onSend}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#911406] text-white hover:bg-[#7a1005]"
              title={sendDetail}
            >
              {sendIcon}
              {sendLabel}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-200 text-gray-500 cursor-not-allowed" title={sendDetail}>
              {sendIcon}
              {sendLabel}
            </span>
          )}
        </div>
      </div>
      <pre className="px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap font-sans">{body}</pre>
    </div>
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
