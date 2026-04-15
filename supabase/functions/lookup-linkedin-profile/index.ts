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

    const serpKey = pickEnv('SERP_API_KEY', 'SERPAPI_API_KEY', 'SERPAPI_KEY', 'SERP_KEY');
    const openaiKey = pickEnv('OPENAI_API_KEY', 'OPENAI_KEY', 'OPENAI_TOKEN');
    if (!serpKey || !openaiKey) {
      return new Response(JSON.stringify({ success: false, error: 'SERP_API_KEY and OPENAI_API_KEY must both be configured' }), {
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
      return new Response(JSON.stringify({ success: false, error: `SerpAPI ${r.status}: ${txt.slice(0, 200)}` }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    const d = await r.json();
    const results = d.organic_results || [];

    // If we got nothing, don't try harder — return null and let the UI
    // show a "no LinkedIn profile found" state.
    if (results.length === 0) {
      return new Response(JSON.stringify({ success: true, linkedinUrl: null, currentCompany: null, snippet: null }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const firstLI = results.find((r2: any) => typeof r2?.link === 'string' && r2.link.includes('linkedin.com/in/'));
    if (!firstLI) {
      return new Response(JSON.stringify({ success: true, linkedinUrl: null, currentCompany: null, snippet: null }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // LinkedIn snippets are formatted like: "Name — Title at Company ·
    // Location · Mutual connections". Ask the AI to pull both the
    // current title and the current company. Strict JSON response; no
    // guessing — return nulls when unclear.
    const snippet = `${firstLI.title || ''} — ${firstLI.snippet || ''}`;
    const prompt = `You are reading the Google result snippet for a LinkedIn profile. Extract the person's CURRENT job title and CURRENT company (the ones most recently listed / listed first in the snippet).

Person: ${firstName} ${lastName}
Snippet: ${snippet}

Return strict JSON with two fields:
{"current_title": "<job title as written>", "current_company": "<company name>"}

Use null for either field if you cannot determine it from the snippet. Do not guess. Do not abbreviate. The title should match how the person writes it on their profile (e.g. "Chief Medical Officer", not "CMO", unless the snippet itself uses CMO).`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 160,
      }),
    });
    const aiData = await aiRes.json();
    let currentCompany: string | null = null;
    let currentTitle: string | null = null;
    try {
      const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || '{}');
      if (parsed && typeof parsed.current_company === 'string' && parsed.current_company.trim()) {
        currentCompany = parsed.current_company.trim();
      }
      if (parsed && typeof parsed.current_title === 'string' && parsed.current_title.trim()) {
        currentTitle = parsed.current_title.trim();
      }
    } catch {}

    return new Response(JSON.stringify({
      success: true,
      linkedinUrl: firstLI.link,
      currentCompany,
      currentTitle,
      snippet,
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('lookup-linkedin-profile error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
