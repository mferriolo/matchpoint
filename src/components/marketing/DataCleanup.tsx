import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2, Trash2, XCircle, CheckCircle, AlertTriangle, Shield,
  ShieldCheck, Building2, Briefcase, RefreshCw, ChevronDown, ChevronUp,
  Ban, Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface StatusBreakdown {
  url_status: string;
  job_count: number;
  company_count: number;
  companies: { company_name: string; count: number }[];
}

interface DataCleanupProps {
  onClose: () => void;
  onComplete: () => void;
}

const STATUS_INFO: Record<string, { label: string; description: string; color: string; bgColor: string; icon: React.ReactNode; recommended: boolean }> = {
  pending: {
    label: 'Pending (Unverified)',
    description: 'Jobs added without SerpAPI verification — should not be in the database',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50 border-orange-200',
    icon: <AlertTriangle className="w-4 h-4 text-orange-500" />,
    recommended: true,
  },
  dead: {
    label: 'Dead Links',
    description: 'Jobs whose URLs were checked and found to be inactive or expired',
    color: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
    icon: <Ban className="w-4 h-4 text-red-500" />,
    recommended: true,
  },
  closed: {
    label: 'Closed',
    description: 'Jobs that have been marked as closed (company no longer hiring for this role)',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50 border-gray-200',
    icon: <XCircle className="w-4 h-4 text-gray-500" />,
    recommended: false,
  },
  active: {
    label: 'Active (Legacy Verified)',
    description: 'Jobs verified by the old DuckDuckGo system — not SerpAPI verified',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    icon: <Activity className="w-4 h-4 text-blue-500" />,
    recommended: false,
  },
  live: {
    label: 'Live (SerpAPI Verified)',
    description: 'Jobs confirmed active via SerpAPI Google Jobs search — keep these',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
    icon: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
    recommended: false,
  },
};

const DataCleanup: React.FC<DataCleanupProps> = ({ onClose, onComplete }) => {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(true);
  const [breakdowns, setBreakdowns] = useState<StatusBreakdown[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'preview' | 'confirm' | 'deleting' | 'done'>('preview');
  const [deleteProgress, setDeleteProgress] = useState({ deleted: 0, total: 0, updatingCompanies: false });
  const [deletionResults, setDeletionResults] = useState<{ jobsDeleted: number; companiesUpdated: number; companiesRemoved: number } | null>(null);

  // Scan database for jobs by url_status
  const scanDatabase = useCallback(async () => {
    setScanning(true);
    try {
      // Get all jobs grouped by url_status and company
      const { data: jobs, error } = await supabase
        .from('marketing_jobs')
        .select('url_status, company_name')
        .order('company_name');

      if (error) throw error;

      // Build breakdowns
      const statusMap: Record<string, { companies: Record<string, number> }> = {};
      
      for (const job of (jobs || [])) {
        const status = job.url_status || 'unknown';
        if (!statusMap[status]) {
          statusMap[status] = { companies: {} };
        }
        const companyName = job.company_name || 'Unknown';
        statusMap[status].companies[companyName] = (statusMap[status].companies[companyName] || 0) + 1;
      }

      const results: StatusBreakdown[] = Object.entries(statusMap).map(([status, data]) => {
        const companies = Object.entries(data.companies)
          .map(([name, count]) => ({ company_name: name, count }))
          .sort((a, b) => b.count - a.count);
        
        return {
          url_status: status,
          job_count: companies.reduce((sum, c) => sum + c.count, 0),
          company_count: companies.length,
          companies,
        };
      }).sort((a, b) => b.job_count - a.job_count);

      setBreakdowns(results);

      // Auto-select recommended statuses that have jobs
      const autoSelect = new Set<string>();
      for (const b of results) {
        const info = STATUS_INFO[b.url_status];
        if (info?.recommended && b.job_count > 0) {
          autoSelect.add(b.url_status);
        }
      }
      setSelectedStatuses(autoSelect);
    } catch (err: any) {
      toast({ title: 'Scan Error', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    scanDatabase();
  }, [scanDatabase]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const toggleExpanded = (status: string) => {
    setExpandedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const selectedJobCount = breakdowns
    .filter(b => selectedStatuses.has(b.url_status))
    .reduce((sum, b) => sum + b.job_count, 0);

  const selectedCompanyNames = new Set<string>();
  breakdowns
    .filter(b => selectedStatuses.has(b.url_status))
    .forEach(b => b.companies.forEach(c => selectedCompanyNames.add(c.company_name)));

  // Execute cleanup
  const executeCleanup = async () => {
    if (selectedStatuses.size === 0) return;
    
    setStep('deleting');
    const statusArray = Array.from(selectedStatuses);
    let totalDeleted = 0;

    try {
      // Delete jobs by selected statuses
      setDeleteProgress({ deleted: 0, total: selectedJobCount, updatingCompanies: false });

      // Delete in batches by status
      for (const status of statusArray) {
        const { error, count } = await supabase
          .from('marketing_jobs')
          .delete({ count: 'exact' })
          .eq('url_status', status);

        if (error) {
          console.warn(`Error deleting jobs with status ${status}:`, error.message);
        } else {
          totalDeleted += (count || 0);
          setDeleteProgress(prev => ({ ...prev, deleted: totalDeleted }));
        }
      }

      // Now update company counts
      setDeleteProgress(prev => ({ ...prev, updatingCompanies: true }));

      // Get remaining jobs per company
      const { data: remainingJobs, error: rjError } = await supabase
        .from('marketing_jobs')
        .select('company_name, is_closed, status')
        .not('is_closed', 'eq', true);

      if (rjError) {
        console.warn('Error fetching remaining jobs:', rjError.message);
      }

      // Count open roles per company
      const openRolesMap: Record<string, number> = {};
      for (const job of (remainingJobs || [])) {
        if (job.status !== 'Closed') {
          const name = job.company_name || 'Unknown';
          openRolesMap[name] = (openRolesMap[name] || 0) + 1;
        }
      }

      // Get all companies
      const { data: allCompanies, error: acError } = await supabase
        .from('marketing_companies')
        .select('id, company_name, open_roles_count');

      if (acError) {
        console.warn('Error fetching companies:', acError.message);
      }

      let companiesUpdated = 0;
      let companiesRemoved = 0;

      for (const company of (allCompanies || [])) {
        const newCount = openRolesMap[company.company_name] || 0;
        
        if (newCount === 0) {
          // Check if company has ANY remaining jobs at all
          const { data: anyJobs } = await supabase
            .from('marketing_jobs')
            .select('id')
            .eq('company_name', company.company_name)
            .limit(1);

          if (!anyJobs || anyJobs.length === 0) {
            // No jobs left for this company - check if it has contacts
            const { data: anyContacts } = await supabase
              .from('marketing_contacts')
              .select('id')
              .eq('company_name', company.company_name)
              .limit(1);

            // Only update count, don't delete company (keep for contact reference)
            if (company.open_roles_count !== 0) {
              await supabase
                .from('marketing_companies')
                .update({ open_roles_count: 0, updated_at: new Date().toISOString() })
                .eq('id', company.id);
              companiesUpdated++;
            }
          } else {
            // Has jobs but none open
            if (company.open_roles_count !== 0) {
              await supabase
                .from('marketing_companies')
                .update({ open_roles_count: 0, updated_at: new Date().toISOString() })
                .eq('id', company.id);
              companiesUpdated++;
            }
          }
        } else if (company.open_roles_count !== newCount) {
          await supabase
            .from('marketing_companies')
            .update({ open_roles_count: newCount, updated_at: new Date().toISOString() })
            .eq('id', company.id);
          companiesUpdated++;
        }
      }

      setDeletionResults({
        jobsDeleted: totalDeleted,
        companiesUpdated,
        companiesRemoved,
      });
      setStep('done');

      toast({
        title: 'Cleanup Complete',
        description: `Removed ${totalDeleted} jobs. Updated ${companiesUpdated} company counts.`,
      });

      onComplete();
    } catch (err: any) {
      toast({ title: 'Cleanup Error', description: err.message, variant: 'destructive' });
      setStep('preview');
    }
  };

  const totalJobs = breakdowns.reduce((sum, b) => sum + b.job_count, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-red-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Data Cleanup Tool</h3>
              <p className="text-sm text-gray-500">
                Remove unverified and dead jobs from previous tracker runs
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {scanning ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-3" />
              <p className="text-sm text-gray-500 font-medium">Scanning database...</p>
              <p className="text-xs text-gray-400 mt-1">Analyzing jobs by verification status</p>
            </div>
          ) : step === 'preview' || step === 'confirm' ? (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {totalJobs} total jobs in database
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Select which job statuses to remove. Recommended cleanup targets are pre-selected.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={scanDatabase}
                    className="gap-1.5 text-gray-600"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Rescan
                  </Button>
                </div>
              </div>

              {/* Status breakdown cards */}
              <div className="space-y-2">
                {breakdowns.map(b => {
                  const info = STATUS_INFO[b.url_status] || {
                    label: b.url_status,
                    description: 'Unknown status',
                    color: 'text-gray-700',
                    bgColor: 'bg-gray-50 border-gray-200',
                    icon: <AlertTriangle className="w-4 h-4 text-gray-500" />,
                    recommended: false,
                  };
                  const isSelected = selectedStatuses.has(b.url_status);
                  const isExpanded = expandedStatuses.has(b.url_status);

                  return (
                    <div
                      key={b.url_status}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        isSelected
                          ? 'border-red-300 bg-red-50/30 ring-1 ring-red-200 shadow-sm'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Status row */}
                      <div className="flex items-center gap-3 p-4">
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleStatus(b.url_status)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            isSelected
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'border-gray-300 hover:border-red-400'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>

                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${info.bgColor} border`}>
                          {info.icon}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${info.color}`}>
                              {info.label}
                            </span>
                            {info.recommended && b.job_count > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold uppercase tracking-wider">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
                        </div>

                        {/* Count */}
                        <div className="text-right flex-shrink-0">
                          <div className={`text-xl font-bold ${b.job_count === 0 ? 'text-gray-300' : info.color}`}>
                            {b.job_count}
                          </div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                            {b.job_count === 1 ? 'job' : 'jobs'}
                          </div>
                        </div>

                        {/* Expand toggle */}
                        {b.job_count > 0 && (
                          <button
                            onClick={() => toggleExpanded(b.url_status)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      {/* Expanded company list */}
                      {isExpanded && b.companies.length > 0 && (
                        <div className="border-t bg-gray-50/50 px-4 py-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {b.company_count} companies affected
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                            {b.companies.map(c => (
                              <div
                                key={c.company_name}
                                className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-white border border-gray-100"
                              >
                                <span className="truncate text-gray-700 font-medium">{c.company_name}</span>
                                <span className="text-gray-400 font-mono flex-shrink-0 ml-2">{c.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Show message if no pending jobs found */}
                {!breakdowns.find(b => b.url_status === 'pending') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">
                        No jobs with url_status='pending' found
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Previous runs may have used 'dead' or 'active' status instead. 
                        The <strong>496 dead</strong> jobs are the primary cleanup target — these are jobs whose links were verified as inactive.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm step */}
              {step === 'confirm' && selectedJobCount > 0 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mt-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-red-900">Confirm Deletion</h4>
                      <p className="text-xs text-red-700 mt-1">
                        This will permanently delete <strong>{selectedJobCount} jobs</strong> with status: {Array.from(selectedStatuses).map(s => STATUS_INFO[s]?.label || s).join(', ')}.
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        Company open role counts will be recalculated after deletion.
                      </p>
                      <p className="text-xs text-red-500 mt-2 font-semibold">
                        This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : step === 'deleting' ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-10 h-10 animate-spin text-red-500 mb-4" />
              <p className="text-sm font-semibold text-gray-900">
                {deleteProgress.updatingCompanies
                  ? 'Updating company counts...'
                  : `Deleting jobs... ${deleteProgress.deleted} / ${deleteProgress.total}`}
              </p>
              <p className="text-xs text-gray-500 mt-1">Please wait, this may take a moment</p>
              {!deleteProgress.updatingCompanies && deleteProgress.total > 0 && (
                <div className="w-64 mt-4">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((deleteProgress.deleted / deleteProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-center mt-1">
                    {Math.round((deleteProgress.deleted / deleteProgress.total) * 100)}%
                  </p>
                </div>
              )}
            </div>
          ) : step === 'done' && deletionResults ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-1">Cleanup Complete</h4>
              <p className="text-sm text-gray-500 mb-6">The database has been cleaned up successfully.</p>
              
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <Trash2 className="w-5 h-5 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-700">{deletionResults.jobsDeleted}</p>
                  <p className="text-xs text-red-600 font-medium">Jobs Removed</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <Building2 className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-blue-700">{deletionResults.companiesUpdated}</p>
                  <p className="text-xs text-blue-600 font-medium">Companies Updated</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4 w-full max-w-sm">
                <p className="text-xs text-green-700 text-center">
                  Company open role counts have been recalculated to reflect only remaining active jobs.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between">
          {step === 'preview' ? (
            <>
              <div className="text-xs text-gray-500">
                {selectedJobCount > 0 ? (
                  <span className="text-red-600 font-semibold">
                    {selectedJobCount} jobs selected for removal across {selectedCompanyNames.size} companies
                  </span>
                ) : (
                  'Select job statuses to clean up'
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={() => setStep('confirm')}
                  disabled={selectedJobCount === 0}
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Preview Cleanup ({selectedJobCount})
                </Button>
              </div>
            </>
          ) : step === 'confirm' ? (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={executeCleanup}
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Yes, Delete {selectedJobCount} Jobs
                </Button>
              </div>
            </>
          ) : step === 'deleting' ? (
            <div className="w-full text-center text-xs text-gray-400">
              Do not close this window while cleanup is in progress
            </div>
          ) : (
            <div className="w-full flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataCleanup;
