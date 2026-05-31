import type { Oo1Db, Row, SqlValue, SyncDb } from "../types";
import { migrate } from "../schema";

/**
 * Narrow a value from a sqlite-wasm result row to our SqlValue.
 * STRICT tables only produce string | number | null for our schema.
 */
const toSqlValue = (value: unknown): SqlValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  return null;
};

const toRow = (record: Record<string, unknown>): Row => {
  const row: Row = {};
  for (const key of Object.keys(record)) {
    row[key] = toSqlValue(record[key]);
  }
  return row;
};

/** Wrap a sqlite-wasm oo1 DB into the synchronous primitives. */
export const wrapDb = (db: Oo1Db): SyncDb => ({
  selectAll: (sql, bind = []) => db.selectObjects(sql, bind).map(toRow),
  run: (sql, bind = []) => {
    db.exec({ sql, bind });
  },
  tx: (ops) => {
    db.transaction(() => {
      for (const op of ops) db.exec({ sql: op.sql, bind: op.bind ?? [] });
    });
  },
});

/** Wrap + enable FK enforcement (per-connection) + apply migrations. */
export const initSyncDb = (db: Oo1Db): SyncDb => {
  const sync = wrapDb(db);
  sync.run("PRAGMA foreign_keys = ON");
  migrate(sync);
  return sync;
};
