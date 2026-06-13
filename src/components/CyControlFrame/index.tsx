import { CyberFrame } from "@/components/CyberFrame";

import type { ReactNode } from "react";

// Chamfer sizes must match the clip-path chamfers on `.cy-btn` / `.cy-nav`
// in globals.css.
const VARIANTS = {
  btn: { chamfer: 8, color: "var(--cy-line)" },
  nav: { chamfer: 9, color: "var(--cy-cyan)" },
} as const;

const BOTTOM_RIGHT = ["br"] as const;

type CyControlFrameProps = {
  // Which control class the child carries: `.cy-btn` (default) or `.cy-nav`.
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
};

/**
 * Overlays a <CyberFrame> border on a single chamfered control (a `.cy-btn`
 * or `.cy-nav` button/select). Those classes clip the control's fill but draw
 * no CSS border: a `border` would be sliced off by the clip-path, leaving the
 * chamfered corner borderless. The SVG stroke rendered here traces the full
 * outline instead, including the 45° chamfer. Rendered as an overlay sibling
 * (not a child) so it works for <select>, which can't contain children, and
 * so the host's clip-path can't clip the stroke.
 */
export const CyControlFrame = ({
  variant = "btn",
  children,
}: CyControlFrameProps) => {
  const { chamfer, color } = VARIANTS[variant];
  return (
    <div className="relative grid">
      {children}
      <CyberFrame chamfer={chamfer} corners={BOTTOM_RIGHT} color={color} />
    </div>
  );
};
