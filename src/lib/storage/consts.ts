/** IndexedDB database + object store identity. Fresh DB name = fresh start. */
export const DB_NAME = "tuxbank";
export const DB_VERSION = 3;
export const STORE = "events";
export const CATEGORY_STORE = "categories";
export const TOMBSTONE_STORE = "tombstones";
export const SYNC_META_STORE = "syncMeta";
/** Pending local changes awaiting a sync push (added in DB v2). */
export const OUTBOX_STORE = "outbox";
/**
 * User settings, one row per setting (added in DB v3). A store rather than
 * syncMeta keys because settings sync: they carry an `updatedAt` and ride the
 * same tombstone/outbox machinery as events and categories.
 */
export const SETTINGS_STORE = "settings";

/**
 * Legacy (pre-server-watermark) sync-cursor key. Never written anymore; its
 * presence still marks a device as having synced so the upgrade does not
 * re-trigger the first-sign-in conflict prompt.
 */
export const SYNC_CURSOR_KEY = "cursor";

/**
 * Key for the sync pull watermark in the syncMeta store: the highest
 * server-assigned upload stamp this device has pulled through.
 */
export const SYNC_SERVER_CURSOR_KEY = "serverCursor";

/**
 * Key for the cached data-encryption key (DEK) held in the syncMeta store.
 * Persisting the raw key bytes lets a signed-in account resume unlocked across
 * reloads and restarts instead of re-deriving it from the password each time.
 */
export const DEK_KEY = "dek";

/**
 * How long deleteDatabase waits for other tabs to release their connections
 * before giving up with BLOCKED instead of hanging on a pending deleteDB.
 */
export const DELETE_BLOCKED_TIMEOUT_MS = 3_000;

/** JSON backup file identity + schema version. */
export const BACKUP_APP = "tuxbank";
export const BACKUP_SCHEMA_VERSION = 2;

/**
 * First schema whose files carry a `settings` array. Below it a backup is
 * silent about settings rather than asserting there are none, so importing an
 * older file leaves the account's settings untouched instead of wiping them.
 */
export const SETTINGS_BACKUP_SCHEMA_VERSION = 2;
