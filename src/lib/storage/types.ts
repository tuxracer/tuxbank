import { isArray, isPlainObject, isString } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory } from "@/types";
import { BACKUP_APP, BACKUP_SCHEMA_VERSION } from "./consts";

export type StorageErrorCode =
  | "UNAVAILABLE"
  | "OPEN_FAILED"
  | "QUOTA_EXCEEDED"
  | "BLOCKED"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "IMPORT_INVALID"
  | "EXPORT_FAILED";

const STORAGE_ERROR_CODES: readonly StorageErrorCode[] = [
  "UNAVAILABLE",
  "OPEN_FAILED",
  "QUOTA_EXCEEDED",
  "BLOCKED",
  "READ_FAILED",
  "WRITE_FAILED",
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

/** Summary of a candidate import file, shown before the destructive swap. */
export interface ImportPreview {
  events: number;
  categories: number;
  schemaVersion: number;
}

/** Shape of a tuxbank JSON backup file. */
export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: typeof BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  events: CalendarEvent[];
  categories: Category[];
}

export const isBackupFile = (value: unknown): value is BackupFile =>
  isPlainObject(value) &&
  value.app === BACKUP_APP &&
  value.schemaVersion === BACKUP_SCHEMA_VERSION &&
  isString(value.exportedAt) &&
  isArray(value.events) &&
  value.events.every(isCalendarEvent) &&
  isArray(value.categories) &&
  value.categories.every(isCategory);

export type TombstoneType = "event" | "category";

/** A record of a deleted row, kept so the deletion can be synced. */
export interface Tombstone {
  id: string;
  type: TombstoneType;
  updatedAt: string;
}

export const isTombstone = (value: unknown): value is Tombstone =>
  isPlainObject(value) &&
  isString(value.id) &&
  (value.type === "event" || value.type === "category") &&
  isString(value.updatedAt);
