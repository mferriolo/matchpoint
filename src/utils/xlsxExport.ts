import * as XLSX from 'xlsx';

interface Job {
  job_category?: string;
  company_name?: string;
  job_title?: string;
  website_job_desc?: string;
  job_url?: string;
  website_source?: string;
  indeed_url?: string;
  linkedin_url?: string;
  google_jobs_url?: string;
  city?: string;
  state?: string;
  opportunity_type?: string;
  is_closed?: boolean;
  status?: string;
  created_at?: string;
  date_posted?: string;
  source?: string;
  closed_reason?: string;
  is_net_new?: boolean;
}

interface Contact {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_work?: string;
  phone_home?: string;
  phone_cell?: string;
  title?: string;
  company_name?: string;
  source?: string;
  linkedin_url?: string;
  source_url?: string;
}


interface Company {
  company_name?: string;
  contact_count?: number;
  open_roles_count?: number;
  company_type?: string;
  is_high_priority?: boolean;
  has_md_cmo?: boolean;
  careers_url?: string;
  homepage_url?: string;
  website?: string;
  role_types_hired?: string;
}

function dateTag(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Robust file download that works across browsers.
 * Uses XLSX.writeFile first (handles download internally).
 * Falls back to manual Blob + anchor approach with delayed URL cleanup.
 */
function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  // Approach 1: Try XLSX.writeFile (handles download automatically)
  try {
    XLSX.writeFile(wb, filename, { bookType: 'xlsx' });
    console.log('[xlsxExport] Downloaded via XLSX.writeFile:', filename);
    return;
  } catch (e) {
    console.warn('[xlsxExport] XLSX.writeFile failed, trying manual blob approach:', e);
  }

  // Approach 2: Manual Blob + anchor download with type "array"
  try {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // IMPORTANT: Delay cleanup so the browser has time to start the download
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);

    console.log('[xlsxExport] Downloaded via manual blob approach:', filename);
    return;
  } catch (e2) {
    console.warn('[xlsxExport] Manual blob approach failed, trying buffer approach:', e2);
  }

  // Approach 3: Try with type "buffer" as last resort
  try {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    const blob = new Blob([wbout], {
      type: 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob);

    // Use window.open as absolute last resort
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
      // If popup blocked, try anchor approach
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2000);
    } else {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    console.log('[xlsxExport] Downloaded via buffer fallback:', filename);
  } catch (e3) {
    console.error('[xlsxExport] All download approaches failed:', e3);
    throw new Error('Failed to download file. Please try again or use a different browser.');
  }
}

export function exportMasterSheet(jobs: Job[], contacts: Contact[], companies: Company[]) {
  const wb = XLSX.utils.book_new();

  // Sort jobs: open first, then closed (closed marked red)
  const sortedJobs = [...jobs].sort((a, b) => {
    const aClosed = a.is_closed || a.status === 'Closed' ? 1 : 0;
    const bClosed = b.is_closed || b.status === 'Closed' ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;
    return (a.company_name || '').localeCompare(b.company_name || '');
  });

  // Jobs tab
  const jobRows = sortedJobs.map(j => ({
    'Job Category': j.job_category || '',
    'Company': j.company_name || '',
    'Job Title': j.job_title || '',
    'City': j.city || '',
    'State': j.state || '',
    'Status': j.is_closed || j.status === 'Closed' ? 'CLOSED' : 'Open',
    'Direct Job URL': j.job_url || '',
    'Indeed Search': j.indeed_url || '',
    'LinkedIn Search': j.linkedin_url || '',
    'Google Jobs Search': j.google_jobs_url || '',
    'Opportunity Type': j.opportunity_type || 'Business Development Opportunity',
    'Source': j.source || '',
    'Date Found': j.date_posted ? new Date(j.date_posted).toLocaleDateString() : '',
    'Closed Reason': j.closed_reason || '',
  }));

  const jobsWs = XLSX.utils.json_to_sheet(jobRows.length > 0 ? jobRows : [{
    'Job Category': '', 'Company': '', 'Job Title': '', 'City': '', 'State': '',
    'Status': '', 'Direct Job URL': '', 'Indeed Search': '', 'LinkedIn Search': '',
    'Google Jobs Search': '', 'Opportunity Type': '', 'Source': '', 'Date Found': '', 'Closed Reason': ''
  }]);

  // Apply red fill to closed job rows
  const closedIndices: number[] = [];
  sortedJobs.forEach((j, i) => {
    if (j.is_closed || j.status === 'Closed') closedIndices.push(i + 1);
  });

  // Set cell styles for closed rows (red background)
  const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'];
  for (const rowIdx of closedIndices) {
    for (const col of cols) {
      const cellRef = `${col}${rowIdx + 1}`;
      if (!jobsWs[cellRef]) jobsWs[cellRef] = { v: '', t: 's' };
      jobsWs[cellRef].s = {
        fill: { fgColor: { rgb: 'FFCCCC' } },
        font: { color: { rgb: '990000' } }
      };
    }
  }

  jobsWs['!cols'] = [
    { wch: 22 }, { wch: 30 }, { wch: 28 }, { wch: 15 }, { wch: 8 },
    { wch: 10 }, { wch: 55 }, { wch: 50 }, { wch: 50 }, { wch: 50 },
    { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 25 }
  ];

  XLSX.utils.book_append_sheet(wb, jobsWs, 'Jobs');

  // Contacts tab — matches uploaded sheet format exactly
  const contactRows = contacts.map(c => {
    // Derive LinkedIn URL: prefer linkedin_url field, then check source_url for LinkedIn links
    const linkedinUrl = c.linkedin_url || 
      (c.source_url && c.source_url.includes('linkedin.com/in/') ? c.source_url : '');
    return {
      'First Name': c.first_name || '',
      'Last Name': c.last_name || '',
      'Email': c.email || '',
      'Phone (Work)': c.phone_work || '',
      'Phone (Home)': c.phone_home || '',
      'Phone (Cell)': c.phone_cell || '',
      'Title': c.title || '',
      'Company': c.company_name || '',
      'Source': c.source || '',
      'LinkedIn URL': linkedinUrl,
    };
  });
  const contactsWs = XLSX.utils.json_to_sheet(contactRows.length > 0 ? contactRows : [{
    'First Name': '', 'Last Name': '', 'Email': '', 'Phone (Work)': '',
    'Phone (Home)': '', 'Phone (Cell)': '', 'Title': '', 'Company': '',
    'Source': '', 'LinkedIn URL': ''
  }]);
  contactsWs['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
    { wch: 20 }, { wch: 45 }
  ];
  XLSX.utils.book_append_sheet(wb, contactsWs, 'Contacts');


  // Company Summary tab
  const companyRows = companies
    .sort((a, b) => (b.open_roles_count || 0) - (a.open_roles_count || 0))
    .map(c => ({
      'Company': c.company_name || '',
      'Category': c.company_type || '',
      'Open Roles': c.open_roles_count || 0,
      'Contacts': c.contact_count || 0,
      'High Priority': c.is_high_priority ? 'Yes' : '',
      'Has MD/CMO': c.has_md_cmo ? 'Yes' : '',
      'Roles Hired': c.role_types_hired || '',
      'Careers Page': c.careers_url || '',
      'Website': c.homepage_url || c.website || '',
    }));
  const companyWs = XLSX.utils.json_to_sheet(companyRows.length > 0 ? companyRows : [{
    'Company': '', 'Category': '', 'Open Roles': '', 'Contacts': '',
    'High Priority': '', 'Has MD/CMO': '', 'Roles Hired': '', 'Careers Page': '', 'Website': ''
  }]);
  companyWs['!cols'] = [
    { wch: 35 }, { wch: 22 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(wb, companyWs, 'Company Summary');

  const dt = dateTag();
  const filename = `Master Marketing Sheet - ${dt}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}

/**
 * Recruiter export: dump the supplied contacts to a one-sheet xlsx with
 * the columns most useful when handing the list off (CSV-paste into a
 * dialer, ATS import, sequence import). Includes the new outreach
 * tracking fields and the priority score the caller computes per row.
 */
export function exportContactsToXlsx(
  contacts: Array<Contact & {
    middle_name?: string;
    suffix?: string;
    notes?: string;
    confidence_score?: number | null;
    last_outreach_at?: string | null;
    outreach_status?: string | null;
    created_at?: string | null;
    /** Computed: max open-job priority at this contact's company. */
    _priorityScore?: number | null;
  }>,
  filenamePrefix: string = 'Contacts'
) {
  const wb = XLSX.utils.book_new();

  const rows = contacts.map(c => {
    const linkedin = c.linkedin_url
      || (c.source_url && String(c.source_url).includes('linkedin.com/in/') ? c.source_url : '');
    const lastTouchDays = c.last_outreach_at
      ? Math.floor((Date.now() - new Date(c.last_outreach_at).getTime()) / 86_400_000)
      : null;
    return {
      'Priority Score': typeof c._priorityScore === 'number' ? Math.round(c._priorityScore) : '',
      'First Name': c.first_name || '',
      'Middle': c.middle_name || '',
      'Last Name': c.last_name || '',
      'Suffix': c.suffix || '',
      'Title': c.title || '',
      'Company': c.company_name || '',
      'Email': c.email || '',
      'Phone (Cell)': c.phone_cell || '',
      'Phone (Work)': c.phone_work || '',
      'Phone (Home)': c.phone_home || '',
      'LinkedIn': linkedin || '',
      'Source': c.source || '',
      'Confidence': typeof c.confidence_score === 'number' ? c.confidence_score : '',
      'Outreach Status': c.outreach_status || '',
      'Last Touch':
        c.last_outreach_at ? new Date(c.last_outreach_at).toLocaleDateString() : '',
      'Days Since Last Touch':
        lastTouchDays === null ? '' : lastTouchDays,
      'Date Added':
        c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
      'Notes': c.notes || '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{
    'Priority Score': '', 'First Name': '', 'Middle': '', 'Last Name': '', 'Suffix': '',
    'Title': '', 'Company': '', 'Email': '',
    'Phone (Cell)': '', 'Phone (Work)': '', 'Phone (Home)': '',
    'LinkedIn': '', 'Source': '', 'Confidence': '',
    'Outreach Status': '', 'Last Touch': '', 'Days Since Last Touch': '',
    'Date Added': '', 'Notes': '',
  }]);
  ws['!cols'] = [
    { wch: 8 },  // Priority
    { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 8 },   // names
    { wch: 28 }, { wch: 28 },                            // title, company
    { wch: 32 },                                         // email
    { wch: 16 }, { wch: 16 }, { wch: 16 },               // phones
    { wch: 40 },                                         // linkedin
    { wch: 18 }, { wch: 10 },                            // source, confidence
    { wch: 12 }, { wch: 12 }, { wch: 8 },                // outreach
    { wch: 12 },                                         // date added
    { wch: 50 },                                         // notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

  const filename = `${filenamePrefix} - ${dateTag()}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}

export function exportNewDataSheet(jobs: Job[]) {
  const wb = XLSX.utils.book_new();

  const jobRows = jobs.map(j => ({
    'Job Category': j.job_category || '',
    'Company': j.company_name || '',
    'Job Title': j.job_title || '',
    'City': j.city || '',
    'State': j.state || '',
    'Direct Job URL': j.job_url || '',
    'Indeed Search': j.indeed_url || '',
    'LinkedIn Search': j.linkedin_url || '',
    'Google Jobs Search': j.google_jobs_url || '',
    'Opportunity Type': j.opportunity_type || 'Business Development Opportunity',
    'Source': j.source || '',
    'Date Found': j.date_posted ? new Date(j.date_posted).toLocaleDateString() : '',
  }));

  const ws = XLSX.utils.json_to_sheet(jobRows.length > 0 ? jobRows : [{
    'Job Category': '', 'Company': '', 'Job Title': '',
    'City': '', 'State': '', 'Direct Job URL': '', 'Indeed Search': '', 'LinkedIn Search': '',
    'Google Jobs Search': '', 'Opportunity Type': '', 'Source': '', 'Date Found': ''
  }]);
  ws['!cols'] = [
    { wch: 22 }, { wch: 30 }, { wch: 28 }, { wch: 15 }, { wch: 8 },
    { wch: 55 }, { wch: 50 }, { wch: 50 }, { wch: 50 }, { wch: 30 }, { wch: 25 }, { wch: 12 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'New Jobs');

  const dt = dateTag();
  const filename = `New Marketing Data - ${dt}.xlsx`;
  downloadWorkbook(wb, filename);
  return filename;
}
