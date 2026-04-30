// extension-bridge — bidirectional Crelate ⇄ MatchPoint sync surface for
// the chrome extension. Uses the same Crelate API key (CRELATE_API_KEY
// env) as push-to-crelate; relies on its company/title resolvers via
// inline copies (we keep the function self-contained so a redeploy of
// push-to-crelate doesn't break the extension).
//
// Path C scope (per the user's pick):
//   - All three entities: contact / company / job
//   - Always-ask conflict policy — the function detects field-level
//     divergence and returns a 'conflict' response; the extension renders
//     the side-by-side dialog and re-calls with explicit field choices.
//
// Single-record actions only in this version (push_contact / pull_contact
// / push_company / pull_company / push_job / pull_job). Bulk actions
// reuse these one at a time with progress reported by the extension.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS — chrome extensions have origin like chrome-extension://<id> which
// changes between unpacked and Web Store builds. We accept any
// chrome-extension:// origin plus the existing app origins.
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowed =
    origin.startsWith('chrome-extension://') ||
    origin === 'https://matchpoint-nu-dun.vercel.app' ||
    origin.startsWith('http://localhost:');
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://matchpoint-nu-dun.vercel.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

const SU = Deno.env.get("SUPABASE_URL")!;
const SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CK = Deno.env.get("CRELATE_API_KEY");
const sb = createClient(SU, SK);

const CB = "https://app.crelate.com/api3";
const DL = 400; // ms between Crelate calls — same as push-to-crelate

// Crelate tenant-scoped constants required when creating a Job entity.
// Same defaults as the existing push-to-crelate function; user's secrets
// override if they've customized.
const CR_OPP_TYPE_ID = Deno.env.get('CRELATE_OPPORTUNITY_TYPE_ID')
  || '91835d38-fcfd-4128-10d3-f959ef60dc08';
const CR_SALES_STATUS_ID = Deno.env.get('CRELATE_SALES_WORKFLOW_STATUS_ID')
  || '05bdf87b-cdde-48d2-bfe7-aa6a0126d947';

const W = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: any) => typeof v === 'string' && UI.test(v);
const norm = (s: string) =>
  (s || '').toLowerCase().trim().replace(/[,.\-&()'"]/g, ' ').replace(/\s+/g, ' ').trim();

// ── Crelate HTTP helpers ────────────────────────────────────────────
async function crelateGet(path: string, q: Record<string, string> = {}) {
  if (!CK) return null;
  const u = new URL(`${CB}${path}`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  for (let i = 0; i <= 2; i++) {
    try {
      const r = await fetch(u.toString(), {
        method: 'GET',
        headers: { 'X-Api-Key': CK, 'Accept': 'application/json' },
      });
      if (r.status === 429) { await W(3000 * (i + 1)); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await W(2000); }
  }
  return null;
}

async function crelatePost(path: string, entity: any) {
  if (!CK) return { ok: false, err: 'No CRELATE_API_KEY', status: 0 };
  for (let i = 0; i <= 2; i++) {
    try {
      const r = await fetch(`${CB}${path}`, {
        method: 'POST',
        headers: {
          'X-Api-Key': CK,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity }),
      });
      if (r.status === 429) { await W(3000 * (i + 1)); continue; }
      const t = await r.text();
      let d: any; try { d = JSON.parse(t); } catch { d = t; }
      return {
        ok: r.ok,
        data: d,
        status: r.status,
        err: r.ok ? undefined : (d?.Errors?.[0]?.Message || `HTTP ${r.status}`),
      };
    } catch { await W(2000); }
  }
  return { ok: false, err: 'retry', status: 0 };
}

async function crelatePatch(path: string, entity: any): Promise<{ ok: boolean; status?: number; err?: string; rawBody?: string }> {
  if (!CK) return { ok: false, err: 'No CRELATE_API_KEY' };
  for (let i = 0; i <= 2; i++) {
    try {
      const r = await fetch(`${CB}${path}`, {
        method: 'PATCH',
        headers: {
          'X-Api-Key': CK,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity }),
      });
      if (r.status === 429) { await W(3000 * (i + 1)); continue; }
      if (r.ok) return { ok: true, status: r.status };
      // Capture the body so the caller can surface a useful message
      // instead of "PATCH failed". Crelate sometimes returns a structured
      // { Errors: [{ Message }] } and sometimes a plain string.
      const text = await r.text();
      let parsed: any; try { parsed = JSON.parse(text); } catch { parsed = null; }
      const err = parsed?.Errors?.[0]?.Message
        || parsed?.error
        || (text && text.length < 500 ? text : `HTTP ${r.status}`);
      return { ok: false, status: r.status, err, rawBody: text };
    } catch (e) { await W(2000); }
  }
  return { ok: false, err: 'retry exhausted' };
}

const extractId = (d: any): string => {
  if (!d) return '';
  if (typeof d === 'string' && isUuid(d)) return d;
  if (typeof d.Data === 'string' && isUuid(d.Data)) return d.Data;
  if (d.Data?.Id && isUuid(d.Data.Id)) return d.Data.Id;
  if (d.Id && isUuid(d.Id)) return d.Id;
  return '';
};

// Crelate's 409 duplicate-record error embeds the offending Crelate id
// directly in the message text:
//   "A duplicate record of type Contacts with ID '7456fdb0-...' was found."
// Pull it out so we can link + diff instead of failing the push entirely.
const extractDupIdFromError = (err: string | undefined | null): string | null => {
  if (!err) return null;
  const m = err.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
};

// ── Sync log + linking ──────────────────────────────────────────────
async function logSync(entry: {
  entity_type: 'contact' | 'company' | 'job';
  direction: 'push' | 'pull';
  action: 'create' | 'update' | 'skip' | 'conflict' | 'error';
  mp_id?: string | null;
  crelate_id?: string | null;
  fields_changed?: any;
  conflict_resolution?: string | null;
  error_message?: string | null;
  actor?: string;
}) {
  try {
    await sb.from('sync_log').insert({
      entity_type: entry.entity_type,
      direction: entry.direction,
      action: entry.action,
      mp_id: entry.mp_id || null,
      crelate_id: entry.crelate_id || null,
      fields_changed: entry.fields_changed || null,
      conflict_resolution: entry.conflict_resolution || null,
      error_message: entry.error_message ? String(entry.error_message).slice(0, 500) : null,
      actor: entry.actor || 'extension',
    });
  } catch (e) {
    console.log('[bridge] log insert failed:', (e as Error).message);
  }
}

async function upsertLink(entity_type: 'contact' | 'company' | 'job', mp_id: string, crelate_id: string, direction: 'push' | 'pull') {
  try {
    await sb.from('crelate_links').upsert({
      entity_type, mp_id, crelate_id,
      last_synced_at: new Date().toISOString(),
      last_direction: direction,
    }, { onConflict: 'entity_type,mp_id' });
  } catch (e) {
    console.log('[bridge] link upsert failed:', (e as Error).message);
  }
}

// ── Field mapping (contacts) ─────────────────────────────────────────
// Single source of truth for which MP fields ↔ which Crelate fields.
// `mpToCrelate` builds the entity payload for a POST/PATCH; `crelateToMp`
// extracts the analogous values from a Crelate response so we can
// dedupe-compare without forcing the extension to know Crelate's shape.
function mpToCrelateContact(mp: any): any {
  const ent: any = {};
  if (mp.first_name) ent.FirstName = mp.first_name.trim();
  if (mp.last_name)  ent.LastName  = mp.last_name.trim();
  if (mp.first_name && !mp.last_name) ent.LastName = '(Unknown)';
  if (mp.email)      ent.EmailAddresses_Work = { Value: mp.email, IsPrimary: true };
  if (mp.title)      ent.CurrentPosition = { JobTitle: mp.title, IsPrimary: true };
  if (mp.linkedin_url) ent.Websites_LinkedIn = { Value: mp.linkedin_url, IsPrimary: true };
  if (mp.notes)      ent.Description = String(mp.notes).slice(0, 5000);
  if (mp.phone_work) ent.PhoneNumbers_Work = { Value: mp.phone_work, IsPrimary: true };
  if (mp.phone_cell) ent.PhoneNumbers_Mobile = { Value: mp.phone_cell, IsPrimary: !mp.phone_work };
  if (mp.phone_home) ent.PhoneNumbers_Home = { Value: mp.phone_home, IsPrimary: false };
  return ent;
}

function crelateToMpContact(c: any): Partial<any> {
  // Crelate returns various shapes depending on endpoint. Be tolerant.
  const email = c.EmailAddresses_Work?.Value || c.PrimaryEmail || c.Email || '';
  const linkedin = c.Websites_LinkedIn?.Value || '';
  return {
    first_name: c.FirstName || '',
    last_name:  c.LastName || '',
    email,
    title:      c.CurrentPosition?.JobTitle || c.JobTitle || '',
    company_name: c.CurrentPosition?.CompanyName || c.AccountName || '',
    linkedin_url: linkedin,
    phone_work: c.PhoneNumbers_Work?.Value || '',
    phone_cell: c.PhoneNumbers_Mobile?.Value || '',
    phone_home: c.PhoneNumbers_Home?.Value || '',
    notes:      c.Description || '',
  };
}

// Compute the field-level diff between an MP record and a Crelate
// record. Returns { conflicts, mp_only, crelate_only }. Used by
// dedupe_check_contact and the conflict dialog.
function diffContact(mp: any, crelateMapped: any): { conflicts: any[]; mp_empty: string[]; crelate_empty: string[] } {
  const fields: Array<keyof typeof crelateMapped> = [
    'first_name', 'last_name', 'email', 'title', 'company_name',
    'linkedin_url', 'phone_work', 'phone_cell', 'phone_home', 'notes',
  ];
  const conflicts: any[] = [];
  const mp_empty: string[] = [];
  const crelate_empty: string[] = [];
  for (const f of fields) {
    const mv = (mp[f] || '').toString().trim();
    const cv = (crelateMapped[f] || '').toString().trim();
    if (!mv && !cv) continue;
    if (!mv) { mp_empty.push(f as string); continue; }
    if (!cv) { crelate_empty.push(f as string); continue; }
    // Email/linkedin compared lowercase; everything else case-insensitive
    // trimmed but otherwise literal.
    if (mv.toLowerCase() !== cv.toLowerCase()) {
      conflicts.push({ field: f, mp_value: mv, crelate_value: cv });
    }
  }
  return { conflicts, mp_empty, crelate_empty };
}

// ── Field mapping (companies) ────────────────────────────────────────
// MP marketing_companies has company_name + website + homepage_url +
// notes + company_phone + location (free-form "City, State"). Crelate
// company entity has Name + Websites_Other + Description + PhoneNumbers_Work
// + Locations_Business{City,State}. We split MP's location into city/state
// best-effort on push, and reassemble on pull.
function splitLocation(loc: string | null | undefined): { city: string; state: string } {
  if (!loc) return { city: '', state: '' };
  const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
  return { city: parts[0] || '', state: parts[1] || '' };
}

function mpToCrelateCompany(mp: any): any {
  const ent: any = {};
  if (mp.company_name) ent.Name = mp.company_name.trim();
  const website = mp.website || mp.homepage_url || '';
  if (website) ent.Websites_Other = { Value: website, IsPrimary: true };
  if (mp.notes) ent.Description = String(mp.notes).slice(0, 5000);
  const phone = mp.company_phone || mp.contact_phone || '';
  if (phone) ent.PhoneNumbers_Work = { Value: phone, IsPrimary: true };
  const { city, state } = splitLocation(mp.location);
  if (city || state) ent.Locations_Business = { City: city, State: state, IsPrimary: true };
  return ent;
}

function crelateToMpCompany(c: any): any {
  const website = c.Websites_Other?.Value || c.Website || '';
  const phone   = c.PhoneNumbers_Work?.Value || '';
  const city    = c.Locations_Business?.City || '';
  const state   = c.Locations_Business?.State || '';
  const location = [city, state].filter(Boolean).join(', ');
  return {
    company_name: c.Name || '',
    website,
    notes: c.Description || '',
    company_phone: phone,
    location,
  };
}

function diffCompany(mp: any, mapped: any): { conflicts: any[]; mp_empty: string[]; crelate_empty: string[] } {
  const fields = ['company_name', 'website', 'notes', 'company_phone', 'location'] as const;
  const conflicts: any[] = [];
  const mp_empty: string[] = [];
  const crelate_empty: string[] = [];
  for (const f of fields) {
    const mv = (mp[f] || '').toString().trim();
    const cv = (mapped[f] || '').toString().trim();
    if (!mv && !cv) continue;
    if (!mv) { mp_empty.push(f); continue; }
    if (!cv) { crelate_empty.push(f); continue; }
    if (mv.toLowerCase() !== cv.toLowerCase()) {
      conflicts.push({ field: f, mp_value: mv, crelate_value: cv });
    }
  }
  return { conflicts, mp_empty, crelate_empty };
}

async function findCrelateCompany(name: string) {
  if (!name) return null;
  try {
    const r = await crelateGet('/companies', { name, limit: '20' });
    const target = norm(name);
    for (const c of (r?.Data || [])) {
      if (!c.Id || !isUuid(c.Id) || !c.Name) continue;
      if (norm(c.Name) === target) return c;
      // Prefix / substring match — Crelate's name search is fuzzy enough
      // that exact-string matches sometimes don't show up if punctuation
      // differs ("Acme, Inc." vs "Acme Inc"). Accept the first close match.
      const nc = norm(c.Name);
      if (target && (nc.startsWith(target + ' ') || target.startsWith(nc + ' ') || nc === target)) return c;
    }
    return null;
  } catch { return null; }
}

// ── Field mapping (jobs) ─────────────────────────────────────────────
// Crelate's job entity is the most complex of the three. Pushing a job
// requires resolving (a) the company by name → AccountId, (b) the job
// title by string → JobTitleId, (c) the constant OpportunityTypeId and
// SalesWorkflowItemStatusId. Rather than re-implement the title /
// company resolvers (which the existing push-to-crelate function has
// in mature form), push_job below internally invokes that function for
// the heavy work. Pull and dedupe are written here directly.

function mpToCrelateJobShallow(mp: any): any {
  // For PATCH (update existing job) — fields that don't need
  // resolution. Name is dropped on PATCH for the same Crelate-dedupe
  // reason as contacts/companies.
  const ent: any = {};
  if (mp.description) ent.Description = String(mp.description).slice(0, 10000);
  const url = mp.website_job_desc || mp.job_url || '';
  if (url) ent.Websites_Other = { Value: url, IsPrimary: true };
  if (mp.salary_range) ent.PortalCompensation = mp.salary_range;
  return ent;
}

function crelateToMpJob(j: any): any {
  const url   = j.Websites_Other?.Value || '';
  const city  = j.Locations_Business?.City || '';
  const state = j.Locations_Business?.State || '';
  const location = [city, state].filter(Boolean).join(', ');
  const company = j.AccountId?.Title || j.AccountName || '';
  const title   = j.JobTitleId?.Title || j.Name || '';
  return {
    job_title: title,
    company_name: company,
    description: j.Description || '',
    city, state, location,
    job_url: url,
    website_job_desc: url,
    salary_range: j.PortalCompensation || '',
    status: j.IsClosed ? 'Closed' : (j.IsLead ? 'Lead' : 'Active'),
    is_closed: !!j.IsClosed,
  };
}

function diffJob(mp: any, mapped: any): { conflicts: any[]; mp_empty: string[]; crelate_empty: string[] } {
  // Skip job_title and company_name in the diff because Crelate stores
  // them in resolved-id form (JobTitleId, AccountId), so any literal
  // string compare would always show divergence on otherwise-equivalent
  // records. Compare description / location / url / salary instead.
  const fields = ['description', 'location', 'job_url', 'website_job_desc', 'salary_range'] as const;
  const conflicts: any[] = [];
  const mp_empty: string[] = [];
  const crelate_empty: string[] = [];
  for (const f of fields) {
    const mv = (mp[f] || '').toString().trim();
    const cv = (mapped[f] || '').toString().trim();
    if (!mv && !cv) continue;
    if (!mv) { mp_empty.push(f); continue; }
    if (!cv) { crelate_empty.push(f); continue; }
    if (mv.toLowerCase() !== cv.toLowerCase()) {
      conflicts.push({ field: f, mp_value: mv, crelate_value: cv });
    }
  }
  return { conflicts, mp_empty, crelate_empty };
}

async function findCrelateJob(title: string, company: string) {
  if (!title) return null;
  // /jobs/search is the only Crelate endpoint that filters; combine
  // title + company in the query to narrow.
  const q = company ? `${title} ${company}` : title;
  try {
    const r = await crelateGet('/jobs/search', { query: q, limit: '20' });
    const target = norm(title);
    const ctarget = norm(company || '');
    for (const j of (r?.Data || [])) {
      if (!j.Id || !isUuid(j.Id)) continue;
      const t = norm(j.Title || '');
      // Crelate's job display Title is "<JobTitle> - <CompanyName>" so
      // we accept either the full string or the JobTitle prefix as a
      // match.
      if (t === target) return j;
      if (target && t.startsWith(target + ' ')) return j;
      if (target && ctarget && t.includes(target) && t.includes(ctarget)) return j;
    }
    return null;
  } catch { return null; }
}

// ── Find an existing Crelate contact by name+email ───────────────────
async function findCrelateContact(fn: string, ln: string, email?: string) {
  // Email match first if available — far more reliable than name match.
  if (email) {
    try {
      const r = await crelateGet('/contacts', { email, limit: '5' });
      for (const i of (r?.Data || [])) {
        if ((i.EmailAddresses_Work?.Value || '').toLowerCase().trim() === email.toLowerCase().trim()) return i;
        if ((i.PrimaryEmail || '').toLowerCase().trim() === email.toLowerCase().trim()) return i;
      }
    } catch {}
  }
  if (fn && ln) {
    try {
      const r = await crelateGet('/contacts', { name: `${fn} ${ln}`, limit: '10' });
      for (const i of (r?.Data || [])) {
        if (
          (i.FirstName || '').toLowerCase().trim() === fn.toLowerCase().trim() &&
          (i.LastName  || '').toLowerCase().trim() === ln.toLowerCase().trim()
        ) return i;
      }
    } catch {}
  }
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const R = (o: any, status = 200) => new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) },
  });

  if (!CK) {
    return R({ success: false, error: 'CRELATE_API_KEY not set in Supabase secrets' }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch (e) {
    return R({ success: false, error: `JSON parse failed: ${(e as Error).message}` }, 400);
  }

  const action: string = body.action;
  const actor: string = body.actor || 'extension';

  try {
    // ── ping — quick smoke test ──────────────────────────────────────
    if (action === 'ping') {
      return R({ success: true, version: 'v1', has_crelate_key: !!CK, ts: new Date().toISOString() });
    }

    // ── search_mp_contacts — extension popup type-ahead ──────────────
    if (action === 'search_mp_contacts') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, contacts: [] });
      const { data, error } = await sb.from('marketing_contacts')
        .select('id, first_name, last_name, email, title, company_name, linkedin_url, phone_work, phone_cell, phone_home, notes, crelate_contact_id, outreach_status')
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(20);
      if (error) return R({ success: false, error: error.message }, 500);
      return R({ success: true, contacts: data || [] });
    }

    // ── dedupe_check_contact — does this MP contact match an existing
    //    Crelate contact? Returns one of:
    //      none       — no match found, safe to create
    //      linked     — already paired via crelate_links / crelate_contact_id
    //      match      — found an exact match on email or (first, last)
    //      conflict   — found a match but with field divergence
    if (action === 'dedupe_check_contact') {
      const mp_id: string = body.mp_id;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_contacts').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp contact not found' }, 404);

      // Already linked?
      const { data: existingLink } = await sb.from('crelate_links')
        .select('crelate_id, last_synced_at, last_direction')
        .eq('entity_type', 'contact').eq('mp_id', mp_id).maybeSingle();
      const linkedId = existingLink?.crelate_id || mp.crelate_contact_id || null;

      if (linkedId) {
        // Fetch Crelate side and diff against MP.
        const cr = await crelateGet(`/contacts/${linkedId}`);
        const crData = cr?.Data;
        if (!crData) {
          return R({ success: true, status: 'linked', crelate_id: linkedId, crelate: null, diff: null, mp });
        }
        const mapped = crelateToMpContact(crData);
        const diff = diffContact(mp, mapped);
        return R({
          success: true,
          status: diff.conflicts.length > 0 ? 'conflict' : 'linked',
          crelate_id: linkedId,
          crelate: mapped,
          diff,
          mp,
        });
      }

      // Not linked — try to find a match in Crelate by email or name.
      const found = await findCrelateContact(mp.first_name, mp.last_name, mp.email);
      if (!found) return R({ success: true, status: 'none', mp });
      const mapped = crelateToMpContact(found);
      const diff = diffContact(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : 'match',
        crelate_id: found.Id,
        crelate: mapped,
        diff,
        mp,
      });
    }

    // ── push_contact — MP → Crelate. Creates if no Crelate id;
    //    otherwise PATCHes. If `field_choices` is supplied it overrides
    //    the default merge (used by the conflict dialog).
    if (action === 'push_contact') {
      const mp_id: string = body.mp_id;
      // field_choices: { field: 'mp' | 'crelate' | { override: string } }
      const choices: Record<string, any> | undefined = body.field_choices;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_contacts').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp contact not found' }, 404);

      const { data: link } = await sb.from('crelate_links')
        .select('crelate_id').eq('entity_type', 'contact').eq('mp_id', mp_id).maybeSingle();
      const linkedId: string | null = link?.crelate_id || mp.crelate_contact_id || null;

      // Build the resolved MP record using the user's per-field choices
      // when present. For fields the user picked 'crelate', we don't
      // include them in the push payload (push is one-way; the Crelate
      // side already has those values).
      const merged = { ...mp };
      const fields_changed: any = {};
      if (choices) {
        for (const [field, choice] of Object.entries(choices)) {
          if (choice === 'crelate') {
            delete (merged as any)[field];
          } else if (typeof choice === 'object' && choice && 'override' in choice) {
            (merged as any)[field] = (choice as any).override;
            fields_changed[field] = (choice as any).override;
          }
        }
      }

      if (!linkedId) {
        // Create.
        const ent = mpToCrelateContact(merged);
        const res = await crelatePost('/contacts', ent);
        await W(DL);
        if (res.ok) {
          const cid = extractId(res.data);
          if (cid) {
            await sb.from('marketing_contacts').update({ crelate_contact_id: cid, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('contact', mp_id, cid, 'push');
            await logSync({ entity_type: 'contact', direction: 'push', action: 'create', mp_id, crelate_id: cid, fields_changed: ent, actor });
            return R({ success: true, action: 'create', crelate_id: cid });
          }
          await logSync({ entity_type: 'contact', direction: 'push', action: 'error', mp_id, error_message: 'POST OK but no Crelate id returned', actor });
          return R({ success: false, error: 'POST OK but no Crelate id returned' }, 500);
        }
        // 409 = Crelate detected a duplicate. The duplicate's id is in
        // the error message; pull it out, link both sides, and decide
        // whether to surface a conflict or silently skip based on diff.
        if (res.status === 409) {
          let dupId = extractDupIdFromError(res.err);
          if (!dupId && mp.first_name && mp.last_name) {
            const dup = await findCrelateContact(mp.first_name, mp.last_name, mp.email);
            if (dup) dupId = dup.Id;
          }
          if (dupId && isUuid(dupId)) {
            // Link the records both ways so future runs see the pair.
            await sb.from('marketing_contacts').update({ crelate_contact_id: dupId, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('contact', mp_id, dupId, 'push');

            // Fetch the existing Crelate record + compute diff so the
            // user can resolve. If no fields diverge, skip silently.
            const cr = await crelateGet(`/contacts/${dupId}`);
            await W(DL);
            if (cr?.Data) {
              const mapped = crelateToMpContact(cr.Data);
              const diff = diffContact(mp, mapped);
              if (diff.conflicts.length > 0) {
                await logSync({
                  entity_type: 'contact', direction: 'push', action: 'conflict',
                  mp_id, crelate_id: dupId,
                  fields_changed: diff.conflicts,
                  error_message: '409 duplicate, conflicts pending resolution',
                  actor,
                });
                return R({
                  success: true,
                  action: 'conflict',
                  crelate_id: dupId,
                  mp_id,
                  diff,
                  crelate: mapped,
                  mp,
                  message: 'Linked to an existing Crelate contact — fields differ. Resolve to merge.',
                });
              }
            }
            await logSync({ entity_type: 'contact', direction: 'push', action: 'skip', mp_id, crelate_id: dupId, error_message: '409 → linked existing (no field diff)', actor });
            return R({ success: true, action: 'skip', crelate_id: dupId, message: 'Linked to existing Crelate contact (no changes needed).' });
          }
        }
        await logSync({ entity_type: 'contact', direction: 'push', action: 'error', mp_id, error_message: res.err, actor });
        return R({ success: false, error: res.err }, 500);
      }

      // Update existing. Drop FirstName/LastName from PATCH for the same
      // "Duplicate entities" reason that bites companies — the link is
      // by id, the name is set, leave it alone.
      const fullEnt = mpToCrelateContact(merged);
      const ent: any = { ...fullEnt };
      delete ent.FirstName;
      delete ent.LastName;
      if (Object.keys(ent).length === 0) {
        await upsertLink('contact', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'contact', direction: 'push', action: 'skip', mp_id, crelate_id: linkedId, error_message: 'nothing to update (already in sync)', actor });
        return R({ success: true, action: 'skip', crelate_id: linkedId, message: 'Already in sync — nothing to send.' });
      }
      const res = await crelatePatch(`/contacts/${linkedId}`, ent);
      await W(DL);
      if (res.ok) {
        await upsertLink('contact', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'contact', direction: 'push', action: 'update', mp_id, crelate_id: linkedId, fields_changed: ent, actor });
        return R({ success: true, action: 'update', crelate_id: linkedId });
      }
      const errMsg = res.err || `Crelate PATCH failed (status ${res.status || '?'})`;
      await logSync({ entity_type: 'contact', direction: 'push', action: 'error', mp_id, crelate_id: linkedId, error_message: errMsg, actor });
      return R({ success: false, error: errMsg, status: res.status, rawBody: res.rawBody?.slice(0, 500) }, 500);
    }

    // ── pull_contact — Crelate → MP. Patches the MP row from a Crelate
    //    snapshot. Same field_choices model as push_contact (in reverse).
    if (action === 'pull_contact') {
      const crelate_id: string = body.crelate_id;
      const choices: Record<string, any> | undefined = body.field_choices;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);

      const cr = await crelateGet(`/contacts/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate contact not found' }, 404);
      const mapped = crelateToMpContact(cr.Data);

      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'contact').eq('crelate_id', crelate_id).maybeSingle();
      let mp_id: string | null = link?.mp_id || null;

      // Apply choices: for fields where user chose 'mp', don't overwrite.
      const patch: any = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (choices?.[k] === 'mp') continue;
        if (choices?.[k] && typeof choices[k] === 'object' && 'override' in choices[k]) {
          patch[k] = (choices[k] as any).override;
        } else if (v) {
          patch[k] = v;
        }
      }

      if (mp_id) {
        await sb.from('marketing_contacts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', mp_id);
        await upsertLink('contact', mp_id, crelate_id, 'pull');
        await logSync({ entity_type: 'contact', direction: 'pull', action: 'update', mp_id, crelate_id, fields_changed: patch, actor });
        return R({ success: true, action: 'update', mp_id });
      }

      // No link — create a new MP row.
      const { data: created, error } = await sb.from('marketing_contacts')
        .insert({ ...patch, source: 'Crelate (pull)', crelate_contact_id: crelate_id })
        .select('id').single();
      if (error || !created) {
        await logSync({ entity_type: 'contact', direction: 'pull', action: 'error', crelate_id, error_message: error?.message, actor });
        return R({ success: false, error: error?.message || 'insert failed' }, 500);
      }
      mp_id = created.id;
      await upsertLink('contact', mp_id!, crelate_id, 'pull');
      await logSync({ entity_type: 'contact', direction: 'pull', action: 'create', mp_id, crelate_id, fields_changed: patch, actor });
      return R({ success: true, action: 'create', mp_id });
    }

    // ── list_history — recent sync_log entries for the History tab ──
    if (action === 'list_history') {
      const limit: number = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
      const entity: string | null = body.entity_type || null;
      const direction: string | null = body.direction || null;
      let q = sb.from('sync_log').select('*').order('created_at', { ascending: false }).limit(limit);
      if (entity) q = q.eq('entity_type', entity);
      if (direction) q = q.eq('direction', direction);
      const { data, error } = await q;
      if (error) return R({ success: false, error: error.message }, 500);
      return R({ success: true, entries: data || [] });
    }

    // ── get_mp_records_by_ids — used by the "Read visible from page"
    //    button in the Push tab. Takes a list of MP ids the content
    //    script scraped from the rendered page and returns the full
    //    records, joined with crelate_links so the caller knows which
    //    are already linked to Crelate vs new.
    if (action === 'get_mp_records_by_ids') {
      const entity: 'contact' | 'company' | 'job' = body.entity;
      const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === 'string' && isUuid(x)) : [];
      if (!entity || !['contact', 'company', 'job'].includes(entity)) {
        return R({ success: false, error: 'entity must be contact / company / job' }, 400);
      }
      if (ids.length === 0) return R({ success: true, records: [] });

      const table = entity === 'contact' ? 'marketing_contacts'
                  : entity === 'company' ? 'marketing_companies'
                  : 'marketing_jobs';
      const cols = entity === 'contact'
        ? 'id, first_name, last_name, email, title, company_name, linkedin_url, phone_work, phone_cell, phone_home, notes, crelate_contact_id, outreach_status'
        : entity === 'company'
          ? 'id, company_name, website, homepage_url, notes, company_phone, contact_phone, location, crelate_id'
          : 'id, job_title, company_name, location, city, state, description, job_url, website_job_desc, salary_range, status, is_closed, crelate_id';
      const { data, error } = await sb.from(table).select(cols).in('id', ids);
      if (error) return R({ success: false, error: error.message }, 500);

      const { data: links } = await sb.from('crelate_links')
        .select('mp_id, crelate_id').eq('entity_type', entity).in('mp_id', ids);
      const linkMap = new Map<string, string>();
      for (const l of (links || [])) linkMap.set(l.mp_id, l.crelate_id);

      const records = (data || []).map((r: any) => ({
        ...r,
        linked_crelate_id: linkMap.get(r.id)
          || (entity === 'contact' ? r.crelate_contact_id : r.crelate_id)
          || null,
      }));

      const byId = new Map(records.map(r => [r.id, r]));
      const ordered = ids.map(id => byId.get(id)).filter(Boolean);
      return R({ success: true, records: ordered });
    }

    // ── search_mp_companies — popup type-ahead, Push side ────────────
    if (action === 'search_mp_companies') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, companies: [] });
      const { data, error } = await sb.from('marketing_companies')
        .select('id, company_name, website, homepage_url, notes, company_phone, contact_phone, location, crelate_id')
        .ilike('company_name', `%${q}%`).limit(20);
      if (error) return R({ success: false, error: error.message }, 500);
      return R({ success: true, companies: data || [] });
    }

    // ── search_crelate_contacts / search_crelate_companies — popup
    //    type-ahead on the Pull side. Crelate's /contacts and /companies
    //    endpoints accept name + email, so we proxy lightly and shape
    //    the response so the popup can render results without knowing
    //    Crelate's payload shape.
    if (action === 'search_crelate_contacts') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, contacts: [] });

      // Crelate's `/contacts` endpoint silently ignores name / firstName /
      // lastName / email query params and returns the first 50 contacts
      // unchanged. The actual full-text search lives at
      // `/contacts/search?query=...`, which returns slim records:
      //   { Id, EntityStatus, EntityName, Title }
      // where Title is "LastName, FirstName MiddleInitial." — we split it
      // for display. Email / title / company aren't in the search payload;
      // they get fetched when the user opens the preview.
      const r = await crelateGet('/contacts/search', { query: q, limit: '50' });
      const items = (r?.Data || [])
        .filter((c: any) => c.Id && isUuid(c.Id))
        .map((c: any) => {
          const title = c.Title || '';
          // "Shah, Hiren C." → last="Shah", first="Hiren C."
          const commaIdx = title.indexOf(',');
          const last  = commaIdx >= 0 ? title.slice(0, commaIdx).trim() : '';
          const first = commaIdx >= 0 ? title.slice(commaIdx + 1).trim() : title.trim();
          return {
            crelate_id: c.Id,
            first_name: first,
            last_name:  last,
            email: '',         // Not in search response; fetched on preview.
            title: '',
            company_name: '',
            display_title: c.Title || '',
          };
        });
      return R({ success: true, contacts: items });
    }

    if (action === 'search_crelate_companies') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, companies: [] });
      // Same pattern as contacts: /companies/search?query=...
      const r = await crelateGet('/companies/search', { query: q, limit: '50' });
      const items = (r?.Data || [])
        .filter((c: any) => c.Id && isUuid(c.Id))
        .map((c: any) => ({
          crelate_id: c.Id,
          company_name: c.Title || c.Name || '',
          website: '',
        }));
      return R({ success: true, companies: items });
    }

    // ── dedupe_check_company — same shape as the contact equivalent ─
    if (action === 'dedupe_check_company') {
      const mp_id: string = body.mp_id;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_companies').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp company not found' }, 404);

      const { data: existingLink } = await sb.from('crelate_links')
        .select('crelate_id').eq('entity_type', 'company').eq('mp_id', mp_id).maybeSingle();
      const linkedId = existingLink?.crelate_id || mp.crelate_id || null;

      if (linkedId) {
        const cr = await crelateGet(`/companies/${linkedId}`);
        const crData = cr?.Data;
        if (!crData) return R({ success: true, status: 'linked', crelate_id: linkedId, crelate: null, diff: null, mp });
        const mapped = crelateToMpCompany(crData);
        const diff = diffCompany(mp, mapped);
        return R({
          success: true,
          status: diff.conflicts.length > 0 ? 'conflict' : 'linked',
          crelate_id: linkedId, crelate: mapped, diff, mp,
        });
      }

      const found = await findCrelateCompany(mp.company_name);
      if (!found) return R({ success: true, status: 'none', mp });
      const mapped = crelateToMpCompany(found);
      const diff = diffCompany(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : 'match',
        crelate_id: found.Id, crelate: mapped, diff, mp,
      });
    }

    // ── push_company — MP → Crelate ──────────────────────────────────
    if (action === 'push_company') {
      const mp_id: string = body.mp_id;
      const choices: Record<string, any> | undefined = body.field_choices;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_companies').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp company not found' }, 404);

      const { data: link } = await sb.from('crelate_links')
        .select('crelate_id').eq('entity_type', 'company').eq('mp_id', mp_id).maybeSingle();
      const linkedId: string | null = link?.crelate_id || mp.crelate_id || null;

      const merged = { ...mp };
      if (choices) {
        for (const [field, choice] of Object.entries(choices)) {
          if (choice === 'crelate') delete (merged as any)[field];
          else if (typeof choice === 'object' && choice && 'override' in choice) (merged as any)[field] = (choice as any).override;
        }
      }

      if (!linkedId) {
        const ent = mpToCrelateCompany(merged);
        if (!ent.Name) return R({ success: false, error: 'company_name required to push' }, 400);
        const res = await crelatePost('/companies', ent);
        await W(DL);
        if (res.ok) {
          const cid = extractId(res.data);
          if (cid) {
            await sb.from('marketing_companies').update({ crelate_id: cid, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('company', mp_id, cid, 'push');
            await logSync({ entity_type: 'company', direction: 'push', action: 'create', mp_id, crelate_id: cid, fields_changed: ent, actor });
            return R({ success: true, action: 'create', crelate_id: cid });
          }
          return R({ success: false, error: 'POST OK but no Crelate id returned' }, 500);
        }
        // 409 — same conflict-surfacing path as push_contact.
        if (res.status === 409) {
          let dupId = extractDupIdFromError(res.err);
          if (!dupId && merged.company_name) {
            const dup = await findCrelateCompany(merged.company_name);
            if (dup) dupId = dup.Id;
          }
          if (dupId && isUuid(dupId)) {
            await sb.from('marketing_companies').update({ crelate_id: dupId, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('company', mp_id, dupId, 'push');
            const cr = await crelateGet(`/companies/${dupId}`);
            await W(DL);
            if (cr?.Data) {
              const mapped = crelateToMpCompany(cr.Data);
              const diff = diffCompany(mp, mapped);
              if (diff.conflicts.length > 0) {
                await logSync({
                  entity_type: 'company', direction: 'push', action: 'conflict',
                  mp_id, crelate_id: dupId,
                  fields_changed: diff.conflicts,
                  error_message: '409 duplicate, conflicts pending resolution',
                  actor,
                });
                return R({
                  success: true,
                  action: 'conflict',
                  crelate_id: dupId,
                  mp_id,
                  diff,
                  crelate: mapped,
                  mp,
                  message: 'Linked to an existing Crelate company — fields differ. Resolve to merge.',
                });
              }
            }
            await logSync({ entity_type: 'company', direction: 'push', action: 'skip', mp_id, crelate_id: dupId, error_message: '409 → linked existing (no field diff)', actor });
            return R({ success: true, action: 'skip', crelate_id: dupId, message: 'Linked to existing Crelate company (no changes needed).' });
          }
        }
        await logSync({ entity_type: 'company', direction: 'push', action: 'error', mp_id, error_message: res.err, actor });
        return R({ success: false, error: res.err }, 500);
      }

      // PATCH existing. Crelate enforces uniqueness on company Name and
      // throws "Duplicate entities found for entity of type _Accounts"
      // when you PATCH with a Name that's also held by another record —
      // even when you're not changing the Name. We're linked by id, so
      // we never need to send Name; drop it always.
      //
      // Same reasoning for Locations_Business / PhoneNumbers_Work — these
      // are collection-shaped fields that PATCH treats as additions, and
      // validation rejects them in unpredictable ways. Send the scalar
      // safe set; if even that fails, surface the error.
      const fullEnt = mpToCrelateCompany(merged);
      const safeEnt: any = {};
      if (fullEnt.Description)    safeEnt.Description    = fullEnt.Description;
      if (fullEnt.Websites_Other) safeEnt.Websites_Other = fullEnt.Websites_Other;
      // Phone + location are commonly the rejected ones — try them in a
      // separate "extras" PATCH after the safe one succeeds, so a single
      // failing field doesn't sink the rest. This keeps the operation
      // resilient without hiding errors.
      const extrasEnt: any = {};
      if (fullEnt.PhoneNumbers_Work)  extrasEnt.PhoneNumbers_Work  = fullEnt.PhoneNumbers_Work;
      if (fullEnt.Locations_Business) extrasEnt.Locations_Business = fullEnt.Locations_Business;

      // If there's nothing safe to send (everything is collection-shaped),
      // skip the API call rather than send `{}`.
      if (Object.keys(safeEnt).length === 0 && Object.keys(extrasEnt).length === 0) {
        await upsertLink('company', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'company', direction: 'push', action: 'skip', mp_id, crelate_id: linkedId, error_message: 'nothing to update (already in sync)', actor });
        return R({ success: true, action: 'skip', crelate_id: linkedId, message: 'Already in sync — nothing to send.' });
      }

      let res = Object.keys(safeEnt).length > 0
        ? await crelatePatch(`/companies/${linkedId}`, safeEnt)
        : { ok: true } as { ok: boolean; status?: number; err?: string; rawBody?: string };
      await W(DL);

      const skipped: string[] = [];
      if (!res.ok) {
        // Surface the real error; nothing got through.
        const errMsg = res.err || `Crelate PATCH failed (status ${res.status || '?'})`;
        await logSync({ entity_type: 'company', direction: 'push', action: 'error', mp_id, crelate_id: linkedId, error_message: errMsg, actor });
        return R({ success: false, error: errMsg, status: res.status, rawBody: res.rawBody?.slice(0, 500) }, 500);
      }

      // Try the extras separately; if they fail, the main update still
      // counts as success and we report what was skipped.
      if (Object.keys(extrasEnt).length > 0) {
        const extras = await crelatePatch(`/companies/${linkedId}`, extrasEnt);
        await W(DL);
        if (!extras.ok) {
          if (extrasEnt.PhoneNumbers_Work)  skipped.push('phone');
          if (extrasEnt.Locations_Business) skipped.push('location');
        }
      }

      await upsertLink('company', mp_id, linkedId, 'push');
      await logSync({
        entity_type: 'company', direction: 'push', action: 'update',
        mp_id, crelate_id: linkedId,
        fields_changed: { ...safeEnt, ...extrasEnt },
        error_message: skipped.length > 0 ? `partial — skipped: ${skipped.join(', ')}` : null,
        actor,
      });
      if (skipped.length > 0) {
        return R({
          success: true, action: 'update', crelate_id: linkedId,
          partial: true,
          message: `Updated description/website. Crelate rejected ${skipped.join(' + ')} — re-edit those manually if needed.`,
        });
      }
      return R({ success: true, action: 'update', crelate_id: linkedId });
    }

    // ── pull_company — Crelate → MP ──────────────────────────────────
    if (action === 'pull_company') {
      const crelate_id: string = body.crelate_id;
      const choices: Record<string, any> | undefined = body.field_choices;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);

      const cr = await crelateGet(`/companies/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate company not found' }, 404);
      const mapped = crelateToMpCompany(cr.Data);

      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'company').eq('crelate_id', crelate_id).maybeSingle();
      let mp_id: string | null = link?.mp_id || null;

      // If no link, try to find an MP company with the same name to link
      // before creating a duplicate.
      if (!mp_id && mapped.company_name) {
        const { data: existing } = await sb.from('marketing_companies')
          .select('id').ilike('company_name', mapped.company_name).limit(1).maybeSingle();
        if (existing?.id) mp_id = existing.id;
      }

      const patch: any = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (choices?.[k] === 'mp') continue;
        if (choices?.[k] && typeof choices[k] === 'object' && 'override' in (choices[k] as any)) {
          patch[k] = (choices[k] as any).override;
        } else if (v) {
          patch[k] = v;
        }
      }

      if (mp_id) {
        await sb.from('marketing_companies').update({ ...patch, updated_at: new Date().toISOString(), crelate_id }).eq('id', mp_id);
        await upsertLink('company', mp_id, crelate_id, 'pull');
        await logSync({ entity_type: 'company', direction: 'pull', action: 'update', mp_id, crelate_id, fields_changed: patch, actor });
        return R({ success: true, action: 'update', mp_id });
      }

      const { data: created, error } = await sb.from('marketing_companies')
        .insert({ ...patch, source: 'Crelate (pull)', crelate_id })
        .select('id').single();
      if (error || !created) {
        await logSync({ entity_type: 'company', direction: 'pull', action: 'error', crelate_id, error_message: error?.message, actor });
        return R({ success: false, error: error?.message || 'insert failed' }, 500);
      }
      mp_id = created.id;
      await upsertLink('company', mp_id!, crelate_id, 'pull');
      await logSync({ entity_type: 'company', direction: 'pull', action: 'create', mp_id, crelate_id, fields_changed: patch, actor });
      return R({ success: true, action: 'create', mp_id });
    }

    // ── pull_contact_preview — for Pull tab: fetch a Crelate contact +
    //    compute the diff against any existing MP record. Returns the
    //    same shape as dedupe_check_contact but keyed by crelate_id.
    if (action === 'pull_contact_preview') {
      const crelate_id: string = body.crelate_id;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);
      const cr = await crelateGet(`/contacts/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate contact not found' }, 404);
      const mapped = crelateToMpContact(cr.Data);

      // Look for an existing link or fuzzy match in MP.
      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'contact').eq('crelate_id', crelate_id).maybeSingle();
      let mp: any = null;
      if (link?.mp_id) {
        const { data } = await sb.from('marketing_contacts').select('*').eq('id', link.mp_id).single();
        mp = data;
      } else if (mapped.email) {
        const { data } = await sb.from('marketing_contacts').select('*').ilike('email', mapped.email).limit(1).maybeSingle();
        if (data) mp = data;
      }
      if (!mp && mapped.first_name && mapped.last_name) {
        const { data } = await sb.from('marketing_contacts').select('*')
          .ilike('first_name', mapped.first_name).ilike('last_name', mapped.last_name).limit(1).maybeSingle();
        if (data) mp = data;
      }

      if (!mp) {
        return R({ success: true, status: 'none', crelate_id, crelate: mapped, mp: null });
      }
      const diff = diffContact(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : (link ? 'linked' : 'match'),
        crelate_id, crelate: mapped, mp, diff,
      });
    }

    if (action === 'pull_company_preview') {
      const crelate_id: string = body.crelate_id;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);
      const cr = await crelateGet(`/companies/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate company not found' }, 404);
      const mapped = crelateToMpCompany(cr.Data);

      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'company').eq('crelate_id', crelate_id).maybeSingle();
      let mp: any = null;
      if (link?.mp_id) {
        const { data } = await sb.from('marketing_companies').select('*').eq('id', link.mp_id).single();
        mp = data;
      } else if (mapped.company_name) {
        const { data } = await sb.from('marketing_companies').select('*')
          .ilike('company_name', mapped.company_name).limit(1).maybeSingle();
        if (data) mp = data;
      }

      if (!mp) {
        return R({ success: true, status: 'none', crelate_id, crelate: mapped, mp: null });
      }
      const diff = diffCompany(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : (link ? 'linked' : 'match'),
        crelate_id, crelate: mapped, mp, diff,
      });
    }

    // ── search_mp_jobs ───────────────────────────────────────────────
    if (action === 'search_mp_jobs') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, jobs: [] });
      const { data, error } = await sb.from('marketing_jobs')
        .select('id, job_title, company_name, location, city, state, description, job_url, website_job_desc, salary_range, status, is_closed, crelate_id')
        .or(`job_title.ilike.%${q}%,company_name.ilike.%${q}%`)
        .eq('is_closed', false).limit(20);
      if (error) return R({ success: false, error: error.message }, 500);
      return R({ success: true, jobs: data || [] });
    }

    if (action === 'search_crelate_jobs') {
      const q: string = (body.query || '').trim();
      if (q.length < 2) return R({ success: true, jobs: [] });
      const r = await crelateGet('/jobs/search', { query: q, limit: '50' });
      const items = (r?.Data || [])
        .filter((j: any) => j.Id && isUuid(j.Id))
        .map((j: any) => {
          const title = j.Title || '';
          // Crelate's job display title is "<Job> - <Company>"; split on
          // " - " to surface job/company in the result row.
          const sepIdx = title.indexOf(' - ');
          const jobTitle = sepIdx > 0 ? title.slice(0, sepIdx).trim() : title;
          const company  = sepIdx > 0 ? title.slice(sepIdx + 3).trim() : '';
          return {
            crelate_id: j.Id,
            job_title: jobTitle,
            company_name: company,
            display_title: title,
          };
        });
      return R({ success: true, jobs: items });
    }

    // ── dedupe_check_job ─────────────────────────────────────────────
    if (action === 'dedupe_check_job') {
      const mp_id: string = body.mp_id;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_jobs').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp job not found' }, 404);

      const { data: existingLink } = await sb.from('crelate_links')
        .select('crelate_id').eq('entity_type', 'job').eq('mp_id', mp_id).maybeSingle();
      const linkedId = existingLink?.crelate_id || mp.crelate_id || null;

      if (linkedId) {
        const cr = await crelateGet(`/jobs/${linkedId}`);
        const crData = cr?.Data;
        if (!crData) return R({ success: true, status: 'linked', crelate_id: linkedId, crelate: null, diff: null, mp });
        const mapped = crelateToMpJob(crData);
        const diff = diffJob(mp, mapped);
        return R({
          success: true,
          status: diff.conflicts.length > 0 ? 'conflict' : 'linked',
          crelate_id: linkedId, crelate: mapped, diff, mp,
        });
      }

      const found = await findCrelateJob(mp.job_title, mp.company_name);
      if (!found) return R({ success: true, status: 'none', mp });

      // findCrelateJob returns the slim search record — fetch the full
      // entity to get the location / description / etc. for diffing.
      const cr = await crelateGet(`/jobs/${found.Id}`);
      const mapped = cr?.Data ? crelateToMpJob(cr.Data) : { job_title: '', company_name: found.Title || '' };
      const diff = diffJob(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : 'match',
        crelate_id: found.Id, crelate: mapped, diff, mp,
      });
    }

    // ── push_job — MP → Crelate ──────────────────────────────────────
    // For create, delegate to the existing push-to-crelate function: it
    // already does title resolution (via crelate_title_mappings + fuzzy
    // match), company resolution + auto-create, and handles all the
    // OpportunityTypeId / SalesWorkflowItemStatusId env-var lookups.
    // For update, we PATCH ourselves because push-to-crelate doesn't
    // have an update path.
    if (action === 'push_job') {
      const mp_id: string = body.mp_id;
      if (!mp_id) return R({ success: false, error: 'mp_id required' }, 400);

      const { data: mp } = await sb.from('marketing_jobs').select('*').eq('id', mp_id).single();
      if (!mp) return R({ success: false, error: 'mp job not found' }, 404);

      const { data: link } = await sb.from('crelate_links')
        .select('crelate_id').eq('entity_type', 'job').eq('mp_id', mp_id).maybeSingle();
      const linkedId: string | null = link?.crelate_id || mp.crelate_id || null;

      if (!linkedId) {
        // Inline POST /jobs. Earlier versions delegated to push-to-crelate
        // for its title-resolution machinery, but supabase.functions.invoke
        // swallows the inner response body on non-2xx and wraps it as
        // "Edge Function returned a non-2xx status code", which is useless
        // for debugging. Inlining lets us surface Crelate's actual error.
        //
        // Title-id resolution is dropped — Crelate accepts jobs without a
        // JobTitleId; the user can categorise them in Crelate later.
        // Company resolution: prefer the link table, then the
        // marketing_companies.crelate_id column, then a Crelate search.
        const title = (mp.job_title || '').trim();
        const company = (mp.company_name || '').trim();
        if (!title) {
          await logSync({ entity_type: 'job', direction: 'push', action: 'error', mp_id, error_message: 'job_title required', actor });
          return R({ success: false, error: 'job_title is required to push a job' }, 400);
        }

        let companyCrelateId: string | null = null;
        if (company) {
          const { data: mpCo } = await sb.from('marketing_companies')
            .select('id, crelate_id').ilike('company_name', company).limit(1).maybeSingle();
          if (mpCo?.crelate_id && isUuid(mpCo.crelate_id)) {
            companyCrelateId = mpCo.crelate_id;
          } else if (mpCo?.id) {
            const { data: cLink } = await sb.from('crelate_links').select('crelate_id')
              .eq('entity_type', 'company').eq('mp_id', mpCo.id).maybeSingle();
            if (cLink?.crelate_id) companyCrelateId = cLink.crelate_id;
          }
          if (!companyCrelateId) {
            const found = await findCrelateCompany(company);
            if (found?.Id) companyCrelateId = found.Id;
          }
        }

        const dn = company ? `${title} - ${company}` : title;
        const ent: any = {
          Name: dn,
          NumberOfOpenings: 1,
          IsLead: true,
          OpportunityTypeId: { Id: CR_OPP_TYPE_ID },
          SalesWorkflowItemStatusId: { Id: CR_SALES_STATUS_ID },
        };
        if (mp.description) ent.Description = String(mp.description).slice(0, 10000);
        const jobUrl = mp.website_job_desc || mp.job_url;
        if (jobUrl) ent.Websites_Other = { Value: jobUrl, IsPrimary: true };
        if (mp.salary_range) ent.PortalCompensation = mp.salary_range;
        const ci = mp.city || '';
        const sa = mp.state || '';
        if (ci || sa) ent.Locations_Business = { City: ci, State: sa, IsPrimary: true };
        else ent.Locations_Business = { City: 'Various', State: '', IsPrimary: true };
        if (companyCrelateId) ent.AccountId = { Id: companyCrelateId };

        const res = await crelatePost('/jobs', ent);
        await W(DL);

        if (res.ok) {
          const cid = extractId(res.data);
          if (cid) {
            await sb.from('marketing_jobs').update({ crelate_id: cid, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('job', mp_id, cid, 'push');
            await logSync({
              entity_type: 'job', direction: 'push', action: 'create',
              mp_id, crelate_id: cid,
              fields_changed: { name: dn, account: companyCrelateId || null },
              error_message: companyCrelateId ? null : 'Created without AccountId — company not found in Crelate',
              actor,
            });
            return R({
              success: true, action: 'create', crelate_id: cid,
              message: companyCrelateId
                ? undefined
                : `Created in Crelate, but company "${company}" wasn't matched — push the company first to link them.`,
            });
          }
          await logSync({ entity_type: 'job', direction: 'push', action: 'error', mp_id, error_message: 'POST OK but no Crelate id returned', actor });
          return R({ success: false, error: 'Crelate returned 2xx but no id' }, 500);
        }

        // 409 → parse the duplicate id from the error message + link.
        if (res.status === 409) {
          let dupId = extractDupIdFromError(res.err);
          if (!dupId) {
            const ex = await findCrelateJob(title, company);
            if (ex?.Id) dupId = ex.Id;
          }
          if (dupId && isUuid(dupId)) {
            await sb.from('marketing_jobs').update({ crelate_id: dupId, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('job', mp_id, dupId, 'push');
            const cr = await crelateGet(`/jobs/${dupId}`);
            await W(DL);
            if (cr?.Data) {
              const mapped = crelateToMpJob(cr.Data);
              const diff = diffJob(mp, mapped);
              if (diff.conflicts.length > 0) {
                await logSync({
                  entity_type: 'job', direction: 'push', action: 'conflict',
                  mp_id, crelate_id: dupId,
                  fields_changed: diff.conflicts,
                  error_message: '409 duplicate, conflicts pending resolution',
                  actor,
                });
                return R({
                  success: true,
                  action: 'conflict',
                  crelate_id: dupId,
                  mp_id, diff, crelate: mapped, mp,
                  message: 'Linked to an existing Crelate job — fields differ. Resolve to merge.',
                });
              }
            }
            await logSync({ entity_type: 'job', direction: 'push', action: 'skip', mp_id, crelate_id: dupId, error_message: '409 → linked existing (no field diff)', actor });
            return R({ success: true, action: 'skip', crelate_id: dupId, message: 'Linked to existing Crelate job (no changes needed).' });
          }
        }

        const errMsg = res.err || `Crelate POST /jobs failed (status ${res.status || '?'})`;
        await logSync({ entity_type: 'job', direction: 'push', action: 'error', mp_id, error_message: errMsg, actor });
        return R({ success: false, error: errMsg, status: res.status }, 500);
      }

      // Update — PATCH directly with the safe shallow set (description /
      // url / salary). Job title / company / location require id resolution
      // we don't replicate here; users can edit those in Crelate directly.
      const ent = mpToCrelateJobShallow(mp);
      if (Object.keys(ent).length === 0) {
        await upsertLink('job', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'job', direction: 'push', action: 'skip', mp_id, crelate_id: linkedId, error_message: 'nothing to update', actor });
        return R({ success: true, action: 'skip', crelate_id: linkedId, message: 'Already in sync — nothing to send.' });
      }
      const res = await crelatePatch(`/jobs/${linkedId}`, ent);
      await W(DL);
      if (res.ok) {
        await upsertLink('job', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'job', direction: 'push', action: 'update', mp_id, crelate_id: linkedId, fields_changed: ent, actor });
        return R({ success: true, action: 'update', crelate_id: linkedId });
      }
      const errMsg = res.err || `Crelate PATCH failed (status ${res.status || '?'})`;
      await logSync({ entity_type: 'job', direction: 'push', action: 'error', mp_id, crelate_id: linkedId, error_message: errMsg, actor });
      return R({ success: false, error: errMsg, status: res.status, rawBody: res.rawBody?.slice(0, 500) }, 500);
    }

    // ── pull_job_preview ─────────────────────────────────────────────
    if (action === 'pull_job_preview') {
      const crelate_id: string = body.crelate_id;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);
      const cr = await crelateGet(`/jobs/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate job not found' }, 404);
      const mapped = crelateToMpJob(cr.Data);

      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'job').eq('crelate_id', crelate_id).maybeSingle();
      let mp: any = null;
      if (link?.mp_id) {
        const { data } = await sb.from('marketing_jobs').select('*').eq('id', link.mp_id).single();
        mp = data;
      } else if (mapped.job_title && mapped.company_name) {
        const { data } = await sb.from('marketing_jobs').select('*')
          .ilike('job_title', mapped.job_title).ilike('company_name', mapped.company_name).limit(1).maybeSingle();
        if (data) mp = data;
      }

      if (!mp) {
        return R({ success: true, status: 'none', crelate_id, crelate: mapped, mp: null });
      }
      const diff = diffJob(mp, mapped);
      return R({
        success: true,
        status: diff.conflicts.length > 0 ? 'conflict' : (link ? 'linked' : 'match'),
        crelate_id, crelate: mapped, mp, diff,
      });
    }

    // ── pull_job — Crelate → MP ──────────────────────────────────────
    if (action === 'pull_job') {
      const crelate_id: string = body.crelate_id;
      const choices: Record<string, any> | undefined = body.field_choices;
      if (!crelate_id) return R({ success: false, error: 'crelate_id required' }, 400);

      const cr = await crelateGet(`/jobs/${crelate_id}`);
      if (!cr?.Data) return R({ success: false, error: 'Crelate job not found' }, 404);
      const mapped = crelateToMpJob(cr.Data);

      const { data: link } = await sb.from('crelate_links')
        .select('mp_id').eq('entity_type', 'job').eq('crelate_id', crelate_id).maybeSingle();
      let mp_id: string | null = link?.mp_id || null;

      if (!mp_id && mapped.job_title && mapped.company_name) {
        const { data: existing } = await sb.from('marketing_jobs').select('id')
          .ilike('job_title', mapped.job_title).ilike('company_name', mapped.company_name).limit(1).maybeSingle();
        if (existing?.id) mp_id = existing.id;
      }

      const patch: any = {};
      for (const [k, v] of Object.entries(mapped)) {
        if (choices?.[k] === 'mp') continue;
        if (choices?.[k] && typeof choices[k] === 'object' && 'override' in (choices[k] as any)) {
          patch[k] = (choices[k] as any).override;
        } else if (v) {
          patch[k] = v;
        }
      }

      if (mp_id) {
        await sb.from('marketing_jobs').update({ ...patch, updated_at: new Date().toISOString(), crelate_id }).eq('id', mp_id);
        await upsertLink('job', mp_id, crelate_id, 'pull');
        await logSync({ entity_type: 'job', direction: 'pull', action: 'update', mp_id, crelate_id, fields_changed: patch, actor });
        return R({ success: true, action: 'update', mp_id });
      }

      const { data: created, error } = await sb.from('marketing_jobs')
        .insert({ ...patch, source: 'Crelate (pull)', crelate_id })
        .select('id').single();
      if (error || !created) {
        await logSync({ entity_type: 'job', direction: 'pull', action: 'error', crelate_id, error_message: error?.message, actor });
        return R({ success: false, error: error?.message || 'insert failed' }, 500);
      }
      mp_id = created.id;
      await upsertLink('job', mp_id!, crelate_id, 'pull');
      await logSync({ entity_type: 'job', direction: 'pull', action: 'create', mp_id, crelate_id, fields_changed: patch, actor });
      return R({ success: true, action: 'create', mp_id });
    }

    return R({ success: false, error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[bridge] top-level error:', (e as Error).message);
    return R({ success: false, error: (e as Error).message, stack: (e as Error).stack?.slice(0, 500) }, 500);
  }
});
