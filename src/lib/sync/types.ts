import { isBoolean, isPlainObject, isString } from "remeda";

/** A row as it travels to and from Supabase: routing metadata plus ciphertext. */
export interface RemoteRow {
  id: string;
  updated_at: string;
  deleted: boolean;
  nonce: string;
  ciphertext: string;
}

export const isRemoteRow = (value: unknown): value is RemoteRow =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.updated_at) &&
  isBoolean(value.deleted) &&
  isString(value.nonce) &&
  isString(value.ciphertext);

/** The network seam. The real implementation wraps Supabase; tests fake it. */
export interface SyncRemote {
  pull(table: string, since: string): Promise<RemoteRow[]>;
  push(table: string, rows: RemoteRow[]): Promise<void>;
  /** How many live (non-deleted) rows the table holds. Transfers no ciphertext. */
  count(table: string): Promise<number>;
}

/** How many events each side holds when a first sync finds data on both. */
export interface SignInConflict {
  local: number;
  remote: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  cursor: string;
}

export type SyncErrorCode =
  | "DECRYPT_INVALID"
  | "REMOTE_FAILED"
  | "NOT_CONFIGURED";

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  constructor(code: SyncErrorCode, cause?: unknown) {
    super(code);
    this.name = "SyncError";
    this.code = code;
    this.cause = cause;
  }
}

export const isSyncError = (error: unknown): error is SyncError =>
  error instanceof SyncError;
