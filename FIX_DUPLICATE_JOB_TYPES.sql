-- Fix Duplicate Job Types in Database
-- This script identifies and fixes job types that are duplicated like "PhysicianPhysician"

-- First, let's see what duplicated job types exist
SELECT 
  id,
  job_type,
  is_active,
  LENGTH(job_type) as length,
  SUBSTRING(job_type, 1, LENGTH(job_type)/2) as first_half,
  SUBSTRING(job_type, LENGTH(job_type)/2 + 1) as second_half
FROM jobs
WHERE 
  LENGTH(job_type) % 2 = 0 -- Even length (required for exact duplication)
  AND SUBSTRING(job_type, 1, LENGTH(job_type)/2) = SUBSTRING(job_type, LENGTH(job_type)/2 + 1)
ORDER BY job_type;

-- Fix the duplicated job types
-- This will update any job type where the first half equals the second half
UPDATE jobs
SET job_type = SUBSTRING(job_type, 1, LENGTH(job_type)/2)
WHERE 
  LENGTH(job_type) % 2 = 0 
  AND LENGTH(job_type) > 0
  AND SUBSTRING(job_type, 1, LENGTH(job_type)/2) = SUBSTRING(job_type, LENGTH(job_type)/2 + 1);

-- Verify the fix
SELECT DISTINCT job_type, is_active
FROM jobs
WHERE is_active = true
ORDER BY job_type;
