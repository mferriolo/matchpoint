import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CATS = ["Value Based Care (VBC)","PACE Medical Groups","Health Plans","Health Systems","Hospitals","FQHC","All Others"];
const ROLES = ["Medical Director","Chief Medical Officer","Primary Care Physician","Nurse Practitioner","Physician Assistant"];
const JOB_BOARDS = ["Indeed","LinkedIn Jobs","ZipRecruiter","Google Jobs","Glassdoor","DocCafe","Health eCareers","PracticeLink","Monster","CareerBuilder","SimplyHired"];
const PRIORITY_ORGS = ["Agilon Health","Oak Street Health","ChenMed","Iora Health","Aledade","Cityblock Health","Cano Health","Privia Health","Signify Health","Curana Health","VillageMD","Hopscotch Health","Cohere Health","CINQCARE","CenterWell","HarmonyCares","CareMax","P3 Health Partners","Wellvana","Bloom Healthcare","Pair Team","Firefly Health","Vera Whole Health","Everside Health","Marathon Health","Alignment Healthcare","Devoted Health","Clover Health","Bright Health","Carelon","Optum","UnitedHealth Group","InnovAge","Trinity Health PACE","myPlace Health","Element Care","Humana","CVS Health","Aetna","Elevance Health","Cigna","Molina Healthcare","Centene","SCAN Health Plan","Oscar Health","Point32Health","CommonSpirit Health","HCA Healthcare","Ascension","Providence","Trinity Health","Intermountain Health","Kaiser Permanente","Advocate Aurora Health","Atrium Health","Geisinger","Tenet Healthcare","Landmark Health","DispatchHealth","BrightSpring Health","Enhabit Home Health","Compassus","Main Street Health","Strive Health","Crossover Health","Pearl Health","Rush University System for Health","Evolent Health","Lumeris"];

const STEP_WEIGHTS: Record<string, number> = { loading: 3, validating_urls: 15, searching_sources: 30, verifying_new_jobs: 22, deduplicating: 8, enriching_contacts: 10, updating_summaries: 6, generating_alerts: 3, completed: 3 };
const STEP_ORDER = ['loading','validating_urls','searching_sources','verifying_new_jobs','deduplicating','enriching_contacts','updating_summaries','generating_alerts','completed'];

function catCo(n: string): string {
  const l = n.toLowerCase();
  if (l.includes("pace")) return "PACE Medical Groups";
  if (["vbc","value based","agilon","oak street","chenmed","iora","aledade","cityblock","cano","privia","signify","curana","villagemd","hopscotch","cohere","cinqcare","centerwel","harmonycares","caremax","p3 health","wellvana","bloom","pair team","firefly","vera whole","everside","marathon","landmark","devoted","clover","bright health","alignment","carelon"].some(k=>l.includes(k))) return "Value Based Care (VBC)";
  if (["health plan","payer","insurance","humana","aetna","cigna","molina","centene","elevance","oscar","scan health","optum","unitedhealth","anthem","wellcare","point32","blue cross","emblemhealth","health net","caresource"].some(k=>l.includes(k))) return "Health Plans";
  if (["health system","commonspirit","ascension","providence","trinity","intermountain","kaiser","advocate aurora","atrium","geisinger","sanford","bon secours"].some(k=>l.includes(k))) return "Health Systems";
  if (["hospital","hca ","tenet","lifepoint","community health systems"].some(k=>l.includes(k))) return "Hospitals";
  if (["fqhc","federally qualified","community health center"].some(k=>l.includes(k))) return "FQHC";
  return "All Others";
}

function normalizeRole(t: string): string {
  const l = t.toLowerCase().trim();
  if (l.includes('chief medical') || l === 'cmo' || l.includes('vp medical affairs') || l.includes('chief clinical officer')) return 'Chief Medical Officer';
  if (l.includes('medical director')) return 'Medical Director';
  if (l.includes('nurse practitioner') || l === 'np' || l.includes('aprn') || l.includes('fnp') || l.includes('agnp') || l.includes('family nurse')) return 'Nurse Practitioner';
  if (l.includes('physician assistant') || l === 'pa' || l.includes('pa-c') || l.includes('physician associate')) return 'Physician Assistant';
  if (l.includes('primary care') || l === 'pcp' || l.includes('family medicine') || l.includes('internal medicine') || l.includes('geriatrician')) return 'Primary Care Physician';
  return t;
}

function buildIndeedUrl(title: string, co: string, city?: string, state?: string): string {
  const q = encodeURIComponent(`"${title}" "${co}"`); const loc = city && state ? `&l=${encodeURIComponent(`${city}, ${state}`)}` : '';
  return `https://www.indeed.com/jobs?q=${q}${loc}`;
}
function buildLinkedInUrl(title: string, co: string): string { return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${title} ${co}`)}`; }
function buildGoogleJobsUrl(title: string, co: string, city?: string, state?: string): string {
  const loc = city && state ? ` ${city} ${state}` : '';
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} ${co}${loc}`)}&ibp=htl;jobs`;
}

function isDirectJobUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  const l = url.toLowerCase();
  if (l.includes('/search?') || l.includes('/jobs?q=') || l.includes('&ibp=htl;jobs') || l.includes('/search/?keywords=')) return false;
  if (l.match(/^https?:\/\/[^\/]+\/?$/)) return false;
  if (l.includes('/job/') || l.includes('/jobs/') || l.includes('/career') || l.includes('/position') || l.includes('/opening') || l.includes('/viewjob') || l.includes('/jid/') || l.includes('/posting') || l.includes('indeed.com/viewjob') || l.includes('linkedin.com/jobs/view') || l.includes('glassdoor.com/job-listing') || l.includes('ziprecruiter.com/c/') || l.includes('/apply') || l.includes('jobid=') || l.includes('job_id=')) return true;
  try { const u = new URL(url); return u.pathname.length > 5; } catch { return false; }
}

// Calls OpenAI directly (no fastrouter.io middleman, no Gemini). Uses
// gpt-4o-mini to match the rest of the codebase (chatgpt-integration's
// default). The function signature is unchanged so all call sites still
// work; the `key` parameter is now an OpenAI API key.
async function aiCall(key: string, prompt: string, maxTok = 8000): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15,
      max_tokens: maxTok,
    }),
  });
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

function parseJson(text: string): any { try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {} return {}; }
function parseArr(text: string): any[] { try { const m = text.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); } catch {} return []; }
function dateTag(): string { const d = new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`; }

// ============================================================
// PROGRESS TRACKING
// ============================================================
interface StepProgress { status: 'pending'|'running'|'completed'|'skipped'; started_at?: string; completed_at?: string; duration_ms?: number; items_processed?: number; items_total?: number; sub_step?: string; }
interface ProgressState { percent: number; current_step: string; current_sub_step: string; steps: Record<string, StepProgress>; run_started_at: string; }

function createProgressTracker(rid: string, logs: any[]) {
  const state: ProgressState = { percent: 0, current_step: 'loading', current_sub_step: 'Initializing...', steps: {}, run_started_at: new Date().toISOString() };
  for (const step of STEP_ORDER) state.steps[step] = { status: 'pending' };

  function calcPercent(): number {
    let pct = 0;
    for (const step of STEP_ORDER) {
      const s = state.steps[step]; const weight = STEP_WEIGHTS[step] || 0;
      if (s.status === 'completed' || s.status === 'skipped') pct += weight;
      else if (s.status === 'running' && s.items_total && s.items_total > 0) pct += weight * Math.min((s.items_processed || 0) / s.items_total, 0.95);
      else if (s.status === 'running') pct += weight * 0.3;
    }
    return Math.min(Math.round(pct), 100);
  }

  async function flush() {
    state.percent = calcPercent();
    try { await supabase.from('tracker_runs').update({ current_step: state.current_step, progress: state, execution_log: logs }).eq('id', rid); } catch (e) { console.error('Progress flush error:', e); }
  }

  return {
    async startStep(step: string, subStep: string) { state.current_step = step; state.current_sub_step = subStep; state.steps[step] = { status: 'running', started_at: new Date().toISOString(), items_processed: 0, items_total: 0, sub_step: subStep }; await flush(); },
    async updateStep(step: string, updates: { sub_step?: string; items_processed?: number; items_total?: number }) { const s = state.steps[step]; if (!s) return; if (updates.sub_step !== undefined) { s.sub_step = updates.sub_step; state.current_sub_step = updates.sub_step; } if (updates.items_processed !== undefined) s.items_processed = updates.items_processed; if (updates.items_total !== undefined) s.items_total = updates.items_total; await flush(); },
    async completeStep(step: string, subStep?: string) { const s = state.steps[step]; if (!s) return; const now = new Date().toISOString(); s.status = 'completed'; s.completed_at = now; if (s.started_at) s.duration_ms = new Date(now).getTime() - new Date(s.started_at).getTime(); if (s.items_total && s.items_total > 0) s.items_processed = s.items_total; if (subStep) { s.sub_step = subStep; state.current_sub_step = subStep; } await flush(); },
    async skipStep(step: string) { state.steps[step] = { status: 'skipped' }; await flush(); },
    getState() { return state; },
  };
}

// ============================================================
// SERPAPI BATCH VERIFICATION (STRICT: only verified jobs pass)
// ============================================================
interface SerpJobResult { title: string; company_name: string; location: string; via: string; apply_urls: string[]; extensions: string[]; }
interface CompanySearchResult { company: string; searchSuccess: boolean; jobsFound: SerpJobResult[]; error?: string; }

async function searchSerpApiForCompany(company: string, roleHints: string[]): Promise<CompanySearchResult> {
  const serpKey = Deno.env.get("SERP_API_KEY");
  if (!serpKey) return { company, searchSuccess: false, jobsFound: [], error: 'no key' };
  try {
    const roleStr = roleHints.slice(0, 3).join(' OR ');
    const q = `"${company}" ${roleStr}`;
    const params = new URLSearchParams({ engine: 'google_jobs', q, api_key: serpKey, hl: 'en', gl: 'us' });
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timeout);
    if (!resp.ok) { const errText = await resp.text().catch(() => ''); return { company, searchSuccess: false, jobsFound: [], error: `HTTP ${resp.status}: ${errText.substring(0, 100)}` }; }
    const data = await resp.json();
    const jobs: SerpJobResult[] = (data.jobs_results || []).map((j: any) => ({
      title: j.title || '', company_name: j.company_name || '', location: j.location || '', via: j.via || '',
      extensions: j.extensions || [], apply_urls: (j.apply_options || []).map((ao: any) => ao.link).filter((u: string) => u?.startsWith('http')),
    }));
    return { company, searchSuccess: true, jobsFound: jobs };
  } catch (e: any) { return { company, searchSuccess: false, jobsFound: [], error: e.message }; }
}

function fuzzyCompanyMatch(serpCompany: string, targetCompany: string): boolean {
  const s = serpCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const t = targetCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (s === t || s.includes(t) || t.includes(s)) return true;
  const sWords = s.split(/\s+/).filter(w => w.length > 2);
  const tWords = t.split(/\s+/).filter(w => w.length > 2);
  const matchCount = tWords.filter(tw => sWords.some(sw => sw.includes(tw) || tw.includes(sw))).length;
  return matchCount >= Math.max(1, Math.ceil(tWords.length * 0.5));
}

function fuzzyTitleMatch(serpTitle: string, targetTitle: string): boolean {
  const s = serpTitle.toLowerCase(); const t = targetTitle.toLowerCase();
  if (s.includes(t) || t.includes(s)) return true;
  const keywords = t.split(/\s+/).filter(w => w.length > 2 && !['the','and','for','with','senior','associate','regional','market'].includes(w));
  const matchCount = keywords.filter(kw => s.includes(kw)).length;
  return matchCount >= Math.max(1, Math.ceil(keywords.length * 0.5));
}

function matchJobInSerpResults(serpResults: CompanySearchResult, jobTitle: string): { verified: boolean; bestUrl: string; reason: string; matchingJobs: number } {
  if (!serpResults.searchSuccess) return { verified: false, bestUrl: '', reason: 'Search unavailable', matchingJobs: 0 };
  const companyJobs = serpResults.jobsFound.filter(sj => fuzzyCompanyMatch(sj.company_name, serpResults.company));
  if (companyJobs.length === 0) return { verified: false, bestUrl: '', reason: `No jobs from "${serpResults.company}" found in Google Jobs`, matchingJobs: 0 };
  const titleMatches = companyJobs.filter(sj => fuzzyTitleMatch(sj.title, jobTitle));
  if (titleMatches.length > 0) {
    const best = titleMatches[0]; const bestUrl = best.apply_urls[0] || '';
    return { verified: true, bestUrl, reason: `Verified: "${best.title}" at ${best.company_name} found in Google Jobs (via ${best.via})`, matchingJobs: titleMatches.length };
  }
  return { verified: false, bestUrl: '', reason: `Company has ${companyJobs.length} jobs in Google Jobs but no title match for "${jobTitle}"`, matchingJobs: 0 };
}

async function batchVerifyWithSerpApi(candidateJobs: any[], logFn: (step: string, msg: string) => void, progress?: ReturnType<typeof createProgressTracker>): Promise<{ verified: any[]; rejected: any[]; stats: { serpSearches: number; serpMatches: number; serpErrors: number } }> {
  const serpKey = Deno.env.get("SERP_API_KEY");
  const verified: any[] = [], rejected: any[] = [];
  const stats = { serpSearches: 0, serpMatches: 0, serpErrors: 0 };

  if (!serpKey) {
    logFn('verifying_new_jobs', 'SerpAPI key not configured - cannot verify jobs. ALL candidate jobs will be REJECTED.');
    for (const j of candidateJobs) {
      rejected.push({ ...j, _verifyReason: 'Rejected: SerpAPI key not configured, cannot verify job is active', _verifiedUrl: '' });
    }
    return { verified: [], rejected, stats };
  }

  const companyGroups = new Map<string, any[]>();
  for (const j of candidateJobs) { const key = (j.company || '').toLowerCase().trim(); if (!companyGroups.has(key)) companyGroups.set(key, []); companyGroups.get(key)!.push(j); }
  const uniqueCompanies = Array.from(companyGroups.keys());
  logFn('verifying_new_jobs', `Grouped ${candidateJobs.length} jobs into ${uniqueCompanies.length} unique companies for SerpAPI verification (strict mode: only verified jobs will be added)`);
  if (progress) await progress.updateStep('verifying_new_jobs', { items_total: uniqueCompanies.length, items_processed: 0, sub_step: `Searching ${uniqueCompanies.length} companies via SerpAPI Google Jobs...` });

  let companiesProcessed = 0, totalVerified = 0, totalRejected = 0;

  for (const companyKey of uniqueCompanies) {
    const jobs = companyGroups.get(companyKey)!;
    const companyName = jobs[0].company;
    const roleHints = [...new Set(jobs.map((j: any) => j._normalizedTitle))];
    const serpResult = await searchSerpApiForCompany(companyName, roleHints);
    stats.serpSearches++;

    if (!serpResult.searchSuccess) {
      stats.serpErrors++;
      for (const j of jobs) {
        rejected.push({ ...j, _verifyReason: `Rejected: SerpAPI search failed (${serpResult.error})`, _verifiedUrl: '' });
        logFn('verifying_new_jobs', `REJECTED: "${j._normalizedTitle}" at "${companyName}" - search failed: ${serpResult.error}`);
      }
      totalRejected += jobs.length;
    } else {
      for (const j of jobs) {
        const match = matchJobInSerpResults(serpResult, j._normalizedTitle);
        if (match.verified) {
          stats.serpMatches++; totalVerified++;
          verified.push({ ...j, _verifiedUrl: match.bestUrl, _verifyReason: match.reason });
          logFn('verifying_new_jobs', `VERIFIED: "${j._normalizedTitle}" at "${companyName}" - ${match.reason}`);
        } else {
          totalRejected++;
          rejected.push({ ...j, _verifyReason: `Rejected: ${match.reason}`, _verifiedUrl: '' });
          logFn('verifying_new_jobs', `REJECTED: "${j._normalizedTitle}" at "${companyName}" - ${match.reason}`);
        }
      }
    }
    companiesProcessed++;
    if (companiesProcessed % 5 === 0 || companiesProcessed === uniqueCompanies.length) {
      if (progress) await progress.updateStep('verifying_new_jobs', { items_processed: companiesProcessed, sub_step: `Searched ${companiesProcessed}/${uniqueCompanies.length} companies (${totalVerified} verified, ${totalRejected} rejected)` });
    }
    if (companiesProcessed < uniqueCompanies.length) await new Promise(r => setTimeout(r, 200));
  }

  logFn('verifying_new_jobs', `Batch verification complete: ${totalVerified} VERIFIED, ${totalRejected} REJECTED. ${stats.serpSearches} SerpAPI searches (${stats.serpErrors} errors)`);
  return { verified, rejected, stats };
}

// ============================================================
// AUTO-PRIORITIZE
// ============================================================
async function autoPrioritize(logFn: (step: string, msg: string) => void, progress?: ReturnType<typeof createProgressTracker>) {
  logFn('auto_priority', 'Running auto-prioritize (batch mode)');
  if (progress) await progress.updateStep('generating_alerts', { sub_step: 'Loading companies and jobs for priority analysis...' });
  try {
    const { data: companies, error: compErr } = await supabase.from('marketing_companies').select('id, company_name, company_type, industry, open_roles_count, is_high_priority, has_md_cmo');
    const { data: jobs, error: jobErr } = await supabase.from('marketing_jobs').select('id, job_title, job_type, opportunity_type, company_name, company_id, high_priority, is_closed, status, job_category');
    if (compErr || jobErr || !companies || !jobs) { logFn('auto_priority', `ERROR: ${compErr?.message || jobErr?.message}`); return { companiesMarked: 0, jobsMarked: 0, totalHighPriorityCompanies: 0 }; }
    if (progress) await progress.updateStep('generating_alerts', { sub_step: `Analyzing ${companies.length} companies and ${jobs.length} jobs...`, items_total: companies.length + jobs.length, items_processed: 0 });

    const companyIdsWithVBCJobs = new Set<string>(), companyIdsWithMDCMO = new Set<string>();
    for (const job of jobs) {
      if (job.company_id && job.job_category) { const cat = job.job_category.toUpperCase(); if (cat.includes('VALUE BASED CARE') || cat.includes('VBC')) companyIdsWithVBCJobs.add(job.company_id); }
      if (job.company_id && !job.is_closed && job.status !== 'Closed') { const tu = (job.title || '').toUpperCase(), tyu = (job.job_type || '').toUpperCase(); if (tu.includes('MEDICAL DIRECTOR') || tyu.includes('MEDICAL DIRECTOR') || tu.includes('CHIEF MEDICAL') || tyu.includes('CHIEF MEDICAL') || tu.includes('CMO') || tyu.includes('CMO')) companyIdsWithMDCMO.add(job.company_id); }
    }

    const highPriorityCompanyIds = new Set<string>(), companyIdsToMark: string[] = [];
    for (const c of companies) {
      const isVBC = (c.industry || '').toUpperCase().includes('VBC') || (c.industry || '').toUpperCase().includes('VALUE BASED CARE') || (c.company_type || '').toUpperCase().includes('VBC') || (c.company_type || '').toUpperCase().includes('VALUE BASED CARE') || companyIdsWithVBCJobs.has(c.id);
      const shouldBe = isVBC || (c.open_roles_count || 0) >= 10 || companyIdsWithMDCMO.has(c.id);
      if (shouldBe) { highPriorityCompanyIds.add(c.id); if (!c.is_high_priority) companyIdsToMark.push(c.id); }
      if (c.is_high_priority) highPriorityCompanyIds.add(c.id);
    }
    let companiesMarked = 0;
    for (let i = 0; i < companyIdsToMark.length; i += 100) { const chunk = companyIdsToMark.slice(i, i + 100); const { error } = await supabase.from('marketing_companies').update({ is_high_priority: true, updated_at: new Date().toISOString() }).in('id', chunk); if (!error) companiesMarked += chunk.length; }

    const jobIdsToMark: string[] = [];
    for (const job of jobs) {
      const combined = `${(job.job_title||'').toUpperCase()} ${(job.job_type||'').toUpperCase()} ${(job.opportunity_type||'').toUpperCase()}`;
      const shouldBe = combined.includes('MEDICAL DIRECTOR') || combined.includes('CMO') || combined.includes('CHIEF MEDICAL OFFICER') || combined.includes('CHIEF MEDICAL') || (job.company_id && highPriorityCompanyIds.has(job.company_id));
      if (shouldBe && !job.high_priority) jobIdsToMark.push(job.id);
    }
    let jobsMarked = 0;
    for (let i = 0; i < jobIdsToMark.length; i += 100) { const chunk = jobIdsToMark.slice(i, i + 100); const { error } = await supabase.from('marketing_jobs').update({ high_priority: true, updated_at: new Date().toISOString() }).in('id', chunk); if (!error) jobsMarked += chunk.length; }
    logFn('auto_priority', `Complete: ${companiesMarked} companies, ${jobsMarked} jobs newly starred`);
    return { companiesMarked, jobsMarked, totalHighPriorityCompanies: highPriorityCompanyIds.size };
  } catch (err) { logFn('auto_priority', `ERROR: ${(err as Error).message}`); return { companiesMarked: 0, jobsMarked: 0, totalHighPriorityCompanies: 0 }; }
}

// ============================================================
// BATCH UPDATE SUMMARIES
// ============================================================
async function updateSummariesBatch(logFn: (step: string, msg: string) => void, progress?: ReturnType<typeof createProgressTracker>) {
  logFn('updating_summaries', 'Updating company counts');
  if (progress) await progress.updateStep('updating_summaries', { sub_step: 'Fetching all companies...' });
  try {
    const { data: allCos } = await supabase.from('marketing_companies').select('id');
    if (!allCos || allCos.length === 0) { logFn('updating_summaries', 'No companies to update'); return; }
    if (progress) await progress.updateStep('updating_summaries', { sub_step: 'Counting open jobs per company...', items_total: allCos.length, items_processed: 0 });
    const { data: openJobs } = await supabase.from('marketing_jobs').select('company_id, job_title').eq('status', 'Open').not('is_closed', 'eq', true);
    const { data: allContacts } = await supabase.from('marketing_contacts').select('company_id');
    const jobCountMap = new Map<string, number>(), mdCmoMap = new Map<string, boolean>(), contactCountMap = new Map<string, number>();
    for (const j of (openJobs || [])) { if (!j.company_id) continue; jobCountMap.set(j.company_id, (jobCountMap.get(j.company_id) || 0) + 1); const title = (j.job_title || '').toLowerCase(); if (title.includes('medical director') || title.includes('chief medical')) mdCmoMap.set(j.company_id, true); }
    for (const c of (allContacts || [])) { if (!c.company_id) continue; contactCountMap.set(c.company_id, (contactCountMap.get(c.company_id) || 0) + 1); }
    const now = new Date().toISOString(); let updated = 0;
    for (let i = 0; i < allCos.length; i += 20) {
      const chunk = allCos.slice(i, i + 20);
      await Promise.all(chunk.map(c => supabase.from('marketing_companies').update({ open_roles_count: jobCountMap.get(c.id) || 0, contact_count: contactCountMap.get(c.id) || 0, has_md_cmo: mdCmoMap.get(c.id) || false, updated_at: now }).eq('id', c.id)));
      updated += chunk.length;
      if (progress) await progress.updateStep('updating_summaries', { items_processed: updated, sub_step: `Updated ${updated}/${allCos.length} companies...` });
    }
    logFn('updating_summaries', `Updated ${updated} companies`);
  } catch (err) { logFn('updating_summaries', `ERROR: ${(err as Error).message}`); }
}

async function cleanupStaleRuns() {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stale } = await supabase.from('tracker_runs').select('id').eq('status', 'running').lt('started_at', cutoff);
    if (stale && stale.length > 0) { const ids = stale.map(r => r.id); await supabase.from('tracker_runs').update({ status: 'failed', completed_at: new Date().toISOString(), current_step: 'error', error_message: 'Auto-cleaned: exceeded 15min timeout' }).in('id', ids); }
  } catch (e) { console.warn('Stale run cleanup error:', e); }
}

// ============================================================
// MAIN PROCESSING
// ============================================================
// Strips parenthetical bits like "(NP/PA)" or "(RNs)" from a job-type
// label so it can be substring-matched against AI-returned titles.
function _cleanRoleLabel(s: string): string {
  return s.toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

async function runTrackerProcess(rid: string, action: string, oa: string, jobTitles: string[] = []) {
  // Effective roles list: if the caller (TrackerControls picklist) passed
  // a non-empty jobTitles array, use it; otherwise fall back to the
  // hardcoded clinical ROLES (the historical default).
  const effectiveRoles: string[] = (jobTitles && jobTitles.length > 0) ? jobTitles : ROLES;
  // In default mode the strict normalizeRole + ROLES.includes filter is
  // used (preserves legacy behavior). In custom mode we keep the AI's
  // raw title and accept any job whose title contains a selected type
  // as a substring (case-insensitive, parenthetical bits stripped).
  const useDefaultMode = effectiveRoles === ROLES;
  const logs: any[] = [];
  const log = (s: string, m: string) => { logs.push({ step: s, msg: m, ts: new Date().toISOString() }); };
  const upd = async (u: any) => { await supabase.from('tracker_runs').update({ ...u, execution_log: logs }).eq('id', rid); };
  const progress = createProgressTracker(rid, logs);

  let closed = 0, stillOpen = 0, validated = 0, added = 0, coAdded = 0, dupes = 0, ctAdded = 0, searchPasses = 0;
  let jobsVerified = 0, jobsRejected = 0, serpSearchCount = 0;
  const roleB: Record<string, number> = {};

  const serpKey = Deno.env.get("SERP_API_KEY");
  const verificationMode = serpKey ? 'serp_api' : 'none';
  log('init', `Verification mode: ${verificationMode}${serpKey ? ' (SerpAPI configured - strict mode: only verified jobs will be added)' : ' (NO SerpAPI key - all AI-found jobs will be REJECTED)'}`);

  try {
    // STEP 1: LOAD
    await progress.startStep('loading', 'Loading existing master dataset...');
    log('loading', 'Loading existing master dataset');
    const { data: mJ } = await supabase.from('marketing_jobs').select('*');
    const { data: mC } = await supabase.from('marketing_companies').select('*');
    const { data: mT } = await supabase.from('marketing_contacts').select('*');
    const allJ = mJ || [], allC = mC || [], allT = mT || [];
    if (allJ.length > 0) await supabase.from('marketing_jobs').update({ is_net_new: false }).eq('is_net_new', true);
    log('loading', `Loaded ${allJ.length} jobs, ${allC.length} companies, ${allT.length} contacts`);
    await progress.completeStep('loading', `Loaded ${allJ.length} jobs, ${allC.length} companies, ${allT.length} contacts`);

    const jKeys = new Set(allJ.map(j => `${(j.company_name||'').toLowerCase().trim()}|${(j.job_title||'').toLowerCase().trim()}|${(j.city||'').toLowerCase().trim()}|${(j.state||'').toLowerCase().trim()}`));
    const coMap = new Map(allC.map(c => [(c.company_name||'').toLowerCase().trim(), c]));
    const ctKeys = new Set(allT.map(c => `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${(c.company_name||'').toLowerCase().trim()}`));
    const recSrc = allC.filter(c => c.is_recurring_source || c.careers_url || c.job_board_url);
    log('loading', `${recSrc.length} recurring company career sources`);

    // STEP 2: URL VALIDATION
    if (action === 'full' || action === 'checker_only') {
      const openJ = allJ.filter(j => !j.is_closed && j.status !== 'Closed');
      await progress.startStep('validating_urls', `Validating ${openJ.length} open job URLs...`);
      await progress.updateStep('validating_urls', { items_total: openJ.length, items_processed: 0 });
      log('validating_urls', `${openJ.length} open jobs to validate`);
      for (let i = 0; i < openJ.length; i += 20) {
        const batch = openJ.slice(i, i + 20);
        await progress.updateStep('validating_urls', { items_processed: i, sub_step: `Validating batch ${Math.floor(i/20)+1}/${Math.ceil(openJ.length/20)} (${Math.min(i+20, openJ.length)}/${openJ.length})...` });
        const list = batch.map((j, x) => `${x+1}. "${j.job_title}" at "${j.company_name}" in ${j.city||'?'}, ${j.state||'?'}`).join('\n');
        try {
          const c = await aiCall(oa, `Healthcare job validation. For each job, is the company CURRENTLY hiring for this role?\nMark CLOSED only with strong evidence. Default to OPEN if uncertain.\nJobs:\n${list}\nReturn JSON: [{"index":1,"status":"OPEN"|"CLOSED","reason":"brief"}]\nOnly JSON.`, 3000);
          const res = parseArr(c);
          for (const r of res) { const idx = (r.index||0)-1; if (idx < 0 || idx >= batch.length) continue; validated++; if (r.status === 'CLOSED') { closed++; await supabase.from('marketing_jobs').update({ is_closed: true, status: 'Closed', url_status: 'closed', url_check_result: r.reason||'Closed', closed_reason: r.reason, closed_at: new Date().toISOString(), last_url_check: new Date().toISOString() }).eq('id', batch[idx].id); } else { stillOpen++; await supabase.from('marketing_jobs').update({ url_status: 'active', url_check_result: 'Verified active', last_url_check: new Date().toISOString() }).eq('id', batch[idx].id); } }
        } catch (e) { log('validating_urls', `Batch error: ${(e as Error).message}`); }
      }
      log('validating_urls', `Done: ${validated} checked, ${closed} closed, ${stillOpen} open`);
      await progress.completeStep('validating_urls', `${validated} checked, ${closed} closed, ${stillOpen} still open`);
      await upd({ jobs_validated: validated, jobs_closed: closed, jobs_still_open: stillOpen });
    } else { await progress.skipStep('validating_urls'); }

    // STEP 3: MULTI-PASS SEARCH
    if (action === 'full' || action === 'scan_only') {
      await progress.startStep('searching_sources', 'Beginning multi-pass search across job boards...');
      log('searching_sources', 'Beginning multi-pass search');
      const existing = Array.from(coMap.keys()).slice(0, 60).join(', ');
      const allFound: any[] = [];
      const newCos: string[] = [];
      const pass2Chunks = Math.ceil(PRIORITY_ORGS.length / 40);
      const pass3Chunks = recSrc.length > 0 ? Math.ceil(recSrc.length / 40) : 0;
      const totalPasses = 1 + pass2Chunks + pass3Chunks;
      let passesCompleted = 0;

      // PASS 1
      await progress.updateStep('searching_sources', { items_total: totalPasses, items_processed: 0, sub_step: 'PASS 1: Broad job board search...' });
      log('searching_sources', 'PASS 1: Broad job board search'); searchPasses++;
      try {
        const p1 = await aiCall(oa, `Healthcare recruiting intelligence. Search: ${JOB_BOARDS.join(', ')}\n\nFind ACTIVE postings for ONLY these roles:\n${effectiveRoles.map((r, i) => `${i+1}. ${r}`).join('\n')}\n\nTarget: Medicare Advantage, VBC, PACE, health plans, health systems, hospitals, FQHCs.\nALREADY IN DB: ${existing}\n\nCRITICAL: ONLY return jobs you have HIGH CONFIDENCE are CURRENTLY ACTIVE. Do NOT fabricate.\njob_posting_url: Leave EMPTY.\nMap job_category to: ${CATS.join(' | ')}\nMap job_title to: ${effectiveRoles.join(', ')}\n\nReturn JSON: {"jobs":[{"company":"","job_title":"","job_category":"","city":"","state":"","source_found":""}]}\nFind 40-60 jobs. ONLY valid JSON.`, 12000);
        const d = parseJson(p1); if (d.jobs) { allFound.push(...d.jobs); log('searching_sources', `Pass 1: ${d.jobs.length} jobs`); }
      } catch (e) { log('searching_sources', `Pass 1 error: ${(e as Error).message}`); }
      passesCompleted++;

      // PASS 2
      log('searching_sources', 'PASS 2: Targeted priority org search'); searchPasses++;
      for (let ci = 0; ci < PRIORITY_ORGS.length; ci += 40) {
        const chunk = PRIORITY_ORGS.slice(ci, ci + 40);
        await progress.updateStep('searching_sources', { items_processed: passesCompleted, sub_step: `PASS 2: Priority orgs chunk ${Math.floor(ci/40)+1}/${pass2Chunks}...` });
        try {
          const p2 = await aiCall(oa, `Search for CURRENT job openings at these healthcare organizations:\n${chunk.map((o,i)=>`${i+1}. ${o}`).join('\n')}\n\nRoles: ${effectiveRoles.join(', ')}\nALREADY FOUND: ${allFound.slice(-30).map(j=>`${j.company}-${j.job_title}`).join('; ')}\nCRITICAL: ONLY return jobs you are CONFIDENT are currently active.\nReturn JSON: {"jobs":[{"company":"","job_title":"","city":"","state":"","source_found":""}]}\nOnly JSON.`, 8000);
          const d = parseJson(p2); if (d.jobs) { allFound.push(...d.jobs); log('searching_sources', `Pass 2 chunk: ${d.jobs.length} jobs`); }
        } catch (e) { log('searching_sources', `Pass 2 error: ${(e as Error).message}`); }
        passesCompleted++;
      }

      // PASS 3 - chunk through ALL recurring career sources (was previously
      // capped at .slice(0, 50), which silently dropped any recurring source
      // beyond the first 50). Mirrors Pass 2's chunked iteration.
      if (recSrc.length > 0) {
        log('searching_sources', `PASS 3: ${recSrc.length} recurring career pages (${pass3Chunks} chunks)`); searchPasses++;
        for (let ci = 0; ci < recSrc.length; ci += 40) {
          const chunk = recSrc.slice(ci, ci + 40);
          await progress.updateStep('searching_sources', { items_processed: passesCompleted, sub_step: `PASS 3: Career pages chunk ${Math.floor(ci/40)+1}/${pass3Chunks}...` });
          const srcList = chunk.map((s,i) => `${i+1}. ${s.company_name}${s.careers_url ? ` (${s.careers_url})` : ''}`).join('\n');
          try {
            const p3 = await aiCall(oa, `Check these employer career pages for openings:\n${srcList}\nRoles: ${effectiveRoles.join(', ')}\nALREADY FOUND: ${allFound.slice(-40).map(j=>`${j.company}-${j.job_title}-${j.city||''}`).join('; ')}\nCRITICAL: ONLY return jobs you are CONFIDENT are currently active.\nReturn JSON: {"jobs":[{"company":"","job_title":"","city":"","state":"","source_found":""}]}\nOnly JSON.`, 8000);
            const d = parseJson(p3); if (d.jobs) { allFound.push(...d.jobs); log('searching_sources', `Pass 3 chunk ${Math.floor(ci/40)+1}: ${d.jobs.length} jobs`); }
          } catch (e) { log('searching_sources', `Pass 3 chunk error: ${(e as Error).message}`); }
          passesCompleted++;
        }
        for (const s of recSrc) await supabase.from('marketing_companies').update({ last_searched_at: new Date().toISOString() }).eq('id', s.id);
      }

      log('searching_sources', `Total raw: ${allFound.length} jobs across ${searchPasses} passes`);
      await progress.completeStep('searching_sources', `${allFound.length} raw jobs found across ${searchPasses} passes`);
      await upd({ search_passes_completed: searchPasses, new_jobs_found: allFound.length });

      // STEP 4: VERIFY VIA SERPAPI (strict: only verified jobs pass)
      const candidateJobs: any[] = [];
      for (const j of allFound) {
        if (!j.company || !j.job_title) continue;
        let nt: string;
        if (useDefaultMode) {
          // Legacy clinical-roles path: normalize then strict-include.
          nt = normalizeRole(j.job_title);
          if (!ROLES.includes(nt)) continue;
        } else {
          // Custom job-titles path: keep the AI's raw title and accept any
          // job whose title contains a selected type as a substring.
          nt = j.job_title;
          const titleLower = nt.toLowerCase();
          const passes = effectiveRoles.some(r => {
            const clean = _cleanRoleLabel(r);
            return clean && titleLower.includes(clean);
          });
          if (!passes) continue;
        }
        const dk = `${j.company.toLowerCase().trim()}|${nt.toLowerCase().trim()}|${(j.city||'').toLowerCase().trim()}|${(j.state||'').toLowerCase().trim()}`;
        if (jKeys.has(dk)) { dupes++; continue; }
        candidateJobs.push({ ...j, _normalizedTitle: nt, _dedupKey: dk });
      }

      log('verifying_new_jobs', `${candidateJobs.length} candidate jobs to verify (${dupes} pre-filtered as duplicates)`);
      await progress.startStep('verifying_new_jobs', `Verifying ${candidateJobs.length} candidate jobs via SerpAPI Google Jobs (strict mode)...`);

      const verifyResult = await batchVerifyWithSerpApi(candidateJobs, log, progress);
      jobsVerified = verifyResult.verified.length;
      jobsRejected = verifyResult.rejected.length;
      serpSearchCount = verifyResult.stats.serpSearches;

      log('verifying_new_jobs', `Results: ${jobsVerified} VERIFIED (will be added), ${jobsRejected} REJECTED (will NOT be added). ${serpSearchCount} SerpAPI searches.`);
      await progress.completeStep('verifying_new_jobs', `${jobsVerified} verified, ${jobsRejected} rejected. ${serpSearchCount} SerpAPI searches.`);
      await upd({ jobs_verified: jobsVerified, jobs_rejected: jobsRejected });

      // STEP 5: INSERT ONLY VERIFIED JOBS
      const jobsToInsert = verifyResult.verified;
      await progress.startStep('deduplicating', `Inserting ${jobsToInsert.length} verified jobs...`);
      await progress.updateStep('deduplicating', { items_total: jobsToInsert.length, items_processed: 0 });
      log('deduplicating', `Inserting ${jobsToInsert.length} verified jobs (${jobsRejected} rejected jobs will NOT be inserted)`);

      let processed = 0;
      for (const j of jobsToInsert) {
        processed++;
        const nt = j._normalizedTitle, dk = j._dedupKey;
        if (jKeys.has(dk)) { dupes++; continue; }
        jKeys.add(dk);
        const cat = CATS.includes(j.job_category) ? j.job_category : catCo(j.company);

        let co = coMap.get(j.company.toLowerCase().trim()); let cid = co?.id;
        if (!cid) {
          const { data: nc } = await supabase.from('marketing_companies').insert({ company_name: j.company, industry: cat, company_type: cat, website: '', status: 'New', source: 'AI Intelligence Engine', is_recurring_source: true, role_types_hired: nt, last_searched_at: new Date().toISOString() }).select('*').single();
          if (nc) { cid = nc.id; coMap.set(j.company.toLowerCase().trim(), nc); coAdded++; newCos.push(j.company); log('deduplicating', `NEW COMPANY: ${j.company} (${cat})`); }
        } else {
          const u: any = { is_recurring_source: true };
          if (co.role_types_hired && !co.role_types_hired.includes(nt)) u.role_types_hired = `${co.role_types_hired}, ${nt}`;
          else if (!co.role_types_hired) u.role_types_hired = nt;
          await supabase.from('marketing_companies').update(u).eq('id', cid);
        }
        if (!cid) continue;

        const directUrl = j._verifiedUrl && isDirectJobUrl(j._verifiedUrl) ? j._verifiedUrl : null;
        const { error } = await supabase.from('marketing_jobs').insert({
          company_id: cid, company_name: j.company, job_title: nt, job_type: nt, job_category: cat,
          city: j.city||'', state: j.state||'', location: j.city && j.state ? `${j.city}, ${j.state}` : '',
          job_url: directUrl, indeed_url: buildIndeedUrl(nt, j.company, j.city, j.state),
          linkedin_url: buildLinkedInUrl(nt, j.company), google_jobs_url: buildGoogleJobsUrl(nt, j.company, j.city, j.state),
          opportunity_type: 'Business Development Opportunity', status: 'Open',
          source: `${j.source_found||'AI'} - ${new Date().toISOString().split('T')[0]}`,
          date_posted: new Date().toISOString(), is_net_new: true, tracker_run_id: rid,
          url_status: 'live',
          url_check_result: `[SerpAPI verified] ${j._verifyReason || 'Confirmed in Google Jobs'}`.substring(0, 500),
          last_url_check: new Date().toISOString()
        });
        if (!error) { added++; roleB[nt] = (roleB[nt]||0)+1; }
        if (processed % 10 === 0) await progress.updateStep('deduplicating', { items_processed: processed, sub_step: `Inserted ${added}/${jobsToInsert.length} verified jobs (${coAdded} new companies)...` });
      }
      log('deduplicating', `Added ${added} SerpAPI-verified jobs, ${coAdded} new companies. ${jobsRejected} jobs rejected.`);
      await progress.completeStep('deduplicating', `${added} verified jobs added, ${coAdded} new companies`);
      await upd({ new_jobs_added: added, duplicates_skipped: dupes, new_companies_added: coAdded, new_roles_by_type: roleB });

      // PASS 4: New company search - also verify via SerpAPI
      if (newCos.length > 0 && serpKey) {
        log('searching_sources', `PASS 4: Searching ${newCos.length} new companies for additional roles`); searchPasses++;
        try {
          const p4 = await aiCall(oa, `Search these NEW companies for additional openings:\n${newCos.map((c,i)=>`${i+1}. ${c}`).join('\n')}\nRoles: ${effectiveRoles.join(', ')}\nCRITICAL: ONLY return jobs you are CONFIDENT are currently active.\nReturn JSON: {"jobs":[{"company":"","job_title":"","city":"","state":"","source_found":""}]}\nOnly JSON.`, 6000);
          const d = parseJson(p4);
          const pass4Candidates: any[] = [];
          for (const j of (d.jobs||[])) {
            if (!j.company || !j.job_title) continue;
            let nt: string;
            if (useDefaultMode) {
              nt = normalizeRole(j.job_title);
              if (!ROLES.includes(nt)) continue;
            } else {
              nt = j.job_title;
              const titleLower = nt.toLowerCase();
              const passes = effectiveRoles.some(r => {
                const clean = _cleanRoleLabel(r);
                return clean && titleLower.includes(clean);
              });
              if (!passes) continue;
            }
            const dk = `${j.company.toLowerCase().trim()}|${nt.toLowerCase().trim()}|${(j.city||'').toLowerCase().trim()}|${(j.state||'').toLowerCase().trim()}`;
            if (jKeys.has(dk)) { dupes++; continue; }
            pass4Candidates.push({ ...j, _normalizedTitle: nt, _dedupKey: dk });
          }
          if (pass4Candidates.length > 0) {
            log('searching_sources', `Pass 4: ${pass4Candidates.length} additional candidates, verifying via SerpAPI...`);
            const pass4Verify = await batchVerifyWithSerpApi(pass4Candidates, log);
            jobsVerified += pass4Verify.verified.length;
            jobsRejected += pass4Verify.rejected.length;
            serpSearchCount += pass4Verify.stats.serpSearches;
            for (const j of pass4Verify.verified) {
              if (jKeys.has(j._dedupKey)) { dupes++; continue; } jKeys.add(j._dedupKey);
              const co = coMap.get(j.company.toLowerCase().trim()); if (!co?.id) continue;
              const directUrl = j._verifiedUrl && isDirectJobUrl(j._verifiedUrl) ? j._verifiedUrl : null;
              const { error } = await supabase.from('marketing_jobs').insert({
                company_id: co.id, company_name: j.company, job_title: j._normalizedTitle, job_type: j._normalizedTitle, job_category: catCo(j.company),
                city: j.city||'', state: j.state||'', location: j.city && j.state ? `${j.city}, ${j.state}` : '',
                job_url: directUrl, indeed_url: buildIndeedUrl(j._normalizedTitle, j.company, j.city, j.state), linkedin_url: buildLinkedInUrl(j._normalizedTitle, j.company), google_jobs_url: buildGoogleJobsUrl(j._normalizedTitle, j.company, j.city, j.state),
                opportunity_type: 'Business Development Opportunity', status: 'Open', source: `${j.source_found||'AI Pass 4'} - ${new Date().toISOString().split('T')[0]}`,
                date_posted: new Date().toISOString(), is_net_new: true, tracker_run_id: rid, url_status: 'live', url_check_result: `[SerpAPI verified] ${j._verifyReason || 'Confirmed in Google Jobs'}`.substring(0, 500), last_url_check: new Date().toISOString()
              });
              if (!error) { added++; roleB[j._normalizedTitle] = (roleB[j._normalizedTitle]||0)+1; }
            }
            log('searching_sources', `Pass 4: ${pass4Verify.verified.length} verified and added, ${pass4Verify.rejected.length} rejected`);
          }
        } catch (e) { log('searching_sources', `Pass 4 error: ${(e as Error).message}`); }
        await upd({ new_jobs_added: added, search_passes_completed: searchPasses, new_roles_by_type: roleB, jobs_verified: jobsVerified, jobs_rejected: jobsRejected });
      } else if (newCos.length > 0 && !serpKey) {
        log('searching_sources', `PASS 4: Skipped - no SerpAPI key to verify additional jobs from ${newCos.length} new companies`);
      }

      // STEP 6: CONTACTS (only for companies that have verified jobs)
      await progress.startStep('enriching_contacts', 'Finding hiring contacts...');
      log('enriching_contacts', 'Contact enrichment');
      const coWithJobs = new Set<string>();
      allJ.forEach(j => { if (!j.is_closed && j.status !== 'Closed') coWithJobs.add(j.company_name); });
      newCos.forEach(c => coWithJobs.add(c));
      const needCt: string[] = [];
      for (const cn of coWithJobs) { if (allT.filter(c => c.company_name === cn).length < 2) needCt.push(cn); }
      await progress.updateStep('enriching_contacts', { items_total: needCt.length, items_processed: 0, sub_step: `${needCt.length} companies need contacts` });

      if (needCt.length > 0) {
        log('enriching_contacts', `${needCt.length} companies need contacts`);
        for (let i = 0; i < needCt.length; i += 25) {
          const batch = needCt.slice(i, i + 25);
          await progress.updateStep('enriching_contacts', { items_processed: i, sub_step: `Enriching batch ${Math.floor(i/25)+1}/${Math.ceil(needCt.length/25)}...` });
          try {
            const cr = await aiCall(oa, `Find hiring contacts for:\n${batch.map((c,i)=>`${i+1}. ${c}`).join('\n')}\nFind: Talent Acquisition, Recruiters, HR Directors, Medical Directors, CMOs.\nONLY real verifiable info. No guessed emails.\nReturn JSON: [{"company":"","first_name":"","last_name":"","email":"","phone_work":"","phone_cell":"","phone_home":"","title":"","source":"","source_url":""}]\nOnly JSON.`, 5000);
            for (const c of parseArr(cr)) {
              if (!c.company || (!c.first_name && !c.last_name)) continue;
              const dk = `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${(c.company||'').toLowerCase().trim()}`;
              if (ctKeys.has(dk)) continue; ctKeys.add(dk);
              const co = coMap.get((c.company||'').toLowerCase().trim());
              let su: string|null = null;
              if (c.source_url?.startsWith('http') && !c.source_url.includes('/search/results/') && !c.source_url.includes('?q=')) su = c.source_url;
              const { error } = await supabase.from('marketing_contacts').insert({ company_id: co?.id||null, company_name: c.company, first_name: c.first_name||'', last_name: c.last_name||'', email: c.email||'', phone_work: c.phone_work||'', phone_home: c.phone_home||'', phone_cell: c.phone_cell||'', title: c.title||'', source: 'AI Intelligence Engine', source_url: su, is_verified: !!su });
              if (!error) ctAdded++;
            }
          } catch (e) { log('enriching_contacts', `Batch error: ${(e as Error).message}`); }
        }
      }
      log('enriching_contacts', `${ctAdded} contacts added`);
      await progress.completeStep('enriching_contacts', `${ctAdded} contacts added`);
      await upd({ contacts_added: ctAdded });
    } else {
      await progress.skipStep('searching_sources'); await progress.skipStep('verifying_new_jobs');
      await progress.skipStep('deduplicating'); await progress.skipStep('enriching_contacts');
    }

    // STEP 7: SUMMARIES
    await progress.startStep('updating_summaries', 'Updating company counts...');
    await updateSummariesBatch(log, progress);
    const { data: misU } = await supabase.from('marketing_jobs').select('id, job_title, company_name, city, state').is('indeed_url', null);
    if (misU && misU.length > 0) {
      log('updating_summaries', `Backfilling URLs for ${misU.length} jobs`);
      for (let i = 0; i < misU.length; i += 20) { const chunk = misU.slice(i, i + 20); await Promise.all(chunk.map(j => supabase.from('marketing_jobs').update({ indeed_url: buildIndeedUrl(j.job_title, j.company_name, j.city, j.state), linkedin_url: buildLinkedInUrl(j.job_title, j.company_name), google_jobs_url: buildGoogleJobsUrl(j.job_title, j.company_name, j.city, j.state) }).eq('id', j.id))); }
    }
    await progress.completeStep('updating_summaries', 'Company counts and URLs updated');

    // STEP 8: AUTO-PRIORITIZE
    await progress.startStep('generating_alerts', 'Auto-prioritizing...');
    log('auto_priority', '=== AUTO-PRIORITIZE ===');
    const priorityResult = await autoPrioritize(log, progress);
    log('auto_priority', `=== COMPLETE: ${priorityResult.companiesMarked} cos, ${priorityResult.jobsMarked} jobs starred ===`);
    await progress.completeStep('generating_alerts', `${priorityResult.companiesMarked} companies, ${priorityResult.jobsMarked} jobs starred`);

    // STEP 9: COMPLETE
    await progress.startStep('completed', 'Finalizing...');
    const { data: hp } = await supabase.from('marketing_companies').select('company_name,company_type,open_roles_count,has_md_cmo,contact_count,careers_url').eq('is_high_priority', true).order('open_roles_count', { ascending: false });
    const dt = dateTag();
    const mfn = `Master Marketing Sheet - ${dt}.xlsx`, nfn = `New Marketing Data - ${dt}.xlsx`;

    const alerts = {
      timestamp: new Date().toISOString(), run_id: rid, date_tag: dt,
      high_priority_targets: (hp||[]).map(c => ({ company: c.company_name, category: c.company_type, open_roles: c.open_roles_count, has_md_cmo: c.has_md_cmo, contacts: c.contact_count })),
      summary: { new_roles_by_type: roleB, total_new_jobs: added, new_companies: coAdded, contacts_added: ctAdded, jobs_closed: closed, dupes_skipped: dupes, search_passes: searchPasses, jobs_verified: jobsVerified, jobs_rejected: jobsRejected, verification_mode: verificationMode, serp_searches: serpSearchCount },
      priority: { companies_marked: priorityResult.companiesMarked, jobs_marked: priorityResult.jobsMarked, total_high_priority_companies: priorityResult.totalHighPriorityCompanies },
      files: { master_name: mfn, new_data_name: nfn }
    };

    log('completed', `Tracker run completed. ${added} verified jobs added, ${jobsRejected} rejected. Priority: ${priorityResult.companiesMarked} cos, ${priorityResult.jobsMarked} jobs starred.`);
    await progress.completeStep('completed', 'Tracker run finished successfully');

    await supabase.from('tracker_runs').update({
      status: 'completed', current_step: 'completed', completed_at: new Date().toISOString(),
      new_jobs_added: added, duplicates_skipped: dupes, new_companies_added: coAdded, contacts_added: ctAdded,
      jobs_validated: validated, jobs_closed: closed, jobs_still_open: stillOpen,
      jobs_verified: jobsVerified, jobs_rejected: jobsRejected,
      new_roles_by_type: roleB, high_priority_targets: hp||[],
      master_file_name: mfn, new_data_file_name: nfn,
      alert_summary: alerts, execution_log: logs, search_passes_completed: searchPasses, sources_searched: JOB_BOARDS,
      progress: progress.getState()
    }).eq('id', rid);

  } catch (error) {
    console.error('Tracker process error:', error);
    logs.push({ step: 'error', msg: `Fatal error: ${(error as Error).message}`, ts: new Date().toISOString() });
    await supabase.from('tracker_runs').update({
      status: 'failed', current_step: 'error', completed_at: new Date().toISOString(),
      execution_log: logs, error_message: (error as Error).message,
      jobs_verified: jobsVerified, jobs_rejected: jobsRejected, progress: progress.getState()
    }).eq('id', rid);
  }
}

// ============================================================
// HTTP HANDLER
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    await cleanupStaleRuns();
    const body = await req.json().catch(() => ({}));
    const { action = 'full', jobTitles = [] } = body;
    const safeJobTitles: string[] = Array.isArray(jobTitles)
      ? jobTitles.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const oa = Deno.env.get("OPENAI_API_KEY");
    if (!oa) throw new Error("OPENAI_API_KEY missing");

    const { data: run, error: runErr } = await supabase.from('tracker_runs').insert({
      run_type: action, status: 'running', current_step: 'loading', started_at: new Date().toISOString(),
      progress: { percent: 0, current_step: 'loading', current_sub_step: 'Initializing...', steps: {}, run_started_at: new Date().toISOString() }
    }).select('id').single();
    if (runErr || !run) throw new Error(`Failed to create tracker run: ${runErr?.message || 'unknown'}`);

    const rid = run.id;
    runTrackerProcess(rid, action, oa, safeJobTitles).catch(err => {
      console.error('Background process crashed:', err);
      supabase.from('tracker_runs').update({ status: 'failed', current_step: 'error', completed_at: new Date().toISOString(), error_message: `Background crash: ${err.message}` }).eq('id', rid);
    });

    return new Response(JSON.stringify({ success: true, run_id: rid, message: 'Tracker started. Poll tracker_runs table for progress.' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (error) {
    console.error('Tracker startup error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message, success: false }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
});