import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const W = (ms: number) => new Promise(r => setTimeout(r, ms));

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): string {
  // Decode-then-strip in a small loop so HTML-entity-encoded tags
  // (`&lt;p style="..."&gt;`, common in JSON-LD descriptions) get
  // converted back to real `<p>` first, then stripped on the next pass.
  // Without the loop, a single decode-after-strip leaves raw markup in
  // the output. Three passes covers double-encoded payloads (Workday +
  // SmartRecruiters do this) and stops early once stable.
  let text = html;
  for (let i = 0; i < 3; i++) {
    const before = text;
    text = decodeEntities(text);
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '\n- ');
    // Strict tag pattern — only matches well-formed tags, so stray "<"
    // in body text isn't accidentally consumed.
    text = text.replace(/<\/?[a-zA-Z][^<>]*>/g, ' ');
    if (text === before) break;
  }
  // Collapse zero-width and non-printing whitespace artifacts.
  text = text.replace(/ /g, ' ').replace(/[​-‍﻿]/g, '');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]+/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// Strategy 1: Extract from JSON-LD structured data (most reliable)
function extractFromJsonLd(html: string): string | null {
  const ldRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // Could be a single object or array
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'JobPosting' || item['@type']?.includes?.('JobPosting')) {
          const desc = item.description || item.jobDescription || '';
          if (desc && desc.length > 50) {
            // Description might be HTML, convert to text
            return htmlToText(desc);
          }
        }
        // Check nested @graph
        if (item['@graph']) {
          for (const g of item['@graph']) {
            if (g['@type'] === 'JobPosting') {
              const desc = g.description || g.jobDescription || '';
              if (desc && desc.length > 50) return htmlToText(desc);
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

// Strategy 2: Extract from known job board HTML patterns
function extractFromJobBoardHtml(html: string, url: string): string | null {
  const lower = url.toLowerCase();

  // Greenhouse
  if (lower.includes('greenhouse.io') || lower.includes('boards.greenhouse')) {
    const m = html.match(/<div[^>]*id\s*=\s*["']content["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*id\s*=\s*["']footer/i)
      || html.match(/<div[^>]*class\s*=\s*["'][^"']*job[-_]?description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<div[^>]*id\s*=\s*["']app_body["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*id|$)/i);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  // Lever
  if (lower.includes('lever.co') || lower.includes('jobs.lever')) {
    const m = html.match(/<div[^>]*class\s*=\s*["'][^"']*posting-page[^"']*["'][^>]*>([\s\S]*?)<div[^>]*class\s*=\s*["'][^"']*posting-btn/i)
      || html.match(/<div[^>]*class\s*=\s*["'][^"']*section-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class\s*=\s*["'][^"']*posting-btn/i);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  // UltiPro / UKG
  if (lower.includes('ultipro.com') || lower.includes('ukg.com')) {
    const m = html.match(/<div[^>]*class\s*=\s*["'][^"']*job-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  // Workday
  if (lower.includes('myworkday') || lower.includes('workday.com')) {
    const m = html.match(/<div[^>]*data-automation-id\s*=\s*["']jobPostingDescription["'][^>]*>([\s\S]*?)<\/div>/i);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  // iCIMS
  if (lower.includes('icims.com')) {
    const m = html.match(/<div[^>]*class\s*=\s*["'][^"']*iCIMS_JobContent[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  // Generic: look for common job description container classes/ids
  const genericPatterns = [
    /<div[^>]*class\s*=\s*["'][^"']*job[-_]?desc(?:ription)?[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<(?:div|footer|section)/i,
    /<div[^>]*id\s*=\s*["']job[-_]?desc(?:ription)?["'][^>]*>([\s\S]*?)<\/div>\s*<(?:div|footer|section)/i,
    /<section[^>]*class\s*=\s*["'][^"']*job[-_]?desc(?:ription)?[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
    /<article[^>]*class\s*=\s*["'][^"']*job[-_]?(?:detail|posting|content)[^"']*["'][^>]*>([\s\S]*?)<\/article>/i,
  ];
  for (const pat of genericPatterns) {
    const m = html.match(pat);
    if (m) { const t = htmlToText(m[1]); if (t.length > 100) return t; }
  }

  return null;
}

// Strategy 3: Extract from full page text using section headers
function extractFromText(text: string): string | null {
  const startPatterns = [
    /(?:job\s+description|about\s+the\s+(?:role|position|job|opportunity)|position\s+summary|role\s+summary|what\s+you[''\u2019]ll\s+do|key\s+responsibilities|responsibilities|the\s+role|the\s+opportunity|your\s+impact)\s*[:\-\n]/i,
  ];
  const endPatterns = [
    /(?:apply\s+now|submit\s+(?:your\s+)?(?:application|resume)|how\s+to\s+apply|about\s+(?:us|the\s+company|our\s+company)|equal\s+opportunity|eeo\s+statement|we\s+are\s+an?\s+equal|©\s*\d{4}|copyright\s+\d{4}|privacy\s+policy|cookie\s+policy|sign\s+up\s+for\s+job\s+alerts|similar\s+jobs|related\s+jobs|other\s+(?:jobs|positions|openings))/i,
  ];

  let startIdx = -1;
  for (const pat of startPatterns) {
    const m = text.match(pat);
    if (m && m.index !== undefined) { startIdx = m.index; break; }
  }
  if (startIdx === -1) return null;

  let endIdx = text.length;
  const searchFrom = text.substring(startIdx + 30);
  for (const pat of endPatterns) {
    const m = searchFrom.match(pat);
    if (m && m.index !== undefined) { endIdx = startIdx + 30 + m.index; break; }
  }

  const desc = text.substring(startIdx, endIdx).trim();
  return desc.length >= 150 ? desc : null;
}

// Detect if text looks like a job listing page (multiple jobs) rather than a single job description
function looksLikeJobListing(text: string): boolean {
  // Count patterns that suggest multiple job listings
  const jobLinkCount = (text.match(/(?:view\s+job|apply\s+now|learn\s+more|see\s+details)/gi) || []).length;
  const locationRepeats = (text.match(/(?:remote|hybrid|on-?site)\s*[-|]\s*(?:full|part)/gi) || []).length;
  if (jobLinkCount > 3 || locationRepeats > 3) return true;
  return false;
}

async function scrapeJobDescription(url: string): Promise<{ text: string | null; method?: string; error?: string }> {
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

    if (!resp.ok) return { text: null, error: `HTTP ${resp.status}` };

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return { text: null, error: `Non-HTML content: ${contentType}` };
    }

    const html = await resp.text();

    // Strategy 1: JSON-LD (most reliable - structured data embedded by job boards)
    const jsonLd = extractFromJsonLd(html);
    if (jsonLd && jsonLd.length >= 100 && !looksLikeJobListing(jsonLd)) {
      return { text: jsonLd.substring(0, 10000), method: 'json-ld' };
    }

    // Strategy 2: Known job board HTML patterns
    const boardHtml = extractFromJobBoardHtml(html, url);
    if (boardHtml && boardHtml.length >= 100 && !looksLikeJobListing(boardHtml)) {
      return { text: boardHtml.substring(0, 10000), method: 'html-pattern' };
    }

    // Strategy 3: Text section extraction
    const fullText = htmlToText(html);
    const textExtract = extractFromText(fullText);
    if (textExtract && !looksLikeJobListing(textExtract)) {
      return { text: textExtract.substring(0, 10000), method: 'text-section' };
    }

    // If all strategies fail, don't return garbage — return nothing
    return { text: null, error: 'Could not extract job description from page (may be JS-rendered or a listing page)' };
  } catch (e) {
    return { text: null, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  try {
    const R = (o: any) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    const st = Date.now();

    let body: any = {};
    try { body = await req.json(); } catch {}

    const action = body.action || 'scrape';
    const limit = body.limit || 20;
    const jobIds: string[] | null = body.jobIds || null;

    // Debug a single URL to see what extraction returns
    if (action === 'debug') {
      const url = body.url;
      if (!url) return R({ success: false, error: 'url required' });
      const result = await scrapeJobDescription(url);
      return R({ success: true, url, ...result, textLength: result.text?.length || 0, preview: result.text?.substring(0, 500) });
    }

    if (action === 'scrape') {
      let query = supabase
        .from('marketing_jobs')
        .select('id, job_title, company_name, website_job_desc, job_url')
        .is('description', null)
        .order('created_at', { ascending: false });

      if (jobIds && jobIds.length > 0) {
        query = query.in('id', jobIds);
      }

      // Allow re-scraping if requested
      if (body.rescrape) {
        query = supabase
          .from('marketing_jobs')
          .select('id, job_title, company_name, website_job_desc, job_url')
          .order('created_at', { ascending: false });
        if (jobIds && jobIds.length > 0) {
          query = query.in('id', jobIds);
        }
      }

      const { data: jobs, error } = await query.limit(limit);

      if (error) return R({ success: false, error: error.message });
      if (!jobs || jobs.length === 0) return R({ success: true, message: 'No jobs need scraping', scraped: 0 });

      // Definitive "this URL is dead" signals that warrant auto-closing
      // the job. We're conservative — 403 / 429 / timeouts / generic
      // extraction failures are NOT auto-closed because they're often
      // transient or anti-bot blocks. Only HTTP 404 / 410 / 451 and
      // outright network failures (DNS, connection refused) qualify.
      const isDeadLink = (err: string | undefined): boolean => {
        if (!err) return false;
        if (/HTTP 404|HTTP 410|HTTP 451/.test(err)) return true;
        if (/fetch failed|getaddrinfo|ENOTFOUND|ECONNREFUSED|connection refused|NetworkError|name not resolved/i.test(err)) return true;
        return false;
      };

      const results: any[] = [];
      let scraped = 0, failed = 0, skipped = 0, closed = 0;

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

        const { text, method, error: fetchErr } = await scrapeJobDescription(url);
        await W(500);

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
            results.push({ id: job.id, title: job.job_title, company: job.company_name, status: 'success', method, descLength: text.length, preview: text.substring(0, 200) });
          }
        } else if (isDeadLink(fetchErr)) {
          // Auto-close: mark the job as Closed with a reason that
          // makes it clear it was the scraper, not the user.
          const now = new Date().toISOString();
          await supabase.from('marketing_jobs').update({
            is_closed: true,
            status: 'Closed',
            closed_at: now,
            closed_reason: `Auto-closed by scraper — ${fetchErr}`,
            url_status: 'dead',
            url_check_result: fetchErr,
            last_url_check: now,
            updated_at: now,
          }).eq('id', job.id);
          closed++;
          results.push({
            id: job.id, title: job.job_title, url,
            status: 'closed', reason: fetchErr,
          });
        } else {
          failed++;
          results.push({ id: job.id, title: job.job_title, url, status: 'error', reason: fetchErr || `Extraction failed` });
        }
      }

      return R({
        success: true,
        summary: { total: jobs.length, scraped, failed, skipped, closed },
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
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });
  }
});
