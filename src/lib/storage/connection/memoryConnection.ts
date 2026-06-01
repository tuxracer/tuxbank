import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbConnection } from "../types";
import { initSyncDb } from "./sqliteDb";
import { exportBytes, validateBytes, deserializeInto } from "./dbFile";

/** Same wasm engine as production, in-memory (no OPFS/worker). Node + tests. */
export const createMemoryConnection = async (): Promise<DbConnection> => {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(":memory:", "c");
  const sync = initSyncDb(db);
  return {
    selectAll: (sql, bind = []) => {
      try {
        return Promise.resolve(sync.selectAll(sql, bind));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    run: (sql, bind = []) => {
      try {
        sync.run(sql, bind);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    tx: (ops) => {
      try {
        sync.tx(ops);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
    exportDb: () => {
      try {
        return Promise.resolve(exportBytes(sqlite3, db.pointer));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    validateImport: (bytes) => {
      try {
        return Promise.resolve(validateBytes(sqlite3, bytes));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    commitImport: (bytes) => {
      try {
        validateBytes(sqlite3, bytes); // throws IMPORT_INVALID before any swap
        deserializeInto(sqlite3, db.pointer, bytes);
        sync.run("PRAGMA foreign_keys = ON"); // re-assert connection pragma
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
};
