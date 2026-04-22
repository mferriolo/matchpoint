-- Idempotent upsert that guarantees every company in the user's
-- canonical 11-category list is present in tracker_priority_companies
-- with the correct categories array. Safe to re-run at any time.
--
-- Existing rows get their categories corrected; missing rows are
-- inserted with is_selected=true. is_selected is NOT overwritten on
-- existing rows so prior deselections stick.

INSERT INTO tracker_priority_companies (name, is_selected, categories) VALUES
  -- Payors (single)
  ('Aetna', true, ARRAY['Payors']),
  ('Bright Health', true, ARRAY['Payors']),
  ('Centene', true, ARRAY['Payors']),
  ('Cigna', true, ARRAY['Payors']),
  ('Elevance Health', true, ARRAY['Payors']),
  ('Humana', true, ARRAY['Payors']),
  ('Molina Healthcare', true, ARRAY['Payors']),
  ('Oscar Health', true, ARRAY['Payors']),
  ('Point32Health', true, ARRAY['Payors']),
  ('SCAN Health Plan', true, ARRAY['Payors']),
  ('UnitedHealth Group', true, ARRAY['Payors']),

  -- Payors + Pharmacy / PBM
  ('CVS Health', true, ARRAY['Payors','Pharmacy / PBM']),

  -- Payors + VBC
  ('Alignment Healthcare', true, ARRAY['Payors','Value-Based Care / Risk-Bearing Organizations']),
  ('Clover Health', true, ARRAY['Payors','Value-Based Care / Risk-Bearing Organizations']),
  ('Devoted Health', true, ARRAY['Payors','Value-Based Care / Risk-Bearing Organizations']),

  -- Payors + Providers
  ('Kaiser Permanente', true, ARRAY['Payors','Providers']),

  -- Providers (single)
  ('AdventHealth Orlando', true, ARRAY['Providers']),
  ('Advocate Aurora Health', true, ARRAY['Providers']),
  ('Ascension', true, ARRAY['Providers']),
  ('Atrium Health', true, ARRAY['Providers']),
  ('Baylor Scott & White Medical Center', true, ARRAY['Providers']),
  ('Children''s Hospital of Philadelphia', true, ARRAY['Providers']),
  ('CommonSpirit Health', true, ARRAY['Providers']),
  ('Crossover Health', true, ARRAY['Providers']),
  ('Diana Health', true, ARRAY['Providers']),
  ('Duke Regional Hospital', true, ARRAY['Providers']),
  ('Everside Health', true, ARRAY['Providers']),
  ('HCA Healthcare', true, ARRAY['Providers']),
  ('Intermountain Health', true, ARRAY['Providers']),
  ('Marathon Health', true, ARRAY['Providers']),
  ('Mayo Clinic Hospital - Arizona', true, ARRAY['Providers']),
  ('Providence', true, ARRAY['Providers']),
  ('Rush University System for Health', true, ARRAY['Providers']),
  ('Stanford Hospital', true, ARRAY['Providers']),
  ('Tenet Healthcare', true, ARRAY['Providers']),
  ('Tisch Hospital (NYU Langone)', true, ARRAY['Providers']),
  ('Trinity Health', true, ARRAY['Providers']),
  ('Vera Whole Health', true, ARRAY['Providers']),

  -- Providers + VBC
  ('Cano Health', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('CareMax', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('ChenMed', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('Geisinger', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('Iora Health', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('Oak Street Health', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),
  ('VillageMD', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations']),

  -- Providers + Post-Acute
  ('Bloom Healthcare', true, ARRAY['Providers','Post-Acute / Home-Based Care']),

  -- Providers + VBC + Health IT
  ('Firefly Health', true, ARRAY['Providers','Value-Based Care / Risk-Bearing Organizations','Health IT / Digital Health']),

  -- VBC (single)
  ('Agilon Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Aledade', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Curana Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Evergreen Nephrology', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Hopscotch Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Main Street Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Monogram Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Oncology Care Partners', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('P3 Health Partners', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Pearl Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Somatus', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Strive Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Thyme Care', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Vytalize Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),
  ('Wellvana', true, ARRAY['Value-Based Care / Risk-Bearing Organizations']),

  -- VBC + Healthcare Services
  ('Lumeris', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Healthcare Services / Outsourcing']),
  ('Optum', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Healthcare Services / Outsourcing']),
  ('Privia Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Healthcare Services / Outsourcing']),

  -- VBC + Government
  ('CINQCARE', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Government / Safety Net / Community Health']),
  ('Cityblock Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Government / Safety Net / Community Health']),
  ('Pair Team', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Government / Safety Net / Community Health']),

  -- VBC + Post-Acute
  ('Landmark Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Post-Acute / Home-Based Care']),
  ('Signify Health', true, ARRAY['Value-Based Care / Risk-Bearing Organizations','Post-Acute / Home-Based Care']),

  -- Post-Acute (single)
  ('BrightSpring Health', true, ARRAY['Post-Acute / Home-Based Care']),
  ('CenterWell', true, ARRAY['Post-Acute / Home-Based Care']),
  ('Compassus', true, ARRAY['Post-Acute / Home-Based Care']),
  ('DispatchHealth', true, ARRAY['Post-Acute / Home-Based Care']),
  ('Enhabit Home Health', true, ARRAY['Post-Acute / Home-Based Care']),
  ('HarmonyCares', true, ARRAY['Post-Acute / Home-Based Care']),
  ('myPlace Health', true, ARRAY['Post-Acute / Home-Based Care']),

  -- Post-Acute + Health IT
  ('myLaurel', true, ARRAY['Post-Acute / Home-Based Care','Health IT / Digital Health']),

  -- PACE Centers (single)
  ('InnovAge', true, ARRAY['PACE Centers']),

  -- PACE + Government
  ('Element Care', true, ARRAY['PACE Centers','Government / Safety Net / Community Health']),
  ('Trinity Health PACE', true, ARRAY['PACE Centers','Government / Safety Net / Community Health']),

  -- Behavioral Health + Health IT
  ('Hinge Health', true, ARRAY['Behavioral Health','Health IT / Digital Health']),
  ('Maven Clinic', true, ARRAY['Behavioral Health','Health IT / Digital Health']),
  ('Sword Health', true, ARRAY['Behavioral Health','Health IT / Digital Health']),
  ('Twin Health', true, ARRAY['Behavioral Health','Health IT / Digital Health']),

  -- Behavioral Health + Health IT + Diagnostics
  ('AppliedVR', true, ARRAY['Behavioral Health','Health IT / Digital Health','Diagnostics / Devices / Life Sciences']),

  -- Health IT + Diagnostics
  ('Teal Health', true, ARRAY['Health IT / Digital Health','Diagnostics / Devices / Life Sciences']),

  -- Health IT (single)
  ('Epic Systems', true, ARRAY['Health IT / Digital Health']),
  ('Innovaccer', true, ARRAY['Health IT / Digital Health']),

  -- Health IT + Healthcare Services
  ('Cohere Health', true, ARRAY['Health IT / Digital Health','Healthcare Services / Outsourcing']),

  -- Healthcare Services (single)
  ('Carelon', true, ARRAY['Healthcare Services / Outsourcing']),
  ('Deloitte', true, ARRAY['Healthcare Services / Outsourcing']),
  ('Evolent Health', true, ARRAY['Healthcare Services / Outsourcing']),
  ('TMA PracticeEdge', true, ARRAY['Healthcare Services / Outsourcing'])
ON CONFLICT (name) DO UPDATE SET
  categories = EXCLUDED.categories;
