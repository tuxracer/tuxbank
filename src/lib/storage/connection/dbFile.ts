import { isNumber, isString } from "remeda";
import { StorageError } from "../types";
import type { ImportPreview } from "../types";
import { SCHEMA_VERSION } from "../consts";

// Type-only: erased at compile time, so the sqlite-wasm package is NEVER bundled
// here. This file is reachable from the DB worker, which must not statically
// import the package (Turbopack can't bundle its Worker1 dynamic import).
type Sqlite3 = Awaited<
  ReturnType<(typeof import("@sqlite.org/sqlite-wasm"))["default"]>
>;

const SQLITE_HEADER = "SQLite format 3\u0000";
const EXPECTED_TABLES = ["categories", "events", "event_overrides"] as const;

const hasSqliteHeader = (bytes: Uint8Array): boolean => {
  if (bytes.length < SQLITE_HEADER.length) return false;
  for (let i = 0; i < SQLITE_HEADER.length; i++) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false;
  }
  return true;
};

/** Serialize an open DB (by pointer) to bytes. */
export const exportBytes = (
  sqlite3: Sqlite3,
  dbPointer: number | undefined,
): Uint8Array<ArrayBuffer> => {
  if (dbPointer === undefined) throw new StorageError("EXPORT_FAILED", "no-db");
  return sqlite3.capi.sqlite3_js_db_export(dbPointer);
};

/** Load bytes into an already-open DB (by pointer), replacing its contents. */
export const deserializeInto = (
  sqlite3: Sqlite3,
  dbPointer: number | undefined,
  bytes: Uint8Array,
): void => {
  if (dbPointer === undefined)
    throw new StorageError("IMPORT_INVALID", "no-db");
  const dataPtr = sqlite3.wasm.allocFromTypedArray(bytes);
  const rc = sqlite3.capi.sqlite3_deserialize(
    dbPointer,
    "main",
    dataPtr,
    bytes.byteLength,
    bytes.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc !== sqlite3.capi.SQLITE_OK) {
    throw new StorageError("IMPORT_INVALID", `deserialize-rc-${rc}`);
  }
};

/**
 * Verify candidate bytes are a compatible tuxbank database by loading them into
 * a throwaway in-memory DB. Throws StorageError("IMPORT_INVALID") on any
 * mismatch. Never touches a live database.
 */
export const validateBytes = (
  sqlite3: Sqlite3,
  bytes: Uint8Array,
): ImportPreview => {
  if (!hasSqliteHeader(bytes)) {
    throw new StorageError("IMPORT_INVALID", "bad-header");
  }
  const tmp = new sqlite3.oo1.DB(":memory:", "c");
  try {
    deserializeInto(sqlite3, tmp.pointer, bytes);

    const scalar = (sql: string): unknown => {
      const rows = tmp.selectObjects(sql);
      const row = rows[0];
      if (!row) return undefined;
      const keys = Object.keys(row);
      return keys.length ? row[keys[0]] : undefined;
    };

    if (scalar("PRAGMA integrity_check") !== "ok") {
      throw new StorageError("IMPORT_INVALID", "integrity");
    }

    const tableNames = new Set(
      tmp
        .selectObjects("SELECT name FROM sqlite_master WHERE type='table'")
        .map((r) => r.name)
        .filter(isString),
    );
    for (const table of EXPECTED_TABLES) {
      if (!tableNames.has(table)) {
        throw new StorageError("IMPORT_INVALID", `missing-table-${table}`);
      }
    }

    const version = scalar("PRAGMA user_version");
    if (!isNumber(version) || version !== SCHEMA_VERSION) {
      throw new StorageError("IMPORT_INVALID", `version-${String(version)}`);
    }

    const count = (table: string): number => {
      const value = scalar(`SELECT count(*) AS n FROM ${table}`);
      return isNumber(value) ? value : 0;
    };

    return {
      events: count("events"),
      categories: count("categories"),
      schemaVersion: version,
    };
  } finally {
    tmp.close();
  }
};
