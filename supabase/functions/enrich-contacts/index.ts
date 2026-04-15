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
const SERP_BASE = "https://serpapi.com/search.json";
const LUSHA_BASE = "https://api.lusha.com";

// Target Google result pages we'll read. LinkedIn is tried first
// because it's the most reliable single source for a hiring contact.
async function serpSearch(query: string, serpKey: string, num = 10): Promise<any[]> {
  const url = `${SERP_BASE}?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(serpKey)}&num=${num}&engine=google`;
  const r = await fetch(url);
  if (!r.ok) {
    console.warn(`SerpAPI ${r.status} for "${query}"`);
    return [];
  }
  const d = await r.json();
  return d.organic_results || [];
}

// Lusha person enrichment. Cost-gated: each success burns one credit,
// so the caller is expected to skip contacts that already have both an
// email and a phone before invoking this. Returns normalised
// { email, mobile, direct, office } — callers pick the fields they
// actually need.
async function lushaEnrich(
  fn: string, ln: string, companyName: string, domain: string | null, lushaKey: string
): Promise<{ email: string; mobile: string; direct: string; office: string; raw: any; debug: string } | null> {
  // v2 /person endpoint takes contactInfo + companyInfo. Prefer domain
  // over raw company name — domain reduces false positives dramatically.
  const body: Record<string, any> = {
    contactInfo: { firstName: fn, lastName: ln },
    companyInfo: domain ? { domain } : { name: companyName },
  };
  const r = await fetch(`${LUSHA_BASE}/v2/person`, {
    method: 'POST',
    headers: {
      'api_key': lushaKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.warn(`Lusha ${r.status} for ${fn} ${ln}: ${txt.slice(0, 400)}`);
    return { email: '', mobile: '', direct: '', office: '', raw: null, debug: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
  }
  const d = await r.json();

  // Lusha has shipped multiple response shapes. Walk them all. Known
  // envelope shapes:
  //   { data: { contact: {...} } }               ← some v2 responses
  //   { data: {...contactFields} }                ← newer v2
  //   { contact: {...} }                          ← legacy
  //   { contactId: { data: {...} } }              ← bulk response
  //   <top-level fields>                          ← some direct returns
  const candidates = [
    d?.data?.contact,
    d?.contact,
    d?.data,
    d,
  ].filter(Boolean);
  // Also try bulk response: first value of { "0": {data: ...} } etc.
  if (typeof d === 'object' && d !== null) {
    for (const v of Object.values(d as any)) {
      if (v && typeof v === 'object' && (v as any).data) candidates.push((v as any).data);
    }
  }

  // Field extraction helpers. Lusha has used "emails" / "emailAddresses"
  // and phone types both as strings ("work_direct") and as nested
  // objects ({value, type}). Handle all of them.
  const pickString = (obj: any, keys: string[]): string => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    for (const k of keys) { const v = obj[k]; if (typeof v === 'string' && v) return v; }
    return '';
  };

  let email = '', mobile = '', direct = '', office = '';
  let contactObj: any = null;
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const emailList = c.emailAddresses || c.emails || c.EmailAddresses || c.email_addresses || [];
    const phoneList = c.phoneNumbers || c.phones || c.PhoneNumbers || c.phone_numbers || [];
    if ((Array.isArray(emailList) && emailList.length) || (Array.isArray(phoneList) && phoneList.length) ||
        typeof c.email === 'string') {
      contactObj = c;
      // Extract first usable email
      if (Array.isArray(emailList)) {
        for (const e of emailList) {
          const v = pickString(e, ['email', 'address', 'value', 'emailAddress']);
          if (v && v.includes('@')) { email = v; break; }
        }
      }
      if (!email && typeof c.email === 'string' && c.email.includes('@')) email = c.email;
      // Extract phones, bucketing by type
      if (Array.isArray(phoneList)) {
        for (const p of phoneList) {
          const num = pickString(p, ['number', 'internationalNumber', 'value', 'phone']);
          if (!num) continue;
          const type = (pickString(p, ['type', 'phoneType', 'numberType']) || '').toLowerCase();
          if (type.includes('mobile') || type.includes('cell') || type.includes('personal')) mobile = mobile || num;
          else if (type.includes('direct')) direct = direct || num;
          else if (type.includes('work') || type.includes('office') || type.includes('hq')) office = office || num;
          else if (!direct && !mobile && !office) direct = num;
        }
      }
      break;
    }
  }

  const anyData = !!(email || mobile || direct || office);
  // When Lusha returns 200 but we couldn't parse any contact data,
  // return a debug string with the top-level keys so the caller can
  // see what shape came back. Truncated for log safety.
  const debugSummary = anyData
    ? `matched: email=${!!email} mobile=${!!mobile} direct=${!!direct} office=${!!office}`
    : `200 but no extractable fields. Top-level keys: ${Object.keys(d || {}).join(', ')}. Sample: ${JSON.stringify(d).slice(0, 300)}`;
  if (!anyData) console.warn(`Lusha no-extract for ${fn} ${ln}: ${debugSummary}`);

  return { email, mobile, direct, office, raw: d, debug: debugSummary };
}

// gpt-4o-mini snippet extractor. Given a bundle of Google result
// snippets about a specific person, return only verifiable data.
async function aiExtractFromSnippets(fn: string, ln: string, companyName: string, snippets: string, openaiKey: string): Promise<{
  title?: string; email?: string; phone?: string; linkedin_url?: string;
} | null> {
  const prompt = `You are extracting contact information about a specific person from Google search result snippets.

PERSON: ${fn} ${ln}
COMPANY: ${companyName}

SEARCH RESULT SNIPPETS:
${snippets.slice(0, 6000)}

Return a JSON object with ONLY fields that are DIRECTLY VERIFIABLE in the snippets above. Omit any field you can't confirm.
- title: their current job title at the named company (do not invent)
- email: an email address literally visible in the snippets (do not construct from a pattern)
- phone: a phone number literally visible
- linkedin_url: a linkedin.com/in/ URL literally visible

Return JSON only, no commentary. Example: {"title":"Chief Medical Officer","linkedin_url":"https://linkedin.com/in/janedoe"}
Return {} if you can't verify anything.`;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });
    const d = await r.json();
    const text = d.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  } catch (e) {
    console.warn(`AI extract error for ${fn} ${ln}:`, (e as Error).message);
    return null;
  }
}

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
  serpHit: boolean;
  lushaHit: boolean;
  apolloHit: boolean;
  hunterHit: boolean;
  serpAttempted: boolean;
  serpResultsCount: number;
  lushaAttempted: boolean;      // we spent credits looking up this contact
  lushaMatched: boolean;        // Lusha returned a person
  lushaSkippedForCredits: boolean; // skipped the call because contact had email+phone
  apolloAttempted: boolean;
  apolloMatched: boolean;
  apolloHadDomain: boolean;
  hunterAttempted: boolean;
  hunterMatched: boolean;
  skipReason: string | null;
  errors: string[];
};

async function enrichContact(
  c: ContactRow,
  companyDomain: string | null,
  apolloKey: string | undefined,
  hunterKey: string | undefined,
  serpKey: string | undefined,
  openaiKey: string | undefined,
  lushaKey: string | undefined,
): Promise<EnrichResult> {
  const res: EnrichResult = {
    contactId: c.id,
    contactName: `${c.first_name || ''} ${c.last_name || ''}`.trim() || '(unnamed)',
    fieldsUpdated: [],
    serpHit: false,
    lushaHit: false,
    apolloHit: false,
    hunterHit: false,
    serpAttempted: false,
    serpResultsCount: 0,
    lushaAttempted: false,
    lushaMatched: false,
    lushaSkippedForCredits: false,
    apolloAttempted: false,
    apolloMatched: false,
    apolloHadDomain: !!companyDomain,
    hunterAttempted: false,
    hunterMatched: false,
    skipReason: null,
    errors: [],
  };

  const fn = (c.first_name || '').trim();
  const ln = (c.last_name || '').trim();
  if (!fn && !ln) { res.skipReason = 'no first or last name on record'; return res; }
  if (!c.company_name) { res.skipReason = 'no company_name on record'; return res; }

  const updates: Record<string, any> = {};
  const notes: string[] = [];

  // 1. SerpAPI + AI — primary source. Runs Google queries and asks
  //    gpt-4o-mini to extract verifiable fields from the result
  //    snippets. Reliable on any plan; costs pennies per contact.
  if (serpKey && openaiKey) {
    res.serpAttempted = true;
    try {
      // First: direct LinkedIn lookup via `site:linkedin.com/in "<name>" "<company>"`.
      const existingLinkedin = c.linkedin_url || (isLinkedInUrl(c.source_url) ? c.source_url : '');
      if (!existingLinkedin) {
        const liResults = await withTimeout(
          serpSearch(`site:linkedin.com/in "${fn} ${ln}" "${c.company_name}"`, serpKey, 5),
          10_000,
          `SerpAPI-linkedin(${fn} ${ln})`
        );
        if (liResults && liResults.length > 0) {
          const first = liResults.find((r2: any) => typeof r2.link === 'string' && r2.link.includes('linkedin.com/in/'));
          if (first?.link) {
            updates.linkedin_url = first.link;
            res.fieldsUpdated.push('linkedin_url');
            res.serpHit = true;
            notes.push('SerpAPI found LinkedIn');
          }
        }
      }

      // Then: broader search + AI extract for title / email / phone.
      // Only if any of those fields are missing on the contact.
      const needsExtra = !c.title || !c.email || !c.phone_work;
      if (needsExtra) {
        const general = await withTimeout(
          serpSearch(`"${fn} ${ln}" "${c.company_name}"`, serpKey, 10),
          10_000,
          `SerpAPI-general(${fn} ${ln})`
        );
        res.serpResultsCount = general?.length || 0;
        if (general && general.length > 0) {
          const snippetText = general
            .slice(0, 10)
            .map((r2: any) => `${r2.title || ''} — ${r2.snippet || ''} (source: ${r2.link || ''})`)
            .join('\n');
          const extracted = await withTimeout(
            aiExtractFromSnippets(fn, ln, c.company_name!, snippetText, openaiKey),
            20_000,
            `AI-extract(${fn} ${ln})`
          );
          if (extracted) {
            if (!c.title && extracted.title && typeof extracted.title === 'string') {
              updates.title = extracted.title;
              if (!res.fieldsUpdated.includes('title')) res.fieldsUpdated.push('title');
              res.serpHit = true;
            }
            if (!c.email && extracted.email && typeof extracted.email === 'string' && extracted.email.includes('@')) {
              updates.email = extracted.email;
              if (!res.fieldsUpdated.includes('email')) res.fieldsUpdated.push('email');
              res.serpHit = true;
            }
            if (!c.phone_work && extracted.phone && typeof extracted.phone === 'string') {
              updates.phone_work = extracted.phone;
              if (!res.fieldsUpdated.includes('phone_work')) res.fieldsUpdated.push('phone_work');
              res.serpHit = true;
            }
            if (!updates.linkedin_url && !existingLinkedin && extracted.linkedin_url && isLinkedInUrl(extracted.linkedin_url)) {
              updates.linkedin_url = extracted.linkedin_url;
              if (!res.fieldsUpdated.includes('linkedin_url')) res.fieldsUpdated.push('linkedin_url');
              res.serpHit = true;
            }
            if (res.serpHit) notes.push(`SerpAPI/AI filled: ${res.fieldsUpdated.join(', ')}`);
          }
        }
      }
    } catch (e) {
      res.errors.push(`SerpAPI: ${(e as Error).message}`);
    }
  }

  // 2. Lusha — primary paid phone source. 1 credit per successful
  //    lookup. Skip if the contact already has an email AND at least
  //    one phone — in that case spending a credit would be mostly
  //    wasted since Lusha's biggest value-add is phone + email pairs.
  //    Also skip if SerpAPI already filled both email AND a phone.
  if (lushaKey) {
    const emailAfterSerp = updates.email || c.email;
    const phoneAfterSerp = updates.phone_work || updates.phone_cell || c.phone_work || c.phone_cell;
    if (emailAfterSerp && phoneAfterSerp) {
      res.lushaSkippedForCredits = true;
    } else {
      res.lushaAttempted = true;
      const l = await withTimeout(
        lushaEnrich(fn, ln, c.company_name!, companyDomain, lushaKey),
        15_000,
        `Lusha(${fn} ${ln})`
      );
      if (l) {
        // Lusha returned *something* (HTTP 200 or an error we parsed).
        // The debug string tells us whether the response had
        // extractable contact data.
        const hasAnyData = !!(l.email || l.mobile || l.direct || l.office);
        if (hasAnyData) {
          res.lushaMatched = true;
          if (!updates.email && !c.email && l.email) {
            updates.email = l.email;
            if (!res.fieldsUpdated.includes('email')) res.fieldsUpdated.push('email');
            res.lushaHit = true;
          }
          if (!updates.phone_cell && !c.phone_cell && l.mobile) {
            updates.phone_cell = l.mobile;
            if (!res.fieldsUpdated.includes('phone_cell')) res.fieldsUpdated.push('phone_cell');
            res.lushaHit = true;
          }
          // Direct dial beats office line; both land in phone_work.
          const workPhone = l.direct || l.office;
          if (!updates.phone_work && !c.phone_work && workPhone) {
            updates.phone_work = workPhone;
            if (!res.fieldsUpdated.includes('phone_work')) res.fieldsUpdated.push('phone_work');
            res.lushaHit = true;
          }
          if (res.lushaHit) notes.push('Lusha filled: ' + res.fieldsUpdated.filter(f => f === 'email' || f === 'phone_cell' || f === 'phone_work').join(', '));
        }
        // Capture the debug line on first no-match of the run so the
        // user can see what Lusha is actually returning.
        (res as any).lushaDebug = l.debug || null;
      }
    }
  }

  // 3. Apollo people/match — one call can fill multiple fields.
  if (apolloKey) {
    res.apolloAttempted = true;
    const p = await withTimeout(
      apolloMatch(fn, ln, c.company_name, companyDomain, apolloKey),
      15_000,
      `Apollo-match(${fn} ${ln})`
    );
    if (p) {
      res.apolloMatched = true;
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
    res.hunterAttempted = true;
    const h = await withTimeout(
      hunterFinder(fn, ln, companyDomain, hunterKey),
      8_000,
      `Hunter(${fn} ${ln}@${companyDomain})`
    );
    if (h?.email) {
      res.hunterMatched = true;
      updates.email = h.email;
      res.fieldsUpdated.push('email');
      res.hunterHit = true;
      notes.push(`Hunter filled email (score=${h.score})`);
    }
  }

  if (Object.keys(updates).length === 0) {
    // Build a specific reason so the UI can explain what to try next.
    const parts: string[] = [];
    if (res.serpAttempted) {
      if (res.serpResultsCount === 0) parts.push(`Google returned 0 results for "${fn} ${ln} ${c.company_name}"`);
      else parts.push(`Google returned ${res.serpResultsCount} results but nothing verifiable could be extracted`);
    }
    if (res.lushaSkippedForCredits) {
      parts.push('Lusha skipped (contact already had email + phone; saved a credit)');
    } else if (res.lushaAttempted && !res.lushaMatched) {
      parts.push(`Lusha had no match${companyDomain ? ` @ ${companyDomain}` : ` at "${c.company_name}"`}`);
    } else if (res.lushaMatched && !res.lushaHit) {
      parts.push('Lusha matched but every field it returned was already on this contact');
    }
    if (res.apolloAttempted && !res.apolloMatched) {
      parts.push(`Apollo had no match${companyDomain ? ` @ ${companyDomain}` : ` at "${c.company_name}"`}`);
    } else if (res.apolloMatched) {
      parts.push('Apollo matched but returned no new fields (free tier locks email/phone)');
    }
    if (res.hunterAttempted && !res.hunterMatched) {
      parts.push(`Hunter could not find an email${!companyDomain ? ' (no company website on file)' : ''}`);
    }
    if (!res.serpAttempted && !res.apolloAttempted && !res.hunterAttempted && !res.lushaAttempted) parts.push('no enrichment sources were configured');
    res.skipReason = parts.join(' · ') || 'no new information available';
    return res;
  }

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

async function processRun(runId: string, contactIds: string[], apolloKey: string|undefined, hunterKey: string|undefined, serpKey: string|undefined, openaiKey: string|undefined, lushaKey: string|undefined) {
  const startedAt = Date.now();
  // Diagnostic blob — written into error_message on completion so the
  // user can see it in the results dialog even when per_company comes
  // back empty. Lists what sources were configured, how many contacts
  // the function was able to load, and any warnings.
  const diag: string[] = [];
  diag.push(`sources: SerpAPI=${serpKey ? 'yes' : 'NO'}, OpenAI=${openaiKey ? 'yes' : 'NO'}, Lusha=${lushaKey ? 'yes' : 'NO'}, Apollo=${apolloKey ? 'yes' : 'NO'}, Hunter=${hunterKey ? 'yes' : 'NO'}`);
  diag.push(`contactIds received: ${contactIds.length}`);
  try {
    // Load the contacts + their companies' websites in two queries so
    // we can pass a domain to Apollo/Hunter without N round-trips.
    const { data: contacts, error: loadErr } = await supabase.from('marketing_contacts')
      .select('id, first_name, last_name, company_name, company_id, email, title, linkedin_url, source_url, phone_work, phone_home, phone_cell')
      .in('id', contactIds);
    const rows: ContactRow[] = (contacts || []) as ContactRow[];
    diag.push(`rows loaded from marketing_contacts: ${rows.length}${loadErr ? ` (load error: ${loadErr.message})` : ''}`);
    if (rows.length === 0) {
      await supabase.from('contact_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        current_company: null,
        error_message: `No contacts matched the requested IDs. Diagnostics: ${diag.join(' | ')}`,
      }).eq('id', runId);
      return;
    }

    const coIds = Array.from(new Set(rows.map(r => r.company_id).filter(Boolean) as string[]));
    const domainByCoId = new Map<string, string | null>();
    if (coIds.length > 0) {
      const { data: cos } = await supabase.from('marketing_companies').select('id, website').in('id', coIds);
      for (const co of (cos || [])) domainByCoId.set(co.id, extractDomain(co.website));
    }

    const results: EnrichResult[] = [];
    const totals = { enriched: 0, serp: 0, lusha: 0, lushaCreditsUsed: 0, apollo: 0, hunter: 0, skipped: 0 };

    for (let i = 0; i < rows.length; i++) {
      const c = rows[i];
      await supabase.from('contact_runs').update({
        current_company: `Enriching ${c.first_name || ''} ${c.last_name || ''}`.trim(),
        companies_processed: i,
      }).eq('id', runId);

      const domain = c.company_id ? (domainByCoId.get(c.company_id) || null) : null;
      const r = await enrichContact(c, domain, apolloKey, hunterKey, serpKey, openaiKey, lushaKey);
      results.push(r);
      if (r.fieldsUpdated.length > 0) totals.enriched++;
      else totals.skipped++;
      if (r.serpHit) totals.serp++;
      if (r.lushaHit) totals.lusha++;
      if (r.lushaAttempted) totals.lushaCreditsUsed++; // every attempt burns a credit, match or no match
      if (r.apolloHit) totals.apollo++;
      if (r.hunterHit) totals.hunter++;

      // per_company here stores per-contact results (same column, overloaded).
      await supabase.from('contact_runs').update({
        companies_processed: i + 1,
        contacts_added: totals.enriched,
        ai_added: totals.serp,
        lusha_added: totals.lusha,
        apollo_added: totals.apollo,
        emails_verified: totals.hunter,
        duplicates_skipped: totals.skipped,
        per_company: results.map(r => ({
          company: r.contactName,
          ai_added: r.serpHit ? 1 : 0,
          crelate_added: 0,
          apollo_added: r.apolloHit ? 1 : 0,
          lusha_added: r.lushaHit ? 1 : 0,
          leadership_added: 0,
          emails_verified: r.hunterHit ? 1 : 0,
          duplicates_skipped: r.fieldsUpdated.length === 0 ? 1 : 0,
          errors: r.errors,
          fields_updated: r.fieldsUpdated,
          skip_reason: r.skipReason,
          serp_attempted: r.serpAttempted,
          serp_results: r.serpResultsCount,
          lusha_attempted: r.lushaAttempted,
          lusha_matched: r.lushaMatched,
          lusha_skipped_for_credits: r.lushaSkippedForCredits,
          lusha_debug: (r as any).lushaDebug || null,
          apollo_attempted: r.apolloAttempted,
          apollo_matched: r.apolloMatched,
          hunter_attempted: r.hunterAttempted,
          hunter_matched: r.hunterMatched,
          had_domain: r.apolloHadDomain,
        })),
      }).eq('id', runId);
    }

    diag.push(`processed ${rows.length} contacts in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    diag.push(`totals: enriched=${totals.enriched} serp=${totals.serp} lusha=${totals.lusha} apollo=${totals.apollo} hunter=${totals.hunter} skipped=${totals.skipped}`);
    // Lusha typically only charges a credit on successful reveals, so
    // attempts is a ceiling — actual billed credits are usually closer
    // to `lusha` (the successful-match count).
    diag.push(`Lusha attempts: ${totals.lushaCreditsUsed} (credits billed only on successful reveals, ≈ ${totals.lusha})`);
    // If Lusha was attempted a lot but matched nothing, surface the
    // first debug string so the user can see what Lusha returned and
    // whether the parser is missing a response shape.
    if (totals.lushaCreditsUsed > 0 && totals.lusha === 0) {
      const firstDebug = (results.find(r => (r as any).lushaDebug) as any)?.lushaDebug;
      if (firstDebug) diag.push(`Lusha debug sample: ${String(firstDebug).slice(0, 400)}`);
    }
    await supabase.from('contact_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      current_company: null,
      companies_processed: rows.length,
      contacts_added: totals.enriched,
      ai_added: totals.serp,
      lusha_added: totals.lusha,
      apollo_added: totals.apollo,
      emails_verified: totals.hunter,
      duplicates_skipped: totals.skipped,
      per_company: results.map(r => ({
        company: r.contactName,
        ai_added: r.serpHit ? 1 : 0,
        crelate_added: 0,
        apollo_added: r.apolloHit ? 1 : 0,
        lusha_added: r.lushaHit ? 1 : 0,
        leadership_added: 0,
        emails_verified: r.hunterHit ? 1 : 0,
        duplicates_skipped: r.fieldsUpdated.length === 0 ? 1 : 0,
        errors: r.errors,
        fields_updated: r.fieldsUpdated,
        skip_reason: r.skipReason,
        serp_attempted: r.serpAttempted,
        serp_results: r.serpResultsCount,
        lusha_attempted: r.lushaAttempted,
        lusha_matched: r.lushaMatched,
        lusha_skipped_for_credits: r.lushaSkippedForCredits,
        lusha_debug: (r as any).lushaDebug || null,
        apollo_attempted: r.apolloAttempted,
        apollo_matched: r.apolloMatched,
        hunter_attempted: r.hunterAttempted,
        hunter_matched: r.hunterMatched,
        had_domain: r.apolloHadDomain,
      })),
      error_message: diag.join(' | '),
    }).eq('id', runId);
    console.log(`enrich-contacts run ${runId} done: ${diag.join(' | ')}`);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error(`enrich-contacts run ${runId} failed:`, msg);
    diag.push(`EXCEPTION: ${msg}`);
    await supabase.from('contact_runs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: diag.join(' | '),
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

    // Try multiple common env-var names so the function picks up the
    // key regardless of how the user spelled it in the Supabase
    // dashboard. ENV var names are case-sensitive on Linux, so we ALSO
    // do a case-insensitive sweep over every visible env var as a final
    // fallback — catches secrets like "Apollo_API_Key" that have
    // mixed-case names. We log which name matched (name only, never the
    // value) so the diagnostic error makes it clear if the user used an
    // alias or weird casing.
    const allEnv = Deno.env.toObject();
    const pickEnv = (...names: string[]): { value: string | undefined; matched: string | null } => {
      // Fast path: exact match on any alias
      for (const n of names) {
        const v = Deno.env.get(n);
        if (v) return { value: v, matched: n };
      }
      // Fallback: case-insensitive scan over all env vars
      const upperNames = names.map(n => n.toUpperCase());
      for (const [k, v] of Object.entries(allEnv)) {
        if (v && upperNames.includes(k.toUpperCase())) return { value: v, matched: k };
      }
      return { value: undefined, matched: null };
    };
    const apolloPick = pickEnv('APOLLO_API_KEY', 'APOLLO_KEY', 'APOLLO_TOKEN', 'APOLLO_IO_API_KEY', 'APOLLO_IO_KEY');
    const hunterPick = pickEnv('HUNTER_API_KEY', 'HUNTER_KEY', 'HUNTER_TOKEN', 'HUNTER_IO_API_KEY', 'HUNTER_IO_KEY');
    const serpPick = pickEnv('SERP_API_KEY', 'SERPAPI_API_KEY', 'SERPAPI_KEY', 'SERP_KEY');
    const openaiPick = pickEnv('OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_TOKEN');
    const lushaPick = pickEnv('LUSHA_API_KEY', 'LUSHA_KEY', 'LUSHA_TOKEN');
    const apolloKey = apolloPick.value;
    const hunterKey = hunterPick.value;
    const serpKey = serpPick.value;
    const openaiKey = openaiPick.value;
    const lushaKey = lushaPick.value;
    // The function can enrich with any combo — SerpAPI+OpenAI and Lusha
    // are the best sources. Only bail if NONE are available.
    if (!apolloKey && !hunterKey && !lushaKey && !(serpKey && openaiKey)) {
      // Report presence of every env var the function can see (all
      // non-internal ones). This makes misnamed secrets obvious.
      const envKeys = Object.keys(Deno.env.toObject()).sort();
      const visible = envKeys
        .filter(k => !/^(PATH|HOME|PWD|USER|HOSTNAME|LANG|TERM|DENO_|SUPABASE_INTERNAL_)/.test(k));
      return new Response(JSON.stringify({
        success: false,
        error: 'Neither APOLLO_API_KEY nor HUNTER_API_KEY is configured.',
        hint: 'If your secret is named differently, rename it in Supabase → Edge Functions → Secrets to APOLLO_API_KEY or HUNTER_API_KEY (the function will also auto-detect APOLLO_KEY, APOLLO_TOKEN, HUNTER_KEY, HUNTER_TOKEN as fallbacks).',
        tried_names: {
          apollo: ['APOLLO_API_KEY', 'APOLLO_KEY', 'APOLLO_TOKEN', 'APOLLO_IO_API_KEY', 'APOLLO_IO_KEY'],
          hunter: ['HUNTER_API_KEY', 'HUNTER_KEY', 'HUNTER_TOKEN', 'HUNTER_IO_API_KEY', 'HUNTER_IO_KEY'],
        },
        visible_env_var_names: visible,
      }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    console.log(`enrich-contacts keys: SerpAPI=${serpPick.matched || '(none)'}, OpenAI=${openaiPick.matched || '(none)'}, Lusha=${lushaPick.matched || '(none)'}, Apollo=${apolloPick.matched || '(none)'}, Hunter=${hunterPick.matched || '(none)'}`);

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

    EdgeRuntime.waitUntil(processRun(runRow.id, contactIds, apolloKey, hunterKey, serpKey, openaiKey, lushaKey));

    return new Response(JSON.stringify({
      success: true,
      run_id: runRow.id,
      mode: 'enrich',
      companies_total: contactIds.length,
      sources_active: {
        serpapi: !!serpKey,
        openai: !!openaiKey,
        lusha: !!lushaKey,
        apollo: !!apolloKey,
        hunter: !!hunterKey,
      },
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('enrich-contacts error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
