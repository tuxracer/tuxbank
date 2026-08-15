import type { DisplayPreferences } from "./types";

/**
 * localStorage key holding a JSON snapshot of the resolved preferences. Purely
 * a first-paint cache: the calendar renders before IndexedDB can answer, and a
 * grid that starts Sunday-first and jumps to Monday-first is worse than one
 * frame of slightly stale truth. IndexedDB is the source of truth and
 * overwrites this on every hydrate.
 */
export const DISPLAY_PREFERENCES_CACHE_KEY = "tuxbank:display-cache";

/**
 * Pre-sync localStorage key. Its presence means this device still holds
 * device-local preferences that were never migrated into the synced settings
 * store; the migration reads it once and removes it, so absence means done.
 */
export const LEGACY_DISPLAY_PREFERENCES_KEY = "tuxbank:display-preferences";

/** Setting-row ids these preferences occupy in the synced settings store. */
export const CURRENCY_SETTING_ID = "currency";
export const WEEK_STARTS_ON_SETTING_ID = "weekStartsOn";

/** Both overrides unset: follow the locale's currency and week start. */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  currency: null,
  weekStartsOn: null,
};
