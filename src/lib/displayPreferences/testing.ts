import {
  DISPLAY_PREFERENCES_CACHE_KEY,
  LEGACY_DISPLAY_PREFERENCES_KEY,
} from "./consts";
import { resetDisplayPreferencesCache } from "./index";

/**
 * Test-only: clear the first-paint cache, the un-migrated legacy key, and the
 * module's snapshot cache so each test starts from "everything automatic".
 * The synced rows themselves live in IndexedDB and are cleared by
 * `resetDbForTests`. Imported only by test files.
 */
export const resetDisplayPreferencesForTests = (): void => {
  window.localStorage.removeItem(DISPLAY_PREFERENCES_CACHE_KEY);
  window.localStorage.removeItem(LEGACY_DISPLAY_PREFERENCES_KEY);
  resetDisplayPreferencesCache();
};
