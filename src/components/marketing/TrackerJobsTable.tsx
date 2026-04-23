import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Star } from 'lucide-react';

// Each row is a marketing_jobs row. The parent passes two extra fields
// it can derive cheaply but the table can't:
//   _companyIsHighPriority — the job's company has is_high_priority=true
//   _companyType — for the detail dialog
export interface TrackerJobsTableRow {
  id: string;
  job_title?: string;
  company_name?: string;
  city?: string;
  state?: string;
  source?: string;
  website_source?: string;
  job_url?: string;
  google_jobs_url?: string;
  indeed_url?: string;
  linkedin_url?: string;
  description?: string;
  date_posted?: string;
  created_at?: string;
  is_net_new?: boolean;
  high_priority?: boolean;
  job_type?: string;
  opportunity_type?: string;
  notes?: string;
  _companyIsHighPriority?: boolean;
  _companyType?: string;
  [k: string]: unknown;
}

type SortKey = 'job_title' | 'company_name' | 'city' | 'state' | 'source' | 'created_at';
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'job_title', label: 'Job Title', className: 'w-[28%]' },
  { key: 'company_name', label: 'Company', className: 'w-[22%]' },
  { key: 'city', label: 'City', className: 'w-[12%]' },
  { key: 'state', label: 'State', className: 'w-[8%]' },
  { key: 'source', label: 'Source', className: 'w-[15%]' },
  { key: 'created_at', label: 'Date Found', className: 'w-[15%]' },
];

// Cleaner label from the tracker's internal source tags.
function sourceLabel(j: TrackerJobsTableRow): string {
  const raw = (j.source || j.website_source || '').trim();
  if (!raw) return '—';
  // "Google Jobs (priority)" / "Google Jobs (recurring)" → "Google Jobs"
  const gmatch = raw.match(/^(Google Jobs)/i);
  if (gmatch) return 'Google Jobs';
  // "career-page:greenhouse" → "Greenhouse career page"
  const cpmatch = raw.match(/^career-page:(.+)$/i);
  if (cpmatch) return `${cpmatch[1][0].toUpperCase()}${cpmatch[1].slice(1)} career page`;
  // "broad: nurse practitioner" → "Broad search"
  if (raw.startsWith('broad:')) return 'Broad search';
  // "board: <domain>" → "<domain>"
  const bmatch = raw.match(/^board:\s*(.+)$/i);
  if (bmatch) return bmatch[1];
  return raw;
}

function sourceUrl(j: TrackerJobsTableRow): string {
  return j.job_url || j.google_jobs_url || j.indeed_url || j.linkedin_url || '';
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TrackerJobsTable({ jobs }: { jobs: TrackerJobsTableRow[] }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<TrackerJobsTableRow | null>(null);

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      for (const [key, val] of Object.entries(filters)) {
        if (!val) continue;
        const needle = val.toLowerCase();
        const fieldVal =
          key === 'source' ? sourceLabel(j)
          : key === 'created_at' ? fmtDate(j.created_at)
          : String((j as Record<string, unknown>)[key] ?? '');
        if (!fieldVal.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [jobs, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = sortKey === 'source' ? sourceLabel(a) : ((a as Record<string, unknown>)[sortKey] ?? '');
      const bv = sortKey === 'source' ? sourceLabel(b) : ((b as Record<string, unknown>)[sortKey] ?? '');
      let cmp = 0;
      if (sortKey === 'created_at') {
        const ad = av ? new Date(String(av)).getTime() : 0;
        const bd = bv ? new Date(String(bv)).getTime() : 0;
        cmp = ad - bd;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' ? 'desc' : 'asc');
    }
  };

  const isPriority = (j: TrackerJobsTableRow) => !!j.high_priority || !!j._companyIsHighPriority;

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="inline w-3 h-3 text-gray-300 ml-1" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline w-3 h-3 text-gray-600 ml-1" />
      : <ArrowDown className="inline w-3 h-3 text-gray-600 ml-1" />;
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`text-left px-3 py-2 font-semibold text-gray-700 select-none ${col.className || ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center hover:text-gray-900 cursor-pointer"
                  >
                    {col.label}
                    {sortIcon(col.key)}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="bg-white border-b border-gray-200">
              {COLUMNS.map(col => (
                <th key={col.key} className="px-2 py-1.5 font-normal">
                  <Input
                    placeholder={`Filter ${col.label.toLowerCase()}…`}
                    value={filters[col.key] || ''}
                    onChange={e => setFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                    className="h-7 text-xs"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(j => {
              const priority = isPriority(j);
              return (
                <tr
                  key={j.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    priority ? 'bg-amber-50/70 hover:bg-amber-100/70' : ''
                  }`}
                >
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-start gap-1.5">
                      {priority && <Star className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
                      <button
                        type="button"
                        onClick={() => setSelected(j)}
                        className="text-left text-blue-700 hover:text-blue-900 hover:underline font-medium cursor-pointer"
                      >
                        {j.job_title || '(untitled)'}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-800">{j.company_name || '—'}</td>
                  <td className="px-3 py-2 align-top text-gray-700">{j.city || '—'}</td>
                  <td className="px-3 py-2 align-top text-gray-700">{j.state || '—'}</td>
                  <td className="px-3 py-2 align-top">
                    {sourceUrl(j) ? (
                      <a
                        href={sourceUrl(j)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline"
                      >
                        {sourceLabel(j)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-gray-500">{sourceLabel(j)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-gray-600 whitespace-nowrap">{fmtDate(j.created_at)}</td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-8 text-gray-500 text-xs">
                  No jobs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 text-[11px] text-gray-500 border-t border-gray-100">
        Showing {sorted.length} of {jobs.length} jobs
      </div>

      <JobDetailDialog job={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function JobDetailDialog({ job, onClose }: { job: TrackerJobsTableRow | null; onClose: () => void }) {
  const url = job ? sourceUrl(job) : '';
  return (
    <Dialog open={!!job} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {job && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start gap-2 pr-6">
                {(job.high_priority || job._companyIsHighPriority) && (
                  <Star className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                )}
                <span>{job.job_title || '(untitled)'}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
                <Field label="Company" value={job.company_name} />
                <Field label="Location" value={[job.city, job.state].filter(Boolean).join(', ')} />
                <Field label="Source" value={sourceLabel(job)} />
                <Field label="Date Found" value={fmtDate(job.created_at)} />
                {job.date_posted && <Field label="Date Posted" value={fmtDate(job.date_posted)} />}
                {job.job_type && <Field label="Job Type" value={job.job_type} />}
                {job.opportunity_type && <Field label="Opportunity" value={job.opportunity_type} />}
                {job._companyType && <Field label="Company Type" value={job._companyType} />}
              </div>

              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open original posting
                </a>
              )}

              {job.description && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Description</div>
                  <div className="whitespace-pre-wrap text-gray-800 text-xs bg-white border border-gray-200 rounded-md p-3 max-h-[40vh] overflow-y-auto">
                    {job.description}
                  </div>
                </div>
              )}

              {job.notes && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">Notes</div>
                  <div className="text-gray-700 text-xs">{job.notes}</div>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}
