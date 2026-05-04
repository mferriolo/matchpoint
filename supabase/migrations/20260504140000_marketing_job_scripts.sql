-- Storage for AI-generated Problem/Solution outreach scripts. One row
-- per generation so we can keep history per job and let the user pick a
-- "current" one without overwriting prior versions. Inputs are kept
-- alongside outputs so the form can rehydrate when the user reopens a
-- past script.

CREATE TABLE IF NOT EXISTS marketing_job_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES marketing_jobs(id) ON DELETE CASCADE,
  company_name text,
  job_title text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_job_scripts_job_id_created_at_idx
  ON marketing_job_scripts(job_id, created_at DESC);

ALTER TABLE marketing_job_scripts ENABLE ROW LEVEL SECURITY;

-- Match the open-policy pattern used elsewhere in this app: any
-- authenticated session can read/write its own scripts. Tighten later
-- if multi-user separation becomes a requirement.
DROP POLICY IF EXISTS marketing_job_scripts_all ON marketing_job_scripts;
CREATE POLICY marketing_job_scripts_all
  ON marketing_job_scripts
  FOR ALL
  USING (true)
  WITH CHECK (true);
