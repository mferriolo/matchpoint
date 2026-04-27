-- Recency for the priority score should reflect when the tracker last
-- *saw* the job listed at its source, not when our row was first
-- inserted. A row inserted last April for a CMO position that's still
-- on the company's careers page today should score as fresh.
--
-- Adds a last_seen_at column maintained by the scraper:
--   • New jobs: trigger fills last_seen_at = created_at on INSERT
--   • Existing jobs re-discovered in a tracker run: scraper bulk-updates
--     last_seen_at = now() at end-of-run (see scrape-healthcare-jobs).
--
-- The priority trigger and recompute RPC are retargeted at last_seen_at.

ALTER TABLE marketing_jobs
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Backfill: use the most recent of (created_at, date_posted) so existing
-- rows don't all bottom out at their year-old created_at after migration.
UPDATE marketing_jobs
   SET last_seen_at = GREATEST(
     COALESCE(created_at, date_posted, now()),
     COALESCE(date_posted, created_at, now())
   )
 WHERE last_seen_at IS NULL;

-- Going forward, default new rows to now() at insertion. Trigger below
-- syncs it to created_at if the row supplies an explicit created_at.
ALTER TABLE marketing_jobs
  ALTER COLUMN last_seen_at SET DEFAULT now();

-- Index it: recency-driven sort hits this column on every page load.
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_last_seen_at
  ON marketing_jobs (last_seen_at DESC NULLS LAST);

-- Retarget the priority computation: recency now keys off last_seen_at.
CREATE OR REPLACE FUNCTION marketing_jobs_set_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ct text;
  effective_seen timestamptz;
BEGIN
  -- Default last_seen_at on insert: prefer caller-supplied value;
  -- otherwise pin to created_at; otherwise now().
  IF TG_OP = 'INSERT' AND NEW.last_seen_at IS NULL THEN
    NEW.last_seen_at := COALESCE(NEW.created_at, now());
  END IF;

  effective_seen := COALESCE(NEW.last_seen_at, NEW.created_at);

  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  NEW.priority_score := marketing_job_priority_score(effective_seen, NEW.job_title, ct);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_jobs_priority_score ON marketing_jobs;
CREATE TRIGGER trg_marketing_jobs_priority_score
  BEFORE INSERT OR UPDATE OF last_seen_at, created_at, job_title, company_id ON marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION marketing_jobs_set_priority_score();

-- Same retarget for the bulk recompute RPC.
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
     SET priority_score = marketing_job_priority_score(
           COALESCE(j.last_seen_at, j.created_at),
           j.job_title,
           c.company_type
         )
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  UPDATE marketing_jobs
     SET priority_score = marketing_job_priority_score(
           COALESCE(last_seen_at, created_at),
           job_title,
           NULL
         )
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

-- And the company-type propagation trigger.
CREATE OR REPLACE FUNCTION marketing_companies_propagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_type IS DISTINCT FROM OLD.company_type THEN
    UPDATE marketing_jobs
       SET priority_score = marketing_job_priority_score(
             COALESCE(last_seen_at, created_at),
             job_title,
             NEW.company_type
           )
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- Refresh all scores against the new last_seen_at backfill.
SELECT recompute_marketing_job_priorities();
