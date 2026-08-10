import { REPO_URL } from "@/components/AboutDialog";
import { catColorVar } from "@/utils/categoryColor";
import {
  LANDING_FEATURES,
  LANDING_PREVIEW_DAYS,
  LANDING_PREVIEW_EVENTS,
  LANDING_PREVIEW_TODAY,
  LANDING_PREVIEW_TRAILING,
  LANDING_PREVIEW_WEEKDAYS,
} from "./consts";

import type { LandingPageProps } from "./types";

export * from "./consts";
export * from "./types";

/**
 * Decorative month grid beside the pitch. Static markup using the real cell and
 * chip treatments, so the preview stays honest when the design system changes.
 * Hidden below `sm`: a 7-column grid at phone width is unreadable and the CTA is
 * what matters there.
 */
const PreviewGrid = () => (
  <div className="hidden w-full flex-col gap-1.5 sm:flex">
    <div className="grid grid-cols-7 gap-1.5">
      {LANDING_PREVIEW_WEEKDAYS.map((day, index) => (
        <div key={index} className="cy-weekhead px-1 text-[10px]">
          {day}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from(
        { length: LANDING_PREVIEW_DAYS + LANDING_PREVIEW_TRAILING },
        (_, index) => {
          const dayOfMonth = index + 1;
          const inMonth = dayOfMonth <= LANDING_PREVIEW_DAYS;
          const label = inMonth
            ? dayOfMonth
            : dayOfMonth - LANDING_PREVIEW_DAYS;
          const event = inMonth
            ? LANDING_PREVIEW_EVENTS[dayOfMonth]
            : undefined;
          const classes = [
            "cy-cell",
            "flex",
            "min-h-16",
            "flex-col",
            "gap-1",
            "p-1.5",
          ];
          if (!inMonth) classes.push("out");
          if (inMonth && dayOfMonth === LANDING_PREVIEW_TODAY)
            classes.push("today");
          return (
            <div key={index} className={classes.join(" ")}>
              <span className="cy-cell-num text-[10px]">
                {String(label).padStart(2, "0")}
              </span>
              {event && (
                <span
                  className="cy-chip"
                  style={{ borderLeftColor: catColorVar(event.color) }}
                >
                  <span className="truncate">{event.title}</span>
                  <span className="cy-mono ml-auto pl-1">{event.amount}</span>
                </span>
              )}
            </div>
          );
        },
      )}
    </div>
  </div>
);

/**
 * First-visit entry screen. Shown until the visitor clicks Try Now (or is
 * otherwise known to be past it: see `src/lib/landingGate`); after that the
 * app boots straight into the calendar.
 */
const LandingPage = ({ onTryNow }: LandingPageProps) => (
  <main className="flex min-h-[100dvh] flex-col gap-10 overflow-y-auto p-4 sm:p-8">
    <header className="cy-hud flex items-center justify-between gap-3">
      <span>
        tuxbank <span className="dim">{"// local-first money calendar"}</span>
      </span>
      <span className="on hidden sm:inline">no account required</span>
    </header>

    <section className="grid grow items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col items-start gap-6">
        <h1 className="cy-display text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.95] font-bold text-[color:var(--cy-text-strong)]">
          See your money
          <br />
          as a <span className="text-[color:var(--cy-cyan)]">month</span>.
        </h1>

        <p className="max-w-[34ch] text-base text-[color:var(--cy-text)] sm:text-lg">
          Deposits and withdrawals land on the days they happen. The running
          balance moves with them.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="cy-cta px-10 py-3.5 text-lg"
            onClick={onTryNow}
          >
            Try now
          </button>
          <span className="cy-mono text-xs text-[color:var(--cy-muted)]">
            no signup, nothing to enter first
          </span>
        </div>
      </div>

      <PreviewGrid />
    </section>

    <section className="grid gap-x-10 gap-y-6 border-t border-[color:var(--cy-line)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
      {LANDING_FEATURES.map((feature) => (
        <div key={feature.title} className="flex flex-col gap-1.5">
          <h2 className="cy-mono text-[11px] tracking-[0.18em] text-[color:var(--cy-cyan)] uppercase">
            {feature.title}
          </h2>
          <p className="text-sm text-[color:var(--cy-muted)]">{feature.body}</p>
        </div>
      ))}
    </section>

    <footer className="cy-mono pb-1 text-xs text-[color:var(--cy-muted)]">
      MIT licensed ·{" "}
      <a
        className="text-[color:var(--cy-cyan)] underline underline-offset-2"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        Source on GitHub
      </a>
    </footer>
  </main>
);

export default LandingPage;
