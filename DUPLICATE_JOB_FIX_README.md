# Duplicate Job Creation Bug - FIXED

## Problem
Jobs were being created twice in the database, resulting in duplicate records with the same title and company but different IDs.

## Root Cause
The issue had multiple contributing factors:

### 1. **save-job-order Function Creating Duplicates**
- When a new job was created, the `addJob` function in `CallPromptContext.tsx` would:
  1. Insert the job into the database (line 187-191)
  2. Call `generateAllJobContent()` (line 227)
  3. Inside `generateAllJobContent`, call `save-job-order` edge function (line 342)
- The `save-job-order` function was doing an INSERT instead of UPDATE, creating a second record
- The second record had `title = NULL` but `job_title` populated, bypassing the unique constraint

### 2. **Unique Constraint Not Catching All Cases**
- The original unique constraint was:
  ```sql
  CREATE UNIQUE INDEX unique_job_title_company 
  ON job_orders(title, company) 
  WHERE title IS NOT NULL AND company IS NOT NULL
  ```
- This constraint only checked the `title` field, not `job_title`
- When the duplicate had `title = NULL`, the constraint didn't apply

### 3. **Duplicate Check Not Comprehensive**
- The duplicate check in `addJob` only queried the `title` field
- It didn't check `job_title`, so it missed duplicates with NULL title

## Fixes Applied

### 1. **Removed Duplicate-Causing Code**
**File:** `src/contexts/CallPromptContext.tsx` (lines 341-349)
- Removed the call to `save-job-order` during job creation
- Added comment explaining that save-job-order should only be called when updating existing jobs
- The job is already fully created in the database at line 187-191, no need to call save-job-order

### 2. **Improved Unique Constraint**
**Database:** `job_orders` table
```sql
CREATE UNIQUE INDEX unique_job_title_company 
ON job_orders(COALESCE(title, job_title), company) 
WHERE company IS NOT NULL AND (title IS NOT NULL OR job_title IS NOT NULL);
```
- Uses `COALESCE(title, job_title)` to check either field
- Prevents duplicates even if one field is NULL

### 3. **Enhanced Duplicate Check**
**File:** `src/contexts/CallPromptContext.tsx` (lines 103-107)
```typescript
const { data: existingJobs } = await supabase
  .from('job_orders')
  .select('id, title, job_title, company')
  .eq('company', jobData.company)
  .or(`title.eq.${jobData.title},job_title.eq.${jobData.title}`);
```
- Now checks both `title` and `job_title` fields
- Uses OR condition to catch duplicates in either field

### 4. **Cleaned Up Existing Duplicates**
- Deleted the duplicate record that had `title = NULL`
- Kept the original record with both fields populated

## Testing
To verify the fix works:
1. Try creating a new job with the same title and company as an existing job
2. The duplicate check should prevent creation and log: "⚠️ Job already exists"
3. The database constraint will also prevent duplicates at the database level
4. Check the console logs for detailed debugging information

## Prevention
The fix includes multiple layers of protection:
1. **Application Layer**: Duplicate check before insert
2. **Database Layer**: Unique constraint prevents duplicates
3. **Code Logic**: Removed the duplicate-causing save-job-order call
4. **UI Layer**: Button disabled during save to prevent double-clicks

## Related Files
- `src/contexts/CallPromptContext.tsx` - Main fix location
- `src/components/JobsDashboard.tsx` - Has isSaving state to prevent double-clicks
- Database: `job_orders` table with improved unique constraint
