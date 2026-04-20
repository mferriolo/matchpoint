
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const wordMatch = (text: string, keyword: string) => new RegExp('\\b' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text);

    const details: string[] = [];

    // ---- STEP 1: Fetch all data upfront ----
    const { data: companies, error: compErr } = await supabase
      .from('marketing_companies')
      .select('id, company_name, company_type, industry, open_roles_count, is_high_priority');

    if (compErr) throw new Error(`Error fetching companies: ${compErr.message}`);

    const { data: jobs, error: jobErr } = await supabase
      .from('marketing_jobs')
      .select('id, job_title, job_type, opportunity_type, company_name, company_id, high_priority, is_closed, status, job_category');

    if (jobErr) throw new Error(`Error fetching jobs: ${jobErr.message}`);

    details.push(`Loaded ${(companies || []).length} companies and ${(jobs || []).length} jobs`);

    // ---- STEP 2: Determine which companies have VBC jobs ----
    const companyIdsWithVBCJobs = new Set<string>();
    for (const job of (jobs || [])) {
      if (job.company_id && job.job_category) {
        if (wordMatch(job.job_category, 'VALUE BASED CARE') || wordMatch(job.job_category, 'VBC')) {
          companyIdsWithVBCJobs.add(job.company_id);
        }
      }
    }

    // ---- STEP 2b: Determine which companies have MD/CMO openings ----
    const companyIdsWithMDCMO = new Set<string>();
    for (const job of (jobs || [])) {
      if (job.company_id && !job.is_closed && job.status !== 'Closed') {
        const titleStr = job.job_title || '';
        const typeStr = job.job_type || '';
        const combinedStr = `${titleStr} ${typeStr}`;
        if (wordMatch(combinedStr, 'MEDICAL DIRECTOR') ||
            wordMatch(combinedStr, 'CHIEF MEDICAL') ||
            wordMatch(combinedStr, 'CMO')) {
          companyIdsWithMDCMO.add(job.company_id);
        }
      }
    }

    // ---- STEP 3: Compute company priority in memory ----
    const highPriorityCompanyIds = new Set<string>();
    const companyIdsToMark: string[] = [];

    for (const company of (companies || [])) {
      const industryStr = company.industry || '';
      const isVBCByIndustry = wordMatch(industryStr, 'VALUE BASED CARE') || wordMatch(industryStr, 'VBC');
      const compTypeStr = company.company_type || '';
      const isVBCByType = wordMatch(compTypeStr, 'VALUE BASED CARE') || wordMatch(compTypeStr, 'VBC');
      const isVBCByJobs = companyIdsWithVBCJobs.has(company.id);
      const isVBC = isVBCByIndustry || isVBCByType || isVBCByJobs;
      const hasMany = (company.open_roles_count || 0) >= 10;
      const hasMDCMO = companyIdsWithMDCMO.has(company.id);
      const shouldBeHighPriority = isVBC || hasMany || hasMDCMO;

      if (shouldBeHighPriority) {
        highPriorityCompanyIds.add(company.id);
        if (!company.is_high_priority) {
          companyIdsToMark.push(company.id);
          const reasons = [];
          if (isVBC) reasons.push('Value Based Care');
          if (hasMany) reasons.push(`${company.open_roles_count} openings`);
          if (hasMDCMO) reasons.push('Has MD/CMO openings');
          details.push(`Company "${company.company_name}" -> HIGH PRIORITY (${reasons.join(', ')})`);
        }
      }

      // Preserve manually-marked companies
      if (company.is_high_priority) {
        highPriorityCompanyIds.add(company.id);
      }
    }

    // BATCH UPDATE companies (chunks of 100)
    let companiesMarked = 0;
    if (companyIdsToMark.length > 0) {
      for (let i = 0; i < companyIdsToMark.length; i += 100) {
        const chunk = companyIdsToMark.slice(i, i + 100);
        const { error } = await supabase
          .from('marketing_companies')
          .update({ is_high_priority: true, updated_at: new Date().toISOString() })
          .in('id', chunk);
        if (!error) {
          companiesMarked += chunk.length;
        } else {
          details.push(`ERROR batch updating companies: ${error.message}`);
        }
      }
    }

    details.push(`--- ${highPriorityCompanyIds.size} total high-priority companies (${companiesMarked} newly marked) ---`);

    // ---- STEP 4: Compute job priority in memory ----
    const jobIdsToMark: string[] = [];

    for (const job of (jobs || [])) {
      const combined = `${job.job_title || ''} ${job.job_type || ''} ${job.opportunity_type || ''}`;

      const isMedicalDirector = wordMatch(combined, 'MEDICAL DIRECTOR');
      const isCMO = wordMatch(combined, 'CMO') ||
                     wordMatch(combined, 'CHIEF MEDICAL OFFICER') ||
                     wordMatch(combined, 'CHIEF MEDICAL');
      const isFromHighPriorityCompany = job.company_id && highPriorityCompanyIds.has(job.company_id);
      
      const shouldBeHighPriority = isMedicalDirector || isCMO || isFromHighPriorityCompany;

      if (shouldBeHighPriority && !job.high_priority) {
        jobIdsToMark.push(job.id);
      }
    }

    // BATCH UPDATE jobs (chunks of 100)
    let jobsMarked = 0;
    if (jobIdsToMark.length > 0) {
      for (let i = 0; i < jobIdsToMark.length; i += 100) {
        const chunk = jobIdsToMark.slice(i, i + 100);
        const { error } = await supabase
          .from('marketing_jobs')
          .update({ high_priority: true, updated_at: new Date().toISOString() })
          .in('id', chunk);
        if (!error) {
          jobsMarked += chunk.length;
        } else {
          details.push(`ERROR batch updating jobs: ${error.message}`);
        }
      }
    }

    details.push(`--- ${jobsMarked} jobs newly marked as high priority ---`);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        companiesMarkedHighPriority: companiesMarked,
        jobsMarkedHighPriority: jobsMarked,
        totalCompanies: (companies || []).length,
        totalJobs: (jobs || []).length,
        highPriorityCompanyCount: highPriorityCompanyIds.size,
      },
      details,
    }), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });
  }
});