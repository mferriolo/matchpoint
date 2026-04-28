-- Structured outreach tracking on marketing_contacts. Notes are still
-- there for free-form context, but recruiters need filterable signals
-- so the Contacts tab can answer "who haven't I touched in 14 days"
-- and "who has replied" without grepping the notes column.
--
--   last_outreach_at  — when the recruiter last reached out. Updated
--                       by the UI quick-actions; NULL = never contacted.
--   outreach_status   — what happened on/after that touch:
--                         'Cold'    — sent, no reply yet
--                         'Replied' — they responded
--                         'Booked'  — meeting on calendar
--                         'Dead'    — explicit no / unresponsive
--                       NULL = never contacted (default).
--
-- Both fields are nullable and idempotent. No backfill — existing rows
-- start as "never contacted" which is the correct semantics.

ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS last_outreach_at timestamptz,
  ADD COLUMN IF NOT EXISTS outreach_status text;

-- Constrain status values so a typo can't sneak in via a manual UPDATE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'marketing_contacts_outreach_status_check'
  ) THEN
    ALTER TABLE marketing_contacts
      ADD CONSTRAINT marketing_contacts_outreach_status_check
      CHECK (outreach_status IS NULL OR outreach_status IN ('Cold', 'Replied', 'Booked', 'Dead'));
  END IF;
END$$;

-- Common filter is "not contacted in N days" → range scan on
-- last_outreach_at; NULLs first since "never contacted" is most actionable.
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_last_outreach_at
  ON marketing_contacts (last_outreach_at NULLS FIRST);
