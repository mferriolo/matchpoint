# Call Records Fix Complete

## Issue Fixed
Calls were being saved to a `job_call_records` table and appearing on the Jobs Dashboard instead of only appearing in the Live Calls dashboard.

## Changes Made

### 1. Removed job_call_records Table References
- **File**: `src/contexts/CallPromptContext.tsx`
- **Lines Removed**: 748-772, 803-826
- Completely removed all code that was saving calls to the `job_call_records` table
- Calls now ONLY save to the `call_recordings` table

### 2. Fixed Temporary Job Creation
- **File**: `src/contexts/CallPromptContext.tsx`
- **Lines Modified**: 461-483
- Changed temporary job creation for candidate calls to NOT add them to the jobs state
- Temporary jobs now use a 'temp-' prefix in their ID
- These temporary jobs are used for the call session but don't appear in Jobs Dashboard

## Result
- All calls (both client and candidate) now save ONLY to the `call_recordings` table
- Calls appear ONLY in the Live Calls dashboard
- Jobs Dashboard only shows actual job orders, not call records
- Temporary jobs for candidate calls don't appear in Jobs Dashboard

## Database Cleanup (Optional)
If you want to remove the unused `job_call_records` table:
```sql
DROP TABLE IF EXISTS job_call_records CASCADE;
```

## Verification
1. Start a Job Order Call from Jobs Dashboard - it should appear in Live Calls, not create a new job
2. Start a Candidate Call - it should appear in Live Calls, not create a job in Jobs Dashboard
3. Check Jobs Dashboard - should only show actual job orders, no call records