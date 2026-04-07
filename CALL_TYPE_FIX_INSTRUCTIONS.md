# Call Type System Fix - Simple Instructions

## The Problem
Call types exist in the admin tool but don't appear in the "Start New Call" dropdown.

## The Solution
The call types need a `category` field set to either 'candidate' or 'client'.

## How to Fix (3 Simple Steps)

### Step 1: Go to Supabase
1. Open your Supabase dashboard
2. Click on "SQL Editor" in the left sidebar

### Step 2: Run This SQL
Copy and paste this into the SQL Editor and click "Run":

```sql
-- Add category column if missing
ALTER TABLE client_call_types 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Set candidate call types
UPDATE client_call_types 
SET category = 'candidate' 
WHERE name IN ('Initial Screening', 'Full Interview', 'Debrief', 'Reference Check');

-- Set client call types
UPDATE client_call_types 
SET category = 'client' 
WHERE name IN ('Client Check In', 'Contract Negotiation', 'Job Order Call');

-- Verify it worked
SELECT name, category FROM client_call_types ORDER BY category, name;
```

### Step 3: Test
1. Go to your app
2. Click "Start New Call"
3. Select "Candidate" - you should see: Initial Screening, Full Interview, Debrief, Reference Check
4. Select "Client" - you should see: Client Check In, Contract Negotiation, Job Order Call

## Done!
The call types will now appear correctly based on the selected category.
