/**
 * Per-browser localStorage helpers for the Marketing page. We don't
 * have user accounts, so saved views and "last visit" stamps live in
 * localStorage rather than a DB table — single recruiter per browser
 * is the working assumption (which already matches how the app is used).
 *
 * Versioned key prefix so we can rev the schema without crashing on
 * stale entries. If the shape ever changes, bump V; old entries will be
 * ignored and replaced on next save.
 */
const V = 1;
const SAVED_VIEWS_KEY = `mp:marketing:savedViews:v${V}`;
const LAST_VISIT_KEY  = `mp:marketing:contactsLastVisit:v${V}`;
const VISIBLE_COLS_KEY = `mp:marketing:contactsVisibleCols:v${V}`;

/** Identifiers for every toggleable column on the Contacts table.
 *  Essentials below are always visible; everything else is opt-in via the
 *  "Columns" toolbar button. Names are stable string literals so they can
 *  round-trip through localStorage without renames breaking on upgrade. */
export type ContactColumnKey =
  | 'priority' | 'first_name' | 'last_name' | 'company' | 'title'
  | 'email' | 'phone_work' | 'phone_home' | 'phone_cell'
  | 'source' | 'created_at' | 'linkedin' | 'confidence' | 'outreach' | 'last_touch';

/** Default visible set when the user has never customized columns. Tuned
 *  to "who do I call today?" — drops phone_home/cell (work is enough),
 *  source, confidence, date added, LinkedIn. Last_touch stays because the
 *  Today presets need it visible to be self-explanatory. */
export const DEFAULT_VISIBLE_COLS: ContactColumnKey[] = [
  'priority', 'first_name', 'last_name', 'company', 'title',
  'email', 'phone_work', 'outreach', 'last_touch',
];

export function loadVisibleCols(): ContactColumnKey[] {
  try {
    const raw = localStorage.getItem(VISIBLE_COLS_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLS;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_VISIBLE_COLS;
    // Filter out any keys that no longer exist (forward-compat).
    const valid: ContactColumnKey[] = [
      'priority', 'first_name', 'last_name', 'company', 'title',
      'email', 'phone_work', 'phone_home', 'phone_cell',
      'source', 'created_at', 'linkedin', 'confidence', 'outreach', 'last_touch',
    ];
    return arr.filter((k: any) => valid.includes(k));
  } catch {
    return DEFAULT_VISIBLE_COLS;
  }
}

export function writeVisibleCols(cols: ContactColumnKey[]): void {
  try {
    localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(cols));
  } catch {
    // Quota / private mode → silently drop. Default set still works.
  }
}

/** A saved Contacts-tab view: search + sort + every filter Set, serialized. */
export interface SavedContactsView {
  id: string;
  name: string;
  createdAt: number;
  search: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  /** Each filter as a sorted string[] (Set isn't JSON-serializable). */
  filters: Record<string, string[]>;
}

export function loadSavedViews(): SavedContactsView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function writeSavedViews(views: SavedContactsView[]): void {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // Quota exceeded / private mode → silently drop. Saved views are
    // a convenience, not a correctness requirement.
  }
}

/**
 * Returns the previous lastVisit timestamp (ms since epoch, or 0 if
 * none) AND advances it to now in one call. Two separate trips would
 * race against each other if multiple tabs read at the same time.
 */
export function consumeContactsLastVisit(): number {
  try {
    const raw = localStorage.getItem(LAST_VISIT_KEY);
    const prev = raw ? Number(raw) : 0;
    localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    return Number.isFinite(prev) ? prev : 0;
  } catch {
    return 0;
  }
}
