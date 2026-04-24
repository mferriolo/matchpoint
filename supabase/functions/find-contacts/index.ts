
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

// find-contacts — discovery-only. We ONLY read the company's own About /
// Team / Leadership pages and LinkedIn via SerpAPI. No Apollo, no
// Crelate, no Hunter, no AI brainstorm — those all cross-contaminated
// contacts with wrong-company info and produced duplicates. Enrichment
// (email/phone fill-in) lives entirely in the enrich-contacts function
// and runs only when the user clicks "Enrich Selected".
//
// Every candidate is filtered through matchesTargetTitle() before
// insert; we reject anything whose title doesn't contain one of the
// target keywords (Chief Medical Officer, Medical Director, Talent
// Acquisition, Human Resources, Chief of Staff, Chief Executive, CEO,
// Operating, Operations).
//
//   Request body: { mode: 'all' }
//                 { mode: 'company', companyId: '...' }
//
// Background-runs via EdgeRuntime.waitUntil; the client polls
// contact_runs for live progress (see MarketingNewJobs.tsx).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };


const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SERP_BASE = "https://serpapi.com/search.json";

// Target-title keywords. A candidate's title is accepted if it
// case-insensitively contains ANY of these substrings. Ordered so the
// more-specific phrases appear before the broader ones (purely for
// readability; matching is order-independent).
const TARGET_TITLE_KEYWORDS = [
  'chief medical officer',
  'medical director',
  'talent acquisition',
  'human resources',
  'chief of staff',
  'chief executive',
  'ceo',
  'chief operating',
  'operating officer',
  'operations',
  'operating',
];

function matchesTargetTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return TARGET_TITLE_KEYWORDS.some(k => t.includes(k));
}

// ----------------- shared helpers -----------------

async function aiCall(key: string, prompt: string, maxTok = 3000): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: maxTok,
    }),
  });
  if (!r.ok) { console.log(`[aiCall] OpenAI HTTP ${r.status}`); return ''; }
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

function parseArr(text: string): any[] {
  try { const m = text.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); } catch {}
  return [];
}

const sanitize = (s: string) => s.replace(/["\\\n\r\t<>{}[\]|]/g, ' ').substring(0, 200);

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: number | undefined;
  const timeout = new Promise<null>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result as T;
  } catch (e) {
    console.warn(`${label} timed out or errored:`, (e as Error).message);
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

// Strip HTML tags + collapse whitespace, capped at maxLen so the AI input
// stays small. Kept inline so we don't pull a parsing library.
function htmlToText(html: string, maxLen = 12000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// ----------------- Leadership / About / Team scrape -----------------

const LEADERSHIP_PATHS = [
  '/about', '/about-us', '/about/us',
  '/leadership', '/about/leadership', '/about-us/leadership',
  '/team', '/about/team', '/about-us/team',
  '/our-team', '/our-leadership', '/about/our-team',
  '/people', '/executives', '/about/executives',
];

type ContactCandidate = {
  first_name: string;
  last_name: string;
  email?: string;
  title?: string;
  source: 'About/Team Page' | 'LinkedIn';
  source_url?: string | null;
  linkedin_url?: string | null;
  notes?: string;
};

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 MatchPoint Contact Discovery' }
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

async function scrapeAboutPages(
  co: { company_name: string; website?: string | null },
  openaiKey: string | undefined,
): Promise<ContactCandidate[]> {
  if (!openaiKey || !co.website) return [];
  const base = co.website.startsWith('http')
    ? co.website.replace(/\/+$/, '')
    : `https://${co.website.replace(/\/+$/, '')}`;
  const out: ContactCandidate[] = [];
  const seen = new Set<string>();

  for (const path of LEADERSHIP_PATHS) {
    const url = `${base}${path}`;
    const html = await fetchPage(url);
    if (!html || html.length < 500) continue;
    const text = htmlToText(html);
    if (text.length < 200) continue;
    const prompt =
      `From the About / Leadership / Team page below for "${sanitize(co.company_name)}", extract EVERY named person whose job title contains ANY of these phrases (case-insensitive substring match): ` +
      TARGET_TITLE_KEYWORDS.map(k => `"${k}"`).join(', ') + `.\n` +
      `Return a JSON array. Each item: {"first_name":"","last_name":"","title":"","email":"","source_url":"${url}"}\n` +
      `Only include people whose title literally contains one of those phrases. Skip board members, investors, and advisors unless they also hold an operating role. Use only information literally on the page — no guessing. If nobody on the page matches, return [].\n\n` +
      `--- PAGE TEXT ---\n${text}\n--- END ---\nReturn only JSON.`;
    try {
      const txt = await aiCall(openaiKey, prompt, 2000);
      const arr = parseArr(txt);
      for (const c of arr) {
        const fn = (c.first_name || '').trim();
        const ln = (c.last_name || '').trim();
        if (!fn && !ln) continue;
        if (!matchesTargetTitle(c.title)) continue;
        const key = `${fn.toLowerCase()}|${ln.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          first_name: fn,
          last_name: ln,
          email: (c.email || '').trim(),
          title: (c.title || '').trim(),
          source: 'About/Team Page',
          source_url: url,
          notes: `Scraped from ${url}`,
        });
      }
      if (out.length > 0) break; // first productive page wins
    } catch (e) {
      console.warn(`about-page extract failed for ${url}:`, (e as Error).message);
      continue;
    }
  }
  return out;
}

// ----------------- LinkedIn via SerpAPI -----------------

async function serpSearch(query: string, serpKey: string, num = 20): Promise<any[]> {
  const url = `${SERP_BASE}?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(serpKey)}&num=${num}&engine=google`;
  const r = await fetch(url);
  if (!r.ok) {
    console.warn(`SerpAPI ${r.status} for "${query}"`);
    return [];
  }
  const d = await r.json();
  return d.organic_results || [];
}

// Parse a LinkedIn SERP result's title string into { name, title, company }.
// Google returns the LinkedIn profile page title verbatim, which on
// LinkedIn almost always follows one of these shapes:
//   "Firstname Lastname - Job Title - Company | LinkedIn"
//   "Firstname Lastname - Job Title at Company | LinkedIn"
//   "Firstname Lastname - Job Title, Company - LinkedIn"
// The separator is usually " - " or " — "; company is the last segment
// before the " | LinkedIn" / " - LinkedIn" suffix.
function parseLinkedInResultTitle(raw: string): { firstName: string; lastName: string; title: string; company: string } | null {
  if (!raw) return null;
  // Strip trailing LinkedIn brand suffix in every reasonable form.
  let s = raw
    .replace(/\s*[\-\–\—\|]\s*linkedin.*$/i, '')
    .replace(/\s+on linkedin.*$/i, '')
    .trim();
  // Split on " at " first — handles "Jane Doe - CMO at Acme".
  // Otherwise split on em/en/hyphen.
  const parts = s.split(/\s[\-\–\—]\s/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const nameRaw = parts[0];
  let titleRaw = '';
  let companyRaw = '';
  if (parts.length === 2) {
    // "Name - Title at Company" OR "Name - Title"
    const seg = parts[1];
    const atIdx = seg.toLowerCase().lastIndexOf(' at ');
    if (atIdx > 0) {
      titleRaw = seg.slice(0, atIdx).trim();
      companyRaw = seg.slice(atIdx + 4).trim();
    } else {
      titleRaw = seg;
    }
  } else {
    // 3+ parts: "Name - Title - Company" (middle parts = title)
    titleRaw = parts.slice(1, -1).join(' - ').trim();
    companyRaw = parts[parts.length - 1].trim();
    // Collapse "Title at Company" that snuck into the title half
    const atIdx = titleRaw.toLowerCase().lastIndexOf(' at ');
    if (atIdx > 0 && !companyRaw) {
      companyRaw = titleRaw.slice(atIdx + 4).trim();
      titleRaw = titleRaw.slice(0, atIdx).trim();
    }
  }

  const nameParts = nameRaw.split(/\s+/);
  if (nameParts.length < 2) return null;
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');
  return { firstName, lastName, title: titleRaw, company: companyRaw };
}

// Rough sanity check: does the company extracted from the LinkedIn
// result actually look like the company we searched for? We don't need
// an exact match — LinkedIn truncates and decorates company names — but
// we do want to reject rows where the person has clearly moved.
function companyLooksCompatible(wantedName: string, foundName: string): boolean {
  if (!foundName) return true; // no company on result; don't block
  const a = wantedName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = foundName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Token overlap: any meaningful shared token (>3 chars) is fine
  const aTokens = new Set(wantedName.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4));
  const bTokens = foundName.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4);
  for (const t of bTokens) if (aTokens.has(t)) return true;
  return false;
}

async function searchLinkedInViaSerp(
  co: { company_name: string; website?: string | null },
  serpKey: string,
): Promise<ContactCandidate[]> {
  // One query per company: everybody at the company on LinkedIn. We
  // filter locally by parsing the result title. This is far cheaper
  // than one query per target title and empirically catches the same
  // people for hiring / leadership roles.
  const query = `site:linkedin.com/in "${co.company_name.replace(/"/g, '')}"`;
  const results = await serpSearch(query, serpKey, 20);
  const out: ContactCandidate[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const link: string = r?.link || '';
    if (!link.includes('linkedin.com/in/')) continue;
    const parsed = parseLinkedInResultTitle(r?.title || '');
    if (!parsed) continue;
    if (!matchesTargetTitle(parsed.title)) continue;
    if (!companyLooksCompatible(co.company_name, parsed.company)) continue;
    const key = `${parsed.firstName.toLowerCase()}|${parsed.lastName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      title: parsed.title,
      source: 'LinkedIn',
      source_url: link,
      linkedin_url: link,
      notes: `From LinkedIn via Google: ${r?.title || ''}`,
    });
  }
  return out;
}

// ----------------- confidence -----------------

// Local same-run confidence calculator. Mirrors the SQL function
// recompute_contact_confidence() so the value we INSERT is usable
// without a follow-up round-trip. The SQL function is still run at the
// end of each run to fix up the cross-row "duplicate" component (which
// we can only see once every insert has landed).
function computeConfidenceLocal(row: { title?: string; company_name?: string; email?: string; phone_cell?: string }, isDuplicate: boolean): number {
  if (isDuplicate) return 0;
  let s = 1; // unique baseline
  if (row.title && row.title.trim()) s += 1;
  if (row.company_name && row.company_name.trim()) s += 1;
  if (row.email && row.email.trim()) s += 1;
  if (row.phone_cell && row.phone_cell.trim()) s += 1;
  return Math.min(5, s);
}

// ----------------- per-company orchestration -----------------

type CompanyRow = { id: string; company_name: string; website?: string | null };
type ContactRow = { id: string; company_id: string | null; company_name: string | null; first_name: string | null; last_name: string | null };
type PerItem = {
  label: string; // company name in find mode, contact name in enrich mode — rendered by the UI as the row label
  company_id?: string; // set in find mode so resume-from-last-run can identify already-processed companies across runs
  leadership_added: number;
  linkedin_added: number;
  duplicates_skipped: number;
  filtered_title: number; // candidates dropped for title-filter mismatch (diagnostic only)
  errors: string[];
};

async function enrichCompany(
  co: CompanyRow,
  existingNameKeys: Set<string>,
  nameKeysSeenThisRun: Set<string>,
  openaiKey: string | undefined,
  serpKey: string | undefined,
): Promise<PerItem> {
  const result: PerItem = {
    label: co.company_name,
    company_id: co.id,
    leadership_added: 0,
    linkedin_added: 0,
    duplicates_skipped: 0,
    filtered_title: 0,
    errors: [],
  };

  const candidates: ContactCandidate[] = [];

  // 1. About / Team / Leadership pages (free; needs website)
  if (openaiKey && co.website) {
    const lp = await withTimeout(scrapeAboutPages(co, openaiKey), 45_000, `About(${co.company_name})`);
    if (lp) candidates.push(...lp);
    else result.errors.push('About/Team: timed out or failed');
  }

  // 2. LinkedIn via SerpAPI
  if (serpKey) {
    const li = await withTimeout(searchLinkedInViaSerp(co, serpKey), 20_000, `LinkedIn(${co.company_name})`);
    if (li) candidates.push(...li);
    else result.errors.push('LinkedIn: timed out or failed');
  }

  // Insert loop. Dedup on (first|last|company) against both pre-existing
  // rows AND rows added earlier in this run. Title filter is redundant
  // with per-source filters above but we enforce it one more time at
  // the boundary so nothing slips through.
  for (const cand of candidates) {
    const fn = (cand.first_name || '').trim();
    const ln = (cand.last_name || '').trim();
    if (!fn && !ln) continue;
    if (!matchesTargetTitle(cand.title)) { result.filtered_title++; continue; }

    const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${co.company_name.toLowerCase().trim()}`;
    if (existingNameKeys.has(dk) || nameKeysSeenThisRun.has(dk)) {
      result.duplicates_skipped++;
      continue;
    }

    // Pre-insert confidence. Cross-row duplicate check will run in SQL
    // at the end; for now treat it as "not duplicate within this run".
    const confidence = computeConfidenceLocal({
      title: cand.title,
      company_name: co.company_name,
      email: cand.email,
      phone_cell: '', // find-contacts never sets a cell; enrichment will
    }, /* isDuplicate */ false);

    const insertRow: Record<string, any> = {
      company_id: co.id,
      company_name: co.company_name,
      first_name: fn,
      last_name: ln,
      email: cand.email || '',
      phone_work: '',
      phone_home: '',
      phone_cell: '',
      title: cand.title || '',
      source: cand.source,
      source_url: cand.source_url || null,
      linkedin_url: cand.linkedin_url || (cand.source_url && cand.source_url.includes('linkedin.com/in/') ? cand.source_url : null),
      is_verified: cand.source === 'About/Team Page',
      notes: cand.notes || '',
      confidence_score: confidence,
    };

    const { error } = await supabase.from('marketing_contacts').insert(insertRow);
    if (error) {
      if (error.code === '23505') { result.duplicates_skipped++; }
      else { result.errors.push(`Insert failed: ${error.message}`); }
      continue;
    }

    nameKeysSeenThisRun.add(dk);
    if (cand.source === 'About/Team Page') result.leadership_added++;
    else if (cand.source === 'LinkedIn') result.linkedin_added++;
  }

  // Keep marketing_companies.contact_count in sync.
  const { count } = await supabase
    .from('marketing_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', co.id);
  await supabase.from('marketing_companies')
    .update({ contact_count: count || 0, updated_at: new Date().toISOString() })
    .eq('id', co.id);

  return result;
}

// ----------------- background task (chunked) -----------------

// Wall-clock safety: process this many companies per edge-function
// invocation, then self-invoke for the next batch. 25 × ~6s/company
// ≈ 2.5 min, well under the edge runtime deadline. Tune down if any
// single company's SerpAPI/OpenAI calls spike.
const CHUNK_SIZE = 25;

// Service-role URL we POST to from within a chunk to kick off the
// next chunk. SUPABASE_URL is always set inside an edge function.
const SELF_INVOKE_URL = `${supabaseUrl}/functions/v1/find-contacts`;

async function processChunk(
  runId: string,
  chunkTargets: CompanyRow[],
  startOffset: number,
  totalTargets: number,
  remainingIds: string[],
  openaiKey: string | undefined,
  serpKey: string | undefined,
  loadExistingRun: boolean,
) {
  const chunkStartedAt = Date.now();
  try {
    // Resume: pick up counters + per from the run row written by the
    // previous chunk. Fresh start: begin from zero / empty.
    let totals = { leadership: 0, linkedin: 0, skipped: 0, filtered: 0 };
    let per: PerItem[] = [];
    if (loadExistingRun) {
      const { data: runRow } = await supabase.from('contact_runs').select('*').eq('id', runId).single();
      if (runRow) {
        totals.leadership = runRow.leadership_added || 0;
        totals.linkedin = runRow.ai_added || 0;
        totals.skipped = runRow.duplicates_skipped || 0;
        per = Array.isArray(runRow.per_item) ? runRow.per_item : [];
      }
    }

    // Refresh existingNameKeys each chunk so dedup reflects inserts
    // from earlier chunks of the same run.
    const { data: existingContacts } = await supabase.from('marketing_contacts')
      .select('id, company_id, company_name, first_name, last_name');
    const existing: ContactRow[] = (existingContacts || []) as ContactRow[];
    const existingNameKeys = new Set(existing.map(c =>
      `${(c.first_name || '').toLowerCase().trim()}|${(c.last_name || '').toLowerCase().trim()}|${(c.company_name || '').toLowerCase().trim()}`
    ));
    const nameKeysSeenThisRun = new Set<string>();

    for (let i = 0; i < chunkTargets.length; i++) {
      const co = chunkTargets[i];
      const globalIndex = startOffset + i;
      await supabase.from('contact_runs').update({
        current_item: co.company_name,
        items_processed: globalIndex,
      }).eq('id', runId);

      const r = await enrichCompany(co, existingNameKeys, nameKeysSeenThisRun, openaiKey, serpKey);
      per.push(r);
      totals.leadership += r.leadership_added;
      totals.linkedin += r.linkedin_added;
      totals.skipped += r.duplicates_skipped;
      totals.filtered += r.filtered_title;

      await supabase.from('contact_runs').update({
        items_processed: globalIndex + 1,
        leadership_added: totals.leadership,
        ai_added: totals.linkedin,           // repurposed column: LinkedIn count
        contacts_added: totals.leadership + totals.linkedin,
        duplicates_skipped: totals.skipped,
        per_item: per,
      }).eq('id', runId);
    }

    const chunkSeconds = Math.round((Date.now() - chunkStartedAt) / 1000);

    if (remainingIds.length === 0) {
      // Last chunk: recompute cross-row confidence, mark completed.
      try { await supabase.rpc('recompute_contact_confidence'); }
      catch (e) { console.warn('recompute_contact_confidence RPC failed:', (e as Error).message); }

      await supabase.from('contact_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_item: null,
        items_processed: totalTargets,
        leadership_added: totals.leadership,
        ai_added: totals.linkedin,
        contacts_added: totals.leadership + totals.linkedin,
        duplicates_skipped: totals.skipped,
        per_item: per,
      }).eq('id', runId);
      console.log(`find-contacts run ${runId} FINAL chunk done in ${chunkSeconds}s — About:${totals.leadership} LinkedIn:${totals.linkedin} Skipped:${totals.skipped} FilteredTitle:${totals.filtered}`);
      return;
    }

    // More chunks remain. Self-invoke: POST to ourselves with the
    // remaining company IDs. The receiving invocation boots with a
    // fresh wall-clock budget and processes the next CHUNK_SIZE.
    console.log(`find-contacts run ${runId} chunk done in ${chunkSeconds}s, self-invoking for ${remainingIds.length} remaining`);
    try {
      const resp = await fetch(SELF_INVOKE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          resume: true,
          runId,
          remainingCompanyIds: remainingIds,
          startOffset: startOffset + chunkTargets.length,
          totalTargets,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Self-invoke returned ${resp.status}: ${text.slice(0, 300)}`);
      }
    } catch (e) {
      const msg = `Self-invoke for next chunk failed: ${(e as Error).message}`;
      console.error(msg);
      await supabase.from('contact_runs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: msg,
      }).eq('id', runId);
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`find-contacts run ${runId} chunk failed:`, msg);
    await supabase.from('contact_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: msg,
    }).eq('id', runId);
  }
}

// ----------------- HTTP handler -----------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    const body = await req.json().catch(() => ({}));

    // Resolve API keys up front — both the fresh-start and resume
    // paths need them to pass into processChunk.
    const allEnv = Deno.env.toObject();
    const pickEnv = (...names: string[]): string | undefined => {
      for (const n of names) { const v = Deno.env.get(n); if (v) return v; }
      const upperNames = names.map(n => n.toUpperCase());
      for (const [k, v] of Object.entries(allEnv)) {
        if (v && upperNames.includes(k.toUpperCase())) return v;
      }
      return undefined;
    };
    const openaiKey = pickEnv('OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_TOKEN');
    const serpKey = pickEnv('SERP_API_KEY', 'SERPAPI_API_KEY', 'SERPAPI_KEY', 'SERP_KEY');
    if (!openaiKey && !serpKey) {
      return new Response(JSON.stringify({ success: false, error: 'No discovery secrets configured. Need OPENAI_API_KEY (for About/Team scrape) and/or SERP_API_KEY (for LinkedIn).' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
      });
    }

    // ---------- Resume path ----------
    // Called by a previous chunk via self-invoke. Load the next CHUNK_SIZE
    // companies and kick off another processChunk. The run row already
    // exists with cumulative counters we'll keep adding to.
    if (body.resume && typeof body.runId === 'string' && Array.isArray(body.remainingCompanyIds)) {
      const ids: string[] = body.remainingCompanyIds.filter((x: any) => typeof x === 'string');
      if (ids.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'resume invoked with empty remainingCompanyIds' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
        });
      }
      const { data: cos } = await supabase.from('marketing_companies')
        .select('id, company_name, website')
        .in('id', ids);
      // Preserve the caller's ordering so items_processed stays consistent.
      const byId = new Map((cos || []).map(c => [c.id, c as CompanyRow]));
      const ordered = ids.map(id => byId.get(id)).filter(Boolean) as CompanyRow[];
      const chunk = ordered.slice(0, CHUNK_SIZE);
      const nextRemaining = ordered.slice(CHUNK_SIZE).map(c => c.id);
      EdgeRuntime.waitUntil(processChunk(
        body.runId,
        chunk,
        Number(body.startOffset) || 0,
        Number(body.totalTargets) || ordered.length,
        nextRemaining,
        openaiKey,
        serpKey,
        /* loadExistingRun */ true,
      ));
      return new Response(JSON.stringify({
        success: true,
        resumed: true,
        run_id: body.runId,
        chunk_size: chunk.length,
        remaining_after_this_chunk: nextRemaining.length,
      }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    }

    // ---------- Fresh-start path ----------
    const mode: 'all' | 'company' = body.mode === 'company' ? 'company' : 'all';
    const companyId: string | undefined = body.companyId;
    const forceRestart: boolean = !!body.forceRestart;

    let targets: CompanyRow[] = [];
    let targetCompanyName: string | null = null;
    let resumeDiag = '';
    if (mode === 'company') {
      if (!companyId) {
        return new Response(JSON.stringify({ success: false, error: 'companyId is required for mode=company' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
        });
      }
      const { data } = await supabase.from('marketing_companies').select('id, company_name, website').eq('id', companyId).maybeSingle();
      if (!data) {
        return new Response(JSON.stringify({ success: false, error: 'Company not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
        });
      }
      targets = [data as CompanyRow];
      targetCompanyName = data.company_name;
    } else {
      const { data: companies } = await supabase.from('marketing_companies')
        .select('id, company_name, website, is_blocked')
        .order('is_high_priority', { ascending: false });
      const { data: openJobs } = await supabase.from('marketing_jobs')
        .select('company_id, company_name, is_closed, status')
        .or('is_closed.is.false,is_closed.is.null')
        .neq('status', 'Closed');
      const activeIds = new Set((openJobs || []).map(j => j.company_id).filter(Boolean));
      const activeNames = new Set((openJobs || []).map(j => (j.company_name || '').toLowerCase().trim()));
      targets = (companies || [])
        .filter(c => !c.is_blocked)
        .filter(c => activeIds.has(c.id) || activeNames.has((c.company_name || '').toLowerCase().trim()))
        .map(c => ({ id: c.id, company_name: c.company_name, website: c.website }));

      // Resume-from-last: skip companies that ANY prior mode='all' run
      // in the last 24h already processed. Aggregates across every such
      // run (not just the most recent) so partial-sweep → timeout →
      // retry doesn't silently rescan the earlier successful companies.
      // Lets the user re-click "Find All" after any failure and only
      // pay API costs for companies that still need work.
      if (!forceRestart) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: priorRuns } = await supabase.from('contact_runs')
          .select('id, per_item, started_at, status, items_processed')
          .eq('mode', 'all')
          .in('status', ['completed', 'failed'])
          .gte('started_at', cutoff)
          .order('started_at', { ascending: false });
        const processedIds = new Set<string>();
        const processedNames = new Set<string>();
        let runsConsidered = 0;
        for (const r of (priorRuns || [])) {
          const per = Array.isArray(r.per_item) ? r.per_item : [];
          if (per.length === 0) continue;
          runsConsidered++;
          for (const p of per) {
            if (p?.company_id) processedIds.add(p.company_id);
            if (p?.label) processedNames.add(String(p.label).toLowerCase().trim());
          }
        }
        if (processedIds.size > 0 || processedNames.size > 0) {
          const before = targets.length;
          targets = targets.filter(c => !processedIds.has(c.id) && !processedNames.has((c.company_name || '').toLowerCase().trim()));
          const skipped = before - targets.length;
          if (skipped > 0) {
            resumeDiag = `skipped ${skipped} companies already processed across ${runsConsidered} prior run${runsConsidered === 1 ? '' : 's'} in the last 24h (pass forceRestart:true to override)`;
            console.log(`find-contacts fresh-run: ${resumeDiag}`);
          }
        }
      }
    }

    // Auto-clear stale running rows older than 15 min.
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from('contact_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Timed out (>15 min without completion)' })
      .eq('status', 'running')
      .lt('started_at', staleCutoff);

    const { data: runRow, error: insertErr } = await supabase.from('contact_runs').insert({
      status: 'running',
      mode,
      target_company_id: mode === 'company' ? companyId : null,
      target_company_name: targetCompanyName,
      items_total: targets.length,
      items_processed: 0,
      error_message: resumeDiag || null,
    }).select('id').single();
    if (insertErr || !runRow) {
      return new Response(JSON.stringify({ success: false, error: `Failed to create run: ${insertErr?.message || 'unknown'}` }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
      });
    }

    // If nothing to do (everything was skipped by resume-from-last),
    // mark completed immediately so the UI doesn't hang.
    if (targets.length === 0) {
      await supabase.from('contact_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: resumeDiag || 'No companies to process',
      }).eq('id', runRow.id);
      return new Response(JSON.stringify({
        success: true,
        run_id: runRow.id,
        mode,
        items_total: 0,
        resume_diag: resumeDiag,
      }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    }

    // Kick off the first chunk. Remaining company IDs ride along so
    // the chunk can self-invoke with them at the end.
    const firstChunk = targets.slice(0, CHUNK_SIZE);
    const nextRemaining = targets.slice(CHUNK_SIZE).map(c => c.id);
    EdgeRuntime.waitUntil(processChunk(
      runRow.id,
      firstChunk,
      /* startOffset */ 0,
      /* totalTargets */ targets.length,
      nextRemaining,
      openaiKey,
      serpKey,
      /* loadExistingRun */ false,
    ));

    return new Response(JSON.stringify({
      success: true,
      run_id: runRow.id,
      mode,
      items_total: targets.length,
      chunk_size: firstChunk.length,
      remaining_after_first_chunk: nextRemaining.length,
      resume_diag: resumeDiag,
      sources_active: {
        about_team: !!openaiKey,
        linkedin: !!serpKey,
      },
    }), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });

  } catch (error) {
    console.error('find-contacts error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });
  }
});
