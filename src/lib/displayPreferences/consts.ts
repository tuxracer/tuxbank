import type { DisplayPreferences } from "./types";

/** localStorage key holding the JSON-serialized display preferences. */
export const DISPLAY_PREFERENCES_KEY = "tuxbank:display-preferences";

/** Both overrides unset: follow the locale's currency and week start. */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  currency: null,
  weekStartsOn: null,
};
