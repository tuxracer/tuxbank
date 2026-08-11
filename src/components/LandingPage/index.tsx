import { useLayoutEffect, useRef } from "react";
import { COLS, WEEKDAYS } from "@/components/MonthGrid";
import { catColorVar } from "@/utils/categoryColor";
import { formatCurrency, formatSignedCompact } from "@/utils/formatCurrency";
import { prefersReducedMotion } from "@/utils/prefersReducedMotion";
import {
  LANDING_COUNT_MS,
  LANDING_ENTRANCE_MS,
  LANDING_PREVIEW_CARRY_IN,
  LANDING_PREVIEW_COMPACT_ROWS,
  LANDING_PREVIEW_DAYS,
  LANDING_PREVIEW_EVENTS,
  LANDING_PREVIEW_MONTH,
  LANDING_PREVIEW_ROWS,
  LANDING_PREVIEW_TODAY,
  LANDING_PREVIEW_TODAY_DATE,
  LANDING_SPECS,
  LANDING_STAGGER_MS,
  REPO_URL,
} from "./consts";

import type {
  LandingPageProps,
  LandingPreviewDay,
  LandingPreviewTotals,
} from "./types";

export * from "./consts";
export * from "./types";

/**
 * Walks the preview month once, carrying the running balance forward the same
 * way `@/lib/balance` does for real data, so the figures printed in the cells
 * and on the rail can never drift from the transactions above them.
 */
const buildPreviewMonth = (): {
  days: LandingPreviewDay[];
  totals: LandingPreviewTotals;
} => {
  const days: LandingPreviewDay[] = [];
  const totals: LandingPreviewTotals = {
    deposits: 0,
    withdrawals: 0,
    end: LANDING_PREVIEW_CARRY_IN,
  };
  let balance = LANDING_PREVIEW_CARRY_IN;

  for (let index = 0; index < LANDING_PREVIEW_COMPACT_ROWS * COLS; index++) {
    const dayOfMonth = index + 1;
    const inMonth = dayOfMonth <= LANDING_PREVIEW_DAYS;
    const event = inMonth ? LANDING_PREVIEW_EVENTS[dayOfMonth] : undefined;
    const prevBalance = balance;

    if (event) {
      balance += event.amount;
      if (event.amount < 0) totals.withdrawals += event.amount;
      else totals.deposits += event.amount;
    }

    days.push({
      label: inMonth ? dayOfMonth : dayOfMonth - LANDING_PREVIEW_DAYS,
      inMonth,
      prevBalance,
      balance,
      event,
    });
  }

  totals.end = balance;
  return { days, totals };
};

const { days: PREVIEW_DAYS, totals: PREVIEW_TOTALS } = buildPreviewMonth();

/**
 * The wide grid drops the sixth week, the way MonthGrid renders only the weeks
 * the month spans once it has the height for taller cells.
 */
const PREVIEW_WIDE_DAYS = PREVIEW_DAYS.slice(0, LANDING_PREVIEW_ROWS * COLS);

/**
 * The day the compact panel is opened on. March 2026 starts on a Sunday, so
 * there are no leading blanks and day N sits at index N-1.
 */
const PREVIEW_PANEL_DAY = PREVIEW_DAYS[LANDING_PREVIEW_TODAY - 1];

/** The panel lands once the last cell above it has. */
const PREVIEW_PANEL_DELAY_MS =
  LANDING_ENTRANCE_MS.grid + PREVIEW_DAYS.length * LANDING_STAGGER_MS;

const panelDateLabeler = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** Matches the `ease-out` the cells fade in on, so figure and cell settle together. */
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/**
 * Runs a cell's balance up from the day before's figure to its own, starting
 * when the cell lands. The hero claims the running balance moves with the
 * transactions, and this is the one place the page can show that rather than
 * assert it.
 *
 * React only ever commits the settled figure; the animation writes over the
 * node for its ~220ms and puts the true value back on the way out. So reduced
 * motion, a re-render mid-flight, or the count never starting all leave a
 * correct month on screen.
 */
const CountUpBalance = ({
  className,
  delayMs,
  from,
  to,
}: {
  className: string;
  delayMs: number;
  from: number;
  to: number;
}) => {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || from === to || prefersReducedMotion()) return;

    const startAt = performance.now() + delayMs;
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = Math.max(now - startAt, 0);
      const progress = Math.min(elapsed / LANDING_COUNT_MS, 1);
      node.textContent = formatCurrency(
        Math.round(from + (to - from) * easeOutCubic(progress)),
      );
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    node.textContent = formatCurrency(from);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      node.textContent = formatCurrency(to);
    };
  }, [delayMs, from, to]);

  return (
    <span ref={ref} className={className}>
      {formatCurrency(to)}
    </span>
  );
};

/** One figure on the console rail: a mono value under its key. */
const RailFigure = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <span className="cy-hud">{label}</span>
    <span className="cy-mono text-sm text-[color:var(--cy-text-strong)] sm:text-base">
      {value}
    </span>
  </div>
);

const chipStyle = (day: LandingPreviewDay) => ({
  borderLeftColor: day.event ? catColorVar(day.event.color) : undefined,
});

/** The weekday header row, identical in both previews and in the real grid. */
const PreviewWeekHead = () => (
  <div className="grid grid-cols-7 gap-1.5">
    {WEEKDAYS.map((day) => (
      <div key={day} className="cy-weekhead px-1">
        {day}
      </div>
    ))}
  </div>
);

/**
 * The month grid at the density the real calendar uses above `sm`: every cell
 * carries its date, its chips and its running balance, and the balance turns
 * magenta where rent overdraws the account before payday.
 */
const PreviewGrid = () => (
  <div className="hidden flex-col gap-1.5 p-2 sm:flex sm:p-3">
    <PreviewWeekHead />
    <div className="grid grid-cols-7 gap-1.5">
      {PREVIEW_WIDE_DAYS.map((day, index) => {
        const classes = ["cy-cell", "cy-land", "flex", "flex-col", "gap-1"];
        classes.push("min-h-[4.75rem]", "p-1.5", "lg:min-h-[5.5rem]");
        if (!day.inMonth) classes.push("out");
        if (day.inMonth && day.label === LANDING_PREVIEW_TODAY)
          classes.push("today");

        const delayMs = LANDING_ENTRANCE_MS.grid + index * LANDING_STAGGER_MS;

        return (
          <div
            key={index}
            className={classes.join(" ")}
            style={{ animationDelay: `${delayMs}ms` }}
          >
            <span className="cy-cell-num">{day.label}</span>
            {day.event && (
              <span className="cy-chip" style={chipStyle(day)}>
                <span className="truncate">{day.event.title}</span>
                <span className="cy-chip-amount ml-auto">
                  {formatSignedCompact(day.event.amount)}
                </span>
              </span>
            )}
            {/* Magenta is keyed to where the figure lands, not to what it reads
                mid-count, so the colour announces the overdraw from the start
                instead of flipping partway through. */}
            <CountUpBalance
              className={`cy-balance mt-auto self-end ${day.balance < 0 ? "cy-balance-neg" : ""}`}
              delayMs={delayMs}
              from={day.prevBalance}
              to={day.balance}
            />
          </div>
        );
      })}
    </div>
  </div>
);

/**
 * Stands in for the app's DayPanel, which is where a phone reads the detail a
 * cell has no room for: the selected day's date and balance over its events,
 * with the + Add button that replaces the toolbar's New Event in compact.
 * Inert, like the rest of the console — this is a picture of the app, so
 * nothing in it should invite a tap that goes nowhere.
 */
const PreviewPanel = () => (
  <div
    className="cy-toolbar cy-land pointer-events-none flex flex-col gap-2 px-3 py-2.5"
    style={{ animationDelay: `${PREVIEW_PANEL_DELAY_MS}ms` }}
  >
    <div className="flex items-center justify-between gap-2">
      <p className="cy-mono text-[10px] tracking-widest text-[color:var(--cy-cyan)] uppercase">
        {panelDateLabeler.format(LANDING_PREVIEW_TODAY_DATE)}
      </p>
      <CountUpBalance
        className={`cy-balance ${PREVIEW_PANEL_DAY.balance < 0 ? "cy-balance-neg" : ""}`}
        delayMs={PREVIEW_PANEL_DELAY_MS}
        from={PREVIEW_PANEL_DAY.prevBalance}
        to={PREVIEW_PANEL_DAY.balance}
      />
    </div>
    <div className="flex flex-col gap-1">
      <span className="cy-chip w-full" style={chipStyle(PREVIEW_PANEL_DAY)}>
        <span className="truncate">{PREVIEW_PANEL_DAY.event?.title}</span>
        <span className="cy-chip-amount ml-auto">
          {formatSignedCompact(PREVIEW_PANEL_DAY.event?.amount ?? 0)}
        </span>
      </span>
    </div>
    <span className="cy-cta self-end px-4 py-1.5 text-xs">+ Add</span>
  </div>
);

/**
 * Phone-width preview. The app does not fall back to a list below `sm` — it
 * keeps the month grid and drops what will not fit, so the cells carry a dot
 * per event instead of chips and balances, the grid always fills six weeks
 * rather than the five March spans, and the detail moves to the day panel
 * underneath. Anything friendlier here would be advertising a screen the
 * visitor is never going to see.
 */
const PreviewCompact = () => (
  <div className="flex flex-col gap-2 p-1.5 sm:hidden">
    <div className="flex flex-col gap-1.5">
      <PreviewWeekHead />
      <div className="grid grid-cols-7 gap-1.5">
        {PREVIEW_DAYS.map((day, index) => {
          const classes = ["cy-cell", "cy-land", "flex", "flex-col", "gap-1"];
          classes.push("min-h-11", "p-1.5");
          if (!day.inMonth) classes.push("out");
          if (day.inMonth && day.label === LANDING_PREVIEW_TODAY)
            classes.push("today");

          return (
            <div
              key={index}
              className={classes.join(" ")}
              style={{
                animationDelay: `${LANDING_ENTRANCE_MS.grid + index * LANDING_STAGGER_MS}ms`,
              }}
            >
              <span className="cy-cell-num">{day.label}</span>
              <div className="flex flex-wrap items-center gap-1">
                {day.event && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: catColorVar(day.event.color) }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    <PreviewPanel />
  </div>
);

/**
 * First-visit entry screen. Shown until the visitor clicks Try Now (or is
 * otherwise known to be past it: see `src/lib/landingGate`); after that the
 * app boots straight into the calendar.
 */
const LandingPage = ({
  onTryNow,
  leaving = false,
  onExited,
}: LandingPageProps) => (
  <main
    className={`h-[100dvh] overflow-y-auto ${leaving ? "cy-exit" : ""}`}
    // The landing's own cy-land entrances bubble their animationend up here,
    // so the handoff waits for the event fired by this element itself.
    onAnimationEnd={(e) => {
      if (leaving && e.target === e.currentTarget) onExited?.();
    }}
  >
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col gap-7 px-4 py-5 sm:px-8 sm:py-7 lg:gap-9">
      {/* The hero rides the same `cy-land` keyframe as the preview cells, on
          delays that run ahead of the grid stagger, so the page lands as one
          sequence instead of a still headline over an animated box. */}
      <header
        className="cy-hud cy-land flex items-center justify-between gap-3"
        style={{ animationDelay: `${LANDING_ENTRANCE_MS.header}ms` }}
      >
        <span>
          tuxbank <span className="dim">{"// money calendar"}</span>
        </span>
        <span className="hidden sm:inline">local first · no account</span>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-14">
        <h1
          className="cy-display cy-land text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.88] font-bold tracking-[-0.015em] text-[color:var(--cy-text-strong)]"
          style={{ animationDelay: `${LANDING_ENTRANCE_MS.title}ms` }}
        >
          See your money
          <br />
          as a <span className="text-[color:var(--cy-cyan)]">month</span>.
        </h1>

        <div
          className="cy-land flex flex-col items-start gap-5"
          style={{ animationDelay: `${LANDING_ENTRANCE_MS.copy}ms` }}
        >
          <p className="max-w-[40ch] text-base text-[color:var(--cy-text)] sm:text-lg">
            Deposits and withdrawals land on the days they happen. The running
            balance moves with them, so you can see what you will have on any
            day ahead.
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
              opens straight into the calendar
            </span>
          </div>
        </div>
      </section>

      <section className="cy-console flex flex-col">
        <div
          className="cy-land flex flex-col gap-3 border-b border-[color:var(--cy-line)] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:px-4"
          style={{ animationDelay: `${LANDING_ENTRANCE_MS.rail}ms` }}
        >
          <span className="cy-display text-xl leading-none font-bold tracking-wide text-[color:var(--cy-text-strong)]">
            {LANDING_PREVIEW_MONTH}
          </span>
          <div className="flex items-end justify-between gap-4 sm:justify-start sm:gap-10">
            <RailFigure
              label="Deposits"
              value={formatSignedCompact(PREVIEW_TOTALS.deposits)}
            />
            <RailFigure
              label="Withdrawals"
              value={formatSignedCompact(PREVIEW_TOTALS.withdrawals)}
            />
            <RailFigure
              label="Month end"
              value={formatCurrency(PREVIEW_TOTALS.end)}
            />
          </div>
        </div>
        <PreviewGrid />
        <PreviewCompact />
      </section>

      {/* Spec grid: the same construction as the month grid (panel fills over
          a hairline gap-px background) so the specs read as four cells cut
          from the calendar above, not a separate marketing surface. */}
      <section className="grid gap-px border border-[color:var(--cy-line)] bg-[color:var(--cy-hairline)] sm:grid-cols-2 lg:grid-cols-4">
        {LANDING_SPECS.map((spec) => (
          <div
            key={spec.key}
            className="flex flex-col gap-2.5 bg-[color:var(--cy-panel)] p-4 sm:p-5"
          >
            <h2 className="cy-hud text-[color:var(--cy-cyan)]">{spec.key}</h2>
            <p className="cy-display text-2xl leading-[1.05] font-bold tracking-wide text-[color:var(--cy-text-strong)]">
              {spec.title}
            </p>
            <p className="max-w-[44ch] text-sm text-[color:var(--cy-text)]">
              {spec.body}
            </p>
          </div>
        ))}
      </section>

      <footer className="cy-mono mt-auto pb-1 text-xs text-[color:var(--cy-muted)]">
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
    </div>
  </main>
);

export default LandingPage;
