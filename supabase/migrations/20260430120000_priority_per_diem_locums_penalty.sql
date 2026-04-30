-- Per-diem and locum-tenens roles are intentionally lower priority for
-- this workflow — they're rarely the kind of placement we're chasing.
-- Subtract 15 from the computed priority score when the job title
-- contains "per diem", "per-diem", or the standalone word "locum"/"locums".
--
-- Match patterns (case-insensitive):
--   %per diem%   — "Physician (Per Diem)", "Per Diem RN"
--   %per-diem%   — hyphenated variant
--   \mlocums?\M  — word-boundary "locum" or "locums" so it doesn't
--                  match "locumstack" or "locumstaffing" etc.

CREATE OR REPLACE FUNCTION marketing_job_priority_score(
  p_created_at   timestamptz,
  p_job_title    text,
  p_company_type text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT greatest(0,
    round(
      (marketing_job_recency_score(p_created_at)
       + marketing_job_role_score(p_job_title)
       + marketing_job_category_score(p_company_type)) / 3.0,
      2
    )
    - CASE
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per diem%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per-diem%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%perdiem%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) ~  '\mlocums?\M'   THEN 15
        ELSE 0
      END
  );
$$;

-- Refresh every job's score with the new modifier so existing rows
-- reflect the change without waiting for a row update to fire the trigger.
SELECT recompute_marketing_job_priorities();
