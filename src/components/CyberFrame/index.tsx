import { useLayoutEffect, useRef, useState } from "react";

const CORNERS = ["tl", "tr", "br", "bl"] as const;
type Corner = (typeof CORNERS)[number];

type CyberFrameProps = {
  // Chamfer size in px; must match the host's `::before`/`::after` clip-path chamfer.
  chamfer?: number;
  // Which corners are cut. Defaults to the dialog/toolbar shape (top-right + bottom-left).
  corners?: readonly Corner[];
  // Stroke color — any CSS color, e.g. a `var(--cy-*)` token.
  color?: string;
  strokeWidth?: number;
};

const DEFAULT_CORNERS: readonly Corner[] = ["tr", "bl"];

// Vertices a corner contributes to the clockwise outline (TL→TR→BR→BL): a
// chamfered corner emits two points (one per adjacent edge), a square corner
// one. `s` insets the centered stroke so it stays within the SVG canvas.
const cornerPoints = (
  corner: Corner,
  w: number,
  h: number,
  s: number,
  c: number,
  chamfered: boolean,
): string[] => {
  switch (corner) {
    case "tl":
      return chamfered ? [`${s},${s + c}`, `${s + c},${s}`] : [`${s},${s}`];
    case "tr":
      return chamfered ? [`${w - c},${s}`, `${w - s},${c}`] : [`${w - s},${s}`];
    case "br":
      return chamfered
        ? [`${w - s},${h - c}`, `${w - c},${h - s}`]
        : [`${w - s},${h - s}`];
    case "bl":
      return chamfered ? [`${c},${h - s}`, `${s},${h - c}`] : [`${s},${h - s}`];
  }
};

/**
 * Cyberpunk panel border. Traces the host's chamfered outline as an SVG vector
 * stroke so the border keeps a uniform width and brightness on every edge —
 * including the 45° chamfers, which a CSS `clip-path` fill rasterizes brighter
 * than the straight edges (the color there spreads over ~√2 more pixels),
 * leaving the square corners looking comparatively dark. The host is measured at
 * runtime so a fixed-px chamfer stays a true 45° cut at any size.
 *
 * Render as a child of a `position`ed host whose chamfered fill lives on a
 * pseudo-element (so this SVG isn't clipped away). The host's own `clip-path`
 * must be removed. `chamfer`/`corners` must match that pseudo-element's shape.
 * For controls that can't contain children or pseudo-elements (`<select>`),
 * render it instead as an overlay sibling inside a positioned wrapper, with
 * the clipped fill staying on the control itself — see <CyControlFrame>.
 */
export const CyberFrame = ({
  chamfer = 20,
  corners = DEFAULT_CORNERS,
  color = "var(--cy-cyan)",
  strokeWidth = 1,
}: CyberFrameProps) => {
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

  // Clamp so a small host can't produce overlapping/negative points.
  const c = Math.min(chamfer, w / 2, h / 2);
  const s = strokeWidth / 2;
  const cornerSet = new Set(corners);
  const points =
    w > 0 && h > 0
      ? CORNERS.flatMap((corner) =>
          cornerPoints(corner, w, h, s, c, cornerSet.has(corner)),
        ).join(" ")
      : "";

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {points && (
        <svg width={w} height={h} className="absolute inset-0">
          <polygon
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
          />
        </svg>
      )}
    </div>
  );
};
