-- Replace the partial unique index on marketing_jobs.dedup_key with a
-- full unique index.
--
-- The partial index from 20260504150000_marketing_jobs_dedup.sql was
-- `... WHERE dedup_key <> '|||'`, intended to skip a handful of
-- malformed all-empty legacy rows. supabase-js's `.upsert({ onConflict:
-- 'dedup_key' })` emits `ON CONFLICT (dedup_key)` without the WHERE
-- predicate, so Postgres can't match the partial index and rejects
-- every insert with 42P10 ("no unique or exclusion constraint matching
-- the ON CONFLICT specification"). Net effect: every tracker run since
-- 2026-05-04 dropped 100% of discovered jobs on the floor.
--
-- Verified before applying: zero rows currently have dedup_key='|||',
-- and all 1080 dedup_keys are unique — the full unique index can be
-- built without any cleanup. (The dedup_key generated column is
-- itself NOT NULL via coalesce(..., '') in its expression, so a full
-- unique index is safe.)

DROP INDEX IF EXISTS uq_marketing_jobs_dedup_key;

CREATE UNIQUE INDEX uq_marketing_jobs_dedup_key
  ON marketing_jobs(dedup_key);
