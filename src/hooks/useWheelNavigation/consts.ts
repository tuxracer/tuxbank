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
 */
export const WHEEL_IDLE_RESET_MS = 200;
