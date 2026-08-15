import type { DisplayPreferences } from "./types";

/** Setting-row ids these preferences occupy in the synced settings store. */
export const CURRENCY_SETTING_ID = "currency";
export const WEEK_STARTS_ON_SETTING_ID = "weekStartsOn";

/** Both overrides unset: follow the locale's currency and week start. */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  currency: null,
  weekStartsOn: null,
};
