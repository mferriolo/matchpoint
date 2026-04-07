-- Add job_type column to candidates table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'candidates' 
        AND column_name = 'job_type'
    ) THEN
        ALTER TABLE candidates 
        ADD COLUMN job_type TEXT;
        
        -- Add comment to describe the column
        COMMENT ON COLUMN candidates.job_type IS 'Job type/category for the candidate (e.g., Physician, Nurse, etc.)';
    END IF;
END $$;