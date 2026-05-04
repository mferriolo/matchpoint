-- Add ACO (Accountable Care Organization) as a recognized company type.
-- ACOs are value-based-care entities, so they slot just below VBC (100)
-- and above PACE (90) in the category-score ladder. Match patterns
-- (case-insensitive):
--   %accountable care%     — "Accountable Care Organization", "ACO Network"
--   \maco\M                — standalone token "ACO"

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
  IF c LIKE '%accountable care%' OR c ~ '\maco\M'  THEN RETURN 95;  END IF;
  IF c LIKE '%pace%'                                  THEN RETURN 90;  END IF;
  IF c LIKE '%fqhc%'                                  THEN RETURN 80;  END IF;
  IF c LIKE '%health plan%'                           THEN RETURN 70;  END IF;
  IF c LIKE '%all other%' OR c = 'other'              THEN RETURN 60;  END IF;
  IF c LIKE '%health system%'                         THEN RETURN 40;  END IF;
  IF c LIKE '%hospital%'                              THEN RETURN 20;  END IF;
  RETURN 60;
END;
$$;

-- Refresh every job's score so existing ACO companies get re-ranked.
SELECT recompute_marketing_job_priorities();

-- Seed ACO into the admin Search Settings list (skip if already present)
-- so the scraper's company-type selector picks it up. is_selected defaults
-- to true to match the original seed behavior.
INSERT INTO marketing_search_settings (setting_type, setting_value, is_selected, display_order)
SELECT 'company_type', 'ACO', true,
       COALESCE((SELECT MAX(display_order) + 1
                   FROM marketing_search_settings
                  WHERE setting_type = 'company_type'), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_search_settings
   WHERE setting_type = 'company_type' AND setting_value = 'ACO'
);
