import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Wand2, Copy, Check, Save, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface ScriptJobInput {
  id: string;
  job_title?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  city?: string | null;
  state?: string | null;
  job_url?: string | null;
  date_posted?: string | null;
  created_at?: string | null;
  company_type?: string | null;
  job_type?: string | null;
  compensation?: string | null;
  priority_score?: number | null;
  description?: string | null;
  company_description?: string | null;
}

interface ContactRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  suffix?: string | null;
}

/** Map a free-text contact title to one of the AUDIENCE_OPTIONS values,
 *  or '' if no confident match. Order matters: CMO is checked before
 *  generic "medical" so we don't downgrade a CMO to "Regional MD". */
function audienceFromTitle(title: string): string {
  const t = (title || '').toLowerCase();
  if (!t) return '';
  if (/\bcmo\b|chief medical officer/.test(t)) return 'Chief Medical Officer';
  if (/operating partner|private equity/.test(t)) return 'Private Equity Operating Partner';
  if (/\bceo\b|chief executive|founder|president/.test(t)) return 'CEO / Founder';
  if (/\bcoo\b|chief operating|chief of operations|chief operations/.test(t)) return 'COO / Chief of Operations';
  if (/vp .*clinical|vice president .*clinical/.test(t)) return 'VP of Clinical Operations';
  if (/talent acquisition|head of ta|director of ta/.test(t)) return 'Head of Talent Acquisition';
  if (/recruit/.test(t)) return 'Recruiting Manager';
  if (/practice administrator|practice manager/.test(t)) return 'Practice Administrator';
  if (/regional medical director/.test(t)) return 'Regional Medical Director';
  if (/medical director/.test(t)) return 'Regional Medical Director';
  return '';
}

/** Seniority rank for picking the best contact to pitch when a company
 *  has several. Higher = better target. Falls back to 0 (any contact) so
 *  we still pre-fill something. */
function contactSeniorityRank(title: string): number {
  const t = (title || '').toLowerCase();
  if (/\bcmo\b|chief medical officer/.test(t)) return 100;
  if (/\bceo\b|chief executive|founder|president/.test(t)) return 90;
  if (/\bcoo\b|chief operating|chief of operations/.test(t)) return 85;
  if (/operating partner|private equity/.test(t)) return 80;
  if (/regional medical director/.test(t)) return 75;
  if (/medical director/.test(t)) return 70;
  if (/vp .*clinical|vice president .*clinical/.test(t)) return 65;
  if (/practice administrator|practice manager/.test(t)) return 50;
  if (/talent acquisition|head of ta|director of ta/.test(t)) return 45;
  if (/recruit/.test(t)) return 40;
  return 1;
}

/** Format a hiring-manager name per the user's rule:
 *    - "Dr. {LastName}" if the contact is a CMO or Medical Director (or
 *      has an MD/DO suffix indicating a physician).
 *    - "{FirstName}" otherwise.
 *  Returns '' if neither name field is populated. */
function formatHiringManagerName(c: ContactRow | null): string {
  if (!c) return '';
  const first = (c.first_name || '').trim();
  const last = (c.last_name || '').trim();
  const title = (c.title || '').toLowerCase();
  const suffix = (c.suffix || '').toLowerCase();
  const isPhysicianTitle = /\bcmo\b|chief medical officer|medical director/.test(title);
  const hasPhysicianSuffix = /\bm\.?d\.?\b|\bd\.?o\.?\b/.test(suffix);
  if ((isPhysicianTitle || hasPhysicianSuffix) && last) return `Dr. ${last}`;
  if (first) return first;
  if (last) return last;
  return '';
}

/** Pick the best contact from a company's contact list to pitch. Prefer
 *  the most senior decision-maker by title match; tiebreak on whichever
 *  has both names populated. */
function pickBestContact(contacts: ContactRow[]): ContactRow | null {
  if (!contacts || contacts.length === 0) return null;
  const scored = contacts.map(c => ({
    c,
    rank: contactSeniorityRank(c.title || ''),
    nameComplete: !!((c.first_name || '').trim() && (c.last_name || '').trim()),
  }));
  scored.sort((a, b) => (b.rank - a.rank) || (Number(b.nameComplete) - Number(a.nameComplete)));
  return scored[0]?.c || null;
}

interface FormInputs {
  audience: string;
  audienceOther: string;
  problem: string;
  problemOther: string;
  service: string;
  serviceOther: string;
  companyType: string;
  roleCategory: string;
  urgency: string;
  tone: string;
  proof: string;
  proofOther: string;
  cta: string;
  ctaOther: string;
  objections: string[];
  customOpener: string;
  specificPain: string;
  companyInsight: string;
  hiringManagerName: string;
  caseStudy: string;
  notes: string;
  avoidLanguage: string;
}

interface ScriptOutputs {
  coldCall: string;
  email: { subject: string; body: string };
  linkedin: string;
  voicemail: string;
  objectionResponse: string;
}

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

const COMPANY_TYPE_OPTIONS = [
  'Value Based Care (VBC)',
  'ACO',
  'PACE Medical Groups',
  'Health Plans',
  'Health Systems',
  'Hospitals',
  'FQHC',
  'All Others',
];

const ROLE_CATEGORY_OPTIONS = ['CMO', 'Medical Director', 'PCP', 'APP', 'Other'];

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
  'Review MedCentric’s search process',
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
  'No objection selected',
];

function ageDays(datePosted?: string | null, createdAt?: string | null): number | null {
  const iso = datePosted || createdAt;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function defaultInputs(job: ScriptJobInput): FormInputs {
  return {
    audience: 'Chief Medical Officer',
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
    hiringManagerName: '',
    caseStudy: '',
    notes: '',
    avoidLanguage: '',
  };
}

function fmtDateOnly(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function ScriptGeneratorModal({
  job,
  onClose,
}: {
  job: ScriptJobInput | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormInputs>(() => job ? defaultInputs(job) : defaultInputs({ id: '' } as ScriptJobInput));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outputs, setOutputs] = useState<ScriptOutputs | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setForm(defaultInputs(job));
    setOutputs(null);
    setSavedAt(null);

    // Auto-fill Decision Maker + Hiring Manager Name from
    // marketing_contacts whenever the company has a contact on record.
    // Bail early if neither identifier is set so we don't issue an
    // unfiltered query.
    const cancelled = { v: false };
    (async () => {
      const hasId = !!job.company_id;
      const hasName = !!(job.company_name && job.company_name.trim());
      if (!hasId && !hasName) return;
      let q = supabase.from('marketing_contacts').select('id, first_name, last_name, title, suffix');
      if (hasId) q = q.eq('company_id', job.company_id);
      else q = q.eq('company_name', job.company_name);
      const { data, error } = await q;
      if (cancelled.v) return;
      if (error || !data || data.length === 0) return;
      const best = pickBestContact(data as ContactRow[]);
      if (!best) return;
      const audience = audienceFromTitle(best.title || '');
      const hiringName = formatHiringManagerName(best);
      setForm(prev => ({
        ...prev,
        ...(audience ? { audience } : {}),
        ...(hiringName ? { hiringManagerName: hiringName } : {}),
      }));
    })();

    return () => { cancelled.v = true; };
  }, [job?.id]);

  const age = useMemo(() => ageDays(job?.date_posted, job?.created_at), [job?.date_posted, job?.created_at]);

  if (!job) return null;

  const set = <K extends keyof FormInputs>(k: K, v: FormInputs[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const toggleObjection = (opt: string) => {
    setForm(prev => {
      const has = prev.objections.includes(opt);
      if (has) return { ...prev, objections: prev.objections.filter(o => o !== opt) };
      if (prev.objections.length >= 3) {
        toast({ title: 'Pick up to 3 objections' });
        return prev;
      }
      return { ...prev, objections: [...prev.objections, opt] };
    });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const payload = {
        job: {
          company_name: job.company_name,
          job_title: job.job_title,
          city: job.city,
          state: job.state,
          job_url: job.job_url,
          date_posted: job.date_posted,
          age_days: age,
          company_type: job.company_type,
          compensation: job.compensation,
          priority_score: job.priority_score,
          company_description: job.company_description,
          job_description: job.description,
        },
        inputs: form,
      };
      const { data, error } = await supabase.functions.invoke('generate-job-script', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.outputs) throw new Error('No outputs returned');
      setOutputs(data.outputs as ScriptOutputs);
      setSavedAt(null);
    } catch (err: any) {
      toast({ title: 'Generation failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const saveScript = async () => {
    if (!outputs) return;
    setSaving(true);
    try {
      const { count } = await supabase
        .from('marketing_job_scripts')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id);
      const nextVersion = (count || 0) + 1;
      const { error } = await supabase.from('marketing_job_scripts').insert({
        job_id: job.id,
        company_name: job.company_name || null,
        job_title: job.job_title || null,
        inputs: form,
        outputs,
        version: nextVersion,
      });
      if (error) throw error;
      setSavedAt(new Date().toISOString());
      toast({ title: `Saved (v${nextVersion})` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const allText = outputs
    ? `COLD CALL\n${outputs.coldCall}\n\nEMAIL — ${outputs.email.subject}\n${outputs.email.body}\n\nLINKEDIN\n${outputs.linkedin}\n\nVOICEMAIL\n${outputs.voicemail}\n\nOBJECTION RESPONSE\n${outputs.objectionResponse}`
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => !generating && !saving && onClose()}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-5xl my-8 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-[#911406]" />
              Generate Problem/Solution Script
            </h3>
            <p className="text-xs text-gray-500">
              {[job.job_title, job.company_name].filter(Boolean).join(' · ') || '(untitled)'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={generating || saving}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
              <div className="font-semibold text-gray-700 uppercase tracking-wider text-[10px] mb-1">Job summary</div>
              <Row label="Company" value={job.company_name || '—'} />
              <Row label="Role" value={job.job_title || '—'} />
              <Row label="Location" value={[job.city, job.state].filter(Boolean).join(', ') || '—'} />
              <Row label="Posted" value={`${fmtDateOnly(job.date_posted)}${age != null ? ` (${age}d ago)` : ''}`} />
              <Row label="Company type" value={job.company_type || '—'} />
              <Row label="Compensation" value={job.compensation || '—'} />
              <Row label="Priority score" value={job.priority_score != null ? String(job.priority_score) : '—'} />
              {job.job_url && (
                <Row
                  label="Posting"
                  value={
                    <a className="text-blue-700 hover:underline" target="_blank" rel="noreferrer" href={job.job_url}>
                      Open
                    </a>
                  }
                />
              )}
            </div>

            <Section title="Prospect">
              <Select label="Decision Maker / Audience" value={form.audience} options={AUDIENCE_OPTIONS} onChange={v => set('audience', v)} />
              {form.audience === 'Other' && <FreeText label="Specify audience" value={form.audienceOther} onChange={v => set('audienceOther', v)} />}
              <FreeText label="Hiring manager name (optional)" value={form.hiringManagerName} onChange={v => set('hiringManagerName', v)} />
            </Section>

            <Section title="Problem">
              <Select label="Primary Business Problem" value={form.problem} options={PROBLEM_OPTIONS} onChange={v => set('problem', v)} />
              {form.problem === 'Other' && <FreeText label="Specify problem" value={form.problemOther} onChange={v => set('problemOther', v)} />}
              <Select label="Urgency Level" value={form.urgency} options={URGENCY_OPTIONS} onChange={v => set('urgency', v)} />
              <FreeText label="Specific pain to mention (optional)" value={form.specificPain} onChange={v => set('specificPain', v)} />
            </Section>

            <Section title="Solution">
              <Select label="MedCentric Service to Pitch" value={form.service} options={SERVICE_OPTIONS} onChange={v => set('service', v)} />
              {form.service === 'Other' && <FreeText label="Specify service" value={form.serviceOther} onChange={v => set('serviceOther', v)} />}
              <Select label="Company Type" value={form.companyType} options={['', ...COMPANY_TYPE_OPTIONS]} onChange={v => set('companyType', v)} />
              <Select label="Role Category" value={form.roleCategory} options={['', ...ROLE_CATEGORY_OPTIONS]} onChange={v => set('roleCategory', v)} />
              <Select label="Sales Tone" value={form.tone} options={TONE_OPTIONS} onChange={v => set('tone', v)} />
            </Section>

            <Section title="Proof">
              <Select label="Proof Point to Emphasize" value={form.proof} options={PROOF_OPTIONS} onChange={v => set('proof', v)} />
              {form.proof === 'Other' && <FreeText label="Specify proof point" value={form.proofOther} onChange={v => set('proofOther', v)} />}
              <FreeText label="Case study / proof point (optional)" value={form.caseStudy} onChange={v => set('caseStudy', v)} />
              <FreeText label="Company insight (optional)" value={form.companyInsight} onChange={v => set('companyInsight', v)} />
            </Section>

            <Section title="Call to Action">
              <Select label="Desired Call to Action" value={form.cta} options={CTA_OPTIONS} onChange={v => set('cta', v)} />
              {form.cta === 'Other' && <FreeText label="Specify CTA" value={form.ctaOther} onChange={v => set('ctaOther', v)} />}
              <div>
                <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Common Objections (up to 3)</Label>
                <div className="mt-1 grid grid-cols-1 gap-1">
                  {OBJECTION_OPTIONS.map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.objections.includes(opt)}
                        onChange={() => toggleObjection(opt)}
                        className="w-3.5 h-3.5 rounded border-gray-300"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <FreeText label="Custom opening line (optional)" value={form.customOpener} onChange={v => set('customOpener', v)} />
              <FreeText label="Notes from research (optional)" value={form.notes} onChange={v => set('notes', v)} multiline />
              <FreeText label="Language to avoid (optional)" value={form.avoidLanguage} onChange={v => set('avoidLanguage', v)} />
            </Section>

            <div className="flex items-center gap-2">
              <Button onClick={generate} disabled={generating} className="bg-[#911406] hover:bg-[#7a1005] text-white">
                {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                {outputs ? 'Regenerate' : 'Generate Script'}
              </Button>
              {outputs && (
                <Button variant="outline" onClick={generate} disabled={generating}>
                  <RotateCw className="w-4 h-4 mr-1" />
                  Regenerate
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {!outputs && !generating && (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                Fill in the form and click <span className="font-semibold">Generate Script</span> to produce the five outputs.
              </div>
            )}
            {generating && (
              <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </div>
            )}
            {outputs && (
              <>
                <div className="flex items-center justify-end gap-2">
                  <CopyButton text={allText} label="Copy All" />
                  <Button onClick={saveScript} disabled={saving} variant="outline" size="sm">
                    {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                    Save Script
                  </Button>
                  {savedAt && <span className="text-[11px] text-emerald-700">Saved</span>}
                </div>

                <OutputBlock title="Cold Call" body={outputs.coldCall} />
                <OutputBlock
                  title={`Email — ${outputs.email.subject}`}
                  body={outputs.email.body}
                  copyText={`Subject: ${outputs.email.subject}\n\n${outputs.email.body}`}
                  copyLabel="Copy Email"
                />
                <OutputBlock title="LinkedIn" body={outputs.linkedin} />
                <OutputBlock title="Voicemail" body={outputs.voicemail} copyLabel="Copy Voicemail" />
                <OutputBlock title="Objection Response" body={outputs.objectionResponse} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-28 text-gray-500">{label}</span>
      <span className="text-gray-900 truncate">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{title}</div>
      {children}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-1 block w-full h-9 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map(o => (
          <option key={o} value={o}>{o || '(unset)'}</option>
        ))}
      </select>
    </div>
  );
}

function FreeText({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">{label}</Label>
      {multiline ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} className="mt-1" rows={3} />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} className="mt-1" />
      )}
    </div>
  );
}

function OutputBlock({
  title,
  body,
  copyText,
  copyLabel,
}: {
  title: string;
  body: string;
  copyText?: string;
  copyLabel?: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <div className="text-xs font-semibold text-gray-700">{title}</div>
        <CopyButton text={copyText ?? body} label={copyLabel || 'Copy'} />
      </div>
      <pre className="px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap font-sans">{body}</pre>
    </div>
  );
}
