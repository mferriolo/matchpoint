-- Add is_blocked flag to marketing_jobs and marketing_companies so the user can
-- mark items they don't want to see again. The scraper consults these flags to
-- avoid re-discovering or re-adding blocked jobs/companies on subsequent runs.

ALTER TABLE marketing_jobs
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE marketing_companies
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS marketing_jobs_is_blocked_idx
  ON marketing_jobs (is_blocked) WHERE is_blocked = true;

CREATE INDEX IF NOT EXISTS marketing_companies_is_blocked_idx
  ON marketing_companies (is_blocked) WHERE is_blocked = true;
