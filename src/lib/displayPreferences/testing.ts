import { LEGACY_DISPLAY_PREFERENCES_KEY } from "./consts";
import { resetDisplayPreferencesSnapshot } from "./index";

/**
 * Test-only: forget the in-memory snapshot and any un-migrated legacy key so
 * each test starts from "everything automatic". The rows themselves live in
 * IndexedDB and are cleared by `resetDbForTests`. Imported only by test files.
 */
export const resetDisplayPreferencesForTests = (): void => {
  window.localStorage.removeItem(LEGACY_DISPLAY_PREFERENCES_KEY);
  resetDisplayPreferencesSnapshot();
};
