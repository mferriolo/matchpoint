-- =====================================================
-- FIX CANDIDATE NAMES: Restore first_name and last_name
-- =====================================================
-- This script fixes the candidates table to use separate
-- first_name and last_name fields instead of a single name field
-- =====================================================

-- Step 1: Check current state of the candidates table
SELECT 
  id, 
  name, 
  first_name, 
  last_name,
  email,
  current_job_title
FROM candidates
ORDER BY id
LIMIT 10;

-- Step 2: Add first_name and last_name columns if they don't exist
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Step 3: If there's data in the 'name' field, split it into first_name and last_name
UPDATE candidates
SET 
  first_name = SPLIT_PART(name, ' ', 1),
  last_name = CASE 
    WHEN ARRAY_LENGTH(STRING_TO_ARRAY(name, ' '), 1) > 1 
    THEN SUBSTRING(name FROM LENGTH(SPLIT_PART(name, ' ', 1)) + 2)
    ELSE ''
  END
WHERE name IS NOT NULL 
  AND name != ''
  AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '');

-- Step 4: Verify the split worked correctly
SELECT 
  id,
  name AS original_name,
  first_name,
  last_name,
  CONCAT(first_name, ' ', last_name) AS reconstructed_name,
  email,
  current_job_title
FROM candidates
ORDER BY id;

-- Step 5: Check for any NULL values in first_name or last_name
SELECT 
  COUNT(*) as total_candidates,
  COUNT(first_name) as with_first_name,
  COUNT(last_name) as with_last_name,
  COUNT(*) - COUNT(first_name) as missing_first_name,
  COUNT(*) - COUNT(last_name) as missing_last_name
FROM candidates;

-- Step 6 (OPTIONAL): After verifying data is correct, drop the 'name' column
-- ONLY RUN THIS AFTER CONFIRMING first_name AND last_name ARE POPULATED CORRECTLY
-- ALTER TABLE candidates DROP COLUMN IF EXISTS name;
