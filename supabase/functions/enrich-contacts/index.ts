// enrich-contacts — fills in missing fields on EXISTING contacts.
// Different from find-contacts (which discovers new people at a
// company). Here we take a list of contact IDs the user has selected
// in the UI and, per contact, try to fill in: email, title,
// linkedin_url, and phone using Apollo's people/match endpoint first,
// then Hunter.io's email-finder for anything still missing.
//
//   Request body: { contactIds: string[] }
//
// Reuses the contact_runs table for progress tracking (mode='enrich')
// so the existing Contacts-tab polling + progress panel work unchanged.
// Counters:
//   companies_total / companies_processed  → total / processed CONTACTS
//   current_company                        → "Enriching {name}..."
//   contacts_added                         → contacts that got ≥1 field
//   apollo_added                           → contacts enriched by Apollo
//   emails_verified                        → Hunter email fills
//   duplicates_skipped                     → contacts with nothing to fix

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const APOLLO_BASE = "https://api.apollo.io/v1";
const HUNTER_BASE = "https://api.hunter.io/v2";

// ----------------- helpers -----------------

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  let timer: number | undefined;
  const timeout = new Promise<null>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T;
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

const isLinkedInUrl = (u: string | null | undefined): boolean =>
  !!(u && u.includes('linkedin.com/in/'));

// Apollo people/match — returns a single matched profile if found.
// Works on the free tier (doesn't require paid search credits for match).
async function apolloMatch(
  fn: string, ln: string, companyName: string, domain: string | null, apolloKey: string
): Promise<any | null> {
  const body: Record<string, any> = { first_name: fn, last_name: ln };
  if (domain) body.domain = domain;
  else if (companyName) body.organization_name = companyName;
  const r = await fetch(`${APOLLO_BASE}/people/match`, {
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
    console.warn(`Apollo match ${r.status} for ${fn} ${ln}: ${txt.slice(0, 200)}`);
    return null;
  }
  const d = await r.json();
  return d.person || null;
}

async function hunterFinder(fn: string, ln: string, domain: string, hunterKey: string): Promise<{ email: string; score: number } | null> {
  if (!fn || !ln || !domain) return null;
  const url = `${HUNTER_BASE}/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(fn)}&last_name=${encodeURIComponent(ln)}&api_key=${encodeURIComponent(hunterKey)}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  const email = d?.data?.email;
  const score = d?.data?.score || 0;
  if (!email) return null;
  return { email, score };
}

// ----------------- per-contact enrichment -----------------

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_id: string | null;
  email: string | null;
  title: string | null;
  linkedin_url: string | null;
  source_url: string | null;
  phone_work: string | null;
  phone_home: string | null;
  phone_cell: string | null;
};

type EnrichResult = {
  contactId: string;
  contactName: string;
  fieldsUpdated: string[];
  apolloHit: boolean;
  hunterHit: boolean;
  errors: string[];
};

async function enrichContact(
  c: ContactRow,
  companyDomain: string | null,
  apolloKey: string | undefined,
  hunterKey: string | undefined,
): Promise<EnrichResult> {
  const res: EnrichResult = {
    contactId: c.id,
    contactName: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(unnamed)',
    fieldsUpdated: [],
    apolloHit: false,
    hunterHit: false,
    errors: [],
  };

  const fn = (c.first_name || '').trim();
  const ln = (c.last_name || '').trim();
  if (!fn && !ln) return res;
  if (!c.company_name) return res;

  const updates: Record<string, any> = {};
  const notes: string[] = [];

  // 1. Apollo people/match — one call can fill multiple fields.
  if (apolloKey) {
    const p = await withTimeout(
      apolloMatch(fn, ln, c.company_name, companyDomain, apolloKey),
      15_000,
      `Apollo-match(${fn} ${ln})`
    );
    if (p) {
      if (!c.email && p.email && typeof p.email === 'string') {
        updates.email = p.email;
        res.fieldsUpdated.push('email');
      }
      if (!c.title && p.title && typeof p.title === 'string') {
        updates.title = p.title;
        res.fieldsUpdated.push('title');
      }
      const existingLinkedin = c.linkedin_url || (isLinkedInUrl(c.source_url) ? c.source_url : '');
      if (!existingLinkedin && p.linkedin_url && isLinkedInUrl(p.linkedin_url)) {
        updates.linkedin_url = p.linkedin_url;
        res.fieldsUpdated.push('linkedin_url');
      }
      if (!c.phone_work && p.organization?.phone) {
        updates.phone_work = p.organization.phone;
        res.fieldsUpdated.push('phone_work');
      }
      if (!c.phone_cell && p.mobile_phone) {
        updates.phone_cell = p.mobile_phone;
        res.fieldsUpdated.push('phone_cell');
      }
      if (res.fieldsUpdated.length > 0) {
        res.apolloHit = true;
        notes.push(`Apollo filled: ${res.fieldsUpdated.join(', ')}`);
      }
    }
  }

  // 2. Hunter as fallback for email if still missing.
  if (!updates.email && !c.email && hunterKey && companyDomain && fn && ln) {
    const h = await withTimeout(
      hunterFinder(fn, ln, companyDomain, hunterKey),
      8_000,
      `Hunter(${fn} ${ln}@${companyDomain})`
    );
    if (h?.email) {
      updates.email = h.email;
      res.fieldsUpdated.push('email');
      res.hunterHit = true;
      notes.push(`Hunter filled email (score=${h.score})`);
    }
  }

  if (Object.keys(updates).length === 0) return res;

  // Append a note but don't clobber existing notes.
  const existingNotesRow = await supabase.from('marketing_contacts').select('notes').eq('id', c.id).maybeSingle();
  const existingNote = existingNotesRow.data?.notes || '';
  const stamp = new Date().toISOString().slice(0, 10);
  updates.notes = (existingNote ? existingNote + '\n' : '') + `[${stamp}] ${notes.join(' · ')}`;
  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('marketing_contacts').update(updates).eq('id', c.id);
  if (error) res.errors.push(error.message);
  return res;
}

// ----------------- background task -----------------

async function processRun(runId: string, contactIds: string[], apolloKey: string|undefined, hunterKey: string|undefined) {
  const startedAt = Date.now();
  try {
    // Load the contacts + their companies' websites in two queries so
    // we can pass a domain to Apollo/Hunter without N round-trips.
    const { data: contacts } = await supabase.from('marketing_contacts')
      .select('id, first_name, last_name, company_name, company_id, email, title, linkedin_url, source_url, phone_work, phone_home, phone_cell')
      .in('id', contactIds);
    const rows: ContactRow[] = (contacts || []) as ContactRow[];

    const coIds = Array.from(new Set(rows.map(r => r.company_id).filter(Boolean) as string[]));
    const domainByCoId = new Map<string, string | null>();
    if (coIds.length > 0) {
      const { data: cos } = await supabase.from('marketing_companies').select('id, website').in('id', coIds);
      for (const co of (cos || [])) domainByCoId.set(co.id, extractDomain(co.website));
    }

    const results: EnrichResult[] = [];
    const totals = { enriched: 0, apollo: 0, hunter: 0, skipped: 0 };

    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      await supabase.from('contact_runs').update({
        current_company: `Enriching ${c.first_name || ''} ${c.last_name || ''}`.trim(),
        companies_processed: i,
      }).eq('id', runId);

      const domain = c.company_id ? (domainByCoId.get(c.company_id) || null) : null;
      const r = await enrichContact(c, domain, apolloKey, hunterKey);
      results.push(r);
      if (r.fieldsUpdated.length > 0) totals.enriched++;
      else totals.skipped++;
      if (r.apolloHit) totals.apollo++;
      if (r.hunterHit) totals.hunter++;

      // per_company here stores per-contact results (same column, overloaded).
      await supabase.from('contact_runs').update({
        companies_processed: i + 1,
        contacts_added: totals.enriched,
        apollo_added: totals.apollo,
        emails_verified: totals.hunter,
        duplicates_skipped: totals.skipped,
        per_company: results.map(r => ({
          company: r.contactName,
          ai_added: 0,
          crelate_added: 0,
          apollo_added: r.apolloHit ? 1 : 0,
          leadership_added: 0,
          emails_verified: r.hunterHit ? 1 : 0,
          duplicates_skipped: r.fieldsUpdated.length === 0 ? 1 : 0,
          errors: r.errors,
          fields_updated: r.fieldsUpdated,
        })),
      }).eq('id', runId);
    }

    await supabase.from('contact_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_company: null,
    }).eq('id', runId);
    console.log(`enrich-contacts run ${runId} done in ${Math.round((Date.now() - startedAt) / 1000)}s — enriched ${totals.enriched} of ${rows.length}, Apollo:${totals.apollo} Hunter:${totals.hunter}`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`enrich-contacts run ${runId} failed:`, msg);
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
    const contactIds: string[] = Array.isArray(body.contactIds) ? body.contactIds.filter((x: any) => typeof x === 'string') : [];
    if (contactIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'contactIds array is required and must be non-empty' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const apolloKey = Deno.env.get('APOLLO_API_KEY');
    const hunterKey = Deno.env.get('HUNTER_API_KEY');
    if (!apolloKey && !hunterKey) {
      return new Response(JSON.stringify({ success: false, error: 'Neither APOLLO_API_KEY nor HUNTER_API_KEY is configured' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Auto-clear stuck runs older than 15 min.
    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from('contact_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Timed out (>15 min without completion)' })
      .eq('status', 'running')
      .lt('started_at', staleCutoff);

    const { data: runRow, error: insertErr } = await supabase.from('contact_runs').insert({
      status: 'running',
      mode: 'enrich',
      target_company_id: null,
      target_company_name: null,
      companies_total: contactIds.length,
      companies_processed: 0,
    }).select('id').single();
    if (insertErr || !runRow) {
      return new Response(JSON.stringify({ success: false, error: `Failed to create run: ${insertErr?.message || 'unknown'}` }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    EdgeRuntime.waitUntil(processRun(runRow.id, contactIds, apolloKey, hunterKey));

    return new Response(JSON.stringify({
      success: true,
      run_id: runRow.id,
      mode: 'enrich',
      companies_total: contactIds.length,
      sources_active: { apollo: !!apolloKey, hunter: !!hunterKey },
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('enrich-contacts error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
