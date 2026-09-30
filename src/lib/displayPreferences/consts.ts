import type { DisplayPreferences } from "./types";

/** Setting-row ids these preferences occupy in the synced settings store. */
export const CURRENCY_SETTING_ID = "currency";
export const WEEK_STARTS_ON_SETTING_ID = "weekStartsOn";
export const WEEKS_VISIBLE_SETTING_ID = "weeksVisible";

export const DISPLAY_SETTING_IDS = [
  CURRENCY_SETTING_ID,
  WEEK_STARTS_ON_SETTING_ID,
  WEEKS_VISIBLE_SETTING_ID,
] as const;

/**
 * Every override unset: follow the locale's currency and week start, and show
 * the whole month.
 */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  currency: null,
  weekStartsOn: null,
  weeksVisible: null,
};
