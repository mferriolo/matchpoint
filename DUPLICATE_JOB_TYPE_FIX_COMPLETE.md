# Duplicate Job Type Display - FIX COMPLETE ✅

## Issue
When selecting an active job type from the dropdown, it displayed "PhysicianPhysician" instead of just "Physician".

## Root Cause
The issue was in **ResumeParser.tsx** (line 663), NOT in CandidateUpload.tsx:
- A `<span className="font-medium">` wrapper inside the SelectItem was causing the text to render twice
- The Radix UI SelectItem component already wraps children in `SelectPrimitive.ItemText`
- Adding an additional span caused duplication in the display

## Files Fixed
1. ✅ **src/components/candidates/ResumeParser.tsx** (line 661-665)
   - Removed `<span className="font-medium">{jobType}</span>`
   - Changed to just `{jobType}`

2. ✅ **src/components/candidates/CandidateUpload.tsx** (already fixed)
   - This file was already correct

## The Fix
**Before:**
```tsx
{activeJobTypes.map((jobType) => (
  <SelectItem key={`active-${jobType}`} value={jobType}>
    <span className="font-medium">{jobType}</span>  {/* ← Caused duplication */}
  </SelectItem>
))}
```

**After:**
```tsx
{activeJobTypes.map((jobType) => (
  <SelectItem key={`active-${jobType}`} value={jobType}>
    {jobType}  {/* ← Clean, no duplication */}
  </SelectItem>
))}
```

## Testing
1. Open "Add Candidate" dialog
2. Select "AI Resume Parser" mode
3. Upload a resume and parse it
4. Open the Job Type dropdown
5. Select "Physician" from Active Job Types
6. It should now show "Physician" not "PhysicianPhysician" ✅

## Why This Happened
The Radix UI Select component structure:
- `SelectItem` → `SelectPrimitive.ItemText` → children
- When we added `<span>`, it became: `SelectItem` → `SelectPrimitive.ItemText` → `<span>` → text
- This caused the text to be rendered twice in the trigger display

## Prevention
- Don't wrap SelectItem children in additional elements unless necessary
- Keep SelectItem children simple: just text or simple inline elements
- The SelectItem component handles styling internally
