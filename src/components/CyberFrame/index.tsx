"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Must match the chamfer in `.cy-dialog::before`'s clip-path (globals.css).
const CHAMFER = 20;
const STROKE = 1;

/**
 * Cyberpunk dialog border. Traces the same chamfered octagon as a
 * `.cy-dialog`'s panel fill, but as an SVG vector stroke so the border keeps a
 * uniform width and brightness on every edge — including the 45° chamfers,
 * which a CSS clip-path fill rasterizes brighter than the straight edges (the
 * cyan there spreads over ~√2 more pixels), making the square corners look
 * comparatively dark. The host's size is measured at runtime so the fixed 20px
 * chamfer stays a true 45° cut at any dialog size. Render as a child of a
 * `.cy-dialog` (its `fixed`/portaled positioning is the containing block).
 */
export const CyberFrame = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clamp so a small popover can't produce overlapping/negative points.
  const c = Math.min(CHAMFER, w / 2, h / 2);
  const s = STROKE / 2; // inset the centered stroke so it stays within the canvas
  const points =
    w > 0 && h > 0
      ? `${s},${s} ${w - c},${s} ${w - s},${c} ${w - s},${h - s} ${c},${h - s} ${s},${h - c}`
      : "";

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0">
      {points && (
        <svg width={w} height={h} className="absolute inset-0">
          <polygon
            points={points}
            fill="none"
            stroke="var(--cy-cyan)"
            strokeWidth={STROKE}
          />
        </svg>
      )}
    </div>
  );
};
