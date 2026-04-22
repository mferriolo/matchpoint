-- Add 15 additional PACE operators to the master list, covering the
-- largest national providers by enrollment plus several well-known
-- regional programs. Idempotent — safe to re-run.
--
-- Notable hybrids:
--   - AltaMed Health Services — the largest FQHC in the US and a major
--     PACE operator; classified as PACE Centers + Providers + Government
--     / Safety Net (mirrors the pattern used for Cityblock, CINQCARE).
--   - Providence ElderPlace — kept as a standalone record so the main
--     Providence health-system listing (under Providers) stays clean;
--     ElderPlace is specifically the PACE arm.

INSERT INTO tracker_priority_companies (name, is_selected, categories) VALUES
  -- Largest PACE operators by enrollment
  ('WelbeHealth', true, ARRAY['PACE Centers']),
  ('CenterLight Healthcare', true, ARRAY['PACE Centers']),
  ('AltaMed Health Services', true, ARRAY[
    'PACE Centers','Providers','Government / Safety Net / Community Health'
  ]),
  ('On Lok', true, ARRAY['PACE Centers']),
  ('Mercy LIFE', true, ARRAY['PACE Centers']),
  ('Providence ElderPlace', true, ARRAY['PACE Centers']),
  ('SeniorLIFE', true, ARRAY['PACE Centers']),

  -- Well-known regional PACE programs
  ('ArchCare Senior Life', true, ARRAY['PACE Centers']),
  ('LIFE Pittsburgh', true, ARRAY['PACE Centers']),
  ('Summit ElderCare', true, ARRAY['PACE Centers']),
  ('Bienvivir Senior Health Services', true, ARRAY['PACE Centers']),
  ('PACE CNY', true, ARRAY['PACE Centers']),
  ('PACE Southeast Michigan', true, ARRAY['PACE Centers']),
  ('Cherokee Elder Care', true, ARRAY['PACE Centers']),
  ('Eskaton PACE', true, ARRAY['PACE Centers'])
ON CONFLICT (name) DO UPDATE SET
  categories = EXCLUDED.categories;
