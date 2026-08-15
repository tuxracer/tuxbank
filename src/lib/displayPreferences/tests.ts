import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISPLAY_PREFERENCES_KEY,
  readDisplayPreferences,
  resetDisplayPreferencesCache,
  subscribeToDisplayPreferences,
  writeDisplayPreferences,
} from "./index";
import { resetDisplayPreferencesForTests } from "./testing";

describe("displayPreferences", () => {
  beforeEach(() => {
    resetDisplayPreferencesForTests();
  });

  it("defaults both overrides to automatic", () => {
    expect(readDisplayPreferences()).toEqual({
      currency: null,
      weekStartsOn: null,
    });
  });

  it("persists a partial write across a fresh load", () => {
    writeDisplayPreferences({ currency: "EUR" });
    writeDisplayPreferences({ weekStartsOn: 1 });
    resetDisplayPreferencesCache();
    expect(readDisplayPreferences()).toEqual({
      currency: "EUR",
      weekStartsOn: 1,
    });
  });

  it("clears an override back to automatic", () => {
    writeDisplayPreferences({ currency: "EUR" });
    writeDisplayPreferences({ currency: null });
    resetDisplayPreferencesCache();
    expect(readDisplayPreferences().currency).toBeNull();
  });

  it("ignores unparseable stored JSON", () => {
    window.localStorage.setItem(DISPLAY_PREFERENCES_KEY, "{not json");
    expect(readDisplayPreferences()).toEqual({
      currency: null,
      weekStartsOn: null,
    });
  });

  it("ignores stored values that fail validation", () => {
    window.localStorage.setItem(
      DISPLAY_PREFERENCES_KEY,
      JSON.stringify({ currency: "euros", weekStartsOn: 9 }),
    );
    expect(readDisplayPreferences()).toEqual({
      currency: null,
      weekStartsOn: null,
    });
  });

  it("notifies subscribers on write, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDisplayPreferences(listener);
    writeDisplayPreferences({ weekStartsOn: 6 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeDisplayPreferences({ weekStartsOn: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
