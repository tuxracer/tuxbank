import { useSyncExternalStore } from "react";
import { COMPACT_FALLBACK_BREAKPOINT } from "./consts";

export * from "./consts";

// The compact threshold IS Tailwind's `sm` breakpoint, read from the
// --breakpoint-sm token the v4 theme emits, so this hook and the `sm:`
// utilities in class strings can never disagree (a --breakpoint-sm override
// moves both). Resolved lazily — the stylesheet may not be applied at
// module-eval time — then cached; falls back to Tailwind's default.
let mediaQuery: string | null = null;
const compactMediaQuery = (): string => {
  if (mediaQuery === null) {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue("--breakpoint-sm")
      .trim();
    mediaQuery = `(min-width: ${token || COMPACT_FALLBACK_BREAKPOINT})`;
  }
  return mediaQuery;
};

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(compactMediaQuery());
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

// Compact is "below sm": min-width keeps the boundary value itself on the
// desktop side, exactly like the sm: utilities.
const getSnapshot = () => !window.matchMedia(compactMediaQuery()).matches;

/** True below the compact breakpoint; updates live as the window resizes. */
export const useIsCompact = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot);
