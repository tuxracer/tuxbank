/** IndexedDB database + object store identity. Fresh DB name = fresh start. */
export const DB_NAME = "tuxbank";
export const DB_VERSION = 1;
export const STORE = "events";
export const CATEGORY_STORE = "categories";
export const TOMBSTONE_STORE = "tombstones";
export const SYNC_META_STORE = "syncMeta";

/** Key for the single sync-cursor value held in the syncMeta store. */
export const SYNC_CURSOR_KEY = "cursor";

/**
 * Key for the cached data-encryption key (DEK) held in the syncMeta store.
 * Persisting the raw key bytes lets a signed-in account resume unlocked across
 * reloads and restarts instead of re-deriving it from the password each time.
 */
export const DEK_KEY = "dek";

/** JSON backup file identity + schema version. */
export const BACKUP_APP = "tuxbank";
export const BACKUP_SCHEMA_VERSION = 1;
