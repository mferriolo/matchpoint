# Duplicate Job Type Display Fix - SelectValue Issue

## Problem
When selecting a job type from the dropdown in Resume Parser or Manual Entry, the selected value displays duplicated text:
- "Physician" shows as "PhysicianPhysician"  
- "Advanced Practitioner (NP/PA)" shows as "Advanced Practitioner (NP/PA)Advanced Practitioner (NP/PA)"

## Root Cause Analysis

The issue is NOT in the SelectItem rendering (dropdown items look fine), but in how the **selected value** is displayed in the SelectTrigger after selection.

### Potential Causes:
1. **Radix UI SelectPrimitive.ItemText behavior**: The ItemText component might be causing duplication when used with SelectValue
2. **Data duplication in localStorage**: The activeJobTypes array might contain pre-duplicated strings
3. **SelectValue rendering logic**: The SelectValue component might be displaying both the `value` prop and ItemText content

## Investigation Steps

### 1. Check localStorage Data
```javascript
// In browser console:
JSON.parse(localStorage.getItem('activeJobTypes'))
// Should show: ["Physician", "Nurse", ...] NOT ["PhysicianPhysician", ...]
```

### 2. Check Console Logs
The code already has debug logging in:
- `src/components/candidates/ResumeParser.tsx` (lines 65-72)
- `src/components/candidates/CandidateUpload.tsx` (lines 34-43)

Check browser console for:
```
=== JOB TYPES DEBUG ===
Active job types: ["Physician", ...]
```

If you see duplicated strings here, the issue is in the data source.

### 3. Test SelectItem Rendering
Use the test component in `src/components/ui/select-fix-test.tsx` to log what's being rendered.

## Attempted Fixes

### Fix 1: Removed SelectPrimitive.ItemText wrapper ❌
**Result**: This breaks Radix UI's SelectValue functionality - SelectValue needs ItemText to know what to display.

### Fix 2: Cleaned job types in JobTypesContext ✓
**Location**: `src/contexts/JobTypesContext.tsx` (lines 12-26)
**Function**: `cleanJobType()` detects and fixes duplicated strings like "PhysicianPhysician" -> "Physician"

### Fix 3: Added console logging for debugging ✓
**Locations**: 
- ResumeParser.tsx (lines 649-651)
- CandidateUpload.tsx (lines 344-346)

## Next Steps for User

### Step 1: Clear Browser Cache
1. Open DevTools (F12)
2. Go to Application tab
3. Click "Clear storage" or manually delete:
   - localStorage → activeJobTypes
4. Refresh the page

### Step 2: Check Console Logs
1. Open DevTools Console
2. Look for "=== JOB TYPES DEBUG ===" logs
3. Check if job types are already duplicated in the array
4. Share the console output

### Step 3: Test with Fresh Data
1. Go to Admin → Job Types Management
2. Clear all active job types
3. Add one job type (e.g., "Physician")
4. Go back to Resume Parser
5. Select that job type
6. Check if it still duplicates

## Technical Details

### How Radix UI Select Works:
```tsx
<Select value={selectedValue} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue /> {/* Displays ItemText of selected item */}
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="physician">
      <SelectPrimitive.ItemText>Physician</SelectPrimitive.ItemText>
    </SelectItem>
  </SelectContent>
</Select>
```

When "physician" is selected:
- SelectValue automatically finds the SelectItem with `value="physician"`
- It extracts the text from SelectPrimitive.ItemText
- It displays "Physician" in the trigger

### Current Implementation:
```tsx
{activeJobTypes.map((jobType) => (
  <SelectItem key={`active-${jobType}`} value={jobType}>
    {jobType}
  </SelectItem>
))}
```

This wraps `{jobType}` in ItemText internally (in select.tsx line 129).

## Files Modified
- ✅ `src/components/ui/select.tsx` - Restored ItemText wrapper with displayName
- ✅ `src/components/ui/select-fix-test.tsx` - Added test component with logging
- ✅ `src/contexts/JobTypesContext.tsx` - Already has cleanJobType function
- ✅ `DUPLICATE_JOB_TYPE_SELECT_FIX.md` - This documentation

## Status: INVESTIGATING 🔍
Need user to check console logs and localStorage to determine if issue is in data or rendering.
