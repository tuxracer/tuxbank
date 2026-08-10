import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { SyncStatus } from "@/context/SyncContext";
import { SyncAttentionBadge, SyncAttentionDot } from "./index";

const mockSync = vi.hoisted(() => ({ status: "off" as SyncStatus }));

vi.mock("@/context/SyncContext", () => ({
  useSync: () => ({ status: mockSync.status }),
}));

// Which statuses warrant a visible warning is the only logic here; the wording
// of the label is copy and deliberately not asserted.
const ATTENTION: SyncStatus[] = ["offline", "locked", "error"];
const QUIET: SyncStatus[] = ["off", "syncing", "synced"];

describe.each([
  ["SyncAttentionBadge", SyncAttentionBadge],
  ["SyncAttentionDot", SyncAttentionDot],
])("%s", (_name, Component) => {
  it.each(ATTENTION)("warns about the %s status", (status) => {
    mockSync.status = status;
    const { container } = render(<Component />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it.each(QUIET)("renders nothing for the %s status", (status) => {
    mockSync.status = status;
    const { container } = render(<Component />);
    expect(container).toBeEmptyDOMElement();
  });
});
