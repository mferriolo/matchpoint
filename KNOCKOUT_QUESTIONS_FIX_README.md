# Knockout Questions Duplication Fix

## Problem
Knockout questions were appearing in BOTH the "AI Prompts & Questions" section AND the "Knockout Questions" section during Initial Screening and Full Interview calls. This caused confusion and made it unclear which section to use.

## Root Cause
In `CallPromptContext.tsx`, the `startCall` function was adding knockout questions to the `allQuestions` array (lines 506-523). These questions were then:
1. Passed to the call session as part of the questions array
2. Converted to prompts in LiveCall.tsx and displayed in "AI Prompts & Questions"
3. ALSO loaded separately from the database in LiveCall.tsx and displayed in "Knockout Questions" section

This resulted in the same questions appearing twice.

## Solution
**Removed the code that adds knockout questions to `allQuestions` in `CallPromptContext.tsx`**

The knockout questions are now:
- ✅ Loaded ONLY in LiveCall.tsx from `job_orders.knockout_questions` field
- ✅ Displayed ONLY in the dedicated "Knockout Questions" section
- ❌ NOT included in the "AI Prompts & Questions" section

## Files Modified
1. **src/contexts/CallPromptContext.tsx** (lines 505-511)
   - Removed code that fetched knockout questions from localStorage
   - Removed code that added knockout questions to allQuestions array
   - Added comments explaining why this was removed

## How It Works Now
1. When starting an Initial Screening or Full Interview call:
   - Regular interview questions are loaded from the database
   - These questions appear in "AI Prompts & Questions" section

2. LiveCall.tsx separately loads knockout questions:
   - Queries `job_orders` table for the job's `knockout_questions` field
   - Displays them in the dedicated "Knockout Questions" section
   - This section only appears for Initial Screening and Full Interview calls

## Verification
To verify the fix works:
1. Create a job with knockout questions
2. Start an Initial Screening or Full Interview call for that job
3. Check that:
   - Knockout questions appear ONLY in the "Knockout Questions" section (orange header)
   - They do NOT appear in the "AI Prompts & Questions" section
   - Other interview questions appear normally in "AI Prompts & Questions"

## Related Files
- `src/components/LiveCall.tsx` - Loads and displays knockout questions
- `src/components/JobDetailsTabs.tsx` - Manages knockout questions for jobs
- `src/contexts/CallPromptContext.tsx` - Fixed to not duplicate knockout questions
