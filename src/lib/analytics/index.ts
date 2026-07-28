import { track, type BeforeSend } from "@vercel/analytics";
import { isTrackingOptedOut } from "privacy-signals";

import type { AnalyticsEventName, AnalyticsEventProps } from "./types";

export * from "./types";

/**
 * True only when the privacy signals are readable and neither Do Not Track
 * nor Global Privacy Control is set. An unreadable signal counts as an
 * opt-out, so anything short of an explicit "no objection" stays silent.
 */
const trackingAllowed = (): boolean => isTrackingOptedOut() === false;

/**
 * Passed to `<Analytics beforeSend>`: returning `null` cancels the event, so
 * an opted-out visitor sends no page views. Re-checked per event so a signal
 * that changes mid-session takes effect immediately.
 */
export const analyticsBeforeSend: BeforeSend = (event) =>
  trackingAllowed() ? event : null;

/**
 * Records a product event. Drops it when the visitor has opted out, before it
 * ever reaches the analytics queue. No-ops when the analytics script is absent
 * (local dev, tests, blocked script).
 */
export const trackEvent = (
  name: AnalyticsEventName,
  props?: AnalyticsEventProps,
): void => {
  if (!trackingAllowed()) return;
  track(name, props);
};
