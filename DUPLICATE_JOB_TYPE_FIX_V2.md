# Duplicate Job Type Display Fix - Version 2

## Problem
When selecting a job type in Resume Parser or Manual Entry, the selected value shows duplicated text (e.g., "Physician ExecutivePhysician Executive").

## Root Cause
The issue was in the `SelectItem` component in `src/components/ui/select.tsx`. The component was using `SelectPrimitive.ItemText` wrapper which was causing the text to be rendered twice when used with Radix UI's Select component.

## Solution Applied
Removed the `SelectPrimitive.ItemText` wrapper from the `SelectItem` component and render children directly.

### Before (Line 129):
```tsx
<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
```

### After (Line 129):
```tsx
{children}
```

## Testing Instructions
1. Go to Resume Parser screen
2. Upload a resume
3. Select a job type from the dropdown
4. Verify the selected value displays correctly (e.g., "Physician Executive" not "Physician ExecutivePhysician Executive")
5. Test both Active Jobs and All Job Types sections
6. Also test Manual Entry to ensure it works there too

## Files Modified
- `src/components/ui/select.tsx` - Removed SelectPrimitive.ItemText wrapper

## Note
This fix removes the ItemText wrapper entirely. If this causes issues with the Select component not displaying values correctly, we may need to investigate using the `textValue` prop on SelectItem instead.