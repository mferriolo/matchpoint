import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, MapPin,
  Download, Loader2, X, Archive, RotateCcw, Filter, ShieldCheck,
  CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, Trash2,
  Link2, Star, Zap, Building2, Briefcase, Ban, Eye, EyeOff, Pencil,
  Calendar, FileText, Minus
} from 'lucide-react';



import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { MultiSelectColumnHeader } from './MultiSelectColumnHeader';
import { sourceLabel, sourceUrl, fmtDateTime, companyTypeBadge, matchJobType } from './TrackerJobsTable';
import JobPriorityBadge from './JobPriorityBadge';
import { priorityScore } from '@/lib/jobPriorityScore';
import EditJobModal, { EditJobRow } from './EditJobModal';
import { useToast } from '@/hooks/use-toast';

interface JobsTabContentProps {
  jobs: any[];
  companies?: any[];
  loading: boolean;
  onRefresh: () => void;
}

// Sort keys mirror the Tracker's jobs table. Legacy keys (job_category,
// location, job_url, has_description, date_posted, high_priority) have
// been dropped in favor of the Tracker's column shape.
type SortField = 'priority_score' | 'job_title' | 'job_type' | 'company_name' | 'company_type' | 'city' | 'state' | 'source' | 'date_posted' | 'created_at';

type SortDir = 'asc' | 'desc';

const JOB_TYPE_OPTIONS = ['All', 'CMO', 'Medical Director', 'PCP', 'APP', 'Other'];

const CATEGORY_OPTIONS = [
  'All',
  'Value Based Care (VBC)',
  'PACE Medical Groups',
  'Health Plans',
  'Health Systems',
  'Hospitals',
  'FQHC',
  'All Others'
];

const categoryBadge = (cat: string) => {
  const colors: Record<string, string> = {
    'Value Based Care (VBC)': 'bg-blue-100 text-blue-800',
    'PACE Medical Groups': 'bg-purple-100 text-purple-800',
    'Health Plans': 'bg-green-100 text-green-800',
    'Health Systems': 'bg-orange-100 text-orange-800',
    'Hospitals': 'bg-red-100 text-red-800',
    'FQHC': 'bg-teal-100 text-teal-800',
    'All Others': 'bg-gray-100 text-gray-800'
  };
  return colors[cat] || 'bg-gray-100 text-gray-800';
};

function classifyJobType(title: string, jobType: string): 'CMO' | 'Medical Director' | 'PCP' | 'APP' | 'Other' {
  const t = `${title} ${jobType}`.toUpperCase();
  if (t.includes('CMO') || t.includes('CHIEF MEDICAL OFFICER') || t.includes('CHIEF MEDICAL')) return 'CMO';
  if (t.includes('MEDICAL DIRECTOR')) return 'Medical Director';
  if (t.includes('PCP') || t.includes('PRIMARY CARE PHYSICIAN') || t.includes('PRIMARY CARE')) return 'PCP';
  if (
    t.includes('APP') ||
    t.includes('ADVANCED PRACTICE') ||
    t.includes('ADVANCED PRACTITIONER') ||
    t.includes('NURSE PRACTITIONER') ||
    t.includes('(NP)') ||
    t.includes('NP/PA') ||
    t.includes('PHYSICIAN ASSISTANT') ||
    t.includes('(PA)')
  ) return 'APP';
  return 'Other';
}

const jobTypeBadgeColor = (classified: string) => {
  switch (classified) {
    case 'CMO': return 'bg-rose-100 text-rose-800';
    case 'Medical Director': return 'bg-indigo-100 text-indigo-800';
    case 'PCP': return 'bg-emerald-100 text-emerald-800';
    case 'APP': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-700';
  }
};

// ---- URL field helpers ----
function getDirectJobUrl(job: any): string {
  if (job.job_url && job.job_url.trim()) return job.job_url.trim();
  if (job.website_source && job.website_source.trim()) return job.website_source.trim();
  return '';
}


const isJobOpen = (j: any) => !j.is_closed && j.status !== 'Closed';





// ---- Scrub types (server-side queue-based) ----
interface ScrubResult {
  id: string;
  job_title: string;
  company_name: string;
  is_live: boolean;
  ai_says_live?: boolean;
  has_direct_url?: boolean;
  details: string;
  source: string;
  found_url?: string;
  candidate_urls?: string[];
  search_mode?: string;
  serp_jobs_found?: number;
  serp_matching_jobs?: number;
}

interface ScrubSummary {
  totalProcessed: number;
  liveCount: number;
  deadCount: number;
  noUrlClosedCount: number;
  errorCount: number;
  urlsFound: number;
  closedIds: string[];
  results: ScrubResult[];
  searchMode: string;
  serpSearchCount: number;
}

// Edge function processes BATCH_SIZE items in parallel per call. We
// keep INTER_JOB_DELAY_MS small — it exists only to yield to the event
// loop / UI, since rate-limiting is now handled by the function-side
// concurrency cap. With BATCH_SIZE=8 a 100-job sweep does ~13 calls,
// each taking ~5–10s in parallel rather than 100 sequential calls.
const SCRUB_BATCH_SIZE = 8;
const INTER_JOB_DELAY_MS = 50;
const MAX_CONSECUTIVE_ERRORS = 10; // Stop if too many consecutive errors



// ---- Main Component ----

const JobsTabContent: React.FC<JobsTabContentProps> = ({ jobs, companies = [], loading, onRefresh }) => {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<'open' | 'closed'>('open');
  const [searchTerm, setSearchTerm] = useState('');
  // Default sort matches the Tracker: most recently found first.
  // Default sort is by priority — hottest jobs first.
  const [sortField, setSortField] = useState<SortField>('priority_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [movingJobId, setMovingJobId] = useState<string | null>(null);
  const [togglingPriorityId, setTogglingPriorityId] = useState<string | null>(null);
  const [filterHighPriority, setFilterHighPriority] = useState(false);

  // Tracker uses user-configured job_types (from the `job_types` table)
  // instead of the Jobs tab's legacy five-bucket classifier. Load them
  // once so Job Type matching mirrors the Tracker exactly; fall back to
  // an empty list when the table is empty or unavailable (matchJobType
  // returns '' in that case and the cell shows —).
  const [jobTypeOptions, setJobTypeOptions] = useState<string[]>([]);
  useEffect(() => {
    supabase.from('job_types').select('name').then(({ data }) => {
      if (data) setJobTypeOptions(data.map((r: any) => r.name).filter(Boolean));
    });
  }, []);

  // Column filters. Multi-select: empty set == "no filter applied" (all
  // values pass). Any non-empty set restricts the column to the listed
  // values via .has() checks below. Key names mirror Tracker columns:
  // company_type, city, state, source, created_at (plus job_title /
  // job_type / company_name for overlap).
  const [filterCompanyType, setFilterCompanyType] = useState<Set<string>>(new Set());
  const [filterJobType, setFilterJobType] = useState<Set<string>>(new Set());
  const [filterJobTitle, setFilterJobTitle] = useState<Set<string>>(new Set());
  const [filterCompany, setFilterCompany] = useState<Set<string>>(new Set());
  const [filterCity, setFilterCity] = useState<Set<string>>(new Set());
  const [filterState, setFilterState] = useState<Set<string>>(new Set());
  const [filterSource, setFilterSource] = useState<Set<string>>(new Set());

  // Dropdown open state is managed inside each MultiSelectColumnHeader
  // via Radix Popover — no parent-level coordination needed.

  // Scrub state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState(0);
  const [scrubTotal, setScrubTotal] = useState(0);
  const [scrubCurrentJob, setScrubCurrentJob] = useState('');
  const [scrubBatchNum, setScrubBatchNum] = useState(0);
  const [scrubTotalBatches, setScrubTotalBatches] = useState(0);
  const [scrubLiveRunning, setScrubLiveRunning] = useState(0);
  const [scrubDeadRunning, setScrubDeadRunning] = useState(0);
  const [scrubErrorRunning, setScrubErrorRunning] = useState(0);
  const [scrubUrlsFound, setScrubUrlsFound] = useState(0);
  const scrubAbortRef = useRef(false);

  // Results dialog
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [scrubSummary, setScrubSummary] = useState<ScrubSummary | null>(null);
  const [showDetailedResults, setShowDetailedResults] = useState(false);

  // Confirm dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Multi-select + blocking state. Selected rows are tracked by id; the
  // bulk action bar appears when >0 are selected. Blocked rows are hidden
  // from the table by default; the scraper consults marketing_jobs.is_blocked
  // to skip these on future runs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBlocked, setShowBlocked] = useState(false);

  // Inline edit of job_type. Only one row can be in edit mode at a time;
  // editingJobTypeId === j.id swaps the Job Type cell into a <select>.
  // Choices match JOB_TYPE_OPTIONS (minus the 'All' filter sentinel).
  const [editingJobTypeId, setEditingJobTypeId] = useState<string | null>(null);
  const JOB_TYPE_EDIT_OPTIONS = JOB_TYPE_OPTIONS.filter(o => o !== 'All');

  // Per-job detail dialog. viewingJobId === id renders <JobDetailDialog>
  // showing every field on the row including the full description text.
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<EditJobRow | null>(null);
  const viewingJob = viewingJobId ? jobs.find(j => j.id === viewingJobId) : null;


  // Enrich each job with company-level fields the Tracker table
  // expects (_companyType, _companyIsBlocked, _companyIsHighPriority)
  // by looking it up in the companies prop. Looks up by company_id
  // first, falls back to case-insensitive company_name so older rows
  // without an FK still get enriched. `matchedType` is the job_title
  // → tracked-role match (mirrors the Tracker's matching).
  const enrichedJobs = useMemo(() => {
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const co of companies) {
      if (co?.id) byId.set(co.id, co);
      if (co?.company_name) byName.set(String(co.company_name).toLowerCase().trim(), co);
    }
    return jobs.map(j => {
      const co = (j.company_id && byId.get(j.company_id)) ||
                 (j.company_name && byName.get(String(j.company_name).toLowerCase().trim())) ||
                 null;
      const companyType = co?.company_type || null;
      // Trust the SQL-computed priority_score when present; otherwise
      // compute on the fly so newly-inserted rows still rank correctly.
      const eff = typeof j.priority_score === 'number'
        ? j.priority_score
        : priorityScore({ datePosted: j.date_posted, lastSeenAt: j.last_seen_at, createdAt: j.created_at, jobTitle: j.job_title, companyType }).total;
      return {
        ...j,
        _companyType: companyType,
        _companyIsBlocked: !!co?.is_blocked,
        _companyIsHighPriority: !!co?.is_high_priority,
        _matchedJobType: matchJobType(j.job_title, jobTypeOptions),
        _priorityScore: eff,
      };
    });
  }, [jobs, companies, jobTypeOptions]);

  // Derive unique values for filter dropdowns. No 'All' sentinel: the
  // multi-select checkbox list uses an empty set to mean "no filter".
  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j.company_name) set.add(j.company_name); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueJobTitles = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j.job_title) set.add(j.job_title); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueCompanyTypes = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j._companyType) set.add(j._companyType); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueJobTypes = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j._matchedJobType) set.add(j._matchedJobType); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueCities = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j.city) set.add(j.city); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueStates = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { if (j.state) set.add(j.state); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  const uniqueSources = useMemo(() => {
    const set = new Set<string>();
    enrichedJobs.forEach(j => { const s = sourceLabel(j); if (s && s !== '—') set.add(s); });
    return Array.from(set).sort();
  }, [enrichedJobs]);

  // Split jobs into open and closed
  const openJobs = useMemo(() => enrichedJobs.filter(isJobOpen), [enrichedJobs]);
  const closedJobs = useMemo(() => enrichedJobs.filter(j => !isJobOpen(j)), [enrichedJobs]);

  const baseJobs = subTab === 'open' ? openJobs : closedJobs;

  // Count high priority jobs in the current tab. Matches Tracker:
  // either a job's own high_priority OR its company's is_high_priority
  // (on the enriched row) counts.
  const highPriorityCount = useMemo(
    () => baseJobs.filter((j: any) => j.high_priority || j._companyIsHighPriority).length,
    [baseJobs]
  );

  // Apply filters and search
  const filteredJobs = useMemo(() => {
    return baseJobs.filter((j: any) => {
      // Block filter: hide blocked rows unless the user explicitly opts in.
      if (!showBlocked && (j.is_blocked || j._companyIsBlocked)) return false;
      // High priority quick-filter (job-level OR company-level, matching Tracker).
      if (filterHighPriority && !(j.high_priority || j._companyIsHighPriority)) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesSearch =
          (j.company_name || '').toLowerCase().includes(s) ||
          (j.job_title || '').toLowerCase().includes(s) ||
          (j._matchedJobType || '').toLowerCase().includes(s) ||
          (j._companyType || '').toLowerCase().includes(s) ||
          (j.city || '').toLowerCase().includes(s) ||
          (j.state || '').toLowerCase().includes(s) ||
          sourceLabel(j).toLowerCase().includes(s);
        if (!matchesSearch) return false;
      }
      if (filterCompanyType.size > 0 && !filterCompanyType.has(j._companyType || '')) return false;
      if (filterJobTitle.size > 0 && !filterJobTitle.has(j.job_title || '')) return false;
      if (filterJobType.size > 0 && !filterJobType.has(j._matchedJobType || '')) return false;
      if (filterCompany.size > 0 && !filterCompany.has(j.company_name || '')) return false;
      if (filterCity.size > 0 && !filterCity.has(j.city || '')) return false;
      if (filterState.size > 0 && !filterState.has(j.state || '')) return false;
      if (filterSource.size > 0 && !filterSource.has(sourceLabel(j))) return false;
      return true;
    });
  }, [baseJobs, searchTerm, filterCompanyType, filterJobType, filterJobTitle, filterCompany, filterCity, filterState, filterSource, filterHighPriority, showBlocked]);


  // Sort
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a: any, b: any) => {
      // Manual high_priority pins to the top regardless of sort key.
      const aP = (a.high_priority || a._companyIsHighPriority) ? 1 : 0;
      const bP = (b.high_priority || b._companyIsHighPriority) ? 1 : 0;
      if (aP !== bP) return bP - aP;

      if (sortField === 'priority_score') {
        const cmp = (a._priorityScore || 0) - (b._priorityScore || 0);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      // Numeric sort for created_at (oldest first when asc).
      if (sortField === 'created_at') {
        const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
        const cmp = aT - bT;
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortField === 'date_posted') {
        const aT = a.date_posted ? new Date(a.date_posted).getTime() : 0;
        const bT = b.date_posted ? new Date(b.date_posted).getTime() : 0;
        const cmp = aT - bT;
        return sortDir === 'asc' ? cmp : -cmp;
      }

      let aVal = '';
      let bVal = '';
      switch (sortField) {
        case 'company_name': aVal = a.company_name || ''; bVal = b.company_name || ''; break;
        case 'company_type': aVal = a._companyType || ''; bVal = b._companyType || ''; break;
        case 'job_title': aVal = a.job_title || ''; bVal = b.job_title || ''; break;
        case 'job_type': aVal = a._matchedJobType || ''; bVal = b._matchedJobType || ''; break;
        case 'city': aVal = a.city || ''; bVal = b.city || ''; break;
        case 'state': aVal = a.state || ''; bVal = b.state || ''; break;
        case 'source': aVal = sourceLabel(a); bVal = sourceLabel(b); break;
      }
      const cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredJobs, sortField, sortDir]);

  // Block-aware derived counts and select-all helper.
  const blockedInTab = useMemo(() => baseJobs.filter(j => j.is_blocked).length, [baseJobs]);
  const allVisibleSelected = sortedJobs.length > 0 && sortedJobs.every(j => selectedIds.has(j.id));
  const toggleSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedJobs.map(j => j.id)));
    }
  }, [allVisibleSelected, sortedJobs]);


  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Move job to closed or reopen
  const handleMoveJob = useCallback(async (jobId: string, close: boolean) => {
    setMovingJobId(jobId);
    try {
      const { error } = await supabase
        .from('marketing_jobs')
        .update({
          is_closed: close,
          status: close ? 'Closed' : 'Open',
          closed_at: close ? new Date().toISOString() : null,
          closed_reason: close ? 'Manually closed' : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
      if (error) throw error;
      toast({ title: close ? 'Job moved to Closed' : 'Job reopened' });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error updating job', description: err.message, variant: 'destructive' });
    } finally {
      setMovingJobId(null);
    }
  }, [toast, onRefresh]);

  // Toggle high priority
  const handleTogglePriority = useCallback(async (jobId: string, currentPriority: boolean) => {
    setTogglingPriorityId(jobId);
    try {
      const { error } = await supabase
        .from('marketing_jobs')
        .update({ high_priority: !currentPriority, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) throw error;
      toast({ title: !currentPriority ? 'Marked as High Priority' : 'Priority removed' });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error updating priority', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingPriorityId(null);
    }
  }, [toast, onRefresh]);

  // ---------- Selection + blocking ----------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleToggleBlock = useCallback(async (jobId: string, currentlyBlocked: boolean) => {
    try {
      // Block also marks the job as Closed so it disappears from the open
      // list (it's effectively dead to the user). Unblock reverses both.
      const now = new Date().toISOString();
      const update: Record<string, any> = currentlyBlocked
        ? { is_blocked: false, is_closed: false, status: 'Open', closed_at: null, closed_reason: null, updated_at: now }
        : { is_blocked: true, is_closed: true, status: 'Closed', closed_at: now, closed_reason: 'Manually blocked', updated_at: now };
      const { error } = await supabase.from('marketing_jobs').update(update).eq('id', jobId);
      if (error) throw error;
      toast({ title: currentlyBlocked ? 'Job unblocked & reopened' : 'Job blocked & marked Closed' });
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error updating block flag', description: err.message, variant: 'destructive' });
    }
  }, [toast, onRefresh]);

  const handleBulkBlock = useCallback(async (block: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const now = new Date().toISOString();
      const update: Record<string, any> = block
        ? { is_blocked: true, is_closed: true, status: 'Closed', closed_at: now, closed_reason: 'Manually blocked', updated_at: now }
        : { is_blocked: false, is_closed: false, status: 'Open', closed_at: null, closed_reason: null, updated_at: now };
      const { error } = await supabase.from('marketing_jobs').update(update).in('id', ids);
      if (error) throw error;
      toast({ title: block ? `${ids.length} job(s) blocked & closed` : `${ids.length} job(s) unblocked & reopened` });
      clearSelection();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error updating jobs', description: err.message, variant: 'destructive' });
    }
  }, [selectedIds, toast, onRefresh, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected job(s)? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase.from('marketing_jobs').delete().in('id', ids);
      if (error) throw error;
      toast({ title: `${ids.length} job(s) deleted` });
      clearSelection();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error deleting jobs', description: err.message, variant: 'destructive' });
    }
  }, [selectedIds, toast, onRefresh, clearSelection]);

  const handleSaveJobType = useCallback(async (id: string, newType: string) => {
    try {
      const { error } = await supabase.from('marketing_jobs')
        .update({ job_type: newType, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Job type updated' });
      setEditingJobTypeId(null);
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Error updating job type', description: err.message, variant: 'destructive' });
    }
  }, [toast, onRefresh]);


  // Export to CSV — columns mirror the visible Tracker-style layout.
  const handleExportCSV = useCallback(() => {
    const headers = ['Priority', 'Job Title', 'Job Type', 'Company', 'Company Type', 'City', 'State', 'Source', 'Source URL', 'Date Posted', 'Date Found', 'High Priority'];
    const rows = sortedJobs.map((j: any) => [
      typeof j._priorityScore === 'number' ? Math.round(j._priorityScore).toString() : '',
      j.job_title || '',
      j._matchedJobType || '',
      j.company_name || '',
      j._companyType || '',
      j.city || '',
      j.state || '',
      sourceLabel(j),
      sourceUrl(j),
      j.date_posted || '',
      j.created_at || '',
      (j.high_priority || j._companyIsHighPriority) ? 'Yes' : 'No',
    ]);


    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `${subTab === 'open' ? 'Open' : 'Closed'}_Jobs_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exported', description: `${sortedJobs.length} jobs exported` });
  }, [sortedJobs, subTab, toast]);

  // ---- SCRUB DEAD LINKS (Queue-based architecture via Edge Function) ----
  const scrubRunIdRef = useRef<string | null>(null);

  const handleScrubDeadLinks = async () => {
    setShowConfirmDialog(false);
    setIsScrubbing(true);
    scrubAbortRef.current = false;

    const jobsToCheck = openJobs;
    const totalJobs = jobsToCheck.length;

    setScrubTotal(totalJobs);
    setScrubProgress(0);
    setScrubTotalBatches(totalJobs);
    setScrubBatchNum(0);
    setScrubLiveRunning(0);
    setScrubDeadRunning(0);
    setScrubErrorRunning(0);
    setScrubUrlsFound(0);
    setScrubCurrentJob('Queuing jobs...');

    const allResults: ScrubResult[] = [];
    let liveCount = 0;
    let deadCount = 0;
    let errorCount = 0;
    let consecutiveErrors = 0;
    let urlsFoundCount = 0;
    const closedIds: string[] = [];

    // Step 1: Enqueue all jobs
    try {
      const { data: enqueueData, error: enqueueError } = await supabase.functions.invoke('verify-job-links', {
        body: {
          action: 'enqueue',
          jobs: jobsToCheck.map(j => ({
            id: j.id,
            job_title: j.job_title,
            company_name: j.company_name,
            city: j.city,
            state: j.state,
            job_url: j.job_url || j.website_source || null,
          }))
        }
      });

      if (enqueueError || !enqueueData?.run_id) {
        toast({
          title: 'Failed to start scrub',
          description: enqueueError?.message || 'No run_id returned',
          variant: 'destructive'
        });
        setIsScrubbing(false);
        return;
      }

      const runId = enqueueData.run_id;
      scrubRunIdRef.current = runId;
      console.log(`Scrub queued: run_id=${runId}, ${enqueueData.total_queued} jobs`);
      setScrubCurrentJob('Processing...');
    } catch (err: any) {
      toast({
        title: 'Failed to start scrub',
        description: err.message || 'Network error',
        variant: 'destructive'
      });
      setIsScrubbing(false);
      return;
    }

    // Step 2: Process jobs by calling process-next in a loop. Each call
    // claims SCRUB_BATCH_SIZE pending items and runs them in parallel
    // server-side, so one HTTP round trip handles a batch of jobs.
    let processed = 0;
    while (!scrubAbortRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke('verify-job-links', {
          body: { action: 'process-next', run_id: scrubRunIdRef.current, batch_size: SCRUB_BATCH_SIZE }
        });

        if (error) {
          console.error('process-next error:', error);
          errorCount++;
          consecutiveErrors++;
          setScrubErrorRunning(errorCount);

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            toast({
              title: 'Scrub stopped',
              description: `Too many consecutive errors (${MAX_CONSECUTIVE_ERRORS}). Stopping.`,
              variant: 'destructive'
            });
            break;
          }
          // Brief delay before retry
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        // Check if we're done
        if (data?.done) {
          console.log('All jobs processed');
          break;
        }

        // Reset consecutive error counter on success
        consecutiveErrors = 0;

        // results[] (batch) is the new shape; result (singleton) is kept
        // for back-compat in case the caller is on an older edge build.
        const batchResults: any[] = Array.isArray(data?.results)
          ? data.results
          : (data?.result ? [data.result] : []);

        for (const result of batchResults) {
          processed++;
          allResults.push(result);
          setScrubBatchNum(processed);
          setScrubCurrentJob(`${result.company_name || 'Unknown'} — ${result.job_title || 'Unknown'}`);

          if (result.source === 'error' || result.source === 'ai_failed' || result.source === 'config_error') {
            errorCount++;
            setScrubErrorRunning(errorCount);
          } else if (result.is_live) {
            liveCount++;
            setScrubLiveRunning(liveCount);
            if (result.found_url) {
              urlsFoundCount++;
              setScrubUrlsFound(urlsFoundCount);
            }
          } else {
            deadCount++;
            setScrubDeadRunning(deadCount);
            closedIds.push(result.id);
          }
        }

        setScrubProgress(processed);

        // Tiny yield so the UI can repaint between batches.
        if (!scrubAbortRef.current) {
          await new Promise(r => setTimeout(r, INTER_JOB_DELAY_MS));
        }
      } catch (err: any) {
        console.error('Error in process-next loop:', err);
        errorCount++;
        consecutiveErrors++;
        setScrubErrorRunning(errorCount);

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          toast({
            title: 'Scrub stopped',
            description: `Too many consecutive errors. Stopping.`,
            variant: 'destructive'
          });
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Step 3: Cleanup queue
    if (scrubRunIdRef.current) {
      try {
        await supabase.functions.invoke('verify-job-links', {
          body: { action: 'cleanup', run_id: scrubRunIdRef.current }
        });
      } catch (e) {
        console.warn('Queue cleanup failed:', e);
      }
      scrubRunIdRef.current = null;
    }

    // Done
    if (scrubAbortRef.current) {
      toast({ title: 'Scrub cancelled', description: `Stopped after processing ${processed} of ${totalJobs} jobs` });
    }

    setIsScrubbing(false);
    const noUrlClosedCount = allResults.filter(r => r.ai_says_live && !r.has_direct_url && !r.is_live).length;
    const serpCount = allResults.filter(r => r.search_mode === 'serp_api+ai' || r.source === 'serp_verified').length;
    const detectedMode = serpCount > 0 ? 'serp_api+ai' : 'ai_only';
    const summary: ScrubSummary = {
      totalProcessed: allResults.length,
      liveCount,
      deadCount,
      noUrlClosedCount,
      errorCount,
      urlsFound: urlsFoundCount,
      closedIds,
      results: allResults,
      searchMode: detectedMode,
      serpSearchCount: serpCount,
    };
    setScrubSummary(summary);
    setShowResultsDialog(true);
    onRefresh();

  };

  const handleCancelScrub = () => {
    scrubAbortRef.current = true;
  };




  // Active filter count — counts each column that has at least one value
  // selected (not the total number of selected values across columns).
  const activeFilterCount = [filterCompanyType, filterJobType, filterJobTitle, filterCompany, filterCity, filterState, filterSource].filter(s => s.size > 0).length;

  const clearAllFilters = () => {
    setFilterCompanyType(new Set());
    setFilterJobType(new Set());
    setFilterJobTitle(new Set());
    setFilterCompany(new Set());
    setFilterCity(new Set());
    setFilterState(new Set());
    setFilterSource(new Set());
    setFilterHighPriority(false);
    setSearchTerm('');
  };


  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 flex-shrink-0" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />;
  };




  // Progress percentage
  const progressPercent = scrubTotal > 0 ? Math.round((scrubProgress / scrubTotal) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border shadow-sm flex flex-col">
      {/* Top toolbar */}
      <div className="p-4 border-b flex items-center gap-3 flex-wrap">
        {/* Sub-tabs */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 mr-2">
          <button
            onClick={() => setSubTab('open')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === 'open' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Open Jobs
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${subTab === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
              {openJobs.length}
            </span>
          </button>
          <button
            onClick={() => setSubTab('closed')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === 'closed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Closed Jobs
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${subTab === 'closed' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-500'}`}>
              {closedJobs.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by company, title, type, location..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Active filter indicator */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-red-50 text-[#911406] border border-red-200 hover:bg-red-100 transition-colors font-medium"
          >
            <Filter className="w-3 h-3" />
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            <X className="w-3 h-3" />
          </button>
        )}

        {/* High Priority Quick Filter */}
        <button
          onClick={() => setFilterHighPriority(prev => !prev)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-all ${
            filterHighPriority
              ? 'bg-yellow-100 text-yellow-800 border-yellow-400 shadow-sm ring-1 ring-yellow-300'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300'
          }`}
          title={filterHighPriority ? 'Show all jobs' : 'Show only high priority jobs'}
        >
          <Star
            className="w-3.5 h-3.5"
            fill={filterHighPriority ? 'currentColor' : 'none'}
            strokeWidth={filterHighPriority ? 0 : 1.5}
          />
          High Priority
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            filterHighPriority
              ? 'bg-yellow-200 text-yellow-900'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {highPriorityCount}
          </span>
        </button>

        <span className="text-sm text-gray-500">
          {sortedJobs.length} of {baseJobs.length} jobs
          {blockedInTab > 0 && !showBlocked && <span className="text-gray-400"> ({blockedInTab} blocked hidden)</span>}
        </span>

        {/* Show / Hide Blocked toggle */}
        <button
          type="button"
          onClick={() => setShowBlocked(s => !s)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
          title={showBlocked ? 'Hide blocked jobs' : 'Show blocked jobs'}
        >
          {showBlocked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showBlocked ? 'Hide blocked' : 'Show blocked'}
        </button>

        {/* Scrub Dead Links Button */}
        {subTab === 'open' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfirmDialog(true)}
            disabled={isScrubbing || openJobs.length === 0}
            className="gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50 hover:text-orange-800 hover:border-orange-400"
          >
            <Trash2 className="w-4 h-4" />
            Scrub Dead Links
          </Button>
        )}

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="gap-1.5 text-gray-600 hover:text-[#911406] hover:border-[#911406]/30"
          disabled={sortedJobs.length === 0}
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Bulk action bar — visible only when 1+ rows are selected */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2 border-b bg-amber-50 border-amber-200 flex items-center gap-2">
          <span className="text-sm font-medium text-amber-900">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleBulkBlock(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
              title="Block selected from future scraper runs"
            >
              <Ban className="w-3.5 h-3.5" /> Block
            </button>
            <button
              type="button"
              onClick={() => handleBulkBlock(false)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              title="Unblock selected"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Unblock
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-200 bg-white hover:bg-red-50 text-red-700"
              title="Delete selected permanently"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded text-gray-500 hover:bg-amber-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Scrub Progress Bar */}
      {isScrubbing && (
        <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
              <span className="text-sm font-medium text-orange-800">
                Verifying Jobs — Job {scrubBatchNum} of {scrubTotalBatches}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-700">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {scrubLiveRunning} live
                </span>
                <span className="flex items-center gap-1 text-red-700">
                  <XCircle className="w-3.5 h-3.5" />
                  {scrubDeadRunning} closed
                </span>
                {scrubUrlsFound > 0 && (
                  <span className="flex items-center gap-1 text-blue-700">
                    <Link2 className="w-3.5 h-3.5" />
                    {scrubUrlsFound} URLs found
                  </span>
                )}
                {scrubErrorRunning > 0 && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {scrubErrorRunning} errors
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelScrub}
                className="h-7 text-xs px-2 text-red-600 border-red-300 hover:bg-red-50"
              >
                Cancel
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-orange-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-orange-600 truncate max-w-[60%]">
              Checking: {scrubCurrentJob}
            </p>
            <span className="text-xs font-medium text-orange-700">
              {scrubProgress} / {scrubTotal} jobs ({progressPercent}%)
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b sticky top-0 z-10">
            <tr>
              <th className="text-center px-2 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[36px]">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                  title={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                />
              </th>
              {/* Columns mirror Tracker's jobs table, with the priority
                  score added as the leftmost data column.
                  Priority | Job Title | Job Type | Company | Company Type | City | State | Source | Date Found.
                  High-priority star is rendered inline on the Job Title cell. */}
              <th className="text-center px-2 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[80px]">
                <button onClick={() => handleSort('priority_score')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors">
                  Priority
                  <SortIcon field="priority_score" />
                </button>
              </th>
              <MultiSelectColumnHeader<SortField> field="job_title" label="Job Title" filterValues={filterJobTitle} filterOptions={uniqueJobTitles} onFilterChange={setFilterJobTitle} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="job_type" label="Job Type" filterValues={filterJobType} filterOptions={uniqueJobTypes} onFilterChange={setFilterJobType} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="company_name" label="Company" filterValues={filterCompany} filterOptions={uniqueCompanies} onFilterChange={setFilterCompany} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="company_type" label="Company Type" filterValues={filterCompanyType} filterOptions={uniqueCompanyTypes} onFilterChange={setFilterCompanyType} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="city" label="City" filterValues={filterCity} filterOptions={uniqueCities} onFilterChange={setFilterCity} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="state" label="State" filterValues={filterState} filterOptions={uniqueStates} onFilterChange={setFilterState} sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <MultiSelectColumnHeader<SortField> field="source" label="Source" filterValues={filterSource} filterOptions={uniqueSources} onFilterChange={setFilterSource} sortField={sortField} sortDir={sortDir} onSort={handleSort} />

              <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[140px]">
                <button onClick={() => handleSort('date_posted')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors">
                  Date Posted
                  <SortIcon field="date_posted" />
                </button>
              </th>
              <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[140px]">
                <button onClick={() => handleSort('created_at')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors">
                  Date Found
                  <SortIcon field="created_at" />
                </button>
              </th>
              <th className="text-center px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold w-[100px]">Actions</th>

            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400 mb-2" />
                  <span className="text-sm text-gray-400">Loading jobs...</span>
                </td>
              </tr>
            ) : sortedJobs.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-16">

                  <div className="text-gray-400">
                    {searchTerm || activeFilterCount > 0 || filterHighPriority ? (

                      <>
                        <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-medium">No jobs match your filters</p>
                        <button onClick={clearAllFilters} className="text-xs text-[#911406] hover:underline mt-1">Clear all filters</button>
                      </>
                    ) : (
                      <>
                        <Archive className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm font-medium">{subTab === 'open' ? 'No open jobs found' : 'No closed jobs'}</p>
                        <p className="text-xs mt-1">{subTab === 'open' ? 'Run the tracker to discover opportunities.' : 'Close jobs from the Open Jobs tab to move them here.'}</p>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sortedJobs.map((j: any, idx: number) => {
                const matchedJobType = j._matchedJobType || '';
                const srcLabel = sourceLabel(j);
                const srcUrl = sourceUrl(j);
                const isMoving = movingJobId === j.id;
                const isSelected = selectedIds.has(j.id);
                const blocked = !!j.is_blocked || !!j._companyIsBlocked;
                const priority = !!j.high_priority || !!j._companyIsHighPriority;

                return (
                  <tr
                    key={j.id}
                    className={`border-b transition-colors ${isMoving ? 'opacity-50' : ''} ${blocked ? 'bg-gray-100 opacity-60' : isSelected ? 'bg-amber-50 hover:bg-amber-100/50' : (
                      priority ? 'bg-amber-50/70 hover:bg-amber-100/70' :
                      subTab === 'open'
                        ? j.is_net_new ? 'bg-blue-50/30 hover:bg-blue-50/60' : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'
                        : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'
                    )}`}
                  >
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(j.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406] cursor-pointer"
                      />
                    </td>
                    {/* Priority — heat-gradient badge, 0-100. */}
                    <td className="px-2 py-3 text-center">
                      <JobPriorityBadge score={j._priorityScore} />
                    </td>
                    {/* Job Title (with inline priority star — clickable to toggle). */}
                    <td className="px-4 py-3 text-gray-800 max-w-[260px]">
                      <div className="flex items-start gap-1.5">
                        <button
                          onClick={() => handleTogglePriority(j.id, !!j.high_priority)}
                          disabled={togglingPriorityId === j.id}
                          className={`flex-shrink-0 mt-0.5 transition-colors ${priority ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-yellow-400'}`}
                          title={priority ? 'Remove high priority' : 'Mark as high priority'}
                        >
                          {togglingPriorityId === j.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Star className="w-3.5 h-3.5" fill={priority ? 'currentColor' : 'none'} strokeWidth={priority ? 0 : 1.5} />
                          )}
                        </button>
                        <span className="truncate block font-medium">{j.job_title || '(untitled)'}</span>
                      </div>
                    </td>
                    {/* Job Type (matched against tracked job_types). */}
                    <td className="px-4 py-3">
                      {matchedJobType
                        ? <span className="text-gray-700">{matchedJobType}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Company (with BLOCKED badge when applicable). */}
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px]">
                      {j.company_name ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate ${blocked ? 'text-gray-500 line-through' : ''}`}>{j.company_name}</span>
                          {blocked && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold flex-shrink-0">BLOCKED</span>
                          )}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Company Type (from enriched marketing_companies). */}
                    <td className="px-4 py-3">
                      {j._companyType
                        ? <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${companyTypeBadge(j._companyType)}`}>{j._companyType}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {/* City */}
                    <td className="px-4 py-3 text-gray-700">{j.city || <span className="text-gray-300">—</span>}</td>
                    {/* State */}
                    <td className="px-4 py-3 text-gray-700">{j.state || <span className="text-gray-300">—</span>}</td>
                    {/* Source (label + external link to sourceUrl). */}
                    <td className="px-4 py-3">
                      {srcUrl ? (
                        <a
                          href={srcUrl.startsWith('http') ? srcUrl : `https://${srcUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 hover:underline"
                          title={srcUrl}
                        >
                          {srcLabel}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-500">{srcLabel}</span>
                      )}
                    </td>
                    {/* Date Posted — drives priority recency. */}
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {j.date_posted ? (
                        <span className="text-xs text-gray-700" title={new Date(j.date_posted).toLocaleString()}>
                          {fmtDateTime(j.date_posted)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    {/* Date Found (created_at, with datetime tooltip). */}
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {j.created_at ? (
                        <span className="text-xs text-gray-700" title={new Date(j.created_at).toLocaleString()}>
                          {fmtDateTime(j.created_at)}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setViewingJobId(j.id)}
                          className="inline-flex items-center justify-center p-1 rounded text-gray-500 hover:text-[#911406] hover:bg-red-50"
                          title="View full job details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingJob({
                            id: j.id,
                            job_title: j.job_title,
                            company_id: j.company_id,
                            company_name: j.company_name,
                            city: j.city,
                            state: j.state,
                            job_type: j.job_type,
                            date_posted: j.date_posted,
                            description: j.description,
                            notes: j.notes,
                            high_priority: !!j.high_priority,
                            status: j.status,
                          })}
                          className="inline-flex items-center justify-center p-1 rounded text-gray-500 hover:text-[#911406] hover:bg-red-50"
                          title="Edit this job"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {subTab === 'open' ? (
                          <button
                            onClick={() => handleMoveJob(j.id, true)}
                            disabled={isMoving}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                            title="Close this job"
                          >
                            {isMoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                            Close
                          </button>
                        ) : (
                          <button
                            onClick={() => handleMoveJob(j.id, false)}
                            disabled={isMoving}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:text-green-700 hover:bg-green-50 border border-transparent hover:border-green-200 transition-colors"
                            title="Reopen this job"
                          >
                            {isMoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Reopen
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleBlock(j.id, blocked)}
                          className={`inline-flex items-center justify-center p-1 rounded ${blocked ? 'text-gray-600 hover:bg-gray-200' : 'text-red-600 hover:bg-red-50'}`}
                          title={blocked ? 'Unblock (allow scraper to re-discover)' : 'Block from future scraper runs'}
                        >
                          {blocked ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })


            )}
          </tbody>
        </table>
      </div>

      {/* Confirm Scrub Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-orange-600" />
              Scrub Dead Links
            </DialogTitle>
            <DialogDescription>
              This will verify all <strong>{openJobs.length} open jobs</strong> using AI analysis and URL verification.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 space-y-2">
            <p className="font-semibold">How it works:</p>
            <ul className="list-disc list-inside text-xs space-y-1 text-orange-700">
              <li>All jobs are <strong>queued</strong> in a database for reliable processing</li>
              <li>Each job is verified by <strong>AI</strong> to determine if the company is a real healthcare org actively hiring for that role</li>
              <li>The system checks <strong>existing job URLs</strong> and discovers <strong>careers page URLs</strong></li>
              <li>Verified URLs are checked to confirm they are <strong>reachable</strong></li>
              <li>Jobs are processed <strong>one at a time</strong> with automatic retry on errors</li>
            </ul>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Closure Rules
            </p>
            <p className="text-xs text-red-700 mt-1">
              Jobs will be <strong>closed</strong> if AI determines the company is not actively hiring for that role.
            </p>
            <p className="text-xs text-red-700 mt-1">
              Jobs will remain <strong>open</strong> if AI confirms the company plausibly hires for this position.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            Estimated time: ~{Math.max(1, Math.ceil(openJobs.length * 5 / 60))} minutes for {openJobs.length} jobs. You can cancel at any time.
          </p>






          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleScrubDeadLinks}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Start Scrubbing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Results Summary Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-green-600" />
              Scrub Complete
            </DialogTitle>
            <DialogDescription>
              Verified {scrubSummary?.totalProcessed || 0} jobs via server-side search + AI analysis.
            </DialogDescription>
          </DialogHeader>

          {scrubSummary && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-700">{scrubSummary.liveCount}</p>
                  <p className="text-xs text-green-600 font-medium">Live Jobs</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-700">{scrubSummary.deadCount}</p>
                  <p className="text-xs text-red-600 font-medium">Jobs Closed</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <Link2 className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-blue-700">{scrubSummary.urlsFound}</p>
                  <p className="text-xs text-blue-600 font-medium">URLs Found</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-amber-700">{scrubSummary.errorCount}</p>
                  <p className="text-xs text-amber-600 font-medium">Errors</p>
                </div>
              </div>

              {/* Summary text */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 space-y-1.5">
                {scrubSummary.liveCount > 0 && (
                  <p className="text-green-700">
                    <strong>{scrubSummary.liveCount} job{scrubSummary.liveCount !== 1 ? 's' : ''}</strong> verified live with direct job posting URLs.
                  </p>
                )}
                {scrubSummary.deadCount > 0 && (
                  <p>
                    <strong>{scrubSummary.deadCount} job{scrubSummary.deadCount !== 1 ? 's' : ''}</strong> closed and moved to <strong>Closed Jobs</strong>:
                  </p>
                )}
                {scrubSummary.noUrlClosedCount > 0 && (
                  <p className="text-orange-700 ml-3">
                    — <strong>{scrubSummary.noUrlClosedCount}</strong> of those appeared active but were closed because <strong>no direct job posting URL</strong> could be found
                  </p>
                )}
                {scrubSummary.deadCount > 0 && scrubSummary.deadCount - scrubSummary.noUrlClosedCount > 0 && (
                  <p className="text-red-700 ml-3">
                    — <strong>{scrubSummary.deadCount - scrubSummary.noUrlClosedCount}</strong> had no evidence of active hiring
                  </p>
                )}
                {scrubSummary.urlsFound > 0 && (
                  <p className="text-blue-700">
                    <strong>{scrubSummary.urlsFound} direct job posting URL{scrubSummary.urlsFound !== 1 ? 's' : ''}</strong> discovered and saved to live job records.
                  </p>
                )}
                {scrubSummary.deadCount === 0 && scrubSummary.liveCount === 0 && scrubSummary.errorCount === 0 && (
                  <p>No jobs were processed.</p>
                )}
                {scrubSummary.errorCount > 0 && (
                  <p className="text-amber-700">
                    {scrubSummary.errorCount} job{scrubSummary.errorCount !== 1 ? 's' : ''} could not be verified (API errors) and {scrubSummary.errorCount !== 1 ? 'were' : 'was'} left unchanged.
                  </p>
                )}
              </div>


              {/* Detailed results toggle */}
              <button
                onClick={() => setShowDetailedResults(!showDetailedResults)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
              >
                {showDetailedResults ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showDetailedResults ? 'Hide' : 'Show'} Detailed Results
              </button>

              {showDetailedResults && (
                <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Company</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Job Title</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Found URL</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scrubSummary.results.map((r, idx) => (
                        <tr key={r.id} className={`border-t ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <td className="px-3 py-2">
                            {r.source === 'error' || r.source === 'ai_missing' ? (
                              <span className="inline-flex items-center gap-1 text-amber-600">
                                <AlertTriangle className="w-3 h-3" /> Error
                              </span>
                            ) : r.is_live ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" /> Live
                              </span>
                            ) : r.ai_says_live && !r.has_direct_url ? (
                              <span className="inline-flex items-center gap-1 text-orange-600" title="AI indicated this job may be active, but no direct job posting URL was found">
                                <Link2 className="w-3 h-3" /> No URL
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-600">
                                <XCircle className="w-3 h-3" /> Dead
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-800 max-w-[120px] truncate">{r.company_name}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{r.job_title}</td>

                          <td className="px-3 py-2 text-gray-500 max-w-[180px]">
                            {r.found_url ? (
                              <a
                                href={r.found_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 truncate"
                                title={r.found_url}
                              >
                                <Link2 className="w-3 h-3 flex-shrink-0" />

                                <span className="truncate">{r.found_url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}...</span>
                              </a>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                            {r.candidate_urls && r.candidate_urls.length > 0 && !r.found_url && (
                              <details className="mt-1">
                                <summary className="text-[10px] text-blue-600 cursor-pointer hover:underline">
                                  {r.candidate_urls.length} candidate URL{r.candidate_urls.length > 1 ? 's' : ''}
                                </summary>
                                <div className="mt-1 space-y-0.5">
                                  {r.candidate_urls.map((u: string, ui: number) => (
                                    <a
                                      key={ui}
                                      href={u}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block text-[10px] text-blue-500 hover:underline truncate"
                                    >
                                      {u.replace(/^https?:\/\/(www\.)?/, '').substring(0, 60)}
                                    </a>
                                  ))}
                                </div>
                              </details>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500 max-w-[250px]">
                            <span className="line-clamp-3">{r.details}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => { setShowResultsDialog(false); setShowDetailedResults(false); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-job detail dialog (Eye icon in the Actions column opens this) */}
      <Dialog open={!!viewingJobId} onOpenChange={(open) => { if (!open) setViewingJobId(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-lg font-semibold text-gray-900 truncate">
                  {viewingJob?.job_title || 'Job details'}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-600 mt-0.5 truncate">
                  {viewingJob?.company_name || ''}
                </DialogDescription>
              </div>
              {viewingJob && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {viewingJob.high_priority && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                      <Star className="w-3 h-3" fill="currentColor" /> Priority
                    </span>
                  )}
                  {viewingJob.is_blocked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      <Ban className="w-3 h-3" /> Blocked
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isJobOpen(viewingJob) ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                    {isJobOpen(viewingJob) ? 'Open' : 'Closed'}
                  </span>
                </div>
              )}
            </div>
          </DialogHeader>

          {viewingJob && (
            <div className="flex-1 overflow-y-auto py-4 space-y-5">
              {/* Key details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Job Type</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${jobTypeBadgeColor(classifyJobType(viewingJob.job_title || '', viewingJob.job_type || viewingJob.opportunity_type || ''))}`}>
                    {classifyJobType(viewingJob.job_title || '', viewingJob.job_type || viewingJob.opportunity_type || '')}
                  </span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Company Category</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(viewingJob.job_category)}`}>{viewingJob.job_category || '—'}</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Location</div>
                  <div className="text-gray-800">
                    {viewingJob.city || viewingJob.state ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {viewingJob.city && viewingJob.state ? `${viewingJob.city}, ${viewingJob.state}` : viewingJob.state || viewingJob.city}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Date Posted</div>
                  <div className="text-gray-800 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    {viewingJob.date_posted ? new Date(viewingJob.date_posted).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : <span className="text-gray-400">—</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Source</div>
                  <div className="text-gray-700 text-xs truncate">{viewingJob.source || <span className="text-gray-400">—</span>}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Last URL Check</div>
                  <div className="text-gray-700 text-xs">{viewingJob.last_url_check ? new Date(viewingJob.last_url_check).toLocaleString() : <span className="text-gray-400">never</span>}</div>
                </div>
              </div>

              {/* Job URLs */}
              <div className="border-t pt-4">
                <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Job Posting Links</div>
                <div className="flex flex-wrap gap-2">
                  {getDirectJobUrl(viewingJob) && (
                    <a href={getDirectJobUrl(viewingJob).startsWith('http') ? getDirectJobUrl(viewingJob) : `https://${getDirectJobUrl(viewingJob)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200">
                      <ExternalLink className="w-3 h-3" /> Direct posting
                    </a>
                  )}
                  {viewingJob.indeed_url && (
                    <a href={viewingJob.indeed_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200">
                      <ExternalLink className="w-3 h-3" /> Indeed search
                    </a>
                  )}
                  {viewingJob.linkedin_url && (
                    <a href={viewingJob.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200">
                      <ExternalLink className="w-3 h-3" /> LinkedIn search
                    </a>
                  )}
                  {viewingJob.google_jobs_url && (
                    <a href={viewingJob.google_jobs_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200">
                      <ExternalLink className="w-3 h-3" /> Google Jobs
                    </a>
                  )}
                </div>
                {viewingJob.url_check_result && (
                  <p className="mt-2 text-[11px] text-gray-500 italic">{viewingJob.url_check_result}</p>
                )}
              </div>

              {/* Description */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Description</div>
                  {(!viewingJob.description || String(viewingJob.description).trim().length === 0) && (
                    <span className="text-xs text-amber-600 italic">Not yet scraped — use "Scrape Descriptions" to fetch</span>
                  )}
                </div>
                {viewingJob.description && String(viewingJob.description).trim().length > 0 ? (
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded p-3 max-h-[300px] overflow-y-auto">
                    {viewingJob.description}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic">No description on file.</div>
                )}
              </div>

              {/* Notes */}
              {viewingJob.notes && (
                <div className="border-t pt-4">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Notes</div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded p-3">{viewingJob.notes}</div>
                </div>
              )}

              {/* Footer metadata */}
              <div className="border-t pt-3 text-[10px] text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
                <div>Created: {viewingJob.created_at ? new Date(viewingJob.created_at).toLocaleString() : '—'}</div>
                <div>Updated: {viewingJob.updated_at ? new Date(viewingJob.updated_at).toLocaleString() : '—'}</div>
                <div className="font-mono truncate">id: {viewingJob.id}</div>
                {viewingJob.tracker_run_id && <div className="font-mono truncate">run: {viewingJob.tracker_run_id}</div>}
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setViewingJobId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditJobModal
        job={editingJob}
        companies={companies}
        jobTypeOptions={jobTypeOptions}
        onSaved={() => onRefresh()}
        onClose={() => setEditingJob(null)}
      />
    </div>
  );
};

export default JobsTabContent;
