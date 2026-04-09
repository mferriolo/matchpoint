import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Building2, Briefcase, Globe, Settings, Loader2, Users,
  Search, ExternalLink, Star, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Database, Shield, Phone, Send,
  Linkedin, Unlink, Upload, Trash2, Zap,
  ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert, FileText, ArrowRightLeft
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

import { useToast } from '@/hooks/use-toast';
import TrackerControls from '@/components/marketing/TrackerControls';
import JobsTabContent from '@/components/marketing/JobsTabContent';
import ImportTool from '@/components/marketing/ImportTool';
import DataCleanup from '@/components/marketing/DataCleanup';
import PushToCrelate from '@/components/marketing/PushToCrelate';
import CrelateSyncStatus from '@/components/marketing/CrelateSyncStatus';
import MissingTitlesReport from '@/components/marketing/MissingTitlesReport';
import TitleMapping from '@/components/marketing/TitleMapping';
import { exportMasterSheet, exportNewDataSheet } from '@/utils/xlsxExport';




const MarketingNewJobs: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchCompanies, setSearchCompanies] = useState('');
  const [searchContacts, setSearchContacts] = useState('');
  const [filterSource, setFilterSource] = useState('All');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('tracker');
  const [showImportTool, setShowImportTool] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showPushToCrelate, setShowPushToCrelate] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showMissingTitles, setShowMissingTitles] = useState(false);
  const [showTitleMapping, setShowTitleMapping] = useState(false);
  const [scrapingDescs, setScrapingDescs] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);





  // Companies tab state
  const [filterHighPriorityCompanies, setFilterHighPriorityCompanies] = useState(false);
  const [togglingCompanyPriorityId, setTogglingCompanyPriorityId] = useState<string | null>(null);
  const [autoPrioritizing, setAutoPrioritizing] = useState(false);
  const [companySortField, setCompanySortField] = useState<'company_name' | 'company_type' | 'open_roles_count' | 'contact_count' | 'is_high_priority' | 'has_md_cmo'>('open_roles_count');
  const [companySortDir, setCompanySortDir] = useState<'asc' | 'desc'>('desc');
  const [showAutoPrioritizeResults, setShowAutoPrioritizeResults] = useState(false);
  const [autoPrioritizeResults, setAutoPrioritizeResults] = useState<any>(null);


  const contactSources = ['All', 'Crelate ATS', 'AI Intelligence Engine', 'AI Second-Pass Sweep', 'Manual'];

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.allSettled([
        supabase.from('marketing_jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('marketing_companies').select('*').order('open_roles_count', { ascending: false }),
        supabase.from('marketing_contacts').select('*').order('created_at', { ascending: false })
      ]);

      const jobsResult = results[0];
      const companiesResult = results[1];
      const contactsResult = results[2];

      if (jobsResult.status === 'fulfilled') {
        if (jobsResult.value.error) {
          console.warn('Error loading marketing_jobs:', jobsResult.value.error.message);
        } else {
          setJobs(jobsResult.value.data || []);
        }
      }

      if (companiesResult.status === 'fulfilled') {
        if (companiesResult.value.error) {
          console.warn('Error loading marketing_companies:', companiesResult.value.error.message);
        } else {
          setCompanies(companiesResult.value.data || []);
        }
      }

      if (contactsResult.status === 'fulfilled') {
        if (contactsResult.value.error) {
          console.warn('Error loading marketing_contacts:', contactsResult.value.error.message);
        } else {
          setContacts(contactsResult.value.data || []);
        }
      }

      const allFailed = results.every(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      if (allFailed) {
        setLoadError('Unable to connect to the database. Please check your connection and try again.');
      }
    } catch (err: any) {
      console.error('Critical error loading data:', err);
      setLoadError(err.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleClearAllData = async () => {
    setClearing(true);
    try {
      // Delete in order: contacts, jobs, then companies (due to foreign keys)
      const { error: e1 } = await supabase.from('marketing_contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e1) console.warn('Error clearing contacts:', e1.message);
      
      const { error: e2 } = await supabase.from('marketing_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e2) console.warn('Error clearing jobs:', e2.message);
      
      const { error: e3 } = await supabase.from('marketing_companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e3) console.warn('Error clearing companies:', e3.message);

      const { error: e4 } = await supabase.from('tracker_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (e4) console.warn('Error clearing tracker runs:', e4.message);

      toast({ title: 'All Data Cleared', description: 'All companies, jobs, contacts, and tracker history have been deleted.' });
      setShowClearConfirm(false);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const handleExportMaster = () => {
    try {
      if (jobs.length === 0 && contacts.length === 0 && companies.length === 0) {
        toast({ title: 'No Data to Export', description: 'Load or import data before exporting.', variant: 'destructive' });
        return;
      }
      const filename = exportMasterSheet(jobs, contacts, companies);
      toast({ title: 'Download Started', description: `${filename} — check your downloads folder.` });
    } catch (err: any) {
      console.error('[Export] Master sheet error:', err);
      toast({ title: 'Export Error', description: err.message || 'Failed to generate the spreadsheet. Please try again.', variant: 'destructive' });
    }
  };

  const handleExportNewData = () => {
    try {
      const netNew = jobs.filter(j => j.is_net_new);
      const exportJobs = netNew.length > 0 ? netNew : jobs.slice(0, 10);
      if (exportJobs.length === 0) {
        toast({ title: 'No Data to Export', description: 'No jobs available to export.', variant: 'destructive' });
        return;
      }
      const filename = exportNewDataSheet(exportJobs);
      toast({ title: 'Download Started', description: `${filename} — check your downloads folder.` });
    } catch (err: any) {
      console.error('[Export] New data sheet error:', err);
      toast({ title: 'Export Error', description: err.message || 'Failed to generate the spreadsheet. Please try again.', variant: 'destructive' });
    }
  };


  // Toggle company high priority
  const handleToggleCompanyPriority = useCallback(async (companyId: string, currentPriority: boolean) => {
    setTogglingCompanyPriorityId(companyId);
    try {
      const { error } = await supabase
        .from('marketing_companies')
        .update({ is_high_priority: !currentPriority, updated_at: new Date().toISOString() })
        .eq('id', companyId);
      if (error) throw error;
      toast({ title: !currentPriority ? 'Marked as High Priority' : 'Priority removed' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Error updating priority', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingCompanyPriorityId(null);
    }
  }, [toast, loadData]);

  // Auto-prioritize companies and jobs
  const handleAutoPrioritize = useCallback(async () => {
    setAutoPrioritizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-prioritize-jobs', {
        body: {}
      });
      if (error) throw error;
      if (data?.success) {
        setAutoPrioritizeResults(data);
        setShowAutoPrioritizeResults(true);
        toast({
          title: 'Auto-Prioritize Complete',
          description: `${data.summary.companiesMarkedHighPriority} companies and ${data.summary.jobsMarkedHighPriority} jobs marked as high priority`
        });
        await loadData();
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err: any) {
      toast({ title: 'Error auto-prioritizing', description: err.message, variant: 'destructive' });
    } finally {
      setAutoPrioritizing(false);
    }
  }, [toast, loadData]);

  // Company sort handler
  const handleScrapeDescriptions = async () => {
    setScrapingDescs(true);
    setScrapeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-job-descriptions', {
        body: { action: 'scrape', limit: 50 }
      });
      if (error) throw error;
      setScrapeResult(data);
      toast({
        title: 'Scraping complete',
        description: `${data?.summary?.scraped || 0} descriptions scraped, ${data?.summary?.failed || 0} failed`,
      });
    } catch (e: any) {
      toast({ title: 'Scrape failed', description: e.message, variant: 'destructive' });
    } finally {
      setScrapingDescs(false);
    }
  };

  const handleCompanySort = (field: typeof companySortField) => {
    if (companySortField === field) {
      setCompanySortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCompanySortField(field);
      setCompanySortDir('asc');
    }
  };


  // Companies filter + sort
  const filteredCompanies = useMemo(() => {
    return companies
      .filter(c => {
        if (filterHighPriorityCompanies && !c.is_high_priority) return false;
        if (!searchCompanies) return true;
        const s = searchCompanies.toLowerCase();
        return c.company_name?.toLowerCase().includes(s) ||
          c.company_type?.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        let aVal: any, bVal: any;
        switch (companySortField) {
          case 'company_name': aVal = a.company_name || ''; bVal = b.company_name || ''; break;
          case 'company_type': aVal = a.company_type || ''; bVal = b.company_type || ''; break;
          case 'open_roles_count': aVal = a.open_roles_count || 0; bVal = b.open_roles_count || 0; break;
          case 'contact_count': aVal = a.contact_count || 0; bVal = b.contact_count || 0; break;
          case 'is_high_priority': aVal = a.is_high_priority ? 1 : 0; bVal = b.is_high_priority ? 1 : 0; break;
          case 'has_md_cmo': aVal = a.has_md_cmo ? 1 : 0; bVal = b.has_md_cmo ? 1 : 0; break;
          default: aVal = ''; bVal = '';
        }
        if (typeof aVal === 'number') {
          return companySortDir === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const cmp = aVal.toString().localeCompare(bVal.toString());
        return companySortDir === 'asc' ? cmp : -cmp;
      });
  }, [companies, searchCompanies, filterHighPriorityCompanies, companySortField, companySortDir]);

  const highPriorityCompanyCount = useMemo(() => companies.filter(c => c.is_high_priority).length, [companies]);

  // Contacts filter
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !searchContacts ||
      c.company_name?.toLowerCase().includes(searchContacts.toLowerCase()) ||
      c.first_name?.toLowerCase().includes(searchContacts.toLowerCase()) ||
      c.last_name?.toLowerCase().includes(searchContacts.toLowerCase()) ||
      c.title?.toLowerCase().includes(searchContacts.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchContacts.toLowerCase());
    const matchesSource = filterSource === 'All' ||
      (filterSource === 'Crelate ATS' && c.source === 'Crelate ATS') ||
      (filterSource === 'AI Intelligence Engine' && c.source?.includes('AI') && !c.source?.includes('Sweep')) ||
      (filterSource === 'AI Second-Pass Sweep' && c.source?.includes('Sweep')) ||
      (filterSource === 'Manual' && !c.source?.includes('AI') && c.source !== 'Crelate ATS');
    return matchesSearch && matchesSource;
  });

  const openJobsCount = jobs.filter(j => !j.is_closed && j.status !== 'Closed').length;
  const closedJobsCount = jobs.filter(j => j.is_closed || j.status === 'Closed').length;
  const highPriorityCount = companies.filter(c => c.is_high_priority).length;
  const highPriorityJobsCount = jobs.filter(j => j.high_priority && !j.is_closed && j.status !== 'Closed').length;
  const crelateCount = contacts.filter(c => c.source === 'Crelate ATS').length;

  // Company sort icon helper
  const CompanySortIcon = ({ field }: { field: typeof companySortField }) => {
    if (companySortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 flex-shrink-0" />;
    return companySortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 ml-1 text-[#911406] flex-shrink-0" />;
  };



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

  const sourceBadge = (source: string) => {
    if (source === 'Crelate ATS') return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
    if (source?.includes('Sweep')) return 'bg-violet-100 text-violet-800 border border-violet-200';
    if (source?.includes('AI')) return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
    return 'bg-gray-100 text-gray-700 border border-gray-200';
  };

  const sourceIcon = (source: string) => {
    if (source === 'Crelate ATS') return <Database className="w-3 h-3" />;
    if (source?.includes('AI')) return <Globe className="w-3 h-3" />;
    return <Users className="w-3 h-3" />;
  };

  const buildCompanyJobsSearch = (companyName: string) => {
    const q = encodeURIComponent(`${companyName} healthcare jobs`);
    return `https://www.google.com/search?q=${q}&ibp=htl;jobs`;
  };

  const getVerifiedContactUrl = (c: any): { url: string; label: string; type: 'crelate' | 'linkedin' | 'website' | 'none' } => {
    if (c.source === 'Crelate ATS' && c.crelate_contact_id) {
      const url = `https://app.crelate.com/go#stage/_Contacts/DefaultView/${c.crelate_contact_id}/summary`;
      return { url, label: 'Open in Crelate', type: 'crelate' };
    }
    if (c.source_url && c.source_url.startsWith('http')) {
      const isFabricatedSearch = c.source_url.includes('/search/results/') || 
                                  c.source_url.includes('?q=') ||
                                  c.source_url.includes('&keywords=') ||
                                  c.source_url.includes('ibp=htl');
      if (!isFabricatedSearch) {
        if (c.source_url.includes('linkedin.com/in/')) {
          return { url: c.source_url, label: 'LinkedIn Profile', type: 'linkedin' };
        }
        return { url: c.source_url, label: 'View Source', type: 'website' };
      }
    }
    if (c.crelate_url && c.crelate_url.includes('crelate.com/go#stage')) {
      return { url: c.crelate_url, label: 'Open in Crelate', type: 'crelate' };
    }
    return { url: '', label: 'No verified link', type: 'none' };
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-gray-600 hover:text-[#911406]">
            <ArrowLeft className="w-4 h-4 mr-1" /> Home
          </Button>
          <div className="h-6 w-px bg-gray-300" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Healthcare Recruiting Tracker</h1>
            <p className="text-xs text-gray-500">Structured healthcare recruiting intelligence engine</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button

            variant="outline"
            size="sm"
            onClick={() => setShowPushToCrelate(true)}
            disabled={companies.length === 0 && contacts.length === 0 && jobs.length === 0}
            className="gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
            title="Push companies, contacts, and jobs to Crelate ATS"
          >
            <Send className="w-4 h-4" /> Push to Crelate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleScrapeDescriptions}
            disabled={scrapingDescs}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            title="Scrape job descriptions from job listing URLs"
          >
            {scrapingDescs ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {scrapingDescs ? 'Scraping...' : 'Scrape Descriptions'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportTool(true)}
            className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Upload className="w-4 h-4" /> Import Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Clear All
          </Button>
          <div className="h-6 w-px bg-gray-200" />
          <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="text-gray-600 hover:text-blue-700 gap-1.5">
            <Settings className="w-4 h-4" /> Settings
          </Button>
        </div>
      </div>

      {/* Stats Bar */}


      <div className="bg-white border-b px-6 py-3 flex gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span className="font-semibold">{openJobsCount}</span> Open Jobs
        </div>
        <div className="flex items-center gap-2 text-sm">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="font-semibold">{closedJobsCount}</span> Closed
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Building2 className="w-4 h-4 text-purple-600" />
          <span className="font-semibold">{companies.length}</span> Companies
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-green-600" />
          <span className="font-semibold">{contacts.length}</span> Contacts
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Database className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold">{crelateCount}</span> from Crelate
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-amber-500" />
          <span className="font-semibold">{highPriorityCount}</span> Priority Co.
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Star className="w-4 h-4 text-yellow-500" />
          <span className="font-semibold">{highPriorityJobsCount}</span> Priority Jobs
        </div>

      </div>

      {/* Error Banner */}
      {loadError && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-red-700 border-red-300 hover:bg-red-100 gap-1.5"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-6 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="bg-white border border-gray-200 shadow-sm w-fit mb-4">
            <TabsTrigger value="tracker" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Shield className="w-4 h-4" />Tracker
            </TabsTrigger>
            <TabsTrigger value="jobs" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Briefcase className="w-4 h-4" />Jobs ({openJobsCount})

            </TabsTrigger>
            <TabsTrigger value="companies" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Building2 className="w-4 h-4" />Companies ({companies.length})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="data-[state=active]:bg-[#911406] data-[state=active]:text-white px-5 py-2 gap-2">
              <Users className="w-4 h-4" />Contacts ({contacts.length})
            </TabsTrigger>
          </TabsList>

          {/* TRACKER TAB */}
          <TabsContent value="tracker" className="flex-1 mt-0 space-y-4">
            {/* Crelate Sync Status Dashboard */}
            <CrelateSyncStatus
              companies={companies}
              contacts={contacts}
              jobs={jobs}
            />
            <TrackerControls
              onComplete={loadData}
              onExportMaster={handleExportMaster}
              onExportNewData={handleExportNewData}
              jobs={jobs}
              companies={companies}
              contacts={contacts}
              loading={loading}
            />
          </TabsContent>


          {/* JOBS TAB */}
          <TabsContent value="jobs" className="flex-1 mt-0">
            <JobsTabContent
              jobs={jobs}
              loading={loading}
              onRefresh={loadData}
            />
          </TabsContent>

          {/* COMPANIES TAB */}
          <TabsContent value="companies" className="flex-1 mt-0">
            <div className="bg-white rounded-xl border shadow-sm flex flex-col">
              <div className="bg-purple-50 border-b border-purple-100 px-4 py-2.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span className="text-xs text-purple-700">
                  <strong>Jobs Page</strong> links go to verified careers pages when available, or Google Jobs search for that company. Click the star to toggle high priority.
                </span>
              </div>
              {/* Toolbar */}
              <div className="p-4 border-b flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search companies..." value={searchCompanies} onChange={e => setSearchCompanies(e.target.value)} className="pl-9" />
                </div>

                {/* High Priority Quick Filter */}
                <button
                  onClick={() => setFilterHighPriorityCompanies(prev => !prev)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-all ${
                    filterHighPriorityCompanies
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-400 shadow-sm ring-1 ring-yellow-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-300'
                  }`}
                  title={filterHighPriorityCompanies ? 'Show all companies' : 'Show only high priority companies'}
                >
                  <Star
                    className="w-3.5 h-3.5"
                    fill={filterHighPriorityCompanies ? 'currentColor' : 'none'}
                    strokeWidth={filterHighPriorityCompanies ? 0 : 1.5}
                  />
                  High Priority
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    filterHighPriorityCompanies
                      ? 'bg-yellow-200 text-yellow-900'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {highPriorityCompanyCount}
                  </span>
                </button>

                <span className="text-sm text-gray-500">{filteredCompanies.length} of {companies.length} companies</span>

                {/* Auto-Prioritize Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoPrioritize}
                  disabled={autoPrioritizing || companies.length === 0}
                  className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400"
                  title="Auto-detect high priority companies (VBC or 10+ openings) and jobs (Medical Director/CMO or from priority companies)"
                >
                  {autoPrioritizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {autoPrioritizing ? 'Analyzing...' : 'Auto-Prioritize'}
                </Button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('company_name')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Company <CompanySortIcon field="company_name" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('company_type')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Category <CompanySortIcon field="company_type" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase tracking-wider font-semibold">Find Open Jobs</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('open_roles_count')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Open Roles <CompanySortIcon field="open_roles_count" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('contact_count')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Contacts <CompanySortIcon field="contact_count" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 w-[80px]">
                        <button onClick={() => handleCompanySort('is_high_priority')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          Priority <CompanySortIcon field="is_high_priority" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">
                        <button onClick={() => handleCompanySort('has_md_cmo')} className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors text-xs uppercase tracking-wider font-semibold">
                          MD/CMO <CompanySortIcon field="has_md_cmo" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="text-center py-16">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400 mb-2" />
                        <span className="text-sm text-gray-400">Loading companies...</span>
                      </td></tr>
                    ) : filteredCompanies.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-16">
                        <div className="text-gray-400">
                          {searchCompanies || filterHighPriorityCompanies ? (
                            <>
                              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              <p className="text-sm font-medium">No companies match your filters</p>
                              <button onClick={() => { setSearchCompanies(''); setFilterHighPriorityCompanies(false); }} className="text-xs text-[#911406] hover:underline mt-1">Clear filters</button>
                            </>
                          ) : (
                            <p className="text-sm font-medium">No companies found</p>
                          )}
                        </div>
                      </td></tr>
                    ) : filteredCompanies.map((c, idx) => {
                      const hasOpenRoles = (c.open_roles_count || 0) > 0;
                      const hasVerifiedCareers = c.careers_url && 
                        c.careers_url.startsWith('http') && 
                        !c.careers_url.includes('google.com/search') &&
                        !c.careers_url.includes('indeed.com/jobs') &&
                        !c.careers_url.includes('linkedin.com/jobs') &&
                        !c.careers_url.includes('?q=') &&
                        !c.careers_url.includes('&keywords=');

                      return (
                        <tr key={c.id} className={`border-b transition-colors ${c.is_high_priority ? 'bg-amber-50/50 hover:bg-amber-100/50' : !hasOpenRoles ? 'opacity-60 hover:bg-gray-50' : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/30 hover:bg-gray-100/50'}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{c.company_name}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${categoryBadge(c.company_type)}`}>{c.company_type || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {hasOpenRoles ? (
                              <div className="flex items-center gap-2">
                                <a
                                  href={buildCompanyJobsSearch(c.company_name)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors font-medium"
                                  title={`Search Google Jobs for ${c.company_name} open positions`}
                                >
                                  <Globe className="w-3 h-3" />
                                  Search Jobs
                                </a>
                                {hasVerifiedCareers && (
                                  <a
                                    href={c.careers_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-medium"
                                    title={`Visit ${c.company_name} careers page`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Careers Page
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Unlink className="w-3 h-3" />
                                No open roles
                              </span>
                            )}
                          </td>
                          <td className="text-center px-4 py-3">
                            <span className={`font-semibold ${hasOpenRoles ? 'text-gray-900' : 'text-gray-400'}`}>
                              {c.open_roles_count || 0}
                            </span>
                          </td>
                          <td className="text-center px-4 py-3">{c.contact_count || 0}</td>
                          {/* Clickable Priority Star */}
                          <td className="text-center px-4 py-3">
                            <button
                              onClick={() => handleToggleCompanyPriority(c.id, !!c.is_high_priority)}
                              disabled={togglingCompanyPriorityId === c.id}
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                                c.is_high_priority
                                  ? 'text-yellow-500 hover:text-yellow-600'
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                              title={c.is_high_priority ? 'Remove high priority' : 'Mark as high priority'}
                            >
                              {togglingCompanyPriorityId === c.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Star
                                  className="w-5 h-5"
                                  fill={c.is_high_priority ? 'currentColor' : 'none'}
                                  strokeWidth={c.is_high_priority ? 0 : 1.5}
                                />
                              )}
                            </button>
                          </td>
                          <td className="text-center px-4 py-3">
                            {c.has_md_cmo ? <CheckCircle className="w-4 h-4 text-green-600 mx-auto" /> : <span className="text-gray-300">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Auto-Prioritize Results Dialog */}
            {showAutoPrioritizeResults && autoPrioritizeResults && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[80vh] flex flex-col">
                  <div className="p-6 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">Auto-Prioritize Complete</h3>
                        <p className="text-sm text-gray-500">
                          Analyzed {autoPrioritizeResults.summary.totalCompanies} companies and {autoPrioritizeResults.summary.totalJobs} jobs
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 overflow-y-auto flex-1">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <Building2 className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-700">{autoPrioritizeResults.summary.companiesMarkedHighPriority}</p>
                        <p className="text-xs text-amber-600 font-medium">Companies Marked</p>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                        <Briefcase className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-amber-700">{autoPrioritizeResults.summary.jobsMarkedHighPriority}</p>
                        <p className="text-xs text-amber-600 font-medium">Jobs Marked</p>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-4">
                      <p className="font-semibold mb-1">Criteria Used:</p>
                      <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                        <li><strong>Companies:</strong> Value Based Care (VBC) category OR 10+ open roles</li>
                        <li><strong>Jobs:</strong> Medical Director / CMO titles OR jobs from high priority companies</li>
                      </ul>
                      <p className="text-xs text-gray-500 mt-2">
                        Total high priority companies: <strong>{autoPrioritizeResults.summary.highPriorityCompanyCount}</strong>
                      </p>
                    </div>

                    {/* Details */}
                    {autoPrioritizeResults.details && autoPrioritizeResults.details.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Changes Made:</p>
                        <div className="max-h-[200px] overflow-y-auto border rounded-lg">
                          {autoPrioritizeResults.details.map((detail: string, i: number) => (
                            <div key={i} className={`px-3 py-2 text-xs text-gray-600 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${i > 0 ? 'border-t' : ''}`}>
                              {detail}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {autoPrioritizeResults.details?.length === 0 && (
                      <div className="text-center py-4 text-gray-400">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                        <p className="text-sm">All priorities are already up to date. No changes needed.</p>
                      </div>
                    )}
                  </div>
                  <div className="border-t bg-gray-50 px-6 py-4 flex justify-end">
                    <Button onClick={() => setShowAutoPrioritizeResults(false)}>Done</Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>


          {/* CONTACTS TAB */}
          <TabsContent value="contacts" className="flex-1 mt-0">
            <div className="bg-white rounded-xl border shadow-sm">
              {/* Toolbar */}
              <div className="p-4 border-b flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input placeholder="Search contacts by name, company, title, email..." value={searchContacts} onChange={e => setSearchContacts(e.target.value)} className="pl-9" />
                </div>
                <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
                  {contactSources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-sm text-gray-500">{filteredContacts.length} contacts</span>
              </div>

              {/* Spreadsheet-style table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[120px]">First Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[120px]">Last Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[200px]">Email</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[130px]">Phone (Work)</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[130px]">Phone (Home)</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[130px]">Phone (Cell)</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[180px]">Title</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[180px]">Company</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider border-r border-gray-200 min-w-[120px]">Source</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wider min-w-[200px]">LinkedIn URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={10} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /></td></tr>
                    ) : filteredContacts.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-12 text-gray-500">No contacts found. Run the tracker or import data to add contacts.</td></tr>
                    ) : filteredContacts.map((c, idx) => {
                      // Derive LinkedIn URL: prefer linkedin_url field, then check source_url for LinkedIn links
                      const linkedinUrl = c.linkedin_url || 
                        (c.source_url && c.source_url.includes('linkedin.com/in/') ? c.source_url : '');

                      return (
                        <tr 
                          key={c.id} 
                          className={`border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                          } ${selectedContact?.id === c.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
                          onClick={() => setSelectedContact(selectedContact?.id === c.id ? null : c)}
                        >
                          {/* First Name */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                            {c.first_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Last Name */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium">
                            {c.last_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Email */}
                          <td className="px-4 py-2.5 border-r border-gray-100">
                            {c.email ? (
                              <a 
                                href={`mailto:${c.email}`} 
                                className="text-blue-600 hover:underline text-sm"
                                onClick={e => e.stopPropagation()}
                              >
                                {c.email}
                              </a>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          {/* Phone (Work) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_work || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Phone (Home) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_home || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Phone (Cell) */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.phone_cell || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Title */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-700 text-sm">
                            {c.title || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Company */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-gray-900 font-medium text-sm">
                            {c.company_name || <span className="text-gray-300">—</span>}
                          </td>
                          {/* Source */}
                          <td className="px-4 py-2.5 border-r border-gray-100 text-sm">
                            {c.source ? (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sourceBadge(c.source)}`}>
                                {sourceIcon(c.source)}
                                {c.source === 'Crelate ATS' ? 'Crelate' : c.source?.includes('Sweep') ? 'AI Sweep' : c.source?.includes('AI') ? 'AI' : c.source || ''}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          {/* LinkedIn URL */}
                          <td className="px-4 py-2.5 text-sm" onClick={e => e.stopPropagation()}>
                            {linkedinUrl ? (
                              <a
                                href={linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors font-medium"
                                title={`View LinkedIn profile`}
                              >
                                <Linkedin className="w-3 h-3" />
                                Profile
                              </a>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Contact Detail Panel */}
              {selectedContact && (() => {
                const selectedLinkedinUrl = selectedContact.linkedin_url || 
                  (selectedContact.source_url && selectedContact.source_url.includes('linkedin.com/in/') ? selectedContact.source_url : '');
                return (
                  <div className="border-t bg-gray-50 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-base">
                          {selectedContact.first_name} {selectedContact.last_name}
                        </h3>
                        <p className="text-sm text-gray-500">{selectedContact.title}{selectedContact.title && selectedContact.company_name ? ' at ' : ''}{selectedContact.company_name}</p>
                      </div>
                      <button onClick={() => setSelectedContact(null)} className="text-gray-400 hover:text-gray-600">
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                      <div>
                        <label className="text-xs text-gray-500 font-medium">First Name</label>
                        <p className="text-sm text-gray-900">{selectedContact.first_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Last Name</label>
                        <p className="text-sm text-gray-900">{selectedContact.last_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Email</label>
                        <p className="text-sm">
                          {selectedContact.email ? (
                            <a href={`mailto:${selectedContact.email}`} className="text-blue-600 hover:underline">{selectedContact.email}</a>
                          ) : '—'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Work)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_work || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Home)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_home || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Phone (Cell)</label>
                        <p className="text-sm text-gray-900">{selectedContact.phone_cell || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Title</label>
                        <p className="text-sm text-gray-900">{selectedContact.title || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Company</label>
                        <p className="text-sm text-gray-900">{selectedContact.company_name || '—'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">Source</label>
                        <p className="text-sm">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sourceBadge(selectedContact.source)}`}>
                            {sourceIcon(selectedContact.source)}
                            {selectedContact.source || 'Unknown'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 font-medium">LinkedIn URL</label>
                        {selectedLinkedinUrl ? (
                          <a 
                            href={selectedLinkedinUrl.startsWith('http') ? selectedLinkedinUrl : `https://${selectedLinkedinUrl}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                            View Profile
                          </a>
                        ) : (
                          <p className="text-sm text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                    {selectedContact.notes && (
                      <div className="mt-3">
                        <label className="text-xs text-gray-500 font-medium">Notes</label>
                        <p className="text-sm text-gray-600 mt-0.5">{selectedContact.notes}</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Import Tool Dialog */}
      {showImportTool && (
        <ImportTool
          onComplete={loadData}
          onClose={() => setShowImportTool(false)}
        />
      )}

      {/* Clear All Data Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Clear All Data?</h3>
              <p className="text-sm text-gray-500 text-center mb-1">
                This will permanently delete:
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-4 space-y-1">
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <strong>{jobs.length}</strong> jobs
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <strong>{companies.length}</strong> companies
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <strong>{contacts.length}</strong> contacts
                </p>
                <p className="text-sm text-red-800 flex items-center gap-2">
                  <Database className="w-4 h-4 flex-shrink-0" />
                  All tracker run history
                </p>
              </div>
              <p className="text-xs text-red-600 text-center font-medium">
                This action cannot be undone. Export your data first if you need a backup.
              </p>
            </div>
            <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowClearConfirm(false)} disabled={clearing}>
                Cancel
              </Button>
              <Button
                onClick={handleClearAllData}
                disabled={clearing}
                className="bg-red-600 hover:bg-red-700 text-white gap-2"
              >
                {clearing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Clearing...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Yes, Clear Everything</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Data Cleanup Dialog */}
      {showCleanup && (
        <DataCleanup
          onClose={() => setShowCleanup(false)}
          onComplete={loadData}
        />
      )}

      {/* Push to Crelate Dialog */}
      {showPushToCrelate && (
        <PushToCrelate
          companies={companies}
          contacts={contacts}
          jobs={jobs}
          onClose={() => setShowPushToCrelate(false)}
          onComplete={loadData}
        />
      )}



      {/* Missing Titles Report Dialog */}
      {showMissingTitles && (
        <MissingTitlesReport
          standalone
          onClose={() => setShowMissingTitles(false)}
        />
      )}

      {/* Title Mapping Dialog */}
      {showTitleMapping && (
        <TitleMapping
          onClose={() => setShowTitleMapping(false)}
        />
      )}
    </div>




  );
};

export default MarketingNewJobs;
