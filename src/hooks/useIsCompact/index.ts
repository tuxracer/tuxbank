import { useSyncExternalStore } from "react";
import { COMPACT_MEDIA_QUERY } from "./consts";

export * from "./consts";

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(COMPACT_MEDIA_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(COMPACT_MEDIA_QUERY).matches;

/** True below the compact breakpoint; updates live as the window resizes. */
export const useIsCompact = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot);
