import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DbConnection } from "../types";
import { initSyncDb } from "./sqliteDb";

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
  };
};
