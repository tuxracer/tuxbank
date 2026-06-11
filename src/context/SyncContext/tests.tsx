import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { resetDbForTests } from "@/lib/storage/testing";
import {
  setStoredDek,
  getStoredDek,
  setSyncCursor,
  getSyncCursor,
} from "@/lib/storage";
import { CalendarProvider } from "@/context/CalendarContext";
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

vi.mock("@/lib/sync", () => ({
  createSupabaseRemote: () => ({}),
  runSync: mocks.runSync,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CalendarProvider>
    <SyncProvider>{children}</SyncProvider>
  </CalendarProvider>
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

  it("clears the cached DEK and the sync cursor on sign-out", async () => {
    // The DEK so the next load re-locks; the cursor so the next sign-in runs
    // a true first sync. A leftover cursor made the next account's "initial"
    // sync incremental, silently skipping every local row older than it, so
    // the cloud (and any other device) never received the data.
    await setStoredDek(new Uint8Array([1, 2, 3, 4, 5]));
    await setSyncCursor("2026-06-01T00:00:00.000Z");

    const { result } = renderHook(() => useSync(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("synced"));

    await result.current.signOut();

    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(await getStoredDek()).toBeUndefined();
    expect(await getSyncCursor()).toBeUndefined();
  });
});
