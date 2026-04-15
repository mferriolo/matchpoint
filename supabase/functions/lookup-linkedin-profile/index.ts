// lookup-linkedin-profile — given a name, return the person's CURRENT
// company and LinkedIn URL per their most recent LinkedIn profile
// snippet. Used by the duplicate-review UI so the user can see which
// of N duplicate records actually matches the person's present role.
//
//   Request body: { firstName, lastName, company? (optional hint) }
//
// Returns:
//   { success: true, linkedinUrl, currentCompany, snippet }
//   { success: false, error }
//
// Uses SerpAPI (Google) for the LinkedIn search and gpt-4o-mini to
// extract the current employer from the snippet. Both keys already
// exist as Supabase secrets — no new setup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const SERP_BASE = "https://serpapi.com/search.json";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Case-insensitive env lookup so secrets saved under different casing
// (e.g. Serp_API_Key) still work.
function pickEnv(...names: string[]): string | undefined {
  for (const n of names) { const v = Deno.env.get(n); if (v) return v; }
  const all = Deno.env.toObject();
  const upper = names.map(n => n.toUpperCase());
  for (const [k, v] of Object.entries(all)) {
    if (v && upper.includes(k.toUpperCase())) return v;
  }
  return undefined;
}

// Reject strings that look like locations so we don't mistake a city
// for a company name. Common bad cases: "Brooklyn, New York, United
// States", "San Francisco Bay Area", "London, England".
function looksLikeLocation(s: string): boolean {
  if (!s) return true;
  const lower = s.toLowerCase().trim();
  // Two or more commas is nearly always "City, State, Country".
  const commas = (lower.match(/,/g) || []).length;
  if (commas >= 2) return true;
  // Common location keywords.
  if (/\b(united states|united kingdom|usa|uk|canada|australia|metropolitan|greater|bay area|silicon valley|tri-?state area|metro area|city|province|prefecture|region)\b/i.test(lower)) return true;
  // "City, ST" with 2-letter state code.
  if (/^[A-Za-z .'-]{2,}\s*,\s*[A-Z]{2}$/.test(s.trim())) return true;
  // Ends in "Area" (e.g. "San Francisco Bay Area", "New York City Metropolitan Area").
  if (/\barea$/i.test(lower)) return true;
  return false;
}

// Regex-based extraction from a LinkedIn Google-result title. Examples:
//   "Nishit Jhaveri - Senior Manager, Product Analytics - ChenMed | LinkedIn"
//   "Jane Doe - CMO at DaVita Kidney Care | LinkedIn"
//   "John Smith - ChenMed | LinkedIn"
//   "Nishit Jhaveri – VP Engineering – ChenMed | LinkedIn"   (em-dash variant)
// Rejects location-like candidates (city/state) so we never return
// "Brooklyn, NY" as a company.
function parseLinkedInTitle(titleRaw: string): { title: string | null; company: string | null } {
  if (!titleRaw) return { title: null, company: null };
  let cleaned = titleRaw
    .replace(/\s*\|\s*LinkedIn(\s+.*)?$/i, '')
    .replace(/\s*[-–—]\s*LinkedIn(\s+.*)?$/i, '')
    .replace(/\s*\(\s*(Linked ?In|United\s+\w+|\w{2,3}\s?,\s?\w+)\s*\)\s*$/i, '')
    .trim();
  const parts = cleaned.split(/\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
  const pick = (t: string | null, c: string | null) => ({
    title: t,
    company: c && !looksLikeLocation(c) ? c : null,
  });
  if (parts.length >= 3) {
    return pick(parts[1] || null, parts[parts.length - 1] || null);
  }
  if (parts.length === 2) {
    const atSplit = parts[1].split(/\s+\bat\b\s+/i).map(s => s.trim()).filter(Boolean);
    if (atSplit.length === 2) return pick(atSplit[0] || null, atSplit[1] || null);
    return pick(null, parts[1] || null);
  }
  return { title: null, company: null };
}

// Strip accents + punctuation + lowercase so "José Quiñones" matches a
// slug like "jose-quinones". Collapses to letters only.
function normalizeToken(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

// LinkedIn meta-descriptions (what Google puts in the snippet) are
// usually of the form:
//   "Headline · Experience: Current Company · Education: School · Location: ..."
//   "Headline | Experience · Current Company | Education · School · 500+ connections"
// So scanning for "Experience: X" or "Experience · X" is a highly
// reliable way to pull the ACTUAL current employer out of Google's
// snippet — separate from the profile headline (which Google puts in
// the result title and which we were mistakenly parsing as company).
function parseExperienceFromSnippet(snippet: string): string | null {
  if (!snippet) return null;
  // Match "Experience" followed by separator (: or · or • or -), capture
  // up to the next separator or end. Non-greedy so we don't gobble the
  // whole string when multiple sections are present.
  const patterns = [
    /\bExperience\s*[:·•\-–—]\s*([^·•|\n\r]+?)(?=\s*[·•|]|\s*-\s|\s+Education\b|\s+Location\b|$)/i,
    /\bCurrently works? at\s+([^·•|\n\r]+?)(?=\s*[·•|]|\s*-\s|$)/i,
  ];
  for (const re of patterns) {
    const m = snippet.match(re);
    if (m && m[1]) {
      const extracted = m[1].trim().replace(/[.,;]+$/, '');
      if (extracted.length >= 2 && extracted.length <= 100) return extracted;
    }
  }
  return null;
}

// Apollo /v1/people/match by LinkedIn URL — returns the person's
// structured work history, so we get the CURRENT employer from their
// actual "experience" section rather than guessing at their headline
// tagline. Free on Apollo's free tier for basic profile fields; only
// email/phone reveals consume credits.
async function apolloMatchByLinkedInUrl(
  linkedinUrl: string, apolloKey: string
): Promise<{ company: string | null; title: string | null } | null> {
  try {
    const r = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apolloKey,
      },
      body: JSON.stringify({ linkedin_url: linkedinUrl }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.warn(`Apollo match ${r.status} for ${linkedinUrl}: ${txt.slice(0, 200)}`);
      return null;
    }
    const d = await r.json();
    const p = d?.person || null;
    if (!p) return null;
    const company = p?.organization?.name || p?.current_organization?.name || null;
    const title = p?.title || p?.headline || null;
    return {
      company: typeof company === 'string' && company.trim() ? company.trim() : null,
      title: typeof title === 'string' && title.trim() ? title.trim() : null,
    };
  } catch (e) {
    console.warn(`Apollo match exception for ${linkedinUrl}:`, (e as Error).message);
    return null;
  }
}

// Person-identity check. URL slug is the PRIMARY signal — LinkedIn
// profile slugs almost always contain at least one of the person's
// names. If the slug matches someone else entirely (e.g. "ife-o" for a
// search that returned "George Barnett"), we reject even if the search
// snippet mentions George's name in some other context (comment,
// recommendation). Title/snippet is a secondary sanity check.
function resultMatchesPerson(r: any, firstName: string, lastName: string): boolean {
  const fn = normalizeToken(firstName);
  const ln = normalizeToken(lastName);
  if (!fn && !ln) return false;
  // Extract and normalise the LinkedIn slug.
  const slugRaw = ((r?.link || '').match(/\/in\/([^\/\?]+)/) || [])[1] || '';
  const slug = normalizeToken(slugRaw);
  // The slug needs to contain the first or last name. This is what
  // protects against entirely unrelated profiles being returned.
  const slugHasFn = fn && slug.includes(fn);
  const slugHasLn = ln && slug.includes(ln);
  if (!slugHasFn && !slugHasLn) return false;
  // Secondary check: title OR snippet should mention the person too,
  // confirming the page is about them rather than just a slug collision.
  const text = normalizeToken(`${r?.title || ''} ${r?.snippet || ''}`);
  const textHasFn = fn && text.includes(fn);
  const textHasLn = ln && text.includes(ln);
  return !!(textHasFn || textHasLn);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const firstName = (body?.firstName || '').toString().trim();
    const lastName = (body?.lastName || '').toString().trim();
    const company = (body?.company || '').toString().trim();

    if (!firstName || !lastName) {
      return new Response(JSON.stringify({ success: false, error: 'firstName and lastName are required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Cache check first — save a SerpAPI credit if we looked this
    // person up within the last 30 days. Keyed by lowercase first+last.
    const fnLower = firstName.toLowerCase().trim();
    const lnLower = lastName.toLowerCase().trim();
    const force = !!body?.force; // optional bypass: { force: true } re-queries and updates the cache
    if (!force) {
      const { data: cached } = await supabase
        .from('linkedin_profile_cache')
        .select('*')
        .eq('first_name_lower', fnLower)
        .eq('last_name_lower', lnLower)
        .maybeSingle();
      if (cached?.looked_up_at) {
        const age = Date.now() - new Date(cached.looked_up_at).getTime();
        // If we have a LinkedIn URL but the company extraction came back
        // null, that's usually a transient extraction failure rather
        // than a real miss. Try re-parsing the stored snippet's title
        // part with the current regex — extraction logic may have
        // improved since the row was cached. If that still fails,
        // treat the row as stale after just 1 hour so a fresh query
        // eventually runs instead of being stuck.
        if (cached.linkedin_url && !cached.current_company && cached.snippet) {
          const rawTitle = String(cached.snippet).split(/\s+—\s+|\s+--\s+/)[0] || '';
          const reparsed = parseLinkedInTitle(rawTitle);
          if (reparsed.company) {
            await supabase.from('linkedin_profile_cache').update({
              current_company: reparsed.company,
              current_title: reparsed.title || cached.current_title,
              looked_up_at: new Date().toISOString(),
            }).eq('first_name_lower', fnLower).eq('last_name_lower', lnLower);
            return new Response(JSON.stringify({
              success: true,
              linkedinUrl: cached.linkedin_url,
              currentCompany: reparsed.company,
              currentTitle: reparsed.title || cached.current_title,
              snippet: cached.snippet,
              cached: true,
              cached_age_days: 0,
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          if (age >= 60 * 60 * 1000) {
            // Stale null-extraction; fall through to re-query SerpAPI.
          } else {
            return new Response(JSON.stringify({
              success: true,
              linkedinUrl: cached.linkedin_url,
              currentCompany: null,
              currentTitle: cached.current_title,
              snippet: cached.snippet,
              cached: true,
              cached_age_days: Math.round(age / (24 * 60 * 60 * 1000)),
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
        } else if (age < CACHE_TTL_MS) {
          return new Response(JSON.stringify({
            success: true,
            linkedinUrl: cached.linkedin_url,
            currentCompany: cached.current_company,
            currentTitle: cached.current_title,
            snippet: cached.snippet,
            cached: true,
            cached_age_days: Math.round(age / (24 * 60 * 60 * 1000)),
          }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
      }
    }

    const serpKey = pickEnv('SERP_API_KEY', 'SERPAPI_API_KEY', 'SERPAPI_KEY', 'SERP_KEY');
    const openaiKey = pickEnv('OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_TOKEN');
    const apolloKey = pickEnv('APOLLO_API_KEY', 'APOLLO_KEY', 'APOLLO_TOKEN', 'APOLLO_IO_API_KEY', 'APOLLO_IO_KEY');
    if (!serpKey || !openaiKey) {
      // Report which names the function actually sees so the user can
      // spot a misnamed secret. Same pattern the enrich function uses.
      const envKeys = Object.keys(Deno.env.toObject())
        .filter(k => !/^(PATH|HOME|PWD|USER|HOSTNAME|LANG|TERM|DENO_|SUPABASE_INTERNAL_)/.test(k))
        .sort();
      return new Response(JSON.stringify({
        success: false,
        error: `Missing key(s): ${!serpKey ? 'SerpAPI ' : ''}${!openaiKey ? 'OpenAI ' : ''}(case-insensitive lookup tried). Env vars visible to the function: ${envKeys.join(', ')}`,
      }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Google query — search by name only. Including the caller's hint
    // company tends to bias Google toward STALE results (e.g. the
    // hint is from an old record, so Google returns a cached/older
    // profile version that mentions that company). Name alone gets
    // us the most up-to-date main profile; we verify it's actually
    // this person below via resultMatchesPerson().
    const query = `site:linkedin.com/in "${firstName} ${lastName}"`;
    const url = `${SERP_BASE}?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(serpKey)}&num=5&engine=google`;
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      // Return 200 with success:false so the error body survives
      // supabase-js's FunctionsHttpError wrapping.
      let friendly = `SerpAPI ${r.status}: ${txt.slice(0, 300)}`;
      if (r.status === 429) {
        friendly = `SerpAPI rate limit hit (HTTP 429). Your plan's monthly/per-second cap has been reached. Options: wait a few minutes and retry, check your SerpAPI dashboard at serpapi.com/account for your usage, or upgrade the plan. Subsequent LinkedIn checks on the same person will use the 30-day cache and won't hit the API.`;
      } else if (r.status === 401) {
        friendly = `SerpAPI 401 Unauthorized — the SERP_API_KEY secret is wrong or revoked. Update it in Supabase → Edge Functions → Secrets and the function will pick it up on next deploy.`;
      }
      return new Response(JSON.stringify({ success: false, error: friendly }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const d = await r.json();
    const results = d.organic_results || [];

    // Collect LinkedIn /in/ results AND filter to those actually
    // mentioning the target person's first AND last name. This is the
    // key fix for the "Ife O." / "Samantha Widdicombe" problem —
    // Google sometimes ranks a different person's profile that happens
    // to match for other reasons (e.g. a connection, a comment). If
    // the name isn't in the title/snippet/URL, it's not them.
    const allLinkedin = results.filter((r2: any) =>
      typeof r2?.link === 'string' && r2.link.includes('linkedin.com/in/')
    );
    const matchingLinkedin = allLinkedin.filter((r2: any) => resultMatchesPerson(r2, firstName, lastName));
    const linkedinResults = matchingLinkedin.slice(0, 3);
    if (linkedinResults.length === 0) {
      // No LinkedIn result matched the target person by slug + text.
      // Cache the negative but include a debug trail of what WAS seen
      // so the user can tell whether Google returned nothing at all
      // (uncommon name, bad query) or returned something we rejected
      // (wrong-person filter fired).
      const rejectedTrail = allLinkedin.slice(0, 3).map((r2: any) => ({
        title: r2?.title || '',
        link: r2?.link || '',
        rejected_reason: 'name-mismatch',
      }));
      await supabase.from('linkedin_profile_cache').upsert({
        first_name_lower: fnLower,
        last_name_lower: lnLower,
        linkedin_url: null,
        current_company: null,
        current_title: null,
        snippet: rejectedTrail.length > 0
          ? `No name-matching LinkedIn profiles among top ${allLinkedin.length} results. Top candidates: ${rejectedTrail.map(r => `${r.title} (${r.link})`).join(' | ')}`
          : `SerpAPI returned 0 LinkedIn profiles for "${firstName} ${lastName}".`,
        hint_company: company || null,
        looked_up_at: new Date().toISOString(),
      }, { onConflict: 'first_name_lower,last_name_lower' });
      return new Response(JSON.stringify({
        success: true,
        linkedinUrl: null,
        currentCompany: null,
        currentTitle: null,
        snippet: rejectedTrail.length > 0
          ? `No name-matching LinkedIn profiles among top ${allLinkedin.length} results. Top candidates: ${rejectedTrail.map(r => `${r.title} (${r.link})`).join(' | ')}`
          : `SerpAPI returned 0 LinkedIn profiles for "${firstName} ${lastName}".`,
        rejected_candidates: rejectedTrail,
        cached: false,
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const firstLI = linkedinResults[0];

    // Build a richer context block — full title, snippet, URL, and any
    // rich_snippet metadata from each of the top LinkedIn results.
    const contextBlocks = linkedinResults.map((r2: any, i: number) => {
      const extra: string[] = [];
      if (r2.rich_snippet && typeof r2.rich_snippet === 'object') {
        try { extra.push(`Meta: ${JSON.stringify(r2.rich_snippet).slice(0, 400)}`); } catch {}
      }
      if (r2.sitelinks && Array.isArray(r2.sitelinks)) {
        try { extra.push(`Sitelinks: ${JSON.stringify(r2.sitelinks).slice(0, 200)}`); } catch {}
      }
      return `Result ${i + 1}
Title: ${r2.title || '(empty)'}
Snippet: ${r2.snippet || '(empty)'}
URL: ${r2.link || '(empty)'}${extra.length ? '\n' + extra.join('\n') : ''}`;
    }).join('\n\n');
    const snippet = `${firstLI.title || ''} — ${firstLI.snippet || ''}`;

    // Improved prompt — explicitly teaches gpt-4o-mini how LinkedIn
    // titles are formatted so it doesn't bail when the answer is
    // visible. LinkedIn profile Google result titles are almost always:
    //   "First Last - Role - Company | LinkedIn"
    //   "First Last - Role at Company | LinkedIn"
    //   "First Last - Company | LinkedIn"
    const prompt = `You are extracting employment information from Google search results that link to a LinkedIn profile.

TARGET PERSON: ${firstName} ${lastName}${company ? ` (search hinted: ${company})` : ''}

LINKEDIN RESULTS (top ${linkedinResults.length}):
${contextBlocks}

The profile title format is almost always one of:
  "<Name> - <Title> - <Company> | LinkedIn"
  "<Name> - <Title> at <Company> | LinkedIn"
  "<Name> - <Company> | LinkedIn"

Extract the person's CURRENT company and job title from the FIRST result primarily (fall back to the others only if the first result is ambiguous). The company name almost always appears after " - " or " at " in the title. Do NOT abbreviate. Do NOT guess when the answer isn't present. But when the title plainly says the company, return it — don't be overly conservative.

Return strict JSON with exactly these two fields:
{"current_title": "<job title as written>", "current_company": "<company name>"}

Use null for a field only when you genuinely cannot find it in the result text. A company name literally present in the title is NOT a guess.`;

    let currentCompany: string | null = null;
    let currentTitle: string | null = null;
    let extractionSource: 'apollo' | 'snippet' | 'regex' | 'ai' | null = null;

    // PRIMARY: Apollo /people/match by LinkedIn URL. Reads structured
    // work history so we get the ACTUAL current employer, not the
    // self-authored headline. Free on Apollo's free tier for the
    // basic profile fields.
    if (apolloKey && firstLI.link) {
      const apolloData = await apolloMatchByLinkedInUrl(firstLI.link, apolloKey);
      if (apolloData?.company) {
        currentCompany = apolloData.company;
        if (apolloData.title) currentTitle = apolloData.title;
        extractionSource = 'apollo';
      }
    }

    // SECONDARY: Parse Google's snippet for LinkedIn's meta-description
    // "Experience: Company" marker. LinkedIn writes that meta from the
    // profile's actual Experience section, so it reflects the real
    // current employer (not the headline tagline). This catches Nishit
    // -style cases where Apollo has no record of the person but Google
    // has indexed their LinkedIn meta description.
    if (!currentCompany) {
      const expCompany = parseExperienceFromSnippet(firstLI.snippet || '');
      if (expCompany && !looksLikeLocation(expCompany)) {
        currentCompany = expCompany;
        extractionSource = 'snippet';
      }
    }

    // FALLBACK 1: regex parse of the Google result TITLE. This reads
    // the LinkedIn headline so it'll often return the person's
    // self-description (e.g. "Primary Care") rather than their real
    // employer. Flagged as lower-trust via extraction_source.
    if (!currentCompany) {
      const regex = parseLinkedInTitle(firstLI.title || '');
      if (regex.company) {
        currentCompany = regex.company;
        extractionSource = 'regex';
      }
      if (!currentTitle && regex.title) currentTitle = regex.title;
    }

    // FALLBACK 2: AI extraction from the full snippet.
    if (!currentCompany) {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
      });
      const aiData = await aiRes.json();
      try {
        const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
        if (parsed && typeof parsed.current_company === 'string' && parsed.current_company.trim()) {
          currentCompany = parsed.current_company.trim();
          extractionSource = 'ai';
        }
        if (!currentTitle && parsed && typeof parsed.current_title === 'string' && parsed.current_title.trim()) {
          currentTitle = parsed.current_title.trim();
        }
      } catch {}
    }

    // Write/refresh the cache so the next lookup on this name is free.
    await supabase.from('linkedin_profile_cache').upsert({
      first_name_lower: fnLower,
      last_name_lower: lnLower,
      linkedin_url: firstLI.link || null,
      current_company: currentCompany,
      current_title: currentTitle,
      snippet: snippet,
      hint_company: company || null,
      looked_up_at: new Date().toISOString(),
    }, { onConflict: 'first_name_lower,last_name_lower' });

    return new Response(JSON.stringify({
      success: true,
      linkedinUrl: firstLI.link,
      currentCompany,
      currentTitle,
      snippet,
      extraction_source: extractionSource,
      cached: false,
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('lookup-linkedin-profile error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
