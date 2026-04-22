-- Replace the single-value tracker_priority_companies.category column with
-- a multi-value categories text[] array so hybrid companies (e.g. Kaiser
-- Permanente: Payor + Provider, CVS Health: Payor + Pharmacy, Firefly
-- Health: Provider + VBC + Health IT) can appear under every bucket they
-- belong to without duplicating the row.
--
-- One row per company remains the source of truth — toggling is_selected
-- under any category naturally updates every rendering of that company
-- because the UI groups by array element but mutates one shared row.
--
-- This migration also re-maps the 10-category v142 scheme to the new
-- 11-category canonical list:
--   Payors
--   Providers
--   Value-Based Care / Risk-Bearing Organizations
--   Post-Acute / Home-Based Care
--   PACE Centers
--   Behavioral Health
--   Pharmacy / PBM
--   Health IT / Digital Health
--   Diagnostics / Devices / Life Sciences
--   Healthcare Services / Outsourcing
--   Government / Safety Net / Community Health

ALTER TABLE tracker_priority_companies
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

DROP INDEX IF EXISTS idx_tracker_priority_companies_category;

CREATE INDEX IF NOT EXISTS idx_tracker_priority_companies_categories
  ON tracker_priority_companies USING GIN (categories);

-- ---------------------------------------------------------------
-- Canonical mapping per the user's 11-category list. Each UPDATE
-- sets an exact array so re-running the migration is idempotent.
-- ---------------------------------------------------------------

-- Payors
UPDATE tracker_priority_companies SET categories = ARRAY['Payors'] WHERE name IN (
  'Aetna','Bright Health','Centene','Cigna','Elevance Health','Humana',
  'Molina Healthcare','Oscar Health','Point32Health','SCAN Health Plan',
  'UnitedHealth Group',
  -- v142 payors not explicitly in the user's new list — classified as Payors
  'Anthem Blue Cross Blue Shield','Blue Cross Blue Shield Association',
  'Health Care Service Corporation (HCSC)','Highmark Health','Florida Blue',
  'Independence Blue Cross','EmblemHealth','CareSource','Wellpoint',
  'Priority Health'
);

-- Payors + Pharmacy / PBM (hybrid)
UPDATE tracker_priority_companies SET categories = ARRAY['Payors','Pharmacy / PBM']
  WHERE name = 'CVS Health';

-- Payors + VBC (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Payors','Value-Based Care / Risk-Bearing Organizations']
  WHERE name IN ('Alignment Healthcare','Clover Health','Devoted Health');

-- Payors + Providers (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Payors','Providers']
  WHERE name = 'Kaiser Permanente';

-- Providers (single-category)
UPDATE tracker_priority_companies SET categories = ARRAY['Providers'] WHERE name IN (
  'AdventHealth Orlando','Advocate Aurora Health','Ascension','Atrium Health',
  'Baylor Scott & White Medical Center','Children''s Hospital of Philadelphia',
  'CommonSpirit Health','Crossover Health','Diana Health','Duke Regional Hospital',
  'Everside Health','HCA Healthcare','Intermountain Health','Marathon Health',
  'Mayo Clinic Hospital - Arizona','Providence','Rush University System for Health',
  'Stanford Hospital','Tenet Healthcare','Tisch Hospital (NYU Langone)',
  'Trinity Health','Vera Whole Health',
  -- v142 hospitals not explicitly in the user's new list — classified as Providers
  'Cleveland Clinic','Mass General Brigham','Johns Hopkins Medicine',
  'NYU Langone Health','Mount Sinai Health System','UPMC','Northwell Health',
  'Sutter Health','Banner Health','Dignity Health','Baylor College of Medicine',
  'Jefferson Health','Corewell Health','NewYork-Presbyterian'
);

-- Providers + VBC (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']
  WHERE name IN (
    'Cano Health','CareMax','ChenMed','Geisinger','Iora Health',
    'Oak Street Health','VillageMD'
  );

-- Providers + Post-Acute (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Providers','Post-Acute / Home-Based Care']
  WHERE name = 'Bloom Healthcare';

-- Providers + VBC + Health IT (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Providers',
    'Value-Based Care / Risk-Bearing Organizations',
    'Health IT / Digital Health'
  ]
  WHERE name = 'Firefly Health';

-- Value-Based Care / Risk-Bearing Organizations (single-category)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Value-Based Care / Risk-Bearing Organizations']
  WHERE name IN (
    'Agilon Health','Aledade','Curana Health','Evergreen Nephrology',
    'Hopscotch Health','Main Street Health','Monogram Health',
    'Oncology Care Partners','P3 Health Partners','Pearl Health',
    'Somatus','Strive Health','Vytalize Health','Wellvana',
    -- Not explicitly in user's new list — kept as VBC catch-all
    'Thyme Care'
  );

-- VBC + Healthcare Services (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Value-Based Care / Risk-Bearing Organizations',
    'Healthcare Services / Outsourcing'
  ]
  WHERE name IN ('Lumeris','Optum','Privia Health');

-- VBC + Government / Safety Net / Community Health (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Value-Based Care / Risk-Bearing Organizations',
    'Government / Safety Net / Community Health'
  ]
  WHERE name IN ('CINQCARE','Cityblock Health','Pair Team');

-- VBC + Post-Acute (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Value-Based Care / Risk-Bearing Organizations',
    'Post-Acute / Home-Based Care'
  ]
  WHERE name IN ('Landmark Health','Signify Health');

-- Post-Acute (single-category)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Post-Acute / Home-Based Care']
  WHERE name IN (
    'BrightSpring Health','CenterWell','Compassus','DispatchHealth',
    'Enhabit Home Health','HarmonyCares','myPlace Health'
  );

-- Post-Acute + Health IT (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Post-Acute / Home-Based Care','Health IT / Digital Health']
  WHERE name = 'myLaurel';

-- PACE Centers (single-category)
UPDATE tracker_priority_companies
  SET categories = ARRAY['PACE Centers']
  WHERE name = 'InnovAge';

-- PACE + Government (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['PACE Centers','Government / Safety Net / Community Health']
  WHERE name IN ('Element Care','Trinity Health PACE');

-- Behavioral Health + Health IT (hybrid — MSK/digital therapeutics vendors)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Behavioral Health','Health IT / Digital Health']
  WHERE name IN ('Hinge Health','Maven Clinic','Sword Health','Twin Health');

-- Behavioral Health + Health IT + Diagnostics (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Behavioral Health',
    'Health IT / Digital Health',
    'Diagnostics / Devices / Life Sciences'
  ]
  WHERE name = 'AppliedVR';

-- Health IT + Diagnostics (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY[
    'Health IT / Digital Health',
    'Diagnostics / Devices / Life Sciences'
  ]
  WHERE name = 'Teal Health';

-- Health IT (single-category)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Health IT / Digital Health']
  WHERE name IN ('Epic Systems','Innovaccer');

-- Health IT + Healthcare Services (hybrid)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Health IT / Digital Health','Healthcare Services / Outsourcing']
  WHERE name = 'Cohere Health';

-- Healthcare Services (single-category)
UPDATE tracker_priority_companies
  SET categories = ARRAY['Healthcare Services / Outsourcing']
  WHERE name IN ('Carelon','Deloitte','Evolent Health','TMA PracticeEdge');

-- ---------------------------------------------------------------
-- Drop the old single-value column now that everything is on the
-- new categories array.
-- ---------------------------------------------------------------
ALTER TABLE tracker_priority_companies DROP COLUMN IF EXISTS category;
