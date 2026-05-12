// Email format inference + guess generator.
//
// Given a company's existing contacts that DO have an email on file,
// figure out which local-part pattern they use, then generate a
// guessed email for a (first_name, last_name) at that company using
// the same pattern. Used by the "Guess Emails" bulk action on the
// Contacts tab to fill blanks based on observed company conventions.
//
// Caveats:
//   - We only guess when the company has at least one OK observation
//     to learn from. No guess without evidence.
//   - When patterns are split (e.g. 2 first.last + 2 finitlast) we
//     pick the most frequent. Ties resolve to whichever appears
//     first in the PATTERNS array (most-common conventions first).
//   - The local-part is normalized: lowercased, diacritics stripped
//     to ASCII, anything non-alphanumeric removed (so "Lopez-Ruiz"
//     stays "lopez-ruiz" if the company uses hyphens, but a name
//     like "O'Brien" still resolves cleanly).

export type EmailPattern =
  | 'first.last'      // john.doe@
  | 'finit.last'      // j.doe@
  | 'first.linit'     // john.d@
  | 'firstlast'       // johndoe@
  | 'finitlast'       // jdoe@  ← user-cited example
  | 'firstlinit'      // johnd@
  | 'lastfinit'       // doej@
  | 'first_last'      // john_doe@
  | 'first-last'      // john-doe@
  | 'last.first'      // doe.john@
  | 'first'           // john@
  | 'last';           // doe@

// Listed roughly in descending order of empirical frequency in
// US healthcare orgs. Used as the tiebreaker when two patterns
// appear equally often in a company's sample.
const PATTERNS: EmailPattern[] = [
  'first.last',
  'finitlast',
  'firstlast',
  'finit.last',
  'first.linit',
  'firstlinit',
  'first_last',
  'first-last',
  'lastfinit',
  'last.first',
  'first',
  'last',
];

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

/** Identify which pattern (if any) produces `local` from
 *  (first, last). Returns null if no known pattern matches —
 *  observation is then ignored for inference. */
function detectPattern(first: string, last: string, local: string): EmailPattern | null {
  const fn = normalize(first);
  const ln = normalize(last);
  if (!fn || !ln) return null;
  const fi = fn[0];
  const li = ln[0];
  const candidates: Array<[EmailPattern, string]> = [
    ['first.last',  `${fn}.${ln}`],
    ['finitlast',   `${fi}${ln}`],
    ['firstlast',   `${fn}${ln}`],
    ['finit.last',  `${fi}.${ln}`],
    ['first.linit', `${fn}.${li}`],
    ['firstlinit',  `${fn}${li}`],
    ['first_last',  `${fn}_${ln}`],
    ['first-last',  `${fn}-${ln}`],
    ['lastfinit',   `${ln}${fi}`],
    ['last.first',  `${ln}.${fn}`],
    ['first',       fn],
    ['last',        ln],
  ];
  for (const [pat, target] of candidates) {
    if (local === target) return pat;
  }
  return null;
}

/** Generate a local-part for (first, last) using the given pattern.
 *  Returns null if the pattern requires data we don't have (e.g.
 *  "first.last" with empty last name). */
function applyPattern(pattern: EmailPattern, first: string, last: string): string | null {
  const fn = normalize(first);
  const ln = normalize(last);
  const fi = fn[0] || '';
  const li = ln[0] || '';
  // For every pattern, both fn and ln are required UNLESS the
  // pattern is "first" or "last".
  if (pattern === 'first') return fn || null;
  if (pattern === 'last') return ln || null;
  if (!fn || !ln) return null;
  switch (pattern) {
    case 'first.last':  return `${fn}.${ln}`;
    case 'finit.last':  return `${fi}.${ln}`;
    case 'first.linit': return `${fn}.${li}`;
    case 'firstlast':   return `${fn}${ln}`;
    case 'finitlast':   return `${fi}${ln}`;
    case 'firstlinit':  return `${fn}${li}`;
    case 'first_last':  return `${fn}_${ln}`;
    case 'first-last':  return `${fn}-${ln}`;
    case 'lastfinit':   return `${ln}${fi}`;
    case 'last.first':  return `${ln}.${fn}`;
  }
  return null;
}

export interface CompanyEmailSample {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export interface CompanyEmailModel {
  /** Most common detectable pattern across the observed samples. */
  pattern: EmailPattern;
  /** Most common domain across the observed samples. */
  domain: string;
  /** How many distinct observations supported this pattern + domain. */
  observations: number;
  /** True when the second-place pattern had nearly as many votes —
   *  flagged in the UI as "low-confidence" so the user knows the
   *  inference may be wrong. */
  ambiguous: boolean;
}

/** Build a model of (pattern, domain) from a company's existing
 *  contacts. Returns null when we have nothing to learn from. */
export function inferCompanyEmailModel(samples: CompanyEmailSample[]): CompanyEmailModel | null {
  const patternCounts = new Map<EmailPattern, number>();
  const domainCounts = new Map<string, number>();
  let totalUsable = 0;

  for (const s of samples) {
    const email = (s.email || '').trim();
    if (!email || !email.includes('@')) continue;
    const [localRaw, domainRaw] = email.split('@');
    if (!localRaw || !domainRaw) continue;
    const local = localRaw.toLowerCase().trim();
    const domain = domainRaw.toLowerCase().trim();
    const detected = detectPattern(s.first_name || '', s.last_name || '', local);
    if (!detected) continue;
    patternCounts.set(detected, (patternCounts.get(detected) || 0) + 1);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    totalUsable++;
  }

  if (totalUsable === 0) return null;

  // Pick winning pattern. Tie-break by PATTERNS order (descending
  // empirical frequency in US healthcare).
  let winningPattern: EmailPattern = PATTERNS[0];
  let winningCount = 0;
  let runnerUpCount = 0;
  for (const p of PATTERNS) {
    const n = patternCounts.get(p) || 0;
    if (n > winningCount) {
      runnerUpCount = winningCount;
      winningCount = n;
      winningPattern = p;
    } else if (n > runnerUpCount) {
      runnerUpCount = n;
    }
  }
  if (winningCount === 0) return null;

  // Winning domain.
  let winningDomain = '';
  let domainBest = 0;
  for (const [d, n] of domainCounts) {
    if (n > domainBest) { domainBest = n; winningDomain = d; }
  }
  if (!winningDomain) return null;

  // Ambiguous when the runner-up has at least 60% of the winner's
  // votes AND we have at least 2 observations to compare.
  const ambiguous = totalUsable >= 2 && runnerUpCount >= winningCount * 0.6 && runnerUpCount > 0;

  return {
    pattern: winningPattern,
    domain: winningDomain,
    observations: winningCount,
    ambiguous,
  };
}

/** Apply a company's email model to a (first, last). Returns null
 *  when the pattern can't be applied (missing name parts, etc.). */
export function guessEmail(model: CompanyEmailModel, first: string, last: string): string | null {
  const local = applyPattern(model.pattern, first, last);
  if (!local) return null;
  return `${local}@${model.domain}`;
}

/** Render a human-readable summary of a model for confirm dialogs. */
export function describeModel(model: CompanyEmailModel): string {
  const example: Record<EmailPattern, string> = {
    'first.last':  'firstname.lastname',
    'finit.last':  'f.lastname',
    'first.linit': 'firstname.l',
    'firstlast':   'firstnamelastname',
    'finitlast':   'flastname',
    'firstlinit':  'firstnamel',
    'lastfinit':   'lastnamef',
    'first_last':  'firstname_lastname',
    'first-last':  'firstname-lastname',
    'last.first':  'lastname.firstname',
    'first':       'firstname',
    'last':        'lastname',
  };
  return `${example[model.pattern]}@${model.domain}${model.ambiguous ? ' (low confidence)' : ''}`;
}
