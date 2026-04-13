-- Per-run telemetry: time, AI tokens, AI/SerpAPI cost, item flow per step.
-- Surfaced in the Tracker UI run-results panel so we can decide which
-- steps are worth keeping/replacing without guessing.

ALTER TABLE tracker_runs
  ADD COLUMN IF NOT EXISTS telemetry JSONB;
