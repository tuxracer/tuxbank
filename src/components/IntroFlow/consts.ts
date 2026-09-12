import type { CSSProperties } from "react";
import type { IncomeCadence } from "@/lib/introPlan";
import type { IntroStep } from "./types";

/** The question screens, in the order the progress pills count them. */
export const QUESTION_STEPS: readonly Exclude<IntroStep, "welcome">[] = [
  "balance",
  "income",
  "bill",
];

/** The segments of the how-often control, left to right. */
export const CADENCE_OPTIONS: readonly {
  value: IncomeCadence;
  label: string;
}[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

/** The cadence the income step opens on: the most common pay schedule. */
export const DEFAULT_CADENCE: IncomeCadence = "biweekly";

/*
 * The how-often control is the event editor's two-segment direction pill with
 * a third segment: the chosen segment fills in the interface accent, the rest
 * stay muted text over the track. Inline styles so the fill wins over the
 * Button's hover utilities.
 */
export const SEGMENT_ACTIVE: CSSProperties = {
  background: "var(--cy-cyan)",
  color: "var(--cy-cta-fg)",
};
export const SEGMENT_IDLE: CSSProperties = { color: "var(--cy-muted)" };

/**
 * Entrance choreography for the flow's first paint, as milliseconds from mount,
 * on the landing page's own top-down grammar: masthead, then the question,
 * then the controls that answer it.
 */
export const INTRO_ENTRANCE_MS = {
  header: 0,
  body: 60,
} as const;
