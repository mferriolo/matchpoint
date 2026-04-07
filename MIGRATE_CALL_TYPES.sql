-- Migration Script: Consolidate call_types into client_call_types with categories
-- This script migrates candidate call types from the old 'call_types' table 
-- to the unified 'client_call_types' table with proper category field

-- Step 1: Ensure the category column exists in client_call_types
ALTER TABLE client_call_types ADD COLUMN IF NOT EXISTS category TEXT;

-- Step 2: Migrate existing call types from call_types table to client_call_types
-- Only insert if they don't already exist (check by name)
INSERT INTO client_call_types (name, description, category, is_active, created_at)
SELECT 
  ct.name,
  ct.description,
  'candidate' as category,
  ct.is_active,
  ct.created_at
FROM call_types ct
WHERE NOT EXISTS (
  SELECT 1 FROM client_call_types cct 
  WHERE cct.name = ct.name AND cct.category = 'candidate'
);

-- Step 3: Verify the migration
SELECT 
  id, 
  name, 
  category, 
  is_active,
  created_at
FROM client_call_types
ORDER BY category, name;

-- Step 4: After verifying data is correct, you can optionally drop the old table
-- UNCOMMENT THE LINE BELOW ONLY AFTER VERIFYING THE MIGRATION WORKED
-- DROP TABLE call_types;
