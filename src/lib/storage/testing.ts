import { IDBFactory } from "fake-indexeddb";
import { resetDbCache } from "./index";

/**
 * Test-only: swap in a fresh in-memory IndexedDB and drop the cached
 * connection so each test starts from an empty database. Imported only by
 * test files — never by browser code — so fake-indexeddb stays out of the
 * production bundle.
 */
export const resetDbForTests = async (): Promise<void> => {
  globalThis.indexedDB = new IDBFactory();
  resetDbCache();
};
