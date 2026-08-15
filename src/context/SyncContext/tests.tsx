import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetDbForTests } from "@/lib/storage/testing";
import {
  setStoredDek,
  getStoredDek,
  putEvent,
  deleteEvent,
  getAllEvents,
  getTombstones,
  getSyncCursor,
  setSyncCursor,
  getOutboxEntries,
  clearOutboxEntries,
} from "@/lib/storage";
import type { CalendarEvent } from "@/types";
import { CalendarProvider, useCalendar } from "@/context/CalendarContext";
import {
  buildDeviceLinkUrl,
  parseDeviceLinkHash,
  DEVICE_LINK_TTL_MS,
} from "@/lib/deviceLink";
import { toBase64 } from "@/utils/base64";
import { SyncProvider, useSync } from "./index";

// Replace the network-facing account + sync layers; the storage layer stays
// real (fake-indexeddb) so the DEK cache is exercised end to end.
const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  signOut: vi.fn(),
  runSync: vi.fn(),
  count: vi.fn(),
  signIn: vi.fn(),
  getTotpFactorId: vi.fn(),
  verifyTotp: vi.fn(),
  fetchKeyMaterial: vi.fn(),
  unlockWithKek: vi.fn(),
  deriveKeys: vi.fn(),
  toastError: vi.fn(),
  purge: vi.fn(),
  deleteKeyMaterial: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/account", async (importOriginal) => ({
  // AccountError is a real class the provider throws; only the network-facing
  // functions are replaced.
  AccountError: (await importOriginal<typeof import("@/lib/account")>())
    .AccountError,
  getActiveSession: mocks.getActiveSession,
  signOut: mocks.signOut,
  isAccountError: () => false,
  deleteKeyMaterial: mocks.deleteKeyMaterial,
  deleteAuthUser: mocks.deleteAuthUser,
  enrollTotp: vi.fn(),
  fetchKeyMaterial: mocks.fetchKeyMaterial,
  getTotpFactorId: mocks.getTotpFactorId,
  provisionAccountKeys: vi.fn(),
  requestReauthentication: vi.fn(),
  rewrapForNewPassword: vi.fn(),
  signIn: mocks.signIn,
  signUp: vi.fn(),
  unlockWithKek: mocks.unlockWithKek,
  unlockWithPassword: vi.fn(),
  unlockWithRecoveryKey: vi.fn(),
  updateAuthPassword: vi.fn(),
  stagePasswordRewrap: vi.fn(),
  clearPreviousPasswordWrap: vi.fn(),
  uploadKeyMaterial: vi.fn(),
  verifyTotp: mocks.verifyTotp,
}));

vi.mock("@/lib/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync")>();
  return {
    ...actual,
    createSupabaseRemote: () => ({ count: mocks.count, purge: mocks.purge }),
    runSync: mocks.runSync,
  };
});

// deriveKeys is mocked so tests skip the (slow, real) Argon2id derivation.
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return { ...actual, deriveKeys: mocks.deriveKeys };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: mocks.toastError }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CalendarProvider>
    <SyncProvider>{children}</SyncProvider>
  </CalendarProvider>
);

const testEvent = (id: string): CalendarEvent => ({
  id,
  title: "Rent",
  date: "2026-06-09",
  categoryId: "work",
  amount: 1_500,
  direction: "withdrawal",
  recurrence: null,
  overrides: [],
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
});

// One live event, one tombstone (from deleting e2), and a sync cursor: every
// kind of state a reset must account for.
const seedLocalData = async () => {
  await putEvent(testEvent("e1"));
  await putEvent(testEvent("e2"));
  await deleteEvent("e2");
  await setSyncCursor("2026-06-01T00:00:00.000Z");
};

const backupFile = (events: CalendarEvent[]): File =>
  new File(
    [
      JSON.stringify({
        app: "tuxbank",
        schemaVersion: 1,
        exportedAt: "2026-06-11T00:00:00.000Z",
        events,
        categories: [],
      }),
    ],
    "backup.json",
  );

describe("SyncContext session resume", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    // A fully set-up (aal2) Supabase session survives a reload.
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("resumes unlocked when a DEK was cached for the active session", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(result.current.email).toBe("user@example.com");
  });

  it("stays locked when no DEK was cached on this device", async () => {
    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("locked"));
    expect(result.current.email).toBe("user@example.com");
  });

  it("clears the cached DEK on sign-out so the next load re-locks", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));

    await result.current.signOut();

    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(await getStoredDek()).toBeUndefined();
  });
});

describe("SyncContext month navigation", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it(
    "runs a debounced sync after the visible month changes",
    { timeout: 15_000 },
    async () => {
      await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

      const { result } = renderHook(
        () => ({ sync: useSync(), calendar: useCalendar() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.sync.status).toBe("synced"));

      // Let any mount-time debounce (initial events/categories load) flush so
      // the only sync left to observe is the one the navigation schedules.
      await act(() => new Promise((resolve) => setTimeout(resolve, 2_500)));
      mocks.runSync.mockClear();

      act(() => result.current.calendar.goToNextMonth());

      await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(1), {
        timeout: 4_000,
      });
    },
  );

  it(
    "does not sync on navigation while the vault is locked",
    { timeout: 15_000 },
    async () => {
      // No stored DEK: the session resumes locked.
      const { result } = renderHook(
        () => ({ sync: useSync(), calendar: useCalendar() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.sync.status).toBe("locked"));

      act(() => result.current.calendar.goToNextMonth());

      await act(() => new Promise((resolve) => setTimeout(resolve, 2_500)));
      expect(mocks.runSync).not.toHaveBeenCalled();
    },
  );
});

describe("SyncContext reconnect", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it(
    "syncs when the network reconnects while unlocked",
    { timeout: 15_000 },
    async () => {
      await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

      const { result } = renderHook(() => useSync(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe("synced"));

      // Let the mount-time debounce (initial events/categories load) flush so
      // the only sync left to observe is the one the reconnect triggers.
      await act(() => new Promise((resolve) => setTimeout(resolve, 2_500)));
      mocks.runSync.mockClear();

      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(mocks.runSync).toHaveBeenCalledTimes(1));
    },
  );

  it("does not sync on reconnect while the vault is locked", async () => {
    // No stored DEK: the session resumes locked.
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(mocks.runSync).not.toHaveBeenCalled();
  });
});

describe("SyncContext resetAllData", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockReset();
    mocks.runSync.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("wipes everything locally and records no tombstones when signed out", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(mocks.getActiveSession).toHaveBeenCalled());

    await result.current.resetAllData();

    expect(await getAllEvents()).toEqual([]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("treats a locked account as signed out: local wipe, local sign-out, no tombstones", async () => {
    // aal2 session but no cached DEK resumes as "locked".
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));

    await result.current.resetAllData();

    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(await getAllEvents()).toEqual([]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("tombstones every row and pushes when signed in and unlocked", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));
    mocks.runSync.mockClear();

    await result.current.resetAllData();

    expect(await getAllEvents()).toEqual([]);
    const tombstones = await getTombstones();
    expect(tombstones.map((t) => t.id).sort()).toEqual(["e1", "e2"]);
    // The cursor survives so the follow-up sync is incremental.
    expect(await getSyncCursor()).toBe("2026-06-01T00:00:00.000Z");
    expect(mocks.runSync).toHaveBeenCalledTimes(1);
  });
});

describe("SyncContext deleteAccount", () => {
  beforeEach(async () => {
    await resetDbForTests();
    for (const mock of [
      mocks.signOut,
      mocks.runSync,
      mocks.purge,
      mocks.deleteKeyMaterial,
      mocks.deleteAuthUser,
      mocks.verifyTotp,
      mocks.getTotpFactorId,
      mocks.unlockWithKek,
      mocks.deriveKeys,
      mocks.fetchKeyMaterial,
    ]) {
      mock.mockReset();
    }
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
    mocks.fetchKeyMaterial.mockResolvedValue({ wrapped_dek: "x" });
    mocks.deriveKeys.mockResolvedValue({ kek: new Uint8Array([9]) });
    mocks.unlockWithKek.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mocks.getTotpFactorId.mockResolvedValue("factor-1");
    mocks.verifyTotp.mockResolvedValue(undefined);
    mocks.purge.mockResolvedValue(undefined);
    mocks.deleteKeyMaterial.mockResolvedValue(undefined);
    mocks.deleteAuthUser.mockResolvedValue(undefined);
  });

  const renderUnlocked = async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    await seedLocalData();
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));
    return result;
  };

  it("erases the account and keeps this device's data", async () => {
    const result = await renderUnlocked();

    await act(async () => {
      expect(await result.current.deleteAccount("pw", "123456")).toBe(true);
    });

    // Every synced collection is purged, then the login itself.
    expect(mocks.purge.mock.calls.map(([table]) => table)).toEqual([
      "events",
      "categories",
      "settings",
    ]);
    expect(mocks.deleteKeyMaterial).toHaveBeenCalled();
    expect(mocks.deleteAuthUser).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("off"));
    // The point of the flow: the calendar survives, minus everything that tied
    // it to the deleted account.
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["e1"]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
    expect(await getStoredDek()).toBeUndefined();
  });

  it("destroys nothing when the two-factor code is rejected", async () => {
    mocks.verifyTotp.mockRejectedValue(new Error("MFA_VERIFY_FAILED"));
    const result = await renderUnlocked();

    await act(async () => {
      expect(await result.current.deleteAccount("pw", "000000")).toBe(false);
    });

    expect(mocks.purge).not.toHaveBeenCalled();
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(result.current.status).not.toBe("off");
    expect(await getSyncCursor()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("destroys nothing when the password does not unwrap the data key", async () => {
    mocks.unlockWithKek.mockRejectedValue(new Error("bad key"));
    const result = await renderUnlocked();

    await act(async () => {
      expect(await result.current.deleteAccount("wrong", "123456")).toBe(false);
    });

    expect(mocks.verifyTotp).not.toHaveBeenCalled();
    expect(mocks.purge).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error).toBe("WRONG_PASSWORD"));
  });

  it("stays signed in when the account itself could not be removed", async () => {
    mocks.deleteAuthUser.mockRejectedValue(new Error("ACCOUNT_DELETE_FAILED"));
    const result = await renderUnlocked();

    await act(async () => {
      expect(await result.current.deleteAccount("pw", "123456")).toBe(false);
    });

    // The session survives so the user can retry, and so does their calendar.
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(result.current.status).not.toBe("off");
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("SyncContext importData", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockReset();
    mocks.runSync.mockReset();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("replaces local data and drops the cursor when signed out", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(mocks.getActiveSession).toHaveBeenCalled());
    expect(result.current.unlocked).toBe(false);

    await result.current.importData(backupFile([testEvent("f1")]));

    const events = await getAllEvents();
    expect(events.map((e) => e.id)).toEqual(["f1"]);
    // Original backup stamp preserved: the cloud wins ties on a later merge.
    expect(events[0].updatedAt).toBe("2026-06-09T00:00:00.000Z");
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("stays signed in but imports locally when locked", async () => {
    // aal2 session but no cached DEK resumes as "locked".
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));
    expect(result.current.unlocked).toBe(false);

    await result.current.importData(backupFile([testEvent("f1")]));

    expect(result.current.status).toBe("locked"); // import does not sign out
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["f1"]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("re-stamps, tombstones removals, and syncs around the import when unlocked", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(result.current.unlocked).toBe(true);
    mocks.runSync.mockClear();

    await result.current.importData(backupFile([testEvent("f1")]));

    const events = await getAllEvents();
    expect(events.map((e) => e.id)).toEqual(["f1"]);
    expect(events[0].updatedAt).not.toBe("2026-06-09T00:00:00.000Z");
    // e1 (live) and e2 (already tombstoned) are not in the backup.
    const tombstones = await getTombstones();
    expect(tombstones.map((t) => t.id).sort()).toEqual(["e1", "e2"]);
    expect(await getSyncCursor()).toBe("2026-06-01T00:00:00.000Z");
    // Pull before (so unseen rows get tombstoned), push after.
    expect(mocks.runSync).toHaveBeenCalledTimes(2);
  });
});

describe("SyncContext offline awareness", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it(
    "never attempts a sync while offline and recovers on reconnect",
    { timeout: 15_000 },
    async () => {
      const onLine = vi.spyOn(window.navigator, "onLine", "get");
      onLine.mockReturnValue(false);
      await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

      const { result } = renderHook(() => useSync(), { wrapper });

      // The mount resume calls doSync, which must gate on offline.
      await waitFor(() => expect(result.current.status).toBe("offline"));
      expect(mocks.runSync).not.toHaveBeenCalled();

      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(result.current.status).toBe("synced"));
      expect(mocks.runSync).toHaveBeenCalled();
      onLine.mockRestore();
    },
  );

  it("flips an unlocked session to offline when the connection drops", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => expect(result.current.status).toBe("offline"));
  });

  it("leaves a locked session untouched when the connection drops", async () => {
    // No stored DEK: the session resumes locked.
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("locked"));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(result.current.status).toBe("locked");
  });

  it("exposes the number of unpushed local changes while unlocked", async () => {
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5])); // resumes unlocked
    await seedLocalData(); // e1 (2026-06-09) + e2 tombstone (now), cursor 2026-06-01

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.pendingCount).toBe(2));
  });

  it("skips the passive count when signed out, but readPendingCount still counts", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    await seedLocalData();

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("off"));

    expect(result.current.pendingCount).toBe(0);
    // The sign-out warning reads the count on demand regardless of state.
    await expect(result.current.readPendingCount()).resolves.toBe(2);
  });

  it(
    "drops the pending count to 0 after a successful sync",
    { timeout: 15_000 },
    async () => {
      await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
      await seedLocalData();
      // Simulate a successful push the way the real engine records one:
      // advance the cursor and drain the pushed changes from the outbox.
      mocks.runSync.mockImplementation(async () => {
        await setSyncCursor("2099-01-01T00:00:00.000Z");
        await clearOutboxEntries(await getOutboxEntries());
        return { pushed: 2, pulled: 0, skipped: 0 };
      });

      const { result } = renderHook(() => useSync(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe("synced"));

      await waitFor(() => expect(result.current.pendingCount).toBe(0));
    },
  );
});

const KEK = new Uint8Array(32).fill(7);
const DEK = new Uint8Array(32).fill(3);

const keyMaterial = {
  wrapped_dek: "d",
  wrapped_dek_nonce: "n",
  recovery_wrapped_dek: "r",
  recovery_nonce: "rn",
  kdf_version: 1,
};

const linkSecrets = {
  email: "a@b.com",
  authSecret: "auth-secret",
  kek: toBase64(KEK),
};

// Boot the provider into the unlocked/synced state (aal2 session + cached DEK).
const renderUnlocked = async () => {
  mocks.getActiveSession.mockResolvedValue({ email: "a@b.com", aal2: true });
  await setStoredDek(DEK);
  const view = renderHook(() => useSync(), { wrapper });
  await waitFor(() => expect(view.result.current.status).toBe("synced"));
  return view;
};

describe("createDeviceLink", () => {
  beforeEach(async () => {
    await resetDbForTests();
    // Clear call history left by other describes sharing these hoisted mocks
    // (their configured resolved values are untouched by clearAllMocks).
    vi.clearAllMocks();
    mocks.runSync.mockResolvedValue({ pulled: 0, pushed: 0 });
  });

  it("returns null when not unlocked", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSync(), { wrapper });
    expect(await result.current.createDeviceLink("pw")).toBeNull();
  });

  it("returns a parseable URL carrying the derived secrets", async () => {
    mocks.deriveKeys.mockResolvedValue({ kek: KEK, authSecret: "auth-secret" });
    mocks.fetchKeyMaterial.mockResolvedValue(keyMaterial);
    mocks.unlockWithKek.mockResolvedValue(DEK);
    const { result } = await renderUnlocked();
    let url: string | null = null;
    await act(async () => {
      url = await result.current.createDeviceLink("pw-123456");
    });
    expect(url).not.toBeNull();
    const parsed = parseDeviceLinkHash(new URL(url!).hash);
    expect(parsed).toMatchObject(linkSecrets);
    // A link the user is about to scan has to be live when it is minted.
    expect(parsed!.exp).toBeGreaterThan(Date.now());
    expect(mocks.unlockWithKek).toHaveBeenCalledWith(KEK, keyMaterial);
  });

  it("sets LINK_CREATE_FAILED and returns null on a wrong password", async () => {
    mocks.deriveKeys.mockResolvedValue({ kek: KEK, authSecret: "auth-secret" });
    mocks.fetchKeyMaterial.mockResolvedValue(keyMaterial);
    mocks.unlockWithKek.mockRejectedValue(new Error("bad key"));
    const { result } = await renderUnlocked();
    let url: string | null = "sentinel";
    await act(async () => {
      url = await result.current.createDeviceLink("wrong");
    });
    expect(url).toBeNull();
    await waitFor(() =>
      expect(result.current.error).toBe("LINK_CREATE_FAILED"),
    );
  });
});

const setLinkHash = (now?: number) => {
  window.location.hash = new URL(
    buildDeviceLinkUrl(linkSecrets, "https://tuxbank.app", now),
  ).hash;
};

describe("device-link sign-in", () => {
  beforeEach(async () => {
    await resetDbForTests();
    // Clear call history left by other describes sharing these hoisted mocks
    // (their configured resolved values are untouched by clearAllMocks).
    vi.clearAllMocks();
    mocks.runSync.mockResolvedValue({ pulled: 0, pushed: 0 });
    window.location.hash = "";
  });

  it("stages the TOTP challenge without deriving keys", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    mocks.signIn.mockResolvedValue(undefined);
    mocks.getTotpFactorId.mockResolvedValue("factor-1");
    setLinkHash();
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("signin-totp"));
    expect(mocks.signIn).toHaveBeenCalledWith("a@b.com", "auth-secret");
    expect(result.current.email).toBe("a@b.com");
    expect(mocks.deriveKeys).not.toHaveBeenCalled();
  });

  it("completes the unlock through confirmTotp using the carried KEK", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    mocks.signIn.mockResolvedValue(undefined);
    mocks.getTotpFactorId.mockResolvedValue("factor-1");
    mocks.verifyTotp.mockResolvedValue(undefined);
    mocks.fetchKeyMaterial.mockResolvedValue(keyMaterial);
    mocks.unlockWithKek.mockResolvedValue(DEK);
    setLinkHash();
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("signin-totp"));
    await act(async () => {
      await result.current.confirmTotp("123456");
    });
    expect(mocks.verifyTotp).toHaveBeenCalledWith("factor-1", "123456");
    expect(mocks.unlockWithKek).toHaveBeenCalledWith(KEK, keyMaterial);
    expect(result.current.status).toBe("synced");
    expect(result.current.step).toBe("idle");
  });

  it("toasts instead of setting error when the sign-in is rejected", async () => {
    mocks.getActiveSession.mockResolvedValue(null);
    mocks.signIn.mockRejectedValue(new Error("SIGNIN_FAILED"));
    setLinkHash();
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(result.current.error).toBeNull();
    expect(result.current.step).toBe("idle");
  });
});

describe("device-link hash at boot", () => {
  beforeEach(async () => {
    await resetDbForTests();
    vi.clearAllMocks();
    mocks.runSync.mockResolvedValue({ pulled: 0, pushed: 0 });
    window.location.hash = "";
  });

  it("consumes the hash and stages the TOTP challenge", async () => {
    setLinkHash();
    mocks.getActiveSession.mockResolvedValue(null);
    mocks.signIn.mockResolvedValue(undefined);
    mocks.getTotpFactorId.mockResolvedValue("factor-1");
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.step).toBe("signin-totp"));
    expect(mocks.signIn).toHaveBeenCalledWith("a@b.com", "auth-secret");
    expect(window.location.hash).toBe("");
  });

  it("ignores the link when a session already exists", async () => {
    setLinkHash();
    mocks.getActiveSession.mockResolvedValue({ email: "a@b.com", aal2: true });
    await setStoredDek(DEK);
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("refuses an expired link but still strips the hash", async () => {
    setLinkHash(Date.now() - DEVICE_LINK_TTL_MS - 1);
    mocks.getActiveSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("boots normally on a malformed link hash", async () => {
    window.location.hash = "#device-link=garbage";
    mocks.getActiveSession.mockResolvedValue(null);
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mocks.signIn).not.toHaveBeenCalled();
    // Unparseable payloads (e.g. a future-version link) still carry live
    // secrets and must be stripped from the address bar regardless.
    expect(window.location.hash).toBe("");
  });
});

describe("SyncContext sign-in conflict gate", () => {
  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.count.mockReset();
    mocks.count.mockResolvedValue(0);
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("parks in the choice status when both sides have events", async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("choice"));
    expect(result.current.step).toBe("signin-choice");
    expect(result.current.signInChoice).toEqual({ local: 1, remote: 3 });
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("syncs without prompting when this device has no events", async () => {
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(result.current.signInChoice).toBeNull();
    expect(mocks.runSync).toHaveBeenCalled();
  });

  it("syncs without prompting when the account has no events", async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockResolvedValue(0);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(mocks.runSync).toHaveBeenCalled();
  });

  it("syncs without prompting when this device has already synced", async () => {
    await putEvent(testEvent("e1"));
    await setSyncCursor("2026-06-01T00:00:00.000Z");
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it("does not re-query the account while the choice is pending", async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("choice"));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.runSync).not.toHaveBeenCalled();
  });

  it("surfaces an error and syncs nothing when the account cannot be counted", async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockRejectedValue(new Error("network down"));
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(mocks.runSync).not.toHaveBeenCalled();
  });
});

describe("SyncContext conflict resolutions", () => {
  // The mocked runSync stands in for a real first sync: it lands one
  // account-only event on the device and writes a cursor, exactly as the pull
  // half of runSync would. It must be mockImplementationOnce, not
  // mockImplementation: keep-local calls doSync twice, and a mock that pulled
  // remote-1 again on the second call would re-add the event the resolution
  // just deleted. Later calls fall back to the beforeEach mockResolvedValue.
  const simulateFirstSync = () => {
    mocks.runSync.mockImplementationOnce(async () => {
      await putEvent(testEvent("remote-1"));
      await setSyncCursor("2026-06-11T00:00:00.000Z");
      return { pushed: 0, pulled: 1 };
    });
  };

  const arriveAtChoice = async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("choice"));
    return result;
  };

  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.count.mockReset();
    mocks.count.mockResolvedValue(0);
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("merge syncs without deleting anything", async () => {
    const result = await arriveAtChoice();
    simulateFirstSync();

    await act(async () => {
      await result.current.resolveSignInChoice("merge");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    const ids = (await getAllEvents()).map((e) => e.id).sort();
    expect(ids).toEqual(["e1", "remote-1"]);
    expect(await getTombstones()).toEqual([]);
    expect(result.current.signInChoice).toBeNull();
  });

  it("merge does not re-prompt after it resolves", async () => {
    const result = await arriveAtChoice();

    await act(async () => {
      await result.current.resolveSignInChoice("merge");
    });
    await waitFor(() => expect(result.current.status).toBe("synced"));

    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.status).not.toBe("choice");
  });

  it("keep remote wipes this device and records no tombstones", async () => {
    const result = await arriveAtChoice();

    await act(async () => {
      await result.current.resolveSignInChoice("remote");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(await getAllEvents()).toEqual([]);
    // Crucial: no tombstones, so the account is untouched by this device.
    expect(await getTombstones()).toEqual([]);
  });

  it("keep remote re-persists the cached DEK after the wipe", async () => {
    const result = await arriveAtChoice();
    // clearLocalData wipes the whole syncMeta store, the DEK cache included.
    expect(await getStoredDek()).toBeDefined();

    await act(async () => {
      await result.current.resolveSignInChoice("remote");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    // Without re-persisting, the next page load would find no cached key and
    // land on "locked" instead of resuming synced.
    expect(await getStoredDek()).toBeDefined();
  });

  it("ignores a stale choice once another tab has already resolved it", async () => {
    const result = await arriveAtChoice();
    mocks.runSync.mockClear();
    // Simulate a second tab answering the same prompt first: it writes a
    // cursor behind this tab's back (setSyncCursor deliberately does not
    // broadcast).
    await setSyncCursor("2026-06-11T00:00:00.000Z");

    await act(async () => {
      await result.current.resolveSignInChoice("local");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    // The destructive keep-local path (export, re-stamp, tombstone, re-sync)
    // never ran: a plain sync happens exactly once, and e1 keeps its original
    // timestamp rather than being re-stamped to "now" by commitImportSynced.
    expect(mocks.runSync).toHaveBeenCalledTimes(1);
    expect(await getTombstones()).toEqual([]);
    const events = await getAllEvents();
    expect(events.map((e) => e.id)).toEqual(["e1"]);
    expect(events[0].updatedAt).toBe("2026-06-09T00:00:00.000Z");
  });

  it("keep local tombstones the account-only events", async () => {
    const result = await arriveAtChoice();
    simulateFirstSync();

    await act(async () => {
      await result.current.resolveSignInChoice("local");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    // The device's own event survives; the account-only one does not.
    expect((await getAllEvents()).map((e) => e.id)).toEqual(["e1"]);
    expect(await getTombstones()).toEqual([
      expect.objectContaining({ id: "remote-1", type: "event" }),
    ]);
  });

  it("keep local captures this device's events before any pull", async () => {
    const result = await arriveAtChoice();
    simulateFirstSync();

    await act(async () => {
      await result.current.resolveSignInChoice("local");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    // If the export were captured after the first sync, remote-1 would have
    // been treated as part of this device's authoritative set and survived.
    expect((await getAllEvents()).map((e) => e.id)).not.toContain("remote-1");
  });

  it("keep local pushes after rewriting, so the deletions leave the device", async () => {
    const result = await arriveAtChoice();
    simulateFirstSync();

    await act(async () => {
      await result.current.resolveSignInChoice("local");
    });

    await waitFor(() => expect(result.current.status).toBe("synced"));
    expect(mocks.runSync.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SyncContext actions while a choice is pending", () => {
  const arriveAtChoice = async () => {
    await putEvent(testEvent("e1"));
    mocks.count.mockResolvedValue(3);
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("choice"));
    return result;
  };

  beforeEach(async () => {
    await resetDbForTests();
    mocks.signOut.mockResolvedValue(undefined);
    mocks.runSync.mockReset();
    mocks.runSync.mockResolvedValue({ pushed: 0, pulled: 0 });
    mocks.count.mockReset();
    mocks.count.mockResolvedValue(0);
    mocks.getActiveSession.mockResolvedValue({
      email: "user@example.com",
      aal2: true,
    });
  });

  it("reports itself as not unlocked", async () => {
    const result = await arriveAtChoice();

    expect(result.current.unlocked).toBe(false);
  });

  it("clears only this device, recording no tombstones", async () => {
    const result = await arriveAtChoice();

    await act(async () => {
      await result.current.resetAllData();
    });

    expect(await getAllEvents()).toEqual([]);
    // The signed-in reset path would have tombstoned e1 to delete it from the
    // account. A pending choice must not reach the account.
    expect(await getTombstones()).toEqual([]);
  });

  it("imports a backup as local-only, dropping the cursor", async () => {
    const result = await arriveAtChoice();

    await act(async () => {
      await result.current.importData(backupFile([testEvent("imported-1")]));
    });

    expect((await getAllEvents()).map((e) => e.id)).toEqual(["imported-1"]);
    expect(await getTombstones()).toEqual([]);
    expect(await getSyncCursor()).toBeUndefined();
  });
});
