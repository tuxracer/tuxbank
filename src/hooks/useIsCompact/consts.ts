/**
 * Viewport width below which the app renders the compact (small-screen) UI.
 * 639.9 keeps the media query aligned with Tailwind's `sm` breakpoint (640px):
 * `sm:` utilities apply at >= 640px, this query matches below it.
 */
export const COMPACT_MAX_WIDTH_PX = 639.9;

export const COMPACT_MEDIA_QUERY = `(max-width: ${COMPACT_MAX_WIDTH_PX}px)`;
