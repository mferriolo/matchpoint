-- Step 1: Check if category column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'client_call_types';

-- Step 2: Add category column if it doesn't exist
ALTER TABLE client_call_types 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Step 3: View current data
SELECT id, name, description, category, is_active 
FROM client_call_types 
ORDER BY name;

-- Step 4: Update candidate call types
UPDATE client_call_types 
SET category = 'candidate' 
WHERE name IN ('Initial Screening', 'Full Interview', 'Debrief', 'Reference Check');

-- Step 5: Update client call types
UPDATE client_call_types 
SET category = 'client' 
WHERE name IN ('Client Check In', 'Contract Negotiation', 'Job Order Call');

-- Step 6: Verify the fix
SELECT id, name, category, is_active 
FROM client_call_types 
ORDER BY category, name;
