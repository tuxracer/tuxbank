import { DISPLAY_PREFERENCES_KEY } from "./consts";
import { resetDisplayPreferencesCache } from "./index";

/**
 * Test-only: clear the stored preferences and the module's snapshot cache so
 * each test starts from "everything automatic". Imported only by test files.
 */
export const resetDisplayPreferencesForTests = (): void => {
  window.localStorage.removeItem(DISPLAY_PREFERENCES_KEY);
  resetDisplayPreferencesCache();
};
