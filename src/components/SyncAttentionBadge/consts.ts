import type { SyncStatus } from "@/context/SyncContext";
import type { SyncAttention } from "./types";

/** Statuses that warrant a persistent toolbar cue; absent statuses render nothing. */
export const SYNC_ATTENTION: Partial<Record<SyncStatus, SyncAttention>> = {
  offline: { label: "OFFLINE", colorVar: "var(--cy-yellow)" },
  locked: { label: "LOCKED", colorVar: "var(--cy-magenta)" },
  error: { label: "ERROR", colorVar: "var(--cy-orange)" },
};
