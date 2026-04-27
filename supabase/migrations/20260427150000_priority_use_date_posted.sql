-- Switch priority recency to read date_posted instead of last_seen_at.
-- Some rows have a hand-corrected date_posted (matching what the source
-- site actually shows) that's different from when our scraper first
-- inserted the row, and the user wants the score to honor that value.
--
-- Fallback chain: date_posted → last_seen_at → created_at. The chain
-- exists so older rows without a populated date_posted don't bottom out
-- at NULL and lose their score.

CREATE OR REPLACE FUNCTION marketing_jobs_set_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ct text;
  effective_seen timestamptz;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.last_seen_at IS NULL THEN
    NEW.last_seen_at := COALESCE(NEW.created_at, now());
  END IF;

  effective_seen := COALESCE(NEW.date_posted, NEW.last_seen_at, NEW.created_at);

  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  NEW.priority_score := marketing_job_priority_score(effective_seen, NEW.job_title, ct);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_jobs_priority_score ON marketing_jobs;
CREATE TRIGGER trg_marketing_jobs_priority_score
  BEFORE INSERT OR UPDATE OF date_posted, last_seen_at, created_at, job_title, company_id ON marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION marketing_jobs_set_priority_score();

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
           COALESCE(j.date_posted, j.last_seen_at, j.created_at),
           j.job_title,
           c.company_type
         )
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  UPDATE marketing_jobs
     SET priority_score = marketing_job_priority_score(
           COALESCE(date_posted, last_seen_at, created_at),
           job_title,
           NULL
         )
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

CREATE OR REPLACE FUNCTION marketing_companies_propagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_type IS DISTINCT FROM OLD.company_type THEN
    UPDATE marketing_jobs
       SET priority_score = marketing_job_priority_score(
             COALESCE(date_posted, last_seen_at, created_at),
             job_title,
             NEW.company_type
           )
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

SELECT recompute_marketing_job_priorities();
