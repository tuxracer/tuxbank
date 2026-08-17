import { track, type BeforeSend } from "@vercel/analytics";
import { isTrackingOptedOut } from "privacy-signals";

import { DEVICE_LINK_HASH_PREFIX } from "@/lib/deviceLink";
import type { AnalyticsEventName, AnalyticsEventProps } from "./types";

export * from "./types";

/**
 * True only when the privacy signals are readable and neither Do Not Track
 * nor Global Privacy Control is set. An unreadable signal counts as an
 * opt-out, so anything short of an explicit "no objection" stays silent.
 */
const trackingAllowed = (): boolean => isTrackingOptedOut() === false;

/** Every UTM tag shares this prefix, whatever the specific tag. */
const UTM_PREFIX = "utm_";

/**
 * The utm_* params the page booted with, captured before `stripUtmParams`
 * cleans the address bar after first paint. The analytics script is fetched
 * async and reads the live URL only once it runs, so by then the tags are
 * usually gone already; `analyticsBeforeSend` re-attaches these to each event
 * instead, which keeps attribution out of that race entirely.
 */
const BOOT_UTM_PARAMS = [...new URLSearchParams(window.location.search)].filter(
  ([name]) => name.startsWith(UTM_PREFIX),
);

/**
 * Passed to `<Analytics beforeSend>`: returning `null` cancels the event, so
 * an opted-out visitor sends no page views. Re-checked per event so a signal
 * that changes mid-session takes effect immediately.
 *
 * An event whose URL still carries a device-link fragment is dropped outright.
 * That fragment is password-equivalent, and `event.url` comes from the live
 * address bar: SyncProvider strips it on mount, before this script is even
 * fetched, but "the secret is gone by then" is an ordering argument, and one
 * reordered mount should not be what decides whether it is uploaded.
 *
 * Events that survive get the boot-time utm_* params folded back into their
 * URL, since the address bar they are read from has been stripped by then.
 */
export const analyticsBeforeSend: BeforeSend = (event) => {
  if (!trackingAllowed()) return null;
  if (event.url.includes(DEVICE_LINK_HASH_PREFIX)) return null;
  if (BOOT_UTM_PARAMS.length === 0) return event;
  const url = new URL(event.url, window.location.origin);
  for (const [name, value] of BOOT_UTM_PARAMS) {
    if (!url.searchParams.has(name)) url.searchParams.set(name, value);
  }
  return { ...event, url: url.toString() };
};

/**
 * Removes the utm_* params from the address bar in place, leaving the path,
 * any other params, and the hash alone. Called once after first paint so a
 * scanned QR's tracking tags do not sit in the URL all session. Stripping
 * this early loses no attribution: the tags were captured into
 * BOOT_UTM_PARAMS at module load and re-attach per event above.
 */
export const stripUtmParams = (): void => {
  const url = new URL(window.location.href);
  const utmNames = [...url.searchParams.keys()].filter((name) =>
    name.startsWith(UTM_PREFIX),
  );
  if (utmNames.length === 0) return;
  for (const name of utmNames) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url);
};

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
