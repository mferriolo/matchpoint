-- Snooze a contact until a future date so they drop out of the default
-- recruiter view. Pairs with the existing outreach_status / last_outreach_at
-- workflow: "Cold last week, snooze 3 days, surface again Wednesday".
--
-- NULL  = not snoozed (default).
-- Past  = snooze expired; treated as not snoozed by the UI's default filter.
-- Future = hidden from the default Contacts view; still searchable when the
--          "Show snoozed" toggle is on.

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

-- Default Contacts view filters where snoozed_until IS NULL OR snoozed_until <= now()
-- → range scan with NULLs first keeps "never snoozed" cheap.
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_snoozed_until
  ON marketing_contacts (snoozed_until NULLS FIRST);
