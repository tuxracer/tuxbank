import { useRef } from "react";
import { SWIPE_MIN_DISTANCE_PX } from "./consts";
import type { SwipeNavigationOptions, SwipeNavigationHandlers } from "./types";

export * from "./consts";
export * from "./types";

/**
 * Down/up delta swipe detection (no move tracking, no pointer capture).
 * Fires onSwipeLeft/onSwipeRight when the horizontal travel reaches
 * SWIPE_MIN_DISTANCE_PX and exceeds the vertical travel.
 */
export const useSwipeNavigation = ({
  enabled,
  onSwipeLeft,
  onSwipeRight,
}: SwipeNavigationOptions): SwipeNavigationHandlers => {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (e) => {
      if (!enabled) return;
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e) => {
      if (!enabled || !start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
};
