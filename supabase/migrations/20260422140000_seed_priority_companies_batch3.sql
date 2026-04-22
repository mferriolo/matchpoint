-- Third batch of priority companies for tracker_priority_companies.
-- Sourced from a user-curated list of VBC specialty-care, women's/family
-- health, MSK/pain, VBC enablement, and niche AI players. Names already
-- seeded in earlier migrations (Innovaccer, Signify Health, Pearl Health,
-- Cityblock Health, Main Street Health) are omitted here — ON CONFLICT
-- would skip them anyway.

INSERT INTO tracker_priority_companies (name, is_selected) VALUES
  ('Monogram Health', true),
  ('Evergreen Nephrology', true),
  ('Somatus', true),
  ('Thyme Care', true),
  ('Oncology Care Partners', true),
  ('Maven Clinic', true),
  ('Diana Health', true),
  ('Teal Health', true),
  ('Hinge Health', true),
  ('Sword Health', true),
  ('AppliedVR', true),
  ('Vytalize Health', true),
  ('Twin Health', true),
  ('myLaurel', true)
ON CONFLICT (name) DO NOTHING;
