-- marketing_contacts needs a dedicated linkedin_url column so the
-- Contacts-tab UI and the enrich-contacts function can read/write
-- LinkedIn profile URLs without abusing source_url. Legacy contacts
-- that stored LinkedIn links in source_url are left untouched; the UI
-- still falls back to source_url when linkedin_url is null.

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS linkedin_url text;
