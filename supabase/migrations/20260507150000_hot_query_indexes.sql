-- Hot-query indexes called out in the audit pass.
--
-- Each statement is `CREATE INDEX IF NOT EXISTS` so re-running the
-- migration is a no-op. None of these are unique — they're just there
-- to keep planner cost low as the marketing tables grow past the
-- ~1k-row range where seq scans start dominating wall-clock.

-- Tracker STEP 1 load: open + non-closed jobs only. Partial index keeps
-- it small (closed rows are most of the table over time).
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_open
  ON marketing_jobs (status, is_closed)
  WHERE COALESCE(is_closed, false) = false;

-- "New (last run)" filters on Jobs and the post-run summary scan in
-- TrackerControls — both query by tracker_run_id. Partial because
-- only the most recent run's rows are usually being filtered.
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_tracker_run_id
  ON marketing_jobs (tracker_run_id)
  WHERE tracker_run_id IS NOT NULL;

-- company_id is the join key for refresh_marketing_company_counts'
-- aggregate, the contact-coverage trigger, the company-merge RPCs,
-- and the per-company "newJobsForCo" rollup in TrackerControls.
CREATE INDEX IF NOT EXISTS idx_marketing_jobs_company_id
  ON marketing_jobs (company_id);

-- Same join-key story on contacts.
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_id
  ON marketing_contacts (company_id);

-- "New companies (last run)" filter and the post-run summary card both
-- compare companies.created_at to the run's started_at.
CREATE INDEX IF NOT EXISTS idx_marketing_companies_created_at
  ON marketing_companies (created_at DESC);

-- Tracker progress polling reads "the latest run" repeatedly.
CREATE INDEX IF NOT EXISTS idx_tracker_runs_started_at_status
  ON tracker_runs (started_at DESC, status);

-- Find-Contacts progress polling reads contact_runs by id mostly, but
-- "latest" lookups happen on stale-cleanup and on dialog re-open.
CREATE INDEX IF NOT EXISTS idx_contact_runs_started_at
  ON contact_runs (started_at DESC);

-- claim_verification_queue_batch filters by run_id + status='pending'
-- with FOR UPDATE SKIP LOCKED. The composite index supports the
-- ORDER BY created_at ASC inside the locked subquery too.
CREATE INDEX IF NOT EXISTS idx_jvq_run_status_created
  ON job_verification_queue (run_id, status, created_at);
