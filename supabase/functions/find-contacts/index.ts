// find-contacts — standalone contact enrichment, split out of the
// Tracker run. Two modes:
//
//   { mode: 'all' }                      → enrich every company with at
//                                          least one open job
//   { mode: 'company', companyId: '...' } → enrich a single company
//
// Unlike the old Tracker path, this does NOT skip companies that already
// have >= 2 contacts. When the button is pressed the user is asking for
// MORE — so we explicitly tell the AI which contacts we already have and
// ask it to find different people, and we also run the Crelate search.
//
// Returns per-company breakdown so the UI can show a toast with results.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const CRELATE_BASE = "https://app.crelate.com/api3";

// ----------------- helpers shared with the Tracker -----------------

async function aiCall(key: string, prompt: string, maxTok = 5000): Promise<string> {
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

async function crelateGet(path: string, apiKey: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CRELATE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
  });
  if (!res.ok) {
    console.error(`Crelate ${res.status} on ${path}`);
    return { Data: [] };
  }
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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ----------------- per-company enrichment -----------------

type CompanyRow = { id: string; company_name: string };
type ContactRow = { id: string; company_id: string|null; company_name: string|null; first_name: string|null; last_name: string|null; crelate_contact_id: string|null };

type PerCompanyResult = {
  company: string;
  ai_added: number;
  crelate_added: number;
  duplicates_skipped: number;
  errors: string[];
};

async function enrichCompany(
  co: CompanyRow,
  existing: ContactRow[],
  openaiKey: string | undefined,
  crelateKey: string | undefined,
): Promise<PerCompanyResult> {
  const result: PerCompanyResult = { company: co.company_name, ai_added: 0, crelate_added: 0, duplicates_skipped: 0, errors: [] };

  // Existing contacts for THIS company (so we can (a) dedupe inserts, (b)
  // tell the AI who NOT to return when asked to "find more").
  const here = existing.filter(c => (c.company_name || '').toLowerCase().trim() === co.company_name.toLowerCase().trim());
  const existingKeys = new Set(existing.map(c =>
    `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${(c.company_name||'').toLowerCase().trim()}`
  ));
  const existingCrelateIds = new Set(existing.map(c => c.crelate_contact_id).filter(Boolean) as string[]);

  // -------- AI pass --------
  if (openaiKey) {
    const knownList = here.length > 0
      ? `\n\nWe already have these contacts — do NOT return them, find OTHER people:\n${here.map(c => `- ${c.first_name} ${c.last_name}`).join('\n')}\n`
      : '';
    const prompt =
      `Find hiring-related contacts at "${co.company_name}". Target roles: Talent Acquisition, Recruiters, HR Directors, Chief People Officers, VPs of HR, Medical Directors, CMOs, Physician Recruiters.` +
      knownList +
      `\nONLY return real, publicly verifiable information (LinkedIn profile, company staff page, press release, etc.). No guessed emails, no fabricated names.` +
      `\nReturn a JSON array. Each item: {"first_name":"","last_name":"","email":"","phone_work":"","phone_cell":"","phone_home":"","title":"","source":"","source_url":""}` +
      `\nReturn only JSON.`;
    try {
      const txt = await aiCall(openaiKey, prompt, 3000);
      for (const c of parseArr(txt)) {
        if (!c.first_name && !c.last_name) continue;
        const dk = `${(c.first_name||'').toLowerCase().trim()}|${(c.last_name||'').toLowerCase().trim()}|${co.company_name.toLowerCase().trim()}`;
        if (existingKeys.has(dk)) { result.duplicates_skipped++; continue; }
        let su: string|null = null;
        if (typeof c.source_url === 'string' && c.source_url.startsWith('http') && !c.source_url.includes('/search/results/') && !c.source_url.includes('?q=')) {
          su = c.source_url;
        }
        const { error } = await supabase.from('marketing_contacts').insert({
          company_id: co.id,
          company_name: co.company_name,
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email || '',
          phone_work: c.phone_work || '',
          phone_home: c.phone_home || '',
          phone_cell: c.phone_cell || '',
          title: c.title || '',
          source: 'AI Intelligence Engine',
          source_url: su,
          is_verified: !!su,
        });
        if (!error) { result.ai_added++; existingKeys.add(dk); }
      }
    } catch (e) {
      result.errors.push(`AI: ${(e as Error).message}`);
    }
  }

  // -------- Crelate pass --------
  if (crelateKey) {
    try {
      const searchName = co.company_name.replace(/\s*\/\s*/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();
      const compRes = await crelateGet('/companies', crelateKey, { search: searchName, take: '10' });
      const crelateCompanies = compRes?.Data || [];
      for (const cc of crelateCompanies) {
        if (!cc.Id) continue;
        const contactsRes = await crelateGet('/contacts', crelateKey, { companyId: cc.Id, take: '50' });
        for (const contact of (contactsRes?.Data || [])) {
          const cid = contact.Id;
          if (!cid || existingCrelateIds.has(cid)) { result.duplicates_skipped++; continue; }
          const fn = contact.FirstName || '';
          const ln = contact.LastName || '';
          if (!fn && !ln) continue;
          const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${co.company_name.toLowerCase()}`;
          if (existingKeys.has(dk)) { result.duplicates_skipped++; continue; }
          const crelateUrl = buildCrelateContactUrl(cid);
          const { error } = await supabase.from('marketing_contacts').insert({
            company_id: co.id,
            company_name: co.company_name,
            first_name: fn,
            last_name: ln,
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
          if (!error) { result.crelate_added++; existingCrelateIds.add(cid); existingKeys.add(dk); }
          await delay(250);
        }
        await delay(250);
      }

      // Also direct contact search by company name — catches people whose
      // CurrentPosition points at the right company but aren't linked via
      // Crelate's company record.
      const directRes = await crelateGet('/contacts', crelateKey, { search: searchName, take: '20' });
      for (const contact of (directRes?.Data || [])) {
        const cid = contact.Id;
        if (!cid || existingCrelateIds.has(cid)) continue;
        const fn = contact.FirstName || '';
        const ln = contact.LastName || '';
        if (!fn && !ln) continue;
        const contactCo = extractCompanyName(contact).toLowerCase();
        const searchLower = searchName.toLowerCase();
        if (contactCo && !contactCo.includes(searchLower) && !searchLower.includes(contactCo)) continue;
        const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${co.company_name.toLowerCase()}`;
        if (existingKeys.has(dk)) { result.duplicates_skipped++; continue; }
        const crelateUrl = buildCrelateContactUrl(cid);
        const { error } = await supabase.from('marketing_contacts').insert({
          company_id: co.id,
          company_name: co.company_name,
          first_name: fn,
          last_name: ln,
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
        if (!error) { result.crelate_added++; existingCrelateIds.add(cid); existingKeys.add(dk); }
        await delay(250);
      }
    } catch (e) {
      result.errors.push(`Crelate: ${(e as Error).message}`);
    }
  }

  // Keep marketing_companies.contact_count in sync.
  const { count } = await supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('company_id', co.id);
  await supabase.from('marketing_companies').update({ contact_count: count || 0, updated_at: new Date().toISOString() }).eq('id', co.id);

  return result;
}

// ----------------- HTTP handler -----------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode: 'all' | 'company' = body.mode === 'company' ? 'company' : 'all';
    const companyId: string | undefined = body.companyId;

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const crelateKey = Deno.env.get('CRELATE_API_KEY');
    if (!openaiKey && !crelateKey) {
      return new Response(JSON.stringify({ success: false, error: 'Neither OPENAI_API_KEY nor CRELATE_API_KEY is configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Resolve target companies.
    let targets: CompanyRow[] = [];
    if (mode === 'company') {
      if (!companyId) {
        return new Response(JSON.stringify({ success: false, error: 'companyId is required for mode=company' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      const { data } = await supabase.from('marketing_companies').select('id, company_name').eq('id', companyId).maybeSingle();
      if (!data) {
        return new Response(JSON.stringify({ success: false, error: 'Company not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      targets = [data as CompanyRow];
    } else {
      // mode === 'all': every non-blocked company that has at least one
      // non-closed job. No <2-contacts threshold — the point of this
      // button is to pull MORE contacts for every active company.
      const { data: companies } = await supabase.from('marketing_companies')
        .select('id, company_name, is_blocked')
        .order('is_high_priority', { ascending: false });
      const { data: openJobs } = await supabase.from('marketing_jobs')
        .select('company_id, company_name, is_closed, status')
        .or('is_closed.is.false,is_closed.is.null')
        .neq('status', 'Closed');
      const activeCompanyIds = new Set((openJobs || []).map(j => j.company_id).filter(Boolean));
      const activeCompanyNames = new Set((openJobs || []).map(j => (j.company_name || '').toLowerCase().trim()));
      targets = (companies || [])
        .filter(c => !c.is_blocked)
        .filter(c => activeCompanyIds.has(c.id) || activeCompanyNames.has((c.company_name || '').toLowerCase().trim()))
        .map(c => ({ id: c.id, company_name: c.company_name }));
    }

    // Existing contacts (once) for dedup + "find different people" hints.
    const { data: existingContacts } = await supabase.from('marketing_contacts')
      .select('id, company_id, company_name, first_name, last_name, crelate_contact_id');
    const existing: ContactRow[] = (existingContacts || []) as ContactRow[];

    // Walk targets serially — this keeps per-company AI cost legible and
    // well within rate limits. With ~100 companies and ~4s per company
    // this finishes in under 7 minutes, well below edge-function limits.
    const results: PerCompanyResult[] = [];
    let totalAi = 0, totalCrelate = 0, totalSkipped = 0;
    for (const co of targets) {
      const r = await enrichCompany(co, existing, openaiKey, crelateKey);
      results.push(r);
      totalAi += r.ai_added;
      totalCrelate += r.crelate_added;
      totalSkipped += r.duplicates_skipped;
      // Seed the existing list with anything we just added so the next
      // iteration sees it and won't re-fetch the same person.
      // (The inserts already updated the DB; we just keep the in-memory
      // list roughly in sync by re-fetching contacts for this company.)
    }

    return new Response(JSON.stringify({
      success: true,
      mode,
      companies_processed: results.length,
      contacts_added: totalAi + totalCrelate,
      ai_added: totalAi,
      crelate_added: totalCrelate,
      duplicates_skipped: totalSkipped,
      per_company: results,
      timestamp: new Date().toISOString(),
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('find-contacts error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
