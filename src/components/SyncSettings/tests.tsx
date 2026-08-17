import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SyncSettings } from "./index";
import type { SyncContextValue } from "@/context/SyncContext";

const mocks = vi.hoisted(() => ({
  createDeviceLink: vi.fn(),
  deleteAccount: vi.fn(),
}));

const syncValue: SyncContextValue = {
  status: "synced",
  step: "idle",
  email: "a@b.com",
  enrollment: null,
  recoveryKey: null,
  lastSyncedAt: null,
  pendingCount: 0,
  readPendingCount: vi.fn().mockResolvedValue(0),
  error: null,
  configured: true,
  createAccount: vi.fn(),
  confirmTotp: vi.fn(),
  finishCreate: vi.fn(),
  signIn: vi.fn(),
  unlock: vi.fn(),
  changePassword: vi.fn(),
  recoverWithKey: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: mocks.deleteAccount,
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

describe("SyncSettings create-account email check", () => {
  beforeEach(() => {
    syncValue.status = "off";
    syncValue.step = "idle";
  });

  afterEach(() => {
    syncValue.status = "synced";
  });

  const fillCreateForm = (email: string) => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: email },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "pw-123456" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "pw-123456" },
    });
    return screen.getByRole("button", { name: /create account/i });
  };

  it.each([
    ["a@b.c", "shorter than 6 characters"],
    ["userexample.com", "missing the @"],
    ["user@examplecom", "missing the dot"],
  ])("keeps Create account disabled for %s (%s)", (email) => {
    expect(fillCreateForm(email)).toBeDisabled();
  });

  it("enables Create account once the email is plausible", () => {
    expect(fillCreateForm("ab@b.c")).toBeEnabled();
  });

  it("does not apply the check to sign-in", () => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    fireEvent.change(screen.getByLabelText(/^email$/i), {
      target: { value: "ab" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "pw-123456" },
    });
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });
});

describe("SyncSettings device linking", () => {
  beforeEach(() => {
    mocks.createDeviceLink.mockReset();
  });

  it("reveals a password prompt, then the QR code", async () => {
    mocks.createDeviceLink.mockResolvedValue(
      "https://tuxbank.app/#device-link=abc",
    );
    render(<SyncSettings />);
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
    render(<SyncSettings />);
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

describe("SyncSettings sign-in conflict", () => {
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
    render(<SyncSettings />);

    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/34/)).toBeInTheDocument();
  });

  it("merges immediately, with no confirm step", () => {
    render(<SyncSettings />);

    fireEvent.click(screen.getByRole("button", { name: /merge both/i }));

    expect(syncValue.resolveSignInChoice).toHaveBeenCalledWith("merge");
  });

  it("requires the confirm word before deleting the account's events", () => {
    render(<SyncSettings />);
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
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /keep the account/i }));

    fireEvent.change(screen.getByTestId("signin-choice-confirm"), {
      target: { value: "delete" },
    });
    fireEvent.click(screen.getByTestId("signin-choice-confirm-button"));

    expect(syncValue.resolveSignInChoice).toHaveBeenCalledWith("remote");
  });

  it("accepts the confirm word with stray case and whitespace", () => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /keep the account/i }));

    fireEvent.change(screen.getByTestId("signin-choice-confirm"), {
      target: { value: "  DELETE " },
    });

    expect(screen.getByTestId("signin-choice-confirm-button")).toBeEnabled();
  });

  it("goes back to the three choices without resolving", () => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /keep this device/i }));
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    expect(
      screen.getByRole("button", { name: /merge both/i }),
    ).toBeInTheDocument();
    expect(syncValue.resolveSignInChoice).not.toHaveBeenCalled();
  });
});

describe("SyncSettings delete account", () => {
  beforeEach(() => {
    mocks.deleteAccount.mockReset();
    mocks.deleteAccount.mockResolvedValue(true);
    syncValue.status = "synced";
    syncValue.step = "idle";
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // All three gates satisfied, so a test can relax exactly one of them.
  const openDeletePanel = (
    fields: { password?: string; code?: string; confirm?: string } = {},
  ) => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: fields.password ?? "pw-123456" },
    });
    fireEvent.change(screen.getByLabelText(/two-factor code/i), {
      target: { value: fields.code ?? "123456" },
    });
    fireEvent.change(screen.getByTestId("delete-account-confirm"), {
      target: { value: fields.confirm ?? "delete a@b.com" },
    });
    return screen.getByTestId("delete-account-button");
  };

  it("deletes once the password, code, and phrase are all in", async () => {
    const button = openDeletePanel();
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.deleteAccount).toHaveBeenCalledWith("pw-123456", "123456"),
    );
  });

  it("does not delete when the confirm prompt is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    fireEvent.click(openDeletePanel());

    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["the password is missing", { password: "" }],
    ["the code is short", { code: "12345" }],
    ["the phrase omits the email", { confirm: "delete" }],
    ["the phrase names another account", { confirm: "delete other@b.com" }],
  ])("stays disabled when %s", (_label, fields) => {
    expect(openDeletePanel(fields)).toBeDisabled();
  });

  it("accepts the phrase with stray case and whitespace", () => {
    expect(openDeletePanel({ confirm: "  Delete A@B.com " })).toBeEnabled();
  });
});

describe("SyncSettings sign out", () => {
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
    syncValue.syncNow = vi.fn();
    // Default: the pre-sign-out sync cleared everything.
    syncValue.readPendingCount = vi.fn().mockResolvedValue(0);
    window.localStorage.setItem("leftover", "1");
    window.sessionStorage.setItem("leftover", "1");
  });

  afterEach(() => {
    window.confirm = realConfirm;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
    syncValue.pendingCount = 0;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  // Reach the confirm panel: the account-active section's ghost "Sign out"
  // button is what reveals it.
  const openSignOutPanel = () => {
    render(<SyncSettings />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
  };

  it("clears local data, wipes web storage, and reloads once confirmed", async () => {
    confirm.mockReturnValue(true);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    // true is the clear-local-data flag: signing out always erases this browser.
    expect(syncValue.signOut).toHaveBeenCalledWith(true);
    expect(window.sessionStorage.length).toBe(0);
    // Nothing survives, including the landing flag: the reload starts this
    // browser over on the landing page.
    expect(window.localStorage.length).toBe(0);
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

  it("syncs before signing out, so pending work is pushed first", async () => {
    confirm.mockReturnValue(true);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(syncValue.syncNow).toHaveBeenCalled();
    // The sync has to run before the wipe, or it would push nothing.
    const syncOrder = vi.mocked(syncValue.syncNow).mock.invocationCallOrder[0];
    const outOrder = vi.mocked(syncValue.signOut).mock.invocationCallOrder[0];
    expect(syncOrder).toBeLessThan(outOrder);
  });

  it("signs out even when the pre-sign-out sync throws", async () => {
    confirm.mockReturnValue(true);
    syncValue.syncNow = vi.fn().mockRejectedValue(new Error("network down"));
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(syncValue.signOut).toHaveBeenCalledWith(true);
  });

  it("does not warn when the sync cleared everything", async () => {
    confirm.mockReturnValue(true);
    syncValue.pendingCount = 5;
    syncValue.readPendingCount = vi.fn().mockResolvedValue(0);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });

  it("warns separately about changes the sync could not push", async () => {
    confirm.mockReturnValue(true);
    syncValue.readPendingCount = vi.fn().mockResolvedValue(3);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(1);
    // The count is what matters; the wording of the prompt is copy.
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  it("aborts when the unpushed-changes warning is dismissed", async () => {
    confirm.mockReturnValueOnce(false);
    syncValue.readPendingCount = vi.fn().mockResolvedValue(2);
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(syncValue.signOut).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("leftover")).toBe("1");
  });

  it("falls back to the last known count when storage cannot be read", async () => {
    confirm.mockReturnValue(true);
    syncValue.pendingCount = 4;
    syncValue.readPendingCount = vi
      .fn()
      .mockRejectedValue(new Error("storage gone"));
    openSignOutPanel();

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("4"));
  });
});
