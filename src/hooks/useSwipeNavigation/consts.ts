/**
 * Minimum horizontal pointer travel for a swipe. 56px exceeds a compact day
 * cell's width at the smallest supported viewport (390px wide gives ~50px
 * cells), so a touch swipe always crosses a cell boundary and is never
 * mistaken for a day tap.
 */
export const SWIPE_MIN_DISTANCE_PX = 56;
