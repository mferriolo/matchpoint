-- ============================================
-- SKILLS DEBUGGING SQL QUERIES
-- ============================================

-- 1. Check most recent candidate's skills
SELECT 
  id,
  name,
  "firstName",
  "lastName",
  skills,
  normalized_skills,
  created_at
FROM candidates
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check if skills column is properly configured
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'candidates'
  AND column_name IN ('skills', 'normalized_skills');

-- 3. Count candidates with and without skills
SELECT 
  COUNT(*) as total_candidates,
  COUNT(skills) as candidates_with_skills,
  COUNT(normalized_skills) as candidates_with_normalized_skills,
  COUNT(*) - COUNT(skills) as candidates_without_skills
FROM candidates;

-- 4. Sample of candidates with skills
SELECT 
  id,
  name,
  jsonb_array_length(skills::jsonb) as skills_count,
  skills
FROM candidates
WHERE skills IS NOT NULL 
  AND skills::text != '[]'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check master_skills table
SELECT 
  COUNT(*) as total_master_skills,
  COUNT(DISTINCT category) as categories,
  COUNT(DISTINCT profession) as professions
FROM master_skills;

-- 6. Sample master skills
SELECT 
  skill_name,
  category,
  profession,
  aliases
FROM master_skills
ORDER BY skill_name
LIMIT 20;
