import { useRef } from "react";
import {
  WHEEL_FLICK_RISE_FACTOR,
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
 * would turn one flick into several months.
 *
 * The swallow ends at whichever comes first: a WHEEL_IDLE_RESET_MS quiet gap
 * in the event stream, or a fresh flick detected inside the momentum tail. A
 * tail only ever decays, so once it has started shrinking, a delta that jumps
 * past WHEEL_FLICK_RISE_FACTOR times its predecessor (or reverses direction)
 * is new finger input; quick successive flicks therefore chain month-per-
 * flick without waiting for the previous tail to die out.
 */
export const useWheelNavigation = ({
  enabled,
  onPrev,
  onNext,
}: WheelNavigationOptions): WheelNavigationHandlers => {
  const accumulatedPx = useRef(0);
  const lastEventAt = useRef(0);
  const lastDeltaPx = useRef(0);
  const coasting = useRef(false);
  const tailDecaying = useRef(false);

  return {
    onWheel: (e) => {
      if (!enabled) return;
      const now = Date.now();
      const idle = now - lastEventAt.current >= WHEEL_IDLE_RESET_MS;
      lastEventAt.current = now;
      // Horizontally dominated events are two-finger pans, not month
      // navigation; skip them without polluting the vertical-delta history.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const deltaPx = deltaToPx(e.deltaY, e.deltaMode);
      // A zero delta carries no travel and must not enter the delta history:
      // storing 0 as the predecessor would let the next tiny momentum event
      // pass the flick rise test (anything >= 0) and end the swallow early,
      // turning one flick into two navigations.
      if (deltaPx === 0) return;
      const prevPx = lastDeltaPx.current;
      lastDeltaPx.current = deltaPx;
      if (idle) {
        accumulatedPx.current = 0;
        coasting.current = false;
      } else if (coasting.current) {
        if (Math.abs(deltaPx) < Math.abs(prevPx)) tailDecaying.current = true;
        const reversed = deltaPx * prevPx < 0;
        const flicked =
          tailDecaying.current &&
          Math.abs(deltaPx) >= Math.abs(prevPx) * WHEEL_FLICK_RISE_FACTOR;
        if (reversed || flicked) {
          accumulatedPx.current = 0;
          coasting.current = false;
        }
      }
      if (coasting.current) return;
      accumulatedPx.current += deltaPx;
      if (Math.abs(accumulatedPx.current) < WHEEL_NAVIGATE_THRESHOLD_PX) return;
      const goNext = accumulatedPx.current > 0;
      accumulatedPx.current = 0;
      coasting.current = true;
      tailDecaying.current = false;
      if (goNext) onNext();
      else onPrev();
    },
  };
};
