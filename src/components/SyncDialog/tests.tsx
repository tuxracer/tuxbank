import { describe, it, expect, beforeEach, vi } from "vitest";
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
