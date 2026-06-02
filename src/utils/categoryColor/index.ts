import type { CategoryColor } from "@/types";

/**
 * CSS var holding the solid accent for a category color. Defined in
 * globals.css with a light value in `:root` and a dark override in the
 * `prefers-color-scheme: dark` media query, so it themes automatically.
 */
export const catColorVar = (color: CategoryColor): string =>
  `var(--cat-${color})`;

/**
 * CSS var for the glow/shadow color of a category color. Same neon hue as the
 * accent in dark mode; `transparent` in light mode so glows disappear.
 */
export const catGlowVar = (color: CategoryColor): string =>
  `var(--cat-${color}-glow)`;
