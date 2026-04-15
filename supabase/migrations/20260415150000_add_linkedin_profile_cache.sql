-- Persistent cache for lookup-linkedin-profile so repeat lookups on
-- the same person don't burn fresh SerpAPI credits. Especially
-- important for the duplicate-review workflow where the user may
-- re-open a group and re-click "Check LinkedIn" multiple times.
--
-- Lookup key is (lower(first_name), lower(last_name)) — ambiguous
-- names are rare enough in practice that a single cached record is
-- fine; we can add a secondary hint lookup later if needed. TTL is
-- enforced by the edge function (30 days by default).

CREATE TABLE IF NOT EXISTS linkedin_profile_cache (
  first_name_lower text NOT NULL,
  last_name_lower text NOT NULL,
  linkedin_url text,
  current_company text,
  current_title text,
  snippet text,
  hint_company text,
  looked_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (first_name_lower, last_name_lower)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_cache_looked_up
  ON linkedin_profile_cache (looked_up_at DESC);
