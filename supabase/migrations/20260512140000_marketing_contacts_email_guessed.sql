-- Add email_guessed flag to marketing_contacts.
--
-- The "Guess Emails" bulk action on the Contacts tab infers the
-- email format used at each company (e.g. firstname.lastname@,
-- finitlastname@) from the company's contacts that DO have an
-- email on file, then fills in blanks for selected contacts at
-- that company. Those filled-in addresses are heuristic guesses
-- — they need to be marked so the user can:
--   1. Filter / sort to review them.
--   2. See them rendered with a different style (italicized) in
--      the contacts table so a quick scan distinguishes verified
--      from guessed addresses.
--   3. Clear or correct them later without confusing them with
--      a real, scraped/enriched email.
--
-- Default false so existing rows are unambiguous (we have no
-- way to retroactively know which historical emails were guessed
-- vs. enriched; treat all of them as not-guessed).

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS email_guessed boolean NOT NULL DEFAULT false;

-- Partial index — only rows where the flag is true. Lets the
-- contacts-tab filter ("show only guessed emails") be fast even
-- when guessed emails are a small fraction of the table.
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_email_guessed
  ON marketing_contacts (id)
  WHERE email_guessed = true;
