-- Absorb the 24 companies seeded in v142 but not covered by the user's
-- canonical 94-company list into the master list. All 14 hospital
-- systems go to Providers; all 10 BCBS-family / regional payors go to
-- Payors. Idempotent — safe to re-run.

INSERT INTO tracker_priority_companies (name, is_selected, categories) VALUES
  -- Hospital systems → Providers
  ('Cleveland Clinic', true, ARRAY['Providers']),
  ('Mass General Brigham', true, ARRAY['Providers']),
  ('Johns Hopkins Medicine', true, ARRAY['Providers']),
  ('NYU Langone Health', true, ARRAY['Providers']),
  ('Mount Sinai Health System', true, ARRAY['Providers']),
  ('UPMC', true, ARRAY['Providers']),
  ('Northwell Health', true, ARRAY['Providers']),
  ('Sutter Health', true, ARRAY['Providers']),
  ('Banner Health', true, ARRAY['Providers']),
  ('Dignity Health', true, ARRAY['Providers']),
  ('Baylor College of Medicine', true, ARRAY['Providers']),
  ('Jefferson Health', true, ARRAY['Providers']),
  ('Corewell Health', true, ARRAY['Providers']),
  ('NewYork-Presbyterian', true, ARRAY['Providers']),

  -- BCBS-family / regional payors → Payors
  ('Anthem Blue Cross Blue Shield', true, ARRAY['Payors']),
  ('Blue Cross Blue Shield Association', true, ARRAY['Payors']),
  ('Health Care Service Corporation (HCSC)', true, ARRAY['Payors']),
  ('Highmark Health', true, ARRAY['Payors']),
  ('Florida Blue', true, ARRAY['Payors']),
  ('Independence Blue Cross', true, ARRAY['Payors']),
  ('EmblemHealth', true, ARRAY['Payors']),
  ('CareSource', true, ARRAY['Payors']),
  ('Wellpoint', true, ARRAY['Payors']),
  ('Priority Health', true, ARRAY['Payors'])
ON CONFLICT (name) DO UPDATE SET
  categories = EXCLUDED.categories;
