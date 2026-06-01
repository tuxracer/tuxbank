import { isString } from "remeda";

export type StorageErrorCode =
  | "UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "VERSION_ERROR"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "LOCKED"
  | "IMPORT_INVALID"
  | "EXPORT_FAILED";

const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = [
  "UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "BLOCKED",
  "VERSION_ERROR",
  "READ_FAILED",
  "WRITE_FAILED",
  "LOCKED",
  "IMPORT_INVALID",
  "EXPORT_FAILED",
];

export const isStorageErrorCode = (value: unknown): value is StorageErrorCode =>
  isString(value) && STORAGE_ERROR_CODES.includes(value as StorageErrorCode);

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

/** Summary of a candidate import file, shown before the destructive swap. */
export interface ImportPreview {
  events: number;
  categories: number;
  schemaVersion: number;
}

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
  /** Serialize the whole database to bytes (always ArrayBuffer-backed). */
  exportDb(): Promise<Uint8Array<ArrayBuffer>>;
  /** Validate candidate bytes WITHOUT touching the live database. */
  validateImport(bytes: Uint8Array): Promise<ImportPreview>;
  /** Replace the live database with the (validated) bytes. */
  commitImport(bytes: Uint8Array): Promise<void>;
}

export type ConnectionStatus =
  | "connecting"
  | "ready"
  | "waiting-locked"
  | "unavailable";
