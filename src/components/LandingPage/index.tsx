import { REPO_URL } from "@/components/AboutDialog";
import { catColorVar } from "@/utils/categoryColor";
import { formatCurrency, formatSignedCompact } from "@/utils/formatCurrency";
import {
  LANDING_PREVIEW_CARRY_IN,
  LANDING_PREVIEW_DAYS,
  LANDING_PREVIEW_EVENTS,
  LANDING_PREVIEW_MONTH,
  LANDING_PREVIEW_TODAY,
  LANDING_PREVIEW_TRAILING,
  LANDING_PREVIEW_WEEKDAYS,
  LANDING_SPECS,
  LANDING_STAGGER_MS,
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

  for (
    let index = 0;
    index < LANDING_PREVIEW_DAYS + LANDING_PREVIEW_TRAILING;
    index++
  ) {
    const dayOfMonth = index + 1;
    const inMonth = dayOfMonth <= LANDING_PREVIEW_DAYS;
    const event = inMonth ? LANDING_PREVIEW_EVENTS[dayOfMonth] : undefined;

    if (event) {
      balance += event.amount;
      if (event.amount < 0) totals.withdrawals += event.amount;
      else totals.deposits += event.amount;
    }

    days.push({
      label: inMonth ? dayOfMonth : dayOfMonth - LANDING_PREVIEW_DAYS,
      inMonth,
      balance,
      event,
    });
  }

  totals.end = balance;
  return { days, totals };
};

const { days: PREVIEW_DAYS, totals: PREVIEW_TOTALS } = buildPreviewMonth();

/** Transaction days only, for the phone-width ledger tape. */
const PREVIEW_TAPE = PREVIEW_DAYS.filter((day) => day.inMonth && day.event);

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

/**
 * The month grid at the density the real calendar uses: every cell carries its
 * date and running balance, and the balance turns magenta where rent overdraws
 * the account before payday. Replaced by the tape below `sm`, where seven
 * columns stop being readable.
 */
const PreviewGrid = () => (
  <div className="hidden flex-col gap-1.5 p-2 sm:flex sm:p-3">
    <div className="grid grid-cols-7 gap-1.5">
      {LANDING_PREVIEW_WEEKDAYS.map((day, index) => (
        <div key={index} className="cy-weekhead px-1 text-[10px]">
          {day}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-1.5">
      {PREVIEW_DAYS.map((day, index) => {
        const classes = ["cy-cell", "cy-land", "flex", "flex-col", "gap-1"];
        classes.push("min-h-[4.75rem]", "p-1.5", "lg:min-h-[5.5rem]");
        if (!day.inMonth) classes.push("out");
        if (day.inMonth && day.label === LANDING_PREVIEW_TODAY)
          classes.push("today");

        return (
          <div
            key={index}
            className={classes.join(" ")}
            style={{ animationDelay: `${index * LANDING_STAGGER_MS}ms` }}
          >
            <span className="cy-cell-num text-[10px]">
              {String(day.label).padStart(2, "0")}
            </span>
            {day.event && (
              <span className="cy-chip" style={chipStyle(day)}>
                <span className="truncate">{day.event.title}</span>
                <span className="cy-mono ml-auto pl-1">
                  {formatSignedCompact(day.event.amount)}
                </span>
              </span>
            )}
            <span
              className={`cy-balance mt-auto self-end ${day.balance < 0 ? "cy-balance-neg" : ""}`}
            >
              {formatCurrency(day.balance)}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

/** Phone-width stand-in for the grid: the same month read as a ledger tape. */
const PreviewTape = () => (
  <ol className="flex flex-col sm:hidden">
    {PREVIEW_TAPE.map((day, index) => (
      <li
        key={day.label}
        className="cy-land flex items-center gap-3 border-t border-[color:var(--cy-hairline)] px-3 py-2 first:border-t-0"
        style={{ animationDelay: `${index * LANDING_STAGGER_MS}ms` }}
      >
        <span
          className="cy-cell-num w-6 shrink-0 text-[11px]"
          style={
            day.label === LANDING_PREVIEW_TODAY
              ? { color: "var(--cy-yellow)", fontWeight: 700 }
              : undefined
          }
        >
          {String(day.label).padStart(2, "0")}
        </span>
        <span className="cy-chip min-w-0 flex-1" style={chipStyle(day)}>
          <span className="truncate">{day.event?.title}</span>
          <span className="cy-mono ml-auto pl-1">
            {formatSignedCompact(day.event?.amount ?? 0)}
          </span>
        </span>
        <span
          className={`cy-balance w-20 shrink-0 text-right ${day.balance < 0 ? "cy-balance-neg" : ""}`}
        >
          {formatCurrency(day.balance)}
        </span>
      </li>
    ))}
  </ol>
);

/**
 * First-visit entry screen. Shown until the visitor clicks Try Now (or is
 * otherwise known to be past it: see `src/lib/landingGate`); after that the
 * app boots straight into the calendar.
 */
const LandingPage = ({ onTryNow }: LandingPageProps) => (
  <main className="h-[100dvh] overflow-y-auto">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1280px] flex-col gap-7 px-4 py-5 sm:px-8 sm:py-7 lg:gap-9">
      <header className="cy-hud flex items-center justify-between gap-3">
        <span>
          tuxbank <span className="dim">{"// money calendar"}</span>
        </span>
        <span className="hidden sm:inline">local first · no account</span>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-14">
        <h1 className="cy-display text-[clamp(2.75rem,8vw,5.5rem)] leading-[0.88] font-bold tracking-[-0.015em] text-[color:var(--cy-text-strong)]">
          See your money
          <br />
          as a <span className="text-[color:var(--cy-cyan)]">month</span>.
        </h1>

        <div className="flex flex-col items-start gap-5">
          <p className="max-w-[40ch] text-base text-[color:var(--cy-text)] sm:text-lg">
            Deposits and withdrawals land on the days they happen. The running
            balance moves with them, so a short month shows up weeks before it
            arrives.
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
        <div className="flex flex-col gap-3 border-b border-[color:var(--cy-line)] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:px-4">
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
        <PreviewTape />
      </section>

      <section className="flex flex-col">
        {LANDING_SPECS.map((spec) => (
          <div
            key={spec.key}
            className="grid gap-1 border-t border-[color:var(--cy-line)] py-3 sm:grid-cols-[10rem_1fr] sm:gap-6"
          >
            <h2 className="cy-hud pt-0.5 text-[color:var(--cy-cyan)]">
              {spec.key}
            </h2>
            <p className="max-w-[68ch] text-sm text-[color:var(--cy-text)]">
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
