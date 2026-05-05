-- Extend admin_users so it can serve as the source of truth for the
-- outreach sender identity (name + title + company). The Settings tab
-- still has fallback keys, but the Users tab is now the primary place
-- to edit a user's signature so it shows up correctly in generated
-- messages.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS title      text,
  ADD COLUMN IF NOT EXISTS company    text;

-- Best-effort backfill: split the existing single-string `name` on the
-- first whitespace into first_name / last_name where they're empty.
UPDATE admin_users
   SET first_name = split_part(name, ' ', 1),
       last_name  = NULLIF(btrim(substring(name FROM position(' ' IN name)+1)), '')
 WHERE name IS NOT NULL
   AND coalesce(first_name, '') = ''
   AND coalesce(last_name, '')  = '';

-- Seed Matthew's identity (creates the row if it doesn't exist, fills
-- title/company without clobbering anything the user has already
-- edited). We don't know which auth email belongs to Matthew so the
-- INSERT path uses a placeholder; if a row with that email exists we
-- only fill missing fields.
INSERT INTO admin_users (email, name, first_name, last_name, title, company, role, status)
VALUES ('matt@medcentric.net', 'Matthew Ferriolo', 'Matthew', 'Ferriolo', 'Managing Partner', 'MedCentric', 'admin', 'active')
ON CONFLICT (email) DO UPDATE
   SET first_name = COALESCE(NULLIF(admin_users.first_name, ''), EXCLUDED.first_name),
       last_name  = COALESCE(NULLIF(admin_users.last_name,  ''), EXCLUDED.last_name),
       title      = COALESCE(NULLIF(admin_users.title,      ''), EXCLUDED.title),
       company    = COALESCE(NULLIF(admin_users.company,    ''), EXCLUDED.company);
