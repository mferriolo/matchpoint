-- Small bump (+3) for jobs that already have a scraped description.
-- A row with a real description is more actionable: the script
-- generator has more to work with, the recruiter can tailor the pitch
-- without an extra fetch step, and the row has already passed at least
-- one verification (the scraper found and parsed the posting body).
--
-- Bonus stacks on top of the existing contact-coverage bonus and the
-- per-diem/locums/part-time/1099 penalty. Final score is clamped to
-- 0–100 in every code path that writes priority_score.

CREATE OR REPLACE FUNCTION marketing_job_has_description_bonus(p_description text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_description IS NULL                 THEN 0
    WHEN btrim(p_description) = ''             THEN 0
    -- Tiny snippets aren't really a description; require something
    -- substantive to count.
    WHEN length(btrim(p_description)) < 80     THEN 0
    ELSE 3
  END;
$$;

-- ============================================================
-- Per-row trigger: include the description bonus
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
BEGIN
  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  base       := marketing_job_priority_score(NEW.created_at, NEW.job_title, ct);
  bonus      := marketing_company_contact_bonus(NEW.company_id);
  desc_bonus := marketing_job_has_description_bonus(NEW.description);
  NEW.priority_score := least(100, greatest(0, base + bonus + desc_bonus));
  RETURN NEW;
END;
$$;

-- ============================================================
-- Company → jobs propagation: include the description bonus per row
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
             marketing_job_priority_score(created_at, job_title, NEW.company_type)
             + bonus
             + marketing_job_has_description_bonus(description)
           ))
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Bulk recompute: include the description bonus
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
           marketing_job_priority_score(j.created_at, j.job_title, c.company_type)
           + marketing_company_contact_bonus(j.company_id)
           + marketing_job_has_description_bonus(j.description)
         ))
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Catch jobs without a company_id too (rare but possible).
  UPDATE marketing_jobs
     SET priority_score = least(100, greatest(0,
           marketing_job_priority_score(created_at, job_title, NULL)
           + marketing_job_has_description_bonus(description)
         ))
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_marketing_job_priorities()
  TO authenticated, service_role, anon;

-- ============================================================
-- Contacts trigger: include the description bonus when re-scoring
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
                 marketing_job_priority_score(j.created_at, j.job_title, c.company_type)
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
             marketing_job_priority_score(j.created_at, j.job_title, c.company_type)
             + marketing_company_contact_bonus(j.company_id)
             + marketing_job_has_description_bonus(j.description)
           ))
      FROM marketing_companies c
     WHERE j.company_id = c.id AND j.company_id = affected_company_id;
  END IF;
  RETURN NULL;
END;
$$;

-- The per-row trigger (trg_marketing_jobs_priority_score) only fires on
-- INSERT or UPDATE OF (created_at, job_title, company_id) today — it
-- doesn't include `description`. Extend it so that scraping a
-- description in (which is just an UPDATE of that column) re-scores
-- the row immediately instead of waiting for the next page-load
-- recompute.
DROP TRIGGER IF EXISTS trg_marketing_jobs_priority_score ON marketing_jobs;
CREATE TRIGGER trg_marketing_jobs_priority_score
  BEFORE INSERT OR UPDATE OF created_at, job_title, company_id, description ON marketing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION marketing_jobs_set_priority_score();

-- ============================================================
-- One-time recompute so the bonus shows up immediately
-- ============================================================
SELECT recompute_marketing_job_priorities();
