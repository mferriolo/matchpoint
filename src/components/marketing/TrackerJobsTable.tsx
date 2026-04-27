import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ExternalLink, Star,
  Briefcase, Users, Globe, ShieldCheck, Ban, Undo2, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import JobPriorityBadge from './JobPriorityBadge';
import { priorityScore } from '@/lib/jobPriorityScore';

// Each row is a marketing_jobs row. The parent decorates each job with a
// few extra fields the table/dialog needs but can't derive on its own:
//   _companyIsHighPriority — quick-access boolean for row highlight
//   _companyType           — company category for the new column
//   _company               — full enriched company record (openJobs,
//                            companyContacts, newJobs, recentContacts,
//                            isNewCompany, careers_url, has_md_cmo, etc.)
//                            used by the company-summary dialog.
export interface TrackerJobsTableRow {
  id: string;
  /** 0–100 priority computed by the SQL trigger / recompute RPC. May be
   *  null on freshly-inserted rows before the page calls recompute. */
  priority_score?: number | null;
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
  tracker_run_id?: string | null;
  _companyIsHighPriority?: boolean;
  _companyIsBlocked?: boolean;
  _companyType?: string;
  _company?: CompanyRecord;
  [k: string]: unknown;
}

export interface TrackerRunOption {
  id: string;
  completed_at?: string | null;
  started_at?: string | null;
  status?: string;
}

export interface CompanyRecord {
  id?: string;
  company_name?: string;
  company_type?: string;
  is_high_priority?: boolean;
  is_blocked?: boolean;
  has_md_cmo?: boolean;
  careers_url?: string;
  open_roles_count?: number;
  contact_count?: number;
  isNewCompany?: boolean;
  openJobs?: Array<{ id?: string; job_title?: string; city?: string; state?: string; is_net_new?: boolean; url_status?: string }>;
  companyContacts?: Array<{ id?: string; first_name?: string; last_name?: string; title?: string; email?: string }>;
  recentContacts?: Array<{ id?: string; first_name?: string; last_name?: string; title?: string; email?: string }>;
  newJobs?: Array<{ id?: string; job_title?: string }>;
  [k: string]: unknown;
}

type SortKey =
  | 'priority_score'
  | 'job_title'
  | 'job_type'
  | 'company_name'
  | 'company_type'
  | 'city'
  | 'state'
  | 'source'
  | 'created_at';
type SortDir = 'asc' | 'desc';

type FilterKind = 'text' | 'select-job-type' | 'select-company-type' | 'select-run' | 'none';
const COLUMNS: Array<{ key: SortKey; label: string; className?: string; filter: FilterKind }> = [
  { key: 'priority_score', label: 'Priority',  className: 'w-[7%]',  filter: 'none' },
  { key: 'job_title',    label: 'Job Title',    className: 'w-[18%]', filter: 'text' },
  { key: 'job_type',     label: 'Job Type',     className: 'w-[11%]', filter: 'select-job-type' },
  { key: 'company_name', label: 'Company',      className: 'w-[14%]', filter: 'text' },
  { key: 'company_type', label: 'Company Type', className: 'w-[11%]', filter: 'select-company-type' },
  { key: 'city',         label: 'City',         className: 'w-[8%]',  filter: 'text' },
  { key: 'state',        label: 'State',        className: 'w-[6%]',  filter: 'text' },
  { key: 'source',       label: 'Source',       className: 'w-[10%]', filter: 'text' },
  { key: 'created_at',   label: 'Date Found',   className: 'w-[15%]', filter: 'select-run' },
];

// Cleaner label from the tracker's internal source tags.
export function sourceLabel(j: TrackerJobsTableRow): string {
  const raw = (j.source || j.website_source || '').trim();
  if (!raw) return '—';
  const gmatch = raw.match(/^(Google Jobs)/i);
  if (gmatch) return 'Google Jobs';
  const cpmatch = raw.match(/^career-page:(.+)$/i);
  if (cpmatch) return `${cpmatch[1][0].toUpperCase()}${cpmatch[1].slice(1)} career page`;
  if (raw.startsWith('broad:')) return 'Broad search';
  const bmatch = raw.match(/^board:\s*(.+)$/i);
  if (bmatch) return bmatch[1];
  return raw;
}

export function sourceUrl(j: TrackerJobsTableRow): string {
  return j.job_url || j.google_jobs_url || j.indeed_url || j.linkedin_url || '';
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// Normalized form of a role name for substring matching — lowercase,
// parentheticals stripped (e.g. "Registered Nurses (RNs)" → "registered nurses").
function cleanRoleLabel(s: string): string {
  return s.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

// Determine which of the user's tracked job_types this job's title maps
// to. Iterates longest-first so more specific matches win (e.g. "Primary
// Care Physician" is preferred over the generic "Physician"). The DB's
// job_type column is often a copy of the raw title rather than a
// normalized role name, so we redo the matching client-side.
export function matchJobType(title: string | undefined, options: string[]): string {
  if (!title || options.length === 0) return '';
  const lowerTitle = title.toLowerCase();
  const sorted = [...options].sort((a, b) => b.length - a.length);
  for (const t of sorted) {
    const c = cleanRoleLabel(t);
    if (c && lowerTitle.includes(c)) return t;
  }
  return '';
}

// Extract the filterable/sortable string for a given column from a row.
function rowFieldForKey(j: TrackerJobsTableRow, key: SortKey, matchedType: string): string {
  switch (key) {
    case 'priority_score': return String(j.priority_score ?? '');
    case 'source':       return sourceLabel(j);
    case 'created_at':   return fmtDateTime(j.created_at);
    case 'company_type': return String(j._companyType ?? '');
    case 'job_type':     return matchedType;
    default:             return String((j as Record<string, unknown>)[key] ?? '');
  }
}

// Company-type chip colors — mirrors what v151 tiles used.
export function companyTypeBadge(cat?: string): string {
  const colors: Record<string, string> = {
    'Value Based Care (VBC)': 'bg-blue-100 text-blue-800',
    'PACE Medical Groups': 'bg-purple-100 text-purple-800',
    'Health Plans': 'bg-green-100 text-green-800',
    'Health Systems': 'bg-orange-100 text-orange-800',
    'Hospitals': 'bg-red-100 text-red-800',
    'FQHC': 'bg-teal-100 text-teal-800',
    'All Others': 'bg-gray-100 text-gray-800',
  };
  return colors[cat || ''] || 'bg-gray-100 text-gray-800';
}

function googleJobsSearchForCompany(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} healthcare jobs`)}&ibp=htl;jobs`;
}

export function TrackerJobsTable({
  jobs,
  jobTypeOptions = [],
  trackerRuns = [],
  onDataRefresh,
}: {
  jobs: TrackerJobsTableRow[];
  jobTypeOptions?: string[];
  trackerRuns?: TrackerRunOption[];
  onDataRefresh?: () => void;
}) {
  // Text columns store a single string (substring match); select columns
  // store a string[] (exact-match any-of; empty = show all).
  const [filters, setFilters] = useState<Record<string, string | string[]>>({});
  // Default sort: hottest priority first. high_priority manual flag still
  // takes precedence within ties — handled in the sort comparator below.
  const [sortKey, setSortKey] = useState<SortKey>('priority_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedJob, setSelectedJob] = useState<TrackerJobsTableRow | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null);

  // Pre-compute the matched job type per row so filter/sort/render all
  // agree on what Job Type means for a given job.
  const matchedTypes = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) {
      m.set(j.id, matchJobType(j.job_title, jobTypeOptions));
    }
    return m;
  }, [jobs, jobTypeOptions]);

  const fieldFor = (j: TrackerJobsTableRow, key: SortKey) =>
    rowFieldForKey(j, key, matchedTypes.get(j.id) || '');

  // Select-filter options — derived from whatever is actually in the
  // current jobs dataset so pickers never show empty rows. Each sorted,
  // deduped.
  const jobTypeSelectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      const t = matchedTypes.get(j.id);
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs, matchedTypes]);

  const companyTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j._companyType) set.add(j._companyType);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const runOptions = useMemo(() => {
    const runIdsInJobs = new Set<string>();
    for (const j of jobs) {
      if (j.tracker_run_id) runIdsInJobs.add(String(j.tracker_run_id));
    }
    return trackerRuns
      .filter(r => runIdsInJobs.has(r.id))
      .sort((a, b) => {
        const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bt - at;
      });
  }, [jobs, trackerRuns]);

  const setTextFilter = (key: string, v: string) =>
    setFilters(prev => ({ ...prev, [key]: v }));
  const setMultiFilter = (key: string, v: string[]) =>
    setFilters(prev => ({ ...prev, [key]: v }));
  const getMulti = (key: string): string[] => {
    const v = filters[key];
    return Array.isArray(v) ? v : [];
  };
  const getText = (key: string): string => {
    const v = filters[key];
    return typeof v === 'string' ? v : '';
  };

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      for (const col of COLUMNS) {
        const v = filters[col.key];
        if (col.filter === 'none') {
          continue;
        } else if (col.filter === 'text') {
          if (typeof v !== 'string' || !v) continue;
          if (!fieldFor(j, col.key).toLowerCase().includes(v.toLowerCase())) return false;
        } else {
          const selected = Array.isArray(v) ? v : [];
          if (selected.length === 0) continue;
          let rowVal = '';
          if (col.filter === 'select-job-type') rowVal = matchedTypes.get(j.id) || '';
          else if (col.filter === 'select-company-type') rowVal = j._companyType || '';
          else if (col.filter === 'select-run') rowVal = String(j.tracker_run_id || '');
          if (!selected.includes(rowVal)) return false;
        }
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filters, matchedTypes]);

  // Resolve a row's effective priority. Falls back to a client-side
  // compute so freshly-inserted rows (where the SQL trigger hasn't fired
  // yet, e.g. during a Tracker run that hasn't called recompute) still
  // sort sensibly instead of bottoming out at null.
  const effectivePriority = (j: TrackerJobsTableRow): number => {
    if (typeof j.priority_score === 'number') return j.priority_score;
    return priorityScore({
      lastSeenAt: (j as any).last_seen_at,
      createdAt: j.created_at,
      jobTitle: j.job_title,
      companyType: j._companyType,
    }).total;
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      // Manual high_priority flag pins to the top regardless of sort key.
      const aP = (a.high_priority || a._companyIsHighPriority) ? 1 : 0;
      const bP = (b.high_priority || b._companyIsHighPriority) ? 1 : 0;
      if (aP !== bP) return bP - aP;

      let cmp = 0;
      if (sortKey === 'priority_score') {
        cmp = effectivePriority(a) - effectivePriority(b);
      } else if (sortKey === 'created_at') {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = ad - bd;
      } else {
        const av = fieldFor(a, sortKey);
        const bv = fieldFor(b, sortKey);
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, matchedTypes]);

  const hasActiveFilter = Object.values(filters).some(v =>
    Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Numeric/date columns default to desc (newest/highest first);
      // text columns default to asc (alphabetical).
      setSortDir(key === 'created_at' || key === 'priority_score' ? 'desc' : 'asc');
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
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2 border-b border-gray-100 bg-white">
        <div className="text-xs text-gray-600">
          <span className="font-semibold text-gray-900">{sorted.length}</span>
          <span className="text-gray-500"> of </span>
          <span className="font-semibold text-gray-900">{jobs.length}</span>
          <span className="text-gray-500"> {jobs.length === 1 ? 'job' : 'jobs'}</span>
          {hasActiveFilter && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold uppercase tracking-wider">
              Filtered
            </span>
          )}
        </div>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="text-[11px] text-gray-500 hover:text-gray-800 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

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
                  {col.filter === 'text' && (
                    <Input
                      placeholder={`Filter ${col.label.toLowerCase()}…`}
                      value={getText(col.key)}
                      onChange={e => setTextFilter(col.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                  )}
                  {col.filter === 'select-job-type' && (
                    <MultiSelectFilter
                      label={col.label}
                      options={jobTypeSelectOptions.map(o => ({ value: o, label: o }))}
                      values={getMulti(col.key)}
                      onChange={next => setMultiFilter(col.key, next)}
                    />
                  )}
                  {col.filter === 'select-company-type' && (
                    <MultiSelectFilter
                      label={col.label}
                      options={companyTypeOptions.map(o => ({ value: o, label: o }))}
                      values={getMulti(col.key)}
                      onChange={next => setMultiFilter(col.key, next)}
                    />
                  )}
                  {col.filter === 'select-run' && (
                    <MultiSelectFilter
                      label={col.label}
                      options={runOptions.map(r => ({
                        value: r.id,
                        label: fmtDateTime(r.completed_at || r.started_at || ''),
                      }))}
                      values={getMulti(col.key)}
                      onChange={next => setMultiFilter(col.key, next)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(j => {
              const priority = isPriority(j);
              const blocked = !!j._companyIsBlocked;
              const rowBg = blocked
                ? 'bg-gray-100/80 hover:bg-gray-200/80 opacity-70'
                : priority
                  ? 'bg-amber-50/70 hover:bg-amber-100/70'
                  : '';
              const eff = effectivePriority(j);
              return (
                <tr
                  key={j.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${rowBg}`}
                >
                  <td className="px-2 py-2 align-top text-center">
                    <JobPriorityBadge score={eff} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-start gap-1.5">
                      {priority && <Star className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
                      <button
                        type="button"
                        onClick={() => setSelectedJob(j)}
                        className="text-left text-blue-700 hover:text-blue-900 hover:underline font-medium cursor-pointer"
                      >
                        {j.job_title || '(untitled)'}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">
                    {matchedTypes.get(j.id) || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {j.company_name ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            // Prefer the full enriched record; fall back to a
                            // stub so the dialog still opens with name only.
                            setSelectedCompany(j._company || { company_name: j.company_name, company_type: j._companyType, is_high_priority: j._companyIsHighPriority, is_blocked: j._companyIsBlocked });
                          }}
                          className={`text-left hover:underline cursor-pointer truncate ${
                            blocked ? 'text-gray-500 line-through' : 'text-gray-800 hover:text-blue-800'
                          }`}
                        >
                          {j.company_name}
                        </button>
                        {blocked && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex-shrink-0">
                            BLOCKED
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {j._companyType
                      ? <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${companyTypeBadge(j._companyType)}`}>{j._companyType}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
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
                  <td className="px-3 py-2 align-top text-gray-600 whitespace-nowrap">{fmtDateTime(j.created_at)}</td>
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

      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
      <CompanyDetailDialog
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onJobClick={j => { setSelectedCompany(null); setSelectedJob(j as TrackerJobsTableRow); }}
        onDataRefresh={onDataRefresh}
      />
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
                <Field label="Date Found" value={fmtDateTime(job.created_at)} />
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

function CompanyDetailDialog({
  company,
  onClose,
  onJobClick,
  onDataRefresh,
}: {
  company: CompanyRecord | null;
  onClose: () => void;
  onJobClick: (job: unknown) => void;
  onDataRefresh?: () => void;
}) {
  const { toast } = useToast();
  const [blockBusy, setBlockBusy] = useState(false);
  const isBlocked = !!company?.is_blocked;

  const toggleBlocked = async () => {
    if (!company?.id) {
      toast({ title: 'Cannot update company', description: 'Missing company id', variant: 'destructive' });
      return;
    }
    const next = !isBlocked;
    setBlockBusy(true);
    const { error } = await supabase
      .from('marketing_companies')
      .update({ is_blocked: next })
      .eq('id', company.id);
    setBlockBusy(false);
    if (error) {
      toast({ title: `Failed to ${next ? 'block' : 'unblock'} company`, description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: next ? 'Company blocked' : 'Company unblocked',
      description: next
        ? `${company.company_name} will be hidden from the jobs table and skipped on future scrapes.`
        : `${company.company_name} will be scraped again and shown in the jobs table.`,
    });
    onClose();
    onDataRefresh?.();
  };
  const openJobs = company?.openJobs || [];
  const contacts = company?.companyContacts || [];
  const newJobs = company?.newJobs || [];
  const recentContacts = company?.recentContacts || [];
  const openCount = openJobs.length || (company?.open_roles_count as number) || 0;
  const contactCount = contacts.length || (company?.contact_count as number) || 0;
  const careersUrl =
    company?.careers_url
    && company.careers_url.startsWith('http')
    && !company.careers_url.includes('google.com/search')
    && !company.careers_url.includes('indeed.com')
    && !company.careers_url.includes('linkedin.com')
    && !company.careers_url.includes('?q=')
      ? company.careers_url
      : '';

  return (
    <Dialog open={!!company} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {company && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-6">
                {company.is_high_priority && <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                <span>{company.company_name || '(unnamed)'}</span>
                {company.has_md_cmo && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">MD/CMO</span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {company.company_type && (
                  <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${companyTypeBadge(company.company_type)}`}>
                    {company.company_type}
                  </span>
                )}
                {company.isNewCompany && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">New Company</span>
                )}
                {newJobs.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                    {newJobs.length} New Role{newJobs.length !== 1 ? 's' : ''}
                  </span>
                )}
                {recentContacts.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                    {recentContacts.length} New Contact{recentContacts.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={<Briefcase className="w-4 h-4 text-blue-600" />} label="Open Roles" value={openCount} />
                <StatCard icon={<Users className="w-4 h-4 text-green-600" />} label="Contacts" value={contactCount} />
              </div>

              {openJobs.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                    Open Roles ({openJobs.length})
                  </div>
                  <div className="space-y-1 max-h-[28vh] overflow-y-auto pr-1">
                    {openJobs.map(j => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => onJobClick({ ...j, _company: company, _companyType: company.company_type, _companyIsHighPriority: company.is_high_priority, company_name: company.company_name })}
                        className={`w-full text-left flex items-center justify-between text-xs rounded px-2 py-1.5 border transition-colors ${
                          j.is_net_new
                            ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                            : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {j.is_net_new && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                          <span className="truncate text-gray-800 font-medium">{j.job_title}</span>
                          {j.city && j.state && <span className="text-gray-400 flex-shrink-0 hidden sm:inline">· {j.city}, {j.state}</span>}
                          {j.url_status === 'live' && <ShieldCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" aria-label="Verified live" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {contacts.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
                    Contacts ({contacts.length})
                  </div>
                  <div className="space-y-1 max-h-[22vh] overflow-y-auto pr-1">
                    {contacts.map(ct => {
                      const isRecent = recentContacts.some(rc => rc.id === ct.id);
                      return (
                        <div
                          key={ct.id}
                          className={`flex items-center justify-between text-xs rounded px-2 py-1.5 border ${
                            isRecent ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-800">{ct.first_name} {ct.last_name}</span>
                            {ct.title && <span className="text-gray-500 ml-1">· {ct.title}</span>}
                          </div>
                          {isRecent && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-200 text-green-800 font-semibold flex-shrink-0">NEW</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isBlocked && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <Ban className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    This company is <strong>blocked</strong>. It's hidden from the jobs table by default and will be skipped on future scrapes.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 flex-wrap">
                {openCount > 0 && company.company_name && (
                  <a
                    href={googleJobsSearchForCompany(company.company_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-medium"
                  >
                    <Globe className="w-3 h-3" /> Search All Jobs
                  </a>
                )}
                {careersUrl && (
                  <a
                    href={careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium"
                  >
                    <ExternalLink className="w-3 h-3" /> Careers Page
                  </a>
                )}

                <div className="ml-auto">
                  <button
                    type="button"
                    disabled={blockBusy}
                    onClick={toggleBlocked}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
                      isBlocked
                        ? 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
                        : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200'
                    }`}
                  >
                    {blockBusy
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : isBlocked
                        ? <Undo2 className="w-3 h-3" />
                        : <Ban className="w-3 h-3" />}
                    {isBlocked ? 'Unblock company' : 'Block company'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    values.length === 0
      ? `All ${label.toLowerCase()}`
      : values.length === 1
        ? (options.find(o => o.value === values[0])?.label || '1 selected')
        : `${values.length} of ${options.length} selected`;

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 w-full text-xs text-left rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between gap-1"
        >
          <span className={`truncate ${values.length === 0 ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
            {summary}
          </span>
          <ChevronDown className="w-3 h-3 flex-shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <div className="p-2 border-b text-[11px] text-gray-500 flex items-center justify-between">
          <span>{values.length} selected</span>
          {values.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-blue-600 hover:underline">
              Clear
            </button>
          )}
        </div>
        <div className="max-h-[40vh] overflow-y-auto py-1">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No options</div>
          )}
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="w-3.5 h-3.5 rounded border-gray-300"
              />
              <span className="truncate flex-1">{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
