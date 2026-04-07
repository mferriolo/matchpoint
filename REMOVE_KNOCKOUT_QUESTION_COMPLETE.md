# Knockout Questions Prompt Removal - Complete

## Task Completed
Removed the question "Ask all the knockout questions that haven't already been addressed with this candidate" from ALL interview and prescreen call types.

## What Was Removed
Any question text containing:
- "knockout questions"
- "haven't already been addressed"
- "havent already been addressed"

## Call Types Affected
1. **Initial Screening** - Question removed and remaining 12 questions renumbered
2. **Full Interview** - Question removed and remaining 32 questions renumbered
3. **Debrief** - Checked (no such question existed, 16 questions remain)
4. **Reference Check** - Checked (no such question existed, 10 questions remain)

## SQL Changes Applied
```sql
-- Deleted questions matching the criteria
DELETE FROM questions
WHERE question_text ILIKE '%knockout questions%'
   OR question_text ILIKE '%haven''t already been addressed%'
   OR question_text ILIKE '%havent already been addressed%';

-- Renumbered all remaining questions for each call type
-- to maintain sequential sort_order starting from 1
```

## Verification Results
✅ All call types verified - no questions about knockout questions remain
✅ All questions properly renumbered with sequential sort_order
✅ All questions marked as active (is_active = true)

## Current Question Counts
- Initial Screening: 12 questions
- Full Interview: 32 questions
- Debrief: 16 questions
- Reference Check: 10 questions

## Impact
- Recruiters will no longer see this prompt during calls
- Knockout questions section remains functional (loaded from job_orders.knockout_questions)
- This only removes the META question about asking knockout questions
- The actual knockout questions for each job are unaffected
