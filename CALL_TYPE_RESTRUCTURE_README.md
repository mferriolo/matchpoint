# Call Type System - Complete Fix Documentation

## Problem Summary
Questions were not loading for call types like "Debrief", "Initial Screening", etc. The system was querying the wrong database table based on call category.

## Database Structure

### Two Separate Tables:
1. **`call_types`** - Stores CANDIDATE call types
   - Initial Screening
   - Full Interview
   - Debrief
   - Reference Check

2. **`client_call_types`** - Stores CLIENT call types
   - Client Check In
   - Contract Negotiation
   - Job Order Call (PROTECTED - cannot edit/delete)

### Questions Table:
- `questions` table stores all questions
- Links to call types via `type_id` (UUID)
- Has `question_type` field: 'call_type' for candidate, 'client_call_type' for client
- Has `category` field with the call type name

## What Was Fixed

### 1. CallPromptContext.tsx
**Updated `startCall` function:**
- Added `callCategory` parameter to function signature
- Determines which table to query based on `callCategory`:
  - `candidate` → queries `call_types` table
  - `client` → queries `client_call_types` table
- Sets correct `question_type` filter when fetching questions:
  - `candidate` → `question_type = 'call_type'`
  - `client` → `question_type = 'client_call_type'`

### 2. LiveCallsLanding.tsx
**Updated call initiation:**
- Now passes `callConfig.callCategory` to `startCall()` function
- This ensures the context knows whether it's a candidate or client call

## How It Works Now

### User Flow:
1. User clicks "Start New Call"
2. User selects Call Category (Candidate or Client)
3. Call Type dropdown populates from correct table:
   - Candidate → shows types from `call_types`
   - Client → shows types from `client_call_types`
4. User selects call type and starts call
5. System queries questions from `questions` table using:
   - Correct table for type_id lookup
   - Correct question_type filter
   - Result: Questions load successfully!

### Example Query Flow for "Debrief":
```
1. User selects: Category = Candidate, Type = Debrief
2. LiveCallsLanding passes: callCategory = 'candidate'
3. CallPromptContext:
   - Queries call_types table for "Debrief"
   - Gets type_id: abc-123-def
   - Queries questions table:
     WHERE type_id = 'abc-123-def' 
     AND question_type = 'call_type'
     AND is_active = true
   - Returns 16 questions for Debrief
4. Questions populate in AI Prompts section ✅
```

## Verification Steps

### To verify the fix is working:
1. Go to Live Calls → Start New Call
2. Select "Candidate" category
3. Select "Debrief" call type
4. Enter a name and start the call
5. Check console logs for:
   ```
   ✅ Successfully loaded questions: [array of 16 questions]
   Number of questions loaded: 16
   ```
6. Verify questions appear in the AI Prompts and Questions section

## Protected Features

### Job Order Call Protection:
- Cannot be edited in admin interface
- Cannot be deleted in admin interface
- Shows "Protected - Cannot Edit" badge
- All existing Job Order Call functionality remains unchanged

## Database Query Examples

### Check Debrief questions:
```sql
SELECT q.question_text, q.sort_order 
FROM questions q
JOIN call_types ct ON q.type_id = ct.id
WHERE ct.name = 'Debrief'
  AND q.question_type = 'call_type'
  AND q.is_active = true
ORDER BY q.sort_order;
```

### Check all candidate call types:
```sql
SELECT name, is_active FROM call_types ORDER BY name;
```

### Check all client call types:
```sql
SELECT name, is_active FROM client_call_types ORDER BY name;
```

## Summary
The call type system now correctly:
- ✅ Separates candidate and client call types into different tables
- ✅ Queries the correct table based on user's category selection
- ✅ Loads questions with proper type_id and question_type filters
- ✅ Protects Job Order Call from editing/deletion
- ✅ Maintains all existing Job Order Call functionality
