import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Star,
  Briefcase, Users, Globe, ShieldCheck,
} from 'lucide-react';

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
  _company?: CompanyRecord;
  [k: string]: unknown;
}

export interface CompanyRecord {
  id?: string;
  company_name?: string;
  company_type?: string;
  is_high_priority?: boolean;
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
  | 'job_title'
  | 'job_type'
  | 'company_name'
  | 'company_type'
  | 'city'
  | 'state'
  | 'source'
  | 'created_at';
type SortDir = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'job_title',    label: 'Job Title',    className: 'w-[21%]' },
  { key: 'job_type',     label: 'Job Type',     className: 'w-[12%]' },
  { key: 'company_name', label: 'Company',      className: 'w-[17%]' },
  { key: 'company_type', label: 'Company Type', className: 'w-[12%]' },
  { key: 'city',         label: 'City',         className: 'w-[10%]' },
  { key: 'state',        label: 'State',        className: 'w-[6%]' },
  { key: 'source',       label: 'Source',       className: 'w-[10%]' },
  { key: 'created_at',   label: 'Date Found',   className: 'w-[12%]' },
];

// Cleaner label from the tracker's internal source tags.
function sourceLabel(j: TrackerJobsTableRow): string {
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

function sourceUrl(j: TrackerJobsTableRow): string {
  return j.job_url || j.google_jobs_url || j.indeed_url || j.linkedin_url || '';
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Extract the filterable/sortable string for a given column from a row.
function rowFieldForKey(j: TrackerJobsTableRow, key: SortKey): string {
  switch (key) {
    case 'source':       return sourceLabel(j);
    case 'created_at':   return fmtDate(j.created_at);
    case 'company_type': return String(j._companyType ?? '');
    default:             return String((j as Record<string, unknown>)[key] ?? '');
  }
}

// Company-type chip colors — mirrors what v151 tiles used.
function companyTypeBadge(cat?: string): string {
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

export function TrackerJobsTable({ jobs }: { jobs: TrackerJobsTableRow[] }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedJob, setSelectedJob] = useState<TrackerJobsTableRow | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRecord | null>(null);

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      for (const [key, val] of Object.entries(filters)) {
        if (!val) continue;
        const needle = val.toLowerCase();
        if (!rowFieldForKey(j, key as SortKey).toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [jobs, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created_at') {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = ad - bd;
      } else {
        const av = rowFieldForKey(a, sortKey);
        const bv = rowFieldForKey(b, sortKey);
        cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
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
                        onClick={() => setSelectedJob(j)}
                        className="text-left text-blue-700 hover:text-blue-900 hover:underline font-medium cursor-pointer"
                      >
                        {j.job_title || '(untitled)'}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-gray-700">{j.job_type || '—'}</td>
                  <td className="px-3 py-2 align-top">
                    {j.company_name ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Prefer the full enriched record; fall back to a
                          // stub so the dialog still opens with name only.
                          setSelectedCompany(j._company || { company_name: j.company_name, company_type: j._companyType, is_high_priority: j._companyIsHighPriority });
                        }}
                        className="text-left text-gray-800 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {j.company_name}
                      </button>
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

      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
      <CompanyDetailDialog
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onJobClick={j => { setSelectedCompany(null); setSelectedJob(j as TrackerJobsTableRow); }}
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

function CompanyDetailDialog({
  company,
  onClose,
  onJobClick,
}: {
  company: CompanyRecord | null;
  onClose: () => void;
  onJobClick: (job: unknown) => void;
}) {
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

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}
