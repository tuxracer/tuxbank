import { createMemoryConnection } from "./memoryConnection";
import { setTestConnection } from "./index";

/**
 * Test-only: install a fresh in-memory connection so each test starts clean.
 * Imported only by test files — never by browser code — so the
 * @sqlite.org/sqlite-wasm package (pulled in via memoryConnection) stays out of
 * the production bundle.
 */
export const resetDbForTests = async (): Promise<void> => {
  setTestConnection(await createMemoryConnection());
};
