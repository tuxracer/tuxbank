import { DEFAULT_DISPLAY_PREFERENCES, DISPLAY_PREFERENCES_KEY } from "./consts";
import { isDisplayPreferences, type DisplayPreferences } from "./types";

export * from "./consts";
export * from "./types";

// Cached so readDisplayPreferences returns a stable reference between writes
// (useSyncExternalStore compares snapshots by identity).
let cached: DisplayPreferences | null = null;
const listeners = new Set<() => void>();

const load = (): DisplayPreferences => {
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFERENCES_KEY);
    if (raw === null) return DEFAULT_DISPLAY_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (isDisplayPreferences(parsed)) return parsed;
  } catch {
    // Storage unavailable or unparseable JSON: behave as if unset.
  }
  return DEFAULT_DISPLAY_PREFERENCES;
};

export const readDisplayPreferences = (): DisplayPreferences =>
  (cached ??= load());

/** Drop the snapshot cache; the next read reloads from storage (see testing.ts). */
export const resetDisplayPreferencesCache = (): void => {
  cached = null;
};

export const writeDisplayPreferences = (
  patch: Partial<DisplayPreferences>,
): void => {
  cached = { ...readDisplayPreferences(), ...patch };
  try {
    window.localStorage.setItem(
      DISPLAY_PREFERENCES_KEY,
      JSON.stringify(cached),
    );
  } catch {
    // Best effort: without storage the override still applies this session.
  }
  for (const listener of listeners) listener();
};

// Another tab changed the stored preferences: drop the cache so the next
// snapshot reloads, and re-render subscribers.
const onStorage = (event: StorageEvent): void => {
  if (event.key !== null && event.key !== DISPLAY_PREFERENCES_KEY) return;
  cached = null;
  for (const listener of listeners) listener();
};

export const subscribeToDisplayPreferences = (
  listener: () => void,
): (() => void) => {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
};
