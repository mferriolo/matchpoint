import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import {
  X, Plus, Trash2, Loader2, Search, RefreshCw, Download, Upload,
  CheckCircle, XCircle, AlertTriangle, ArrowRight, ArrowRightLeft,
  ChevronDown, ChevronRight, Zap, FileText, Link2, Tag, Info, Save
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Mapping {
  id: string;
  tracker_title: string;
  crelate_title: string;
  crelate_title_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AvailableTitle {
  id: string;
  title: string;
}

interface UnmatchedSuggestion {
  title: string;
  count: number;
  bestScore: number;
  bestCandidate: string;
  simplified: string;
  baseRole: string;
  companies?: string[];
}

interface TitleMappingProps {
  onClose: () => void;
}

const TitleMapping: React.FC<TitleMappingProps> = ({ onClose }) => {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [availableTitles, setAvailableTitles] = useState<AvailableTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add new mapping form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTrackerTitle, setNewTrackerTitle] = useState('');
  const [newCrelateTitle, setNewCrelateTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [crTitleSearch, setCrTitleSearch] = useState('');
  const [showCrDropdown, setShowCrDropdown] = useState(false);

  // Suggestions from missing titles
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<UnmatchedSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Record<string, string>>({});
  const [savingSuggestions, setSavingSuggestions] = useState(false);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'get_title_mappings' }
      });
      if (error) throw error;
      if (data?.success) {
        setMappings(data.mappings || []);
        setAvailableTitles(data.availableTitles || []);
      } else {
        throw new Error(data?.error || 'Failed to load mappings');
      }
    } catch (err: any) {
      toast({ title: 'Error loading mappings', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const filteredMappings = useMemo(() => {
    if (!searchFilter) return mappings;
    const s = searchFilter.toLowerCase();
    return mappings.filter(m =>
      m.tracker_title.toLowerCase().includes(s) ||
      m.crelate_title.toLowerCase().includes(s) ||
      m.notes?.toLowerCase().includes(s)
    );
  }, [mappings, searchFilter]);

  const filteredCrTitles = useMemo(() => {
    if (!crTitleSearch) return availableTitles;
    const s = crTitleSearch.toLowerCase();
    return availableTitles.filter(t => t.title.toLowerCase().includes(s));
  }, [availableTitles, crTitleSearch]);

  const handleAddMapping = async () => {
    if (!newTrackerTitle.trim() || !newCrelateTitle.trim()) {
      toast({ title: 'Both fields required', description: 'Enter a tracker title and select a Crelate title', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: {
          action: 'save_title_mapping',
          tracker_title: newTrackerTitle.trim(),
          crelate_title: newCrelateTitle.trim(),
          notes: newNotes.trim() || null
        }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to save');
      toast({ title: 'Mapping saved', description: `"${newTrackerTitle}" → "${newCrelateTitle}"` });
      setNewTrackerTitle('');
      setNewCrelateTitle('');
      setNewNotes('');
      setCrTitleSearch('');
      setShowAddForm(false);
      await loadMappings();
    } catch (err: any) {
      toast({ title: 'Error saving mapping', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (mapping: Mapping) => {
    setDeletingId(mapping.id);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'delete_title_mapping', id: mapping.id }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to delete');
      toast({ title: 'Mapping deleted', description: `Removed mapping for "${mapping.tracker_title}"` });
      setMappings(prev => prev.filter(m => m.id !== mapping.id));
    } catch (err: any) {
      toast({ title: 'Error deleting mapping', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadSuggestions = async () => {
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'get_missing_titles', openOnly: true }
      });
      if (error) throw error;
      if (data?.success) {
        const unmatched = (data.unmatchedTitles || []) as UnmatchedSuggestion[];
        setSuggestions(unmatched);
        // Pre-select best candidates where score is reasonable
        const preSelected: Record<string, string> = {};
        for (const s of unmatched) {
          if (s.bestCandidate && s.bestScore >= 15) {
            preSelected[s.title] = s.bestCandidate;
          }
        }
        setSelectedSuggestions(preSelected);
        if (data.availableTitles) {
          setAvailableTitles(data.availableTitles.map((t: string) => {
            const existing = availableTitles.find(at => at.title === t);
            return existing || { id: '', title: t };
          }));
        }
      } else {
        throw new Error(data?.error || 'Failed to scan');
      }
    } catch (err: any) {
      toast({ title: 'Error scanning titles', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSaveSuggestions = async () => {
    const toSave = Object.entries(selectedSuggestions)
      .filter(([_, crelateTitle]) => crelateTitle && crelateTitle.trim())
      .map(([trackerTitle, crelateTitle]) => ({
        tracker_title: trackerTitle,
        crelate_title: crelateTitle,
        notes: 'Auto-suggested from Missing Titles Report'
      }));

    if (toSave.length === 0) {
      toast({ title: 'No mappings selected', description: 'Select Crelate titles for the suggestions you want to save', variant: 'destructive' });
      return;
    }

    setSavingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: { action: 'bulk_save_title_mappings', mappings: toSave }
      });
      if (error) throw error;
      if (data?.success) {
        toast({
          title: 'Mappings saved',
          description: `${data.saved} mappings saved, ${data.skipped} skipped, ${data.errors} errors`
        });
        setShowSuggestions(false);
        setSuggestions([]);
        setSelectedSuggestions({});
        await loadMappings();
      } else {
        throw new Error(data?.error || 'Failed to save');
      }
    } catch (err: any) {
      toast({ title: 'Error saving mappings', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSuggestions(false);
    }
  };

  const handleExportCSV = () => {
    if (!mappings.length) return;
    const headers = ['Tracker Title', 'Crelate Title', 'Crelate Title ID', 'Notes', 'Created At'];
    const rows = mappings.map(m => [
      `"${m.tracker_title.replace(/"/g, '""')}"`,
      `"${m.crelate_title.replace(/"/g, '""')}"`,
      m.crelate_title_id || '',
      `"${(m.notes || '').replace(/"/g, '""')}"`,
      m.created_at
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `title-mappings-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const existingTrackerTitles = useMemo(() =>
    new Set(mappings.map(m => m.tracker_title.toLowerCase().trim())),
    [mappings]
  );

  const unmappedSuggestions = useMemo(() =>
    suggestions.filter(s => !existingTrackerTitles.has(s.title.toLowerCase().trim())),
    [suggestions, existingTrackerTitles]
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-violet-50 to-indigo-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-md">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Title Mapping Manager</h2>
              <p className="text-xs text-gray-500">
                Map tracker job titles to existing Crelate titles ({mappings.length} mappings, {availableTitles.length} Crelate titles)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-start gap-2.5 flex-shrink-0">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800">
            <p className="font-semibold mb-0.5">How Title Mapping Works</p>
            <p>When pushing jobs to Crelate, the system checks these mappings <strong>before</strong> fuzzy matching. If a tracker title has a mapping, it uses the mapped Crelate title directly — no fuzzy matching needed. This is especially useful for titles that Crelate doesn't have yet (POST /jobtitles returns 403), allowing you to map them to the closest existing title.</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search mappings..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowAddForm(true); setShowSuggestions(false); }}
              className="gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50"
            >
              <Plus className="w-4 h-4" /> Add Mapping
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadSuggestions}
              disabled={loadingSuggestions}
              className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              {loadingSuggestions ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Pre-populate from Missing Titles
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadMappings}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {mappings.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
                <Download className="w-4 h-4" /> Export
              </Button>
            )}
          </div>

          {/* Add New Mapping Form */}
          {showAddForm && (
            <div className="border-2 border-violet-200 rounded-xl p-5 bg-violet-50/30">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-violet-900">Add New Title Mapping</h3>
                <button onClick={() => setShowAddForm(false)} className="ml-auto text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                {/* Tracker Title */}
                <div className="md:col-span-4">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Tracker Title (source)</label>
                  <Input
                    placeholder="e.g. Physical Therapist - Outpatient"
                    value={newTrackerTitle}
                    onChange={e => setNewTrackerTitle(e.target.value)}
                    className="bg-white"
                  />
                </div>

                <div className="md:col-span-1 flex items-end justify-center pb-2">
                  <ArrowRight className="w-5 h-5 text-violet-400" />
                </div>

                {/* Crelate Title */}
                <div className="md:col-span-4 relative">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Crelate Title (target)</label>
                  <Input
                    placeholder="Search or type Crelate title..."
                    value={crTitleSearch || newCrelateTitle}
                    onChange={e => {
                      setCrTitleSearch(e.target.value);
                      setNewCrelateTitle(e.target.value);
                      setShowCrDropdown(true);
                    }}
                    onFocus={() => setShowCrDropdown(true)}
                    className="bg-white"
                  />
                  {showCrDropdown && filteredCrTitles.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                      {filteredCrTitles.slice(0, 30).map(t => (
                        <button
                          key={t.id || t.title}
                          onClick={() => {
                            setNewCrelateTitle(t.title);
                            setCrTitleSearch(t.title);
                            setShowCrDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 transition-colors border-b last:border-0"
                        >
                          <span className="font-medium text-gray-900">{t.title}</span>
                        </button>
                      ))}
                      {filteredCrTitles.length > 30 && (
                        <div className="px-3 py-2 text-xs text-gray-400 text-center">
                          {filteredCrTitles.length - 30} more — type to filter
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
                  <Input
                    placeholder="Optional"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Save Button */}
                <div className="md:col-span-1 flex items-end">
                  <Button
                    onClick={handleAddMapping}
                    disabled={saving || !newTrackerTitle.trim() || !newCrelateTitle.trim()}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                    size="sm"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              {newCrelateTitle && !availableTitles.some(t => t.title.toLowerCase() === newCrelateTitle.toLowerCase()) && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>"{newCrelateTitle}" is not in Crelate's title list. The mapping will be saved but won't resolve to a title ID until this title is created in Crelate.</span>
                </div>
              )}
            </div>
          )}

          {/* Suggestions from Missing Titles */}
          {showSuggestions && (
            <div className="border-2 border-amber-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">Pre-populate from Missing Titles</h3>
                    <p className="text-xs text-amber-700">
                      {loadingSuggestions ? 'Scanning all open jobs...' :
                        unmappedSuggestions.length > 0
                          ? `${unmappedSuggestions.length} unmatched titles found — select a Crelate title for each, then save`
                          : suggestions.length > 0
                            ? 'All missing titles already have mappings!'
                            : 'No missing titles found — all jobs match a Crelate title'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowSuggestions(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingSuggestions && (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
                  <p className="text-sm text-gray-500">Scanning all open jobs against Crelate titles...</p>
                </div>
              )}

              {!loadingSuggestions && unmappedSuggestions.length > 0 && (
                <>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b sticky top-0 z-10">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Missing Tracker Title</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px]">Jobs</th>
                          <th className="text-center px-2 py-2 w-8"></th>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Map To Crelate Title</th>
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px]">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unmappedSuggestions.map((s, i) => (
                          <tr key={i} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-gray-900 text-sm">{s.title}</div>
                              {s.simplified && s.simplified !== s.title && (
                                <div className="text-[10px] text-gray-400 mt-0.5">Simplified: {s.simplified}</div>
                              )}
                            </td>
                            <td className="text-center px-3 py-2.5">
                              <span className="font-bold text-gray-900">{s.count}</span>
                            </td>
                            <td className="text-center px-2 py-2.5">
                              <ArrowRight className="w-4 h-4 text-gray-300 mx-auto" />
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={selectedSuggestions[s.title] || ''}
                                onChange={e => setSelectedSuggestions(prev => ({ ...prev, [s.title]: e.target.value }))}
                                className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                              >
                                <option value="">— Select Crelate title —</option>
                                {s.bestCandidate && (
                                  <option value={s.bestCandidate}>
                                    {s.bestCandidate} (closest match, {s.bestScore}%)
                                  </option>
                                )}
                                <option disabled>──────────</option>
                                {availableTitles.map(t => (
                                  <option key={t.id || t.title} value={typeof t === 'string' ? t : t.title}>
                                    {typeof t === 'string' ? t : t.title}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="text-center px-3 py-2.5">
                              {s.bestScore > 0 ? (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                                  s.bestScore >= 30 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                  s.bestScore >= 15 ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                  'bg-red-100 text-red-800 border-red-200'
                                }`}>
                                  {s.bestScore}%
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-300">0%</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-gray-50 border-t px-4 py-3 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      {Object.values(selectedSuggestions).filter(v => v).length} of {unmappedSuggestions.length} titles mapped
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Auto-select best candidate for all
                          const auto: Record<string, string> = {};
                          for (const s of unmappedSuggestions) {
                            if (s.bestCandidate && s.bestScore >= 15) {
                              auto[s.title] = s.bestCandidate;
                            }
                          }
                          setSelectedSuggestions(auto);
                        }}
                        className="gap-1.5 text-xs"
                      >
                        <Zap className="w-3.5 h-3.5" /> Auto-select best matches
                      </Button>
                      <Button
                        onClick={handleSaveSuggestions}
                        disabled={savingSuggestions || Object.values(selectedSuggestions).filter(v => v).length === 0}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                        size="sm"
                      >
                        {savingSuggestions ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="w-4 h-4" /> Save {Object.values(selectedSuggestions).filter(v => v).length} Mappings</>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {!loadingSuggestions && unmappedSuggestions.length === 0 && suggestions.length > 0 && (
                <div className="text-center py-8">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">All missing titles already have mappings!</p>
                  <p className="text-xs text-gray-500 mt-1">{suggestions.length} missing titles found, but all are already mapped.</p>
                </div>
              )}
            </div>
          )}

          {/* Existing Mappings Table */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-violet-50 border-b border-violet-100 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-violet-800">
                  Current Mappings ({filteredMappings.length}{searchFilter ? ` of ${mappings.length}` : ''})
                </span>
              </div>
              {mappings.length > 0 && (
                <span className="text-xs text-violet-600">
                  These mappings are checked before fuzzy matching during job pushes
                </span>
              )}
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-600 animate-spin mb-2" />
                <p className="text-sm text-gray-500">Loading mappings...</p>
              </div>
            ) : filteredMappings.length === 0 ? (
              <div className="text-center py-12">
                {mappings.length === 0 ? (
                  <>
                    <ArrowRightLeft className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-500">No title mappings yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Add mappings manually or use "Pre-populate from Missing Titles" to get started
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddForm(true)}
                        className="gap-1.5 text-violet-700 border-violet-300"
                      >
                        <Plus className="w-4 h-4" /> Add Manually
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadSuggestions}
                        disabled={loadingSuggestions}
                        className="gap-1.5 text-amber-700 border-amber-300"
                      >
                        <Zap className="w-4 h-4" /> Pre-populate
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No mappings match "{searchFilter}"</p>
                  </>
                )}
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tracker Title</th>
                      <th className="text-center px-2 py-2 w-8"></th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Crelate Title</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[80px]">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[60px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map((m, i) => (
                      <tr key={m.id} className={`border-b transition-colors ${i % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'}`}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{m.tracker_title}</span>
                        </td>
                        <td className="text-center px-2 py-2.5">
                          <ArrowRight className="w-4 h-4 text-violet-400 mx-auto" />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-violet-700">{m.crelate_title}</span>
                        </td>
                        <td className="text-center px-3 py-2.5">
                          {m.crelate_title_id ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                              <CheckCircle className="w-3 h-3" /> Linked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                              <AlertTriangle className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[200px] truncate">
                          {m.notes || '—'}
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <button
                            onClick={() => handleDeleteMapping(m)}
                            disabled={deletingId === m.id}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                            title="Delete this mapping"
                          >
                            {deletingId === m.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-gray-400">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''} configured
            {mappings.filter(m => m.crelate_title_id).length > 0 && (
              <> &middot; {mappings.filter(m => m.crelate_title_id).length} with resolved Crelate IDs</>
            )}
            {mappings.filter(m => !m.crelate_title_id).length > 0 && (
              <> &middot; {mappings.filter(m => !m.crelate_title_id).length} pending resolution</>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export default TitleMapping;
