import type { SyncDb } from "./types";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./consts";

/** Create the schema once. Idempotent: keyed on PRAGMA user_version. */
export const migrate = (db: SyncDb): void => {
  const rows = db.selectAll("PRAGMA user_version");
  const current =
    typeof rows[0]?.user_version === "number" ? rows[0].user_version : 0;
  if (current >= SCHEMA_VERSION) return;
  db.run(SCHEMA_SQL);
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
};
