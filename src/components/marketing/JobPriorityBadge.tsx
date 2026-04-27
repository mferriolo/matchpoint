import React from 'react';
import { heatColors } from '@/lib/jobPriorityScore';

/**
 * Small numeric pill colored by a heat gradient (cold blue → hot red)
 * keyed off a 0–100 priority score. Used in the Tracker, Jobs tab, and
 * Contacts tab so the visual ordering is consistent across views.
 *
 * Renders nothing when score is null/undefined so older rows that
 * haven't been backfilled yet don't show a misleading "0".
 */
interface JobPriorityBadgeProps {
  score?: number | null;
  /** Override label; defaults to the rounded score. */
  label?: string;
  /** Tooltip — defaults to "Priority {score}/100". */
  title?: string;
  className?: string;
}

export const JobPriorityBadge: React.FC<JobPriorityBadgeProps> = ({ score, label, title, className }) => {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  const { bg, fg, border } = heatColors(rounded);
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums rounded border ${className || ''}`}
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
      title={title || `Priority ${rounded}/100`}
    >
      {label ?? rounded}
    </span>
  );
};

export default JobPriorityBadge;
