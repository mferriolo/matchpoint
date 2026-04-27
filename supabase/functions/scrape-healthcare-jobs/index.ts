import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CATS = ["Value Based Care (VBC)","PACE Medical Groups","Health Plans","Health Systems","Hospitals","FQHC","All Others"];
const ROLES = ["Medical Director","Chief Medical Officer","Primary Care Physician","Nurse Practitioner","Physician Assistant"];
const JOB_BOARDS = ["Indeed","LinkedIn Jobs","ZipRecruiter","Google Jobs","Glassdoor","DocCafe","Health eCareers","PracticeLink","Monster","CareerBuilder","SimplyHired"];

// Healthcare-specific job boards queried via SerpAPI Google Jobs with a
// site: filter (Phase D). Many of these are NOT well indexed in the
// default Google Jobs aggregator results, so a targeted site: query
// surfaces postings the per-company / per-role queries miss.
// Domains kept tight (no www.) so the site: filter resolves cleanly.
const HEALTHCARE_BOARDS = [
  'doccafe.com',
  'healthecareers.com',
  'practicelink.com',
  'careers.jamanetwork.com',
  'jobs.nejmcareercenter.org',
  'practicematch.com',
  'vivian.com',
  'jobs.nurse.com',
];
const PRIORITY_ORGS = ["Agilon Health","Oak Street Health","ChenMed","Iora Health","Aledade","Cityblock Health","Cano Health","Privia Health","Signify Health","Curana Health","VillageMD","Hopscotch Health","Cohere Health","CINQCARE","CenterWell","HarmonyCares","CareMax","P3 Health Partners","Wellvana","Bloom Healthcare","Pair Team","Firefly Health","Vera Whole Health","Everside Health","Marathon Health","Alignment Healthcare","Devoted Health","Clover Health","Bright Health","Carelon","Optum","UnitedHealth Group","InnovAge","Trinity Health PACE","myPlace Health","Element Care","Humana","CVS Health","Aetna","Elevance Health","Cigna","Molina Healthcare","Centene","SCAN Health Plan","Oscar Health","Point32Health","CommonSpirit Health","HCA Healthcare","Ascension","Providence","Trinity Health","Intermountain Health","Kaiser Permanente","Advocate Aurora Health","Atrium Health","Geisinger","Tenet Healthcare","Landmark Health","DispatchHealth","BrightSpring Health","Enhabit Home Health","Compassus","Main Street Health","Strive Health","Crossover Health","Pearl Health","Rush University System for Health","Evolent Health","Lumeris"];

// validating_urls and verifying_new_jobs removed in v78 — they were
// no-ops after the v76 direct-SerpAPI rewrite.
const STEP_WEIGHTS: Record<string, number> = { loading: 5, searching_sources: 50, deduplicating: 15, enriching_contacts: 15, updating_summaries: 8, generating_alerts: 4, completed: 3 };
const STEP_ORDER = ['loading','searching_sources','deduplicating','enriching_contacts','updating_summaries','generating_alerts','completed'];

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
//
// Telemetry: gpt-4o-mini pricing as of late 2025 is $0.150/M input
// tokens + $0.600/M output tokens. The wrapper records token counts +
// dollar cost into the active step's metrics so we can see what each
// pass actually costs.
const GPT4O_MINI_INPUT_PER_M = 0.150;   // USD per 1M input tokens
const GPT4O_MINI_OUTPUT_PER_M = 0.600;  // USD per 1M output tokens
const SERPAPI_COST_PER_SEARCH = 0.01;   // USD; typical Self plan rate

async function aiCall(key: string, prompt: string, maxTok = 8000, telem?: Telemetry): Promise<string> {
  const t0 = Date.now();
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
  if (telem) {
    const inT = d.usage?.prompt_tokens || 0;
    const outT = d.usage?.completion_tokens || 0;
    const cost = (inT * GPT4O_MINI_INPUT_PER_M / 1_000_000) + (outT * GPT4O_MINI_OUTPUT_PER_M / 1_000_000);
    telem.recordAiCall(inT, outT, cost, Date.now() - t0);
  }
  return d.choices?.[0]?.message?.content || '';
}

// ============================================================
// TELEMETRY TRACKER
// Records per-step duration, AI calls/tokens/cost, SerpAPI calls/cost,
// and item-flow counts (how many items entered vs. survived each step).
// Saved to tracker_runs.telemetry at the end of every run so we can
// see exactly what each step is costing and producing.
// ============================================================
interface StepMetrics {
  step: string;
  duration_ms: number;
  ai_calls: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_cost_usd: number;
  serp_calls: number;
  serp_cost_usd: number;
  items_in: number;
  items_out: number;
  notes: string;
}
interface TelemetrySnapshot {
  steps: StepMetrics[];
  totals: {
    duration_ms: number;
    ai_calls: number;
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_cost_usd: number;
    serp_calls: number;
    serp_cost_usd: number;
    total_cost_usd: number;
  };
}

class Telemetry {
  private steps: StepMetrics[] = [];
  private current: StepMetrics | null = null;
  private startedAt = Date.now();

  startStep(name: string, itemsIn = 0) {
    if (this.current) this.endStep(); // auto-close if not closed
    this.current = {
      step: name, duration_ms: 0,
      ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0, ai_cost_usd: 0,
      serp_calls: 0, serp_cost_usd: 0,
      items_in: itemsIn, items_out: 0, notes: '',
    };
    (this.current as any)._startedAt = Date.now();
  }

  endStep(itemsOut?: number, notes?: string) {
    if (!this.current) return;
    this.current.duration_ms = Date.now() - (this.current as any)._startedAt;
    if (itemsOut !== undefined) this.current.items_out = itemsOut;
    if (notes !== undefined) this.current.notes = notes;
    delete (this.current as any)._startedAt;
    this.steps.push(this.current);
    this.current = null;
  }

  recordAiCall(inputTokens: number, outputTokens: number, cost: number, _durMs: number) {
    if (!this.current) return;
    this.current.ai_calls++;
    this.current.ai_input_tokens += inputTokens;
    this.current.ai_output_tokens += outputTokens;
    this.current.ai_cost_usd += cost;
  }

  recordSerpCalls(n: number) {
    if (!this.current) return;
    this.current.serp_calls += n;
    this.current.serp_cost_usd += n * SERPAPI_COST_PER_SEARCH;
  }

  bumpItemsOut(delta: number) {
    if (this.current) this.current.items_out += delta;
  }

  snapshot(): TelemetrySnapshot {
    if (this.current) this.endStep(); // close any open step
    const totals = this.steps.reduce((acc, s) => ({
      duration_ms: acc.duration_ms + s.duration_ms,
      ai_calls: acc.ai_calls + s.ai_calls,
      ai_input_tokens: acc.ai_input_tokens + s.ai_input_tokens,
      ai_output_tokens: acc.ai_output_tokens + s.ai_output_tokens,
      ai_cost_usd: acc.ai_cost_usd + s.ai_cost_usd,
      serp_calls: acc.serp_calls + s.serp_calls,
      serp_cost_usd: acc.serp_cost_usd + s.serp_cost_usd,
      total_cost_usd: acc.total_cost_usd + s.ai_cost_usd + s.serp_cost_usd,
    }), { duration_ms: 0, ai_calls: 0, ai_input_tokens: 0, ai_output_tokens: 0, ai_cost_usd: 0, serp_calls: 0, serp_cost_usd: 0, total_cost_usd: 0 });
    // Wall-clock total can differ from sum of steps if there are gaps; use wall clock.
    totals.duration_ms = Date.now() - this.startedAt;
    return { steps: this.steps, totals };
  }
}

function parseJson(text: string): any { try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {} return {}; }
function parseArr(text: string): any[] { try { const m = text.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); } catch {} return []; }
function dateTag(): string { const d = new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`; }

// Outer timeout for any async operation. In v148 the AbortController-based
// timeout inside searchSerpApi* covered only fetch() setup — if the body
// read (resp.json()) stalled after headers arrived, the promise would
// hang forever and freeze the Promise.all batch that waited on it. This
// helper races the inner promise against a timer so the *total* call
// time is bounded regardless of where the hang happens.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race<T>([
    p.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

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

// ============================================================
// CAREER PAGE SCRAPING (v80)
// Fetch jobs directly from a company's careers page. Detects which
// applicant-tracking system (ATS) the page uses and calls the
// appropriate JSON API; falls back to a generic HTML scrape for
// unknown systems. Career-page URLs are preferred over job-board
// URLs (Indeed/LinkedIn/Google Jobs) for the canonical job_url
// because they're the most direct link to apply.
// ============================================================
interface CareerPageScrapeResult {
  jobs: Array<{ title: string; location: string; url: string }>;
  ats: string;
  error?: string;
}

async function scrapeCareerPage(careersUrl: string, _company: string): Promise<CareerPageScrapeResult> {
  const url = (careersUrl || '').trim();
  if (!url || !url.startsWith('http')) return { jobs: [], ats: 'invalid', error: 'invalid url' };
  const lower = url.toLowerCase();
  const inner = async (): Promise<CareerPageScrapeResult> => {
    try {
      if (lower.includes('greenhouse.io') || lower.includes('boards.greenhouse')) return await scrapeGreenhouseBoard(url);
      if (lower.includes('lever.co')) return await scrapeLeverBoard(url);
      if (lower.includes('myworkdayjobs.com') || lower.includes('workday.com')) return await scrapeWorkdayBoard(url);
      return await scrapeGenericCareersPage(url);
    } catch (e) {
      return { jobs: [], ats: 'error', error: (e as Error).message };
    }
  };
  // Bound the total wall-clock for any career-page fetch (including body
  // reads inside the sub-helpers, which weren't covered by their inner
  // AbortControllers) so one hang can't block Phase A's entire batch.
  try {
    return await withTimeout(inner(), 20000, `scrape[${url.substring(0, 60)}]`);
  } catch (e: any) {
    return { jobs: [], ats: 'timeout', error: e?.message || String(e) };
  }
}

async function scrapeGreenhouseBoard(url: string): Promise<CareerPageScrapeResult> {
  // Greenhouse Boards API. Slug is the path segment after greenhouse.io
  // e.g. https://boards.greenhouse.io/oakstreethealth -> 'oakstreethealth'
  const m = url.match(/(?:boards\.greenhouse\.io|greenhouse\.io)\/([\w-]+)/i);
  if (!m) return { jobs: [], ats: 'greenhouse', error: 'could not extract Greenhouse slug from URL' };
  const slug = m[1];
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timeout);
    if (!r.ok) return { jobs: [], ats: 'greenhouse', error: `HTTP ${r.status}` };
    const d = await r.json();
    const jobs = (d.jobs || []).map((j: any) => ({
      title: j.title || '',
      location: j.location?.name || '',
      url: j.absolute_url || '',
    })).filter((j: any) => j.title && j.url);
    return { jobs, ats: 'greenhouse' };
  } catch (e) { clearTimeout(timeout); return { jobs: [], ats: 'greenhouse', error: (e as Error).message }; }
}

async function scrapeLeverBoard(url: string): Promise<CareerPageScrapeResult> {
  const m = url.match(/(?:jobs\.lever\.co|lever\.co)\/([\w-]+)/i);
  if (!m) return { jobs: [], ats: 'lever', error: 'could not extract Lever slug from URL' };
  const slug = m[1];
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(timeout);
    if (!r.ok) return { jobs: [], ats: 'lever', error: `HTTP ${r.status}` };
    const d = await r.json();
    const jobs = (d || []).map((j: any) => ({
      title: j.text || '',
      location: j.categories?.location || '',
      url: j.hostedUrl || j.applyUrl || '',
    })).filter((j: any) => j.title && j.url);
    return { jobs, ats: 'lever' };
  } catch (e) { clearTimeout(timeout); return { jobs: [], ats: 'lever', error: (e as Error).message }; }
}

async function scrapeWorkdayBoard(url: string): Promise<CareerPageScrapeResult> {
  // Workday URLs look like: https://{tenant}.wd{N}.myworkdayjobs.com/[en-US/]{site}
  // The JSON jobs endpoint is: POST /wday/cxs/{tenant}/{site}/jobs
  const m = url.match(/^https?:\/\/([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)/i);
  if (!m) return { jobs: [], ats: 'workday', error: 'could not parse Workday URL' };
  const [, tenant, wd, site] = m;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const apiUrl = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
    const r = await fetch(apiUrl, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: '' }),
    });
    clearTimeout(timeout);
    if (!r.ok) return { jobs: [], ats: 'workday', error: `HTTP ${r.status}` };
    const d = await r.json();
    const baseHost = `https://${tenant}.${wd}.myworkdayjobs.com`;
    const jobs = (d.jobPostings || []).map((j: any) => ({
      title: j.title || '',
      location: j.locationsText || '',
      url: j.externalPath ? `${baseHost}${j.externalPath}` : '',
    })).filter((j: any) => j.title && j.url);
    return { jobs, ats: 'workday' };
  } catch (e) { clearTimeout(timeout); return { jobs: [], ats: 'workday', error: (e as Error).message }; }
}

// v82: smarter generic HTML scrape. Tries 3 strategies in order:
//   1. JSON-LD <script type="application/ld+json"> with @type:"JobPosting"
//      (the highest-precision source — many modern career pages embed
//      this for SEO and Google Jobs indexing)
//   2. Anchor tag with a heading child (<a>...<h3>Medical Director</h3></a>)
//   3. Anchor tag with non-generic text, OR a nearby heading just before
//      the anchor in the source order (typical "card" layout)
// Filters out generic UI text ("Apply", "View", "Search", "Open Positions"
// etc.) so the upstream role-match filter has real titles to compare.

const STRIP_HTML = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ')
   .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
   .replace(/\s+/g, ' ').trim();

const GENERIC_LABELS = new RegExp([
  '^(apply|apply now|apply here|view|view job|view jobs|view all|view all jobs',
  'view position|view positions|view opening|view openings|view career|view careers',
  'learn more|read more|see details|details|click here|search|search jobs|search now',
  'filter|filters|home|about|contact|login|sign in|sign up|menu|skip|skip to',
  'toggle|show more|show less|next|previous|back|continue',
  'jobs|careers|all jobs|all positions|browse jobs|browse careers',
  'open positions|open jobs|open opportunities|open roles|opportunities',
  'positions|requisition|requisitions|find jobs|find a job|find your role',
  'available positions|available jobs|current openings|current jobs',
  'no jobs|no openings|see all|see more|share|email|tweet|facebook|linkedin',
  'newsletter|subscribe|sitemap|terms|privacy|policy|cookies|copyright',
  'page \\d+|previous page|next page|first|last)$',
].join('|'), 'i');

const isGenericLabel = (s: string): boolean => GENERIC_LABELS.test(s.trim());

function formatJsonLdLocation(jl: any): string {
  if (!jl) return '';
  if (typeof jl === 'string') return jl;
  if (Array.isArray(jl)) return formatJsonLdLocation(jl[0]);
  const addr = jl.address || jl;
  if (typeof addr === 'string') return addr;
  const parts = [addr.addressLocality, addr.addressRegion].filter(Boolean);
  return parts.join(', ');
}

function extractJsonLdJobs(html: string, baseUrl: URL): { title: string; location: string; url: string }[] {
  const jobs: { title: string; location: string; url: string }[] = [];
  const ldRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRegex.exec(html)) !== null) {
    let parsed: any;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      const t = node['@type'];
      const isJobPosting = t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
      if (isJobPosting) {
        const title = (node.title || '').trim();
        let url = node.url || '';
        if (typeof url === 'object') url = url['@id'] || '';
        if (title && url) {
          let abs: string;
          try { abs = url.startsWith('http') ? url : new URL(url, baseUrl).toString(); } catch { return; }
          jobs.push({ title, location: formatJsonLdLocation(node.jobLocation), url: abs });
        }
        return;
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(visit);
        else if (typeof v === 'object' && v !== null) visit(v);
      }
    };
    visit(parsed);
  }
  return jobs;
}

async function scrapeGenericCareersPage(url: string): Promise<CareerPageScrapeResult> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; MatchPointBot/1.0; +https://matchpoint-nu-dun.vercel.app)' } });
    clearTimeout(timeout);
    if (!r.ok) return { jobs: [], ats: 'generic', error: `HTTP ${r.status}` };
    const html = await r.text();
    const baseUrl = new URL(url);
    const seenHrefs = new Set<string>();
    const jobs: { title: string; location: string; url: string }[] = [];

    // Strategy 1: JSON-LD JobPosting nodes (highest precision when present)
    for (const j of extractJsonLdJobs(html, baseUrl)) {
      if (!seenHrefs.has(j.url) && j.title.length >= 3 && j.title.length <= 200) {
        seenHrefs.add(j.url);
        jobs.push(j);
      }
    }
    if (jobs.length > 0) {
      // Some sites duplicate jobs in JSON-LD AND HTML; if JSON-LD found
      // anything we trust it and skip the HTML pass to avoid noise.
      return { jobs: jobs.slice(0, 200), ats: 'generic' };
    }

    // Strategy 2 + 3: anchor-based extraction with structural context
    const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRegex.exec(html)) !== null) {
      const rawHref = m[1].trim();
      const innerHtml = m[2];
      if (!rawHref) continue;
      // Path looks job-like
      if (!/\/(job|jobs|career|careers|opening|openings|position|positions|vacancy|vacancies|opportunity|opportunities|requisition|posting)/i.test(rawHref)) continue;

      let title = '';

      // Try 2a: heading INSIDE the anchor (common card pattern where
      // the whole card is wrapped in <a>)
      const headInside = innerHtml.match(/<(h[1-6]|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i);
      if (headInside) {
        const t = STRIP_HTML(headInside[2]);
        if (t && !isGenericLabel(t) && t.length >= 5 && t.length <= 200) title = t;
      }

      // Try 2b: anchor's own text content (stripped of HTML)
      if (!title) {
        const anchorText = STRIP_HTML(innerHtml);
        if (anchorText && !isGenericLabel(anchorText) && anchorText.length >= 5 && anchorText.length <= 200) {
          title = anchorText;
        }
      }

      // Try 3: heading just BEFORE this anchor in the source (the
      // "card" pattern where the title is a sibling, not a child)
      if (!title) {
        const lookbackStart = Math.max(0, m.index - 800);
        const before = html.substring(lookbackStart, m.index);
        const headsBefore = [...before.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
        if (headsBefore.length > 0) {
          const lastH = headsBefore[headsBefore.length - 1];
          const t = STRIP_HTML(lastH[2]);
          if (t && !isGenericLabel(t) && t.length >= 5 && t.length <= 200) title = t;
        }
      }

      if (!title) continue;

      let absUrl: string;
      try { absUrl = rawHref.startsWith('http') ? rawHref : new URL(rawHref, baseUrl).toString(); } catch { continue; }
      if (seenHrefs.has(absUrl)) continue;
      seenHrefs.add(absUrl);
      jobs.push({ title, location: '', url: absUrl });
      if (jobs.length >= 200) break;
    }
    return { jobs, ats: 'generic' };
  } catch (e) { clearTimeout(timeout); return { jobs: [], ats: 'generic', error: (e as Error).message }; }
}

async function searchSerpApiForCompany(company: string, roleHints: string[]): Promise<CompanySearchResult> {
  const serpKey = Deno.env.get("SERP_API_KEY");
  if (!serpKey) return { company, searchSuccess: false, jobsFound: [], error: 'no key' };
  const inner = async (): Promise<CompanySearchResult> => {
    const roleStr = roleHints.slice(0, 3).join(' OR ');
    const q = `"${company}" ${roleStr}`;
    const params = new URLSearchParams({ engine: 'google_jobs', q, api_key: serpKey, hl: 'en', gl: 'us' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { company, searchSuccess: false, jobsFound: [], error: `HTTP ${resp.status}: ${errText.substring(0, 100)}` };
      }
      const data = await resp.json();
      const jobs: SerpJobResult[] = (data.jobs_results || []).map((j: any) => ({
        title: j.title || '', company_name: j.company_name || '', location: j.location || '', via: j.via || '',
        extensions: j.extensions || [], apply_urls: (j.apply_options || []).map((ao: any) => ao.link).filter((u: string) => u?.startsWith('http')),
      }));
      return { company, searchSuccess: true, jobsFound: jobs };
    } finally {
      // Keep the abort signal live until after resp.json() so a hang
      // during body read gets aborted too. clearTimeout is here so the
      // timer is cleared once we're fully done.
      clearTimeout(timeout);
    }
  };
  try {
    return await withTimeout(inner(), 18000, `serp[${company}]`);
  } catch (e: any) {
    return { company, searchSuccess: false, jobsFound: [], error: e?.message || String(e) };
  }
}

// Broad Google Jobs query — used for "vacuum" mode to catch jobs at
// companies not yet in our DB. Doesn't quote the query as a company name;
// caller is responsible for quoting if they want exact-phrase matching.
async function searchSerpApiBroad(query: string): Promise<CompanySearchResult> {
  const serpKey = Deno.env.get("SERP_API_KEY");
  if (!serpKey) return { company: '(broad)', searchSuccess: false, jobsFound: [], error: 'no key' };
  const inner = async (): Promise<CompanySearchResult> => {
    const params = new URLSearchParams({ engine: 'google_jobs', q: query, api_key: serpKey, hl: 'en', gl: 'us' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return { company: '(broad)', searchSuccess: false, jobsFound: [], error: `HTTP ${resp.status}: ${errText.substring(0, 100)}` };
      }
      const data = await resp.json();
      const jobs: SerpJobResult[] = (data.jobs_results || []).map((j: any) => ({
        title: j.title || '', company_name: j.company_name || '', location: j.location || '', via: j.via || '',
        extensions: j.extensions || [], apply_urls: (j.apply_options || []).map((ao: any) => ao.link).filter((u: string) => u?.startsWith('http')),
      }));
      return { company: '(broad)', searchSuccess: true, jobsFound: jobs };
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    return await withTimeout(inner(), 18000, `serp-broad[${query.substring(0, 40)}]`);
  } catch (e: any) {
    return { company: '(broad)', searchSuccess: false, jobsFound: [], error: e?.message || String(e) };
  }
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

async function batchVerifyWithSerpApi(foundJobs: any[], logFn: (step: string, msg: string) => void, progress?: ReturnType<typeof createProgressTracker>): Promise<{ verified: any[]; rejected: any[]; stats: { serpSearches: number; serpMatches: number; serpErrors: number } }> {
  const serpKey = Deno.env.get("SERP_API_KEY");
  const verified: any[] = [], rejected: any[] = [];
  const stats = { serpSearches: 0, serpMatches: 0, serpErrors: 0 };

  if (!serpKey) {
    logFn('verifying_new_jobs', 'SerpAPI key not configured - cannot verify jobs. ALL found jobs will be REJECTED.');
    for (const j of foundJobs) {
      rejected.push({ ...j, _verifyReason: 'Rejected: SerpAPI key not configured, cannot verify job is active', _verifiedUrl: '' });
    }
    return { verified: [], rejected, stats };
  }

  const companyGroups = new Map<string, any[]>();
  for (const j of foundJobs) { const key = (j.company || '').toLowerCase().trim(); if (!companyGroups.has(key)) companyGroups.set(key, []); companyGroups.get(key)!.push(j); }
  const uniqueCompanies = Array.from(companyGroups.keys());
  logFn('verifying_new_jobs', `Grouped ${foundJobs.length} jobs into ${uniqueCompanies.length} unique companies for SerpAPI verification (strict mode: only verified jobs will be added)`);
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
    // v85: bumped from 15 → 30 min so a legitimately-long run isn't
    // marked failed by the next invocation's cleanup. UI watchdog also
    // moved to 30 min in TrackerControls.tsx for the same reason.
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stale } = await supabase.from('tracker_runs').select('id').eq('status', 'running').lt('started_at', cutoff);
    if (stale && stale.length > 0) { const ids = stale.map(r => r.id); await supabase.from('tracker_runs').update({ status: 'failed', completed_at: new Date().toISOString(), current_step: 'error', error_message: 'Auto-cleaned: exceeded 30min timeout' }).in('id', ids); }
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

async function runTrackerProcess(rid: string, action: string, oa: string, jobTitles: string[] = [], priorityOrgs: string[] = [], deepScan: boolean = false) {
  // Effective roles list: if the caller (TrackerControls picklist) passed
  // a non-empty jobTitles array, use it; otherwise fall back to the
  // hardcoded clinical ROLES (the historical default).
  const effectiveRoles: string[] = (jobTitles && jobTitles.length > 0) ? jobTitles : ROLES;
  // Effective priority companies: if the caller passed a non-empty
  // priorityOrgs array (selected rows from tracker_priority_companies),
  // use it; otherwise fall back to the hardcoded PRIORITY_ORGS seed list.
  const effectivePriorityOrgsList: string[] = (priorityOrgs && priorityOrgs.length > 0) ? priorityOrgs : PRIORITY_ORGS;
  // In default mode the strict normalizeRole + ROLES.includes filter is
  // used (preserves legacy behavior). In custom mode we keep the AI's
  // raw title and accept any job whose title contains a selected type
  // as a substring (case-insensitive, parenthetical bits stripped).
  const useDefaultMode = effectiveRoles === ROLES;

  // Per-run telemetry. Saved to tracker_runs.telemetry on completion.
  const telem = new Telemetry();
  // Wall-clock start used for the time-budget guard inside the discovery loop.
  const runStartMs = Date.now();
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

    // jKeys intentionally includes blocked jobs so that the dedup check
    // catches AI re-discoveries of jobs the user explicitly blocked.
    // We also retain the row id alongside the dk so that, when a dupe
    // hits, we can mark that row as last_seen_at = now() at end of run
    // (drives the recency component of priority_score). Without this,
    // a long-running listing would never refresh its recency score.
    const jKeyToId = new Map<string, string>();
    for (const j of allJ) {
      const dk = `${(j.company_name||'').toLowerCase().trim()}|${(j.job_title||'').toLowerCase().trim()}|${(j.city||'').toLowerCase().trim()}|${(j.state||'').toLowerCase().trim()}`;
      jKeyToId.set(dk, j.id);
    }
    const jKeys = new Set(jKeyToId.keys());
    // IDs of existing rows the scraper re-encountered this run. Bulk-
    // updated at end of run (one UPDATE … WHERE id = ANY(ids)).
    const reseenIds = new Set<string>();
    const coMap = new Map(allC.map(c => [(c.company_name||'').toLowerCase().trim(), c]));
    const ctKeys = new Set(allT.map(c => `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${(c.company_name||'').toLowerCase().trim()}`));
    // Blocked items the user has explicitly excluded from future scraping.
    // Used to skip URL revalidation, drop AI-found jobs whose company
    // is blocked, and prune blocked companies from Pass 2 / Pass 3.
    const blockedJobIds = new Set(allJ.filter(j => j.is_blocked).map(j => j.id));
    const blockedCompanyNames = new Set(allC.filter(c => c.is_blocked).map(c => (c.company_name||'').toLowerCase().trim()));
    const recSrc = allC.filter(c => (c.is_recurring_source || c.careers_url || c.job_board_url) && !c.is_blocked);
    log('loading', `${recSrc.length} recurring company career sources, ${blockedJobIds.size} jobs / ${blockedCompanyNames.size} companies blocked`);

    // (Former STEP 2: URL VALIDATION removed in v78 — v75 telemetry showed
    // it was a no-op. A real fetch()-based URL checker can be added later
    // as a separate step if needed.)

    // STEP 3: DIRECT DISCOVERY VIA SERPAPI GOOGLE JOBS (v76 rewrite)
    // Replaced the v75 multi-pass AI brainstorm — which produced 0 net-new
    // jobs and burned $0.22/run rejecting AI hallucinations — with direct
    // SerpAPI Google Jobs queries. Each priority + recurring company gets
    // one search; each role keyword gets one broad search for "vacuum"
    // coverage of companies not already in our DB. No separate verification
    // step is needed because results are already verified by virtue of being
    // currently indexed in Google Jobs.
    if (action === 'full' || action === 'scan_only') {
      const newCos: string[] = [];
      if (!serpKey) {
        log('searching_sources', 'No SerpAPI key configured — discovery skipped (set SERP_API_KEY in Supabase Edge Function secrets)');
        await progress.skipStep('searching_sources');
        await progress.skipStep('deduplicating');
      } else {
        // Build unified target list. v150 changes:
        //   - Fast mode (deepScan=false): priority-selected only. Previously
        //     this silently unioned in every marketing_companies row with a
        //     careers_url (~207 rows), turning a "18 companies" run into
        //     230 SerpAPI calls and blowing past the edge-function wall
        //     clock. If you want the recurring-sources sweep, flip Deep.
        //   - Deep mode (deepScan=true): priority-selected ∪ recurring
        //     sources, same as before.
        //   - Both modes: hard-cap combined targets at MAX_TARGETS_PER_RUN.
        //     Priority-selected rows are always pushed first, so truncation
        //     only ever drops recurring-source rows.
        const MAX_TARGETS_PER_RUN = 80;
        type SearchTarget = { name: string; source: 'priority' | 'recurring' };
        const effectivePriorityOrgs = effectivePriorityOrgsList.filter(o => !blockedCompanyNames.has(o.toLowerCase().trim()));
        const targetsRaw: SearchTarget[] = [];
        const seenLower = new Set<string>();
        for (const name of effectivePriorityOrgs) {
          const lower = name.toLowerCase().trim();
          if (seenLower.has(lower)) continue;
          seenLower.add(lower);
          targetsRaw.push({ name, source: 'priority' });
        }
        const priorityTargetCount = targetsRaw.length;
        let recurringIncluded = 0, recurringSkippedFastMode = 0;
        if (deepScan) {
          for (const c of recSrc) {
            const lower = (c.company_name || '').toLowerCase().trim();
            if (!lower || seenLower.has(lower)) continue;
            seenLower.add(lower);
            targetsRaw.push({ name: c.company_name, source: 'recurring' });
            recurringIncluded++;
          }
        } else {
          for (const c of recSrc) {
            const lower = (c.company_name || '').toLowerCase().trim();
            if (!lower || seenLower.has(lower)) continue;
            recurringSkippedFastMode++;
          }
        }
        const truncatedBy = Math.max(0, targetsRaw.length - MAX_TARGETS_PER_RUN);
        const targets: SearchTarget[] = targetsRaw.slice(0, MAX_TARGETS_PER_RUN);

        const modeLabel = deepScan ? 'DEEP' : 'FAST';
        const scopeDetail = deepScan
          ? `${priorityTargetCount} priority + ${recurringIncluded} recurring`
          : `${priorityTargetCount} priority (skipped ${recurringSkippedFastMode} recurring sources — flip Deep to include)`;
        const capDetail = truncatedBy > 0
          ? ` [CAPPED at ${MAX_TARGETS_PER_RUN}: dropped ${truncatedBy} recurring sources from this run]`
          : '';

        const totalUnits = targets.length + effectiveRoles.length;
        log('searching_sources',
          `DIRECT DISCOVERY (${modeLabel}): ${targets.length} companies (${scopeDetail}) + ` +
          `${effectiveRoles.length} broad role searches = ${totalUnits} SerpAPI calls${capDetail}`
        );
        await progress.startStep('searching_sources', `Scraping career pages, then querying Google Jobs...`);
        await progress.updateStep('searching_sources', { items_total: totalUnits, items_processed: 0 });
        // discover_via_serpapi telemetry step is started below, after Phase A.

        const foundJobs: any[] = [];
        const foundJobKeys = new Set<string>();
        // Parallel map of dedup-key → foundJobs entry so career-page
        // ingests in the reversed flow can upgrade an existing SerpAPI
        // entry's URL in O(1) instead of scanning foundJobs.
        const foundByKey = new Map<string, any>();
        let serpCalls = 0, serpErrors = 0, processed = 0;

        // Reusable role-match check. Same dual-mode logic as the legacy
        // filter: strict normalizeRole+ROLES.includes in default
        // mode; loose substring match against effectiveRoles in custom mode.
        const titleMatches = (title: string): { passes: boolean; normalized: string } => {
          if (useDefaultMode) {
            const nt = normalizeRole(title);
            return { passes: ROLES.includes(nt), normalized: nt };
          }
          const lower = title.toLowerCase();
          const hit = effectiveRoles.find(r => {
            const c = _cleanRoleLabel(r);
            return c && lower.includes(c);
          });
          return { passes: !!hit, normalized: title };
        };

        // When called from the reversed-flow Phase A (career-page scrape
        // after SerpAPI has already populated foundJobs), pass
        // { upgradeUrl: true } so that a dedup collision upgrades the
        // existing entry's URL to the direct career-page link instead of
        // silently dropping the career-page result.
        const ingestSerpResult = (
          sj: SerpJobResult,
          defaultCompanyName: string,
          sourceLabel: string,
          opts?: { upgradeUrl?: boolean }
        ) => {
          const title = (sj.title || '').trim();
          const company = (sj.company_name || defaultCompanyName || '').trim();
          if (!title || !company) return;
          if (blockedCompanyNames.has(company.toLowerCase().trim())) return;
          const m = titleMatches(title);
          if (!m.passes) return;
          const loc = (sj.location || '').trim();
          const locParts = loc.split(',').map(s => s.trim());
          const city = locParts[0] || '';
          const state = locParts[1] || '';
          const dk = `${company.toLowerCase().trim()}|${m.normalized.toLowerCase().trim()}|${city.toLowerCase()}|${state.toLowerCase()}`;
          if (jKeys.has(dk)) {
            const id = jKeyToId.get(dk);
            if (id) reseenIds.add(id);
            dupes++; return;
          }
          if (foundJobKeys.has(dk)) {
            if (opts?.upgradeUrl) {
              const url = sj.apply_urls?.[0] || '';
              const existing = foundByKey.get(dk);
              if (existing && url) {
                existing._verifiedUrl = url;
                existing.source_found = sj.via || `Google Jobs (${sourceLabel})`;
                existing._verifyReason = `Direct from career page (${sj.via || sourceLabel})`;
              }
            }
            dupes++;
            return;
          }
          foundJobKeys.add(dk);
          const url = sj.apply_urls?.[0] || '';
          const entry = {
            company,
            job_title: title,
            _normalizedTitle: m.normalized,
            _dedupKey: dk,
            city, state,
            source_found: sj.via || `Google Jobs (${sourceLabel})`,
            _verifiedUrl: url,
            _verifyReason: `Direct from Google Jobs (via ${sj.via || sourceLabel})`,
          };
          foundJobs.push(entry);
          foundByKey.set(dk, entry);
        };

        // Phase A moved (v148): career-page scraping now runs AFTER Phase
        // B/C/D so that in fast mode it can be gated on companies that
        // actually turned up SerpAPI hits — turning "scrape 120 pages
        // serially" into "scrape the ~30 pages worth scraping, in
        // parallel." Deep-scan runs still scrape every priority company
        // with a careers_url regardless of SerpAPI results (weekly safety
        // net for career-only postings).
        telem.startStep('discover_via_serpapi', totalUnits);

        // ---------- Phase B: Per-company SerpAPI queries ----------
        // v85: parallelized with concurrency=5 to cut Phase B time from
        // ~16 min (serial × 8s/call × 110 companies) down to ~3 min.
        // SerpAPI's Self plan supports >100 concurrent connections; 5 is
        // very safe and avoids tripping any rate limits.
        const PHASE_B_CONCURRENCY = 5;
        for (let i = 0; i < targets.length; i += PHASE_B_CONCURRENCY) {
          if (Date.now() - runStartMs > 25 * 60 * 1000) {
            log('searching_sources', `Time budget exhausted after ${processed} queries (${foundJobs.length} found jobs so far)`);
            break;
          }
          const batch = targets.slice(i, i + PHASE_B_CONCURRENCY);
          // allSettled so one hung / rejected helper can't freeze the
          // batch. searchSerpApiForCompany catches internally, but the
          // withTimeout wrapper can reject if a body read stalls past
          // its hard deadline — we want those to count as errors, not
          // hang Phase B.
          const settled = await Promise.allSettled(
            batch.map(t => searchSerpApiForCompany(t.name, effectiveRoles).then(r => ({ t, r })))
          );
          for (const s of settled) {
            serpCalls++;
            if (s.status === 'fulfilled') {
              const { t, r } = s.value;
              if (!r.searchSuccess) {
                serpErrors++;
                log('searching_sources', `SerpAPI error for ${t.name}: ${r.error}`);
              } else {
                for (const sj of r.jobsFound) ingestSerpResult(sj, t.name, t.source);
              }
            } else {
              serpErrors++;
              log('searching_sources', `SerpAPI call rejected: ${String(s.reason?.message || s.reason)}`);
            }
            processed++;
          }
          await progress.updateStep('searching_sources', { items_processed: processed, sub_step: `${processed}/${totalUnits} queries, ${foundJobs.length} matching jobs found` });
          // Tiny pause between batches as a courtesy to SerpAPI.
          if (i + PHASE_B_CONCURRENCY < targets.length) await new Promise(r2 => setTimeout(r2, 100));
        }

        // Broad per-role queries — vacuum coverage for jobs at companies
        // not yet in our DB. One call per role keyword, ~10 results each.
        for (const role of effectiveRoles) {
          if (Date.now() - runStartMs > 25 * 60 * 1000) break;
          const cleanRole = _cleanRoleLabel(role);
          if (!cleanRole) { processed++; continue; }
          const r = await searchSerpApiBroad(`"${cleanRole}" healthcare`);
          serpCalls++;
          if (!r.searchSuccess) {
            serpErrors++;
            log('searching_sources', `SerpAPI error for broad role "${role}": ${r.error}`);
          } else {
            for (const sj of r.jobsFound) ingestSerpResult(sj, '', `broad: ${role}`);
          }
          processed++;
          await progress.updateStep('searching_sources', { items_processed: processed, sub_step: `${processed}/${totalUnits} queries, ${foundJobs.length} matching jobs found` });
          await new Promise(r2 => setTimeout(r2, 150));
        }

        telem.recordSerpCalls(serpCalls);
        telem.endStep(foundJobs.length, `${targets.length} companies + ${effectiveRoles.length} broad role searches → ${foundJobs.length} matching jobs found (${serpErrors} SerpAPI errors)`);

        // ---------- Phase D: Healthcare-specific board queries (v84) ----------
        // For each board domain in HEALTHCARE_BOARDS, run one SerpAPI Google
        // Jobs query with all selected role keywords OR'd together and a
        // site: filter. Surfaces postings on physician/nurse-specific boards
        // that the default Google Jobs aggregator under-indexes.
        if (HEALTHCARE_BOARDS.length > 0 && effectiveRoles.length > 0) {
          telem.startStep('discover_healthcare_boards', HEALTHCARE_BOARDS.length);
          log('searching_sources', `Phase D: ${HEALTHCARE_BOARDS.length} healthcare-specific boards via SerpAPI site: queries`);
          const foundJobsBefore = foundJobs.length;
          let dCalls = 0, dErrors = 0;
          const perBoardCounts: Record<string, number> = {};
          // Build one OR'd role clause used across all board queries
          const roleClause = effectiveRoles
            .map(r => `"${_cleanRoleLabel(r)}"`)
            .filter(s => s.length > 2)
            .join(' OR ');
          if (roleClause) {
            for (const board of HEALTHCARE_BOARDS) {
              if (Date.now() - runStartMs > 25 * 60 * 1000) {
                log('searching_sources', `Phase D: time budget exhausted after ${dCalls} board queries`);
                break;
              }
              const before = foundJobs.length;
              const r = await searchSerpApiBroad(`(${roleClause}) site:${board}`);
              dCalls++;
              if (!r.searchSuccess) {
                dErrors++;
                log('searching_sources', `Phase D site:${board} error: ${r.error}`);
              } else {
                for (const sj of r.jobsFound) ingestSerpResult(sj, '', `board: ${board}`);
              }
              perBoardCounts[board] = foundJobs.length - before;
              await new Promise(r2 => setTimeout(r2, 150));
            }
          }
          const dAdded = foundJobs.length - foundJobsBefore;
          telem.recordSerpCalls(dCalls);
          serpCalls += dCalls;
          serpErrors += dErrors;
          const breakdown = Object.entries(perBoardCounts).filter(([,n]) => n > 0).map(([b,n]) => `${b.split('.')[0]}:${n}`).join(' ') || '(no matches)';
          log('searching_sources', `Phase D complete: ${dAdded} found jobs added from ${dCalls} board queries [${breakdown}], ${dErrors} errors`);
          telem.endStep(dAdded, `${HEALTHCARE_BOARDS.length} boards × OR'd roles, ${dAdded} found jobs added [${breakdown}], ${dErrors} errors`);
        }

        // ---------- Phase A: Direct career-page scraping (v148 reorder) ----------
        // In fast mode (deepScan=false, default), only scrape the career
        // pages of companies that already turned up at least one job in
        // Phase B/C/D — a quiet company is almost certainly one whose
        // careers page has nothing worth verifying, and scraping it is
        // the slowest serial step in the pipeline. In deep mode
        // (deepScan=true, weekly safety net), scrape every priority
        // company with a careers_url regardless — catches career-only
        // postings that never get syndicated to Google Jobs.
        // ingestSerpResult is called with { upgradeUrl: true } so that
        // when Phase A sees a job already found by SerpAPI, the career
        // page URL overwrites the aggregator URL on the existing entry.
        const companiesWithHits = new Set(
          foundJobs.map(j => (j.company || '').toLowerCase().trim())
        );
        const allCareerTargets = targets
          .map(t => ({ t, co: coMap.get(t.name.toLowerCase().trim()) }))
          .filter(x => x.co?.careers_url && String(x.co.careers_url).startsWith('http'));
        const careerTargets = deepScan
          ? allCareerTargets
          : allCareerTargets.filter(x => companiesWithHits.has(x.t.name.toLowerCase().trim()));
        const skippedQuiet = allCareerTargets.length - careerTargets.length;
        if (careerTargets.length > 0) {
          telem.startStep('scrape_career_pages', careerTargets.length);
          log('searching_sources',
            `Phase A: scraping ${careerTargets.length} career pages ` +
            `(${deepScan ? 'deep scan — every priority company' : `fast scan — skipped ${skippedQuiet} quiet companies`})`
          );
          let cpFetched = 0, cpErrors = 0;
          const cpJobsBefore = foundJobs.length;
          const atsCounts: Record<string, number> = {};
          const PHASE_A_CONCURRENCY = 5;
          for (let i = 0; i < careerTargets.length; i += PHASE_A_CONCURRENCY) {
            if (Date.now() - runStartMs > 25 * 60 * 1000) {
              log('searching_sources', `Career-page time budget exhausted after ${cpFetched} fetches`);
              break;
            }
            const batch = careerTargets.slice(i, i + PHASE_A_CONCURRENCY);
            // allSettled — one stuck or rejecting scrape can't block the
            // rest of the batch. scrapeCareerPage wraps itself in
            // withTimeout, so rejections shouldn't happen in practice,
            // but we handle them defensively anyway.
            const scraped = await Promise.allSettled(
              batch.map(({ t, co }) =>
                scrapeCareerPage(co!.careers_url, t.name).then(cp => ({ t, cp }))
              )
            );
            for (const s of scraped) {
              cpFetched++;
              if (s.status === 'fulfilled') {
                const { t, cp } = s.value;
                atsCounts[cp.ats] = (atsCounts[cp.ats] || 0) + 1;
                if (cp.error) {
                  cpErrors++;
                  log('searching_sources', `Career page failed for ${t.name} (${cp.ats}): ${cp.error}`);
                } else if (cp.jobs.length > 0) {
                  for (const cj of cp.jobs) {
                    ingestSerpResult({
                      title: cj.title,
                      company_name: t.name,
                      location: cj.location,
                      via: `${cp.ats} career page`,
                      extensions: [],
                      apply_urls: cj.url ? [cj.url] : [],
                    }, t.name, `career-page:${cp.ats}`, { upgradeUrl: true });
                  }
                }
              } else {
                cpErrors++;
                atsCounts['rejected'] = (atsCounts['rejected'] || 0) + 1;
                log('searching_sources', `Career page scrape rejected: ${String(s.reason?.message || s.reason)}`);
              }
            }
            await progress.updateStep('searching_sources', {
              sub_step: `Phase A: ${cpFetched}/${careerTargets.length} career pages, ${foundJobs.length} found jobs so far`
            });
            // Brief courtesy pause between batches.
            if (i + PHASE_A_CONCURRENCY < careerTargets.length) {
              await new Promise(r2 => setTimeout(r2, 100));
            }
          }
          const cpJobsAdded = foundJobs.length - cpJobsBefore;
          const atsBreakdown = Object.entries(atsCounts).map(([k, v]) => `${k}:${v}`).join(' ') || '(none)';
          log('searching_sources',
            `Phase A complete: ${cpFetched} pages fetched, ${cpJobsAdded} new matching jobs ` +
            `[${atsBreakdown}], ${cpErrors} errors`
          );
          telem.endStep(cpJobsAdded,
            `${cpFetched} career pages fetched [${atsBreakdown}], ${cpJobsAdded} new matching jobs ` +
            `(${cpErrors} errors, ${deepScan ? 'deep' : 'fast'} mode${deepScan ? '' : `, ${skippedQuiet} quiet companies skipped`})`
          );
        } else if (!deepScan && allCareerTargets.length > 0) {
          log('searching_sources',
            `Phase A skipped: 0/${allCareerTargets.length} priority companies had SerpAPI hits (fast mode)`
          );
        }

        log('searching_sources', `Discovery complete: ${foundJobs.length} found jobs from ${serpCalls} SerpAPI calls (${serpErrors} errors)`);
        searchPasses = 1;
        await progress.completeStep('searching_sources', `${foundJobs.length} jobs discovered via Google Jobs + healthcare boards (${serpCalls} queries)`);
        await upd({ search_passes_completed: searchPasses, new_jobs_found: foundJobs.length });

        // (Former STEP 4: VERIFICATION removed in v78 — results from
        // Google Jobs are already current postings, no separate
        // verification step needed. Stats are kept for back-compat.)
        jobsVerified = foundJobs.length;
        jobsRejected = 0;
        serpSearchCount = serpCalls;
        await upd({ jobs_verified: jobsVerified, jobs_rejected: jobsRejected });

        // STEP 5: INSERT discovered jobs
        telem.startStep('insert_found_jobs', foundJobs.length);
        await progress.startStep('deduplicating', `Inserting ${foundJobs.length} discovered jobs...`);
        await progress.updateStep('deduplicating', { items_total: foundJobs.length, items_processed: 0 });
        log('deduplicating', `Inserting ${foundJobs.length} discovered jobs from direct Google Jobs queries`);

        let processedInsert = 0;
        for (const j of foundJobs) {
          processedInsert++;
          const nt = j._normalizedTitle, dk = j._dedupKey;
          if (jKeys.has(dk)) {
            const id = jKeyToId.get(dk);
            if (id) reseenIds.add(id);
            dupes++; continue;
          }
          jKeys.add(dk);
          const cat = catCo(j.company);

          let co = coMap.get(j.company.toLowerCase().trim());
          let cid = co?.id;
          if (!cid) {
            const { data: nc } = await supabase.from('marketing_companies').insert({
              company_name: j.company, industry: cat, company_type: cat, website: '', status: 'New',
              source: 'Google Jobs Direct', is_recurring_source: true, role_types_hired: nt,
              last_searched_at: new Date().toISOString()
            }).select('*').single();
            if (nc) { cid = nc.id; coMap.set(j.company.toLowerCase().trim(), nc); coAdded++; newCos.push(j.company); log('deduplicating', `NEW COMPANY: ${j.company} (${cat})`); }
          } else {
            const u: any = {};
            if (co.role_types_hired && !co.role_types_hired.includes(nt)) u.role_types_hired = `${co.role_types_hired}, ${nt}`;
            else if (!co.role_types_hired) u.role_types_hired = nt;
            if (Object.keys(u).length > 0) await supabase.from('marketing_companies').update(u).eq('id', cid);
          }
          if (!cid) continue;

          const directUrl = j._verifiedUrl && isDirectJobUrl(j._verifiedUrl) ? j._verifiedUrl : null;
          const { error } = await supabase.from('marketing_jobs').insert({
            company_id: cid, company_name: j.company, job_title: nt, job_type: nt, job_category: cat,
            city: j.city || '', state: j.state || '', location: j.city && j.state ? `${j.city}, ${j.state}` : '',
            job_url: directUrl, indeed_url: buildIndeedUrl(nt, j.company, j.city, j.state),
            linkedin_url: buildLinkedInUrl(nt, j.company), google_jobs_url: buildGoogleJobsUrl(nt, j.company, j.city, j.state),
            opportunity_type: 'Business Development Opportunity', status: 'Open',
            source: `${j.source_found} - ${new Date().toISOString().split('T')[0]}`,
            date_posted: new Date().toISOString(), is_net_new: true, tracker_run_id: rid,
            url_status: 'live',
            url_check_result: (j._verifyReason || '').substring(0, 500),
            last_url_check: new Date().toISOString()
          });
          if (!error) { added++; roleB[nt] = (roleB[nt] || 0) + 1; }
          if (processedInsert % 10 === 0) await progress.updateStep('deduplicating', { items_processed: processedInsert, sub_step: `Inserted ${added}/${foundJobs.length} jobs (${coAdded} new companies)` });
        }
        log('deduplicating', `Added ${added} jobs from direct Google Jobs discovery, ${coAdded} new companies`);
        telem.endStep(added, `${foundJobs.length} found jobs → ${added} jobs inserted, ${coAdded} new companies`);
        await progress.completeStep('deduplicating', `${added} jobs added, ${coAdded} new companies`);
        await upd({ new_jobs_added: added, duplicates_skipped: dupes, new_companies_added: coAdded, new_roles_by_type: roleB });
      }

      // STEP 6 (CONTACTS) removed in v90. Contact enrichment now runs as
      // a separate action from the Contacts tab and Companies tab via the
      // `find-contacts` edge function, so the Tracker only does job
      // discovery / dedup / insertion.
      await progress.skipStep('enriching_contacts');
    } else {
      await progress.skipStep('searching_sources');
      await progress.skipStep('deduplicating');
      await progress.skipStep('enriching_contacts');
    }

    // Refresh last_seen_at on every job the scraper re-encountered this
    // run. Single bulk UPDATE chunked at 200 ids/call to stay well under
    // PostgREST URL length limits. This drives the recency component of
    // priority_score — jobs still listed at their source today get a
    // fresh score, regardless of how old the original row is.
    if (reseenIds.size > 0) {
      const ids = Array.from(reseenIds);
      const nowIso = new Date().toISOString();
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase.from('marketing_jobs')
          .update({ last_seen_at: nowIso, tracker_run_id: rid })
          .in('id', chunk);
        if (error) {
          console.warn('last_seen_at bulk update failed:', error.message);
          break;
        }
      }
      log('deduplicating', `Refreshed last_seen_at on ${ids.length} re-encountered jobs`);
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
      progress: progress.getState(),
      telemetry: telem.snapshot(),
    }).eq('id', rid);

  } catch (error) {
    console.error('Tracker process error:', error);
    logs.push({ step: 'error', msg: `Fatal error: ${(error as Error).message}`, ts: new Date().toISOString() });
    await supabase.from('tracker_runs').update({
      status: 'failed', current_step: 'error', completed_at: new Date().toISOString(),
      execution_log: logs, error_message: (error as Error).message,
      jobs_verified: jobsVerified, jobs_rejected: jobsRejected, progress: progress.getState(),
      telemetry: telem.snapshot(),
    }).eq('id', rid);
  }
}

// ============================================================
// HTTP HANDLER
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  try {
    await cleanupStaleRuns();
    const body = await req.json().catch(() => ({}));
    const { action = 'full', jobTitles = [], priorityOrgs = [], deepScan = false } = body;

    // ------------------------------------------------------------------
    // ONE-SHOT BACKFILL ACTION (v81)
    // For each company that has a careers_url, scrape that page and try
    // to find a matching posting for every existing marketing_jobs row at
    // that company. If a match is found, swap the row's job_url to the
    // career-page URL.
    //
    // Synchronous, batched. Body params: { action: 'backfill_career_urls',
    // limit?: number, offset?: number }. Returns a summary + next_offset
    // so the caller can paginate through all companies.
    // ------------------------------------------------------------------
    // Debug: run a single SerpAPI Google Jobs query and return the raw
    // response so we can see what's actually coming back (including any
    // error string from the helper).
    if (action === 'debug_serp_query') {
      const q = body.q || body.query || '';
      if (!q) return new Response(JSON.stringify({ success: false, error: 'q required' }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
      const r = await searchSerpApiBroad(q);
      return new Response(JSON.stringify({
        success: true, query: q, searchSuccess: r.searchSuccess, error: r.error,
        jobsFound: r.jobsFound.length,
        sample: r.jobsFound.slice(0, 3).map(j => ({ title: j.title, company: j.company_name, location: j.location, via: j.via, apply_urls: j.apply_urls }))
      }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    }

    // Debug helper: scrape a single career URL and return the extracted
    // job list verbatim. Lets us see exactly what scrapeCareerPage is
    // pulling out without doing any DB writes.
    if (action === 'debug_scrape_career_page') {
      const debugUrl = body.url;
      if (!debugUrl) return new Response(JSON.stringify({ success: false, error: 'url required' }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
      const r = await scrapeCareerPage(debugUrl, body.company || '');
      return new Response(JSON.stringify({ success: true, url: debugUrl, ats: r.ats, error: r.error, count: r.jobs.length, jobs: r.jobs }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    }

    // ------------------------------------------------------------------
    // SERPAPI-DRIVEN BACKFILL (v83)
    // For each existing marketing_jobs row whose job_url is currently a
    // job-board aggregator (Indeed, LinkedIn, Google Jobs search etc),
    // run a Google Jobs query for "<title>" "<company>" and look at the
    // apply_options URLs. If any of them is on the company's careers
    // domain, swap that into job_url. ~$0.01 per job examined.
    // ------------------------------------------------------------------
    if (action === 'backfill_via_serpapi') {
      const startMs = Date.now();
      const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const R = (o: any) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });

      const serpKey = Deno.env.get("SERP_API_KEY");
      if (!serpKey) return R({ success: false, error: 'SERP_API_KEY not configured' });

      const { data: jobs, error: jobErr } = await supabase
        .from('marketing_jobs')
        .select('id, company_id, job_title, company_name, city, state, job_url')
        .not('job_title', 'is', null)
        .not('company_name', 'is', null)
        .order('id')
        .range(offset, offset + limit - 1);
      if (jobErr) return R({ success: false, error: jobErr.message });
      if (!jobs || jobs.length === 0) {
        return R({ success: true, message: 'No more jobs', companies_processed: 0, done: true, next_offset: offset });
      }

      // Build company_id -> careers_url map for these jobs
      const cids = [...new Set(jobs.map(j => j.company_id).filter(Boolean))] as string[];
      const { data: companies } = await supabase
        .from('marketing_companies')
        .select('id, careers_url')
        .in('id', cids);
      const careersByCo = new Map<string, string>();
      for (const c of companies || []) {
        if (c.careers_url && String(c.careers_url).startsWith('http')) careersByCo.set(c.id, c.careers_url);
      }

      const hostOf = (u: string): string => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
      const registered = (h: string): string => h.split('.').slice(-2).join('.');

      let examined = 0, serpCalls = 0, updated = 0, noResults = 0, noCareerHit = 0, alreadyOk = 0, noCareersUrl = 0, errors = 0;
      const updates: any[] = [];

      for (const job of jobs) {
        if (Date.now() - startMs > 45000) break;
        examined++;
        const careersUrl = job.company_id ? careersByCo.get(job.company_id) : undefined;
        if (!careersUrl) { noCareersUrl++; continue; }
        const careersHost = hostOf(careersUrl);
        if (!careersHost) { noCareersUrl++; continue; }
        const careersDomain = registered(careersHost);

        // If the job already has a URL on the careers domain, skip.
        if (job.job_url) {
          const cur = hostOf(job.job_url);
          if (cur && (cur === careersHost || cur.endsWith('.' + careersDomain) || cur === careersDomain)) {
            alreadyOk++; continue;
          }
        }

        const q = `"${job.job_title}" "${job.company_name}"`;
        const r = await searchSerpApiBroad(q);
        serpCalls++;
        if (!r.searchSuccess) { errors++; continue; }
        if (r.jobsFound.length === 0) { noResults++; await new Promise(r2 => setTimeout(r2, 150)); continue; }

        // Walk apply_options across all returned jobs; first careers-domain
        // hit wins. Some SerpAPI results contain multiple apply_urls.
        let foundUrl = '';
        for (const sj of r.jobsFound) {
          for (const aply of sj.apply_urls || []) {
            const h = hostOf(aply);
            if (!h) continue;
            if (h === careersHost || h.endsWith('.' + careersDomain) || h === careersDomain) {
              foundUrl = aply; break;
            }
          }
          if (foundUrl) break;
        }
        if (!foundUrl) { noCareerHit++; await new Promise(r2 => setTimeout(r2, 150)); continue; }
        if (foundUrl === job.job_url) { alreadyOk++; await new Promise(r2 => setTimeout(r2, 150)); continue; }

        const { error: upErr } = await supabase
          .from('marketing_jobs')
          .update({ job_url: foundUrl, updated_at: new Date().toISOString() })
          .eq('id', job.id);
        if (upErr) { errors++; }
        else { updated++; updates.push({ id: job.id, title: job.job_title, company: job.company_name, new_url: foundUrl }); }

        await new Promise(r2 => setTimeout(r2, 150));
      }

      const { count: total } = await supabase.from('marketing_jobs').select('id', { count: 'exact', head: true });
      const next_offset = offset + examined;
      return R({
        success: true,
        elapsed_ms: Date.now() - startMs,
        examined, serp_calls: serpCalls, updated,
        already_ok: alreadyOk,
        no_results: noResults,
        no_career_hit: noCareerHit,
        no_careers_url: noCareersUrl,
        errors,
        estimated_cost_usd: Number((serpCalls * 0.01).toFixed(2)),
        next_offset, total_jobs: total,
        done: next_offset >= (total || 0),
        sample_updates: updates.slice(0, 15),
      });
    }
    // ------------------------------------------------------------------

    if (action === 'backfill_career_urls') {
      const startMs = Date.now();
      const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 100);
      const offset = Math.max(Number(body.offset) || 0, 0);
      const R = (o: any) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });

      const { data: companies, error: coErr } = await supabase
        .from('marketing_companies')
        .select('id, company_name, careers_url')
        .not('careers_url', 'is', null)
        .neq('careers_url', '')
        .order('company_name')
        .range(offset, offset + limit - 1);
      if (coErr) return R({ success: false, error: coErr.message });
      if (!companies || companies.length === 0) {
        return R({ success: true, message: 'No more companies to process', companies_processed: 0, done: true, next_offset: offset });
      }

      // Get total count so we can show progress.
      const { count: totalWithUrl } = await supabase
        .from('marketing_companies')
        .select('id', { count: 'exact', head: true })
        .not('careers_url', 'is', null)
        .neq('careers_url', '');

      let companiesProcessed = 0, jobsExamined = 0, jobsUpdated = 0, noMatchCount = 0, errors = 0;
      const atsCounts: Record<string, number> = {};
      const details: any[] = [];

      for (const co of companies) {
        if (Date.now() - startMs > 45000) {
          details.push({ note: `time budget exhausted after ${companiesProcessed} companies` });
          break;
        }
        const cp = await scrapeCareerPage(co.careers_url, co.company_name);
        companiesProcessed++;
        atsCounts[cp.ats] = (atsCounts[cp.ats] || 0) + 1;

        if (cp.error) {
          errors++;
          details.push({ company: co.company_name, ats: cp.ats, status: 'error', error: cp.error });
          continue;
        }
        if (cp.jobs.length === 0) {
          details.push({ company: co.company_name, ats: cp.ats, status: 'no jobs on page' });
          continue;
        }

        const { data: existingJobs } = await supabase
          .from('marketing_jobs')
          .select('id, job_title, city, state, job_url')
          .eq('company_id', co.id);
        if (!existingJobs || existingJobs.length === 0) {
          details.push({ company: co.company_name, ats: cp.ats, status: 'no existing jobs to backfill', jobs_on_page: cp.jobs.length });
          continue;
        }

        let updated = 0, noMatch = 0;
        for (const ej of existingJobs) {
          jobsExamined++;
          const matches = cp.jobs.filter(cj => fuzzyTitleMatch(cj.title, ej.job_title || ''));
          if (matches.length === 0) { noMatch++; noMatchCount++; continue; }
          // Prefer a match whose location string contains the existing job's
          // city or state, when there are multiple title matches.
          let best = matches[0];
          if (matches.length > 1 && (ej.city || ej.state)) {
            const cityLower = (ej.city || '').toLowerCase();
            const stateLower = (ej.state || '').toLowerCase();
            const locMatch = matches.find(cj => {
              const cl = (cj.location || '').toLowerCase();
              return (cityLower && cl.includes(cityLower)) || (stateLower && cl.includes(stateLower));
            });
            if (locMatch) best = locMatch;
          }
          if (best.url && best.url !== ej.job_url) {
            const { error: upErr } = await supabase
              .from('marketing_jobs')
              .update({ job_url: best.url, updated_at: new Date().toISOString() })
              .eq('id', ej.id);
            if (!upErr) { updated++; jobsUpdated++; }
          }
        }
        details.push({ company: co.company_name, ats: cp.ats, jobs_on_page: cp.jobs.length, existing_jobs: existingJobs.length, updated, no_match: noMatch });
        await new Promise(r => setTimeout(r, 200));
      }

      const next_offset = offset + companiesProcessed;
      const done = !!(totalWithUrl !== null && next_offset >= (totalWithUrl || 0));
      return R({
        success: true,
        elapsed_ms: Date.now() - startMs,
        companies_processed: companiesProcessed,
        jobs_examined: jobsExamined,
        jobs_updated: jobsUpdated,
        no_match_count: noMatchCount,
        errors,
        ats_breakdown: atsCounts,
        next_offset,
        total_companies_with_url: totalWithUrl,
        done,
        details,
      });
    }
    // ------------------------------------------------------------------

    const safeJobTitles: string[] = Array.isArray(jobTitles)
      ? jobTitles.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const safePriorityOrgs: string[] = Array.isArray(priorityOrgs)
      ? priorityOrgs.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const oa = Deno.env.get("OPENAI_API_KEY");
    if (!oa) throw new Error("OPENAI_API_KEY missing");

    const { data: run, error: runErr } = await supabase.from('tracker_runs').insert({
      run_type: action, status: 'running', current_step: 'loading', started_at: new Date().toISOString(),
      progress: { percent: 0, current_step: 'loading', current_sub_step: 'Initializing...', steps: {}, run_started_at: new Date().toISOString() }
    }).select('id').single();
    if (runErr || !run) throw new Error(`Failed to create tracker run: ${runErr?.message || 'unknown'}`);

    const rid = run.id;
    runTrackerProcess(rid, action, oa, safeJobTitles, safePriorityOrgs, !!deepScan).catch(err => {
      console.error('Background process crashed:', err);
      supabase.from('tracker_runs').update({ status: 'failed', current_step: 'error', completed_at: new Date().toISOString(), error_message: `Background crash: ${err.message}` }).eq('id', rid);
    });

    return new Response(JSON.stringify({ success: true, run_id: rid, message: 'Tracker started. Poll tracker_runs table for progress.' }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
  } catch (error) {
    console.error('Tracker startup error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message, success: false }), { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
  }
});