import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  X, AlertTriangle, Download, Loader2, Search, RefreshCw,
  ChevronDown, ChevronRight, FileText, Briefcase, CheckCircle,
  ArrowRight, Info, BarChart3, Tag
} from 'lucide-react';

interface UnmatchedTitle {
  title: string;
  count: number;
  companies?: string[];
  bestScore: number;
  bestCandidate: string;
  simplified: string;
  baseRole: string;
  sampleJobs?: { id: string; company: string; location: string }[];
}

interface MatchedTitle {
  title: string;
  matchedTo: string;
  method: string;
  count: number;
}

interface TitleMatchReport {
  totalJobsPushed?: number;
  jobsWithTitle?: number;
  jobsWithoutTitle?: number;
  matchRate: number;
  unmatchedTitles: UnmatchedTitle[];
  unmatchedCount: number;
  totalAffectedJobs: number;
}

interface MissingTitlesReportProps {
  // If provided, show inline report from push results
  titleMatchReport?: TitleMatchReport | null;
  // If true, show as standalone dialog with scan capability
  standalone?: boolean;
  onClose?: () => void;
}

const MissingTitlesReport: React.FC<MissingTitlesReportProps> = ({
  titleMatchReport: initialReport,
  standalone = false,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(initialReport ? {
    ...initialReport,
    totalScanned: initialReport.totalJobsPushed,
    totalMatched: initialReport.jobsWithTitle,
    totalUnmatched: initialReport.jobsWithoutTitle,
  } : null);
  const [searchFilter, setSearchFilter] = useState('');
  const [showMatched, setShowMatched] = useState(false);
  const [matchedTitles, setMatchedTitles] = useState<MatchedTitle[]>([]);
  const [availableTitles, setAvailableTitles] = useState<string[]>([]);
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);

  const handleScan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'get_missing_titles', openOnly: true }
      });
      if (error) throw error;
      if (data?.success) {
        setReport(data);
        setMatchedTitles(data.matchedTitles || []);
        setAvailableTitles(data.availableTitles || []);
      } else {
        throw new Error(data?.error || 'Failed to scan titles');
      }
    } catch (err: any) {
      console.error('Missing titles scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  const unmatchedTitles: UnmatchedTitle[] = useMemo(() => {
    const titles = report?.unmatchedTitles || [];
    if (!searchFilter) return titles;
    const s = searchFilter.toLowerCase();
    return titles.filter((t: UnmatchedTitle) =>
      t.title.toLowerCase().includes(s) ||
      t.simplified?.toLowerCase().includes(s) ||
      t.baseRole?.toLowerCase().includes(s) ||
      t.companies?.some((c: string) => c.toLowerCase().includes(s))
    );
  }, [report, searchFilter]);

  const filteredMatchedTitles = useMemo(() => {
    if (!searchFilter) return matchedTitles;
    const s = searchFilter.toLowerCase();
    return matchedTitles.filter(t =>
      t.title.toLowerCase().includes(s) ||
      t.matchedTo.toLowerCase().includes(s)
    );
  }, [matchedTitles, searchFilter]);

  const handleExportCSV = () => {
    if (!unmatchedTitles.length) return;

    const headers = [
      'Missing Title',
      'Jobs Affected',
      'Simplified Title',
      'Base Role',
      'Best Match Score (%)',
      'Closest Existing Title',
      'Companies'
    ];

    const rows = unmatchedTitles.map(t => [
      `"${t.title.replace(/"/g, '""')}"`,
      t.count,
      `"${(t.simplified || '').replace(/"/g, '""')}"`,
      `"${(t.baseRole || '').replace(/"/g, '""')}"`,
      t.bestScore,
      `"${(t.bestCandidate || 'None').replace(/"/g, '""')}"`,
      `"${(t.companies || []).join('; ').replace(/"/g, '""')}"`
    ]);

    // Add summary section
    const totalAffected = unmatchedTitles.reduce((sum, t) => sum + t.count, 0);
    const summaryRows = [
      [],
      ['--- SUMMARY ---'],
      [`Total Missing Titles,${unmatchedTitles.length}`],
      [`Total Jobs Affected,${totalAffected}`],
      [`Match Rate,${report?.matchRate || 0}%`],
      [`Titles in Crelate,${report?.titlesCached || availableTitles.length}`],
      [`Report Generated,${new Date().toISOString()}`],
      [],
      ['--- SUGGESTED TITLES TO CREATE IN CRELATE ---'],
      ['Title to Create,Jobs That Would Match,Priority']
    ];

    // Add suggested titles (deduplicated by simplified or base role)
    const suggestions = new Map<string, { title: string; count: number }>();
    for (const t of unmatchedTitles) {
      const key = t.simplified || t.baseRole || t.title;
      const existing = suggestions.get(key);
      if (existing) {
        existing.count += t.count;
      } else {
        suggestions.set(key, { title: key, count: t.count });
      }
    }
    const sortedSuggestions = [...suggestions.values()].sort((a, b) => b.count - a.count);
    for (const s of sortedSuggestions) {
      summaryRows.push([
        `"${s.title.replace(/"/g, '""')}"`,
        String(s.count),
        s.count >= 5 ? 'HIGH' : s.count >= 2 ? 'MEDIUM' : 'LOW'
      ] as any);
    }

    // Also add existing titles for reference
    if (availableTitles.length > 0) {
      summaryRows.push([] as any);
      summaryRows.push(['--- EXISTING CRELATE TITLES (for reference) ---'] as any);
      for (const t of availableTitles) {
        summaryRows.push([`"${t.replace(/"/g, '""')}"`] as any);
      }
    }

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(',')),
      ...summaryRows.map(r => (r as any[]).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missing-crelate-titles-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getScoreBadge = (score: number) => {
    if (score >= 30) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (score >= 15) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getPriorityBadge = (count: number) => {
    if (count >= 5) return { label: 'HIGH', cls: 'bg-red-100 text-red-700 border-red-200' };
    if (count >= 2) return { label: 'MED', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'LOW', cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  };

  const content = (
    <div className="space-y-4">
      {/* Header info */}
      {!report && standalone && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Missing Job Titles Report</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Scan all open jobs against Crelate's available job titles to find titles that need to be created.
            Since POST /jobtitles returns 403, new titles must be created by a Crelate admin.
          </p>
          <Button
            onClick={handleScan}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Scanning all jobs...</>
            ) : (
              <><Search className="w-4 h-4" /> Scan All Open Jobs</>
            )}
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Scanning all jobs against {report?.titlesCached || '~50'} Crelate titles...</p>
          <p className="text-xs text-gray-400 mt-1">This uses the local cache — no extra API calls per job</p>
        </div>
      )}

      {/* Report content */}
      {report && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{report.totalScanned || report.totalJobsPushed || 0}</p>
              <p className="text-xs text-blue-600 font-medium">Jobs Scanned</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{report.totalMatched || report.jobsWithTitle || 0}</p>
              <p className="text-xs text-green-600 font-medium">Titles Matched</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{report.totalUnmatched || report.jobsWithoutTitle || 0}</p>
              <p className="text-xs text-red-600 font-medium">No Title Match</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{report.matchRate || 0}%</p>
              <p className="text-xs text-amber-600 font-medium">Match Rate</p>
            </div>
          </div>

          {/* Match rate bar */}
          <div className="bg-gray-50 rounded-lg border p-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
              <span className="font-medium">Title Match Coverage</span>
              <span>{report.matchRate || 0}% of jobs have a valid JobTitleId</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  (report.matchRate || 0) >= 80 ? 'bg-green-500' :
                  (report.matchRate || 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${report.matchRate || 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
              <span>{report.titlesCached || availableTitles.length || 0} titles available in Crelate</span>
              <span>{(report.unmatchedTitles || []).length} unique titles missing</span>
            </div>
          </div>

          {/* Action bar */}
          {(report.unmatchedTitles || []).length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter titles..."
                  value={searchFilter}
                  onChange={e => setSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Download className="w-4 h-4" /> Export CSV for Crelate Admin
              </Button>
              {standalone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScan}
                  disabled={loading}
                  className="gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Rescan
                </Button>
              )}
            </div>
          )}

          {/* Info banner */}
          {(report.unmatchedTitles || []).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold mb-0.5">Why are these titles missing?</p>
                <p>Crelate only has {report.titlesCached || availableTitles.length || '~50'} pre-defined job titles, and POST /jobtitles returns 403 (no permission to create new ones via API). Export this report as CSV and send it to your Crelate admin to bulk-create the missing titles. Once created, future pushes will automatically match them.</p>
              </div>
            </div>
          )}

          {/* Unmatched titles table */}
          {unmatchedTitles.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">
                    Missing Titles ({unmatchedTitles.length} unique, {unmatchedTitles.reduce((s, t) => s + t.count, 0)} jobs affected)
                  </span>
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Title</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[70px]">Jobs</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[70px]">Priority</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Closest Match</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[70px]">Score</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Suggested Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedTitles.map((t, i) => {
                      const priority = getPriorityBadge(t.count);
                      const isExpanded = expandedTitle === t.title;
                      return (
                        <React.Fragment key={i}>
                          <tr
                            className={`border-b cursor-pointer transition-colors ${
                              isExpanded ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'
                            }`}
                            onClick={() => setExpandedTitle(isExpanded ? null : t.title)}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                <span className="font-medium text-gray-900">{t.title}</span>
                              </div>
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span className="font-bold text-gray-900">{t.count}</span>
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${priority.cls}`}>
                                {priority.label}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">
                              {t.bestCandidate || <span className="text-gray-300">None</span>}
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${getScoreBadge(t.bestScore)}`}>
                                {t.bestScore}%
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {t.simplified || t.baseRole || t.title}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-amber-50/50">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                  <div>
                                    <p className="font-semibold text-gray-600 mb-1">Title Analysis</p>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <Tag className="w-3 h-3 text-gray-400" />
                                        <span className="text-gray-500">Original:</span>
                                        <span className="text-gray-900">{t.title}</span>
                                      </div>
                                      {t.simplified && t.simplified !== t.title && (
                                        <div className="flex items-center gap-1.5">
                                          <ArrowRight className="w-3 h-3 text-gray-400" />
                                          <span className="text-gray-500">Simplified:</span>
                                          <span className="text-gray-900">{t.simplified}</span>
                                        </div>
                                      )}
                                      {t.baseRole && (
                                        <div className="flex items-center gap-1.5">
                                          <ArrowRight className="w-3 h-3 text-gray-400" />
                                          <span className="text-gray-500">Base Role:</span>
                                          <span className="text-gray-900">{t.baseRole}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-600 mb-1">Best Match Analysis</p>
                                    {t.bestCandidate ? (
                                      <div className="space-y-1">
                                        <p className="text-gray-700">
                                          Closest: <span className="font-medium">{t.bestCandidate}</span>
                                        </p>
                                        <p className="text-gray-500">
                                          Score: {t.bestScore}% (needs 35% to auto-match)
                                        </p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-400">No similar titles found in Crelate</p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-600 mb-1">Companies ({(t.companies || []).length})</p>
                                    <div className="flex flex-wrap gap-1">
                                      {(t.companies || []).slice(0, 8).map((c, ci) => (
                                        <span key={ci} className="bg-white border rounded px-1.5 py-0.5 text-gray-700">{c}</span>
                                      ))}
                                      {(t.companies || []).length > 8 && (
                                        <span className="text-gray-400">+{(t.companies || []).length - 8} more</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Matched titles (collapsible) */}
          {matchedTitles.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowMatched(!showMatched)}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-green-50 hover:bg-green-100 transition-colors text-left border-b border-green-100"
              >
                {showMatched ? <ChevronDown className="w-4 h-4 text-green-500" /> : <ChevronRight className="w-4 h-4 text-green-500" />}
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-800">
                  Successfully Matched Titles ({filteredMatchedTitles.length})
                </span>
              </button>
              {showMatched && (
                <div className="max-h-[250px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Job Title</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Matched To</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Method</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatchedTitles.map((t, i) => (
                        <tr key={i} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                          <td className="px-4 py-2 text-gray-900">{t.title}</td>
                          <td className="px-4 py-2 text-green-700 font-medium">{t.matchedTo}</td>
                          <td className="text-center px-3 py-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                              {t.method}
                            </span>
                          </td>
                          <td className="text-center px-3 py-2 font-medium">{t.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* No unmatched titles */}
          {(report.unmatchedTitles || []).length === 0 && (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-900 mb-1">All Titles Matched!</h3>
              <p className="text-sm text-gray-500">Every job title was successfully matched to a Crelate job title.</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Standalone dialog wrapper
  if (standalone) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shadow-md">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Missing Titles Report</h2>
                <p className="text-xs text-gray-500">Identify job titles that need to be created in Crelate</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {content}
          </div>

          {/* Footer */}
          <div className="border-t bg-gray-50 px-6 py-3 flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {report ? `Scanned ${report.totalScanned || 0} jobs • ${report.titlesCached || 0} Crelate titles cached` : 'Click "Scan All Open Jobs" to generate the report'}
            </div>
            <div className="flex items-center gap-2">
              {report && (report.unmatchedTitles || []).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Inline mode (embedded in PushToCrelate results)
  return content;
};

export default MissingTitlesReport;
