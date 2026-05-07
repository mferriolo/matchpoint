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

function log(level: string, step: string, message: string, data?: any) {
  const entry = { ts: new Date().toISOString(), level, step, message, ...(data ? { data } : {}) };
  if (level === 'ERROR') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

function jsonResp(data: any, status = 200, req?: Request) {
  const cors = req ? getCorsHeaders(req) : { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function getSupabaseClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function checkUrlAlive(url: string, timeoutMs = 6000): Promise<{ alive: boolean; status: number; redirectUrl?: string }> {
  if (!url || !url.startsWith('http')) return { alive: false, status: 0 };
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(url, { method: 'HEAD', signal: c.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    clearTimeout(t);
    return { alive: r.ok, status: r.status, redirectUrl: r.url !== url ? r.url : undefined };
  } catch {
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), timeoutMs);
      const r2 = await fetch(url, { method: 'GET', signal: c2.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } });
      clearTimeout(t2);
      await r2.text().catch(() => {});
      return { alive: r2.ok, status: r2.status };
    } catch { return { alive: false, status: 0 }; }
  }
}

const JOB_URL_KEYWORDS = ['indeed.com','linkedin.com/jobs','glassdoor.com/job','ziprecruiter.com','doccafe.com','healthecareers.com','practicelink.com','myworkdayjobs.com','icims.com','lever.co/','greenhouse.io/','jobvite.com/','smartrecruiters.com/','workday.com/','/careers/','/jobs/','/job/','/career/','/opening/','/position/','/apply/'];

function isJobUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  const l = url.toLowerCase();
  if (l.includes('google.com') || l.includes('wikipedia.org')) return false;
  for (const kw of JOB_URL_KEYWORDS) { if (l.includes(kw)) return true; }
  return false;
}

// ---- SERPAPI ----
interface SerpJob { title: string; company_name: string; location: string; via: string; description: string; extensions: string[]; apply_options?: Array<{ link: string; title: string }>; }
interface SerpResult { success: boolean; jobs: SerpJob[]; applyUrls: string[]; error?: string; }

async function searchSerpApiJobs(company: string, jobTitle: string, city?: string, state?: string): Promise<SerpResult> {
  const key = Deno.env.get("SERP_API_KEY");
  if (!key) return { success: false, jobs: [], applyUrls: [], error: 'no key' };
  try {
    const q = `"${company}" ${jobTitle}`;
    const loc = city && state ? `${city}, ${state}` : state || '';
    const params = new URLSearchParams({ engine: 'google_jobs', q, api_key: key, hl: 'en', gl: 'us' });
    if (loc) params.set('location', loc);
    const url = `https://serpapi.com/search.json?${params}`;
    log('INFO', 'serp:jobs', `Query: "${q}" loc="${loc}"`);
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(url, { signal: c.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (!r.ok) { const e = await r.text().catch(() => ''); log('ERROR', 'serp:jobs', `HTTP ${r.status}`); return { success: false, jobs: [], applyUrls: [], error: `HTTP ${r.status}` }; }
    const d = await r.json();
    const jobs: SerpJob[] = (d.jobs_results || []).map((j: any) => ({
      title: j.title || '', company_name: j.company_name || '', location: j.location || '', via: j.via || '',
      description: (j.description || '').substring(0, 500), extensions: j.extensions || [],
      apply_options: (j.apply_options || []).map((ao: any) => ({ link: ao.link || '', title: ao.title || '' })),
    }));
    const applyUrls: string[] = [];
    for (const j of jobs) { for (const ao of (j.apply_options || [])) { if (ao.link?.startsWith('http')) applyUrls.push(ao.link); } }
    log('INFO', 'serp:jobs', `Found ${jobs.length} jobs, ${applyUrls.length} apply URLs`);
    return { success: true, jobs, applyUrls };
  } catch (e: any) { log('ERROR', 'serp:jobs', e.message); return { success: false, jobs: [], applyUrls: [], error: e.message }; }
}

async function searchSerpApiWeb(company: string, jobTitle: string): Promise<{ success: boolean; urls: string[] }> {
  const key = Deno.env.get("SERP_API_KEY");
  if (!key) return { success: false, urls: [] };
  try {
    const params = new URLSearchParams({ engine: 'google', q: `${company} careers jobs ${jobTitle}`, api_key: key, hl: 'en', gl: 'us', num: '5' });
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(`https://serpapi.com/search.json?${params}`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return { success: false, urls: [] };
    const d = await r.json();
    const urls = (d.organic_results || []).map((r: any) => r.link).filter((u: string) => u?.startsWith('http'));
    log('INFO', 'serp:web', `Found ${urls.length} web URLs`);
    return { success: true, urls };
  } catch (e: any) { log('ERROR', 'serp:web', e.message); return { success: false, urls: [] }; }
}

function analyzeSerpResults(serpJobs: SerpJob[], targetCompany: string, targetTitle: string) {
  const compLow = targetCompany.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const titleLow = targetTitle.toLowerCase();
  const matching: SerpJob[] = [];
  const allUrls: string[] = [];
  let bestUrl = '';
  let companyFound = false;
  let exactMatch = false;

  for (const j of serpJobs) {
    const jcl = j.company_name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const compMatch = jcl.includes(compLow) || compLow.includes(jcl) || compLow.split(/\s+/).filter(w => w.length > 2).some(w => jcl.includes(w));
    if (compMatch) {
      companyFound = true;
      matching.push(j);
      const titleKws = titleLow.split(/\s+/).filter(w => w.length > 2 && !['the','and','for','with'].includes(w));
      const score = titleKws.filter(kw => j.title.toLowerCase().includes(kw)).length / Math.max(titleKws.length, 1);
      if (score >= 0.5) exactMatch = true;
      for (const ao of (j.apply_options || [])) {
        if (ao.link?.startsWith('http')) { allUrls.push(ao.link); if (!bestUrl || isJobUrl(ao.link)) bestUrl = ao.link; }
      }
    }
  }
  return { matching, bestUrl, allUrls, companyFound, exactMatch };
}

// ---- HANDLERS ----

async function handleHealthCheck(): Promise<Response> {
  log('INFO', 'health', 'Health check');
  const sb = getSupabaseClient();
  let dbOk = false;
  try { const { error } = await sb.from('job_verification_queue').select('id').limit(1); dbOk = !error; } catch { dbOk = false; }
  const serpKey = Deno.env.get("SERP_API_KEY");
  let serpStatus = 'not_configured';
  if (serpKey) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000);
      const r = await fetch(`https://serpapi.com/account.json?api_key=${serpKey}`, { signal: c.signal });
      clearTimeout(t);
      if (r.ok) { const a = await r.json(); serpStatus = `connected (${a.total_searches_left ?? '?'} searches left)`; }
      else serpStatus = `error (HTTP ${r.status})`;
    } catch (e: any) { serpStatus = `error (${e.message})`; }
  }
  return jsonResp({
    status: 'ok', timestamp: new Date().toISOString(),
    services: { database: dbOk ? 'connected' : 'error', openai: Deno.env.get("OPENAI_API_KEY") ? 'configured' : 'missing', serpapi: serpStatus },
  });
}

async function handleEnqueue(body: any): Promise<Response> {
  const start = Date.now();
  const jobs = body.jobs;
  if (!jobs?.length) return jsonResp({ error: 'jobs array required' }, 400);
  const runId = crypto.randomUUID();
  const sb = getSupabaseClient();
  const rows = jobs.map((j: any) => ({ run_id: runId, job_id: j.id, job_title: (j.job_title || '').substring(0, 500), company_name: (j.company_name || '').substring(0, 500), city: j.city || null, state: j.state || null, existing_url: j.job_url || j.website_source || null, status: 'pending' }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb.from('job_verification_queue').insert(chunk);
    if (error) { log('ERROR', 'enqueue', error.message); return jsonResp({ error: error.message }, 500); }
    inserted += chunk.length;
  }
  const serpKey = Deno.env.get("SERP_API_KEY");
  const mode = serpKey ? 'serp_api+ai' : 'ai_only';
  log('INFO', 'enqueue', `Queued ${inserted} jobs (${mode})`, { runId });
  return jsonResp({ run_id: runId, total_queued: inserted, search_mode: mode, message: `${inserted} jobs queued (${mode === 'serp_api+ai' ? 'live search + AI' : 'AI-only'})` });
}

async function handleProcessNext(body: any): Promise<Response> {
  const start = Date.now();
  const runId = body.run_id;
  if (!runId) return jsonResp({ error: 'run_id required' }, 400);
  // v2: cap raised 8→16 — each per-item branch (HEAD + SerpAPI + web
  // SerpAPI) now runs in parallel inside processOneQueueItem, so the
  // wall-clock per item is ~half what it used to be and we have budget
  // for more parallel items per call. The client also fans out 3
  // concurrent process-next loops which is only safe because the claim
  // step below is now atomic via SQL RPC.
  const batchSize = Math.min(Math.max(Number(body.batch_size) || 1, 1), 16);
  const sb = getSupabaseClient();

  // Atomic batch claim. claim_verification_queue_batch wraps the
  // SELECT + UPDATE in a single statement with FOR UPDATE SKIP LOCKED,
  // so two concurrent callers can't both grab the same rows and burn
  // double the SerpAPI + OpenAI budget. (Migration:
  // 20260507130000_claim_verification_queue_batch.sql.)
  const { data: pending, error: fetchErr } = await sb.rpc('claim_verification_queue_batch', {
    p_run_id: runId,
    p_batch_size: batchSize,
  });
  if (fetchErr) return jsonResp({ error: fetchErr.message }, 500);
  if (!pending?.length) return jsonResp({ done: true, message: 'No more pending jobs' });
  log('INFO', 'process', `Claimed ${pending.length} item${pending.length === 1 ? '' : 's'}`);

  const results = await Promise.all(pending.map((qi: any) => processOneQueueItem(sb, qi)));

  // Backward-compat: single-item callers see the same `result` field as
  // before. Batch callers also get the full `results` array.
  return jsonResp({
    done: false,
    result: results[0],
    results,
    elapsed_ms: Date.now() - start,
  });
}

async function processOneQueueItem(sb: any, qi: any): Promise<any> {
  const start = Date.now();
  const queueId = qi.id, jobId = qi.job_id;
  const jobTitle = (qi.job_title || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const company = qi.company_name || '', existingUrl = qi.existing_url || '';
  const city = qi.city || '', state = qi.state || '';

  try {
    // v2: HEAD existing-URL probe runs in parallel with the SerpAPI
    // Google Jobs query — they're independent and were the dominant
    // wait per item. Roughly halves wall-clock per queue item.
    const serpKey = Deno.env.get("SERP_API_KEY");
    let searchMode = serpKey ? 'serp_api+ai' : 'ai_only';

    const headProbe: Promise<{ alive: boolean; status?: number }> = existingUrl?.startsWith('http')
      ? checkUrlAlive(existingUrl).catch(() => ({ alive: false }))
      : Promise.resolve({ alive: false });
    const jobsProbe: Promise<SerpResult | null> = serpKey
      ? searchSerpApiJobs(company, jobTitle, city, state).catch(() => null)
      : Promise.resolve(null);

    const [urlCheck, serpResult] = await Promise.all([headProbe, jobsProbe]);
    const existingAlive = urlCheck.alive;
    if (existingUrl?.startsWith('http')) {
      log('INFO', 'process:url', `Existing URL ${existingAlive ? 'ALIVE' : 'DEAD'} (${urlCheck.status ?? '?'})`);
    }

    let serpWebUrls: string[] = [];
    let serpAnalysis: ReturnType<typeof analyzeSerpResults> | null = null;

    if (serpResult?.success && serpResult.jobs.length > 0) {
      serpAnalysis = analyzeSerpResults(serpResult.jobs, company, jobTitle);
      log('INFO', 'process:serp', `Analysis: found=${serpAnalysis.companyFound}, exact=${serpAnalysis.exactMatch}, matching=${serpAnalysis.matching.length}`);
    } else if (serpKey && (!serpResult?.success || serpResult.jobs.length === 0)) {
      // Web fallback only fires when the Jobs query came back empty.
      // Sequential by design — there's no point starting it before we
      // know the Jobs query missed.
      const webR = await searchSerpApiWeb(company, jobTitle).catch(() => null);
      if (webR?.success) serpWebUrls = webR.urls;
    }

    // Build AI prompt with search context
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      await updateQueueItem(sb, queueId, jobId, { status: 'failed', error_message: 'No OpenAI key', details: 'Config error', source: 'config_error' });
      return { id: jobId, source: 'config_error', is_live: false, details: 'OpenAI not configured' };
    }

    let searchCtx = '';
    if (serpAnalysis && serpAnalysis.matching.length > 0) {
      searchCtx = `\n\nLIVE SEARCH RESULTS (Google Jobs, just now):\nFound ${serpAnalysis.matching.length} matching job(s) from "${company}":\n`;
      for (const sj of serpAnalysis.matching.slice(0, 5)) {
        searchCtx += `- "${sj.title}" at ${sj.company_name} (${sj.location}) via ${sj.via}`;
        if (sj.extensions.length) searchCtx += ` [${sj.extensions.slice(0, 3).join(', ')}]`;
        searchCtx += '\n';
        if (sj.apply_options?.length) searchCtx += `  Apply: ${sj.apply_options.map(ao => ao.link).join(', ')}\n`;
      }
      if (serpAnalysis.exactMatch) searchCtx += `NOTE: Exact/near-exact title match found in live results.\n`;
    } else if (serpResult?.success && serpResult.jobs.length > 0) {
      searchCtx = `\n\nLIVE SEARCH: Found ${serpResult.jobs.length} jobs but NONE from "${company}". Top results:\n`;
      for (const sj of serpResult.jobs.slice(0, 3)) searchCtx += `- "${sj.title}" at ${sj.company_name}\n`;
      searchCtx += `No jobs from "${company}" in current listings.\n`;
    } else if (serpResult?.success && serpResult.jobs.length === 0) {
      searchCtx = `\n\nLIVE SEARCH: No Google Jobs results for "${company}" + "${jobTitle}". Job may not be currently posted.\n`;
    } else if (serpWebUrls.length > 0) {
      searchCtx = `\n\nWEB SEARCH for "${company} careers":\n${serpWebUrls.slice(0, 5).map(u => `- ${u}`).join('\n')}\n`;
    }

    const urlCtx = existingUrl ? `URL on file: ${existingUrl} (${existingAlive ? 'reachable' : 'dead'}).` : 'No URL on file.';
    const hasSearch = searchCtx.length > 0;

    const prompt = `Healthcare job verification. Is this job active?

Company: "${company}"
Job Title: "${jobTitle}"
Location: ${city || '?'}, ${state || '?'}
${urlCtx}${searchCtx}

${hasSearch ? 'Use LIVE search results as PRIMARY evidence. Company in live results = likely LIVE.' : 'No live search data. Use your knowledge of healthcare organizations.'}

Reply in ONE line: VERDICT|BEST_URL|REASON
- VERDICT: LIVE or DEAD
- BEST_URL: best job URL (from search apply links if available, or company careers page). Must start with https://
- REASON: brief explanation (max 150 chars)

LIVE = real active healthcare org plausibly hiring this role. DEAD = company doesn't exist, closed, or role nonsensical.`;

    let verdict = 'DEAD', bestUrlAi = '', reason = 'AI unavailable';
    let aiOk = false;

    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: c.signal,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 250 }),
      });
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json();
        const txt = (d?.choices?.[0]?.message?.content || '').trim();
        log('INFO', 'process:ai', `AI: ${txt.substring(0, 300)}`);
        const parts = txt.split('|').map((p: string) => p.trim());
        if (parts.length >= 3) { verdict = parts[0].toUpperCase().includes('LIVE') ? 'LIVE' : 'DEAD'; bestUrlAi = parts[1].startsWith('http') ? parts[1] : ''; reason = parts.slice(2).join(' ').substring(0, 500); }
        else { verdict = (parts[0] || '').toUpperCase().includes('LIVE') ? 'LIVE' : 'DEAD'; reason = parts.slice(1).join(' ').substring(0, 500) || txt.substring(0, 500); }
        aiOk = true;
      } else { log('ERROR', 'process:ai', `HTTP ${r.status}`); }
    } catch (e: any) { log('ERROR', 'process:ai', e.message); }

    if (!aiOk) {
      if (serpAnalysis?.companyFound && serpAnalysis.matching.length > 0) {
        verdict = 'LIVE'; reason = `AI failed but live search found ${serpAnalysis.matching.length} matching jobs`; bestUrlAi = serpAnalysis.bestUrl; aiOk = true; searchMode = 'serp_api_only';
      } else {
        await updateQueueItem(sb, queueId, jobId, { status: 'failed', is_live: false, ai_says_live: false, error_message: 'AI failed', details: 'AI unavailable', source: 'ai_failed' });
        return { id: jobId, job_title: jobTitle, company_name: company, is_live: false, details: 'AI failed - job unchanged', source: 'ai_failed', search_mode: searchMode };
      }
    }

    // Resolve best URL
    const aiLive = verdict === 'LIVE';
    let bestUrl = '', hasDirectUrl = false;
    const candidateUrls: string[] = [];

    if (aiLive) {
      // Priority 1: SerpAPI apply URLs
      if (serpAnalysis?.bestUrl) {
        candidateUrls.push(...serpAnalysis.allUrls);
        const ck = await checkUrlAlive(serpAnalysis.bestUrl);
        if (ck.alive) { bestUrl = serpAnalysis.bestUrl; hasDirectUrl = true; }
        else { for (const au of serpAnalysis.allUrls.slice(0, 3)) { if (au !== serpAnalysis.bestUrl) { const ck2 = await checkUrlAlive(au); if (ck2.alive) { bestUrl = au; hasDirectUrl = true; break; } } } }
      }
      // Priority 2: AI URL
      if (!hasDirectUrl && bestUrlAi) { candidateUrls.push(bestUrlAi); const ck = await checkUrlAlive(bestUrlAi); if (ck.alive) { bestUrl = bestUrlAi; hasDirectUrl = true; } }
      // Priority 3: Web search URLs
      if (!hasDirectUrl && serpWebUrls.length) { for (const wu of serpWebUrls.slice(0, 3)) { if (isJobUrl(wu)) { candidateUrls.push(wu); const ck = await checkUrlAlive(wu); if (ck.alive) { bestUrl = wu; hasDirectUrl = true; break; } } } }
      // Priority 4: Existing URL
      if (!hasDirectUrl && existingAlive && existingUrl) { bestUrl = existingUrl; hasDirectUrl = true; }
      // Priority 5: Google Jobs fallback
      if (!hasDirectUrl) { const gurl = `https://www.google.com/search?q=${encodeURIComponent(`"${company}" "${jobTitle}" job`)}&ibp=htl;jobs`; candidateUrls.push(gurl); bestUrl = gurl; hasDirectUrl = true; }
    }

    const now = new Date().toISOString();
    const tag = searchMode === 'serp_api+ai' ? '[SerpAPI+AI]' : searchMode === 'serp_api_only' ? '[SerpAPI]' : '[AI-only]';
    const fullReason = `${tag} ${reason}`;

    log('INFO', 'process:verdict', `${aiLive ? 'LIVE' : 'DEAD'} (${searchMode})`, { bestUrl: bestUrl.substring(0, 100), serpJobs: serpResult?.jobs?.length || 0, matching: serpAnalysis?.matching?.length || 0, elapsed: Date.now() - start });

    // Update marketing_jobs
    try {
      if (aiLive) {
        const upd: any = { url_status: 'live', url_check_result: `Verified: ${fullReason}`.substring(0, 500), last_url_check: now, updated_at: now };
        if (bestUrl && !bestUrl.includes('google.com/search') && isJobUrl(bestUrl)) upd.job_url = bestUrl;
        if (bestUrl.includes('google.com/search')) upd.google_jobs_url = bestUrl;
        await sb.from('marketing_jobs').update(upd).eq('id', jobId);
      } else {
        // C3 fix: Don't auto-close based on AI alone — flag for human review
        await sb.from('marketing_jobs').update({ url_status: 'flagged_dead', url_check_result: `Needs review: ${fullReason}`.substring(0, 500), last_url_check: now, updated_at: now }).eq('id', jobId);
      }
    } catch (e: any) { log('ERROR', 'process:db', e.message); }

    await updateQueueItem(sb, queueId, jobId, { status: 'completed', is_live: aiLive, ai_says_live: aiLive, has_direct_url: hasDirectUrl, found_url: bestUrl, candidate_urls: candidateUrls, details: fullReason, source: searchMode === 'ai_only' ? 'ai_verified' : 'serp_verified' });

    return { id: jobId, job_title: jobTitle, company_name: company, is_live: aiLive, ai_says_live: aiLive, has_direct_url: hasDirectUrl, details: fullReason, source: searchMode === 'ai_only' ? 'ai_verified' : 'serp_verified', search_mode: searchMode, found_url: bestUrl, candidate_urls: candidateUrls, serp_jobs_found: serpResult?.jobs?.length || 0, serp_matching_jobs: serpAnalysis?.matching?.length || 0, elapsed_ms: Date.now() - start };
  } catch (err: any) {
    log('ERROR', 'process:fatal', err.message, { stack: err.stack?.substring(0, 500) });
    try { await sb.from('job_verification_queue').update({ status: 'failed', error_message: err.message?.substring(0, 1000), completed_at: new Date().toISOString() }).eq('id', queueId); } catch {}
    return { id: jobId, job_title: jobTitle, company_name: company, is_live: false, details: `Error: ${err.message}`, source: 'error', search_mode: 'error', elapsed_ms: Date.now() - start };
  }
}

async function updateQueueItem(sb: any, queueId: string, _jobId: string, data: any) {
  try {
    await sb.from('job_verification_queue').update({ ...data, candidate_urls: data.candidate_urls ? JSON.stringify(data.candidate_urls) : '[]', completed_at: new Date().toISOString() }).eq('id', queueId);
  } catch (e: any) { log('ERROR', 'queue-update', e.message); }
}

async function handleStatus(body: any): Promise<Response> {
  const runId = body.run_id;
  if (!runId) return jsonResp({ error: 'run_id required' }, 400);
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('job_verification_queue').select('status, is_live, ai_says_live, has_direct_url, found_url, details, source, error_message').eq('run_id', runId);
  if (error) return jsonResp({ error: error.message }, 500);
  const items = data || [];
  const counts = { total: items.length, pending: items.filter((i: any) => i.status === 'pending').length, processing: items.filter((i: any) => i.status === 'processing').length, completed: items.filter((i: any) => i.status === 'completed').length, failed: items.filter((i: any) => i.status === 'failed').length, live: items.filter((i: any) => i.is_live === true).length, dead: items.filter((i: any) => i.status === 'completed' && i.is_live === false).length, urls_found: items.filter((i: any) => i.has_direct_url === true).length };
  return jsonResp({ run_id: runId, counts, is_done: counts.pending === 0 && counts.processing === 0 });
}

async function handleCleanup(body: any): Promise<Response> {
  const sb = getSupabaseClient();
  if (body.run_id) { await sb.from('job_verification_queue').delete().eq('run_id', body.run_id); }
  else { const cutoff = new Date(Date.now() - 86400000).toISOString(); await sb.from('job_verification_queue').delete().lt('created_at', cutoff); }
  return jsonResp({ message: 'Cleanup complete' });
}

async function handleLegacyVerify(body: any): Promise<Response> {
  const jobs = body.jobs;
  if (!jobs?.length) return jsonResp({ error: 'jobs array required' }, 400);
  const job = jobs[0], start = Date.now();
  const jobId = job.id || 'unknown', jobTitle = (job.job_title || '').replace(/\s*\(.*?\)\s*/g, ' ').trim(), company = job.company_name || '';
  const serpKey = Deno.env.get("SERP_API_KEY");
  let serpCtx = '', mode = 'ai_only';
  if (serpKey) {
    mode = 'serp_api+ai';
    const sr = await searchSerpApiJobs(company, jobTitle, job.city, job.state);
    if (sr.success && sr.jobs.length > 0) { const a = analyzeSerpResults(sr.jobs, company, jobTitle); serpCtx = a.matching.length > 0 ? `Live search: ${a.matching.length} matching jobs found.` : `Live search: ${sr.jobs.length} results, none from ${company}.`; }
  }
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return jsonResp({ total: 1, live_count: 0, dead_count: 0, results: [{ id: jobId, is_live: false, details: 'No OpenAI key', source: 'config_error' }], live_job_ids: [], dead_job_ids: [], elapsed_ms: Date.now() - start });
  let live = false, reason = 'AI unavailable';
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: c.signal, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: `Is "${company}" hiring "${jobTitle}" in ${job.city || '?'}, ${job.state || '?'}?${serpCtx ? ' ' + serpCtx : ''}\nReply: LIVE|reason OR DEAD|reason` }], temperature: 0.1, max_tokens: 150 }) });
    clearTimeout(t);
    if (r.ok) { const d = await r.json(); const txt = (d?.choices?.[0]?.message?.content || '').trim(); const parts = txt.split('|'); live = (parts[0] || '').toUpperCase().includes('LIVE'); reason = parts.slice(1).join(' ').substring(0, 300) || txt.substring(0, 300); }
  } catch (e: any) { return jsonResp({ total: 1, live_count: 0, dead_count: 0, results: [{ id: jobId, is_live: false, details: 'AI failed', source: 'ai_failed' }], live_job_ids: [], dead_job_ids: [], elapsed_ms: Date.now() - start }); }
  const sb = getSupabaseClient(); const now = new Date().toISOString(); const tag = mode === 'serp_api+ai' ? '[SerpAPI+AI]' : '[AI-only]';
  try { if (live) await sb.from('marketing_jobs').update({ url_status: 'live', url_check_result: `${tag} ${reason}`.substring(0, 500), last_url_check: now, updated_at: now }).eq('id', jobId); else await sb.from('marketing_jobs').update({ url_status: 'flagged_dead', url_check_result: `Needs review ${tag}: ${reason}`.substring(0, 500), last_url_check: now, updated_at: now }).eq('id', jobId); } catch {}
  return jsonResp({ total: 1, live_count: live ? 1 : 0, dead_count: live ? 0 : 1, results: [{ id: jobId, job_title: jobTitle, company_name: company, is_live: live, details: reason, source: mode === 'ai_only' ? 'ai_verified' : 'serp_verified', search_mode: mode }], live_job_ids: live ? [jobId] : [], dead_job_ids: live ? [] : [jobId], elapsed_ms: Date.now() - start });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  if (req.method === 'GET') { try { return await handleHealthCheck(); } catch (e: any) { return jsonResp({ status: 'error', message: e.message }, 500); } }
  if (req.method === 'POST') {
    let body: any;
    try { body = await req.json(); } catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
    const action = body.action;
    log('INFO', 'router', `Action: ${action || 'legacy'}`);
    try {
      switch (action) {
        case 'enqueue': return await handleEnqueue(body);
        case 'process-next': return await handleProcessNext(body);
        case 'status': return await handleStatus(body);
        case 'cleanup': return await handleCleanup(body);
        default: if (body.jobs) return await handleLegacyVerify(body); return jsonResp({ error: 'Unknown action' }, 400);
      }
    } catch (e: any) { log('ERROR', 'handler', e.message); return jsonResp({ error: e.message }, 500); }
  }
  return jsonResp({ error: 'Method not allowed' }, 405);
});