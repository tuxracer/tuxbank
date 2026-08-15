import { isBoolean, isPlainObject, isString } from "remeda";

/** A row as pushed to Supabase: client routing metadata plus ciphertext. */
export interface PushRow {
  id: string;
  updated_at: string;
  deleted: boolean;
  nonce: string;
  ciphertext: string;
}

/**
 * A row as pulled from Supabase: a PushRow plus the server-assigned upload
 * stamp. The pull cursor lives in this stamp's domain (the server's clock, set
 * on every upsert), never in the client-stamped updated_at, so a row uploaded
 * late — an offline edit, a slow device, a skewed clock — is still pulled.
 */
export interface RemoteRow extends PushRow {
  server_updated_at: string;
}

export const isRemoteRow = (value: unknown): value is RemoteRow =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.updated_at) &&
  isString(value.server_updated_at) &&
  isBoolean(value.deleted) &&
  isString(value.nonce) &&
  isString(value.ciphertext);

/** The network seam. The real implementation wraps Supabase; tests fake it. */
export interface SyncRemote {
  pull(table: string, since: string): Promise<RemoteRow[]>;
  push(table: string, rows: PushRow[]): Promise<void>;
  /** How many live (non-deleted) rows the table holds. Transfers no ciphertext. */
  count(table: string): Promise<number>;
  /**
   * Erase every row the account holds in the table, tombstones included. Not
   * part of syncing: this is the account-deletion path, where rows are removed
   * outright rather than marked deleted for other devices to pull.
   */
  purge(table: string): Promise<void>;
}

/** How many events each side holds when a first sync finds data on both. */
export interface SignInConflict {
  local: number;
  remote: number;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  /**
   * Remote rows that failed to decrypt or validate and were left in place.
   * They never abort the sync (one poison row must not brick the account) and
   * are retried only when the row is next re-uploaded.
   */
  skipped: number;
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
