-- Update Nesren Anton's email address in the candidates table
-- Run this query in your Supabase SQL editor

UPDATE candidates 
SET email = 'info@medcentric.net'
WHERE (first_name = 'Nesren' AND last_name = 'Anton')
   OR name = 'Nesren Anton';

-- Verify the update
SELECT id, first_name, last_name, name, email, phone 
FROM candidates 
WHERE (first_name = 'Nesren' AND last_name = 'Anton')
   OR name = 'Nesren Anton';