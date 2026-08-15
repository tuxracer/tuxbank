import { resetDisplayPreferencesSnapshot } from "./index";

/**
 * Test-only: forget the in-memory snapshot so each test starts from
 * "everything automatic". The rows themselves live in IndexedDB and are
 * cleared by `resetDbForTests`. Imported only by test files.
 */
export const resetDisplayPreferencesForTests = (): void => {
  resetDisplayPreferencesSnapshot();
};
