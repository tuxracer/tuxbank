import { formatCurrency, formatSignedCompact } from "@/utils/formatCurrency";

import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import type { MonthRailProps, MonthTotals } from "./types";

export * from "./types";

const monthLabeler = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

/** One figure on the console rail: a mono value under its key. */
export const RailFigure = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="cy-hud">{label}</span>
    <span className="cy-mono text-sm text-[color:var(--cy-text-strong)] sm:text-base">
      {value}
    </span>
  </div>
);

/**
 * The month's totals from the same per-day data the grid renders, so the rail
 * can never disagree with the cells below it. Withdrawals accumulate negative,
 * matching the sign the rail prints; the month-end figure is the running
 * balance of the last in-month day.
 */
export const computeMonthTotals = (
  cells: DateCell[],
  occurrencesByDate: Partial<Record<string, Occurrence[]>>,
  balancesByDate: Record<string, number>,
): MonthTotals => {
  const totals: MonthTotals = { deposits: 0, withdrawals: 0, end: 0 };
  for (const cell of cells) {
    if (!cell.inMonth) continue;
    for (const occurrence of occurrencesByDate[cell.iso] ?? []) {
      if (occurrence.direction === "deposit") {
        totals.deposits += occurrence.amount;
      } else {
        totals.withdrawals -= occurrence.amount; // "withdrawal"
      }
    }
    totals.end = balancesByDate[cell.iso] ?? 0;
  }
  return totals;
};

/**
 * Console header rail above the month grid: the month set in the display face
 * beside the Deposits / Withdrawals / Month-end readout, exactly the strip the
 * landing-page preview carries.
 */
const MonthRail = ({
  month,
  cells,
  occurrencesByDate,
  balancesByDate,
}: MonthRailProps) => {
  const totals = computeMonthTotals(cells, occurrencesByDate, balancesByDate);
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--cy-line)] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:px-4">
      <span className="cy-display text-xl leading-none font-bold tracking-wide text-[color:var(--cy-text-strong)]">
        {monthLabeler.format(month)}
      </span>
      <div className="flex items-end justify-between gap-4 sm:justify-start sm:gap-10">
        <RailFigure
          label="Deposits"
          value={formatSignedCompact(totals.deposits)}
        />
        <RailFigure
          label="Withdrawals"
          value={formatSignedCompact(totals.withdrawals)}
        />
        <RailFigure label="Month end" value={formatCurrency(totals.end)} />
      </div>
    </div>
  );
};

export default MonthRail;
