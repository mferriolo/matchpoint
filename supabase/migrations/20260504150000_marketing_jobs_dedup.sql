-- Dedupe marketing_jobs and prevent future duplicates.
--
-- The scrape function already dedups in-memory using a key shaped like
--   lower(company)|lower(title)|lower(city)|lower(state)
-- but the DB had no constraint, so jobs inserted via Import, Crelate
-- pulls, or two scrapes racing could land twice. This migration:
--   1. Adds a generated dedup_key column matching the scrape's key.
--   2. Collapses existing duplicates into a single keeper per group,
--      merging useful state (high_priority, last_seen_at) and
--      re-pointing dependent rows (scripts, crelate_links) so we don't
--      lose history.
--   3. Adds a partial unique index to enforce uniqueness going forward.

-- 1) Generated dedup key. STORED so the unique index can use it.
ALTER TABLE marketing_jobs
  ADD COLUMN IF NOT EXISTS dedup_key text GENERATED ALWAYS AS (
    lower(btrim(coalesce(company_name, ''))) || '|' ||
    lower(btrim(coalesce(job_title, '')))    || '|' ||
    lower(btrim(coalesce(city, '')))         || '|' ||
    lower(btrim(coalesce(state, '')))
  ) STORED;

-- 2) Build a temporary plan: for each duplicate group, identify the
--    keeper (most-fit row) and the losers (everyone else). Order by:
--    open > closed, non-blocked > blocked, has-url > no-url, most
--    recently seen, oldest created (stable tiebreak).
CREATE TEMPORARY TABLE _dedup_plan ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    dedup_key,
    high_priority,
    is_blocked,
    is_closed,
    job_url,
    last_seen_at,
    updated_at,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY dedup_key
      ORDER BY
        CASE WHEN coalesce(is_closed, false)  THEN 1 ELSE 0 END,
        CASE WHEN coalesce(is_blocked, false) THEN 1 ELSE 0 END,
        CASE WHEN job_url IS NOT NULL AND job_url <> '' THEN 0 ELSE 1 END,
        coalesce(last_seen_at, updated_at, created_at) DESC NULLS LAST,
        created_at ASC
    ) AS rn
  FROM marketing_jobs
  WHERE dedup_key <> '|||'
)
SELECT
  loser.id   AS loser_id,
  keeper.id  AS keeper_id,
  loser.dedup_key
FROM ranked loser
JOIN ranked keeper
  ON keeper.dedup_key = loser.dedup_key
 AND keeper.rn = 1
WHERE loser.rn > 1;

-- 3) Merge state from losers into keepers (high_priority OR-merged,
--    last_seen_at = max across the group).
UPDATE marketing_jobs m
   SET high_priority = m.high_priority OR coalesce(merged.any_hp, false),
       last_seen_at  = greatest(
                         coalesce(m.last_seen_at, '-infinity'::timestamptz),
                         coalesce(merged.max_seen, '-infinity'::timestamptz)
                       )
  FROM (
    SELECT
      p.keeper_id,
      bool_or(j.high_priority) AS any_hp,
      max(coalesce(j.last_seen_at, j.updated_at, j.created_at)) AS max_seen
    FROM _dedup_plan p
    JOIN marketing_jobs j ON j.id = p.loser_id
    GROUP BY p.keeper_id
  ) merged
 WHERE m.id = merged.keeper_id;

-- 4) Re-point dependents that don't have ON DELETE CASCADE.
--    crelate_links has no FK so the cascade wouldn't fire; do it manually.
--    marketing_job_scripts has CASCADE but we re-point so we don't drop
--    history.
UPDATE marketing_job_scripts s
   SET job_id = p.keeper_id
  FROM _dedup_plan p
 WHERE s.job_id = p.loser_id;

UPDATE crelate_links c
   SET mp_id = p.keeper_id
  FROM _dedup_plan p
 WHERE c.entity_type = 'job'
   AND c.mp_id = p.loser_id
   -- Skip rows that would collide with an existing keeper link; the
   -- keeper's link wins, the loser's is dropped by the DELETE below
   -- (unique index prevents the update otherwise).
   AND NOT EXISTS (
     SELECT 1 FROM crelate_links k
      WHERE k.entity_type = 'job' AND k.mp_id = p.keeper_id
   );

-- Anything that *would* have collided gets removed so the DELETE
-- doesn't get blocked by the partial unique index on crelate_links.
DELETE FROM crelate_links c
 USING _dedup_plan p
 WHERE c.entity_type = 'job' AND c.mp_id = p.loser_id;

-- 5) Delete losers. CASCADE on marketing_job_scripts is now a no-op
--    because step 4 re-pointed them all.
DELETE FROM marketing_jobs
 WHERE id IN (SELECT loser_id FROM _dedup_plan);

-- 6) Enforce uniqueness going forward. Partial — '|||' (all-empty) is
--    excluded so a handful of malformed legacy rows don't all collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_jobs_dedup_key
  ON marketing_jobs(dedup_key)
  WHERE dedup_key <> '|||';
