import { useRef } from "react";
import {
  WHEEL_IDLE_RESET_MS,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_NAVIGATE_THRESHOLD_PX,
} from "./consts";
import type { WheelNavigationOptions, WheelNavigationHandlers } from "./types";

export * from "./consts";
export * from "./types";

// Normalize non-pixel delta units so the threshold means the same physical
// travel everywhere: Firefox reports lines, and page-mode ticks count as a
// full threshold each.
const deltaToPx = (delta: number, mode: number): number => {
  if (mode === WheelEvent.DOM_DELTA_LINE) return delta * WHEEL_LINE_HEIGHT_PX;
  if (mode === WheelEvent.DOM_DELTA_PAGE)
    return delta * WHEEL_NAVIGATE_THRESHOLD_PX;
  return delta;
};

/**
 * Wheel/trackpad month navigation. Vertical scroll accumulates until it
 * reaches WHEEL_NAVIGATE_THRESHOLD_PX, then fires onNext (scroll down) or
 * onPrev (scroll up) once and swallows the rest of the gesture: trackpad
 * momentum keeps emitting events after the fingers lift, and honoring them
 * would turn one flick into several months. A WHEEL_IDLE_RESET_MS quiet gap
 * in the event stream starts the next gesture.
 */
export const useWheelNavigation = ({
  enabled,
  onPrev,
  onNext,
}: WheelNavigationOptions): WheelNavigationHandlers => {
  const accumulatedPx = useRef(0);
  const lastEventAt = useRef(0);
  const coasting = useRef(false);

  return {
    onWheel: (e) => {
      if (!enabled) return;
      const now = Date.now();
      const idle = now - lastEventAt.current >= WHEEL_IDLE_RESET_MS;
      lastEventAt.current = now;
      if (idle) {
        accumulatedPx.current = 0;
        coasting.current = false;
      }
      if (coasting.current) return;
      accumulatedPx.current += deltaToPx(e.deltaY, e.deltaMode);
      if (Math.abs(accumulatedPx.current) < WHEEL_NAVIGATE_THRESHOLD_PX) return;
      const goNext = accumulatedPx.current > 0;
      accumulatedPx.current = 0;
      coasting.current = true;
      if (goNext) onNext();
      else onPrev();
    },
  };
};
