-- Fix Full Interview Questions
-- Remove Question 1 about knockout questions and renumber the rest

-- First, let's see what we're working with
-- Run this to check the current questions:
-- SELECT sort_order, question_text 
-- FROM questions 
-- WHERE type_id = (SELECT id FROM call_types WHERE name = 'Full Interview')
-- ORDER BY sort_order;

-- Step 1: Find the question about knockout questions and delete it
-- This finds any question that mentions "knockout questions" in Full Interview
DELETE FROM questions
WHERE type_id = (SELECT id FROM call_types WHERE name = 'Full Interview')
AND question_text ILIKE '%knockout questions%';

-- Step 2: Renumber all remaining questions to start from 1
-- This updates the sort_order to be sequential starting from 1
WITH ranked_questions AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY sort_order) as new_sort_order
  FROM questions
  WHERE type_id = (SELECT id FROM call_types WHERE name = 'Full Interview')
  AND is_active = true
)
UPDATE questions
SET sort_order = ranked_questions.new_sort_order
FROM ranked_questions
WHERE questions.id = ranked_questions.id;

-- Step 3: Verify the changes
-- Run this to see the updated questions:
SELECT sort_order, question_text 
FROM questions 
WHERE type_id = (SELECT id FROM call_types WHERE name = 'Full Interview')
AND is_active = true
ORDER BY sort_order;
