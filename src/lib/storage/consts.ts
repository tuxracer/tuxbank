import type { TransactionDirection } from "@/types";

/** OPFS database file + SAHPool VFS identity. */
export const DB_FILENAME = "/tuxbank.sqlite3";
export const VFS_NAME = "tuxbank-sahpool";
export const POOL_DIR = ".tuxbank-sahpool";

/** Single-active-tab coordination (handoff is handled by navigator.locks). */
export const LOCK_NAME = "tuxbank-db";

/** Schema version stored in PRAGMA user_version. */
export const SCHEMA_VERSION = 1;

/** Write-time normalization defaults for legacy/partial events. */
export const DEFAULT_AMOUNT = 0;
export const DEFAULT_DIRECTION: TransactionDirection = "deposit";

/** Full schema (always STRICT). Applied once when user_version is 0. */
export const SCHEMA_SQL = `
CREATE TABLE categories (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('cyan','magenta','yellow','green','orange'))
) STRICT;

CREATE TABLE events (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  date                TEXT NOT NULL,
  category_id         TEXT NOT NULL,
  amount              REAL NOT NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('deposit','withdrawal')),
  notes               TEXT,
  recurrence_freq     TEXT CHECK (recurrence_freq IN ('daily','weekly','monthly','yearly')),
  recurrence_interval INTEGER CHECK (recurrence_interval >= 1),
  recurrence_ends_on  TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK ((recurrence_freq IS NULL) = (recurrence_interval IS NULL)),
  CHECK (recurrence_ends_on IS NULL OR recurrence_freq IS NOT NULL)
) STRICT;

CREATE INDEX events_by_date ON events(date);

CREATE TABLE event_overrides (
  event_id          TEXT NOT NULL,
  occurrence_date   TEXT NOT NULL,
  cancelled         INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)),
  patch_title       TEXT,
  patch_category_id TEXT,
  patch_notes       TEXT,
  PRIMARY KEY (event_id, occurrence_date),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) STRICT;
`;

/** Column order MUST match mappers.eventToColumns(). */
export const UPSERT_EVENT_SQL = `
INSERT INTO events
  (id, title, date, category_id, amount, direction, notes,
   recurrence_freq, recurrence_interval, recurrence_ends_on, created_at, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, date=excluded.date, category_id=excluded.category_id,
  amount=excluded.amount, direction=excluded.direction, notes=excluded.notes,
  recurrence_freq=excluded.recurrence_freq, recurrence_interval=excluded.recurrence_interval,
  recurrence_ends_on=excluded.recurrence_ends_on, created_at=excluded.created_at,
  updated_at=excluded.updated_at`;

export const DELETE_OVERRIDES_SQL =
  "DELETE FROM event_overrides WHERE event_id = ?";

/** Column order MUST match mappers.overrideToColumns(). */
export const INSERT_OVERRIDE_SQL = `
INSERT INTO event_overrides
  (event_id, occurrence_date, cancelled, patch_title, patch_category_id, patch_notes)
VALUES (?,?,?,?,?,?)`;

export const UPSERT_CATEGORY_SQL = `
INSERT INTO categories (id, name, color) VALUES (?,?,?)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color`;
