-- Add a -3 priority penalty for highly specialized clinical roles.
--
-- Rationale: hyper-specialist roles (cardiothoracic surgery, neurosurgery,
-- pediatric subspecialties, etc.) take longer to place, have thinner
-- candidate pools, and shouldn't crowd out comparable general roles
-- (Family Medicine, IM, Hospitalist) at the top of the priority list.
-- The penalty is small (-3) because we still want to surface them —
-- just not ahead of higher-yield general listings, all else equal.
--
-- The penalty STACKS with the existing -15 per-diem / part-time / 1099
-- penalty (CASE-as-separate-term), so a per-diem cardiothoracic role
-- gets both deductions.
--
-- Patterns are case-insensitive substring or regex word-boundary
-- matches against job_title. The list is intentionally conservative
-- — it captures the recognized hyper-specialist tier in MD/DO
-- recruiting, but skips borderline general specialties like
-- (non-interventional) Cardiology, Oncology, or GI which are common
-- placements.

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
    -- Per-diem / part-time / 1099 penalty (unchanged).
    - CASE
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per diem%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%per-diem%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%perdiem%'   THEN 15
        WHEN lower(coalesce(p_job_title, '')) ~  '\mlocums?\M'   THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%part time%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%part-time%' THEN 15
        WHEN lower(coalesce(p_job_title, '')) LIKE '%parttime%'  THEN 15
        WHEN lower(coalesce(p_job_title, '')) ~  '\m1099\M'      THEN 15
        ELSE 0
      END
    -- Specialty penalty: -3 for hyper-specialist clinical roles.
    -- Multiple matches don't stack within this CASE — the first WHEN
    -- wins — by design: a "Pediatric Neurosurgeon" gets -3 once, not
    -- -6 for matching both pediatric-subspecialty AND neurosurgery.
    - CASE
        -- Surgical hyper-specialties
        WHEN lower(coalesce(p_job_title, '')) LIKE '%cardiothoracic%'      THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%cardiac surg%'        THEN 3
        WHEN lower(coalesce(p_job_title, '')) ~  '\mct surg(eon|ery)\M'    THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%neurosurg%'           THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%neurological surg%'   THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%plastic surg%'        THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%vascular surg%'       THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%transplant surg%'     THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%trauma surg%'         THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%surgical oncolog%'    THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%oral and maxillofacial%' THEN 3
        WHEN lower(coalesce(p_job_title, '')) ~  '\momfs\M'                THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%hand surg%'           THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%spine surg%'          THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%pediatric surg%'      THEN 3
        -- Pediatric subspecialties (peds + a subspecialty cue)
        WHEN lower(coalesce(p_job_title, '')) ~ '\m(pediatric|peds)\M.*\m(cardiology|oncology|neurology|pulmonology|nephrology|gastroenterology|endocrinology|hematology|rheumatology|critical care|intensive care|infectious disease)\M' THEN 3
        -- Interventional / procedural subspecialties
        WHEN lower(coalesce(p_job_title, '')) LIKE '%interventional radiolog%'  THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%interventional cardiolog%' THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%electrophysiolog%'         THEN 3
        -- Women's-health / reproductive subspecialties
        WHEN lower(coalesce(p_job_title, '')) LIKE '%maternal fetal%' THEN 3
        WHEN lower(coalesce(p_job_title, '')) ~  '\mmfm\M'            THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%reproductive endocrinolog%' THEN 3
        WHEN lower(coalesce(p_job_title, '')) ~  '\mrei\M'            THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%gyn onc%'        THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%gynecologic oncolog%' THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%urogynecolog%'   THEN 3
        -- Neonatology / NICU
        WHEN lower(coalesce(p_job_title, '')) LIKE '%neonatolog%'     THEN 3
        -- Pain / sleep medicine
        WHEN lower(coalesce(p_job_title, '')) LIKE '%pain medicine%'  THEN 3
        WHEN lower(coalesce(p_job_title, '')) LIKE '%sleep medicine%' THEN 3
        ELSE 0
      END
  );
$$;

-- Refresh every job's score so the new penalty takes effect immediately.
SELECT recompute_marketing_job_priorities();
