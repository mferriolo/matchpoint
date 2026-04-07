-- CALL TYPE SYSTEM DATABASE STRUCTURE
-- =====================================
-- This documents the CORRECT structure as clarified by the user

-- TWO SEPARATE TABLES:
-- 1. call_types = Candidate Call Types (Initial Screening, Full Interview, Debrief, Reference Check)
-- 2. client_call_types = Client Call Types (Client Check In, Contract Negotiation, Job Order Call)

-- NO CATEGORY COLUMN - The tables themselves separate candidate vs client

-- Verify what's in call_types table (Candidate Call Types)
SELECT 'call_types (Candidate)' as table_name, * FROM call_types ORDER BY name;

-- Verify what's in client_call_types table (Client Call Types)
SELECT 'client_call_types (Client)' as table_name, * FROM client_call_types ORDER BY name;

-- Check if there's a category column (there shouldn't be)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('call_types', 'client_call_types')
ORDER BY table_name, ordinal_position;
