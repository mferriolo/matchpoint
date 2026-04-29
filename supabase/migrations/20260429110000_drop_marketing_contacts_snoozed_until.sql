-- Snooze feature reverted — column and index unused.
DROP INDEX IF EXISTS idx_marketing_contacts_snoozed_until;
ALTER TABLE marketing_contacts DROP COLUMN IF EXISTS snoozed_until;
