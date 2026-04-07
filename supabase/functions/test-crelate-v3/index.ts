export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const CRELATE_BASE = "https://app.crelate.com/api3";

async function cGet(path: string, apiKey: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CRELATE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method: 'GET', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' } });
  if (!res.ok) return { _error: res.status, _body: (await res.text()).substring(0, 500) };
  return await res.json();
}

async function cPost(path: string, apiKey: string, entity: Record<string, any>): Promise<any> {
  const res = await fetch(`${CRELATE_BASE}${path}`, { method: 'POST', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ entity }) });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function cPatch(path: string, apiKey: string, entity: Record<string, any>): Promise<any> {
  const res = await fetch(`${CRELATE_BASE}${path}`, { method: 'PATCH', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ entity }) });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function cPut(path: string, apiKey: string, entity: Record<string, any>): Promise<any> {
  const res = await fetch(`${CRELATE_BASE}${path}`, { method: 'PUT', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ entity }) });
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CRELATE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "No API key" }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const body = await req.json().catch(() => ({}));
    const testType = body.test || 'help';
    const results: Record<string, any> = {};

    // ============ TEST: Paginate all job titles ============
    if (testType === 'paginate_job_titles') {
      const pageSize = body.pageSize || 500;
      const pages: any[] = [];
      const allIds = new Set<string>();
      let skip = 0;
      
      for (let p = 0; p < 20; p++) {
        const r = await cGet('/jobtitles', apiKey, { take: String(pageSize), skip: String(skip) });
        await new Promise(r => setTimeout(r, 500));
        
        const count = r?.Data?.length || 0;
        const totalCount = r?.TotalCount;
        let newIds = 0;
        
        if (r?.Data) {
          for (const j of r.Data) {
            if (j.Id && !allIds.has(j.Id)) {
              allIds.add(j.Id);
              newIds++;
            }
          }
        }
        
        pages.push({ page: p, skip, requested: pageSize, returned: count, totalCount, newIds, cumulativeUnique: allIds.size });
        
        if (count === 0) break;
        skip += count;
      }
      
      results.pages = pages;
      results.totalUnique = allIds.size;
    }

    // ============ TEST: Raw GET with custom params ============
    else if (testType === 'raw_get') {
      const endpoint = body.endpoint || '/jobtitles';
      const params = body.params || {};
      const r = await cGet(endpoint, apiKey, params);
      results.totalCount = r?.TotalCount;
      results.dataCount = r?.Data?.length;
      results.sample = (r?.Data || []).slice(0, 5);
      results.rawKeys = r ? Object.keys(r) : [];
    }

    // ============ TEST: Set job title via PATCH with Title string ============
    else if (testType === 'patch_job_title_by_name') {
      const jobId = body.jobId || '08e59230-4ac0-4db2-9df2-93de08031bde';
      const title = body.title || 'TEST DELETE ME TITLE';
      const r1 = await cPatch(`/jobs/${jobId}`, apiKey, { JobTitleId: { Title: title } });
      results.strategy1_title_object = { status: r1.status, ok: r1.ok, data: r1.data };
      await new Promise(r => setTimeout(r, 2000));
      const rb1 = await cGet(`/jobs/${jobId}`, apiKey);
      results.readback1 = { JobTitleId: rb1?.Data?.JobTitleId, Name: rb1?.Data?.Name };
      if (!rb1?.Data?.JobTitleId) {
        await new Promise(r => setTimeout(r, 1000));
        const r2 = await cPatch(`/jobs/${jobId}`, apiKey, { JobTitleId: title });
        results.strategy2_plain_string = { status: r2.status, ok: r2.ok, data: r2.data };
        await new Promise(r => setTimeout(r, 2000));
        const rb2 = await cGet(`/jobs/${jobId}`, apiKey);
        results.readback2 = { JobTitleId: rb2?.Data?.JobTitleId };
      }
      if (!results.readback1?.JobTitleId && !results.readback2?.JobTitleId) {
        await new Promise(r => setTimeout(r, 1000));
        const r3 = await cPut(`/jobs/${jobId}`, apiKey, { Id: jobId, JobTitleId: { Title: title } });
        results.strategy3_put = { status: r3.status, ok: r3.ok, data: r3.data };
        await new Promise(r => setTimeout(r, 2000));
        const rb3 = await cGet(`/jobs/${jobId}`, apiKey);
        results.readback3 = { JobTitleId: rb3?.Data?.JobTitleId };
      }
    }

    else if (testType === 'create_job_with_title') {
      const title = body.title || 'TEST INLINE TITLE';
      const company = body.company || 'TEST COMPANY';
      const entity: Record<string, any> = { Name: `${title} - ${company}`, NumberOfOpenings: 1, OpportunityTypeId: { Id: "91835d38-fcfd-4128-10d3-f959ef60dc08" }, JobTitleId: { Title: title } };
      const r1 = await cPost('/jobs', apiKey, entity);
      results.createWithTitle = { status: r1.status, ok: r1.ok };
      if (r1.ok) {
        const jobId = typeof r1.data?.Data === 'string' ? r1.data.Data : r1.data?.Data?.Id;
        results.jobId = jobId;
        if (jobId) { await new Promise(r => setTimeout(r, 2000)); const rb = await cGet(`/jobs/${jobId}`, apiKey); results.readback = { Name: rb?.Data?.Name, JobTitleId: rb?.Data?.JobTitleId, AccountId: rb?.Data?.AccountId }; }
      } else { results.error = r1.data; }
    }

    else if (testType === 'try_all_title_fields') {
      const jobId = body.jobId || '08e59230-4ac0-4db2-9df2-93de08031bde';
      const title = body.title || 'TEST TITLE FIELD';
      const fields = [{ field: 'JobTitleId', value: { Title: title } }, { field: 'JobTitle', value: title }, { field: 'Title', value: title }, { field: 'PositionTitle', value: title }, { field: 'Position', value: title }, { field: 'JobTitleId', value: title }];
      for (const f of fields) { const patchEntity: Record<string, any> = {}; patchEntity[f.field] = f.value; const r = await cPatch(`/jobs/${jobId}`, apiKey, patchEntity); results[`${f.field}_${typeof f.value}`] = { status: r.status, ok: r.ok }; await new Promise(r => setTimeout(r, 1000)); }
      await new Promise(r => setTimeout(r, 1000));
      const rb = await cGet(`/jobs/${jobId}`, apiKey);
      results.finalReadback = { JobTitleId: rb?.Data?.JobTitleId, JobTitle: rb?.Data?.JobTitle, Title: rb?.Data?.Title, PositionTitle: rb?.Data?.PositionTitle, Position: rb?.Data?.Position, Name: rb?.Data?.Name };
    }

    else if (testType === 'discover_sales_stages') {
      const r1 = await cGet('/salesworkflowitemstatuses', apiKey, { take: '50' });
      results.salesworkflowitemstatuses = r1;
      await new Promise(r => setTimeout(r, 1000));
      const jobsRes = await cGet('/jobs', apiKey, { take: '50' });
      const salesStages: Record<string, string> = {};
      for (const j of (jobsRes?.Data || [])) { if (j.SalesWorkflowItemStatusId) { const id = j.SalesWorkflowItemStatusId.Id || j.SalesWorkflowItemStatusId; const title = j.SalesWorkflowItemStatusId.Title || 'unknown'; salesStages[id] = title; } }
      results.uniqueSalesStagesFromJobs = salesStages;
    }

    else if (testType === 'create_job_title') {
      const title = body.title || "Medical Director";
      const r1 = await cPost('/jobtitles', apiKey, { Title: title });
      results.postJobTitles = r1;
    }

    else if (testType === 'search_company') {
      const name = body.name || body.search || '';
      if (!name) return new Response(JSON.stringify({ error: "Need name" }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      const r1 = await cGet('/companies', apiKey, { search: name, take: '25' });
      results.searchResults = (r1?.Data || []).map((c: any) => ({ Id: c.Id, Name: c.Name }));
    }

    else if (testType === 'read_existing_job') {
      const jobId = body.jobId;
      if (!jobId) return new Response(JSON.stringify({ error: "Need jobId" }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      const getRes = await cGet(`/jobs/${jobId}`, apiKey);
      const jobData = getRes?.Data || getRes || {};
      results.nonNullFields = {};
      for (const key of Object.keys(jobData).sort()) { if (jobData[key] !== null && jobData[key] !== undefined && jobData[key] !== '' && jobData[key] !== false) { results.nonNullFields[key] = typeof jobData[key] === 'object' ? JSON.stringify(jobData[key]).substring(0, 300) : String(jobData[key]).substring(0, 300); } }
    }

    else if (testType === 'list_recent_jobs') {
      const take = body.take || 15;
      const res = await cGet('/jobs', apiKey, { take: String(take), skip: '0' });
      results.total = res?.TotalCount;
      results.jobs = (res?.Data || []).map((j: any) => ({ Id: j.Id, Name: j.Name, JobTitleId: j.JobTitleId ? (j.JobTitleId.Title || JSON.stringify(j.JobTitleId)) : null, AccountId: j.AccountId ? (j.AccountId.Title || JSON.stringify(j.AccountId)) : null }));
    }

    else if (testType === 'delete_job') {
      const jobId = body.jobId;
      if (!jobId) return new Response(JSON.stringify({ error: "Need jobId" }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      const res = await fetch(`${CRELATE_BASE}/jobs/${jobId}`, { method: 'DELETE', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' } });
      results.delete = { status: res.status, body: await res.text() };
    }

    else if (testType === 'cleanup_test_jobs') {
      const res = await cGet('/jobs', apiKey, { search: 'TEST', take: '50' });
      const testJobs = (res?.Data || []).filter((j: any) => (j.Name || '').toUpperCase().includes('TEST'));
      results.found = testJobs.length;
      results.deleted = [];
      for (const j of testJobs) { const delRes = await fetch(`${CRELATE_BASE}/jobs/${j.Id}`, { method: 'DELETE', headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' } }); results.deleted.push({ id: j.Id, name: j.Name, status: delRes.status }); await new Promise(r => setTimeout(r, 500)); }
    }

    else if (testType === 'search_job_titles') {
      const search = body.search || 'Medical Director';
      const r = await cGet('/jobtitles', apiKey, { search, take: '20' });
      results.titles = (r?.Data || []).map((jt: any) => ({ Id: jt.Id, Title: jt.Title }));
    }

    else {
      results.help = {
        tests: [
          'paginate_job_titles - Test pagination of /jobtitles endpoint (pageSize)',
          'raw_get - Raw GET request (endpoint, params)',
          'patch_job_title_by_name - Try setting job title via PATCH with Title string (jobId, title)',
          'create_job_with_title - Create job with JobTitleId.Title inline (title, company)',
          'try_all_title_fields - Try all possible field names for job title (jobId, title)',
          'discover_sales_stages - Discover all available sales stage IDs',
          'create_job_title - Try to create a job title entity (title)',
          'read_existing_job - Read full job (jobId)',
          'list_recent_jobs - List recent jobs (take)',
          'delete_job - Delete a job (jobId)',
          'cleanup_test_jobs - Delete all TEST jobs',
          'search_job_titles - Search job title entities (search)',
          'search_company - Quick search (name)',
        ]
      };
    }

    return new Response(JSON.stringify({ success: true, results }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});