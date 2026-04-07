-- SQL migration to add job_type column to candidates table
-- Run this in Supabase SQL Editor

-- Add job_type column to candidates table if it doesn't exist
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS job_type TEXT;

-- Optional: Add an index on job_type for faster queries
CREATE INDEX IF NOT EXISTS idx_candidates_job_type ON candidates(job_type);

-- Optional: Add an index on status and job_type for combined queries
CREATE INDEX IF NOT EXISTS idx_candidates_status_job_type ON candidates(status, job_type);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'candidates' 
AND column_name = 'job_type';