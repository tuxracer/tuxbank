import { useSync } from "@/context/SyncContext";
import { SYNC_ATTENTION } from "./consts";

export * from "./consts";
export * from "./types";

export const SyncAttentionBadge = () => {
  const { status } = useSync();
  const attention = SYNC_ATTENTION[status];
  if (!attention) return null;
  return (
    <span
      className="cy-mono flex items-center gap-1.5 text-[10px] uppercase"
      style={{ color: attention.colorVar }}
    >
      <span
        className="inline-block h-2.5 w-2.5 animate-pulse rounded-full"
        style={{
          background: attention.colorVar,
          boxShadow: `0 0 8px ${attention.colorVar}`,
        }}
      />
      {attention.label}
    </span>
  );
};

/** Bare pulsing attention dot for tight spots (compact toolbar menu trigger). */
export const SyncAttentionDot = () => {
  const { status } = useSync();
  const attention = SYNC_ATTENTION[status];
  if (!attention) return null;
  return (
    <span
      title={attention.label}
      className="inline-block h-2 w-2 animate-pulse rounded-full"
      style={{
        background: attention.colorVar,
        boxShadow: `0 0 8px ${attention.colorVar}`,
      }}
    />
  );
};
