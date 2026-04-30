// Thin client for the extension-bridge edge function. All Crelate calls
// happen server-side; the extension never holds the Crelate API key.

const SUPABASE_URL = 'https://nrnmzvenwjqsnegxyaxz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ybm16dmVud2pxc25lZ3h5YXh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzE4NDQsImV4cCI6MjA2OTUwNzg0NH0.1xtsiMitJmIX7F2GBJ0OsCh-6ErPAigryQoiSHUPp2I';

const ENDPOINT = `${SUPABASE_URL}/functions/v1/extension-bridge`;

export interface BridgeResponse<T = any> {
  success: boolean;
  error?: string;
  [key: string]: any;
}

export async function bridge<T = any>(action: string, payload: Record<string, any> = {}): Promise<BridgeResponse<T>> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.success) {
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// Typed wrappers for the actions the popup uses.
export const bridgeApi = {
  ping: () => bridge('ping'),

  // Push side: search MatchPoint, dedupe-check, push.
  searchMpContacts:  (query: string) => bridge('search_mp_contacts', { query }),
  searchMpCompanies: (query: string) => bridge('search_mp_companies', { query }),
  searchMpJobs:      (query: string) => bridge('search_mp_jobs', { query }),
  dedupeContact: (mp_id: string) => bridge('dedupe_check_contact', { mp_id }),
  dedupeCompany: (mp_id: string) => bridge('dedupe_check_company', { mp_id }),
  dedupeJob:     (mp_id: string) => bridge('dedupe_check_job', { mp_id }),
  pushContact: (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_contact', { mp_id, field_choices }),
  pushCompany: (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_company', { mp_id, field_choices }),
  pushJob:     (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_job', { mp_id, field_choices }),

  // Pull side: search Crelate, preview vs MP, pull.
  searchCrelateContacts:  (query: string) => bridge('search_crelate_contacts', { query }),
  searchCrelateCompanies: (query: string) => bridge('search_crelate_companies', { query }),
  searchCrelateJobs:      (query: string) => bridge('search_crelate_jobs', { query }),
  pullContactPreview: (crelate_id: string) => bridge('pull_contact_preview', { crelate_id }),
  pullCompanyPreview: (crelate_id: string) => bridge('pull_company_preview', { crelate_id }),
  pullJobPreview:     (crelate_id: string) => bridge('pull_job_preview', { crelate_id }),
  pullContact: (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_contact', { crelate_id, field_choices }),
  pullCompany: (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_company', { crelate_id, field_choices }),
  pullJob:     (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_job', { crelate_id, field_choices }),

  history: (opts: { limit?: number; entity_type?: string; direction?: string } = {}) =>
    bridge('list_history', opts),

  // Used by the "Read visible from MatchPoint page" flow.
  getMpRecordsByIds: (entity: 'contact' | 'company' | 'job', ids: string[]) =>
    bridge('get_mp_records_by_ids', { entity, ids }),
};

// Run async work over an array with a fixed concurrency cap. Each
// completed task fires `onComplete` so callers can update progress
// state in real time. Items finish out of order — the result array
// preserves input order for callers that need it. Used by bulk push +
// bulk pull to stop processing one Crelate request at a time.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onComplete?: (item: T, result: R, index: number, doneSoFar: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let done = 0;
  const concurrency = Math.max(1, Math.min(limit, items.length));
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
        done++;
        onComplete?.(items[i], results[i], i, done);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}

// Read the visible MP entity ids from whatever's the active tab. Uses
// chrome.scripting.executeScript instead of pre-declared content scripts
// so we don't depend on the manifest's URL match list — works on any
// MatchPoint deployment (custom domain, Vercel preview, localhost, etc.)
// as long as activeTab + scripting permissions are granted.
//
// Returns:
//   { ids, url, matched: true }  — got ids from a page that looks like /marketing
//   { ids: [], url, matched: false } — active tab isn't a /marketing page
//   null — no active tab / api unavailable
export async function getVisibleMpIds(
  entity: 'contact' | 'company' | 'job'
): Promise<{ ids: string[]; url: string; matched: boolean } | null> {
  if (!chrome?.tabs) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;

  const isMarketing = /\/marketing/i.test(tab.url);
  if (!chrome.scripting) {
    return { ids: [], url: tab.url, matched: isMarketing };
  }

  try {
    const attr = entity === 'contact' ? 'data-mp-contact-id'
               : entity === 'company' ? 'data-mp-company-id'
               : 'data-mp-job-id';
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // The function runs in the page context, so it can't reference
      // anything from this scope — pass via args.
      func: (attrName: string) => {
        const ids: string[] = [];
        document.querySelectorAll(`[${attrName}]`).forEach(el => {
          const v = el.getAttribute(attrName);
          if (v) ids.push(v);
        });
        return ids;
      },
      args: [attr],
    });
    const ids: string[] = (results?.[0]?.result as string[]) || [];
    return { ids, url: tab.url, matched: isMarketing };
  } catch (e) {
    // Most common reason this throws: the page is a chrome:// URL or
    // the user hasn't granted activeTab. Bubble up a benign result so
    // the caller can show the active tab url in the error.
    return { ids: [], url: tab.url, matched: isMarketing };
  }
}
