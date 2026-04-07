import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  Upload, FileSpreadsheet, X, CheckCircle, XCircle, Loader2,
  AlertTriangle, ChevronDown, ChevronUp, ArrowRight, Trash2,
  FileUp, Table, Eye, Download, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

// Column mapping definitions
const JOB_COLUMN_MAP: Record<string, string> = {
  'job category': 'job_category',
  'category': 'job_category',
  'company': 'company_name',
  'company name': 'company_name',
  'organization': 'company_name',
  'job title': 'job_title',
  'title': 'job_title',
  'role': 'job_title',
  'position': 'job_title',
  'website (job description)': 'website_job_desc',
  'job description url': 'website_job_desc',
  'job url': 'job_url',
  'url': 'job_url',
  'link': 'job_url',
  'website - other (source url)': 'website_source',
  'source url': 'website_source',
  'website source': 'website_source',
  'city': 'city',
  'state': 'state',
  'location': 'location',
  'opportunity type': 'opportunity_type',
  'opp type': 'opportunity_type',
  'salary': 'salary_range',
  'salary range': 'salary_range',
  'source': 'source',
  'notes': 'notes',
  'indeed url': 'indeed_url',
  'indeed': 'indeed_url',
  'linkedin url': 'linkedin_url',
  'linkedin': 'linkedin_url',
  'google jobs url': 'google_jobs_url',
  'google jobs': 'google_jobs_url',
};

const CONTACT_COLUMN_MAP: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'first': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last': 'last_name',
  'email': 'email',
  'email address': 'email',
  'phone (work)': 'phone_work',
  'work phone': 'phone_work',
  'phone work': 'phone_work',
  'phone (home)': 'phone_home',
  'home phone': 'phone_home',
  'phone home': 'phone_home',
  'phone (cell)': 'phone_cell',
  'cell phone': 'phone_cell',
  'phone cell': 'phone_cell',
  'mobile': 'phone_cell',
  'phone': 'phone_work',
  'title': 'title',
  'job title': 'title',
  'position': 'title',
  'company': 'company_name',
  'company name': 'company_name',
  'organization': 'company_name',
  'source': 'source',
  'linkedin url': 'linkedin_url',
  'linkedin': 'linkedin_url',
  'linkedin profile': 'linkedin_url',
  'linkedin link': 'linkedin_url',
  'notes': 'notes',
};


const COMPANY_COLUMN_MAP: Record<string, string> = {
  'company': 'company_name',
  'company name': 'company_name',
  'organization': 'company_name',
  'category': 'company_type',
  'company type': 'company_type',
  'type': 'company_type',
  'industry': 'industry',
  'website': 'website',
  'careers url': 'careers_url',
  'careers page': 'careers_url',
  'location': 'location',
  'notes': 'notes',
  'contact count': 'contact_count',
  'company contact count': 'contact_count',
  'open roles': 'open_roles_count',
  'open roles count': 'open_roles_count',
  'high priority': 'is_high_priority',
  'priority': 'is_high_priority',
  'md/cmo': 'has_md_cmo',
};

type SheetType = 'jobs' | 'contacts' | 'companies' | 'unknown';
type ImportStep = 'upload' | 'preview' | 'mapping' | 'importing' | 'complete';

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, any>[];
  detectedType: SheetType;
  columnMapping: Record<string, string>;
  selected: boolean;
}

interface ImportResult {
  sheetName: string;
  type: SheetType;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface ImportToolProps {
  onComplete: () => void;
  onClose: () => void;
}

const ImportTool: React.FC<ImportToolProps> = ({ onComplete, onClose }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, label: '' });
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showMappingDetails, setShowMappingDetails] = useState(false);

  // Detect sheet type based on headers
  const detectSheetType = (headers: string[]): SheetType => {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());
    
    // Check for jobs indicators
    const jobIndicators = ['job title', 'job category', 'opportunity type', 'website (job description)', 'salary range', 'indeed url'];
    const jobScore = jobIndicators.filter(ind => lowerHeaders.some(h => h.includes(ind) || ind.includes(h))).length;
    
    // Check for contacts indicators
    const contactIndicators = ['first name', 'last name', 'email', 'phone (work)', 'phone (cell)', 'phone (home)'];
    const contactScore = contactIndicators.filter(ind => lowerHeaders.some(h => h.includes(ind) || ind.includes(h))).length;
    
    // Check for company indicators
    const companyIndicators = ['company contact count', 'open roles', 'careers url', 'high priority', 'md/cmo'];
    const companyScore = companyIndicators.filter(ind => lowerHeaders.some(h => h.includes(ind) || ind.includes(h))).length;

    // Also check sheet name
    if (jobScore >= 2 || lowerHeaders.includes('job title')) return 'jobs';
    if (contactScore >= 2 || (lowerHeaders.includes('first name') && lowerHeaders.includes('last name'))) return 'contacts';
    if (companyScore >= 1) return 'companies';
    
    // If it has 'company' and 'title' columns, it could be jobs or contacts
    if (lowerHeaders.includes('company') && (lowerHeaders.includes('title') || lowerHeaders.includes('role'))) return 'jobs';
    if (lowerHeaders.includes('company') && lowerHeaders.includes('email')) return 'contacts';
    
    return 'unknown';
  };

  // Auto-map columns
  const autoMapColumns = (headers: string[], type: SheetType): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const mapSource = type === 'jobs' ? JOB_COLUMN_MAP : type === 'contacts' ? CONTACT_COLUMN_MAP : COMPANY_COLUMN_MAP;
    
    headers.forEach(header => {
      const lower = header.toLowerCase().trim();
      if (mapSource[lower]) {
        mapping[header] = mapSource[lower];
      } else {
        // Try partial matching
        const partialMatch = Object.keys(mapSource).find(key => 
          lower.includes(key) || key.includes(lower)
        );
        if (partialMatch) {
          mapping[header] = mapSource[partialMatch];
        }
      }
    });
    
    return mapping;
  };

  // Parse file
  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const parsedSheets: ParsedSheet[] = workbook.SheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
          const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          
          // Detect type from sheet name first
          let detectedType: SheetType = 'unknown';
          const lowerName = sheetName.toLowerCase();
          if (lowerName.includes('job') || lowerName.includes('role') || lowerName.includes('position')) {
            detectedType = 'jobs';
          } else if (lowerName.includes('contact') || lowerName.includes('people') || lowerName.includes('person')) {
            detectedType = 'contacts';
          } else if (lowerName.includes('company') || lowerName.includes('compan') || lowerName.includes('org')) {
            detectedType = 'companies';
          } else {
            detectedType = detectSheetType(headers);
          }
          
          const columnMapping = autoMapColumns(headers, detectedType);
          
          return {
            name: sheetName,
            headers,
            rows: jsonData,
            detectedType,
            columnMapping,
            selected: detectedType !== 'unknown' && jsonData.length > 0,
          };
        }).filter(s => s.rows.length > 0); // Only show sheets with data
        
        if (parsedSheets.length === 0) {
          toast({ title: 'Empty File', description: 'No data found in the uploaded file.', variant: 'destructive' });
          return;
        }
        
        setSheets(parsedSheets);
        setActiveSheetIdx(0);
        setStep('preview');
      } catch (err: any) {
        toast({ title: 'Parse Error', description: err.message || 'Failed to parse file', variant: 'destructive' });
      }
    };
    
    reader.readAsArrayBuffer(file);
  }, [toast]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // Handle file select
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // Toggle sheet selection
  const toggleSheet = (idx: number) => {
    setSheets(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  };

  // Change sheet type
  const changeSheetType = (idx: number, type: SheetType) => {
    setSheets(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const newMapping = autoMapColumns(s.headers, type);
      return { ...s, detectedType: type, columnMapping: newMapping };
    }));
  };

  // Update column mapping
  const updateMapping = (sheetIdx: number, header: string, dbField: string) => {
    setSheets(prev => prev.map((s, i) => {
      if (i !== sheetIdx) return s;
      const newMapping = { ...s.columnMapping };
      if (dbField === '') {
        delete newMapping[header];
      } else {
        newMapping[header] = dbField;
      }
      return { ...s, columnMapping: newMapping };
    }));
  };

  // Get available DB fields for a sheet type
  const getDbFields = (type: SheetType): { value: string; label: string }[] => {
    if (type === 'jobs') return [
      { value: '', label: '-- Skip --' },
      { value: 'job_category', label: 'Job Category' },
      { value: 'company_name', label: 'Company Name' },
      { value: 'job_title', label: 'Job Title' },
      { value: 'job_url', label: 'Job URL' },
      { value: 'website_job_desc', label: 'Website (Job Desc)' },
      { value: 'website_source', label: 'Website Source' },
      { value: 'city', label: 'City' },
      { value: 'state', label: 'State' },
      { value: 'location', label: 'Location' },
      { value: 'opportunity_type', label: 'Opportunity Type' },
      { value: 'salary_range', label: 'Salary Range' },
      { value: 'source', label: 'Source' },
      { value: 'notes', label: 'Notes' },
      { value: 'indeed_url', label: 'Indeed URL' },
      { value: 'linkedin_url', label: 'LinkedIn URL' },
      { value: 'google_jobs_url', label: 'Google Jobs URL' },
    ];
    if (type === 'contacts') return [
      { value: '', label: '-- Skip --' },
      { value: 'first_name', label: 'First Name' },
      { value: 'last_name', label: 'Last Name' },
      { value: 'email', label: 'Email' },
      { value: 'phone_work', label: 'Phone (Work)' },
      { value: 'phone_home', label: 'Phone (Home)' },
      { value: 'phone_cell', label: 'Phone (Cell)' },
      { value: 'title', label: 'Title' },
      { value: 'company_name', label: 'Company' },
      { value: 'source', label: 'Source' },
      { value: 'linkedin_url', label: 'LinkedIn URL' },
      { value: 'notes', label: 'Notes' },
    ];
    if (type === 'companies') return [
      { value: '', label: '-- Skip --' },
      { value: 'company_name', label: 'Company Name' },
      { value: 'company_type', label: 'Company Type' },
      { value: 'industry', label: 'Industry' },
      { value: 'website', label: 'Website' },
      { value: 'careers_url', label: 'Careers URL' },
      { value: 'location', label: 'Location' },
      { value: 'notes', label: 'Notes' },
      { value: 'contact_count', label: 'Contact Count' },
      { value: 'open_roles_count', label: 'Open Roles Count' },
      { value: 'is_high_priority', label: 'High Priority' },
      { value: 'has_md_cmo', label: 'MD/CMO' },
    ];
    return [{ value: '', label: '-- Skip --' }];

  };

  // Run the import
  const runImport = async () => {
    const selectedSheets = sheets.filter(s => s.selected && s.detectedType !== 'unknown');
    if (selectedSheets.length === 0) {
      toast({ title: 'Nothing to Import', description: 'Select at least one sheet to import.', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setStep('importing');
    const results: ImportResult[] = [];

    // First pass: collect all unique company names from jobs
    const allCompanyNames = new Set<string>();
    selectedSheets.forEach(sheet => {
      if (sheet.detectedType === 'jobs' || sheet.detectedType === 'contacts') {
        const companyField = Object.entries(sheet.columnMapping).find(([_, v]) => v === 'company_name');
        if (companyField) {
          sheet.rows.forEach(row => {
            const name = String(row[companyField[0]] || '').trim();
            if (name) allCompanyNames.add(name);
          });
        }
      }
    });

    // Import companies first (from company sheets + auto-create from jobs/contacts)
    const companySheets = selectedSheets.filter(s => s.detectedType === 'companies');
    const companyIdMap: Record<string, string> = {};

    // Process explicit company sheets
    for (const sheet of companySheets) {
      const result: ImportResult = { sheetName: sheet.name, type: 'companies', totalRows: sheet.rows.length, imported: 0, skipped: 0, errors: [] };
      setImportProgress({ current: 0, total: sheet.rows.length, label: `Importing companies from "${sheet.name}"...` });

      const batch: any[] = [];
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        const mapped: Record<string, any> = {};
        Object.entries(sheet.columnMapping).forEach(([header, dbField]) => {
          let val = row[header];
          if (val === undefined || val === null || val === '') return;
          // Handle boolean fields
          if (dbField === 'is_high_priority' || dbField === 'has_md_cmo') {
            val = String(val).toLowerCase() === 'true' || String(val) === '1' || String(val).toLowerCase() === 'yes';
          }
          // Handle numeric fields
          if (dbField === 'contact_count' || dbField === 'open_roles_count') {
            val = parseInt(String(val)) || 0;
          }
          mapped[dbField] = val;
        });

        if (!mapped.company_name) {
          result.skipped++;
          continue;
        }

        mapped.company_name = String(mapped.company_name).trim();
        batch.push(mapped);
        allCompanyNames.delete(mapped.company_name); // Remove from auto-create set
      }

      // Upsert companies in batches
      if (batch.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          const chunk = batch.slice(i, i + BATCH_SIZE);
          setImportProgress({ current: i + chunk.length, total: sheet.rows.length, label: `Importing companies from "${sheet.name}"...` });
          
          const { data, error } = await supabase
            .from('marketing_companies')
            .upsert(chunk, { onConflict: 'company_name', ignoreDuplicates: false })
            .select('id, company_name');
          
          if (error) {
            // Try one by one
            for (const item of chunk) {
              const { data: single, error: singleErr } = await supabase
                .from('marketing_companies')
                .upsert(item, { onConflict: 'company_name', ignoreDuplicates: false })
                .select('id, company_name')
                .single();
              if (singleErr) {
                result.errors.push(`Row: ${item.company_name} - ${singleErr.message}`);
                result.skipped++;
              } else if (single) {
                companyIdMap[single.company_name] = single.id;
                result.imported++;
              }
            }
          } else if (data) {
            data.forEach((d: any) => {
              companyIdMap[d.company_name] = d.id;
            });
            result.imported += data.length;
          }
        }
      }

      result.skipped = result.totalRows - result.imported - result.errors.length;
      results.push(result);
    }

    // Auto-create companies from remaining company names (from jobs/contacts)
    if (allCompanyNames.size > 0) {
      setImportProgress({ current: 0, total: allCompanyNames.size, label: 'Auto-creating companies from job/contact data...' });
      const autoCompanies = Array.from(allCompanyNames).map(name => ({ company_name: name }));
      
      const BATCH_SIZE = 50;
      for (let i = 0; i < autoCompanies.length; i += BATCH_SIZE) {
        const chunk = autoCompanies.slice(i, i + BATCH_SIZE);
        setImportProgress({ current: i + chunk.length, total: autoCompanies.length, label: 'Auto-creating companies...' });
        
        const { data, error } = await supabase
          .from('marketing_companies')
          .upsert(chunk, { onConflict: 'company_name', ignoreDuplicates: true })
          .select('id, company_name');
        
        if (!error && data) {
          data.forEach((d: any) => {
            companyIdMap[d.company_name] = d.id;
          });
        }
      }
    }

    // Fetch all companies to build a complete ID map
    const { data: allCompanies } = await supabase.from('marketing_companies').select('id, company_name');
    if (allCompanies) {
      allCompanies.forEach((c: any) => {
        companyIdMap[c.company_name] = c.id;
      });
    }

    // Import jobs
    const jobSheets = selectedSheets.filter(s => s.detectedType === 'jobs');
    for (const sheet of jobSheets) {
      const result: ImportResult = { sheetName: sheet.name, type: 'jobs', totalRows: sheet.rows.length, imported: 0, skipped: 0, errors: [] };
      setImportProgress({ current: 0, total: sheet.rows.length, label: `Importing jobs from "${sheet.name}"...` });

      const batch: any[] = [];
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        const mapped: Record<string, any> = {};
        Object.entries(sheet.columnMapping).forEach(([header, dbField]) => {
          const val = row[header];
          if (val === undefined || val === null || val === '') return;
          mapped[dbField] = String(val).trim();
        });

        if (!mapped.company_name && !mapped.job_title) {
          result.skipped++;
          continue;
        }

        // Link to company
        if (mapped.company_name && companyIdMap[mapped.company_name]) {
          mapped.company_id = companyIdMap[mapped.company_name];
        }

        // Set defaults
        if (!mapped.status) mapped.status = 'Open';
        if (!mapped.opportunity_type) mapped.opportunity_type = 'Business Development Opportunity';
        mapped.is_closed = false;

        batch.push(mapped);
      }

      // Insert in batches
      if (batch.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          const chunk = batch.slice(i, i + BATCH_SIZE);
          setImportProgress({ current: i + chunk.length, total: batch.length, label: `Importing jobs from "${sheet.name}"...` });
          
          const { error } = await supabase.from('marketing_jobs').insert(chunk);
          if (error) {
            // Try one by one
            for (const item of chunk) {
              const { error: singleErr } = await supabase.from('marketing_jobs').insert(item);
              if (singleErr) {
                result.errors.push(`${item.company_name} - ${item.job_title}: ${singleErr.message}`);
              } else {
                result.imported++;
              }
            }
          } else {
            result.imported += chunk.length;
          }
        }
      }

      result.skipped = result.totalRows - result.imported - result.errors.length;
      results.push(result);
    }

    // Import contacts
    const contactSheets = selectedSheets.filter(s => s.detectedType === 'contacts');
    for (const sheet of contactSheets) {
      const result: ImportResult = { sheetName: sheet.name, type: 'contacts', totalRows: sheet.rows.length, imported: 0, skipped: 0, errors: [] };
      setImportProgress({ current: 0, total: sheet.rows.length, label: `Importing contacts from "${sheet.name}"...` });

      const batch: any[] = [];
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        const mapped: Record<string, any> = {};
        Object.entries(sheet.columnMapping).forEach(([header, dbField]) => {
          const val = row[header];
          if (val === undefined || val === null || val === '') return;
          mapped[dbField] = String(val).trim();
        });

        if (!mapped.first_name && !mapped.last_name && !mapped.email) {
          result.skipped++;
          continue;
        }

        // Link to company
        if (mapped.company_name && companyIdMap[mapped.company_name]) {
          mapped.company_id = companyIdMap[mapped.company_name];
        }

        if (!mapped.source) mapped.source = 'Import';

        batch.push(mapped);
      }

      if (batch.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
          const chunk = batch.slice(i, i + BATCH_SIZE);
          setImportProgress({ current: i + chunk.length, total: batch.length, label: `Importing contacts from "${sheet.name}"...` });
          
          const { error } = await supabase.from('marketing_contacts').insert(chunk);
          if (error) {
            for (const item of chunk) {
              const { error: singleErr } = await supabase.from('marketing_contacts').insert(item);
              if (singleErr) {
                result.errors.push(`${item.first_name} ${item.last_name}: ${singleErr.message}`);
              } else {
                result.imported++;
              }
            }
          } else {
            result.imported += chunk.length;
          }
        }
      }

      result.skipped = result.totalRows - result.imported - result.errors.length;
      results.push(result);
    }

    // Update company open_roles_count
    setImportProgress({ current: 0, total: 1, label: 'Updating company role counts...' });
    if (allCompanies) {
      for (const company of allCompanies) {
        const { count } = await supabase
          .from('marketing_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('is_closed', false);
        
        if (count !== null) {
          await supabase
            .from('marketing_companies')
            .update({ open_roles_count: count })
            .eq('id', company.id);
        }
      }
    }

    setImportResults(results);
    setImporting(false);
    setStep('complete');
  };

  // Reset to start
  const reset = () => {
    setStep('upload');
    setFileName('');
    setSheets([]);
    setActiveSheetIdx(0);
    setImportResults([]);
    setImportProgress({ current: 0, total: 0, label: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const activeSheet = sheets[activeSheetIdx];
  const selectedCount = sheets.filter(s => s.selected).length;
  const totalSelectedRows = sheets.filter(s => s.selected).reduce((sum, s) => sum + s.rows.length, 0);

  const typeColors: Record<SheetType, string> = {
    jobs: 'bg-blue-100 text-blue-800 border-blue-200',
    contacts: 'bg-green-100 text-green-800 border-green-200',
    companies: 'bg-purple-100 text-purple-800 border-purple-200',
    unknown: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const typeLabels: Record<SheetType, string> = {
    jobs: 'Jobs',
    contacts: 'Contacts',
    companies: 'Companies',
    unknown: 'Unknown',
  };

  // Download template
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    const jobHeaders = ['Job Category', 'Company', 'Job Title', 'Website (Job Description)', 'Website - Other (Source URL)', 'City', 'State', 'Opportunity type'];
    const jobSample = [
      { 'Job Category': 'Value Based Care (VBC)', 'Company': 'Agilon Health', 'Job Title': 'Medical Director', 'Website (Job Description)': 'https://example.com/job/123', 'Website - Other (Source URL)': '', 'City': 'Austin', 'State': 'TX', 'Opportunity type': 'Business Development Opportunity' },
    ];
    const jobsWs = XLSX.utils.json_to_sheet(jobSample);
    jobsWs['!cols'] = jobHeaders.map(() => ({ wch: 25 }));
    XLSX.utils.book_append_sheet(wb, jobsWs, 'Jobs');


    const contactSample = [
      { 'First Name': 'John', 'Last Name': 'Smith', 'Email': 'john@example.com', 'Phone (Work)': '', 'Phone (Home)': '', 'Phone (Cell)': '', 'Title': 'VP of Operations', 'Company': 'Agilon Health', 'Source': 'Manual', 'LinkedIn URL': 'https://linkedin.com/in/johnsmith' },
    ];
    const contactsWs = XLSX.utils.json_to_sheet(contactSample);
    XLSX.utils.book_append_sheet(wb, contactsWs, 'Contacts');


    const companySample = [
      { 'Company': 'Agilon Health', 'Company Contact Count': 0 },
    ];
    const companyWs = XLSX.utils.json_to_sheet(companySample);
    XLSX.utils.book_append_sheet(wb, companyWs, 'Company Summary');

    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Marketing_Tracker_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#911406]/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-[#911406]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Import Data</h2>
              <p className="text-xs text-gray-500">
                {step === 'upload' && 'Upload an Excel (.xlsx) or CSV file to import'}
                {step === 'preview' && `${fileName} — Review and configure before importing`}
                {step === 'mapping' && 'Adjust column mappings'}
                {step === 'importing' && 'Importing data...'}
                {step === 'complete' && 'Import complete'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP: Upload */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  dragOver 
                    ? 'border-[#911406] bg-red-50/50 scale-[1.01]' 
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileUp className={`w-12 h-12 mx-auto mb-4 ${dragOver ? 'text-[#911406]' : 'text-gray-400'}`} />
                <p className="text-lg font-semibold text-gray-700 mb-1">
                  {dragOver ? 'Drop file here' : 'Drag & drop your file here'}
                </p>
                <p className="text-sm text-gray-500 mb-4">or click to browse</p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Supports .xlsx, .xls, and .csv files</span>
                </div>
              </div>

              {/* Template Download */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Need a template?</p>
                    <p className="text-xs text-blue-700">Download the Excel template with the correct column headers for Jobs, Contacts, and Companies.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-100 flex-shrink-0">
                  <Download className="w-4 h-4" /> Download Template
                </Button>
              </div>

              {/* Expected Format Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">Jobs</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    <li>Job Category, Company, Job Title</li>
                    <li>Website (Job Description)</li>
                    <li>City, State</li>
                    <li>Opportunity type</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">Contacts</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    <li>First Name, Last Name, Email</li>
                    <li>Phone (Work/Home/Cell)</li>
                    <li>Title, Company</li>
                    <li>Source</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">Companies</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    <li>Company Name</li>
                    <li>Company Type / Category</li>
                    <li>Careers URL, Website</li>
                    <li>Contact Count</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* STEP: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Sheet Tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                {sheets.map((sheet, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSheetIdx(idx)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      idx === activeSheetIdx
                        ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Table className="w-4 h-4" />
                    {sheet.name}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      idx === activeSheetIdx ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sheet.rows.length}
                    </span>
                  </button>
                ))}
              </div>

              {activeSheet && (
                <div className="space-y-4">
                  {/* Sheet Config */}
                  <div className="bg-gray-50 rounded-xl border p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeSheet.selected}
                            onChange={() => toggleSheet(activeSheetIdx)}
                            className="w-4 h-4 rounded border-gray-300 text-[#911406] focus:ring-[#911406]"
                          />
                          <span className="text-sm font-medium text-gray-700">Include in import</span>
                        </label>
                        <div className="h-4 w-px bg-gray-300" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Import as:</span>
                          <select
                            value={activeSheet.detectedType}
                            onChange={(e) => changeSheetType(activeSheetIdx, e.target.value as SheetType)}
                            className="text-sm border rounded-md px-2 py-1 bg-white"
                          >
                            <option value="jobs">Jobs</option>
                            <option value="contacts">Contacts</option>
                            <option value="companies">Companies</option>
                            <option value="unknown">Skip</option>
                          </select>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColors[activeSheet.detectedType]}`}>
                            {typeLabels[activeSheet.detectedType]}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {activeSheet.rows.length} rows, {activeSheet.headers.length} columns,{' '}
                          {Object.keys(activeSheet.columnMapping).length} mapped
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowMappingDetails(!showMappingDetails)}
                          className="gap-1.5 text-xs"
                        >
                          {showMappingDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          Column Mapping
                        </Button>
                      </div>
                    </div>

                    {/* Column Mapping Details */}
                    {showMappingDetails && (
                      <div className="mt-4 pt-4 border-t">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {activeSheet.headers.map(header => (
                            <div key={header} className="flex items-center gap-2 bg-white rounded-lg border p-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate" title={header}>{header}</p>
                              </div>
                              <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <select
                                value={activeSheet.columnMapping[header] || ''}
                                onChange={(e) => updateMapping(activeSheetIdx, header, e.target.value)}
                                className={`text-xs border rounded px-1.5 py-1 bg-white min-w-[120px] ${
                                  activeSheet.columnMapping[header] ? 'text-gray-900 border-green-300 bg-green-50' : 'text-gray-400'
                                }`}
                              >
                                {getDbFields(activeSheet.detectedType).map(f => (
                                  <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Data Preview Table */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                      <Eye className="w-4 h-4 text-gray-500" />
                      <span className="text-xs font-medium text-gray-600">
                        Preview — showing first {Math.min(activeSheet.rows.length, 10)} of {activeSheet.rows.length} rows
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 w-8">#</th>
                            {activeSheet.headers.map(h => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                                <div>{h}</div>
                                {activeSheet.columnMapping[h] && (
                                  <div className="text-[10px] text-green-600 font-normal mt-0.5">
                                    → {activeSheet.columnMapping[h]}
                                  </div>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeSheet.rows.slice(0, 10).map((row, rowIdx) => (
                            <tr key={rowIdx} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-400">{rowIdx + 1}</td>
                              {activeSheet.headers.map(h => (
                                <td key={h} className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={String(row[h] || '')}>
                                  {String(row[h] || '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Importing Data...</h3>
                <p className="text-sm text-gray-500">{importProgress.label}</p>
              </div>
              {importProgress.total > 0 && (
                <div className="w-full max-w-md">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{importProgress.current} of {importProgress.total}</span>
                    <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP: Complete */}
          {step === 'complete' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  const totalImported = importResults.reduce((s, r) => s + r.imported, 0);
                  const totalSkipped = importResults.reduce((s, r) => s + r.skipped, 0);
                  const totalErrors = importResults.reduce((s, r) => s + r.errors.length, 0);
                  const totalRows = importResults.reduce((s, r) => s + r.totalRows, 0);
                  return (
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                        <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-green-800">{totalImported}</div>
                        <div className="text-xs text-green-600">Imported</div>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                        <Table className="w-6 h-6 text-gray-500 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-gray-800">{totalRows}</div>
                        <div className="text-xs text-gray-500">Total Rows</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                        <div className="text-2xl font-bold text-amber-800">{totalSkipped}</div>
                        <div className="text-xs text-amber-600">Skipped</div>
                      </div>
                      <div className={`${totalErrors > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-xl p-4 text-center`}>
                        <XCircle className={`w-6 h-6 ${totalErrors > 0 ? 'text-red-500' : 'text-gray-400'} mx-auto mb-1`} />
                        <div className={`text-2xl font-bold ${totalErrors > 0 ? 'text-red-800' : 'text-gray-400'}`}>{totalErrors}</div>
                        <div className={`text-xs ${totalErrors > 0 ? 'text-red-600' : 'text-gray-400'}`}>Errors</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Per-Sheet Results */}
              <div className="space-y-3">
                {importResults.map((result, idx) => (
                  <div key={idx} className="border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColors[result.type]}`}>
                          {typeLabels[result.type]}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{result.sheetName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600 font-semibold">{result.imported} imported</span>
                        {result.skipped > 0 && <span className="text-amber-600">{result.skipped} skipped</span>}
                        {result.errors.length > 0 && <span className="text-red-600">{result.errors.length} errors</span>}
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 max-h-[120px] overflow-y-auto">
                        {result.errors.slice(0, 10).map((err, i) => (
                          <p key={i} className="text-xs text-red-700 mb-0.5">{err}</p>
                        ))}
                        {result.errors.length > 10 && (
                          <p className="text-xs text-red-500 mt-1">...and {result.errors.length - 10} more errors</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {step === 'preview' && (
              <span>{selectedCount} sheet{selectedCount !== 1 ? 's' : ''} selected ({totalSelectedRows} rows)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'upload' && (
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            )}
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={reset} className="gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Start Over
                </Button>
                <Button
                  onClick={runImport}
                  disabled={selectedCount === 0}
                  className="bg-[#911406] hover:bg-[#911406]/90 text-white gap-2 px-6"
                >
                  <Upload className="w-4 h-4" />
                  Import {totalSelectedRows} Rows
                </Button>
              </>
            )}
            {step === 'complete' && (
              <>
                <Button variant="outline" onClick={reset} className="gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Import Another
                </Button>
                <Button
                  onClick={() => { onComplete(); onClose(); }}
                  className="bg-[#911406] hover:bg-[#911406]/90 text-white gap-2 px-6"
                >
                  <CheckCircle className="w-4 h-4" /> Done
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportTool;
