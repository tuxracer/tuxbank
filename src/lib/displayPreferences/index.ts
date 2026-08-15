import { getAllSettings, putSetting, type SettingValue } from "@/lib/storage";
import { subscribeToDataChanges } from "@/lib/tabSync";
import {
  CURRENCY_SETTING_ID,
  DEFAULT_DISPLAY_PREFERENCES,
  LEGACY_DISPLAY_PREFERENCES_KEY,
  WEEK_STARTS_ON_SETTING_ID,
} from "./consts";
import {
  isCurrencyCode,
  isDisplayPreferences,
  isWeekStartDay,
  type DisplayPreferences,
} from "./types";

export * from "./consts";
export * from "./types";

// The snapshot. IndexedDB is the only source of truth; this is the in-memory
// copy of it, kept identity-stable between writes because useSyncExternalStore
// compares snapshots by reference. Nothing reads it before the app's initial
// load has hydrated it (see CalendarContext's `loaded` gate).
let snapshot: DisplayPreferences = DEFAULT_DISPLAY_PREFERENCES;
const listeners = new Set<() => void>();
let unsubscribeFromData: (() => void) | null = null;

/**
 * A hydrate must never publish rows older than a write the user has already
 * seen applied. Two windows can do that: a hydrate starting while a write is
 * mid-commit, and a hydrate whose read was already in flight when the write
 * landed. `pendingWrites` closes the first, the `writeGeneration` stamp closes
 * the second, and either way the hydrate re-runs once the store goes quiet.
 */
let pendingWrites = 0;
let writeGeneration = 0;
let hydrateDeferred = false;

const runDeferredHydrate = (): void => {
  if (pendingWrites > 0 || !hydrateDeferred) return;
  hydrateDeferred = false;
  void hydrateDisplayPreferences();
};

const emit = (): void => {
  for (const listener of listeners) listener();
};

/** The pre-sync localStorage blob, if this device still holds an un-migrated one. */
const readLegacyPreferences = (): DisplayPreferences | null => {
  try {
    const raw = window.localStorage.getItem(LEGACY_DISPLAY_PREFERENCES_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isDisplayPreferences(parsed)) return parsed;
  } catch {
    // Storage unavailable or unparseable JSON: behave as if unset.
  }
  return null;
};

/** The synchronous snapshot of what IndexedDB last reported. */
export const readDisplayPreferences = (): DisplayPreferences => snapshot;

/** Test-only: forget the snapshot so the next hydrate starts from automatic. */
export const resetDisplayPreferencesSnapshot = (): void => {
  snapshot = DEFAULT_DISPLAY_PREFERENCES;
};

const settingValueFor = (
  preferences: DisplayPreferences,
  id: string,
): SettingValue =>
  id === CURRENCY_SETTING_ID ? preferences.currency : preferences.weekStartsOn;

/**
 * Read one setting row's value back into a preference, falling back to
 * automatic when a synced row carries something this build does not
 * recognize. A row that is absent entirely is a different state: the setting
 * was never chosen anywhere, so the caller keeps what it already had.
 */
const toPreferences = (
  rows: readonly { id: string; value: SettingValue }[],
): Partial<DisplayPreferences> => {
  const patch: Partial<DisplayPreferences> = {};
  for (const row of rows) {
    if (row.id === CURRENCY_SETTING_ID) {
      patch.currency = isCurrencyCode(row.value) ? row.value : null;
    }
    if (row.id === WEEK_STARTS_ON_SETTING_ID) {
      patch.weekStartsOn = isWeekStartDay(row.value) ? row.value : null;
    }
  }
  return patch;
};

/**
 * One-time move of this device's pre-sync localStorage preferences into the
 * synced settings store. Only an explicit override migrates: a null is
 * indistinguishable from "never chose anything" in the old format, and
 * seeding it as a real choice would broadcast this device's silence over
 * another device's actual pick. The legacy key is removed either way, so this
 * runs exactly once.
 */
const migrateLegacyPreferences = async (
  existingIds: ReadonlySet<string>,
): Promise<boolean> => {
  const legacy = readLegacyPreferences();
  if (legacy === null) {
    // Nothing stored, or unparseable; either way there is nothing to carry
    // over. Clear the key so a corrupt value is not re-read every hydrate.
    try {
      window.localStorage.removeItem(LEGACY_DISPLAY_PREFERENCES_KEY);
    } catch {
      // Storage unavailable: nothing was migrated and nothing needs clearing.
    }
    return false;
  }
  const pending: [string, SettingValue][] = [
    [CURRENCY_SETTING_ID, legacy.currency],
    [WEEK_STARTS_ON_SETTING_ID, legacy.weekStartsOn],
  ];
  let migrated = false;
  for (const [id, value] of pending) {
    if (value === null || existingIds.has(id)) continue;
    await putSetting(id, value);
    migrated = true;
  }
  try {
    window.localStorage.removeItem(LEGACY_DISPLAY_PREFERENCES_KEY);
  } catch {
    // Best effort; a re-run is idempotent because existingIds now covers it.
  }
  return migrated;
};

/**
 * Reload the snapshot from IndexedDB. Called once during the app's initial
 * load (which gates the first paint on it), whenever another tab changes
 * stored data, and after any path that rewrites storage behind this module's
 * back (a sync pull, an import, a reset).
 */
export const hydrateDisplayPreferences = async (): Promise<void> => {
  if (pendingWrites > 0) {
    hydrateDeferred = true;
    return;
  }
  const generation = writeGeneration;
  let rows;
  try {
    rows = await getAllSettings();
  } catch {
    // No IndexedDB, or it could not be read. Everything stays automatic, and
    // the storage banner tells the user why.
    return;
  }
  const ids = new Set(rows.map((row) => row.id));
  if (await migrateLegacyPreferences(ids)) {
    try {
      rows = await getAllSettings();
    } catch {
      return;
    }
  }
  if (generation !== writeGeneration || pendingWrites > 0) {
    // A write landed while this read was in flight, so these rows are already
    // stale and would undo it. Re-run once the write has committed.
    hydrateDeferred = true;
    runDeferredHydrate();
    return;
  }
  const next = { ...DEFAULT_DISPLAY_PREFERENCES, ...toPreferences(rows) };
  const current = readDisplayPreferences();
  if (
    next.currency === current.currency &&
    next.weekStartsOn === current.weekStartsOn
  ) {
    return;
  }
  snapshot = next;
  emit();
};

/**
 * Apply a preference change: update the snapshot now so the UI responds on the
 * keystroke, then persist each changed key as its own settings row. One row
 * per setting means two devices that each change a different preference both
 * keep their change when the rows merge last-write-wins.
 */
export const writeDisplayPreferences = (
  patch: Partial<DisplayPreferences>,
): void => {
  const previous = readDisplayPreferences();
  const next = { ...previous, ...patch };
  snapshot = next;
  emit();
  const changed = [CURRENCY_SETTING_ID, WEEK_STARTS_ON_SETTING_ID].filter(
    (id) => settingValueFor(next, id) !== settingValueFor(previous, id),
  );
  if (changed.length === 0) return;
  writeGeneration += 1;
  for (const id of changed) {
    pendingWrites += 1;
    // Best effort: without storage the override still applies this session.
    void putSetting(id, settingValueFor(next, id))
      .catch(() => undefined)
      .finally(() => {
        pendingWrites -= 1;
        runDeferredHydrate();
      });
  }
};

export const subscribeToDisplayPreferences = (
  listener: () => void,
): (() => void) => {
  if (listeners.size === 0) {
    // The initial read belongs to CalendarContext's load, which gates the
    // first paint on it; this only has to catch changes made by other tabs.
    unsubscribeFromData = subscribeToDataChanges(() => {
      void hydrateDisplayPreferences();
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeFromData?.();
      unsubscribeFromData = null;
    }
  };
};
