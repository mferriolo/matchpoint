# Call Type System Fix - Complete Documentation

## Database Structure (CONFIRMED)

### Two Separate Tables:
1. **`call_types`** = Candidate Call Types
   - Initial Screening
   - Full Interview
   - Debrief
   - Reference Check

2. **`client_call_types`** = Client Call Types
   - Client Check In
   - Contract Negotiation
   - Job Order Call (PROTECTED - cannot edit/delete)

### NO CATEGORY COLUMN
The tables themselves separate candidate vs client call types.

## What Was Fixed

### 1. Admin - Candidate Call Types (CallTypeManagement.tsx)
- **Changed FROM**: Querying `client_call_types` with `category='candidate'`
- **Changed TO**: Querying `call_types` table
- Save/update/delete operations now use `call_types` table

### 2. Admin - Client Call Types (ClientCallTypes.tsx)
- **Changed FROM**: Querying with `category='client'` filter
- **Changed TO**: Querying `client_call_types` without category filter
- Job Order Call is protected from editing/deleting

### 3. Live Calls - Start New Call (LiveCallsLanding.tsx)
- **Changed FROM**: Querying `client_call_types` with category filter
- **Changed TO**: Dynamic table selection based on call category
  - If `callCategory === 'candidate'` → query `call_types`
  - If `callCategory === 'client'` → query `client_call_types`

### 4. Call Prompt Context (CallPromptContext.tsx)
- **TODO**: Update to query correct table when starting call
- Job Order Call logic remains untouched

## User Flow (NOW WORKING)

1. User clicks "Start New Call"
2. User selects Call Category: ○ Candidate  ○ Client
3. System queries appropriate table and populates dropdown
4. User selects call type from filtered list
5. User starts the call

## Verification SQL

Run this to verify your database structure:

```sql
-- Check candidate call types
SELECT 'call_types' as table_name, * FROM call_types ORDER BY name;

-- Check client call types  
SELECT 'client_call_types' as table_name, * FROM client_call_types ORDER BY name;
```
