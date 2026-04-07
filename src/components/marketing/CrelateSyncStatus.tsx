import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  Database, Building2, Users, Briefcase, CheckCircle, XCircle,
  AlertTriangle, Loader2, ChevronDown, ChevronRight, ExternalLink,
  RefreshCw, Shield, Clock, Search, Link2, Unlink, Wrench
} from 'lucide-react';

interface SyncCounts {
  companies: { total: number; synced: number; unsynced: number };
  contacts: { total: number; synced: number; unsynced: number };
  jobs: { total: number; synced: number; unsynced: number };
}

interface CompanyDetail {
  id: string;
  name: string;
  crelateId?: string | null;
}

interface VerifyResult {
  id: string;
  name: string;
  crelateId: string | null;
  status: 'valid' | 'missing' | 'invalid' | 'error';
  message: string;
}

interface VerifyResults {
  companies: VerifyResult[];
  contacts: VerifyResult[];
  jobs: VerifyResult[];
}

interface CrelateSyncStatusProps {
  companies: any[];
  contacts: any[];
  jobs: any[];
}

const CrelateSyncStatus: React.FC<CrelateSyncStatusProps> = ({ companies, contacts, jobs }) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncCounts, setSyncCounts] = useState<SyncCounts | null>(null);
  const [companyDetails, setCompanyDetails] = useState<{ synced: CompanyDetail[]; unsynced: CompanyDetail[] } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerifyResults | null>(null);
  const [verifySummary, setVerifySummary] = useState<{ total: number; valid: number; missing: number; invalid: number; errors: number } | null>(null);
  const [verifyTimestamp, setVerifyTimestamp] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [companyFilter, setCompanyFilter] = useState<'all' | 'synced' | 'unsynced'>('all');
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<{ fixed: number; errors: number; total: number; details: any[] } | null>(null);


  // Compute local sync counts from props (instant, no API call needed)
  const localCounts: SyncCounts = {
    companies: {
      total: companies.length,
      synced: companies.filter(c => c.notes && c.notes.includes('Crelate ID:')).length,
      unsynced: companies.filter(c => !c.notes || !c.notes.includes('Crelate ID:')).length,
    },
    contacts: {
      total: contacts.length,
      synced: contacts.filter(c => c.crelate_contact_id).length,
      unsynced: contacts.filter(c => !c.crelate_contact_id).length,
    },
    jobs: {
      total: jobs.length,
      synced: jobs.filter(j => j.notes && j.notes.includes('Crelate Job ID:')).length,
      unsynced: jobs.filter(j => !j.notes || !j.notes.includes('Crelate Job ID:')).length,
    },
  };

  const counts = syncCounts || localCounts;

  // Compute company details from props
  const localCompanyDetails = {
    synced: companies
      .filter(c => c.notes && c.notes.includes('Crelate ID:'))
      .map(c => {
        const match = (c.notes || '').match(/Crelate ID:\s*([a-f0-9-]+)/i);
        return { id: c.id, name: c.company_name, crelateId: match ? match[1] : null };
      }),
    unsynced: companies
      .filter(c => !c.notes || !c.notes.includes('Crelate ID:'))
      .map(c => ({ id: c.id, name: c.company_name })),
  };

  const compDetails = companyDetails || localCompanyDetails;

  // Compute last sync timestamp from props
  const computeLastSync = useCallback(() => {
    const timestamps: string[] = [];
    companies.forEach(c => {
      if (c.notes?.includes('Crelate ID:') && c.updated_at) timestamps.push(c.updated_at);
    });
    contacts.forEach(c => {
      if (c.crelate_contact_id && c.updated_at) timestamps.push(c.updated_at);
    });
    jobs.forEach(j => {
      if (j.notes?.includes('Crelate Job ID:') && j.updated_at) timestamps.push(j.updated_at);
    });
    timestamps.sort().reverse();
    return timestamps[0] || null;
  }, [companies, contacts, jobs]);

  useEffect(() => {
    if (!lastSyncAt) {
      setLastSyncAt(computeLastSync());
    }
  }, [computeLastSync, lastSyncAt]);

  const handleRefreshStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'get_sync_status' }
      });
      if (error) throw error;
      if (data?.counts) setSyncCounts(data.counts);
      if (data?.companyDetails) setCompanyDetails(data.companyDetails);
      if (data?.lastSyncAt) setLastSyncAt(data.lastSyncAt);
    } catch (err: any) {
      console.error('Failed to refresh sync status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLinks = async () => {
    setVerifying(true);
    setVerifyResults(null);
    setVerifySummary(null);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'verify_links', sampleSize: 5 }
      });
      if (error) throw error;
      if (data?.results) setVerifyResults(data.results);
      if (data?.summary) setVerifySummary(data.summary);
      if (data?.timestamp) setVerifyTimestamp(data.timestamp);
    } catch (err: any) {
      console.error('Failed to verify links:', err);
    } finally {
      setVerifying(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const totalSynced = counts.companies.synced + counts.contacts.synced + counts.jobs.synced;
  const totalRecords = counts.companies.total + counts.contacts.total + counts.jobs.total;
  const syncPercentage = totalRecords > 0 ? Math.round((totalSynced / totalRecords) * 100) : 0;

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never';
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Unknown';
    }
  };

  const renderSyncBar = (synced: number, total: number, color: string) => {
    const pct = total > 0 ? (synced / total) * 100 : 0;
    return (
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  };

  const renderVerifyStatusIcon = (status: string) => {
    switch (status) {
      case 'valid': return <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />;
      case 'missing': return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
      case 'invalid': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      case 'error': return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
      default: return null;
    }
  };

  const renderVerifyStatusBadge = (status: string) => {
    switch (status) {
      case 'valid': return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Valid</span>;
      case 'missing': return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Missing</span>;
      case 'invalid': return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Invalid</span>;
      case 'error': return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Error</span>;
      default: return null;
    }
  };

  const filteredCompanyList = companyFilter === 'synced'
    ? compDetails.synced
    : companyFilter === 'unsynced'
    ? compDetails.unsynced
    : [...compDetails.synced, ...compDetails.unsynced.map(c => ({ ...c, crelateId: null as string | null }))];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Compact Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <Database className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Crelate Sync Status</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              syncPercentage >= 75 ? 'bg-green-100 text-green-700' :
              syncPercentage >= 40 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {syncPercentage}% synced
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-gray-500">
              <span className="font-medium text-indigo-600">{totalSynced}</span>/{totalRecords} records
            </span>
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last sync: {formatTimestamp(lastSyncAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini sync bars */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="flex items-center gap-1" title={`Companies: ${counts.companies.synced}/${counts.companies.total}`}>
              <Building2 className="w-3 h-3 text-purple-500" />
              <div className="w-12 bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-purple-500 transition-all" style={{ width: `${counts.companies.total > 0 ? (counts.companies.synced / counts.companies.total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-1" title={`Contacts: ${counts.contacts.synced}/${counts.contacts.total}`}>
              <Users className="w-3 h-3 text-blue-500" />
              <div className="w-12 bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${counts.contacts.total > 0 ? (counts.contacts.synced / counts.contacts.total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-1" title={`Jobs: ${counts.jobs.synced}/${counts.jobs.total}`}>
              <Briefcase className="w-3 h-3 text-emerald-500" />
              <div className="w-12 bg-gray-200 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${counts.jobs.total > 0 ? (counts.jobs.synced / counts.jobs.total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Sync Counts Grid */}
          <div className="p-4 grid grid-cols-3 gap-3">
            {/* Companies */}
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-semibold text-purple-700">Companies</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-xl font-bold text-purple-700">{counts.companies.synced}</span>
                <span className="text-xs text-purple-500">/ {counts.companies.total}</span>
              </div>
              {renderSyncBar(counts.companies.synced, counts.companies.total, 'bg-purple-500')}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                  <Link2 className="w-2.5 h-2.5" /> {counts.companies.synced} synced
                </span>
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Unlink className="w-2.5 h-2.5" /> {counts.companies.unsynced} pending
                </span>
              </div>
            </div>

            {/* Contacts */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">Contacts</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-xl font-bold text-blue-700">{counts.contacts.synced}</span>
                <span className="text-xs text-blue-500">/ {counts.contacts.total}</span>
              </div>
              {renderSyncBar(counts.contacts.synced, counts.contacts.total, 'bg-blue-500')}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                  <Link2 className="w-2.5 h-2.5" /> {counts.contacts.synced} synced
                </span>
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Unlink className="w-2.5 h-2.5" /> {counts.contacts.unsynced} pending
                </span>
              </div>
            </div>

            {/* Jobs */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">Jobs</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1.5">
                <span className="text-xl font-bold text-emerald-700">{counts.jobs.synced}</span>
                <span className="text-xs text-emerald-500">/ {counts.jobs.total}</span>
              </div>
              {renderSyncBar(counts.jobs.synced, counts.jobs.total, 'bg-emerald-500')}
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                  <Link2 className="w-2.5 h-2.5" /> {counts.jobs.synced} synced
                </span>
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <Unlink className="w-2.5 h-2.5" /> {counts.jobs.unsynced} pending
                </span>
              </div>
            </div>
          </div>

          {/* Company Crelate ID Details */}
          <div className="px-4 pb-3">
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('companyDetails')}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                {expandedSections.companyDetails ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                <Building2 className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs font-semibold text-gray-700">Company Crelate ID Details</span>
                <span className="ml-auto text-[10px] text-gray-400">
                  {compDetails.synced.length} with IDs, {compDetails.unsynced.length} without
                </span>
              </button>
              {expandedSections.companyDetails && (
                <div>
                  {/* Filter tabs */}
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
                    {(['all', 'synced', 'unsynced'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setCompanyFilter(f)}
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                          companyFilter === f
                            ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                      >
                        {f === 'all' ? `All (${compDetails.synced.length + compDetails.unsynced.length})` :
                         f === 'synced' ? `With ID (${compDetails.synced.length})` :
                         `No ID (${compDetails.unsynced.length})`}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {filteredCompanyList.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-gray-400">No companies in this filter</div>
                    ) : (
                      filteredCompanyList.map((c, i) => (
                        <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                          {c.crelateId ? (
                            <Link2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          ) : (
                            <Unlink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                          )}
                          <span className="flex-1 text-gray-700 truncate font-medium">{c.name}</span>
                          {c.crelateId ? (
                            <a
                              href={`https://app.crelate.com/go#stage/_Companies/DefaultView/${c.crelateId}/summary`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 flex-shrink-0"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              {c.crelateId.substring(0, 8)}...
                            </a>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Not synced</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Verify Crelate Links */}
          <div className="px-4 pb-3">
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50">
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-gray-700">Link Verification</span>
                <span className="text-[10px] text-gray-400 ml-1">Spot-check synced records in Crelate API</span>
                <div className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerifyLinks}
                    disabled={verifying}
                    className="h-7 text-[11px] gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    {verifying ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Checking...</>
                    ) : (
                      <><Search className="w-3 h-3" /> Verify Crelate Links</>
                    )}
                  </Button>
                </div>
              </div>

              {verifying && (
                <div className="px-3 py-4 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Checking 5 records of each type against Crelate API...</p>
                  <p className="text-[10px] text-gray-400 mt-1">This may take 30-60 seconds due to rate limiting</p>
                </div>
              )}

              {verifySummary && !verifying && (
                <div className="border-t">
                  {/* Summary row */}
                  <div className="px-3 py-2.5 flex items-center gap-3 bg-white">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        verifySummary.valid === verifySummary.total ? 'bg-green-100 text-green-700' :
                        verifySummary.missing > 0 ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {verifySummary.valid === verifySummary.total ? (
                          <><CheckCircle className="w-3 h-3" /> All {verifySummary.total} links valid</>
                        ) : (
                          <><AlertTriangle className="w-3 h-3" /> {verifySummary.valid}/{verifySummary.total} valid</>
                        )}
                      </span>
                      {verifySummary.missing > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                          {verifySummary.missing} missing
                        </span>
                      )}
                      {verifySummary.invalid > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
                          {verifySummary.invalid} invalid
                        </span>
                      )}
                      {verifySummary.errors > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                          {verifySummary.errors} errors
                        </span>
                      )}
                    </div>
                    <span className="ml-auto text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {verifyTimestamp ? formatTimestamp(verifyTimestamp) : ''}
                    </span>
                  </div>

                  {/* Detailed results */}
                  {verifyResults && (
                    <div>
                      {/* Companies verification */}
                      {verifyResults.companies.length > 0 && (
                        <div className="border-t">
                          <button
                            onClick={() => toggleSection('verifyCompanies')}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                          >
                            {expandedSections.verifyCompanies ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                            <Building2 className="w-3 h-3 text-purple-500" />
                            <span className="text-[11px] font-medium text-gray-700">Companies ({verifyResults.companies.length})</span>
                            <span className="ml-auto text-[10px] text-green-600">{verifyResults.companies.filter(r => r.status === 'valid').length} valid</span>
                          </button>
                          {expandedSections.verifyCompanies && verifyResults.companies.map((r, i) => (
                            <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-t border-gray-50 ${
                              r.status === 'missing' ? 'bg-red-50/50' : r.status === 'error' ? 'bg-red-50/30' : ''
                            }`}>
                              {renderVerifyStatusIcon(r.status)}
                              <span className="font-medium text-gray-700 truncate flex-1">{r.name}</span>
                              {renderVerifyStatusBadge(r.status)}
                              <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{r.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Contacts verification */}
                      {verifyResults.contacts.length > 0 && (
                        <div className="border-t">
                          <button
                            onClick={() => toggleSection('verifyContacts')}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                          >
                            {expandedSections.verifyContacts ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                            <Users className="w-3 h-3 text-blue-500" />
                            <span className="text-[11px] font-medium text-gray-700">Contacts ({verifyResults.contacts.length})</span>
                            <span className="ml-auto text-[10px] text-green-600">{verifyResults.contacts.filter(r => r.status === 'valid').length} valid</span>
                          </button>
                          {expandedSections.verifyContacts && verifyResults.contacts.map((r, i) => (
                            <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-t border-gray-50 ${
                              r.status === 'missing' ? 'bg-red-50/50' : r.status === 'error' ? 'bg-red-50/30' : ''
                            }`}>
                              {renderVerifyStatusIcon(r.status)}
                              <span className="font-medium text-gray-700 truncate flex-1">{r.name}</span>
                              {renderVerifyStatusBadge(r.status)}
                              <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{r.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Jobs verification */}
                      {verifyResults.jobs.length > 0 && (
                        <div className="border-t">
                          <button
                            onClick={() => toggleSection('verifyJobs')}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                          >
                            {expandedSections.verifyJobs ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                            <Briefcase className="w-3 h-3 text-emerald-500" />
                            <span className="text-[11px] font-medium text-gray-700">Jobs ({verifyResults.jobs.length})</span>
                            <span className="ml-auto text-[10px] text-green-600">{verifyResults.jobs.filter(r => r.status === 'valid').length} valid</span>
                          </button>
                          {expandedSections.verifyJobs && verifyResults.jobs.map((r, i) => (
                            <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-t border-gray-50 ${
                              r.status === 'missing' ? 'bg-red-50/50' : r.status === 'error' ? 'bg-red-50/30' : ''
                            }`}>
                              {renderVerifyStatusIcon(r.status)}
                              <span className="font-medium text-gray-700 truncate flex-1">{r.name}</span>
                              {renderVerifyStatusBadge(r.status)}
                              <span className="text-[10px] text-gray-400 truncate max-w-[200px]">{r.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Last Sync Info & Refresh */}
          <div className="px-4 pb-4 flex items-center justify-between">
            <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Last sync activity: {lastSyncAt ? (
                <span className="font-medium text-gray-600">
                  {new Date(lastSyncAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true
                  })}
                </span>
              ) : (
                <span className="italic">No sync recorded</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshStatus}
              disabled={loading}
              className="h-7 text-[11px] gap-1 text-gray-500 hover:text-indigo-600"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh from DB'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrelateSyncStatus;
