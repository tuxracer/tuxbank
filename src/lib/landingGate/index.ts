import { DEVICE_LINK_HASH_PREFIX } from "@/lib/deviceLink";
import { LANDING_DISMISSED_KEY } from "./consts";

export * from "./consts";

const hasDismissedLanding = (): boolean => {
  try {
    return window.localStorage.getItem(LANDING_DISMISSED_KEY) !== null;
  } catch {
    // Web storage can be unavailable (private mode, blocked cookies). Treat
    // that as a first visit; the landing page itself needs no storage.
    return false;
  }
};

/** Persist that this browser has entered the app, so future visits skip the landing page. */
export const markLandingDismissed = (): void => {
  try {
    window.localStorage.setItem(LANDING_DISMISSED_KEY, "1");
  } catch {
    // Best effort: without storage the landing page simply returns next visit.
  }
};

/**
 * Whether this visit starts on the landing page. Repeat visitors skip it, and
 * so does a device-link sign-in: the QR flow opens on a brand-new browser
 * where the TOTP prompt must be visible immediately, not hidden behind a
 * marketing page.
 */
export const shouldShowLanding = (): boolean =>
  !hasDismissedLanding() &&
  !window.location.hash.startsWith(DEVICE_LINK_HASH_PREFIX);
