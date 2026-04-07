# Email Parameter Issue - Root Cause and Fix

## Problem Identified

The Resend API is receiving:
- `to`: ["Matt"] ❌ (name instead of email)
- `subject`: "matt@medcentric.net" ❌ (email instead of subject)

## Root Cause Analysis

After thorough investigation of the frontend code:

1. **Frontend Code is CORRECT** ✅
   - `SendEmailDialog.tsx` correctly passes `candidateEmail` to the `to` field
   - `CandidateList.tsx` correctly passes `candidate.email` as `candidateEmail` prop
   - All parameter mappings are correct in the code

2. **The Issue is in the DATABASE** ❌
   - The candidate record in the database has the wrong data
   - The `email` field contains "Matt" (the name) instead of "matt@medcentric.net"
   - When the frontend reads this data and passes it to the API, it's passing the wrong value

## Evidence

From `CandidateList.tsx` (lines 799-800):
```typescript
candidateName={`${selectedCandidateForEmail.first_name} ${selectedCandidateForEmail.last_name}`}
candidateEmail={selectedCandidateForEmail.email || ''}
```

From `SendEmailDialog.tsx` (line 56):
```typescript
to: candidateEmail,  // This receives whatever is in candidate.email field
```

## Solution

### Option 1: Fix the Database Record (Recommended)

Run the SQL script `FIX_MATT_EMAIL.sql`:

```sql
UPDATE candidates
SET email = 'matt@medcentric.net'
WHERE (first_name = 'Matt' OR name LIKE '%Matt%') 
  AND (email = 'Matt' OR email IS NULL OR email = '');
```

### Option 2: Add Frontend Validation

Add email validation in `CandidateList.tsx` before opening the dialog:

```typescript
const handleSendEmail = (candidate: Candidate, e: React.MouseEvent) => {
  e.stopPropagation();
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const candidateEmail = candidate.email || '';
  
  if (!candidateEmail || !emailRegex.test(candidateEmail)) {
    toast({
      title: "Invalid Email",
      description: `Cannot send email. The email field for ${candidate.first_name} ${candidate.last_name} contains invalid data: "${candidateEmail}"`,
      variant: "destructive"
    });
    return;
  }
  
  setSelectedCandidateForEmail(candidate);
  setShowEmailDialog(true);
};
```

## How to Verify the Fix

1. **Check the database:**
   ```sql
   SELECT id, name, first_name, last_name, email 
   FROM candidates 
   WHERE first_name = 'Matt';
   ```

2. **Look for the logging output** in browser console when clicking "Send Email":
   ```
   === HANDLE SEND EMAIL (CandidateList) ===
   candidate.email: matt@medcentric.net  ✅ (should be an email)
   ```

3. **Check edge function logs:**
   ```
   === EMAIL REQUEST DEBUG ===
   to field: matt@medcentric.net  ✅ (should be an email)
   ```

## Prevention

To prevent this in the future, add validation when inserting candidates:

```typescript
// In CandidateUpload.tsx
const validateEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Before insert:
if (candidateForm.email && !validateEmail(candidateForm.email)) {
  toast({
    title: "Invalid Email",
    description: "Please enter a valid email address",
    variant: "destructive"
  });
  return;
}
```
