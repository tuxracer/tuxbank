export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "LOCKED";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, cause?: unknown) {
    super(code);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}

export const isStorageError = (error: unknown): error is StorageError =>
  error instanceof StorageError;

/** Values SQLite columns hold/return in this app (no BLOB, no bigint). */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

/** Minimal structural view of a sqlite-wasm oo1 DB handle. */
export interface Oo1Db {
  selectObjects(sql: string, bind?: SqlValue[]): Record<string, unknown>[];
  exec(opts: { sql: string; bind?: SqlValue[] }): unknown;
  transaction(callback: () => void): unknown;
}

/** Synchronous DB primitives (over an oo1 DB). */
export interface SyncDb {
  selectAll(sql: string, bind?: SqlValue[]): Row[];
  run(sql: string, bind?: SqlValue[]): void;
  tx(ops: { sql: string; bind?: SqlValue[] }[]): void;
}

/** Async DB interface the repository depends on (memory or worker). */
export interface DbConnection {
  selectAll(sql: string, bind?: SqlValue[]): Promise<Row[]>;
  run(sql: string, bind?: SqlValue[]): Promise<void>;
  tx(ops: { sql: string; bind?: SqlValue[] }[]): Promise<void>;
}

export type ConnectionStatus =
  | "connecting"
  | "ready"
  | "waiting-locked"
  | "unavailable";
