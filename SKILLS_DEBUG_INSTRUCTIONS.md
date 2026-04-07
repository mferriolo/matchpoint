# Skills Extraction Debugging Guide

## Current Status

✅ **Logging Added:**
- Parse-resume edge function has comprehensive logging
- ResumeParser component has logging before/after parsing
- All skills data is logged at each step

## Step-by-Step Debugging Process

### STEP 1: Test OpenAI Prompt Directly

Use the Skills Debugger component to verify the prompt extracts skills:

1. Go to Admin Panel → Skills Debugger (add to admin page)
2. Paste sample resume text with skills
3. Click "Test OpenAI Parser"
4. Check browser console for detailed logs
5. Verify skills array is populated

**Expected Result:** Skills array should contain all skills from the resume

### STEP 2: Upload a Real Resume

1. Go to Candidates → Upload Resume
2. Upload a resume with clear skills section
3. Open browser console (F12)
4. Look for these log sections:
   - `===== CALLING OPENAI TO PARSE RESUME =====`
   - `===== OPENAI RAW RESPONSE =====`
   - `===== PARSED DATA FROM OPENAI =====`
   - `===== RESUME PARSING DEBUG =====`
   - `===== BEFORE SAVING CANDIDATE =====`

**Check:**
- Does parsedData.skills exist?
- Is it an array?
- What does it contain?
- Is it empty or populated?

### STEP 3: Check Database

After uploading, query the database:

```sql
-- Get most recent candidate
SELECT 
  id,
  name,
  skills,
  normalized_skills,
  created_at
FROM candidates
ORDER BY created_at DESC
LIMIT 1;
```

**Check:**
- Is skills column null, empty array, or populated?
- Is normalized_skills column null, empty array, or populated?

### STEP 4: Identify the Problem

**If skills appear in console logs but NOT in database:**
- Problem is in the save operation
- Check candidateData object before insert
- Check database column types (should be jsonb or text[])

**If skills DON'T appear in console logs:**
- Problem is in OpenAI extraction
- Check the resume text quality
- Verify OpenAI API key is working
- Test with Skills Debugger component

**If skills appear as empty array []:**
- OpenAI is not extracting skills
- Resume may not have clear skills section
- Prompt may need adjustment

## Common Issues

### Issue 1: Skills Not Extracted from Resume
**Symptoms:** parsedData.skills is []
**Solution:** 
- Check resume has clear "SKILLS" section
- Try different resume format
- Enhance OpenAI prompt to be more aggressive

### Issue 2: Skills Extracted but Not Saved
**Symptoms:** Skills in logs but null in database
**Solution:**
- Check database schema allows jsonb or text[]
- Verify candidateData.skills is set before insert
- Check for database errors in console

### Issue 3: Skills Saved as String Instead of Array
**Symptoms:** skills column shows "[object Object]" or stringified array
**Solution:**
- Ensure database column is jsonb type
- Don't JSON.stringify before insert

## Next Steps

After identifying the issue:

1. **If extraction works:** Focus on database save operation
2. **If extraction fails:** Improve OpenAI prompt or resume parsing
3. **If normalization needed:** Create normalize-skills edge function

## Testing Checklist

- [ ] Skills Debugger shows skills extracted
- [ ] Console logs show skills in parsedData
- [ ] Console logs show skills in candidateData
- [ ] Database query shows skills saved
- [ ] Skills display correctly in UI
