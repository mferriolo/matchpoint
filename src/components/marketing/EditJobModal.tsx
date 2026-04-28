import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Save, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

/**
 * Editable shape for a marketing_jobs row. Only the fields the user is
 * allowed to mutate appear here — source/url/created_at and friends are
 * deliberately omitted (read-only by spec). priority_score is recomputed
 * by the SQL trigger when job_title / company_id / date_posted change,
 * so we don't write it directly.
 */
export interface EditJobRow {
  id: string;
  job_title?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  city?: string | null;
  state?: string | null;
  job_type?: string | null;
  date_posted?: string | null;
  description?: string | null;
  notes?: string | null;
  high_priority?: boolean | null;
  status?: string | null;
}

interface CompanyOption {
  id?: string;
  company_name?: string;
}

interface EditJobModalProps {
  job: EditJobRow | null;
  /** Companies the user can pick from for company_name (datalist).
   *  Caller passes the same list it already loads for other features. */
  companies?: CompanyOption[];
  /** Optional list of tracked job-type names. If supplied, the Job Type
   *  field uses a datalist suggesting these. Otherwise it's free text. */
  jobTypeOptions?: string[];
  /** Fired with the saved row's id once the UPDATE succeeds; caller
   *  reloads its data so the new values render immediately. */
  onSaved: (id: string) => void;
  onClose: () => void;
}

const STATUS_OPTIONS = ['Open', 'Closed'];

/**
 * Convert an ISO timestamp to YYYY-MM-DD for the date input. Returns ''
 * for null/empty so the input renders empty rather than 1970-01-01.
 */
function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * Convert a YYYY-MM-DD value back to an ISO timestamp anchored at noon
 * UTC. Noon avoids drifting a day across timezones when the priority
 * recency reads it back.
 */
function fromDateInputValue(s: string): string | null {
  if (!s) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const EditJobModal: React.FC<EditJobModalProps> = ({ job, companies = [], jobTypeOptions = [], onSaved, onClose }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<EditJobRow>({} as EditJobRow);
  const [saving, setSaving] = useState(false);

  // Reseed the form whenever the caller swaps in a different job. Avoids
  // a stale draft if the modal is mounted persistently and re-opened on
  // a new row.
  useEffect(() => {
    if (job) {
      setDraft({
        id: job.id,
        job_title: job.job_title ?? '',
        company_id: job.company_id ?? null,
        company_name: job.company_name ?? '',
        city: job.city ?? '',
        state: job.state ?? '',
        job_type: job.job_type ?? '',
        date_posted: job.date_posted ?? null,
        description: job.description ?? '',
        notes: job.notes ?? '',
        high_priority: !!job.high_priority,
        status: job.status ?? 'Open',
      });
    }
  }, [job?.id]);

  // Build a name → id lookup so picking a company from the datalist
  // can keep company_id in sync with company_name. Falls back to the
  // raw text the user typed for ad-hoc / new companies.
  const companyByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of companies) {
      if (c.company_name && c.id) m.set(c.company_name.toLowerCase().trim(), c.id);
    }
    return m;
  }, [companies]);

  const handleCompanyName = (v: string) => {
    setDraft(d => ({
      ...d,
      company_name: v,
      company_id: companyByName.get(v.toLowerCase().trim()) ?? d.company_id ?? null,
    }));
  };

  const save = async () => {
    if (!draft.id) return;
    setSaving(true);
    try {
      // Whitelist of editable columns. priority_score is intentionally
      // omitted — the SQL trigger recomputes it from date_posted /
      // job_title / company_id automatically.
      const updates: Record<string, any> = {
        job_title: (draft.job_title || '').trim() || null,
        company_id: draft.company_id || null,
        company_name: (draft.company_name || '').trim() || null,
        city: (draft.city || '').trim() || null,
        state: (draft.state || '').trim() || null,
        job_type: (draft.job_type || '').trim() || null,
        date_posted: draft.date_posted || null,
        description: (draft.description || '').trim() || null,
        notes: (draft.notes || '').trim() || null,
        high_priority: !!draft.high_priority,
        status: draft.status || 'Open',
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('marketing_jobs').update(updates).eq('id', draft.id);
      if (error) throw error;
      toast({ title: 'Job updated', description: draft.job_title || '(untitled)' });
      onSaved(draft.id);
      onClose();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Edit job</h3>
            <p className="text-xs text-gray-500">
              {[draft.job_title, draft.company_name].filter(Boolean).join(' · ') || '(untitled)'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Job title</Label>
            <Input
              value={draft.job_title || ''}
              onChange={e => setDraft(d => ({ ...d, job_title: e.target.value }))}
              className="mt-1"
              placeholder="e.g. Chief Medical Officer"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Company</Label>
            <Input
              value={draft.company_name || ''}
              onChange={e => handleCompanyName(e.target.value)}
              className="mt-1"
              list="edit-job-company-list"
              placeholder="Pick or type a company name"
            />
            <datalist id="edit-job-company-list">
              {companies
                .filter(c => c.company_name)
                .slice(0, 500)
                .map(c => <option key={c.id || c.company_name} value={c.company_name!} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">City</Label>
              <Input
                value={draft.city || ''}
                onChange={e => setDraft(d => ({ ...d, city: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">State</Label>
              <Input
                value={draft.state || ''}
                onChange={e => setDraft(d => ({ ...d, state: e.target.value }))}
                className="mt-1"
                placeholder="CA"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Job type</Label>
              <Input
                value={draft.job_type || ''}
                onChange={e => setDraft(d => ({ ...d, job_type: e.target.value }))}
                className="mt-1"
                list="edit-job-type-list"
                placeholder="e.g. Physician"
              />
              <datalist id="edit-job-type-list">
                {jobTypeOptions.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">
                Date posted
              </Label>
              <Input
                type="date"
                value={toDateInputValue(draft.date_posted)}
                onChange={e => setDraft(d => ({ ...d, date_posted: fromDateInputValue(e.target.value) }))}
                className="mt-1"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Drives the priority recency score.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Status</Label>
              <select
                value={draft.status || 'Open'}
                onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setDraft(d => ({ ...d, high_priority: !d.high_priority }))}
                className={`w-full h-10 rounded-md border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  draft.high_priority
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Star
                  className="w-4 h-4"
                  fill={draft.high_priority ? 'currentColor' : 'none'}
                  strokeWidth={draft.high_priority ? 0 : 1.5}
                />
                {draft.high_priority ? 'High priority' : 'Mark high priority'}
              </button>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Description</Label>
            <Textarea
              value={draft.description || ''}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              className="mt-1 min-h-[120px] text-sm"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-medium">Notes</Label>
            <Textarea
              value={draft.notes || ''}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              className="mt-1 min-h-[80px] text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#911406] hover:bg-[#7a1005] text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditJobModal;
