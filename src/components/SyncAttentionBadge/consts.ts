import type { SyncStatus } from "@/context/SyncContext";
import type { SyncAttention } from "./types";

/** Statuses that warrant a persistent toolbar cue; absent statuses render nothing. */
export const SYNC_ATTENTION: Partial<Record<SyncStatus, SyncAttention>> = {
  offline: { label: "Offline", colorVar: "var(--cy-yellow)" },
  locked: { label: "Locked", colorVar: "var(--cy-magenta)" },
  choice: { label: "Attention", colorVar: "var(--cy-magenta)" },
  error: { label: "Error", colorVar: "var(--cy-orange)" },
};
