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

// Regex-based extraction from a LinkedIn Google-result title. Examples:
//   "Nishit Jhaveri - Senior Manager, Product Analytics - ChenMed | LinkedIn"
//   "Jane Doe - CMO at DaVita Kidney Care | LinkedIn"
//   "John Smith - ChenMed | LinkedIn"
//   "Nishit Jhaveri – VP Engineering – ChenMed | LinkedIn"   (em-dash variant)
// Returns whatever it can parse; callers should fall back to AI when
// the title doesn't match a recognisable format.
function parseLinkedInTitle(titleRaw: string): { title: string | null; company: string | null } {
  if (!titleRaw) return { title: null, company: null };
  // Strip the " | LinkedIn" / " - LinkedIn" suffix plus country tags
  // like "(United States)" that sometimes appear.
  let cleaned = titleRaw
    .replace(/\s*\|\s*LinkedIn(\s+.*)?$/i, '')
    .replace(/\s*[-–—]\s*LinkedIn(\s+.*)?$/i, '')
    .replace(/\s*\(\s*(Linked ?In|United\s+\w+|\w{2,3}\s?,\s?\w+)\s*\)\s*$/i, '')
    .trim();
  // Split on any dash variant (ASCII -, en-dash, em-dash) with spaces.
  const parts = cleaned.split(/\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    // "Name - Title - Company" (or more parts — last is usually company).
    return {
      title: parts[1] || null,
      company: parts[parts.length - 1] || null,
    };
  }
  if (parts.length === 2) {
    // Might be "Name - Title at Company" or "Name - Company".
    const atSplit = parts[1].split(/\s+\bat\b\s+/i).map(s => s.trim()).filter(Boolean);
    if (atSplit.length === 2) return { title: atSplit[0] || null, company: atSplit[1] || null };
    return { title: null, company: parts[1] || null };
  }
  return { title: null, company: null };
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

    // Google query targeting LinkedIn profiles directly. The quotes on
    // the name tighten the match; including a company hint when
    // available narrows further without excluding results the person
    // may have under a past role.
    const query = company
      ? `site:linkedin.com/in "${firstName} ${lastName}" "${company}"`
      : `site:linkedin.com/in "${firstName} ${lastName}"`;
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

    // Collect up to the top 3 LinkedIn results so the AI has multiple
    // signals (profile title, snippet, sub-results). LinkedIn snippets
    // vary — sometimes the profile title clearly shows "Name - Title -
    // Company | LinkedIn" and sometimes Google returns an activity post
    // snippet where the company is only implicit.
    const linkedinResults = results.filter((r2: any) =>
      typeof r2?.link === 'string' && r2.link.includes('linkedin.com/in/')
    ).slice(0, 3);
    if (linkedinResults.length === 0) {
      // True miss — no LinkedIn profile found at all. Cache it.
      await supabase.from('linkedin_profile_cache').upsert({
        first_name_lower: fnLower,
        last_name_lower: lnLower,
        linkedin_url: null,
        current_company: null,
        current_title: null,
        snippet: null,
        hint_company: company || null,
        looked_up_at: new Date().toISOString(),
      }, { onConflict: 'first_name_lower,last_name_lower' });
      return new Response(JSON.stringify({ success: true, linkedinUrl: null, currentCompany: null, currentTitle: null, snippet: null, cached: false }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
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

    // Regex parse of the LinkedIn result title is the primary path. It's
    // more reliable than any LLM on a standardised title format and
    // doesn't consume OpenAI tokens when it works.
    let currentCompany: string | null = null;
    let currentTitle: string | null = null;
    const regex = parseLinkedInTitle(firstLI.title || '');
    if (regex.company) currentCompany = regex.company;
    if (regex.title) currentTitle = regex.title;

    // AI fallback only when the regex couldn't pull out a company name
    // (e.g. non-standard title formats). Same prompt as before.
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
      cached: false,
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('lookup-linkedin-profile error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
