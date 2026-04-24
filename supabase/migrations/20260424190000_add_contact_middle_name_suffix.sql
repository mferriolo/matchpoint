-- Adds middle_name (supports full middle name or just an initial,
-- e.g. "A." or "Anne") and suffix (post-nominal credentials like
-- "MD", "MBA", "DO, MPH") to marketing_contacts.
--
-- Both are optional free text. Idempotent ADD COLUMN IF NOT EXISTS so
-- the migration is safe to re-run.

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS suffix text;
