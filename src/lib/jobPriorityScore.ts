/**
 * Client-side mirror of the marketing_jobs priority scoring functions
 * defined in supabase/migrations/20260427120000_marketing_job_priority_score.sql.
 *
 * Used to preview a score for jobs whose row hasn't been recomputed yet
 * (immediately after insert, before recompute RPC runs) and to compute
 * "contact priority" — the max priority among open jobs at the contact's
 * company — without an extra round-trip to the DB.
 *
 * Keep this file in sync with the SQL. If one changes, the other must.
 */

export interface PriorityBreakdown {
  total: number;       // 0–100
  recency: number;
  role: number;
  category: number;
}

export function recencyScore(createdAt: string | Date | null | undefined): number {
  if (!createdAt) return 50;
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 50;
  const ageDays = (Date.now() - t) / 86_400_000;
  if (ageDays <= 7) return 100;
  if (ageDays <= 28) return 75;
  if (ageDays <= 58) return 75 - (55 * ((ageDays - 28) / 30));
  return 20;
}

const ROLE_PATTERNS: Array<{ score: number; test: (t: string) => boolean }> = [
  { score: 100, test: t => /chief medical officer/.test(t) || /\bcmo\b/.test(t) },
  { score: 95,  test: t => /(senior\s+vice\s+president|svp|vice\s+president|vp)\s+.*medical|medical.*\b(svp|vp)\b/.test(t) },
  { score: 90,  test: t => /medical director/.test(t) },
  { score: 80,  test: t => /physician|doctor|\b(md|do|m\.d\.|d\.o\.)\b/.test(t) },
  { score: 57,  test: t => /nurse practitioner|\b(np|np-c|crnp|fnp|agnp|pmhnp)\b|physician assistant|\b(pa|pa-c)\b/.test(t) },
  { score: 40,  test: t => /registered nurse|\brn\b/.test(t) },
  { score: 25,  test: t => /licensed practical nurse|licensed vocational nurse|\b(lpn|lvn)\b/.test(t) },
  { score: 10,  test: t => /medical assistant|\bma\b|technician|\btech\b/.test(t) },
];

export function roleScore(jobTitle: string | null | undefined): number {
  if (!jobTitle) return 50;
  const t = jobTitle.toLowerCase();
  for (const p of ROLE_PATTERNS) {
    if (p.test(t)) return p.score;
  }
  return 50;
}

export function categoryScore(companyType: string | null | undefined): number {
  if (!companyType || !companyType.trim()) return 60;
  const c = companyType.toLowerCase();
  if (c.includes('value based care') || c.includes('vbc')) return 100;
  if (c.includes('pace'))           return 90;
  if (c.includes('fqhc'))           return 80;
  if (c.includes('health plan'))    return 70;
  if (c.includes('all other') || c === 'other') return 60;
  if (c.includes('health system'))  return 40;
  if (c.includes('hospital'))       return 20;
  return 60;
}

export function priorityScore(args: {
  createdAt?: string | Date | null;
  jobTitle?: string | null;
  companyType?: string | null;
}): PriorityBreakdown {
  const recency  = recencyScore(args.createdAt);
  const role     = roleScore(args.jobTitle);
  const category = categoryScore(args.companyType);
  return {
    total: Math.round(((recency + role + category) / 3) * 100) / 100,
    recency,
    role,
    category,
  };
}

/**
 * Heat-gradient color for a 0–100 score. Cold (low) = blue, hot (high) =
 * red, smoothly interpolating through cyan/green/yellow/orange. Returns
 * inline-style colors — Tailwind has no equivalent gradient utilities
 * that would let us pick by numeric input at render time.
 */
export function heatColors(score: number): { bg: string; fg: string; border: string } {
  const s = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  // Hue 240° (blue) at 0 → 0° (red) at 100.
  const hue = 240 - (240 * s) / 100;
  return {
    bg:     `hsl(${hue}, 78%, 90%)`,
    fg:     `hsl(${hue}, 55%, 28%)`,
    border: `hsl(${hue}, 55%, 70%)`,
  };
}
