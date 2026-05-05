-- Contact-coverage bonus on marketing_jobs.priority_score.
--
-- Rationale: a company we already have a deep contact roster at is
-- worth more in the queue than one we have no foothold in — outreach
-- can move faster and we have warmer ground. Conversely, a company
-- with zero known contacts costs us extra discovery work, so its jobs
-- should rank a touch lower until we've staffed contacts in.
--
-- Tiers (bonus added to the base priority_score, score then clamped to
-- 0–100):
--    0 contacts                                   → -10
--    1–2 contacts                                 →   0  (neutral)
--    3+ contacts                                  →  +5
--    3+ contacts AND covers Exec + Clinical + HR  → +10  ("flush")
--
-- Categories (case-insensitive title match):
--    Executive : CEO / COO / CMO / CFO / President / Founder /
--                Operating Partner / VP Operations
--    Clinical  : Medical Director / VP Clinical / Chief Clinical /
--                Chief of Medicine
--    HR/Talent : Talent Acquisition / Head of TA / HR / Human Resources
--                / Recruiter / Recruiting Manager
--
-- The bonus is computed by marketing_company_contact_bonus(uuid) and
-- added to the existing per-job score in the trigger / recompute paths.
-- A new trigger on marketing_contacts re-scores every job at the
-- affected company on insert/update/delete, so the bonus stays current.

-- ============================================================
-- 1. The bonus function
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_company_contact_bonus(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  total_count    int  := 0;
  has_executive  bool := false;
  has_clinical   bool := false;
  has_hr_talent  bool := false;
BEGIN
  IF p_company_id IS NULL THEN RETURN 0; END IF;

  SELECT
    count(*) FILTER (WHERE id IS NOT NULL),
    bool_or(
      lower(coalesce(title, '')) ~
        '\m(ceo|coo|cmo|cfo|president|founder|operating partner|chief medical officer|chief operating|chief executive|chief financial)\M'
      OR lower(coalesce(title, '')) ~ 'vp .*operations'
    ),
    bool_or(
      lower(coalesce(title, '')) LIKE '%medical director%'
      OR lower(coalesce(title, '')) ~ 'vp .*clinical'
      OR lower(coalesce(title, '')) LIKE '%chief clinical%'
      OR lower(coalesce(title, '')) LIKE '%chief of medicine%'
    ),
    bool_or(
      lower(coalesce(title, '')) LIKE '%talent acquisition%'
      OR lower(coalesce(title, '')) ~ 'head of ta\M'
      OR lower(coalesce(title, '')) ~ '\mhr\M'
      OR lower(coalesce(title, '')) LIKE '%human resources%'
      OR lower(coalesce(title, '')) LIKE '%recruiter%'
      OR lower(coalesce(title, '')) LIKE '%recruiting manager%'
    )
  INTO total_count, has_executive, has_clinical, has_hr_talent
  FROM marketing_contacts
  WHERE company_id = p_company_id;

  IF total_count = 0 THEN RETURN -10; END IF;
  IF total_count <= 2 THEN RETURN 0;  END IF;
  IF has_executive AND has_clinical AND has_hr_talent THEN RETURN 10; END IF;
  RETURN 5;
END;
$$;

-- ============================================================
-- 2. Trigger fn re-applied so it adds the bonus and clamps to 0–100
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_jobs_set_priority_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ct text;
  base numeric;
  bonus numeric;
BEGIN
  SELECT company_type INTO ct
    FROM marketing_companies
   WHERE id = NEW.company_id;
  base  := marketing_job_priority_score(NEW.created_at, NEW.job_title, ct);
  bonus := marketing_company_contact_bonus(NEW.company_id);
  NEW.priority_score := least(100, greatest(0, base + bonus));
  RETURN NEW;
END;
$$;

-- (Trigger definition is unchanged; CREATE OR REPLACE on the function
-- swaps the body in place.)

-- ============================================================
-- 3. Company → jobs propagation: include the bonus
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
             marketing_job_priority_score(created_at, job_title, NEW.company_type) + bonus
           ))
     WHERE company_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Bulk recompute: same change
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
         ))
    FROM marketing_companies c
   WHERE j.company_id = c.id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Catch jobs without a company_id too (rare but possible). No bonus
  -- for orphans since there's nothing to score against.
  UPDATE marketing_jobs
     SET priority_score = marketing_job_priority_score(created_at, job_title, NULL)
   WHERE company_id IS NULL;

  RETURN jsonb_build_object('updated', updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_marketing_job_priorities()
  TO authenticated, service_role, anon;

-- ============================================================
-- 5. Re-score every job at a company when its contact roster changes
-- ============================================================
CREATE OR REPLACE FUNCTION marketing_contacts_repropagate_priority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_company_id uuid;
BEGIN
  -- INSERT / UPDATE: score the new company. If the contact moved
  -- companies, also re-score the old one. DELETE: score the old one.
  IF (TG_OP = 'INSERT') THEN
    affected_company_id := NEW.company_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      IF OLD.company_id IS NOT NULL THEN
        UPDATE marketing_jobs j
           SET priority_score = least(100, greatest(0,
                 marketing_job_priority_score(j.created_at, j.job_title, c.company_type)
                 + marketing_company_contact_bonus(j.company_id)
               ))
          FROM marketing_companies c
         WHERE j.company_id = c.id AND j.company_id = OLD.company_id;
      END IF;
    ELSIF NEW.title IS NOT DISTINCT FROM OLD.title THEN
      RETURN NULL;  -- nothing relevant to the bonus changed
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
           ))
      FROM marketing_companies c
     WHERE j.company_id = c.id AND j.company_id = affected_company_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_contacts_repropagate_priority ON marketing_contacts;
CREATE TRIGGER trg_marketing_contacts_repropagate_priority
  AFTER INSERT OR UPDATE OF company_id, title OR DELETE ON marketing_contacts
  FOR EACH ROW
  EXECUTE FUNCTION marketing_contacts_repropagate_priority();

-- ============================================================
-- 6. One-time backfill so the bonus shows up immediately
-- ============================================================
SELECT recompute_marketing_job_priorities();
