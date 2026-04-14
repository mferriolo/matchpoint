-- contact_runs: tracks each invocation of the standalone find-contacts
-- edge function. Mirrors the shape of tracker_runs so the Contacts tab
-- can poll for progress the same way the Tracker does.

CREATE TABLE IF NOT EXISTS contact_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',         -- running | completed | failed
  mode text NOT NULL,                             -- 'all' | 'company'
  target_company_id uuid,
  target_company_name text,
  companies_total int NOT NULL DEFAULT 0,
  companies_processed int NOT NULL DEFAULT 0,
  current_company text,
  contacts_added int NOT NULL DEFAULT 0,
  ai_added int NOT NULL DEFAULT 0,
  crelate_added int NOT NULL DEFAULT 0,
  duplicates_skipped int NOT NULL DEFAULT 0,
  per_company jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{company, ai_added, crelate_added, duplicates_skipped, errors}]
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_contact_runs_status_started
  ON contact_runs (status, started_at DESC);
