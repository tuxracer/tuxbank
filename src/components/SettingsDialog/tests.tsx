import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import SettingsDialog from "./index";
import type { SettingsTab } from "./types";
import type { SyncContextValue } from "@/context/SyncContext";

const mocks = vi.hoisted(() => ({ compact: false }));

vi.mock("@/hooks/useIsCompact", () => ({
  useIsCompact: () => mocks.compact,
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
  signInWithLink: vi.fn(),
  unlock: vi.fn(),
  changePassword: vi.fn(),
  recoverWithKey: vi.fn(),
  signOut: vi.fn(),
  resetAllData: vi.fn(),
  importData: vi.fn(),
  unlocked: true,
  syncNow: vi.fn(),
  createDeviceLink: vi.fn(),
  signInChoice: null,
  resolveSignInChoice: vi.fn(),
};

vi.mock("@/context/SyncContext", () => ({
  useSync: () => syncValue,
}));

const paneProps = {
  data: {
    currentEventCount: 3,
    currentCategoryCount: 2,
    storageAvailable: true,
    includesCloud: false,
    onExport: vi.fn().mockResolvedValue(undefined),
    onPreviewImport: vi
      .fn()
      .mockResolvedValue({ events: 5, categories: 4, schemaVersion: 1 }),
    onCommitImport: vi.fn().mockResolvedValue(undefined),
    onClearAllData: vi.fn().mockResolvedValue(undefined),
  },
  categories: {
    categories: [],
    usageCountById: {},
    onRename: vi.fn(),
    onRecolor: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
  },
};

// The dialog is controlled; the harness supplies the tab state App owns.
const Harness = ({
  initialTab = null,
}: {
  initialTab?: SettingsTab | null;
}) => {
  const [tab, setTab] = useState<SettingsTab | null>(initialTab);
  return (
    <SettingsDialog
      open
      tab={tab}
      onTabChange={setTab}
      onOpenChange={() => {}}
      {...paneProps}
    />
  );
};

describe("SettingsDialog on wide screens", () => {
  beforeEach(() => {
    mocks.compact = false;
  });

  it("shows the sync pane when no tab is picked", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: /sync now/i }),
    ).toBeInTheDocument();
  });

  it("switches panes from the rail tabs", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /^data$/i }));
    expect(
      screen.getByRole("button", { name: /export database/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sync now/i }),
    ).not.toBeInTheDocument();
  });

  it("opens directly on a requested tab", () => {
    render(<Harness initialTab="categories" />);
    expect(
      screen.getByPlaceholderText(/search or create/i),
    ).toBeInTheDocument();
  });
});

describe("SettingsDialog on compact screens", () => {
  beforeEach(() => {
    mocks.compact = true;
  });

  it("starts on the root menu with no pane shown", () => {
    render(<Harness />);
    expect(screen.getByText(/backup, restore/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /export database/i }),
    ).not.toBeInTheDocument();
  });

  it("drills into a section and comes back", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /categories/i }));
    expect(
      screen.getByPlaceholderText(/search or create/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Back"));
    expect(
      screen.queryByPlaceholderText(/search or create/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/backup, restore/i)).toBeInTheDocument();
  });

  it("opens directly on the sync section when asked (onboarding hand-off)", () => {
    render(<Harness initialTab="sync" />);
    expect(
      screen.getByRole("button", { name: /sync now/i }),
    ).toBeInTheDocument();
  });
});
