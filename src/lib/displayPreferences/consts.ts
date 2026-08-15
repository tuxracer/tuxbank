import type { DisplayPreferences } from "./types";

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
