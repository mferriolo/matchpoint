-- Extend the per-diem/locums -15 priority penalty to part-time and 1099
-- roles. Same rationale: these aren't the placements we're chasing for
-- this workflow, so they should rank below comparable full-time W2
-- listings. The penalty stacks at 15 (does not multiply when multiple
-- markers are present, matches the existing CASE semantics).
--
-- Match patterns (case-insensitive):
--   %part time%  / %part-time% / %parttime%   — "Part Time RN", "Part-Time NP"
--   \m1099\M                                   — standalone "1099" so it
--                                                doesn't match "10999" etc.

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
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per diem%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per-diem%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%perdiem%'   THEN 15
        WHEN lower(coalesce(p_job_title, '')) ~  '\mlocums?\M'    THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%part time%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%part-time%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%parttime%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) ~  '\m1099\M'       THEN 15
        ELSE 0
      END
  );
$$;

-- Refresh every job's score with the new modifier so existing rows
-- reflect the change without waiting for a row update to fire the trigger.
SELECT recompute_marketing_job_priorities();
