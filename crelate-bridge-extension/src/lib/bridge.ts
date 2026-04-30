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
  dedupeContact: (mp_id: string) => bridge('dedupe_check_contact', { mp_id }),
  dedupeCompany: (mp_id: string) => bridge('dedupe_check_company', { mp_id }),
  pushContact: (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_contact', { mp_id, field_choices }),
  pushCompany: (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_company', { mp_id, field_choices }),

  // Pull side: search Crelate, preview vs MP, pull.
  searchCrelateContacts:  (query: string) => bridge('search_crelate_contacts', { query }),
  searchCrelateCompanies: (query: string) => bridge('search_crelate_companies', { query }),
  pullContactPreview: (crelate_id: string) => bridge('pull_contact_preview', { crelate_id }),
  pullCompanyPreview: (crelate_id: string) => bridge('pull_company_preview', { crelate_id }),
  pullContact: (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_contact', { crelate_id, field_choices }),
  pullCompany: (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_company', { crelate_id, field_choices }),

  history: (opts: { limit?: number; entity_type?: string; direction?: string } = {}) =>
    bridge('list_history', opts),

  // Used by the "Read visible from MatchPoint page" flow.
  getMpRecordsByIds: (entity: 'contact' | 'company', ids: string[]) =>
    bridge('get_mp_records_by_ids', { entity, ids }),
};

// Ask the active MatchPoint tab's content script which entity ids are
// currently visible. Returns null if no MP tab is open or the content
// script isn't loaded.
export async function getVisibleMpIds(entity: 'contact' | 'company'): Promise<{ ids: string[]; url: string } | null> {
  if (!chrome?.tabs) return null;
  const tabs = await chrome.tabs.query({
    url: [
      'https://matchpoint-nu-dun.vercel.app/marketing*',
      'http://localhost:5173/marketing*',
      'http://localhost:8080/marketing*',
    ],
  });
  if (tabs.length === 0) return null;
  // Prefer the active tab; fall back to the first match.
  const tab = tabs.find(t => t.active) || tabs[0];
  if (!tab.id) return null;
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id!, { type: 'get_visible_ids', entity }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        resolve(null);
      } else {
        resolve({ ids: res.ids || [], url: res.url || '' });
      }
    });
  });
}
