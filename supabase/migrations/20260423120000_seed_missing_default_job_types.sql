-- The frontend's DEFAULT_TRACKER_ROLES constant references five role
-- names that the "Reset to defaults" button in TrackerControls tries to
-- restore. Three of those names weren't present in the job_types table,
-- so the reset filter silently dropped them, leaving only 2 of 5
-- selected. Seed the missing names so reset-to-defaults actually works.

INSERT INTO job_types (name, is_active) VALUES
  ('Primary Care Physician', true),
  ('Nurse Practitioner', true),
  ('Physician Assistant', true)
ON CONFLICT (name) DO NOTHING;
