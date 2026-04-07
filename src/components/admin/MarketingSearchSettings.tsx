import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Search, Save, Briefcase, Building2, CheckSquare, Square, Loader2, Globe, RotateCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SearchSetting {
  id: string;
  setting_type: string;
  setting_value: string;
  is_selected: boolean;
  display_order: number;
}

const MarketingSearchSettings: React.FC = () => {
  const { toast } = useToast();
  const [jobTypes, setJobTypes] = useState<SearchSetting[]>([]);
  const [companyTypes, setCompanyTypes] = useState<SearchSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_search_settings')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      
      const jobs = (data || []).filter(s => s.setting_type === 'job_type');
      const companies = (data || []).filter(s => s.setting_type === 'company_type');
      setJobTypes(jobs);
      setCompanyTypes(companies);
    } catch (err: any) {
      toast({ title: 'Error loading settings', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const toggleSetting = (id: string, currentValue: boolean) => {
    setPendingChanges(prev => ({ ...prev, [id]: !currentValue }));
    
    setJobTypes(prev => prev.map(s => s.id === id ? { ...s, is_selected: !currentValue } : s));
    setCompanyTypes(prev => prev.map(s => s.id === id ? { ...s, is_selected: !currentValue } : s));
  };

  const selectAll = (type: 'job_type' | 'company_type', value: boolean) => {
    const items = type === 'job_type' ? jobTypes : companyTypes;
    const changes: Record<string, boolean> = {};
    items.forEach(item => { changes[item.id] = value; });
    setPendingChanges(prev => ({ ...prev, ...changes }));
    
    if (type === 'job_type') {
      setJobTypes(prev => prev.map(s => ({ ...s, is_selected: value })));
    } else {
      setCompanyTypes(prev => prev.map(s => ({ ...s, is_selected: value })));
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const allItems = [...jobTypes, ...companyTypes];
      const updates = allItems.filter(item => item.id in pendingChanges);
      
      if (updates.length === 0 && Object.keys(pendingChanges).length === 0) {
        toast({ title: 'No changes to save' });
        setSaving(false);
        return;
      }

      // Update all items that have pending changes
      for (const item of allItems) {
        if (item.id in pendingChanges) {
          const { error } = await supabase
            .from('marketing_search_settings')
            .update({ is_selected: pendingChanges[item.id], updated_at: new Date().toISOString() })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      setPendingChanges({});
      toast({ title: 'Settings saved successfully' });
    } catch (err: any) {
      toast({ title: 'Error saving settings', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleScrapeJobs = async () => {
    setScraping(true);
    setScrapeLog(['Starting web search for healthcare jobs...']);
    
    try {
      // Get selected job types and company types
      const selectedJobs = jobTypes.filter(j => j.is_selected).map(j => j.setting_value);
      const selectedCompanies = companyTypes.filter(c => c.is_selected).map(c => c.setting_value);

      if (selectedJobs.length === 0) {
        toast({ title: 'No job types selected', description: 'Please select at least one job type to search for.', variant: 'destructive' });
        setScraping(false);
        return;
      }
      if (selectedCompanies.length === 0) {
        toast({ title: 'No company types selected', description: 'Please select at least one company type to target.', variant: 'destructive' });
        setScraping(false);
        return;
      }

      setScrapeLog(prev => [...prev, `Searching for ${selectedJobs.length} job types across ${selectedCompanies.length} company types...`]);
      setScrapeLog(prev => [...prev, `Job types: ${selectedJobs.join(', ')}`]);
      setScrapeLog(prev => [...prev, `Company types: ${selectedCompanies.join(', ')}`]);
      setScrapeLog(prev => [...prev, 'Calling AI to find current healthcare job openings...']);

      const { data, error } = await supabase.functions.invoke('scrape-healthcare-jobs', {
        body: { 
          jobTypes: selectedJobs,
          companyTypes: selectedCompanies
        }
      });

      if (error) throw error;

      if (data?.run_id) {
        setScrapeLog(prev => [
          ...prev,
          `Tracker run started (ID: ${data.run_id})`,
          'The tracker is now running in the background.',
          'Check the Marketing > New Jobs tab for progress and results.'
        ]);
        toast({ 
          title: 'Tracker started!', 
          description: 'The tracker is running in the background. Check the New Jobs tab for progress.' 
        });
      } else if (data?.companies_added !== undefined) {
        setScrapeLog(prev => [
          ...prev,
          `Added ${data.companies_added} new companies`,
          `Added ${data.jobs_added} new job listings`,
          data.message || 'Scraping complete!'
        ]);
        toast({ 
          title: 'Web scrape complete!', 
          description: `Found ${data.companies_added} companies and ${data.jobs_added} jobs.` 
        });
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        setScrapeLog(prev => [...prev, 'Scraping complete!']);
        toast({ title: 'Web scrape complete!' });
      }

    } catch (err: any) {
      setScrapeLog(prev => [...prev, `Error: ${err.message}`]);
      toast({ title: 'Error scraping jobs', description: err.message, variant: 'destructive' });
    } finally {
      setScraping(false);
    }
  };

  const filteredJobTypes = jobTypes.filter(j => 
    !jobSearch || j.setting_value.toLowerCase().includes(jobSearch.toLowerCase())
  );

  const filteredCompanyTypes = companyTypes.filter(c => 
    !companySearch || c.setting_value.toLowerCase().includes(companySearch.toLowerCase())
  );

  const selectedJobCount = jobTypes.filter(j => j.is_selected).length;
  const selectedCompanyCount = companyTypes.filter(c => c.is_selected).length;
  const hasChanges = Object.keys(pendingChanges).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-500">Loading marketing settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Save + Scrape */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Marketing Job Search Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure which job types and company types to search for when scraping the web for new job opportunities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-sm text-amber-600 font-medium">Unsaved changes</span>
          )}
          <Button 
            onClick={saveSettings} 
            disabled={saving || !hasChanges}
            variant="outline"
            className="gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button 
            onClick={handleScrapeJobs} 
            disabled={scraping}
            className="bg-[#911406] hover:bg-[#911406]/90 text-white gap-2"
          >
            {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            {scraping ? 'Scraping...' : 'Scrape Web for Jobs'}
          </Button>
        </div>
      </div>

      {/* Scrape Log */}
      {scrapeLog.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Scrape Activity Log
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setScrapeLog([])}
                className="text-blue-600 hover:text-blue-800 h-7 px-2"
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="bg-white/80 rounded border border-blue-200 p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
              {scrapeLog.map((log, i) => (
                <div key={i} className={`${log.startsWith('Error') ? 'text-red-600' : log.includes('Added') || log.includes('complete') ? 'text-green-700' : 'text-gray-700'}`}>
                  <span className="text-gray-400 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              ))}
              {scraping && (
                <div className="flex items-center gap-2 text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Types */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#911406]" />
                Job Types to Search For
                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {selectedJobCount} selected
                </span>
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => selectAll('job_type', true)} className="text-xs h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => selectAll('job_type', false)} className="text-xs h-7 px-2 text-gray-500 hover:text-gray-700">
                  Clear All
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Filter job types..."
                value={jobSearch}
                onChange={e => setJobSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[500px] overflow-y-auto space-y-0.5 pr-1">
              {filteredJobTypes.map(jt => (
                <button
                  key={jt.id}
                  onClick={() => toggleSetting(jt.id, jt.is_selected)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                    jt.is_selected 
                      ? 'bg-[#911406]/5 text-[#911406] hover:bg-[#911406]/10 font-medium' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {jt.is_selected ? (
                    <CheckSquare className="w-4 h-4 text-[#911406] flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  {jt.setting_value}
                </button>
              ))}
              {filteredJobTypes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No job types match your filter.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Company Types */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#911406]" />
                Company Types to Target
                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {selectedCompanyCount} selected
                </span>
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => selectAll('company_type', true)} className="text-xs h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={() => selectAll('company_type', false)} className="text-xs h-7 px-2 text-gray-500 hover:text-gray-700">
                  Clear All
                </Button>
              </div>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Filter company types..."
                value={companySearch}
                onChange={e => setCompanySearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-[500px] overflow-y-auto space-y-0.5 pr-1">
              {filteredCompanyTypes.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => toggleSetting(ct.id, ct.is_selected)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
                    ct.is_selected 
                      ? 'bg-[#911406]/5 text-[#911406] hover:bg-[#911406]/10 font-medium' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ct.is_selected ? (
                    <CheckSquare className="w-4 h-4 text-[#911406] flex-shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  {ct.setting_value}
                </button>
              ))}
              {filteredCompanyTypes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No company types match your filter.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="bg-gray-50">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{selectedJobCount}</span> job types and{' '}
              <span className="font-semibold text-gray-900">{selectedCompanyCount}</span> company types selected for web scraping.
            </div>
            <Button 
              onClick={handleScrapeJobs} 
              disabled={scraping}
              size="sm"
              className="bg-[#911406] hover:bg-[#911406]/90 text-white gap-2"
            >
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
              {scraping ? 'Scraping...' : 'Run Web Scrape Now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketingSearchSettings;
