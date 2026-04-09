import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const W = (ms: number) => new Promise(r => setTimeout(r, ms));

// Extract readable text from HTML, stripping tags and excessive whitespace
function htmlToText(html: string): string {
  // Remove script/style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.trim();
  return text;
}

// Try to extract just the job description section from full page text
function extractJobDescription(text: string, url: string): string {
  // Common section headers that signal job description content
  const startPatterns = [
    /(?:job\s+description|about\s+the\s+(?:role|position|job|opportunity)|position\s+summary|role\s+summary|overview|what\s+you['']ll\s+do|responsibilities|the\s+role)\s*[:\n]/i,
  ];
  const endPatterns = [
    /(?:apply\s+now|submit\s+(?:your\s+)?(?:application|resume)|how\s+to\s+apply|about\s+(?:us|the\s+company|our\s+company)|equal\s+opportunity|eeo\s+statement|we\s+are\s+an?\s+equal|©\s*\d{4}|copyright\s+\d{4}|privacy\s+policy|cookie\s+policy|sign\s+up\s+for\s+job\s+alerts)/i,
  ];

  let startIdx = 0;
  for (const pat of startPatterns) {
    const m = text.match(pat);
    if (m && m.index !== undefined) {
      startIdx = m.index;
      break;
    }
  }

  let endIdx = text.length;
  const searchFrom = text.substring(startIdx + 50); // skip past the header itself
  for (const pat of endPatterns) {
    const m = searchFrom.match(pat);
    if (m && m.index !== undefined) {
      endIdx = startIdx + 50 + m.index;
      break;
    }
  }

  let desc = text.substring(startIdx, endIdx).trim();

  // If the extracted section is too short, fall back to a reasonable chunk of the full text
  if (desc.length < 100) {
    desc = text.substring(0, 8000);
  }

  // Cap at 10000 chars
  if (desc.length > 10000) {
    desc = desc.substring(0, 10000);
  }

  return desc;
}

async function fetchPageText(url: string): Promise<{ text: string | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return { text: null, error: `HTTP ${resp.status}` };
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return { text: null, error: `Non-HTML content: ${contentType}` };
    }

    const html = await resp.text();
    const fullText = htmlToText(html);
    const description = extractJobDescription(fullText, url);
    return { text: description };
  } catch (e) {
    return { text: null, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const R = (o: any) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    const st = Date.now();

    let body: any = {};
    try { body = await req.json(); } catch {}

    const action = body.action || 'scrape';
    const limit = body.limit || 20;
    const jobIds: string[] | null = body.jobIds || null;

    if (action === 'scrape') {
      // Find jobs that have a URL but no description yet
      let query = supabase
        .from('marketing_jobs')
        .select('id, job_title, company_name, website_job_desc, job_url')
        .is('description', null)
        .order('created_at', { ascending: false });

      if (jobIds && jobIds.length > 0) {
        query = query.in('id', jobIds);
      }

      const { data: jobs, error } = await query.limit(limit);

      if (error) return R({ success: false, error: error.message });
      if (!jobs || jobs.length === 0) return R({ success: true, message: 'No jobs need scraping', scraped: 0 });

      const results: any[] = [];
      let scraped = 0, failed = 0, skipped = 0;

      for (const job of jobs) {
        if (Date.now() - st > 50000) {
          results.push({ id: job.id, status: 'timeout' });
          continue;
        }

        const url = job.website_job_desc || job.job_url;
        if (!url) {
          skipped++;
          results.push({ id: job.id, title: job.job_title, status: 'skipped', reason: 'no URL' });
          continue;
        }

        const { text, error: fetchErr } = await fetchPageText(url);
        await W(500); // rate limit between fetches

        if (text && text.length >= 50) {
          const { error: updateErr } = await supabase
            .from('marketing_jobs')
            .update({ description: text, updated_at: new Date().toISOString() })
            .eq('id', job.id);

          if (updateErr) {
            failed++;
            results.push({ id: job.id, title: job.job_title, status: 'error', reason: `DB update: ${updateErr.message}` });
          } else {
            scraped++;
            results.push({ id: job.id, title: job.job_title, company: job.company_name, status: 'success', descLength: text.length, preview: text.substring(0, 200) });
          }
        } else {
          failed++;
          results.push({ id: job.id, title: job.job_title, url, status: 'error', reason: fetchErr || `Description too short (${text?.length || 0} chars)` });
        }
      }

      return R({
        success: true,
        summary: { total: jobs.length, scraped, failed, skipped },
        results,
        ms: `${Date.now() - st}`
      });
    }

    if (action === 'status') {
      const { count: total } = await supabase.from('marketing_jobs').select('id', { count: 'exact', head: true });
      const { count: withDesc } = await supabase.from('marketing_jobs').select('id', { count: 'exact', head: true }).not('description', 'is', null);
      const { count: withUrl } = await supabase.from('marketing_jobs').select('id', { count: 'exact', head: true }).or('website_job_desc.not.is.null,job_url.not.is.null');
      const { count: needsScraping } = await supabase.from('marketing_jobs').select('id', { count: 'exact', head: true }).is('description', null).or('website_job_desc.not.is.null,job_url.not.is.null');

      return R({
        success: true,
        total: total || 0,
        withDescription: withDesc || 0,
        withUrl: withUrl || 0,
        needsScraping: needsScraping || 0
      });
    }

    return R({ success: false, error: `Unknown action: ${action}` });

  } catch (e) {
    console.error('TOP ERROR:', (e as Error).message);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
