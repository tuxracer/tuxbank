import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SyncStatus } from "@/context/SyncContext";
import { SyncAttentionBadge, SyncAttentionDot } from "./index";

const mockSync = vi.hoisted(() => ({ status: "off" as SyncStatus }));

vi.mock("@/context/SyncContext", () => ({
  useSync: () => ({ status: mockSync.status }),
}));

const renderWithStatus = (status: SyncStatus) => {
  mockSync.status = status;
  return render(<SyncAttentionBadge />);
};

describe("SyncAttentionBadge", () => {
  it.each([
    ["offline", "OFFLINE"],
    ["locked", "LOCKED"],
    ["error", "ERROR"],
  ] as const)("labels the %s status %s", (status, label) => {
    renderWithStatus(status);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(["off", "syncing", "synced"] as const)(
    "renders nothing for the %s status",
    (status) => {
      const { container } = renderWithStatus(status);
      expect(container).toBeEmptyDOMElement();
    },
  );
});

describe("SyncAttentionDot", () => {
  it.each([
    ["offline", "OFFLINE"],
    ["locked", "LOCKED"],
    ["error", "ERROR"],
  ] as const)("shows a dot titled %s -> %s", (status, label) => {
    mockSync.status = status;
    render(<SyncAttentionDot />);
    expect(screen.getByTitle(label)).toBeInTheDocument();
  });

  it.each(["off", "syncing", "synced"] as const)(
    "renders nothing for the %s status",
    (status) => {
      mockSync.status = status;
      const { container } = render(<SyncAttentionDot />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
