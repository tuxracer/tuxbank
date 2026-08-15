/**
 * Accumulated vertical wheel travel that triggers a month change. 60px lets a
 * single mouse-wheel notch navigate (Chrome reports 100px per notch, Firefox 3
 * lines) while staying above the couple-of-pixel drift a resting trackpad
 * touch produces.
 */
export const WHEEL_NAVIGATE_THRESHOLD_PX = 60;

/**
 * Pixels per line for `deltaMode: DOM_DELTA_LINE` events (Firefox). 20px puts
 * a standard 3-line wheel notch exactly at the navigation threshold.
 */
export const WHEEL_LINE_HEIGHT_PX = 20;

/**
 * A pause in the wheel-event stream at least this long marks the start of a
 * new gesture. Trackpad momentum keeps emitting events at ~16ms intervals
 * after the fingers lift, so everything after a navigation is swallowed until
 * the stream goes quiet; 200ms outlasts the stuttering tail of that momentum.
 * (A fresh flick inside the tail re-arms sooner: see
 * WHEEL_FLICK_RISE_FACTOR.)
 */
export const WHEEL_IDLE_RESET_MS = 200;

/**
 * While the post-navigation momentum tail is being swallowed, a delta at
 * least this multiple of its predecessor is a fresh flick, not momentum:
 * momentum only ever decays, and its jitter never doubles an adjacent event.
 * This is what lets quick successive flicks chain through months without
 * waiting out WHEEL_IDLE_RESET_MS between them. Applied only after the tail
 * has started decaying, so the still-rising finger travel of the flick that
 * just navigated is never mistaken for a second one.
 */
export const WHEEL_FLICK_RISE_FACTOR = 2;
