// find-contacts — standalone contact enrichment with five sources.
//
//   Request body: { mode: 'all' }
//                 { mode: 'company', companyId: '...' }
//
// Per company, sources run in this order (cheapest/freest first):
//
//   1. Leadership-page scrape  (free; requires a company website)
//   2. Apollo.io people search (cheap; requires APOLLO_API_KEY)
//   3. AI brainstorm           (gpt-4o-mini; existing)
//   4. Crelate ATS sync        (existing)
//   5. Hunter.io email finder  (cheap; requires HUNTER_API_KEY)
//      — runs LAST as an enrichment pass on contacts found above that
//        have a name + a company domain but no verified email.
//
// Background-runs via EdgeRuntime.waitUntil; the client polls
// contact_runs for live progress (see MarketingNewJobs.tsx).
//
// "Find MORE" semantics: we never short-circuit on the existing-contact
// count. Sources dedupe against the in-memory existingKeys set so a
// re-run finds different people each time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CRELATE_BASE = "https://app.crelate.com/api3";
const APOLLO_BASE = "https://api.apollo.io/v1";
const HUNTER_BASE = "https://api.hunter.io/v2";

// Target titles used for both AI prompts and Apollo's person_titles param.
const TARGET_TITLES = [
  'Talent Acquisition', 'Recruiter', 'Senior Recruiter', 'Physician Recruiter',
  'HR Director', 'Director of Human Resources', 'VP HR', 'VP of Human Resources',
  'Chief People Officer', 'Chief Human Resources Officer',
  'Medical Director', 'Chief Medical Officer', 'CMO',
];

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
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

function parseArr(text: string): any[] {
  try { const m = text.match(/\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); } catch {}
  return [];
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Race a promise against a timeout. Returns null on timeout rather than
// throwing so a single slow source can't kill the whole run. Every
// source in this file is wrapped in one of these so one misbehaving
// vendor (Crelate returning 2500 rows, Apollo stalling, a leadership
// page taking forever to load) doesn't eat the whole edge-function
// budget.
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

// ----------------- Crelate -----------------

async function crelateGet(path: string, apiKey: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CRELATE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) { console.error(`Crelate ${res.status} on ${path}`); return { Data: [] }; }
  return await res.json();
}

const buildCrelateContactUrl = (cid: string) =>
  `https://app.crelate.com/go#stage/_Contacts/DefaultView/${cid}/summary`;
const extractEmail = (c: any) =>
  c.EmailAddresses_Work?.Value || c.EmailAddresses_Personal?.Value || c.EmailAddresses_Other?.Value || '';
const extractPhone = (c: any, type: 'work'|'mobile'|'home') => {
  if (type === 'work') return c.PhoneNumbers_Work_Main?.Value || c.PhoneNumbers_Work_Direct?.Value || '';
  if (type === 'mobile') return c.PhoneNumbers_Mobile?.Value || '';
  if (type === 'home') return c.PhoneNumbers_Home?.Value || '';
  return '';
};
const extractTitle = (c: any) => c.CurrentPosition?.JobTitle || '';
const extractCompanyName = (c: any) => c.CurrentPosition?.CompanyId?.Title || '';

// ----------------- Leadership-page scrape -----------------

const LEADERSHIP_PATHS = [
  '/leadership', '/about/leadership', '/about-us/leadership',
  '/team', '/about/team', '/about-us/team',
  '/our-team', '/our-leadership', '/about/our-team',
  '/people', '/executives', '/about/executives',
];

type ContactCandidate = {
  first_name: string; last_name: string;
  email?: string; phone_work?: string; phone_cell?: string; phone_home?: string;
  title?: string;
  source: 'AI Intelligence Engine' | 'Crelate ATS' | 'Apollo' | 'Leadership Page';
  source_url?: string|null;
  is_verified?: boolean;
  notes?: string;
  apollo_id?: string;
  crelate_contact_id?: string;
  crelate_url?: string;
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

async function scrapeLeadershipPages(co: { company_name: string; website?: string|null }, openaiKey: string|undefined): Promise<ContactCandidate[]> {
  if (!openaiKey || !co.website) return [];
  const base = co.website.startsWith('http') ? co.website.replace(/\/+$/, '') : `https://${co.website.replace(/\/+$/, '')}`;
  for (const path of LEADERSHIP_PATHS) {
    const url = `${base}${path}`;
    const html = await fetchPage(url);
    if (!html || html.length < 500) continue;
    const text = htmlToText(html);
    if (text.length < 200) continue;
    const prompt =
      `From the leadership/team page below for "${co.company_name}", extract people whose roles relate to hiring, HR, talent acquisition, recruiting, or clinical leadership (Medical Director, Chief Medical Officer, etc.). Skip board members and investors unless they hold an operating role.\n` +
      `Return a JSON array. Each item: {"first_name":"","last_name":"","title":"","email":"","source_url":"${url}"}\n` +
      `Use only what is literally on the page — no guessing. If no relevant people are present return [].\n\n` +
      `--- PAGE TEXT ---\n${text}\n--- END ---\nReturn only JSON.`;
    try {
      const txt = await aiCall(openaiKey, prompt, 2000);
      const arr = parseArr(txt);
      if (arr.length === 0) continue;
      return arr
        .filter((c: any) => c.first_name || c.last_name)
        .map((c: any) => ({
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email || '',
          title: c.title || '',
          source: 'Leadership Page' as const,
          source_url: url,
          is_verified: true,
          notes: `Scraped from ${url}`,
        }));
    } catch (e) {
      console.warn(`leadership-extract failed for ${url}:`, (e as Error).message);
      continue;
    }
  }
  return [];
}

// ----------------- Apollo -----------------

async function searchApollo(co: { company_name: string; website?: string|null }, apolloKey: string): Promise<ContactCandidate[]> {
  // mixed_people/search supports either q_organization_names or
  // q_organization_domains. Domain matches are far more precise when we
  // have a website on file; fall back to name otherwise.
  //
  // per_page=5 keeps usage gentle on Apollo's free tier (60 credits/mo).
  // Bump to 25 if you upgrade — most companies have only a handful of
  // matching recruiting/CMO titles anyway, so 5 is usually enough.
  const domain = extractDomain(co.website);
  const body: Record<string, any> = {
    page: 1,
    per_page: 5,
    person_titles: TARGET_TITLES,
  };
  if (domain) body.q_organization_domains = [domain];
  else body.q_organization_names = [co.company_name];

  try {
    const r = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apolloKey,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn(`Apollo ${r.status} for ${co.company_name}: ${txt.slice(0, 200)}`);
      return [];
    }
    const d = await r.json();
    const people: any[] = d.people || d.contacts || [];
    return people
      .filter(p => (p.first_name || p.last_name))
      .map(p => ({
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        email: p.email || '',
        title: p.title || (p.headline || ''),
        phone_work: p.organization?.phone || '',
        phone_cell: p.mobile_phone || '',
        source: 'Apollo' as const,
        source_url: p.linkedin_url || (p.id ? `https://app.apollo.io/#/people/${p.id}` : null),
        is_verified: !!p.email_status && p.email_status !== 'unverified',
        apollo_id: p.id,
        notes: `From Apollo (${p.email_status || 'no email status'})`,
      }));
  } catch (e) {
    console.warn(`Apollo error for ${co.company_name}:`, (e as Error).message);
    return [];
  }
}

// ----------------- Hunter -----------------

// Returns { email, score } or null.
async function hunterEmailFinder(firstName: string, lastName: string, domain: string, hunterKey: string): Promise<{ email: string; score: number } | null> {
  if (!firstName || !lastName || !domain) return null;
  try {
    const url = `${HUNTER_BASE}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${encodeURIComponent(hunterKey)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      console.warn(`Hunter ${r.status} for ${firstName} ${lastName}@${domain}: ${txt.slice(0, 150)}`);
      return null;
    }
    const d = await r.json();
    const email = d?.data?.email;
    const score = d?.data?.score || 0;
    if (!email) return null;
    return { email, score };
  } catch (e) {
    console.warn(`Hunter exception:`, (e as Error).message);
    return null;
  }
}

// ----------------- AI brainstorm -----------------

async function aiBrainstorm(co: { company_name: string }, here: ContactRow[], openaiKey: string): Promise<ContactCandidate[]> {
  const knownList = here.length > 0
    ? `\n\nWe already have these contacts — do NOT return them, find OTHER people:\n${here.map(c => `- ${c.first_name} ${c.last_name}`).join('\n')}\n`
    : '';
  const prompt =
    `Find hiring-related contacts at "${co.company_name}". Target roles: ${TARGET_TITLES.join(', ')}.` +
    knownList +
    `\nONLY return real, publicly verifiable information (LinkedIn profile, company staff page, press release, etc.). No guessed emails, no fabricated names.` +
    `\nReturn a JSON array. Each item: {"first_name":"","last_name":"","email":"","phone_work":"","phone_cell":"","phone_home":"","title":"","source":"","source_url":""}` +
    `\nReturn only JSON.`;
  try {
    const txt = await aiCall(openaiKey, prompt, 3000);
    return parseArr(txt)
      .filter((c: any) => c.first_name || c.last_name)
      .map((c: any) => {
        let su: string|null = null;
        if (typeof c.source_url === 'string' && c.source_url.startsWith('http') && !c.source_url.includes('/search/results/') && !c.source_url.includes('?q=')) {
          su = c.source_url;
        }
        return {
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email || '',
          phone_work: c.phone_work || '',
          phone_cell: c.phone_cell || '',
          phone_home: c.phone_home || '',
          title: c.title || '',
          source: 'AI Intelligence Engine' as const,
          source_url: su,
          is_verified: !!su,
        };
      });
  } catch (e) {
    console.warn(`AI brainstorm error for ${co.company_name}:`, (e as Error).message);
    return [];
  }
}

// ----------------- Crelate pass -----------------

async function searchCrelate(co: CompanyRow, crelateKey: string, existingCrelateIds: Set<string>): Promise<ContactCandidate[]> {
  // IMPORTANT: we filter out contacts that are already in
  // existingCrelateIds *before* pushing them as candidates. Previously
  // we added all 2,500+ Crelate contacts per big-company search and
  // then dedup'd in the caller with a 150ms delay per candidate — that
  // alone ate 6+ minutes for one company and timed out the function.
  //
  // This function also uses much smaller `take` values: Crelate's
  // regular-contact-sync function already pulls the full set. Here we
  // only want a handful of leads we might have missed.
  const out: ContactCandidate[] = [];
  try {
    const searchName = co.company_name.replace(/\s*\/\s*/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const compRes = await crelateGet('/companies', crelateKey, { search: searchName, take: '5' });
    for (const cc of (compRes?.Data || [])) {
      if (!cc.Id) continue;
      const contactsRes = await crelateGet('/contacts', crelateKey, { companyId: cc.Id, take: '20' });
      for (const contact of (contactsRes?.Data || [])) {
        const cid = contact.Id;
        if (!cid || existingCrelateIds.has(cid)) continue; // ← early filter
        const fn = contact.FirstName || '';
        const ln = contact.LastName || '';
        if (!fn && !ln) continue;
        const crelateUrl = buildCrelateContactUrl(cid);
        out.push({
          first_name: fn, last_name: ln,
          email: extractEmail(contact),
          phone_work: extractPhone(contact, 'work'),
          phone_home: extractPhone(contact, 'home'),
          phone_cell: extractPhone(contact, 'mobile'),
          title: extractTitle(contact),
          source: 'Crelate ATS',
          source_url: crelateUrl,
          is_verified: true,
          crelate_contact_id: cid,
          crelate_url: crelateUrl,
          notes: `From Crelate (API v3). Company: ${cc.Name || searchName}`,
        });
      }
    }
    const directRes = await crelateGet('/contacts', crelateKey, { search: searchName, take: '10' });
    for (const contact of (directRes?.Data || [])) {
      const cid = contact.Id;
      if (!cid || existingCrelateIds.has(cid)) continue;
      const fn = contact.FirstName || '';
      const ln = contact.LastName || '';
      if (!fn && !ln) continue;
      const contactCo = extractCompanyName(contact).toLowerCase();
      const searchLower = co.company_name.toLowerCase();
      if (contactCo && !contactCo.includes(searchLower) && !searchLower.includes(contactCo)) continue;
      const crelateUrl = buildCrelateContactUrl(cid);
      out.push({
        first_name: fn, last_name: ln,
        email: extractEmail(contact),
        phone_work: extractPhone(contact, 'work'),
        phone_home: extractPhone(contact, 'home'),
        phone_cell: extractPhone(contact, 'mobile'),
        title: extractTitle(contact),
        source: 'Crelate ATS',
        source_url: crelateUrl,
        is_verified: true,
        crelate_contact_id: cid,
        crelate_url: crelateUrl,
        notes: 'From Crelate contact search (API v3).',
      });
    }
  } catch (e) {
    console.warn(`Crelate error for ${co.company_name}:`, (e as Error).message);
  }
  return out;
}

// ----------------- per-company orchestration -----------------

type CompanyRow = { id: string; company_name: string; website?: string|null };
type ContactRow = { id: string; company_id: string|null; company_name: string|null; first_name: string|null; last_name: string|null; crelate_contact_id: string|null };
type PerCompany = {
  company: string;
  ai_added: number;
  crelate_added: number;
  apollo_added: number;
  leadership_added: number;
  emails_verified: number;
  duplicates_skipped: number;
  errors: string[];
};

async function enrichCompany(
  co: CompanyRow,
  existingKeys: Set<string>,
  existingCrelateIds: Set<string>,
  existingApolloIds: Set<string>,
  here: ContactRow[],
  openaiKey: string | undefined,
  crelateKey: string | undefined,
  apolloKey: string | undefined,
  hunterKey: string | undefined,
): Promise<PerCompany> {
  const result: PerCompany = {
    company: co.company_name,
    ai_added: 0, crelate_added: 0, apollo_added: 0, leadership_added: 0,
    emails_verified: 0, duplicates_skipped: 0, errors: [],
  };

  const candidates: ContactCandidate[] = [];

  // Every source is wrapped in withTimeout so one hung API can't eat
  // the entire edge-function budget. Timeouts are generous but finite.
  // 1. Leadership pages (free; needs website)
  if (openaiKey && co.website) {
    const lp = await withTimeout(scrapeLeadershipPages(co, openaiKey), 45_000, `Leadership(${co.company_name})`);
    if (lp) candidates.push(...lp);
    else result.errors.push('Leadership: timed out or failed');
  }

  // 2. Apollo
  if (apolloKey) {
    const ap = await withTimeout(searchApollo(co, apolloKey), 20_000, `Apollo(${co.company_name})`);
    if (ap) candidates.push(...ap);
    else result.errors.push('Apollo: timed out or failed');
  }

  // 3. AI brainstorm
  if (openaiKey) {
    const ai = await withTimeout(aiBrainstorm(co, here, openaiKey), 30_000, `AI(${co.company_name})`);
    if (ai) candidates.push(...ai);
    else result.errors.push('AI: timed out or failed');
  }

  // 4. Crelate (now skips already-synced contacts up-front)
  if (crelateKey) {
    const cr = await withTimeout(searchCrelate(co, crelateKey, existingCrelateIds), 90_000, `Crelate(${co.company_name})`);
    if (cr) candidates.push(...cr);
    else result.errors.push('Crelate: timed out or failed');
  }

  // 5. Hunter email enrichment + insert pass.
  // Walk every candidate; dedupe on first|last|company; if no email and
  // we have a domain + Hunter key, try to find one.
  const domain = extractDomain(co.website);
  for (const cand of candidates) {
    const fn = (cand.first_name || '').trim();
    const ln = (cand.last_name || '').trim();
    if (!fn && !ln) continue;
    const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${co.company_name.toLowerCase().trim()}`;
    if (existingKeys.has(dk)) { result.duplicates_skipped++; continue; }
    if (cand.crelate_contact_id && existingCrelateIds.has(cand.crelate_contact_id)) { result.duplicates_skipped++; continue; }
    if (cand.apollo_id && existingApolloIds.has(cand.apollo_id)) { result.duplicates_skipped++; continue; }

    // Hunter enrichment if we lack an email but have a domain.
    let email = cand.email || '';
    let hunterNote = '';
    if (!email && hunterKey && domain && fn && ln) {
      const h = await withTimeout(
        hunterEmailFinder(fn, ln, domain, hunterKey),
        8_000,
        `Hunter(${fn} ${ln}@${domain})`
      );
      if (h?.email) {
        email = h.email;
        hunterNote = ` Hunter score=${h.score}.`;
        result.emails_verified++;
      }
    }

    const insertRow: Record<string, any> = {
      company_id: co.id,
      company_name: co.company_name,
      first_name: fn,
      last_name: ln,
      email,
      phone_work: cand.phone_work || '',
      phone_home: cand.phone_home || '',
      phone_cell: cand.phone_cell || '',
      title: cand.title || '',
      source: cand.source,
      source_url: cand.source_url || null,
      is_verified: !!cand.is_verified,
      notes: (cand.notes || '') + hunterNote,
    };
    if (cand.crelate_contact_id) {
      insertRow.crelate_contact_id = cand.crelate_contact_id;
      insertRow.crelate_url = cand.crelate_url || buildCrelateContactUrl(cand.crelate_contact_id);
    }

    const { error } = await supabase.from('marketing_contacts').insert(insertRow);
    if (error) continue;

    existingKeys.add(dk);
    if (cand.crelate_contact_id) existingCrelateIds.add(cand.crelate_contact_id);
    if (cand.apollo_id) existingApolloIds.add(cand.apollo_id);

    if (cand.source === 'AI Intelligence Engine') result.ai_added++;
    else if (cand.source === 'Crelate ATS') result.crelate_added++;
    else if (cand.source === 'Apollo') result.apollo_added++;
    else if (cand.source === 'Leadership Page') result.leadership_added++;
  }

  // Keep marketing_companies.contact_count in sync.
  const { count } = await supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('company_id', co.id);
  await supabase.from('marketing_companies').update({ contact_count: count || 0, updated_at: new Date().toISOString() }).eq('id', co.id);

  return result;
}

// ----------------- background task -----------------

async function processRun(runId: string, targets: CompanyRow[], openaiKey: string|undefined, crelateKey: string|undefined, apolloKey: string|undefined, hunterKey: string|undefined) {
  const startedAt = Date.now();
  try {
    const { data: existingContacts } = await supabase.from('marketing_contacts')
      .select('id, company_id, company_name, first_name, last_name, crelate_contact_id, notes');
    const existing: ContactRow[] = (existingContacts || []) as ContactRow[];
    const existingKeys = new Set(existing.map(c =>
      `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${(c.company_name||'').toLowerCase().trim()}`
    ));
    const existingCrelateIds = new Set(existing.map(c => c.crelate_contact_id).filter(Boolean) as string[]);
    // Apollo IDs aren't stored separately; we'd need a column for that.
    // For now this is empty so Apollo dedup falls back to the name-key.
    const existingApolloIds = new Set<string>();

    const per: PerCompany[] = [];
    const totals = { ai: 0, crelate: 0, apollo: 0, leadership: 0, emails: 0, skipped: 0 };

    for (let i = 0; i < targets.length; i++) {
      const co = targets[i];
      await supabase.from('contact_runs').update({
        current_company: co.company_name,
        companies_processed: i,
      }).eq('id', runId);

      const here = existing.filter(c =>
        (c.company_name || '').toLowerCase().trim() === co.company_name.toLowerCase().trim()
      );

      const r = await enrichCompany(co, existingKeys, existingCrelateIds, existingApolloIds, here, openaiKey, crelateKey, apolloKey, hunterKey);
      per.push(r);
      totals.ai += r.ai_added;
      totals.crelate += r.crelate_added;
      totals.apollo += r.apollo_added;
      totals.leadership += r.leadership_added;
      totals.emails += r.emails_verified;
      totals.skipped += r.duplicates_skipped;

      await supabase.from('contact_runs').update({
        companies_processed: i + 1,
        ai_added: totals.ai,
        crelate_added: totals.crelate,
        apollo_added: totals.apollo,
        leadership_added: totals.leadership,
        emails_verified: totals.emails,
        contacts_added: totals.ai + totals.crelate + totals.apollo + totals.leadership,
        duplicates_skipped: totals.skipped,
        per_company: per,
      }).eq('id', runId);
    }

    await supabase.from('contact_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_company: null,
      companies_processed: targets.length,
      ai_added: totals.ai,
      crelate_added: totals.crelate,
      apollo_added: totals.apollo,
      leadership_added: totals.leadership,
      emails_verified: totals.emails,
      contacts_added: totals.ai + totals.crelate + totals.apollo + totals.leadership,
      duplicates_skipped: totals.skipped,
      per_company: per,
    }).eq('id', runId);
    console.log(`find-contacts run ${runId} done in ${Math.round((Date.now() - startedAt) / 1000)}s — AI:${totals.ai} Crelate:${totals.crelate} Apollo:${totals.apollo} Leadership:${totals.leadership} Hunter-verified:${totals.emails} Skipped:${totals.skipped}`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`find-contacts run ${runId} failed:`, msg);
    await supabase.from('contact_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: msg,
    }).eq('id', runId);
  }
}

// ----------------- HTTP handler -----------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode: 'all' | 'company' = body.mode === 'company' ? 'company' : 'all';
    const companyId: string | undefined = body.companyId;

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const crelateKey = Deno.env.get('CRELATE_API_KEY');
    // Pick up Apollo / Hunter keys under several common names so a
    // dashboard secret named e.g. APOLLO_KEY still works.
    const pickEnv = (...names: string[]): string | undefined => {
      for (const n of names) { const v = Deno.env.get(n); if (v) return v; }
      return undefined;
    };
    const apolloKey = pickEnv('APOLLO_API_KEY', 'APOLLO_KEY', 'APOLLO_TOKEN', 'APOLLO_IO_API_KEY', 'APOLLO_IO_KEY');
    const hunterKey = pickEnv('HUNTER_API_KEY', 'HUNTER_KEY', 'HUNTER_TOKEN', 'HUNTER_IO_API_KEY', 'HUNTER_IO_KEY');

    if (!openaiKey && !crelateKey && !apolloKey) {
      return new Response(JSON.stringify({ success: false, error: 'No contact-discovery secrets configured (need at least one of OPENAI_API_KEY, APOLLO_API_KEY, CRELATE_API_KEY)' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    let targets: CompanyRow[] = [];
    let targetCompanyName: string | null = null;
    if (mode === 'company') {
      if (!companyId) {
        return new Response(JSON.stringify({ success: false, error: 'companyId is required for mode=company' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const { data } = await supabase.from('marketing_companies').select('id, company_name, website').eq('id', companyId).maybeSingle();
      if (!data) {
        return new Response(JSON.stringify({ success: false, error: 'Company not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
    }

    // Mark any orphaned "running" runs older than 15 min as failed so
    // they don't block the UI indefinitely. The previous version of
    // this function could crash mid-run without updating its row.
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
      companies_total: targets.length,
      companies_processed: 0,
    }).select('id').single();
    if (insertErr || !runRow) {
      return new Response(JSON.stringify({ success: false, error: `Failed to create run: ${insertErr?.message || 'unknown'}` }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    EdgeRuntime.waitUntil(processRun(runRow.id, targets, openaiKey, crelateKey, apolloKey, hunterKey));

    return new Response(JSON.stringify({
      success: true,
      run_id: runRow.id,
      mode,
      companies_total: targets.length,
      sources_active: {
        leadership: !!openaiKey,
        apollo: !!apolloKey,
        ai: !!openaiKey,
        crelate: !!crelateKey,
        hunter: !!hunterKey,
      },
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('find-contacts error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
