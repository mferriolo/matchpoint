import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// *** UPDATED TO API v3 ***
const CRELATE_BASE = "https://app.crelate.com/api3";

async function crelateGet(path: string, apiKey: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CRELATE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' }
  });
  
  if (!res.ok) {
    const txt = await res.text();
    console.error(`Crelate ${res.status} on ${path}: ${txt}`);
    return { Data: [] };
  }
  return await res.json();
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Build the correct Crelate contact URL
function buildCrelateContactUrl(contactId: string): string {
  return `https://app.crelate.com/go#stage/_Contacts/DefaultView/${contactId}/summary`;
}

// Extract email from v3 nested email fields
function extractEmail(contact: any): string {
  // v3 emails are nested objects like { Value: "email@example.com", IsPrimary: true }
  const workEmail = contact.EmailAddresses_Work?.Value || '';
  const personalEmail = contact.EmailAddresses_Personal?.Value || '';
  const otherEmail = contact.EmailAddresses_Other?.Value || '';
  return workEmail || personalEmail || otherEmail || '';
}

// Extract phone from v3 nested phone fields
function extractPhone(contact: any, type: 'work' | 'mobile' | 'home'): string {
  if (type === 'work') {
    return contact.PhoneNumbers_Work_Main?.Value || contact.PhoneNumbers_Work_Direct?.Value || '';
  }
  if (type === 'mobile') {
    return contact.PhoneNumbers_Mobile?.Value || '';
  }
  if (type === 'home') {
    return contact.PhoneNumbers_Home?.Value || '';
  }
  return '';
}

// Extract job title from v3 CurrentPosition
function extractTitle(contact: any): string {
  return contact.CurrentPosition?.JobTitle || '';
}

// Extract company name from v3 CurrentPosition
function extractCompanyName(contact: any): string {
  return contact.CurrentPosition?.CompanyId?.Title || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const crelateApiKey = Deno.env.get("CRELATE_API_KEY");
    if (!crelateApiKey) throw new Error("CRELATE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { companyNames, mode = 'all' } = body;

    // Get marketing companies
    let query = supabase.from('marketing_companies').select('id, company_name').order('is_high_priority', { ascending: false });
    if (mode === 'selected' && companyNames?.length) {
      query = query.in('company_name', companyNames);
    }
    const { data: companiesToSearch } = await query;

    if (!companiesToSearch?.length) {
      return new Response(JSON.stringify({ success: true, apiVersion: 'v3', contacts_found: 0, contacts_added: 0, companies_searched: 0, duplicates_skipped: 0, companies_with_matches: 0, search_log: [] }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get existing crelate IDs for dedup
    const { data: existing } = await supabase.from('marketing_contacts').select('crelate_contact_id, first_name, last_name, company_name');
    const existingCrelateIds = new Set((existing || []).map(c => c.crelate_contact_id).filter(Boolean));
    const existingKeys = new Set((existing || []).map(c => `${(c.first_name||'').toLowerCase()}|${(c.last_name||'').toLowerCase()}|${(c.company_name||'').toLowerCase()}`));

    let totalFound = 0, totalAdded = 0, totalSkipped = 0, companiesSearched = 0, companiesWithMatches = 0;
    const searchLog: any[] = [];

    // Fix any existing contacts with wrong URL format
    const { data: wrongUrls } = await supabase.from('marketing_contacts')
      .select('id, crelate_contact_id')
      .eq('source', 'Crelate ATS')
      .not('crelate_contact_id', 'is', null);
    
    for (const c of (wrongUrls || [])) {
      if (c.crelate_contact_id) {
        const correctUrl = buildCrelateContactUrl(c.crelate_contact_id);
        await supabase.from('marketing_contacts').update({
          crelate_url: correctUrl,
          source_url: correctUrl
        }).eq('id', c.id);
      }
    }

    for (const company of companiesToSearch) {
      companiesSearched++;
      let found = 0, added = 0;
      const searchName = company.company_name.replace(/\s*\/\s*/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').trim();

      try {
        // Search Crelate companies (v3: response uses "Data" array)
        const compRes = await crelateGet('/companies', crelateApiKey, { search: searchName, take: '10' });
        const crelateCompanies = compRes?.Data || [];

        for (const cc of crelateCompanies) {
          const companyId = cc.Id;
          if (!companyId) continue;
          
          // v3: Get contacts for this company using query parameter on /contacts endpoint
          const contactsRes = await crelateGet('/contacts', crelateApiKey, { companyId: companyId, take: '50' });
          const contacts = contactsRes?.Data || [];

          for (const contact of contacts) {
            const cid = contact.Id;
            if (!cid || existingCrelateIds.has(cid)) { totalSkipped++; continue; }
            
            totalFound++; found++;
            const fn = contact.FirstName || '';
            const ln = contact.LastName || '';
            if (!fn && !ln) continue;

            const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${company.company_name.toLowerCase()}`;
            if (existingKeys.has(dk)) { totalSkipped++; continue; }

            const crelateUrl = buildCrelateContactUrl(cid);
            
            const { error } = await supabase.from('marketing_contacts').insert({
              company_id: company.id,
              company_name: company.company_name,
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
              notes: `From Crelate (API v3). Company: ${cc.Name || searchName}`
            });
            if (!error) { totalAdded++; added++; existingCrelateIds.add(cid); existingKeys.add(dk); }
            await delay(500);
          }
          await delay(500);
        }

        // Also direct contact search
        const directRes = await crelateGet('/contacts', crelateApiKey, { search: searchName, take: '20' });
        const directContacts = directRes?.Data || [];
        
        for (const contact of directContacts) {
          const cid = contact.Id;
          if (!cid || existingCrelateIds.has(cid)) continue;
          totalFound++; found++;
          const fn = contact.FirstName || '';
          const ln = contact.LastName || '';
          if (!fn && !ln) continue;
          const dk = `${fn.toLowerCase()}|${ln.toLowerCase()}|${company.company_name.toLowerCase()}`;
          if (existingKeys.has(dk)) { totalSkipped++; continue; }

          // Verify company match using v3 CurrentPosition.CompanyId.Title
          const contactCo = extractCompanyName(contact).toLowerCase();
          const searchLower = searchName.toLowerCase();
          if (contactCo && !contactCo.includes(searchLower) && !searchLower.includes(contactCo)) continue;

          const crelateUrl = buildCrelateContactUrl(cid);
          
          const { error } = await supabase.from('marketing_contacts').insert({
            company_id: company.id, 
            company_name: company.company_name,
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
            notes: `From Crelate contact search (API v3).`
          });
          if (!error) { totalAdded++; added++; existingCrelateIds.add(cid); existingKeys.add(dk); }
          await delay(500);
        }
      } catch (e) {
        console.error(`Error for ${company.company_name}:`, e);
      }

      if (found > 0) companiesWithMatches++;
      searchLog.push({ company: company.company_name, contacts_found: found, contacts_added: added, method: 'company+contact search (v3)' });
      await delay(300);
    }

    // Update company contact counts
    for (const company of companiesToSearch) {
      const { count } = await supabase.from('marketing_contacts').select('id', { count: 'exact', head: true }).eq('company_id', company.id);
      await supabase.from('marketing_companies').update({ contact_count: count || 0, updated_at: new Date().toISOString() }).eq('id', company.id);
    }

    return new Response(JSON.stringify({
      success: true, 
      apiVersion: 'v3',
      contacts_found: totalFound, 
      contacts_added: totalAdded,
      duplicates_skipped: totalSkipped, 
      companies_searched: companiesSearched,
      companies_with_matches: companiesWithMatches, 
      search_log: searchLog,
      timestamp: new Date().toISOString()
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message, success: false }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});