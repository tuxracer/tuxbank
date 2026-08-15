import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllSettings, putSetting } from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";
import {
  CURRENCY_SETTING_ID,
  hydrateDisplayPreferences,
  LEGACY_DISPLAY_PREFERENCES_KEY,
  readDisplayPreferences,
  resetDisplayPreferencesCache,
  subscribeToDisplayPreferences,
  WEEK_STARTS_ON_SETTING_ID,
  writeDisplayPreferences,
} from "./index";
import { resetDisplayPreferencesForTests } from "./testing";

/** Read back what the store would show on a cold start with no cache. */
const reloadFromStorage = async () => {
  resetDisplayPreferencesForTests();
  await hydrateDisplayPreferences();
  return readDisplayPreferences();
};

describe("displayPreferences", () => {
  beforeEach(() => {
    resetDbForTests();
    resetDisplayPreferencesForTests();
  });

  it("defaults both overrides to automatic", () => {
    expect(readDisplayPreferences()).toEqual({
      currency: null,
      weekStartsOn: null,
    });
  });

  it("persists each override as its own synced settings row", async () => {
    writeDisplayPreferences({ currency: "EUR" });
    writeDisplayPreferences({ weekStartsOn: 1 });
    // One row per setting is what lets two devices each change a different
    // preference and both survive the last-write-wins merge.
    await vi.waitFor(async () => {
      expect(await getAllSettings()).toHaveLength(2);
    });
    expect(await reloadFromStorage()).toEqual({
      currency: "EUR",
      weekStartsOn: 1,
    });
  });

  it("stores a cleared override as an explicit null rather than dropping the row", async () => {
    writeDisplayPreferences({ currency: "EUR" });
    writeDisplayPreferences({ currency: null });
    // Absence would read as "never chosen" and let another device's stale
    // pick win; an explicit null is a choice that syncs and wins on its stamp.
    await vi.waitFor(async () => {
      const rows = await getAllSettings();
      expect(
        rows.find((row) => row.id === CURRENCY_SETTING_ID)?.value,
      ).toBeNull();
    });
    expect((await reloadFromStorage()).currency).toBeNull();
  });

  it("falls back to automatic for a synced row it cannot validate", async () => {
    await putSetting(CURRENCY_SETTING_ID, "euros");
    await putSetting(WEEK_STARTS_ON_SETTING_ID, 9);
    expect(await reloadFromStorage()).toEqual({
      currency: null,
      weekStartsOn: null,
    });
  });

  it("migrates pre-sync localStorage preferences into settings rows once", async () => {
    window.localStorage.setItem(
      LEGACY_DISPLAY_PREFERENCES_KEY,
      JSON.stringify({ currency: "JPY", weekStartsOn: null }),
    );
    resetDisplayPreferencesCache();
    await hydrateDisplayPreferences();

    expect(readDisplayPreferences().currency).toBe("JPY");
    // Only the explicit override migrates: a null in the old format cannot be
    // told apart from "never chose anything", and seeding it as a real choice
    // would overwrite another device's actual pick.
    const rows = await getAllSettings();
    expect(rows.map((row) => row.id)).toEqual([CURRENCY_SETTING_ID]);
    expect(
      window.localStorage.getItem(LEGACY_DISPLAY_PREFERENCES_KEY),
    ).toBeNull();
  });

  it("does not let an in-flight hydrate revert a write that lands mid-read", async () => {
    await putSetting(CURRENCY_SETTING_ID, "USD");
    await hydrateDisplayPreferences();
    expect(readDisplayPreferences().currency).toBe("USD");

    // A sync pull's hydrate is already reading when the user picks a new
    // currency. Publishing the rows it read would silently undo that pick.
    const inFlight = hydrateDisplayPreferences();
    writeDisplayPreferences({ currency: "EUR" });
    await inFlight;
    expect(readDisplayPreferences().currency).toBe("EUR");

    // ...and it still reads EUR once the write and the retried hydrate settle.
    await vi.waitFor(async () => {
      const rows = await getAllSettings();
      expect(rows.find((row) => row.id === CURRENCY_SETTING_ID)?.value).toBe(
        "EUR",
      );
    });
    await hydrateDisplayPreferences();
    expect(readDisplayPreferences().currency).toBe("EUR");
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
