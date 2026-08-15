import { isArray, isBoolean, isNumber, isPlainObject, isString } from "remeda";
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory } from "@/types";
import { BACKUP_APP } from "./consts";

/** Every backup schema this build can read. */
export type BackupSchemaVersion = 1 | 2;

const BACKUP_SCHEMA_VERSIONS: readonly BackupSchemaVersion[] = [1, 2];

export const isBackupSchemaVersion = (
  value: unknown,
): value is BackupSchemaVersion =>
  isNumber(value) &&
  BACKUP_SCHEMA_VERSIONS.includes(value as BackupSchemaVersion);

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
  settings: number;
  schemaVersion: number;
}

/**
 * Shape of a tuxbank JSON backup file. Schema 2 added `settings`; schema 1
 * files still import, and are read as saying nothing about settings rather
 * than as saying there are none (see `SETTINGS_BACKUP_SCHEMA_VERSION`).
 */
export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: BackupSchemaVersion;
  exportedAt: string;
  events: CalendarEvent[];
  categories: Category[];
  settings?: SettingRow[];
}

export const isBackupFile = (value: unknown): value is BackupFile =>
  isPlainObject(value) &&
  value.app === BACKUP_APP &&
  isBackupSchemaVersion(value.schemaVersion) &&
  isString(value.exportedAt) &&
  isArray(value.events) &&
  value.events.every(isCalendarEvent) &&
  isArray(value.categories) &&
  value.categories.every(isCategory) &&
  (value.settings === undefined ||
    (isArray(value.settings) && value.settings.every(isSettingRow)));

export type TombstoneType = "event" | "category" | "setting";

const TOMBSTONE_TYPES: readonly TombstoneType[] = [
  "event",
  "category",
  "setting",
];

export const isTombstoneType = (value: unknown): value is TombstoneType =>
  isString(value) && TOMBSTONE_TYPES.includes(value as TombstoneType);

/**
 * What a single setting can hold. Deliberately narrow: settings are scalar
 * user choices, and a tight guard keeps a corrupt synced row from reaching the
 * consumer as a half-valid object. Widen it only when a setting needs more.
 */
export type SettingValue = string | number | boolean | null;

export const isSettingValue = (value: unknown): value is SettingValue =>
  value === null || isString(value) || isNumber(value) || isBoolean(value);

/**
 * One synced user setting, keyed by a stable string id (`currency`, …). The
 * envelope is all this layer validates; what counts as a legal `value` for a
 * given id belongs to the module that owns the setting (see
 * `src/lib/displayPreferences`), which falls back to its default when a synced
 * row carries something it does not recognize.
 *
 * An absent row and a row whose `value` is null are different states: absent
 * means the setting was never chosen on any device, null means it was
 * explicitly set back to "automatic" and that choice must sync.
 */
export interface SettingRow {
  id: string;
  value: SettingValue;
  updatedAt: string;
}

export const isSettingRow = (value: unknown): value is SettingRow =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.updatedAt) &&
  isSettingValue(value.value);

/** A record of a deleted row, kept so the deletion can be synced. */
export interface Tombstone {
  id: string;
  type: TombstoneType;
  updatedAt: string;
}

export const isTombstone = (value: unknown): value is Tombstone =>
  isPlainObject(value) &&
  isString(value.id) &&
  isTombstoneType(value.type) &&
  isString(value.updatedAt);

/**
 * A pending local change awaiting a sync push. Every local write enqueues an
 * entry (remote-applied writes do not), and a successful push removes it only
 * while its updatedAt still matches, so an edit made mid-sync survives to be
 * pushed by the next sync instead of being skipped by cursor math.
 */
export interface OutboxEntry {
  id: string;
  type: TombstoneType;
  updatedAt: string;
}

export const isOutboxEntry = (value: unknown): value is OutboxEntry =>
  isTombstone(value);
