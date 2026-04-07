import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Helper to clean duplicated text - EXPORTED for use in other components
export const cleanText = (text: string): string => {
  if (!text) return text;
  const halfLength = Math.floor(text.length / 2);
  const firstHalf = text.substring(0, halfLength);
  const secondHalf = text.substring(halfLength);
  if (firstHalf === secondHalf && firstHalf.length > 0) {
    return firstHalf;
  }
  return text;
};


export const CleanSelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  const cleanedText = typeof children === 'string' ? cleanText(children) : children;
  
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent/50 focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 transition-colors",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{cleanedText}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
CleanSelectItem.displayName = "CleanSelectItem";
