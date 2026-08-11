import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A native <select> that draws our chevron instead of the browser's.
 *
 * The UA mark is pinned a few pixels off the right edge and ignores the
 * element's `padding-right` (widening it only pushes the value text left), so
 * the chevron crowds the border in a way nothing else in a panel does.
 * `appearance-none` drops it, and the span below paints the same ▾ the toolbar
 * uses elsewhere on the box's own 10px inset. The element stays a real
 * <select>, so it keeps the OS picker on mobile and works with
 * react-hook-form's `register()`.
 *
 * Like `Button` and `Input`, this owns the 32px box (height, border, padding)
 * so call sites only add the cyberpunk voice (`cy-btn`) and the type size.
 * Focus is left to the browser's own outline, which `.cy-btn:focus-visible`
 * replaces with the flat cyan edge every other control focuses in.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative inline-flex">
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-6 pl-2.5 text-sm disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-[color:var(--cy-text)]">
        ▾
      </span>
    </span>
  );
}

export { NativeSelect };
