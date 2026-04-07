-- SQL to fix job_orders table to store complete job data
-- Run this in Supabase SQL Editor

-- Add missing columns to job_orders table
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS job_type TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS knockout_questions JSONB DEFAULT '[]';
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS selling_points TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS objections TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS voicemail_hook TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS voicemail_script TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS text_hook TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS text_message TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS job_ad TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS requirements TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS salary_range TEXT;
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE job_orders ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Check what data currently exists
SELECT 
  id, 
  job_title, 
  company, 
  job_type, 
  summary, 
  knockout_questions,
  created_at 
FROM job_orders 
ORDER BY created_at DESC 
LIMIT 10;

-- If you see corrupted job_type values, you can clean them up:
-- UPDATE job_orders SET job_type = NULL WHERE job_type NOT IN ('Registered Nurse', 'Licensed Practical Nurse', 'CNA', 'Medical Assistant', 'Physical Therapist', 'Occupational Therapist', 'Speech Therapist', 'Respiratory Therapist', 'Radiology Tech', 'Lab Tech', 'Pharmacy Tech', 'Medical Billing', 'Medical Coding', 'Case Manager', 'Social Worker', 'Counselor', 'Psychologist', 'Psychiatrist', 'Other');
