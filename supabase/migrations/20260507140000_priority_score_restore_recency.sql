-- Restore priority-score recency to use date_posted/last_seen_at, not just created_at.
--
-- 20260427150000_priority_use_date_posted.sql changed the recency
-- argument to COALESCE(date_posted, last_seen_at, created_at) so that:
--   1. User-edited date_posted updates the score
--   2. The scraper's last_seen_at refresh keeps long-running listings fresh
--
-- The contact-coverage (20260505120000) and has-description (20260505130000)
-- migrations rewrote marketing_jobs_set_priority_score(),
-- marketing_companies_propagate_priority(), recompute_marketing_job_priorities(),
-- and marketing_contacts_repropagate_priority() — but silently passed
-- NEW.created_at / j.created_at instead of the COALESCE chain. The
-- has-description migration ALSO redefined the trigger column list,
-- dropping date_posted and last_seen_at, so the trigger no longer fires
-- when the scraper refreshes last_seen_at.
--
-- Net effect: a long-running listing decays to score ≈20 once it
-- crosses ~58 days from creation, no matter how many times the scraper
-- still observes it. This migration restores the original COALESCE
-- semantics in all four functions and puts date_posted + last_seen_at
-- back in the trigger column list.

-- ============================================================
-- Per-row trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_jobs_set_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ct text;
  base numeric;
  bonus numeric;
  desc_bonus numeric;
  effective_seen timestamptz;
BEGIN
  effective_seen := COALESCE(NEW.date_posted, NEW.last_seen_at, NEW.created_at);
  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  base       := marketing_job_priority_score(effective_seen, NEW.job_title, ct);
  bonus      := marketing_company_contact_bonus(NEW.company_id);
  desc_bonus := marketing_job_has_description_bonus(NEW.description);
  NEW.priority_score := least(100, greatest(0, base + bonus + desc_bonus));
  RETURN NEW;
END;
$$;

-- Re-register the trigger with the full recency column set so a
-- last_seen_at refresh from the scraper triggers a re-score.
DROP TRIGGER IF EXISTS trg_marketing_jobs_priority_score ON marketing_jobs;
CREATE TRIGGER trg_marketing_jobs_priority_score
  BEFORE INSERT OR UPDATE OF date_posted, last_seen_at, created_at, job_title, company_id, description ON marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION marketing_jobs_set_priority_score();

-- ============================================================
-- Company → jobs propagation
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_companies_propagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  bonus numeric;
BEGIN
  IF NEW.company_type IS DISTINCT FROM OLD.company_type THEN
    bonus := marketing_company_contact_bonus(NEW.id);
    UPDATE marketing_jobs
       SET priority_score = least(100, greatest(0,
             marketing_job_priority_score(COALESCE(date_posted, last_seen_at, created_at), job_title, NEW.company_type)
             + bonus
             + marketing_job_has_description_bonus(description)
           ))
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Bulk recompute
-- ============================================================
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
     SET priority_score = least(100, greatest(0,
           marketing_job_priority_score(COALESCE(j.date_posted, j.last_seen_at, j.created_at), j.job_title, c.company_type)
           + marketing_company_contact_bonus(j.company_id)
           + marketing_job_has_description_bonus(j.description)
         ))
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Catch jobs without a company_id too (rare but possible).
  UPDATE marketing_jobs
     SET priority_score = least(100, greatest(0,
           marketing_job_priority_score(COALESCE(date_posted, last_seen_at, created_at), job_title, NULL)
           + marketing_job_has_description_bonus(description)
         ))
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_marketing_job_priorities()
  TO authenticated, service_role, anon;

-- ============================================================
-- Contacts → jobs re-propagation
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_contacts_repropagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_company_id uuid;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    affected_company_id := NEW.company_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      IF OLD.company_id IS NOT NULL THEN
        UPDATE marketing_jobs j
           SET priority_score = least(100, greatest(0,
                 marketing_job_priority_score(COALESCE(j.date_posted, j.last_seen_at, j.created_at), j.job_title, c.company_type)
                 + marketing_company_contact_bonus(j.company_id)
                 + marketing_job_has_description_bonus(j.description)
               ))
          FROM marketing_companies c
         WHERE j.company_id = c.id AND j.company_id = OLD.company_id;
      END IF;
    ELSIF NEW.title IS NOT DISTINCT FROM OLD.title THEN
      RETURN NULL;
    END IF;
    affected_company_id := NEW.company_id;
  ELSE
    affected_company_id := OLD.company_id;
  END IF;

  IF affected_company_id IS NOT NULL THEN
    UPDATE marketing_jobs j
       SET priority_score = least(100, greatest(0,
             marketing_job_priority_score(COALESCE(j.date_posted, j.last_seen_at, j.created_at), j.job_title, c.company_type)
             + marketing_company_contact_bonus(j.company_id)
             + marketing_job_has_description_bonus(j.description)
           ))
      FROM marketing_companies c
     WHERE j.company_id = c.id AND j.company_id = affected_company_id;
  END IF;
  RETURN NULL;
END;
$$;
