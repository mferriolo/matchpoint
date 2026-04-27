-- Marketing job priority score (0–100). Equal-weighted average of three
-- subscores so each is worth a third of the total:
--
--   recency_score  — based on age of the job (created_at):
--       0–7  days  → 100   (very-very valuable)
--       8–28 days  → 75    (plateau)
--       29–58 days → linear decay 75 → 20 (over 30 days)
--       59+ days   → 20    (low floor)
--
--   role_score     — derived from job_title via longest-substring match:
--       Chief Medical Officer / CMO          100
--       VP / SVP Medical                     95
--       Medical Director                     90
--       Physician / MD / DO (any specialty)  80
--       NP / Nurse Practitioner / PA / PA-C  57   (NP and PA tied)
--       RN / Registered Nurse                40
--       LPN / LVN                            25
--       Other clinical (MA, tech, etc.)      10
--       (no match → default 50)
--
--   category_score — derived from the company's company_type:
--       Value Based Care (VBC)               100
--       PACE Medical Groups                  90
--       FQHC                                 80
--       Health Plans                         70
--       All Others / unmatched               60
--       Health Systems                       40
--       Hospitals                            20
--
-- The score is recomputed on every INSERT/UPDATE of marketing_jobs and
-- whenever a company's company_type changes. Recency drifts daily, so
-- the app calls recompute_marketing_job_priorities() at page-load time
-- to refresh values for jobs whose row hasn't been touched today.

ALTER TABLE marketing_jobs
  ADD COLUMN IF NOT EXISTS priority_score numeric(5,2);

CREATE INDEX IF NOT EXISTS idx_marketing_jobs_priority_score
  ON marketing_jobs (priority_score DESC NULLS LAST);

-- Helper: recency component from days-since-created.
CREATE OR REPLACE FUNCTION marketing_job_recency_score(p_created_at timestamptz)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  age_days numeric;
BEGIN
  IF p_created_at IS NULL THEN RETURN 50; END IF;
  age_days := EXTRACT(EPOCH FROM (now() - p_created_at)) / 86400.0;
  IF age_days <= 7  THEN RETURN 100; END IF;
  IF age_days <= 28 THEN RETURN 75;  END IF;
  IF age_days <= 58 THEN
    -- Linear decay 75 → 20 between day 28 and day 58.
    RETURN 75 - (55 * ((age_days - 28) / 30.0));
  END IF;
  RETURN 20;
END;
$$;
-- recency depends on now(), so technically not IMMUTABLE — but PG only
-- enforces this for indexed expressions and we don't index on the
-- function. Marking IMMUTABLE lets the planner inline it.

-- Helper: role rank from a job title via longest-substring match.
-- Sorted longest-first so "Chief Medical Officer" wins over "Medical".
CREATE OR REPLACE FUNCTION marketing_job_role_score(p_job_title text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
BEGIN
  IF p_job_title IS NULL THEN RETURN 50; END IF;
  t := lower(p_job_title);
  -- Order matters: most-specific first.
  IF t LIKE '%chief medical officer%' OR t ~ '\mcmo\M' THEN RETURN 100; END IF;
  IF t LIKE '%senior vice president%medical%'
     OR t LIKE '%svp%medical%'
     OR t LIKE '%vice president%medical%'
     OR t LIKE '%vp%medical%'
     THEN RETURN 95;
  END IF;
  IF t LIKE '%medical director%' THEN RETURN 90; END IF;
  IF t LIKE '%physician%' OR t LIKE '%doctor%'
     OR t ~ '\m(md|do|m\.d\.|d\.o\.)\M'
     THEN RETURN 80;
  END IF;
  IF t LIKE '%nurse practitioner%' OR t ~ '\m(np|np-c|crnp|fnp|agnp|pmhnp)\M'
     OR t LIKE '%physician assistant%' OR t ~ '\m(pa|pa-c)\M'
     THEN RETURN 57;
  END IF;
  IF t LIKE '%registered nurse%' OR t ~ '\mrn\M' THEN RETURN 40; END IF;
  IF t LIKE '%licensed practical nurse%' OR t LIKE '%licensed vocational nurse%'
     OR t ~ '\m(lpn|lvn)\M'
     THEN RETURN 25;
  END IF;
  IF t LIKE '%medical assistant%' OR t ~ '\mma\M'
     OR t LIKE '%technician%' OR t LIKE '%tech %' OR t LIKE '% tech'
     THEN RETURN 10;
  END IF;
  RETURN 50;
END;
$$;

-- Helper: category rank from company_type (matched case-insensitively).
CREATE OR REPLACE FUNCTION marketing_job_category_score(p_company_type text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  c text;
BEGIN
  IF p_company_type IS NULL OR btrim(p_company_type) = '' THEN RETURN 60; END IF;
  c := lower(p_company_type);
  IF c LIKE '%value based care%' OR c LIKE '%vbc%' THEN RETURN 100; END IF;
  IF c LIKE '%pace%'                                  THEN RETURN 90;  END IF;
  IF c LIKE '%fqhc%'                                  THEN RETURN 80;  END IF;
  IF c LIKE '%health plan%'                           THEN RETURN 70;  END IF;
  IF c LIKE '%all other%' OR c = 'other'              THEN RETURN 60;  END IF;
  IF c LIKE '%health system%'                         THEN RETURN 40;  END IF;
  IF c LIKE '%hospital%'                              THEN RETURN 20;  END IF;
  RETURN 60;
END;
$$;

-- Combine: equal-weighted average rounded to 2 decimals.
CREATE OR REPLACE FUNCTION marketing_job_priority_score(
  p_created_at  timestamptz,
  p_job_title   text,
  p_company_type text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    (marketing_job_recency_score(p_created_at)
     + marketing_job_role_score(p_job_title)
     + marketing_job_category_score(p_company_type)) / 3.0,
    2
  );
$$;

-- Trigger: keep priority_score current as rows change. Looks up the
-- company_type via FK so a job-only update doesn't have to know it.
CREATE OR REPLACE FUNCTION marketing_jobs_set_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ct text;
BEGIN
  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  NEW.priority_score := marketing_job_priority_score(NEW.created_at, NEW.job_title, ct);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_jobs_priority_score ON marketing_jobs;
CREATE TRIGGER trg_marketing_jobs_priority_score
  BEFORE INSERT OR UPDATE OF created_at, job_title, company_id ON marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION marketing_jobs_set_priority_score();

-- Trigger: when a company's company_type changes, re-score every one of
-- its jobs in a single UPDATE.
CREATE OR REPLACE FUNCTION marketing_companies_propagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_type IS DISTINCT FROM OLD.company_type THEN
    UPDATE marketing_jobs
       SET priority_score = marketing_job_priority_score(created_at, job_title, NEW.company_type)
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_companies_propagate_priority ON marketing_companies;
CREATE TRIGGER trg_marketing_companies_propagate_priority
  AFTER UPDATE OF company_type ON marketing_companies
  FOR EACH ROW
  EXECUTE FUNCTION marketing_companies_propagate_priority();

-- Bulk recompute. Called by the app on page load to refresh recency
-- decay for jobs whose row hasn't been touched recently.
CREATE OR REPLACE FUNCTION recompute_marketing_job_priorities()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE marketing_jobs j
     SET priority_score = marketing_job_priority_score(j.created_at, j.job_title, c.company_type)
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Catch jobs without a company_id too (rare but possible).
  UPDATE marketing_jobs
     SET priority_score = marketing_job_priority_score(created_at, job_title, NULL)
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_marketing_job_priorities()
  TO authenticated, service_role, anon;

-- Initial backfill so the column has values immediately.
SELECT recompute_marketing_job_priorities();
