import type { CalendarEvent, Occurrence, TransactionDirection } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import {
  dayBeforeISO,
  expandEvent,
  expandEvents,
  type CategoryResolver,
} from "@/lib/recurrence";

export const signedAmount = (
  direction: TransactionDirection,
  amount: number,
): number => (direction === "withdrawal" ? -amount : amount);

const sumSigned = (occurrences: Occurrence[]): number =>
  occurrences.reduce(
    (total, o) => total + signedAmount(o.direction, o.amount),
    0,
  );

/** Running account balance for each visible day: starts at 0, cumulative across all transactions up to & including that day. */
export const computeRunningBalances = (
  events: CalendarEvent[],
  cells: DateCell[],
  getCategory: CategoryResolver,
): Record<string, number> => {
  const windowStart = cells[0].iso;
  const windowEnd = cells[cells.length - 1].iso;
  const beforeWindow = dayBeforeISO(windowStart);

  let carryIn = 0;
  for (const event of events) {
    if (event.date > beforeWindow) continue;
    carryIn += sumSigned(
      expandEvent(event, event.date, beforeWindow, getCategory),
    );
  }

  const netByDate: Record<string, number> = {};
  for (const o of expandEvents(events, windowStart, windowEnd, getCategory)) {
    netByDate[o.date] =
      (netByDate[o.date] ?? 0) + signedAmount(o.direction, o.amount);
  }

  const balances: Record<string, number> = {};
  let running = carryIn;
  for (const cell of cells) {
    running += netByDate[cell.iso] ?? 0;
    balances[cell.iso] = running;
  }
  return balances;
};
