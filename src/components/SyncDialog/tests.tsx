import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncDialog } from "./index";
import type { SyncContextValue } from "@/context/SyncContext";

const mocks = vi.hoisted(() => ({
  createDeviceLink: vi.fn(),
}));

const syncValue: SyncContextValue = {
  status: "synced",
  step: "idle",
  email: "a@b.com",
  enrollment: null,
  recoveryKey: null,
  lastSyncedAt: null,
  pendingCount: 0,
  error: null,
  configured: true,
  createAccount: vi.fn(),
  confirmTotp: vi.fn(),
  finishCreate: vi.fn(),
  signIn: vi.fn(),
  signInWithLink: vi.fn(),
  unlock: vi.fn(),
  changePassword: vi.fn(),
  recoverWithKey: vi.fn(),
  signOut: vi.fn(),
  resetAllData: vi.fn(),
  importData: vi.fn(),
  unlocked: true,
  syncNow: vi.fn(),
  createDeviceLink: mocks.createDeviceLink,
  signInChoice: null,
  resolveSignInChoice: vi.fn(),
};

vi.mock("@/context/SyncContext", () => ({
  useSync: () => syncValue,
}));

describe("SyncDialog device linking", () => {
  beforeEach(() => {
    mocks.createDeviceLink.mockReset();
  });

  it("reveals a password prompt, then the QR code", async () => {
    mocks.createDeviceLink.mockResolvedValue(
      "https://tuxbank.app/#device-link=abc",
    );
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: /link another device/i }),
    );
    expect(screen.queryByTestId("device-link-qr")).toBeNull();
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "pw-123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    await waitFor(() =>
      expect(screen.getByTestId("device-link-qr")).toBeInTheDocument(),
    );
    expect(mocks.createDeviceLink).toHaveBeenCalledWith("pw-123456");
  });

  it("stays on the password prompt when generation fails", async () => {
    mocks.createDeviceLink.mockResolvedValue(null);
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: /link another device/i }),
    );
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate code/i }));
    await waitFor(() => expect(mocks.createDeviceLink).toHaveBeenCalled());
    expect(screen.queryByTestId("device-link-qr")).toBeNull();
  });
});

describe("SyncDialog sign-in conflict", () => {
  beforeEach(() => {
    syncValue.status = "choice";
    syncValue.step = "signin-choice";
    syncValue.signInChoice = { local: 12, remote: 34 };
    syncValue.resolveSignInChoice = vi.fn();
  });

  afterEach(() => {
    syncValue.status = "synced";
    syncValue.step = "idle";
    syncValue.signInChoice = null;
  });

  it("shows both counts", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);

    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/34/)).toBeInTheDocument();
  });

  it("merges immediately, with no confirm step", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /merge both/i }));

    expect(syncValue.resolveSignInChoice).toHaveBeenCalledWith("merge");
  });

  it("requires the confirm word before deleting the account's events", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /keep this device/i }));

    const confirm = screen.getByTestId("signin-choice-confirm-button");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("signin-choice-confirm"), {
      target: { value: "delete" },
    });

    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(syncValue.resolveSignInChoice).toHaveBeenCalledWith("local");
  });

  it("requires the confirm word before deleting this device's events", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /keep the account/i }));

    fireEvent.change(screen.getByTestId("signin-choice-confirm"), {
      target: { value: "delete" },
    });
    fireEvent.click(screen.getByTestId("signin-choice-confirm-button"));

    expect(syncValue.resolveSignInChoice).toHaveBeenCalledWith("remote");
  });

  it("accepts the confirm word with stray case and whitespace", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /keep the account/i }));

    fireEvent.change(screen.getByTestId("signin-choice-confirm"), {
      target: { value: "  DELETE " },
    });

    expect(screen.getByTestId("signin-choice-confirm-button")).toBeEnabled();
  });

  it("goes back to the three choices without resolving", () => {
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /keep this device/i }));
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(
      screen.getByRole("button", { name: /merge both/i }),
    ).toBeInTheDocument();
    expect(syncValue.resolveSignInChoice).not.toHaveBeenCalled();
  });
});

describe("SyncDialog sign out", () => {
  const reload = vi.fn();
  const confirm = vi.fn();

  // jsdom's window.location is not writable, so swap in a stand-in carrying a
  // spyable reload. Restored in afterEach so other suites see the real one.
  const realLocation = window.location;
  const realConfirm = window.confirm;

  beforeEach(() => {
    reload.mockReset();
    confirm.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload },
    });
    window.confirm = confirm;
    syncValue.status = "synced";
    syncValue.step = "idle";
    syncValue.signOut = vi.fn();
    window.localStorage.setItem("leftover", "1");
    window.sessionStorage.setItem("leftover", "1");
  });

  afterEach(() => {
    window.confirm = realConfirm;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Reach the confirm panel: the account-active section's ghost "Sign out"
  // button is what reveals it.
  const openSignOutPanel = () => {
    render(<SyncDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
  };

  it("does not sign out when the native confirm is dismissed", async () => {
    confirm.mockReturnValue(false);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(syncValue.signOut).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("leftover")).toBe("1");
  });

  it("clears local data, wipes web storage, and reloads once confirmed", async () => {
    confirm.mockReturnValue(true);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    // true is the clear-local-data flag: signing out always erases this browser.
    expect(syncValue.signOut).toHaveBeenCalledWith(true);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("offers no way to sign out while keeping this browser's data", () => {
    confirm.mockReturnValue(true);
    openSignOutPanel();

    expect(screen.queryByRole("button", { name: /erase/i })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^sign out$/i })).toHaveLength(
      1,
    );
  });

  it("never mentions browser storage in the prompt", async () => {
    confirm.mockReturnValue(true);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith("Sign out of a@b.com?");
  });

  it("reloads even when web storage throws", async () => {
    confirm.mockReturnValue(true);
    const clearSpy = vi
      .spyOn(Storage.prototype, "clear")
      .mockImplementation(() => {
        throw new Error("storage blocked");
      });
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    clearSpy.mockRestore();
  });
});
