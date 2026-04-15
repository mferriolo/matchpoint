-- Track per-run Lusha contributions separately from Apollo/Hunter so
-- the results dialog can show what each paid source produced.
ALTER TABLE contact_runs
  ADD COLUMN IF NOT EXISTS lusha_added int NOT NULL DEFAULT 0;
