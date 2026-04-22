-- Add a second batch of priority companies to tracker_priority_companies.
-- Sourced from a user-curated list of top-ranked VBC hospitals/systems,
-- VBC enablement vendors, large ACOs, and notable VBC startups. Names
-- already present in the initial seed (Aledade, UnitedHealth Group,
-- Optum, Humana, Privia Health, Agilon Health, Main Street Health,
-- Strive Health, Crossover Health, Geisinger) are omitted here — the
-- UNIQUE(name) constraint would reject them regardless.

INSERT INTO tracker_priority_companies (name, is_selected) VALUES
  ('Mayo Clinic Hospital - Arizona', true),
  ('Duke Regional Hospital', true),
  ('Tisch Hospital (NYU Langone)', true),
  ('AdventHealth Orlando', true),
  ('Stanford Hospital', true),
  ('Baylor Scott & White Medical Center', true),
  ('Deloitte', true),
  ('Innovaccer', true),
  ('Epic Systems', true),
  ('TMA PracticeEdge', true),
  ('Children''s Hospital of Philadelphia', true)
ON CONFLICT (name) DO NOTHING;
