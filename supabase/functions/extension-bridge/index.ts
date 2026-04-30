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

async function crelatePatch(path: string, entity: any) {
  if (!CK) return { ok: false };
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
      if (!r.ok) { await r.text(); return { ok: false }; }
      return { ok: true };
    } catch { await W(2000); }
  }
  return { ok: false };
}

const extractId = (d: any): string => {
  if (!d) return '';
  if (typeof d === 'string' && isUuid(d)) return d;
  if (typeof d.Data === 'string' && isUuid(d.Data)) return d.Data;
  if (d.Data?.Id && isUuid(d.Data.Id)) return d.Data.Id;
  if (d.Id && isUuid(d.Id)) return d.Id;
  return '';
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
        // 409 means a duplicate exists — try to find it and link.
        if (res.status === 409 && mp.first_name && mp.last_name) {
          const dup = await findCrelateContact(mp.first_name, mp.last_name, mp.email);
          if (dup) {
            await sb.from('marketing_contacts').update({ crelate_contact_id: dup.Id, updated_at: new Date().toISOString() }).eq('id', mp_id);
            await upsertLink('contact', mp_id, dup.Id, 'push');
            await logSync({ entity_type: 'contact', direction: 'push', action: 'skip', mp_id, crelate_id: dup.Id, error_message: '409 → linked existing', actor });
            return R({ success: true, action: 'skip', crelate_id: dup.Id, message: '409 duplicate, linked existing' });
          }
        }
        await logSync({ entity_type: 'contact', direction: 'push', action: 'error', mp_id, error_message: res.err, actor });
        return R({ success: false, error: res.err }, 500);
      }

      // Update existing.
      const ent = mpToCrelateContact(merged);
      const res = await crelatePatch(`/contacts/${linkedId}`, ent);
      await W(DL);
      if (res.ok) {
        await upsertLink('contact', mp_id, linkedId, 'push');
        await logSync({ entity_type: 'contact', direction: 'push', action: 'update', mp_id, crelate_id: linkedId, fields_changed: ent, actor });
        return R({ success: true, action: 'update', crelate_id: linkedId });
      }
      await logSync({ entity_type: 'contact', direction: 'push', action: 'error', mp_id, crelate_id: linkedId, error_message: 'PATCH failed', actor });
      return R({ success: false, error: 'Crelate PATCH failed' }, 500);
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

    // ── push_company / pull_company / push_job / pull_job — Day 2-3 ──
    if (['push_company', 'pull_company', 'push_job', 'pull_job',
         'dedupe_check_company', 'dedupe_check_job',
         'search_mp_companies', 'search_mp_jobs'].includes(action)) {
      return R({ success: false, error: `${action} — implementation pending (Day 2-3)`, todo: true }, 501);
    }

    return R({ success: false, error: `unknown action: ${action}` }, 400);
  } catch (e) {
    console.error('[bridge] top-level error:', (e as Error).message);
    return R({ success: false, error: (e as Error).message, stack: (e as Error).stack?.slice(0, 500) }, 500);
  }
});
