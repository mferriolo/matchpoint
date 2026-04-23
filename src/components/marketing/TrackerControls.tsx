import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Play, CheckCircle, XCircle, Shield, Globe, Users,
  Database, RefreshCw, Clock, AlertTriangle, ChevronDown, ChevronUp, ChevronRight,
  Download, Building2, Briefcase, Star, Search, ExternalLink, Unlink,
  FileText, Terminal, Zap, ArrowRight, BarChart3, TrendingUp, Timer,
  SkipForward, Activity, StopCircle, ShieldCheck, Ban
} from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { TrackerJobsTable, TrackerJobsTableRow } from './TrackerJobsTable';

// ============================================================
// CONSTANTS
// ============================================================
const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 minutes max polling (v85: bumped from 20 to give Phase A+B+C+D headroom)
const STALE_THRESHOLD_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

// Default role selection shown the first time a user opens the tracker.
// Independent of the is_active flag on the job_types table — those toggles
// belong to the Job Types Management admin screen and should not control
// what the tracker scrapes by default.
const DEFAULT_TRACKER_ROLES = [
  'Medical Director',
  'Chief Medical Officer',
  'Primary Care Physician',
  'Nurse Practitioner',
  'Physician Assistant',
];

interface TrackerRun {
  id: string;
  run_type: string;
  status: string;
  current_step: string;
  started_at: string;
  completed_at?: string;
  jobs_validated: number;
  jobs_closed: number;
  jobs_still_open: number;
  new_jobs_added: number;
  new_jobs_found: number;
  duplicates_skipped: number;
  new_companies_added: number;
  contacts_added: number;
  contacts_from_crelate: number;
  new_roles_by_type: Record<string, number>;
  high_priority_targets: any[];
  alert_summary: any;
  execution_log: any[];
  master_file_name?: string;
  new_data_file_name?: string;
  search_passes_completed?: number;
  sources_searched?: string[];
  progress?: ProgressState;
  jobs_verified?: number;
  jobs_rejected?: number;
  error_message?: string;
  telemetry?: TelemetrySnapshot;
}

interface StepMetrics {
  step: string;
  duration_ms: number;
  ai_calls: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cost_usd: number;
  serp_calls: number;
  serp_cost_usd: number;
  items_in: number;
  items_out: number;
  notes: string;
}
interface TelemetrySnapshot {
  steps: StepMetrics[];
  totals: {
    duration_ms: number;
    ai_calls: number;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_cost_usd: number;
    serp_calls: number;
    serp_cost_usd: number;
    total_cost_usd: number;
  };
}

interface StepProgress {
  status: 'pending' | 'running' | 'completed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  items_processed?: number;
  items_total?: number;
  sub_step?: string;
}

interface ProgressState {
  percent: number;
  current_step: string;
  current_sub_step: string;
  steps: Record<string, StepProgress>;
  run_started_at: string;
}

const WORKFLOW_STEPS = [
  { key: 'loading', label: 'Load Data', icon: Database, desc: 'Loading existing jobs, companies, and contacts from database' },
  // 'validating_urls' and 'verifying_new_jobs' removed in v78. v76 made
  // them no-ops (URL validation was an AI no-op; verification is no
  // longer needed since results come directly from Google Jobs).
  { key: 'searching_sources', label: 'Search Sources', icon: Globe, desc: 'Direct Google Jobs queries per priority/recurring company plus broad role searches' },
  { key: 'deduplicating', label: 'Insert Jobs', icon: RefreshCw, desc: 'Deduplicating and inserting discovered jobs' },
  { key: 'enriching_contacts', label: 'Enrich Contacts', icon: Users, desc: 'Finding hiring contacts for companies with open roles' },
  { key: 'updating_summaries', label: 'Update Counts', icon: BarChart3, desc: 'Updating company role counts and contact counts' },
  { key: 'generating_alerts', label: 'Auto-Prioritize', icon: Star, desc: 'Starring high-priority companies and their jobs' },
  { key: 'completed', label: 'Complete', icon: CheckCircle, desc: 'Tracker run finished' },
];

type FilterType = 'all_roles' | 'new_roles' | 'new_companies' | 'contacts_added';

interface TrackerControlsProps {
  onComplete: () => void;
  onExportMaster: () => void;
  onExportNewData: () => void;
  jobs: any[];
  companies: any[];
  contacts: any[];
  loading: boolean;
}

// ============================================================
// HELPER: Format duration
// ============================================================
function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatElapsedSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ============================================================
// COMPONENT: StepProgressRow
// ============================================================
const StepProgressRow: React.FC<{
  step: typeof WORKFLOW_STEPS[0];
  stepProgress?: StepProgress;
  isActive: boolean;
  isDone: boolean;
  isSkipped: boolean;
  historicalAvgMs?: number;
  now: number;
}> = ({ step, stepProgress, isActive, isDone, isSkipped, historicalAvgMs, now }) => {
  const Icon = step.icon;

  const elapsedMs = useMemo(() => {
    if (isDone && stepProgress?.duration_ms) return stepProgress.duration_ms;
    if (isActive && stepProgress?.started_at) {
      return now - new Date(stepProgress.started_at).getTime();
    }
    return 0;
  }, [isDone, isActive, stepProgress, now]);

  const itemFrac = stepProgress?.items_total && stepProgress.items_total > 0
    ? Math.min((stepProgress.items_processed || 0) / stepProgress.items_total, 1)
    : null;

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
      isActive ? 'bg-blue-50 border border-blue-200 shadow-sm' :
      isDone ? 'bg-green-50/60 border border-green-100' :
      isSkipped ? 'bg-gray-50 border border-gray-100 opacity-50' :
      'bg-gray-50/50 border border-transparent'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
        isActive ? 'bg-blue-500 text-white shadow-md shadow-blue-200' :
        isDone ? 'bg-green-500 text-white' :
        isSkipped ? 'bg-gray-300 text-white' :
        'bg-gray-200 text-gray-400'
      }`}>
        {isActive ? <Loader2 className="w-4 h-4 animate-spin" /> :
         isDone ? <CheckCircle className="w-4 h-4" /> :
         isSkipped ? <SkipForward className="w-3.5 h-3.5" /> :
         <Icon className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${
            isActive ? 'text-blue-800' : isDone ? 'text-green-800' : isSkipped ? 'text-gray-400' : 'text-gray-500'
          }`}>{step.label}</span>
          {isSkipped && <span className="text-[10px] text-gray-400 uppercase tracking-wider">Skipped</span>}
        </div>

        {(isActive || isDone) && stepProgress?.sub_step && (
          <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-blue-600' : 'text-green-600'}`}>
            {stepProgress.sub_step}
          </p>
        )}

        {isActive && itemFrac !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.round(itemFrac * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-blue-600 font-mono flex-shrink-0">
              {stepProgress.items_processed}/{stepProgress.items_total}
            </span>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 text-right">
        {(isActive || isDone) && elapsedMs > 0 && (
          <div className={`text-xs font-mono ${isActive ? 'text-blue-600' : 'text-green-600'}`}>
            {formatDuration(elapsedMs)}
          </div>
        )}
        {!isActive && !isDone && !isSkipped && historicalAvgMs && historicalAvgMs > 0 && (
          <div className="text-[10px] text-gray-400 font-mono">
            ~{formatDuration(historicalAvgMs)}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const TrackerControls: React.FC<TrackerControlsProps> = ({
  onComplete, onExportMaster, onExportNewData, jobs, companies, contacts, loading
}) => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [currentRun, setCurrentRun] = useState<TrackerRun | null>(null);
  const [lastRun, setLastRun] = useState<TrackerRun | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all_roles');
  const [searchText, setSearchText] = useState('');
  const [showBlocked, setShowBlocked] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showStepDetails, setShowStepDetails] = useState(true);
  const [runHistory, setRunHistory] = useState<TrackerRun[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [historicalStepDurations, setHistoricalStepDurations] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState(Date.now());

  // Job-title picklist state. Master list sourced from the job_types
  // Supabase table (same table that backs Admin > Job Types). First-load
  // selection is DEFAULT_TRACKER_ROLES; subsequent visits restore the
  // user's last selection from localStorage.
  interface JobTypeRow { id: string; name: string; is_active: boolean }
  const [allJobTypes, setAllJobTypes] = useState<JobTypeRow[]>([]);
  const [selectedJobTitles, setSelectedJobTitles] = useState<string[]>([]);
  const [jobTypePickerOpen, setJobTypePickerOpen] = useState(false);

  // Priority companies picklist state. Sourced from
  // tracker_priority_companies (seeded with the list previously hardcoded
  // in the scrape-healthcare-jobs edge function). Toggling a row updates
  // is_selected in the DB so the selection persists across devices.
  interface PriorityCompanyRow { id: string; name: string; is_selected: boolean; categories: string[] }
  const [allCompanies, setAllCompanies] = useState<PriorityCompanyRow[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [newCompanyInput, setNewCompanyInput] = useState('');
  const [addingCompany, setAddingCompany] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Fast vs deep scan. Fast (default) gates Phase A career-page scraping
  // on companies that already turned up SerpAPI hits in Phase B/C/D,
  // cutting run time by several minutes. Deep does the old behavior of
  // scraping every priority company's careers page unconditionally.
  const [scanMode, setScanMode] = useState<'fast' | 'deep'>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('trackerScanMode') : null;
    return stored === 'deep' ? 'deep' : 'fast';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('trackerScanMode', scanMode);
  }, [scanMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('job_types')
        .select('id,name,is_active')
        .order('name');
      if (cancelled || error || !data) return;
      setAllJobTypes(data);
      const stored = localStorage.getItem('trackerSelectedJobTitles');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as string[];
          // Drop any names that no longer exist in job_types so the
          // selection doesn't get stale across schema changes.
          const valid = parsed.filter(n => data.some((jt: JobTypeRow) => jt.name === n));
          if (valid.length > 0) {
            setSelectedJobTitles(valid);
            return;
          }
        } catch { /* fall through to defaults */ }
      }
      // First-load default: the five clinical roles in DEFAULT_TRACKER_ROLES,
      // intersected with what's actually in job_types so we don't select
      // names that wouldn't round-trip through the edge function's matcher.
      const defaults = DEFAULT_TRACKER_ROLES.filter(n => data.some((jt: JobTypeRow) => jt.name === n));
      setSelectedJobTitles(defaults);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('tracker_priority_companies')
        .select('id,name,is_selected,categories')
        .order('name');
      if (cancelled || error || !data) return;
      setAllCompanies(data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Category order shown in the picker — aligned with the canonical
  // 11-bucket healthcare landscape. A single company can live in
  // multiple buckets (e.g. Kaiser Permanente is both Payor and Provider);
  // the DB stores one row per company with a categories text[] so
  // toggling any rendering mutates the one shared is_selected value.
  const COMPANY_CATEGORY_ORDER = [
    'Payors',
    'Providers',
    'Value-Based Care / Risk-Bearing Organizations',
    'Post-Acute / Home-Based Care',
    'PACE Centers',
    'Behavioral Health',
    'Pharmacy / PBM',
    'Health IT / Digital Health',
    'Diagnostics / Devices / Life Sciences',
    'Healthcare Services / Outsourcing',
    'Government / Safety Net / Community Health',
  ];
  const DEFAULT_NEW_COMPANY_CATEGORY = 'Value-Based Care / Risk-Bearing Organizations';

  const toggleJobTitle = (name: string) => {
    setSelectedJobTitles(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      localStorage.setItem('trackerSelectedJobTitles', JSON.stringify(next));
      return next;
    });
  };

  const selectAllJobTitles = () => {
    const next = allJobTypes.map(jt => jt.name);
    setSelectedJobTitles(next);
    localStorage.setItem('trackerSelectedJobTitles', JSON.stringify(next));
  };

  const clearAllJobTitles = () => {
    setSelectedJobTitles([]);
    localStorage.setItem('trackerSelectedJobTitles', JSON.stringify([]));
  };

  const resetJobTitlesToDefaults = () => {
    const next = DEFAULT_TRACKER_ROLES.filter(n => allJobTypes.some(jt => jt.name === n));
    setSelectedJobTitles(next);
    localStorage.setItem('trackerSelectedJobTitles', JSON.stringify(next));
  };

  const toggleCompany = async (row: PriorityCompanyRow) => {
    const nextSelected = !row.is_selected;
    setAllCompanies(prev => prev.map(c => c.id === row.id ? { ...c, is_selected: nextSelected } : c));
    const { error } = await supabase
      .from('tracker_priority_companies')
      .update({ is_selected: nextSelected })
      .eq('id', row.id);
    if (error) {
      setAllCompanies(prev => prev.map(c => c.id === row.id ? { ...c, is_selected: row.is_selected } : c));
      toast({ title: 'Failed to update company', description: error.message, variant: 'destructive' });
    }
  };

  const setAllCompaniesSelected = async (value: boolean) => {
    const prevRows = allCompanies;
    setAllCompanies(prev => prev.map(c => ({ ...c, is_selected: value })));
    const { error } = await supabase
      .from('tracker_priority_companies')
      .update({ is_selected: value })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setAllCompanies(prevRows);
      toast({ title: 'Failed to update companies', description: error.message, variant: 'destructive' });
    }
  };

  // Per-category select/clear. Hybrid companies live in multiple
  // categories but are one row, so this also flips the company's state
  // in every other bucket it belongs to — by design.
  const setCategoryCompaniesSelected = async (cat: string, value: boolean) => {
    const prevRows = allCompanies;
    setAllCompanies(prev => prev.map(c =>
      (c.categories || []).includes(cat) ? { ...c, is_selected: value } : c
    ));
    const { error } = await supabase
      .from('tracker_priority_companies')
      .update({ is_selected: value })
      .contains('categories', [cat]);
    if (error) {
      setAllCompanies(prevRows);
      toast({ title: `Failed to update ${cat}`, description: error.message, variant: 'destructive' });
    }
  };

  const toggleCategoryCollapsed = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const addCompany = async () => {
    const name = newCompanyInput.trim();
    if (!name) return;
    if (allCompanies.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: 'Already in the list', description: `"${name}" is already a priority company.` });
      return;
    }
    setAddingCompany(true);
    const { data, error } = await supabase
      .from('tracker_priority_companies')
      .insert({ name, is_selected: true, categories: [DEFAULT_NEW_COMPANY_CATEGORY] })
      .select('id,name,is_selected,categories')
      .single();
    setAddingCompany(false);
    if (error || !data) {
      toast({ title: 'Failed to add company', description: error?.message || 'Unknown error', variant: 'destructive' });
      return;
    }
    setAllCompanies(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewCompanyInput('');
  };

  const removeCompany = async (row: PriorityCompanyRow) => {
    if (!window.confirm(`Remove "${row.name}" from the priority companies list?`)) return;
    const prevRows = allCompanies;
    setAllCompanies(prev => prev.filter(c => c.id !== row.id));
    const { error } = await supabase
      .from('tracker_priority_companies')
      .delete()
      .eq('id', row.id);
    if (error) {
      setAllCompanies(prevRows);
      toast({ title: 'Failed to remove company', description: error.message, variant: 'destructive' });
    }
  };
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const finishedRef = useRef(false);
  const pollStartTimeRef = useRef(0);
  const lastProgressPercentRef = useRef(0);
  const lastProgressChangeRef = useRef(0);
  const trackedRunIdRef = useRef<string | null>(null);

  // ============================================================
  // CLEANUP
  // ============================================================
  const stopAllTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ============================================================
  // FINISH RUN
  // ============================================================
  const finishRun = useCallback((runData: TrackerRun, source: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    console.log(`[TrackerControls] finishRun from ${source}: status=${runData.status}`);

    stopAllTimers();
    setRunning(false);
    setCurrentRun(runData);
    setLastRun(runData);
    trackedRunIdRef.current = null;
    loadHistory();
    loadHistoricalDurations();
    onComplete();
    if (runData.status === 'completed') {
      const priorityTotal = (runData.alert_summary?.priority?.companies_marked || 0) + (runData.alert_summary?.priority?.jobs_marked || 0);
      const priorityMsg = priorityTotal > 0 ? ` Auto-starred ${priorityTotal} targets.` : '';
      const rejectedMsg = runData.jobs_rejected ? ` ${runData.jobs_rejected} rejected (not found in Google Jobs).` : '';
      toast({
        title: 'Tracker Run Complete',
        description: `Added ${runData.new_jobs_added || 0} verified jobs, ${runData.contacts_added || 0} contacts. Closed ${runData.jobs_closed || 0} jobs.${rejectedMsg}${priorityMsg}`,
      });


    } else if (runData.status === 'failed') {
      toast({
        title: 'Tracker Run Failed',
        description: runData.error_message || 'An error occurred during the tracker run',
        variant: 'destructive'
      });
    }
  }, [onComplete, toast, stopAllTimers]);

  // ============================================================
  // FORCE STOP
  // ============================================================
  const forceStopRun = useCallback((reason: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    console.warn(`[TrackerControls] Force stopping run: ${reason}`);

    const runIdToMark = trackedRunIdRef.current || currentRunId;

    stopAllTimers();
    setRunning(false);
    trackedRunIdRef.current = null;

    toast({
      title: 'Tracker Run Stopped',
      description: reason,
      variant: 'destructive'
    });

    if (runIdToMark) {
      supabase.from('tracker_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        current_step: 'error',
        error_message: reason,
      }).eq('id', runIdToMark).then(() => {
        console.log(`Marked run ${runIdToMark} as failed`);
      });
    }

    loadHistory();
    onComplete();
  }, [stopAllTimers, toast, currentRunId, onComplete]);


  // ============================================================
  // LOAD HISTORICAL STEP DURATIONS
  // ============================================================
  const loadHistoricalDurations = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('tracker_runs')
        .select('progress, started_at, completed_at')
        .eq('status', 'completed')
        .not('progress', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) {
        const { data: fallback } = await supabase
          .from('tracker_runs')
          .select('started_at, completed_at, execution_log')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(5);

        if (fallback && fallback.length > 0) {
          const durations: Record<string, number[]> = {};
          for (const run of fallback) {
            if (!run.execution_log || !Array.isArray(run.execution_log)) continue;
            const stepStarts: Record<string, string> = {};
            const stepEnds: Record<string, string> = {};
            for (const entry of run.execution_log) {
              if (!stepStarts[entry.step]) stepStarts[entry.step] = entry.ts;
              stepEnds[entry.step] = entry.ts;
            }
            for (const step of Object.keys(stepStarts)) {
              if (stepEnds[step]) {
                const dur = new Date(stepEnds[step]).getTime() - new Date(stepStarts[step]).getTime();
                if (dur > 0) {
                  if (!durations[step]) durations[step] = [];
                  durations[step].push(dur);
                }
              }
            }
          }
          const avgs: Record<string, number> = {};
          for (const [step, durs] of Object.entries(durations)) {
            avgs[step] = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
          }
          setHistoricalStepDurations(avgs);
        }
        return;
      }

      const durations: Record<string, number[]> = {};
      for (const run of data) {
        const prog = run.progress as ProgressState;
        if (!prog?.steps) continue;
        for (const [step, sp] of Object.entries(prog.steps)) {
          if (sp.duration_ms && sp.duration_ms > 0 && sp.status === 'completed') {
            if (!durations[step]) durations[step] = [];
            durations[step].push(sp.duration_ms);
          }
        }
      }
      const avgs: Record<string, number> = {};
      for (const [step, durs] of Object.entries(durations)) {
        avgs[step] = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
      }
      setHistoricalStepDurations(avgs);
    } catch (e) {
      console.warn('Failed to load historical durations:', e);
    }
  }, []);

  useEffect(() => {
    loadLastRun();
    loadHistory();
    loadHistoricalDurations();
    return () => stopAllTimers();
  }, [loadHistoricalDurations, stopAllTimers]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (showLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentRun?.execution_log, showLog]);

  const loadLastRun = async () => {
    try {
      const { data } = await supabase
        .from('tracker_runs').select('*')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1).single();
      if (data) setLastRun(data);
    } catch {}
  };

  const loadHistory = async () => {
    try {
      const { data } = await supabase
        .from('tracker_runs').select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      if (data) setRunHistory(data);
    } catch {}
  };

  // ============================================================
  // ETA CALCULATION
  // ============================================================
  const estimatedTimeRemaining = useMemo(() => {
    if (!running || !currentRun?.progress) return null;
    const prog = currentRun.progress;
    const steps = prog.steps || {};

    let remainingMs = 0;
    let hasEstimate = false;

    for (const stepDef of WORKFLOW_STEPS) {
      const sp = steps[stepDef.key];
      if (!sp || sp.status === 'completed' || sp.status === 'skipped') continue;

      const histAvg = historicalStepDurations[stepDef.key];

      if (sp.status === 'running') {
        if (sp.items_total && sp.items_total > 0 && sp.items_processed !== undefined) {
          const frac = sp.items_processed / sp.items_total;
          if (frac > 0 && sp.started_at) {
            const elapsed = Date.now() - new Date(sp.started_at).getTime();
            const totalEstimate = elapsed / frac;
            remainingMs += Math.max(totalEstimate - elapsed, 0);
            hasEstimate = true;
          } else if (histAvg) {
            remainingMs += histAvg * 0.7;
            hasEstimate = true;
          }
        } else if (histAvg && sp.started_at) {
          const elapsed = Date.now() - new Date(sp.started_at).getTime();
          remainingMs += Math.max(histAvg - elapsed, 0);
          hasEstimate = true;
        }
      } else if (sp.status === 'pending') {
        if (histAvg) {
          remainingMs += histAvg;
          hasEstimate = true;
        }
      }
    }

    if (!hasEstimate) {
      const totalHistMs = Object.values(historicalStepDurations).reduce((a, b) => a + b, 0);
      if (totalHistMs > 0 && prog.percent > 0) {
        const elapsedFrac = prog.percent / 100;
        remainingMs = Math.max(totalHistMs * (1 - elapsedFrac), 0);
        hasEstimate = true;
      }
    }

    return hasEstimate ? remainingMs : null;
  }, [running, currentRun?.progress, historicalStepDurations, nowMs]);

  // ============================================================
  // POLLING
  // ============================================================
  const startPolling = useCallback((targetRunId?: string) => {
    if (pollRef.current) return;

    pollStartTimeRef.current = Date.now();
    lastProgressChangeRef.current = Date.now();
    lastProgressPercentRef.current = 0;

    if (targetRunId) {
      trackedRunIdRef.current = targetRunId;
    }

    console.log(`[TrackerControls] Starting polling for run ${targetRunId || trackedRunIdRef.current || '(auto-detect)'}`);

    const pollFn = async () => {
      const pollElapsed = Date.now() - pollStartTimeRef.current;
      if (pollElapsed > MAX_POLL_DURATION_MS) {
        forceStopRun(`Tracker has been running for over ${Math.round(MAX_POLL_DURATION_MS / 60000)} minutes. It may have encountered an issue.`);
        return;
      }

      try {
        let data: any = null;

        const runIdToTrack = trackedRunIdRef.current;
        if (runIdToTrack) {
          const { data: d } = await supabase
            .from('tracker_runs').select('*')
            .eq('id', runIdToTrack).single();
          data = d;
        } else {
          const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { data: d } = await supabase
            .from('tracker_runs')
            .select('*')
            .gte('started_at', cutoff)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();
          data = d;
          if (data) {
            trackedRunIdRef.current = data.id;
            console.log(`[TrackerControls] Locked onto run ${data.id}`);
          }
        }

        if (!data) return;

        setCurrentRunId(data.id);
        setCurrentRun(data);

        // Stale detection
        const currentPercent = data.progress?.percent || 0;
        if (currentPercent !== lastProgressPercentRef.current) {
          lastProgressPercentRef.current = currentPercent;
          lastProgressChangeRef.current = Date.now();
        } else {
          const staleDuration = Date.now() - lastProgressChangeRef.current;
          if (staleDuration > STALE_THRESHOLD_MS && data.status === 'running') {
            console.warn(`[TrackerControls] Progress stale for ${Math.round(staleDuration / 1000)}s`);
          }
        }

        if (data.status === 'completed' || data.status === 'failed') {
          finishRun(data, 'polling');
        }
      } catch (e) {
        console.warn('Poll error:', e);
      }
    };

    pollRef.current = setInterval(pollFn, POLL_INTERVAL_MS);
    pollFn();
  }, [finishRun, forceStopRun]);

  // ============================================================
  // RUN TRACKER
  // ============================================================
  const runTracker = async (action: 'full' | 'checker_only' | 'scan_only') => {
    finishedRef.current = false;
    trackedRunIdRef.current = null;
    lastProgressPercentRef.current = 0;
    lastProgressChangeRef.current = Date.now();

    setRunning(true);
    setCurrentRun(null);
    setCurrentRunId(null);
    setElapsedTime(0);
    setShowStepDetails(true);
    setNowMs(Date.now());

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      // The edge function now returns immediately with the run_id.
      // jobTitles is the user's selection from the picklist; the scraper
      // falls back to its hardcoded clinical roles if the array is empty.
      const selectedCompanies = allCompanies.filter(c => c.is_selected).map(c => c.name);
      const { data, error } = await supabase.functions.invoke('scrape-healthcare-jobs', {
        body: {
          action,
          jobTitles: selectedJobTitles,
          priorityOrgs: selectedCompanies,
          deepScan: scanMode === 'deep',
        }
      });

      if (finishedRef.current) return;

      if (error) {
        console.warn('[TrackerControls] Edge function invoke error:', error.message);
        // Even on error, start polling - the function may have created a run before erroring
        if (!pollRef.current) {
          startPolling();
        }
        return;
      }

      if (data?.run_id) {
        // Got the run ID - start polling for it immediately
        trackedRunIdRef.current = data.run_id;
        setCurrentRunId(data.run_id);
        console.log(`[TrackerControls] Got run_id ${data.run_id}, starting polling`);
        startPolling(data.run_id);
      } else if (data?.success === false) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          stopAllTimers();
          setRunning(false);
          toast({
            title: 'Tracker Run Failed',
            description: data.error || 'Unknown error',
            variant: 'destructive'
          });
        }
      } else {
        // Unexpected response - start polling anyway
        startPolling();
      }
    } catch (err: any) {
      console.warn('[TrackerControls] Unexpected error:', err.message);
      if (!pollRef.current && !finishedRef.current) {
        startPolling();
      }
    }
  };

  // ============================================================
  // CANCEL / FORCE STOP
  // ============================================================
  const handleForceStop = () => {
    forceStopRun('Manually stopped by user');
  };

  // ============================================================
  // DERIVED STATE
  // ============================================================
  const progressData = currentRun?.progress as ProgressState | undefined;
  const progressPercent = progressData?.percent || 0;

  const currentStepIdx = currentRun
    ? WORKFLOW_STEPS.findIndex(s => s.key === currentRun.current_step)
    : -1;

  const lastRunId = lastRun?.id || null;
  const lastRunStartedAt = lastRun?.started_at || null;

  const newRoles = jobs.filter(j => {
    if (!lastRunId) return false;
    return j.tracker_run_id === lastRunId;
  });

  const newCompanies = companies.filter(c => {
    if (!lastRunStartedAt) return false;
    return c.created_at && c.created_at >= lastRunStartedAt;
  });

  const recentContacts = contacts.filter(c => {
    if (!lastRunId && !lastRunStartedAt) return false;
    if (c.tracker_run_id) return c.tracker_run_id === lastRunId;
    if (lastRunStartedAt) return c.created_at && c.created_at >= lastRunStartedAt;
    return false;
  });

  const companyJobsMap: Record<string, any[]> = {};
  jobs.forEach(j => {
    const key = j.company_name || 'Unknown';
    if (!companyJobsMap[key]) companyJobsMap[key] = [];
    companyJobsMap[key].push(j);
  });

  const enrichedCompanies = companies.map(c => {
    const cJobs = companyJobsMap[c.company_name] || [];
    const openJobs = cJobs.filter((j: any) => !j.is_closed && j.status !== 'Closed');
    const newJobsForCo = cJobs.filter((j: any) => lastRunId ? j.tracker_run_id === lastRunId : false);
    const isNewCo = lastRunStartedAt ? (c.created_at && c.created_at >= lastRunStartedAt) : false;
    const cContacts = contacts.filter(ct => ct.company_name === c.company_name);
    const recentCContacts = cContacts.filter(ct => {
      if (ct.tracker_run_id) return ct.tracker_run_id === lastRunId;
      if (lastRunStartedAt) return ct.created_at && ct.created_at >= lastRunStartedAt;
      return false;
    });
    return { ...c, jobs: cJobs, openJobs, newJobs: newJobsForCo, isNewCompany: isNewCo, companyContacts: cContacts, recentContacts: recentCContacts };
  });

  const filteredRecords = enrichedCompanies.filter(c => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (!c.company_name?.toLowerCase().includes(q) && !c.company_type?.toLowerCase().includes(q) && !c.jobs.some((j: any) => j.job_title?.toLowerCase().includes(q))) return false;
    }
    switch (activeFilter) {
      case 'new_roles': return c.newJobs.length > 0;
      case 'new_companies': return c.isNewCompany;
      case 'contacts_added': return c.recentContacts.length > 0;
      default: return true;
    }
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (activeFilter === 'new_roles') return b.newJobs.length - a.newJobs.length || (a.company_name || '').localeCompare(b.company_name || '');
    if (activeFilter === 'contacts_added') return b.recentContacts.length - a.recentContacts.length || (a.company_name || '').localeCompare(b.company_name || '');
    return (b.open_roles_count || 0) - (a.open_roles_count || 0) || (a.company_name || '').localeCompare(b.company_name || '');
  });

  const filterTiles: { key: FilterType; label: string; count: number; color: string; activeColor: string; icon: React.ReactNode }[] = [
    { key: 'all_roles', label: 'All Open Roles', count: jobs.filter(j => !j.is_closed && j.status !== 'Closed').length, color: 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100', activeColor: 'bg-gray-900 border-gray-900 text-white shadow-lg', icon: <Briefcase className="w-5 h-5" /> },
    { key: 'new_roles', label: 'New Roles Added', count: newRoles.length, color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100', activeColor: 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200', icon: <TrendingUp className="w-5 h-5" /> },
    { key: 'new_companies', label: 'New Companies', count: newCompanies.length, color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100', activeColor: 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200', icon: <Building2 className="w-5 h-5" /> },
    { key: 'contacts_added', label: 'Contacts Added', count: recentContacts.length, color: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100', activeColor: 'bg-green-600 border-green-600 text-white shadow-lg shadow-green-200', icon: <Users className="w-5 h-5" /> },
  ];

  const displayLog = currentRun?.execution_log || lastRun?.execution_log || [];

  // Get verification stats from current or last run
  const verifiedCount = currentRun?.jobs_verified || currentRun?.alert_summary?.summary?.jobs_verified || 0;
  const rejectedCount = currentRun?.jobs_rejected || currentRun?.alert_summary?.summary?.jobs_rejected || 0;

  return (
    <div className="space-y-4">
      {/* Job Title Picklist - controls which job types the scraper searches for */}
      <div className="bg-white rounded-xl border shadow-sm">
        <button
          type="button"
          onClick={() => setJobTypePickerOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 rounded-t-xl"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#911406]" />
            <span className="text-sm font-semibold text-gray-800">Job Titles to Search</span>
            <span className="text-xs text-gray-500">
              {selectedJobTitles.length} of {allJobTypes.length} selected
            </span>
          </div>
          {jobTypePickerOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {jobTypePickerOpen && (
          <div className="px-5 pb-4 border-t border-gray-100">
            <div className="flex items-center gap-2 pt-3 pb-3 text-xs">
              <button
                type="button"
                onClick={selectAllJobTitles}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAllJobTitles}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={resetJobTitlesToDefaults}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Reset to defaults ({DEFAULT_TRACKER_ROLES.length} roles)
              </button>
            </div>
            {/* CSS multi-column layout (not grid) so items flow top-to-bottom
                in column 1, then top-to-bottom in column 2, etc. — alphabetical
                order is easier to read down a column than across a row. */}
            <div className="columns-1 sm:columns-2 md:columns-3 gap-x-4 max-h-80 overflow-y-auto pr-1">
              {allJobTypes.map(jt => {
                const checked = selectedJobTitles.includes(jt.name);
                return (
                  <label
                    key={jt.id}
                    className="break-inside-avoid flex items-center gap-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 mb-1"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleJobTitle(jt.name)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]"
                    />
                    <span className={checked ? 'font-medium text-gray-900' : ''}>{jt.name}</span>
                    {jt.is_active && (
                      <span className="text-[10px] text-green-600 font-semibold">●</span>
                    )}
                  </label>
                );
              })}
            </div>
            {allJobTypes.length === 0 && (
              <div className="text-xs text-gray-500 py-4 text-center">
                Loading job types from Admin → Job Types…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Priority Companies Picklist — controls which companies get per-company SerpAPI queries (Phase B) */}
      <div className="bg-white rounded-xl border shadow-sm">
        <button
          type="button"
          onClick={() => setCompanyPickerOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 rounded-t-xl"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#911406]" />
            <span className="text-sm font-semibold text-gray-800">Priority Companies to Search</span>
            <span className="text-xs text-gray-500">
              {allCompanies.filter(c => c.is_selected).length} of {allCompanies.length} selected
            </span>
          </div>
          {companyPickerOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {companyPickerOpen && (
          <div className="px-5 pb-4 border-t border-gray-100">
            <div className="flex items-center gap-2 pt-3 pb-3 text-xs flex-wrap">
              <button
                type="button"
                onClick={() => setAllCompaniesSelected(true)}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setAllCompaniesSelected(false)}
                className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Clear
              </button>
              <div className="flex-1 min-w-[200px] flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Filter companies..."
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Add company..."
                  value={newCompanyInput}
                  onChange={e => setNewCompanyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompany(); } }}
                  className="h-7 text-xs w-44"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addCompany}
                  disabled={!newCompanyInput.trim() || addingCompany}
                  className="h-7 px-2 text-xs"
                >
                  {addingCompany ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </div>
            <div className="max-h-[28rem] overflow-y-auto pr-1 space-y-4">
              {(() => {
                const filtered = allCompanies.filter(c =>
                  !companySearch || c.name.toLowerCase().includes(companySearch.toLowerCase())
                );
                // Group by category — a hybrid company with multiple
                // categories intentionally appears in each bucket. The
                // underlying row is the same, so toggling in one bucket
                // flips the checkbox everywhere.
                const byCategory = new Map<string, PriorityCompanyRow[]>();
                for (const c of filtered) {
                  const cats = c.categories && c.categories.length > 0
                    ? c.categories
                    : [DEFAULT_NEW_COMPANY_CATEGORY];
                  for (const cat of cats) {
                    if (!byCategory.has(cat)) byCategory.set(cat, []);
                    byCategory.get(cat)!.push(c);
                  }
                }
                const orderedCategories = [
                  ...COMPANY_CATEGORY_ORDER.filter(cat => byCategory.has(cat)),
                  ...Array.from(byCategory.keys()).filter(cat => !COMPANY_CATEGORY_ORDER.includes(cat)),
                ];
                return orderedCategories.map(cat => {
                  const rows = byCategory.get(cat) || [];
                  const selectedInCat = rows.filter(r => r.is_selected).length;
                  const collapsed = collapsedCategories.has(cat);
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 border-b border-gray-200 pb-1 mb-2">
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapsed(cat)}
                          className="flex items-center gap-1.5 flex-1 text-left hover:text-gray-900"
                          title={collapsed ? 'Expand' : 'Collapse'}
                        >
                          {collapsed
                            ? <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">{cat}</h4>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {selectedInCat}/{rows.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryCompaniesSelected(cat, true)}
                          className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryCompaniesSelected(cat, false)}
                          className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                        >
                          Clear
                        </button>
                      </div>
                      {!collapsed && (
                        <div className="columns-1 sm:columns-2 md:columns-3 gap-x-4">
                          {rows.map(c => {
                            const checked = c.is_selected;
                            return (
                              <div
                                key={c.id}
                                className="break-inside-avoid flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-50 rounded px-1 py-0.5 mb-1 group"
                              >
                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleCompany(c)}
                                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#911406] focus:ring-[#911406]"
                                  />
                                  <span className={checked ? 'font-medium text-gray-900' : ''}>{c.name}</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => removeCompany(c)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity"
                                  title={`Remove ${c.name}`}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            {allCompanies.length === 0 && (
              <div className="text-xs text-gray-500 py-4 text-center">
                Loading priority companies…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Primary Action Bar */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => runTracker('full')}
              disabled={running}
              className="bg-[#911406] hover:bg-[#911406]/90 text-white gap-2 px-6 py-2.5 text-sm font-semibold"
              size="lg"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running Tracker...</>
              ) : (
                <><Play className="w-4 h-4" /> Run the Tracker</>
              )}
            </Button>
            <div
              className="inline-flex rounded-md border border-gray-200 overflow-hidden text-xs"
              title="Fast: scrape career pages only for companies that turned up on job boards. Deep: scrape every priority company's career page (slower, weekly safety net)."
            >
              <button
                type="button"
                onClick={() => setScanMode('fast')}
                disabled={running}
                className={`px-3 py-2 font-semibold transition-colors ${
                  scanMode === 'fast'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                } disabled:opacity-60`}
              >
                Fast scan
              </button>
              <button
                type="button"
                onClick={() => setScanMode('deep')}
                disabled={running}
                className={`px-3 py-2 font-semibold transition-colors border-l border-gray-200 ${
                  scanMode === 'deep'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                } disabled:opacity-60`}
              >
                Deep scan
              </button>
            </div>
            {running && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-600 font-mono flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {formatElapsedSec(elapsedTime)}
                </span>
                {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                  <span className="text-sm text-amber-600 font-mono flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" />
                    ~{formatDuration(estimatedTimeRemaining)} remaining
                  </span>
                )}
                <Button
                  onClick={handleForceStop}
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5 text-xs"
                >
                  <StopCircle className="w-3.5 h-3.5" /> Stop
                </Button>
              </div>
            )}
            {!running && lastRun?.completed_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last run: {new Date(lastRun.completed_at).toLocaleString()}
                {lastRun.started_at && lastRun.completed_at && (
                  <span className="ml-1 text-gray-300">
                    ({formatDuration(new Date(lastRun.completed_at).getTime() - new Date(lastRun.started_at).getTime())})
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onExportMaster} variant="outline" className="gap-2 text-green-700 border-green-300 hover:bg-green-50" size="sm" disabled={running || loading}>
              <Download className="w-4 h-4" /> Download Master Sheet
            </Button>
            <Button onClick={onExportNewData} variant="outline" className="gap-2 text-blue-700 border-blue-300 hover:bg-blue-50" size="sm" disabled={running || loading}>
              <Download className="w-4 h-4" /> Download New Data
            </Button>
          </div>
        </div>


        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mr-1 self-center">Roles:</span>
          {['Medical Director', 'Chief Medical Officer', 'Primary Care Physician', 'Nurse Practitioner', 'Physician Assistant'].map(r => (
            <span key={r} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{r}</span>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* LIVE PROGRESS PANEL */}
      {/* ============================================================ */}
      {(running || (currentRun && (currentRun.status === 'completed' || currentRun.status === 'failed'))) && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                {running ? 'Live Progress' : currentRun?.status === 'failed' ? 'Run Failed' : 'Run Complete'}
                {currentRun?.search_passes_completed && (
                  <span className="text-xs text-gray-500 font-normal ml-2">
                    ({currentRun.search_passes_completed} search passes)
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-3">
                {running && (
                  <span className="text-xs text-blue-600 font-mono flex items-center gap-1.5 animate-pulse">
                    <Activity className="w-3 h-3" /> Processing
                  </span>
                )}
                {currentRun?.status === 'completed' && (
                  <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Complete
                  </span>
                )}
                {currentRun?.status === 'failed' && (
                  <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                )}
                {running && estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                  <span className="text-xs text-amber-600 font-mono flex items-center gap-1.5 bg-amber-50 px-2 py-0.5 rounded-full">
                    <Timer className="w-3 h-3" />
                    ETA: {formatDuration(estimatedTimeRemaining)}
                  </span>
                )}
              </div>
            </div>

            {/* Main progress bar */}
            <div className="relative">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                      currentRun?.status === 'completed'
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                        : currentRun?.status === 'failed'
                        ? 'bg-gradient-to-r from-red-400 to-red-500'
                        : 'bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500'
                    }`}
                    style={{ width: `${currentRun?.status === 'completed' ? 100 : progressPercent}%` }}
                  />
                </div>
                <span className={`text-sm font-bold tabular-nums min-w-[3rem] text-right ${
                  currentRun?.status === 'completed' ? 'text-green-600' :
                  currentRun?.status === 'failed' ? 'text-red-600' : 'text-blue-600'
                }`}>
                  {currentRun?.status === 'completed' ? '100' : progressPercent}%
                </span>
              </div>

              {progressData?.current_sub_step && (
                <p className={`text-xs truncate ${
                  running ? 'text-blue-600' :
                  currentRun?.status === 'failed' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {progressData.current_sub_step}
                </p>
              )}
            </div>
          </div>

          {/* Step-by-step details */}
          <div>
            <button
              onClick={() => setShowStepDetails(!showStepDetails)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-xs text-gray-500"
            >
              <span className="font-medium">Step Details</span>
              {showStepDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showStepDetails && (
              <div className="px-4 pb-4 space-y-1.5">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const sp = progressData?.steps?.[step.key];
                  const isActive = running && step.key === progressData?.current_step;
                  const isSkipped = sp?.status === 'skipped';

                  return (
                    <StepProgressRow
                      key={step.key}
                      step={step}
                      stepProgress={sp}
                      isActive={isActive}
                      isDone={(sp?.status === 'completed') || (currentRun?.status === 'completed' && !isSkipped)}
                      isSkipped={isSkipped}
                      historicalAvgMs={historicalStepDurations[step.key]}
                      now={nowMs}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Run Summary (after completion) */}
          {currentRun?.status === 'completed' && (
            <div className="border-t bg-gradient-to-r from-green-50 to-emerald-50 p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{currentRun.new_jobs_added || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Jobs Added</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">{verifiedCount}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Verified</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{rejectedCount}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Rejected</div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{currentRun.new_companies_added || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">New Cos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{currentRun.contacts_added || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Contacts</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{currentRun.jobs_closed || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Closed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">{currentRun.jobs_validated || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Validated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-500">{currentRun.duplicates_skipped || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Dupes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600">{currentRun.search_passes_completed || 0}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Passes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-500 flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 fill-amber-500" />
                    {((currentRun as any).priority_companies_marked || (currentRun.alert_summary as any)?.priority?.companies_marked || 0) + ((currentRun as any).priority_jobs_marked || (currentRun.alert_summary as any)?.priority?.jobs_marked || 0)}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Starred</div>
                </div>
              </div>

              {/* SerpAPI verification summary */}
              {(verifiedCount > 0 || rejectedCount > 0) && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-emerald-700">SerpAPI Verification:</span>
                      <span className="font-bold text-emerald-800">{verifiedCount}</span>
                      <span className="text-gray-500">confirmed active in Google Jobs and added,</span>
                      <span className="font-bold text-red-600">{rejectedCount}</span>
                      <span className="text-gray-500">not found in live search and rejected</span>
                    </div>
                    {currentRun.alert_summary?.summary?.serp_searches > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {currentRun.alert_summary.summary.serp_searches} SerpAPI searches used
                      </span>
                    )}
                  </div>
                </div>
              )}




              {/* Step timing summary */}
              {progressData?.steps && Object.keys(progressData.steps).length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Step Timing</div>
                  <div className="flex flex-wrap gap-2">
                    {WORKFLOW_STEPS.filter(s => progressData.steps[s.key]?.duration_ms).map(s => {
                      const sp = progressData.steps[s.key];
                      return (
                        <span key={s.key} className="text-xs px-2.5 py-1 rounded-full bg-white border border-green-200 text-green-800 font-medium">
                          {s.label}: <strong>{formatDuration(sp.duration_ms!)}</strong>
                        </span>
                      );
                    })}
                    {currentRun.started_at && currentRun.completed_at && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 border border-green-300 text-green-900 font-bold">
                        Total: {formatDuration(new Date(currentRun.completed_at).getTime() - new Date(currentRun.started_at).getTime())}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Role breakdown */}
              {currentRun.new_roles_by_type && Object.keys(currentRun.new_roles_by_type).length > 0 && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">New Roles by Category</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(currentRun.new_roles_by_type).map(([role, count]) => (
                      <span key={role} className="text-xs px-2.5 py-1 rounded-full bg-white border border-green-200 text-green-800 font-medium">
                        {role}: <strong>{count as number}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* File names */}
              {(currentRun.master_file_name || currentRun.new_data_file_name) && (
                <div className="mt-3 pt-3 border-t border-green-200 flex flex-wrap gap-3">
                  {currentRun.master_file_name && (
                    <button onClick={onExportMaster} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-700 hover:bg-green-50 transition-colors font-medium">
                      <FileText className="w-3.5 h-3.5" />
                      {currentRun.master_file_name}
                      <Download className="w-3 h-3 ml-1" />
                    </button>
                  )}
                  {currentRun.new_data_file_name && (
                    <button onClick={onExportNewData} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors font-medium">
                      <FileText className="w-3.5 h-3.5" />
                      {currentRun.new_data_file_name}
                      <Download className="w-3 h-3 ml-1" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Failed run error message */}
          {currentRun?.status === 'failed' && currentRun.error_message && (
            <div className="border-t bg-red-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-semibold text-red-800">Error Details</div>
                  <p className="text-xs text-red-600 mt-1">{currentRun.error_message}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Telemetry — per-step cost + result counts. Surfaces what each step
          actually does so we can decide what to keep / replace. */}
      {(currentRun?.telemetry || lastRun?.telemetry) && (() => {
        const t = (currentRun?.telemetry || lastRun?.telemetry) as TelemetrySnapshot;
        const fmtMs = (ms: number) => ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms/1000).toFixed(1)}s` : `${(ms/60000).toFixed(1)}m`;
        const fmtUsd = (n: number) => n === 0 ? '$0.00' : n < 0.01 ? `<$0.01` : `$${n.toFixed(n < 1 ? 4 : 2)}`;
        const fmtNum = (n: number) => n.toLocaleString();
        return (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-blue-50/50">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Per-step telemetry
                </h3>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <span><strong className="text-gray-900">{fmtMs(t.totals.duration_ms)}</strong> total</span>
                  <span className="text-gray-300">·</span>
                  <span><strong className="text-gray-900">{t.totals.ai_calls}</strong> AI calls ({fmtNum(t.totals.ai_input_tokens)} in / {fmtNum(t.totals.ai_output_tokens)} out tokens)</span>
                  <span className="text-gray-300">·</span>
                  <span><strong className="text-gray-900">{t.totals.serp_calls}</strong> SerpAPI</span>
                  <span className="text-gray-300">·</span>
                  <span><strong className="text-emerald-700">{fmtUsd(t.totals.total_cost_usd)}</strong> est. cost</span>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Step</th>
                    <th className="text-right px-3 py-2 font-semibold">Time</th>
                    <th className="text-right px-3 py-2 font-semibold">AI calls</th>
                    <th className="text-right px-3 py-2 font-semibold">In tok</th>
                    <th className="text-right px-3 py-2 font-semibold">Out tok</th>
                    <th className="text-right px-3 py-2 font-semibold">SerpAPI</th>
                    <th className="text-right px-3 py-2 font-semibold">Cost</th>
                    <th className="text-right px-3 py-2 font-semibold">Items in → out</th>
                    <th className="text-left px-3 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {t.steps.map((s, i) => {
                    const stepCost = s.ai_cost_usd + s.serp_cost_usd;
                    const yieldRate = s.items_in > 0 ? (s.items_out / s.items_in) : null;
                    return (
                      <tr key={i} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                        <td className="px-3 py-2 font-medium text-gray-800">{s.step}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtMs(s.duration_ms)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{s.ai_calls || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.ai_input_tokens ? fmtNum(s.ai_input_tokens) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.ai_output_tokens ? fmtNum(s.ai_output_tokens) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{s.serp_calls || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">{fmtUsd(stepCost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                          {s.items_in || s.items_out ? (
                            <>
                              {fmtNum(s.items_in)} → {fmtNum(s.items_out)}
                              {yieldRate !== null && s.items_in > 0 && (
                                <span className="ml-1 text-[10px] text-gray-400">({Math.round(yieldRate * 100)}%)</span>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[300px] truncate" title={s.notes}>{s.notes || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t bg-slate-50 text-[10px] text-gray-500">
              Cost estimates: gpt-4o-mini at $0.15/M input + $0.60/M output tokens; SerpAPI at $0.01/search. Item yield (%) = items_out / items_in.
            </div>
          </div>
        );
      })()}

      {/* Execution Log */}
      {displayLog.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <button
            onClick={() => setShowLog(!showLog)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-400" />
              Execution Log ({displayLog.length} entries)
            </span>
            {showLog ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showLog && (
            <div className="border-t bg-gray-950 max-h-80 overflow-y-auto">
              <div className="p-3 space-y-0.5 font-mono text-xs">
                {displayLog.map((entry: any, i: number) => {
                  const stepColor: Record<string, string> = {
                    loading: 'text-cyan-400', validating_urls: 'text-yellow-400',
                    searching_sources: 'text-blue-400', verifying_new_jobs: 'text-teal-400',
                    deduplicating: 'text-purple-400',
                    enriching_contacts: 'text-green-400', updating_summaries: 'text-orange-400',
                    generating_alerts: 'text-red-400', auto_priority: 'text-amber-400',
                    completed: 'text-emerald-400', error: 'text-red-500',
                    init: 'text-cyan-400', validate: 'text-yellow-400', search: 'text-blue-400',
                    dedup: 'text-purple-400', contacts: 'text-green-400', summary: 'text-orange-400',
                    done: 'text-emerald-400'
                  };
                  const color = stepColor[entry.step] || 'text-gray-400';
                  const time = entry.ts ? new Date(entry.ts).toLocaleTimeString() : '';
                  const isVerified = entry.msg?.startsWith('VERIFIED:');
                  const isRejected = entry.msg?.startsWith('REJECTED:');
                  return (
                    <div key={i} className="flex gap-2 leading-relaxed">
                      <span className="text-gray-600 flex-shrink-0 w-16">{time}</span>
                      <span className={`flex-shrink-0 w-32 ${color}`}>[{entry.step}]</span>
                      <span className={
                        isVerified ? 'text-emerald-400' :
                        isRejected ? 'text-red-400' :
                        'text-gray-300'
                      }>{entry.msg}</span>
                    </div>
                  );
                })}
                <div ref={logEndRef} />
                {running && (
                  <div className="flex items-center gap-2 text-blue-400 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Processing...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {filterTiles.map(tile => {
          const isActive = activeFilter === tile.key;
          return (
            <button
              key={tile.key}
              onClick={() => setActiveFilter(tile.key)}
              className={`relative rounded-xl border-2 p-4 text-left transition-all duration-200 cursor-pointer ${isActive ? tile.activeColor : tile.color}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`${isActive ? 'opacity-90' : 'opacity-60'}`}>{tile.icon}</span>
                {isActive && <span className="text-[10px] uppercase tracking-wider font-bold opacity-70">Active</span>}
              </div>
              <div className="text-3xl font-bold">{tile.count}</div>
              <div className={`text-sm font-medium mt-0.5 ${isActive ? 'opacity-90' : 'opacity-70'}`}>{tile.label}</div>
            </button>
          );
        })}
      </div>

      {/* Companies and Roles Section */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Jobs</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeFilter === 'all_roles' && 'All open jobs across tracked companies'}
              {activeFilter === 'new_roles' && 'Jobs discovered in the most recent tracker run'}
              {activeFilter === 'new_companies' && 'Jobs at companies added during the most recent run'}
              {activeFilter === 'contacts_added' && 'Jobs at companies with recently added contacts'}
              <span className="ml-1 text-gray-400">· priority jobs highlighted, click a title for details</span>
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input placeholder="Search companies or roles..." value={searchText} onChange={e => setSearchText(e.target.value)} className="pl-9 w-64" />
            </div>
            {(() => {
              const blockedCount = sortedRecords.filter(r => (r as any).is_blocked).length;
              if (blockedCount === 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => setShowBlocked(v => !v)}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors font-medium ${
                    showBlocked
                      ? 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                  {showBlocked ? 'Hide blocked' : `Show blocked (${blockedCount})`}
                </button>
              );
            })()}
            <span className="text-sm text-gray-500 whitespace-nowrap">{sortedRecords.length} {sortedRecords.length === 1 ? 'company' : 'companies'}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (() => {
          // Flatten openJobs from every visible (sortedRecords) company
          // into one list. Decorate each row with the company-level
          // priority flag so the table can highlight priority rows
          // whether the flag lives on the job or on the company.
          const flatJobs: TrackerJobsTableRow[] = [];
          for (const rec of sortedRecords) {
            const isBlocked = !!(rec as any).is_blocked;
            // Blocked companies are hidden from the table by default; the
            // "Show blocked" toggle in the header flips them back in with
            // a muted/strikethrough row style.
            if (isBlocked && !showBlocked) continue;
            const src: any[] = (rec as any).openJobs || [];
            for (const j of src) {
              flatJobs.push({
                ...j,
                _companyIsHighPriority: (rec as any).is_high_priority,
                _companyIsBlocked: isBlocked,
                _companyType: (rec as any).company_type,
                _company: rec,
              });
            }
          }
          const jobs = activeFilter === 'new_roles'
            ? flatJobs.filter(j => j.is_net_new)
            : flatJobs;
          if (jobs.length === 0) {
            return (
              <div className="text-center py-16 text-gray-500">
                <Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="font-medium">No jobs match this filter</p>
                <p className="text-sm mt-1">
                  {activeFilter === 'new_roles' && 'No new roles were added in the most recent tracker run.'}
                  {activeFilter === 'new_companies' && 'No new companies were added in the most recent tracker run.'}
                  {activeFilter === 'contacts_added' && 'No new contacts were added in the most recent tracker run.'}
                  {activeFilter === 'all_roles' && 'No jobs found. Run the tracker to discover new roles.'}
                </p>
              </div>
            );
          }
          return (
            <TrackerJobsTable
              jobs={jobs}
              jobTypeOptions={allJobTypes.map(jt => jt.name)}
              trackerRuns={runHistory}
              onDataRefresh={onComplete}
            />
          );
        })()}
      </div>

      {/* Run History */}
      {runHistory.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm">
          <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
            <span className="font-semibold text-gray-700 text-sm">Run History ({runHistory.length})</span>
            {showHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {showHistory && (
            <div className="border-t overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500">Status</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Duration</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">New Jobs</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Verified</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Rejected</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Closed</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Contacts</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Companies</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-500">Dupes</th>
                  </tr>
                </thead>
                <tbody>
                  {runHistory.map(r => {
                    const duration = r.started_at && r.completed_at
                      ? formatDuration(new Date(r.completed_at).getTime() - new Date(r.started_at).getTime())
                      : '-';
                    return (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2">{new Date(r.started_at).toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full ${r.run_type === 'full' ? 'bg-blue-100 text-blue-700' : r.run_type === 'checker_only' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{r.run_type}</span>
                        </td>
                        <td className="px-4 py-2">
                          {r.status === 'completed' ? <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Done</span> :
                           r.status === 'failed' ? <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span> :
                           <span className="text-blue-600 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Running</span>}
                        </td>
                        <td className="text-center px-4 py-2 font-mono text-gray-600">{duration}</td>
                        <td className="text-center px-4 py-2 font-semibold">{r.new_jobs_added || 0}</td>
                        <td className="text-center px-4 py-2 font-semibold text-emerald-600">{(r as any).jobs_verified || 0}</td>
                        <td className="text-center px-4 py-2 font-semibold text-red-400">{(r as any).jobs_rejected || 0}</td>
                        <td className="text-center px-4 py-2 font-semibold text-red-600">{r.jobs_closed || 0}</td>
                        <td className="text-center px-4 py-2 font-semibold text-green-600">{r.contacts_added || 0}</td>
                        <td className="text-center px-4 py-2 font-semibold text-purple-600">{r.new_companies_added || 0}</td>
                        <td className="text-center px-4 py-2 text-gray-500">{r.duplicates_skipped || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackerControls;
