import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  X, ArrowRight, ArrowLeft, Building2, Users, Database, Briefcase,
  CheckCircle, XCircle, AlertTriangle, Loader2,
  ChevronDown, ChevronRight, ExternalLink, SkipForward, Send,
  ArrowRightLeft, Eye, Shield, Info, FileText
 } from 'lucide-react';
import MissingTitlesReport from '@/components/marketing/MissingTitlesReport';


// Client-side validation: detect URLs, file paths, emails, etc. in name fields
function isValidContactName(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^www\./i.test(trimmed)) return false;
  if (/^\//.test(trimmed)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/\.(com|org|net|edu|gov|io|co|html|shtml|php|aspx|pdf)\b/i.test(trimmed)) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (trimmed.length > 80) return false;
  return true;
}



interface PushToCrelateProps {
  companies: any[];
  contacts: any[];
  jobs: any[];
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'select' | 'mapping' | 'preview' | 'pushing' | 'results';

interface PushResult {
  id: string;
  name: string;
  status: 'success' | 'skipped' | 'error';
  message: string;
  crelateId?: string;
}

const DEFAULT_COMPANY_MAPPINGS: Record<string, { crelateField: string; localField: string; label: string; required?: boolean }> = {
  name: { crelateField: 'Name', localField: 'company_name', label: 'Company Name', required: true },
  website: { crelateField: 'Websites_Business', localField: 'homepage_url', label: 'Website' },
  phone: { crelateField: 'PhoneNumbers_Main', localField: 'company_phone', label: 'Phone' },
  industry: { crelateField: 'Description (tag)', localField: 'company_type', label: 'Industry / Category' },
  location: { crelateField: 'Addresses_Business', localField: 'location', label: 'Location' },
  notes: { crelateField: 'Description', localField: 'notes', label: 'Notes / Description' },
};

const DEFAULT_CONTACT_MAPPINGS: Record<string, { crelateField: string; localField: string; label: string; required?: boolean }> = {
  firstName: { crelateField: 'FirstName', localField: 'first_name', label: 'First Name', required: true },
  lastName: { crelateField: 'LastName', localField: 'last_name', label: 'Last Name', required: true },
  email: { crelateField: 'EmailAddresses_Work', localField: 'email', label: 'Email' },
  phoneWork: { crelateField: 'PhoneNumbers_Work_Main', localField: 'phone_work', label: 'Phone (Work)' },
  phoneCell: { crelateField: 'PhoneNumbers_Mobile', localField: 'phone_cell', label: 'Phone (Cell)' },
  phoneHome: { crelateField: 'PhoneNumbers_Home', localField: 'phone_home', label: 'Phone (Home)' },
  title: { crelateField: 'CurrentPosition.JobTitle', localField: 'title', label: 'Job Title', required: true },
  company: { crelateField: 'CurrentPosition.CompanyId (auto-create & link)', localField: 'company_name', label: 'Company', required: true },
};


const DEFAULT_JOB_MAPPINGS: Record<string, { crelateField: string; localField: string; label: string; required?: boolean }> = {
  title: { crelateField: 'Name', localField: 'job_title', label: 'Job Title', required: true },
  company: { crelateField: 'AccountId (auto-create & link)', localField: 'company_name', label: 'Company Name', required: true },
  description: { crelateField: 'Description', localField: 'description', label: 'Description' },
  compensation: { crelateField: 'Salary / PortalCompensation', localField: 'salary_range', label: 'Compensation' },
  location: { crelateField: 'PortalCity / PortalState / Locations_Business', localField: 'location', label: 'Location (used for dedup)', required: true },
  opportunityType: { crelateField: 'OpportunityTypeId (BDO)', localField: 'opportunity_type', label: 'Opportunity Type' },
  jobType: { crelateField: 'Job Category (in name)', localField: 'job_category', label: 'Job Category / Type' },
  jobUrl: { crelateField: 'Websites_Other + PortalJobUrl', localField: 'job_url', label: 'Job URL (Website field)' },
  source: { crelateField: 'PortalJobUrl (fallback)', localField: 'website_source', label: 'Source Website' },
  notes: { crelateField: 'Description (append)', localField: 'notes', label: 'Notes' },
};






const COMPANY_LOCAL_FIELDS = [
  { value: 'company_name', label: 'Company Name' },
  { value: 'homepage_url', label: 'Homepage URL' },
  { value: 'website', label: 'Website' },
  { value: 'careers_url', label: 'Careers URL' },
  { value: 'company_phone', label: 'Company Phone' },
  { value: 'company_type', label: 'Company Type / Category' },
  { value: 'industry', label: 'Industry' },
  { value: 'location', label: 'Location' },
  { value: 'notes', label: 'Notes' },
  { value: '', label: '— Do not map —' },
];

const CONTACT_LOCAL_FIELDS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone_work', label: 'Phone (Work)' },
  { value: 'phone_cell', label: 'Phone (Cell)' },
  { value: 'phone_home', label: 'Phone (Home)' },
  { value: 'title', label: 'Title' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'notes', label: 'Notes' },
  { value: 'source', label: 'Source' },
  { value: '', label: '— Do not map —' },
];

const JOB_LOCAL_FIELDS = [
  { value: 'job_title', label: 'Job Title' },
  { value: 'company_name', label: 'Company Name' },
  { value: 'website_job_desc', label: 'Job Description' },
  { value: 'salary_range', label: 'Salary Range' },
  { value: 'location', label: 'Location' },
  { value: 'opportunity_type', label: 'Opportunity Type' },
  { value: 'job_category', label: 'Job Category' },
  { value: 'job_url', label: 'Job URL' },
  { value: 'website_source', label: 'Source Website' },
  { value: 'notes', label: 'Notes' },
  { value: 'status', label: 'Status' },
  { value: '', label: '— Do not map —' },
];


const PushToCrelate: React.FC<PushToCrelateProps> = ({ companies = [], contacts = [], jobs = [], onClose, onComplete }) => {
  const [step, setStep] = useState<Step>('select');
  const [pushCompanies, setPushCompanies] = useState(true);
  const [pushContacts, setPushContacts] = useState(true);
  const [pushJobs, setPushJobs] = useState(true);
  const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);
  const [excludeCrelateContacts, setExcludeCrelateContacts] = useState(true);
  const [excludeClosedJobs, setExcludeClosedJobs] = useState(true);
  const [excludeNoCompanyJobs, setExcludeNoCompanyJobs] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState({ current: 0, total: 0, phase: '' });
  const [companyResults, setCompanyResults] = useState<PushResult[]>([]);
  const [contactResults, setContactResults] = useState<PushResult[]>([]);
  const [jobResults, setJobResults] = useState<PushResult[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ companies: true, contacts: true, jobs: true });
  const [titleMatchReport, setTitleMatchReport] = useState<any>(null);


  // Field mapping state
  const [companyMappings, setCompanyMappings] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    Object.entries(DEFAULT_COMPANY_MAPPINGS).forEach(([key, val]) => { m[key] = val.localField; });
    return m;
  });

  const [contactMappings, setContactMappings] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    Object.entries(DEFAULT_CONTACT_MAPPINGS).forEach(([key, val]) => { m[key] = val.localField; });
    return m;
  });

  const [jobMappings, setJobMappings] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    Object.entries(DEFAULT_JOB_MAPPINGS).forEach(([key, val]) => { m[key] = val.localField; });
    return m;
  });

  // Filter data based on selections
  const filteredCompanies = useMemo(() => {
    let result = companies;
    if (highPriorityOnly) result = result.filter(c => c.is_high_priority);
    return result;
  }, [companies, highPriorityOnly]);

  // Separate valid contacts from invalid ones (URLs in name fields, missing names)
  const { validContacts: filteredContacts, invalidContacts } = useMemo(() => {
    let result = contacts;
    if (excludeCrelateContacts) result = result.filter(c => !c.crelate_contact_id);
    if (highPriorityOnly) {
      const priorityCompanyNames = new Set(filteredCompanies.map(c => c.company_name?.toLowerCase()));
      result = result.filter(c => priorityCompanyNames.has(c.company_name?.toLowerCase()));
    }
    // Split into valid (real names) and invalid (URLs, missing names)
    const valid: any[] = [];
    const invalid: any[] = [];
    for (const c of result) {
      const fnValid = isValidContactName(c.first_name);
      const lnValid = isValidContactName(c.last_name);
      if (fnValid || lnValid) {
        valid.push(c);
      } else {
        invalid.push(c);
      }
    }
    return { validContacts: valid, invalidContacts: invalid };
  }, [contacts, excludeCrelateContacts, highPriorityOnly, filteredCompanies]);

  // Count jobs missing company BEFORE filtering them out (for display)
  const jobsMissingCompany = useMemo(() => {
    let result = jobs;
    if (excludeClosedJobs) result = result.filter(j => !j.is_closed && j.status !== 'Closed');
    if (highPriorityOnly) {
      const priorityCompanyNames = new Set(filteredCompanies.map(c => c.company_name?.toLowerCase()));
      result = result.filter(j => j.high_priority || priorityCompanyNames.has(j.company_name?.toLowerCase()));
    }
    return result.filter(j => !j.company_name || j.company_name.trim() === '');
  }, [jobs, excludeClosedJobs, highPriorityOnly, filteredCompanies]);

  const filteredJobs = useMemo(() => {
    let result = jobs;
    if (excludeClosedJobs) result = result.filter(j => !j.is_closed && j.status !== 'Closed');
    if (highPriorityOnly) {
      const priorityCompanyNames = new Set(filteredCompanies.map(c => c.company_name?.toLowerCase()));
      result = result.filter(j => j.high_priority || priorityCompanyNames.has(j.company_name?.toLowerCase()));
    }
    // v10: Filter out jobs without company name (required field - will be rejected by server)
    if (excludeNoCompanyJobs) {
      result = result.filter(j => j.company_name && j.company_name.trim() !== '');
    }
    return result;
  }, [jobs, excludeClosedJobs, highPriorityOnly, filteredCompanies, excludeNoCompanyJobs]);


  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '');

  // Strip records to only include fields needed for the push (reduces payload size dramatically)
  const stripCompanyRecord = (rec: any) => {
    const stripped: any = { id: rec.id };
    // Always include company_name and Name (needed for identification)
    if (rec.company_name) stripped.company_name = rec.company_name;
    if (rec.Name) stripped.Name = rec.Name;
    // Include only mapped fields
    Object.values(companyMappings).forEach(field => {
      if (field && rec[field] !== undefined && rec[field] !== null) {
        stripped[field] = typeof rec[field] === 'string' ? stripHtml(rec[field]).substring(0, 2000) : rec[field];
      }
    });
    return stripped;
  };

  const stripContactRecord = (rec: any) => {
    const stripped: any = { id: rec.id };
    if (rec.crelate_contact_id) stripped.crelate_contact_id = rec.crelate_contact_id;
    Object.values(contactMappings).forEach(field => {
      if (field && rec[field] !== undefined && rec[field] !== null) {
        stripped[field] = typeof rec[field] === 'string' ? stripHtml(rec[field]).substring(0, 2000) : rec[field];
      }
    });
    // Always include these essential fields for contact creation + company linking
    if (rec.company_name) stripped.company_name = stripHtml(rec.company_name);
    if (rec.first_name) stripped.first_name = stripHtml(rec.first_name);
    if (rec.last_name) stripped.last_name = stripHtml(rec.last_name);
    if (rec.title) stripped.title = stripHtml(rec.title);
    if (rec.email) stripped.email = stripHtml(rec.email);
    if (rec.phone_work) stripped.phone_work = stripHtml(rec.phone_work);
    if (rec.notes) stripped.notes = typeof rec.notes === 'string' ? stripHtml(rec.notes).substring(0, 1000) : rec.notes;
    if (rec.source) stripped.source = stripHtml(rec.source);
    return stripped;
  };


  const stripJobRecord = (rec: any) => {
    const stripped: any = { id: rec.id };
    Object.values(jobMappings).forEach(field => {
      if (field && rec[field] !== undefined && rec[field] !== null) {
        // Truncate very long description fields to keep payload manageable
        if (field === 'website_job_desc' || field === 'description') {
          stripped[field] = typeof rec[field] === 'string' ? stripHtml(rec[field]).substring(0, 5000) : rec[field];
        } else {
          stripped[field] = typeof rec[field] === 'string' ? stripHtml(rec[field]).substring(0, 2000) : rec[field];
        }
      }
    });
    // Always include these for job processing
    if (rec.company_name) stripped.company_name = stripHtml(rec.company_name);
    if (rec.job_title) stripped.job_title = stripHtml(rec.job_title);
    if (rec.title) stripped.title = stripHtml(rec.title);
    if (rec.Name) stripped.Name = stripHtml(rec.Name);
    if (rec.location) stripped.location = rec.location;
    if (rec.city) stripped.city = rec.city;
    if (rec.state) stripped.state = rec.state;
    if (rec.opportunity_type) stripped.opportunity_type = rec.opportunity_type;
    if (rec.description) stripped.description = typeof rec.description === 'string' ? rec.description.substring(0, 10000) : rec.description;
    if (rec.website_job_desc) stripped.website_job_desc = rec.website_job_desc;
    if (rec.job_url) stripped.job_url = rec.job_url;
    if (rec.website_source) stripped.website_source = rec.website_source;
    if (rec.source) stripped.source = rec.source;
    if (rec.salary_range) stripped.salary_range = rec.salary_range;
    if (rec.job_category) stripped.job_category = rec.job_category;
    if (rec.google_doc_url) stripped.google_doc_url = rec.google_doc_url;
    if (rec.selling_points) stripped.selling_points = rec.selling_points;
    if (rec.high_priority) stripped.high_priority = rec.high_priority;
    if (rec.status) stripped.status = rec.status;
    return stripped;
  };

  const handlePush = async () => {
    setPushing(true);
    setStep('pushing');
    const totalItems = (pushCompanies ? filteredCompanies.length : 0) + (pushContacts ? filteredContacts.length : 0) + (pushJobs ? filteredJobs.length : 0);
    setPushProgress({ current: 0, total: totalItems, phase: 'Starting...' });

    const fieldMappings = {
      company: companyMappings,
      contact: contactMappings,
      job: jobMappings,
    };

    const COMPANY_BATCH_SIZE = 5;
    const CONTACT_BATCH_SIZE = 5;
    const JOB_BATCH_SIZE = 2;
    const MAX_RETRIES = 2;

    // Helper: invoke with retry for timeout/fetch errors
    const invokeWithRetry = async (body: any, retries = MAX_RETRIES): Promise<{ data: any; error: any }> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('push-to-crelate', { body });
          if (error) {
            const isTimeout = error.message?.includes('Failed to send') || 
                              error.message?.includes('Failed to fetch') ||
                              error.message?.includes('FunctionsFetchError') ||
                              error.name === 'FunctionsFetchError';
            if (isTimeout && attempt < retries) {
              console.warn(`Attempt ${attempt + 1} timed out, retrying in 3s...`, error.message);
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
          }
          return { data, error };
        } catch (err: any) {
          if (attempt < retries) {
            console.warn(`Attempt ${attempt + 1} exception, retrying in 3s...`, err.message);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          return { data: null, error: err };
        }
      }
      return { data: null, error: new Error('Max retries exceeded') };
    };

    try {
      // Push companies in batches
      if (pushCompanies && filteredCompanies.length > 0) {
        const allCompanyResults: PushResult[] = [];
        const strippedCompanies = filteredCompanies.map(stripCompanyRecord);

        for (let i = 0; i < strippedCompanies.length; i += COMPANY_BATCH_SIZE) {
          const batch = strippedCompanies.slice(i, i + COMPANY_BATCH_SIZE);
          const batchEnd = Math.min(i + COMPANY_BATCH_SIZE, strippedCompanies.length);
          setPushProgress(prev => ({
            ...prev,
            phase: `Pushing companies ${i + 1}-${batchEnd} of ${strippedCompanies.length}...`
          }));

          const { data, error } = await invokeWithRetry({ action: 'push_companies', records: batch, fieldMappings, skipDuplicateCheck });

          if (error) {
            console.error(`Company batch ${i + 1}-${batchEnd} error:`, error);
            batch.forEach(c => {
              allCompanyResults.push({
                id: c.id,
                name: c.company_name || c.Name || 'Unknown',
                status: 'error',
                message: error.message?.includes('Failed to') ? 'Request timeout - try smaller batch' : (error.message || 'Batch failed')
              });
            });
          } else if (data?.results) {
            allCompanyResults.push(...data.results);
          }
          setPushProgress(prev => ({ ...prev, current: prev.current + batch.length }));
        }
        setCompanyResults(allCompanyResults);
      }

      // Push contacts in batches
      if (pushContacts && filteredContacts.length > 0) {
        const allContactResults: PushResult[] = [];
        const strippedContacts = filteredContacts.map(stripContactRecord);

        for (let i = 0; i < strippedContacts.length; i += CONTACT_BATCH_SIZE) {
          const batch = strippedContacts.slice(i, i + CONTACT_BATCH_SIZE);
          const batchEnd = Math.min(i + CONTACT_BATCH_SIZE, strippedContacts.length);
          setPushProgress(prev => ({
            ...prev,
            phase: `Pushing contacts ${i + 1}-${batchEnd} of ${strippedContacts.length}...`
          }));

          const { data, error } = await invokeWithRetry({ action: 'push_contacts', records: batch, fieldMappings, skipDuplicateCheck });

          if (error) {
            console.error(`Contact batch ${i + 1}-${batchEnd} error:`, error);
            batch.forEach(c => {
              allContactResults.push({
                id: c.id,
                name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
                status: 'error',
                message: error.message?.includes('Failed to') ? 'Request timeout - try smaller batch' : (error.message || 'Batch failed')
              });
            });
          } else if (data?.results) {
            allContactResults.push(...data.results);
          }
          setPushProgress(prev => ({ ...prev, current: prev.current + batch.length }));
        }
        setContactResults(allContactResults);
      }

      // Push jobs in batches (v36: with title match tracking)
      if (pushJobs && filteredJobs.length > 0) {
        const allJobResults: PushResult[] = [];
        const strippedJobs = filteredJobs.map(stripJobRecord);
        // v36: Aggregate title match reports across batches
        const aggregatedUnmatched: Record<string, any> = {};
        let aggJobsPushed = 0, aggJobsWithTitle = 0, aggJobsWithoutTitle = 0;

        for (let i = 0; i < strippedJobs.length; i += JOB_BATCH_SIZE) {
          const batch = strippedJobs.slice(i, i + JOB_BATCH_SIZE);
          const batchEnd = Math.min(i + JOB_BATCH_SIZE, strippedJobs.length);
          setPushProgress(prev => ({
            ...prev,
            phase: `Pushing jobs ${i + 1}-${batchEnd} of ${strippedJobs.length}... (2/batch with retry)`
          }));

          const { data, error } = await invokeWithRetry({ action: 'push_jobs', records: batch, fieldMappings, skipDuplicateCheck });

          if (error) {
            console.error(`Job batch ${i + 1}-${batchEnd} error:`, error);
            batch.forEach(j => {
              allJobResults.push({
                id: j.id,
                name: j.job_title || j.title || 'Unknown',
                status: 'error',
                message: error.message?.includes('Failed to') ? 'Request timeout - function took too long' : (error.message || 'Batch failed')
              });
            });
          } else if (data?.results) {
            allJobResults.push(...data.results);
            if (data.elapsed) console.log(`Job batch ${i + 1}-${batchEnd} completed in ${data.elapsed}`);
            
            // v36: Aggregate titleMatchReport from each batch
            if (data.titleMatchReport) {
              const tmr = data.titleMatchReport;
              aggJobsPushed += tmr.totalJobsPushed || 0;
              aggJobsWithTitle += tmr.jobsWithTitle || 0;
              aggJobsWithoutTitle += tmr.jobsWithoutTitle || 0;
              
              for (const ut of (tmr.unmatchedTitles || [])) {
                const key = ut.title.toLowerCase().trim();
                if (aggregatedUnmatched[key]) {
                  aggregatedUnmatched[key].count += ut.count;
                  const existingCompanies = new Set(aggregatedUnmatched[key].companies || []);
                  for (const c of (ut.companies || [])) existingCompanies.add(c);
                  aggregatedUnmatched[key].companies = [...existingCompanies];
                } else {
                  aggregatedUnmatched[key] = { ...ut };
                }
              }
            }
          }
          setPushProgress(prev => ({ ...prev, current: prev.current + batch.length }));
        }
        setJobResults(allJobResults);
        
        // v36: Build aggregated title match report
        if (aggJobsPushed > 0) {
          const unmatchedArr = Object.values(aggregatedUnmatched).sort((a: any, b: any) => b.count - a.count);
          setTitleMatchReport({
            totalJobsPushed: aggJobsPushed,
            jobsWithTitle: aggJobsWithTitle,
            jobsWithoutTitle: aggJobsWithoutTitle,
            matchRate: aggJobsPushed > 0 ? Math.round((aggJobsWithTitle / aggJobsPushed) * 100) : 0,
            unmatchedTitles: unmatchedArr,
            unmatchedCount: unmatchedArr.length,
            totalAffectedJobs: unmatchedArr.reduce((sum: number, u: any) => sum + u.count, 0)
          });
        }
      }

      setStep('results');
    } catch (err: any) {
      console.error('Push to Crelate error:', err);
      setStep('results');
    } finally {
      setPushing(false);
    }
  };




  const totalSuccess = [...companyResults, ...contactResults, ...jobResults].filter(r => r.status === 'success').length;
  const totalSkipped = [...companyResults, ...contactResults, ...jobResults].filter(r => r.status === 'skipped').length;
  const totalErrors = [...companyResults, ...contactResults, ...jobResults].filter(r => r.status === 'error').length;

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />;
      case 'skipped': return <SkipForward className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      default: return null;
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Created</span>;
      case 'skipped': return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Skipped</span>;
      case 'error': return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Failed</span>;
      default: return null;
    }
  };

  const renderFieldMappingTable = (
    label: string,
    icon: React.ReactNode,
    sectionKey: string,
    defaultMappings: Record<string, { crelateField: string; localField: string; label: string; required?: boolean }>,
    currentMappings: Record<string, string>,
    setMappings: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    localFields: { value: string; label: string }[]
  ) => (
    <div className="border rounded-xl overflow-hidden">
      <button
        onClick={() => toggleSection(sectionKey)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {expandedSections[sectionKey] !== false ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        {icon}
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-400 ml-auto">{Object.values(currentMappings).filter(v => v).length} fields mapped</span>
      </button>
      {expandedSections[sectionKey] !== false && (
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Crelate Field</th>
                <th className="text-center py-2 px-3 w-10"></th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tracker Field</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(defaultMappings).map(([key, mapping]) => (
                <tr key={key} className="border-b last:border-0">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700 font-medium">{mapping.label}</span>
                      {mapping.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold">REQ</span>}
                    </div>
                    <span className="text-xs text-gray-400 font-mono">{mapping.crelateField}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <ArrowRight className="w-4 h-4 text-gray-300 mx-auto" />
                  </td>
                  <td className="py-2.5 px-3">
                    <select
                      value={currentMappings[key] || ''}
                      onChange={e => setMappings(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                    >
                      {localFields.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderResultsSection = (
    label: string,
    icon: React.ReactNode,
    sectionKey: string,
    results: PushResult[],
    crelateUrlPrefix: string
  ) => {
    if (results.length === 0) return null;
    return (
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          {expandedSections[sectionKey] !== false ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
          {icon}
          <span className="text-sm font-semibold text-gray-700">{label} ({results.length})</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-green-600">{results.filter(r => r.status === 'success').length} created</span>
            <span className="text-xs text-amber-600">{results.filter(r => r.status === 'skipped').length} skipped</span>
            <span className="text-xs text-red-600">{results.filter(r => r.status === 'error').length} errors</span>
          </div>
        </button>
        {expandedSections[sectionKey] !== false && (
          <div className="max-h-[300px] overflow-y-auto">
            {results.map((r, i) => (
              <div key={r.id || i} className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-0 ${
                r.status === 'error' ? 'bg-red-50/50' : r.status === 'skipped' ? 'bg-amber-50/30' : ''
              }`}>
                {renderStatusIcon(r.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 truncate">{r.message}</p>
                </div>
                {renderStatusBadge(r.status)}
                {r.crelateId && (
                  <a
                    href={`https://app.crelate.com/go#stage/${crelateUrlPrefix}/${r.crelateId}/summary`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Push to Crelate</h2>
              <p className="text-xs text-gray-500">Export companies, contacts, and jobs to your Crelate ATS</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2">
          {[
            { key: 'select', label: 'Select Data' },
            { key: 'mapping', label: 'Field Mapping' },
            { key: 'preview', label: 'Preview' },
            { key: 'pushing', label: 'Pushing' },
            { key: 'results', label: 'Results' },
          ].map((s, i, arr) => {
            const stepOrder = ['select', 'mapping', 'preview', 'pushing', 'results'];
            const currentIdx = stepOrder.indexOf(step);
            const stepIdx = stepOrder.indexOf(s.key);
            const isActive = s.key === step;
            const isDone = stepIdx < currentIdx;

            return (
              <React.Fragment key={s.key}>
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
                  isActive ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' :
                  isDone ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : (
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-white'
                    }`}>{i + 1}</span>
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className={`w-6 h-px ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: SELECT DATA */}
          {step === 'select' && (
            <div className="space-y-6">
               <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">What this does</p>
                  <p>Pushes companies, contacts, and <strong>jobs</strong> into Crelate ATS. Companies are auto-created and linked to both contacts and jobs. Contacts are created with <strong>first name, last name, company, and title</strong> as minimum required fields. Duplicate jobs are detected by matching <strong>Title + Company + Location</strong> (all 3 must match).</p>
                </div>
              </div>



              {/* Data Type Selection */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">What do you want to push?</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Companies Card */}
                  <button
                    onClick={() => setPushCompanies(!pushCompanies)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      pushCompanies ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pushCompanies ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                        <Building2 className={`w-4 h-4 ${pushCompanies ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Companies</p>
                        <p className="text-xs text-gray-500">{highPriorityOnly ? filteredCompanies.length : companies.length} records</p>
                      </div>
                      <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        pushCompanies ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {pushCompanies && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Creates company records with name, website, phone, category, and tags.</p>
                  </button>

                  {/* Contacts Card */}
                  <button
                    onClick={() => setPushContacts(!pushContacts)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      pushContacts ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pushContacts ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                        <Users className={`w-4 h-4 ${pushContacts ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Contacts</p>
                        <p className="text-xs text-gray-500">{highPriorityOnly ? filteredContacts.length : (excludeCrelateContacts ? contacts.filter(c => !c.crelate_contact_id).length : contacts.length)} records</p>
                      </div>
                      <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        pushContacts ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {pushContacts && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Creates contact records with name, email, phone, title, and links to companies.</p>
                  </button>

                  {/* Jobs Card */}
                  <button
                    onClick={() => setPushJobs(!pushJobs)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      pushJobs ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pushJobs ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                        <Briefcase className={`w-4 h-4 ${pushJobs ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Jobs</p>
                        <p className="text-xs text-gray-500">{excludeClosedJobs ? jobs.filter(j => !j.is_closed && j.status !== 'Closed').length : jobs.length} records</p>
                      </div>
                      <div className={`ml-auto w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                        pushJobs ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {pushJobs && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Creates job postings with title, description, salary, location, and links to companies.</p>
                  </button>
                </div>
              </div>

              {/* Filter Options */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter Options</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={highPriorityOnly} onChange={e => setHighPriorityOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">High priority only</p>
                      <p className="text-xs text-gray-500">Only push high priority companies and their associated contacts/jobs</p>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {companies.filter(c => c.is_high_priority).length} companies
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={excludeCrelateContacts} onChange={e => setExcludeCrelateContacts(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Exclude contacts already in Crelate</p>
                      <p className="text-xs text-gray-500">Skip contacts that already have a Crelate ID linked</p>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                      {contacts.filter(c => c.crelate_contact_id).length} already linked
                    </span>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={excludeClosedJobs} onChange={e => setExcludeClosedJobs(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Exclude closed jobs</p>
                      <p className="text-xs text-gray-500">Only push open/active jobs to Crelate</p>
                    </div>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                      {jobs.filter(j => j.is_closed || j.status === 'Closed').length} closed
                    </span>
                  </label>


                  <label className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50/30 hover:bg-red-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={excludeNoCompanyJobs} onChange={e => setExcludeNoCompanyJobs(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Exclude jobs without company name <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-bold ml-1">REQUIRED</span></p>
                      <p className="text-xs text-gray-500">Company name is required for jobs. Jobs without a company will be rejected by Crelate and create orphaned records.</p>
                    </div>
                    {jobsMissingCompany.length > 0 ? (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> {jobsMissingCompany.length} missing
                      </span>
                    ) : (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> All have company
                      </span>
                    )}
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={skipDuplicateCheck} onChange={e => setSkipDuplicateCheck(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Skip duplicate check in Crelate</p>
                      <p className="text-xs text-gray-500">Jobs are matched by Title + Company + Location (all 3 must match to be a duplicate). Disable to skip this check.</p>
                    </div>
                    {skipDuplicateCheck && (
                      <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Risk
                      </span>
                    )}
                  </label>
                </div>
              </div>


              {/* Invalid Contacts Warning */}
              {invalidContacts.length > 0 && pushContacts && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-800">
                    <p className="font-semibold mb-1">{invalidContacts.length} invalid contacts excluded</p>
                    <p className="text-xs">{invalidContacts.length} contact records have URLs or missing data in their name fields and will be automatically excluded from the push. These are reference links, not real contacts.</p>
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer text-orange-600 hover:text-orange-800 font-medium">Show excluded contacts</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-orange-700 max-h-32 overflow-y-auto">
                        {invalidContacts.map(c => (
                          <li key={c.id} className="truncate">
                            {c.company_name || 'Unknown company'}: {(c.first_name || c.last_name || 'no name').substring(0, 80)}...
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </div>
              )}



              {/* Summary */}
              <div className="bg-gray-50 rounded-lg border p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Push Summary</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className={`p-3 rounded-lg border ${pushCompanies ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-100 border-gray-200 opacity-50'}`}>
                    <p className="text-2xl font-bold text-indigo-700">{pushCompanies ? filteredCompanies.length : 0}</p>
                    <p className="text-xs text-indigo-600 font-medium">Companies</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${pushContacts ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-100 border-gray-200 opacity-50'}`}>
                    <p className="text-2xl font-bold text-indigo-700">{pushContacts ? filteredContacts.length : 0}</p>
                    <p className="text-xs text-indigo-600 font-medium">Contacts</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${pushJobs ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-100 border-gray-200 opacity-50'}`}>
                    <p className="text-2xl font-bold text-indigo-700">{pushJobs ? filteredJobs.length : 0}</p>
                    <p className="text-xs text-indigo-600 font-medium">Jobs</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: FIELD MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-6">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-start gap-3">
                <ArrowRightLeft className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-purple-800">
                  <p className="font-semibold mb-1">Field Mapping Configuration</p>
                  <p>Map your tracker fields to Crelate fields. The defaults should work for most cases.</p>
                </div>
              </div>

              {pushCompanies && renderFieldMappingTable(
                'Company Field Mapping',
                <Building2 className="w-4 h-4 text-indigo-600" />,
                'companyMapping',
                DEFAULT_COMPANY_MAPPINGS,
                companyMappings,
                setCompanyMappings,
                COMPANY_LOCAL_FIELDS
              )}

              {pushContacts && renderFieldMappingTable(
                'Contact Field Mapping',
                <Users className="w-4 h-4 text-indigo-600" />,
                'contactMapping',
                DEFAULT_CONTACT_MAPPINGS,
                contactMappings,
                setContactMappings,
                CONTACT_LOCAL_FIELDS
              )}

              {pushJobs && renderFieldMappingTable(
                'Job Field Mapping',
                <Briefcase className="w-4 h-4 text-indigo-600" />,
                'jobMapping',
                DEFAULT_JOB_MAPPINGS,
                jobMappings,
                setJobMappings,
                JOB_LOCAL_FIELDS
              )}
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <Eye className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">Review Before Pushing</p>
                  <p>Review the data below. Duplicates will be detected and skipped automatically{skipDuplicateCheck ? ' (duplicate check is DISABLED)' : ''}.</p>
                </div>
              </div>

              {/* Companies Preview */}
              {pushCompanies && filteredCompanies.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <button onClick={() => toggleSection('companiesPreview')}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left">
                    {expandedSections.companiesPreview !== false ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-indigo-500" />}
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-700">{filteredCompanies.length} Companies</span>
                  </button>
                  {expandedSections.companiesPreview !== false && (
                    <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Company Name</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Category</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Website</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredCompanies.slice(0, 30).map((c, i) => (
                            <tr key={c.id} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                              <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                              <td className="px-4 py-2 font-medium text-gray-900">{c.company_name}</td>
                              <td className="px-4 py-2 text-gray-600">{c.company_type || '—'}</td>
                              <td className="px-4 py-2 text-gray-600 text-xs truncate max-w-[200px]">{c.homepage_url || c.website || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredCompanies.length > 30 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50 border-t">
                          Showing first 30 of {filteredCompanies.length} companies
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Contacts Preview */}
              {pushContacts && filteredContacts.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <button onClick={() => toggleSection('contactsPreview')}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left">
                    {expandedSections.contactsPreview !== false ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-indigo-500" />}
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-700">{filteredContacts.length} Contacts</span>
                    {(() => {
                      const missingTitle = filteredContacts.filter(c => !c.title).length;
                      const missingCompany = filteredContacts.filter(c => !c.company_name).length;
                      return (missingTitle > 0 || missingCompany > 0) ? (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                          {missingTitle > 0 && `${missingTitle} missing title`}
                          {missingTitle > 0 && missingCompany > 0 && ', '}
                          {missingCompany > 0 && `${missingCompany} missing company`}
                        </span>
                      ) : null;
                    })()}
                  </button>
                  {expandedSections.contactsPreview !== false && (
                    <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Name</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Title</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Company</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContacts.slice(0, 50).map((c, i) => {
                            const missingFields = (!c.title ? 1 : 0) + (!c.company_name ? 1 : 0);
                            return (
                              <tr key={c.id} className={`border-b ${missingFields > 0 ? 'bg-amber-50/40' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}`}>
                                <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2 font-medium text-gray-900">{c.first_name} {c.last_name}</td>
                                <td className="px-4 py-2 text-gray-600 text-xs">
                                  {c.title || <span className="text-amber-500 italic">missing</span>}
                                </td>
                                <td className="px-4 py-2 text-gray-600 text-xs">
                                  {c.company_name || <span className="text-amber-500 italic">missing</span>}
                                </td>
                                <td className="px-4 py-2 text-gray-600 text-xs">{c.email || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredContacts.length > 50 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50 border-t">
                          Showing first 50 of {filteredContacts.length} contacts
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* Jobs Preview */}
              {pushJobs && filteredJobs.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <button onClick={() => toggleSection('jobsPreview')}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition-colors text-left">
                    {expandedSections.jobsPreview !== false ? <ChevronDown className="w-4 h-4 text-emerald-500" /> : <ChevronRight className="w-4 h-4 text-emerald-500" />}
                    <Briefcase className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">{filteredJobs.length} Jobs</span>
                    {(() => {
                      const missingCompany = filteredJobs.filter(j => !j.company_name).length;
                      const missingLocation = filteredJobs.filter(j => !j.location).length;
                      return (missingCompany > 0 || missingLocation > 0) ? (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                          {missingCompany > 0 && `${missingCompany} missing company`}
                          {missingCompany > 0 && missingLocation > 0 && ', '}
                          {missingLocation > 0 && `${missingLocation} missing location`}
                        </span>
                      ) : null;
                    })()}
                  </button>
                  {expandedSections.jobsPreview !== false && (
                    <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">#</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Job Title</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Company</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Location</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredJobs.slice(0, 30).map((j, i) => {
                            const missingFields = (!j.company_name ? 1 : 0) + (!j.location ? 1 : 0);
                            return (
                              <tr key={j.id} className={`border-b ${missingFields > 0 ? 'bg-amber-50/40' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')}`}>
                                <td className="px-4 py-2 text-xs text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2 font-medium text-gray-900">{j.job_title || j.title || '—'}</td>
                                <td className="px-4 py-2 text-gray-600 text-xs">
                                  {j.company_name || <span className="text-amber-500 italic">missing</span>}
                                </td>
                                <td className="px-4 py-2 text-gray-600 text-xs">
                                  {j.location || <span className="text-amber-500 italic">missing</span>}
                                </td>
                                <td className="px-4 py-2 text-gray-600 text-xs">{j.website_source || j.source || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredJobs.length > 30 && (
                        <div className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50 border-t">
                          Showing first 30 of {filteredJobs.length} jobs
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}


              {/* Confirmation Box */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-1">Confirm Push to Crelate</p>
                    <p className="text-xs text-red-700 mb-2">
                      This will create <strong>{pushCompanies ? filteredCompanies.length : 0} companies</strong>, <strong>{pushContacts ? filteredContacts.length : 0} contacts</strong>, and <strong>{pushJobs ? filteredJobs.length : 0} jobs</strong> in your Crelate ATS.
                      {!skipDuplicateCheck && ' Existing records will be detected and skipped.'}
                      {skipDuplicateCheck && ' WARNING: Duplicate checking is disabled — duplicates may be created.'}
                    </p>
                    <p className="text-xs text-red-600">All records will be tagged with "Marketing Tracker Import" for easy identification.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PUSHING */}
          {step === 'pushing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Pushing to Crelate...</h3>
              <p className="text-sm text-gray-500 mb-6">{pushProgress.phase}</p>
              
              {pushProgress.total > 0 && (
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{pushProgress.current} of {pushProgress.total} records</span>
                    <span>{Math.round((pushProgress.current / pushProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((pushProgress.current / pushProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-6">
                v17: Processing in smaller batches (5 companies/contacts, 2 jobs) with auto-retry on timeout.
                <br />Estimated time: ~{Math.ceil(((pushCompanies ? filteredCompanies.length : 0) * 4 + (pushContacts ? filteredContacts.length : 0) * 4 + (pushJobs ? filteredJobs.length : 0) * 8) / 60)} minutes. Please don't close this window.
              </p>

            </div>
          )}



          {/* STEP 5: RESULTS */}
          {step === 'results' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-700">{totalSuccess}</p>
                  <p className="text-xs text-green-600 font-medium">Created</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <SkipForward className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-amber-700">{totalSkipped}</p>
                  <p className="text-xs text-amber-600 font-medium">Skipped (Duplicates)</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <XCircle className="w-6 h-6 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-red-700">{totalErrors}</p>
                  <p className="text-xs text-red-600 font-medium">Errors</p>
                </div>
              </div>

              {renderResultsSection('Company Results', <Building2 className="w-4 h-4 text-indigo-600" />, 'companyResults', companyResults, '_Companies/DefaultView')}
              {renderResultsSection('Contact Results', <Users className="w-4 h-4 text-indigo-600" />, 'contactResults', contactResults, '_Contacts/DefaultView')}
              {renderResultsSection('Job Results', <Briefcase className="w-4 h-4 text-emerald-600" />, 'jobResults', jobResults, '_Jobs/DefaultView')}

              {/* v36: Missing Titles Report - shown after job push */}
              {titleMatchReport && titleMatchReport.unmatchedTitles?.length > 0 && (
                <div className="border-2 border-amber-300 rounded-xl overflow-hidden">
                  <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-900">Missing Job Titles Report</h3>
                      <p className="text-xs text-amber-700">
                        {titleMatchReport.unmatchedCount} title{titleMatchReport.unmatchedCount !== 1 ? 's' : ''} not found in Crelate, affecting {titleMatchReport.totalAffectedJobs} job{titleMatchReport.totalAffectedJobs !== 1 ? 's' : ''} ({titleMatchReport.matchRate}% match rate)
                      </p>
                    </div>
                  </div>
                  <div className="p-4">
                    <MissingTitlesReport titleMatchReport={titleMatchReport} />
                  </div>
                </div>
              )}

              {/* No results */}
              {companyResults.length === 0 && contactResults.length === 0 && jobResults.length === 0 && (
                <div className="text-center py-12">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700">No results to display</p>
                  <p className="text-xs text-gray-500 mt-1">The push may have encountered an error. Check the browser console for details.</p>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {step === 'select' && `${companies.length} companies, ${contacts.length} contacts, ${jobs.length} jobs available`}
            {step === 'mapping' && 'Configure how fields map to Crelate'}
            {step === 'preview' && 'Review data before pushing'}
            {step === 'pushing' && 'Please wait...'}
            {step === 'results' && `Completed at ${new Date().toLocaleTimeString()}`}
          </div>
          <div className="flex items-center gap-3">
            {step === 'select' && (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={() => setStep('mapping')}
                  disabled={!pushCompanies && !pushContacts && !pushJobs}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                >
                  Next: Field Mapping <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
            {step === 'mapping' && (
              <>
                <Button variant="outline" onClick={() => setStep('select')} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button onClick={() => setStep('preview')} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  Next: Preview <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={() => setStep('mapping')} className="gap-2">
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
                <Button onClick={handlePush} disabled={pushing} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                  {pushing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Pushing...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Push to Crelate</>
                  )}
                </Button>
              </>
            )}
            {step === 'pushing' && (
              <Button variant="outline" disabled className="gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Processing...
              </Button>
            )}
            {step === 'results' && (
              <>
                <Button variant="outline" onClick={() => { onComplete(); onClose(); }}>
                  Close
                </Button>
                {totalErrors > 0 && (
                  <Button
                    onClick={() => {
                      setCompanyResults([]);
                      setContactResults([]);
                      setJobResults([]);
                      setStep('select');
                    }}
                    variant="outline"
                    className="gap-2 text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                  >
                    <ArrowLeft className="w-4 h-4" /> Try Again
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PushToCrelate;
