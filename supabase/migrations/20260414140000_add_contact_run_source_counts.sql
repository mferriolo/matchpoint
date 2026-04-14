-- Per-source counters on contact_runs so the UI progress panel can show
-- a breakdown like: Apollo:12 · Leadership:4 · AI:6 · Crelate:3.

ALTER TABLE contact_runs
  ADD COLUMN IF NOT EXISTS apollo_added int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leadership_added int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_verified int NOT NULL DEFAULT 0;
