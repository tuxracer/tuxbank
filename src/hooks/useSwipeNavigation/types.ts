import type { PointerEvent as ReactPointerEvent } from "react";

export type SwipeNavigationOptions = {
  /** When false, all returned handlers are inert. */
  enabled: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
};

export type SwipeNavigationHandlers = {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
};
