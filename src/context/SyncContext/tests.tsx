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
} from "@/lib/storage";
import type { CalendarEvent } from "@/types";
import { CalendarProvider, useCalendar } from "@/context/CalendarContext";
import { SyncProvider, useSync } from "./index";

// Replace the network-facing account + sync layers; the storage layer stays
// real (fake-indexeddb) so the DEK cache is exercised end to end.
const mocks = vi.hoisted(() => ({
  getActiveSession: vi.fn(),
  signOut: vi.fn(),
  runSync: vi.fn(),
}));

vi.mock("@/lib/account", () => ({
  getActiveSession: mocks.getActiveSession,
  signOut: mocks.signOut,
  isAccountError: () => false,
  enrollTotp: vi.fn(),
  fetchKeyMaterial: vi.fn(),
  getTotpFactorId: vi.fn(),
  provisionAccountKeys: vi.fn(),
  requestReauthentication: vi.fn(),
  rewrapForNewPassword: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  unlockWithPassword: vi.fn(),
  unlockWithRecoveryKey: vi.fn(),
  updateAuthPassword: vi.fn(),
  updatePasswordColumns: vi.fn(),
  uploadKeyMaterial: vi.fn(),
  verifyTotp: vi.fn(),
}));

vi.mock("@/lib/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync")>();
  return {
    ...actual,
    createSupabaseRemote: () => ({}),
    runSync: mocks.runSync,
  };
});

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

  it("exposes the number of unpushed local changes", async () => {
    mocks.getActiveSession.mockResolvedValue(null); // signed out: still counted
    await seedLocalData(); // e1 (2026-06-09) + e2 tombstone (now), cursor 2026-06-01

    const { result } = renderHook(() => useSync(), { wrapper });

    await waitFor(() => expect(result.current.pendingCount).toBe(2));
  });

  it(
    "drops the pending count to 0 after a successful sync",
    { timeout: 15_000 },
    async () => {
      await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
      await seedLocalData();
      // Simulate a successful push by advancing the cursor past every row.
      mocks.runSync.mockImplementation(async () => {
        await setSyncCursor("2099-01-01T00:00:00.000Z");
        return { pushed: 2, pulled: 0 };
      });

      const { result } = renderHook(() => useSync(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe("synced"));

      await waitFor(() => expect(result.current.pendingCount).toBe(0));
    },
  );
});
