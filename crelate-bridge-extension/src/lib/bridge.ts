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
  searchContacts: (query: string) => bridge('search_mp_contacts', { query }),
  dedupeContact: (mp_id: string) => bridge('dedupe_check_contact', { mp_id }),
  pushContact: (mp_id: string, field_choices?: Record<string, any>) =>
    bridge('push_contact', { mp_id, field_choices }),
  pullContact: (crelate_id: string, field_choices?: Record<string, any>) =>
    bridge('pull_contact', { crelate_id, field_choices }),
  history: (opts: { limit?: number; entity_type?: string; direction?: string } = {}) =>
    bridge('list_history', opts),
};
