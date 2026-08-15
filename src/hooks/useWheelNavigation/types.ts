import type { WheelEvent as ReactWheelEvent } from "react";

export type WheelNavigationOptions = {
  /** When false, the returned handler is inert. */
  enabled: boolean;
  /** Scroll up: typically previous month. */
  onPrev: () => void;
  /** Scroll down: typically next month. */
  onNext: () => void;
};

export type WheelNavigationHandlers = {
  onWheel: (e: ReactWheelEvent<HTMLElement>) => void;
};
