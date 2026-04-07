-- Fix email field for candidate "Matt"
-- The email field currently contains "Matt" (the name) instead of the actual email address
-- This script will update it to the correct email address

-- First, let's see what data we have
SELECT id, name, first_name, last_name, email, phone
FROM candidates
WHERE first_name = 'Matt' OR name LIKE '%Matt%' OR email = 'Matt';

-- Update the email field to the correct email address
-- Replace 'matt@medcentric.net' with the actual email if different
UPDATE candidates
SET email = 'matt@medcentric.net'
WHERE (first_name = 'Matt' OR name LIKE '%Matt%') 
  AND (email = 'Matt' OR email IS NULL OR email = '');

-- Verify the update
SELECT id, name, first_name, last_name, email, phone
FROM candidates
WHERE first_name = 'Matt' OR name LIKE '%Matt%';
