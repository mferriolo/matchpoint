-- Add category column to tracker_priority_companies, backfill all
-- previously-seeded rows with their category, and insert a second batch
-- of hospital systems and payors so those two categories are fleshed
-- out. The UI groups the picker by category using this column.

ALTER TABLE tracker_priority_companies
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Other VBC';

CREATE INDEX IF NOT EXISTS idx_tracker_priority_companies_category
  ON tracker_priority_companies (category);

-- ---------------------------------------------------------------
-- Backfill categories for the 94 already-seeded rows.
-- ---------------------------------------------------------------

UPDATE tracker_priority_companies SET category = 'VBC Primary Care Groups' WHERE name IN (
  'Agilon Health','Oak Street Health','ChenMed','Iora Health','Aledade',
  'Cano Health','Privia Health','Curana Health','VillageMD','Hopscotch Health',
  'CenterWell','CareMax','P3 Health Partners','Wellvana','Firefly Health'
);

UPDATE tracker_priority_companies SET category = 'VBC Specialty Care' WHERE name IN (
  'Strive Health','Monogram Health','Evergreen Nephrology','Somatus',
  'Thyme Care','Oncology Care Partners'
);

UPDATE tracker_priority_companies SET category = 'VBC Enablement / Tech' WHERE name IN (
  'Signify Health','Cohere Health','Pearl Health','Evolent Health','Lumeris',
  'Deloitte','Innovaccer','Epic Systems','TMA PracticeEdge','Vytalize Health'
);

UPDATE tracker_priority_companies SET category = 'Medicare Advantage / PACE' WHERE name IN (
  'Alignment Healthcare','Devoted Health','Clover Health','Bright Health',
  'SCAN Health Plan','Oscar Health','InnovAge','Trinity Health PACE',
  'myPlace Health','Element Care'
);

UPDATE tracker_priority_companies SET category = 'Home & Community Care' WHERE name IN (
  'HarmonyCares','Bloom Healthcare','Landmark Health','DispatchHealth',
  'BrightSpring Health','Enhabit Home Health','Compassus','myLaurel',
  'Main Street Health'
);

UPDATE tracker_priority_companies SET category = 'Payors' WHERE name IN (
  'Humana','CVS Health','Aetna','Elevance Health','Cigna','Molina Healthcare',
  'Centene','Point32Health','UnitedHealth Group','Carelon','Optum'
);

UPDATE tracker_priority_companies SET category = 'Health Systems & Hospitals' WHERE name IN (
  'CommonSpirit Health','HCA Healthcare','Ascension','Providence',
  'Trinity Health','Intermountain Health','Kaiser Permanente',
  'Advocate Aurora Health','Atrium Health','Geisinger','Tenet Healthcare',
  'Rush University System for Health','Mayo Clinic Hospital - Arizona',
  'Duke Regional Hospital','Tisch Hospital (NYU Langone)',
  'AdventHealth Orlando','Stanford Hospital','Baylor Scott & White Medical Center',
  'Children''s Hospital of Philadelphia'
);

UPDATE tracker_priority_companies SET category = 'Women''s & Family Health' WHERE name IN (
  'Maven Clinic','Diana Health','Teal Health'
);

UPDATE tracker_priority_companies SET category = 'Digital Therapeutics / MSK' WHERE name IN (
  'Hinge Health','Sword Health','AppliedVR','Twin Health'
);

UPDATE tracker_priority_companies SET category = 'Other VBC' WHERE name IN (
  'Cityblock Health','CINQCARE','Pair Team','Vera Whole Health',
  'Everside Health','Marathon Health','Crossover Health'
);

-- ---------------------------------------------------------------
-- New hospital systems and payors.
-- ---------------------------------------------------------------

INSERT INTO tracker_priority_companies (name, is_selected, category) VALUES
  ('Cleveland Clinic', true, 'Health Systems & Hospitals'),
  ('Mass General Brigham', true, 'Health Systems & Hospitals'),
  ('Johns Hopkins Medicine', true, 'Health Systems & Hospitals'),
  ('NYU Langone Health', true, 'Health Systems & Hospitals'),
  ('Mount Sinai Health System', true, 'Health Systems & Hospitals'),
  ('UPMC', true, 'Health Systems & Hospitals'),
  ('Northwell Health', true, 'Health Systems & Hospitals'),
  ('Sutter Health', true, 'Health Systems & Hospitals'),
  ('Banner Health', true, 'Health Systems & Hospitals'),
  ('Dignity Health', true, 'Health Systems & Hospitals'),
  ('Baylor College of Medicine', true, 'Health Systems & Hospitals'),
  ('Jefferson Health', true, 'Health Systems & Hospitals'),
  ('Corewell Health', true, 'Health Systems & Hospitals'),
  ('NewYork-Presbyterian', true, 'Health Systems & Hospitals'),
  ('Anthem Blue Cross Blue Shield', true, 'Payors'),
  ('Blue Cross Blue Shield Association', true, 'Payors'),
  ('Health Care Service Corporation (HCSC)', true, 'Payors'),
  ('Highmark Health', true, 'Payors'),
  ('Florida Blue', true, 'Payors'),
  ('Independence Blue Cross', true, 'Payors'),
  ('EmblemHealth', true, 'Payors'),
  ('CareSource', true, 'Payors'),
  ('Wellpoint', true, 'Payors'),
  ('Priority Health', true, 'Payors')
ON CONFLICT (name) DO NOTHING;
