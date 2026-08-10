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
