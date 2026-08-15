import type {
  CalendarEvent,
  OccurrenceOverride,
  TransactionDirection,
} from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import {
  dayBeforeISO,
  forEachOccurrence,
  type CategoryResolver,
} from "@/lib/recurrence";

export const signedAmount = (
  direction: TransactionDirection,
  amount: number,
): number => (direction === "withdrawal" ? -amount : amount);

/**
 * Running account balance for each visible day: starts at 0, cumulative across
 * all transactions up to & including that day. Occurrences whose (resolved)
 * category is hidden are excluded, so the balances always sum exactly the
 * events the calendar is showing. Sums via forEachOccurrence, so even the
 * carry-in over a years-old daily series allocates no occurrence objects, and
 * the carry-in passes the bulk visitor so daily/weekly series contribute
 * count-times-amount in closed form instead of one visit per historical day.
 */
export const computeRunningBalances = (
  events: CalendarEvent[],
  cells: DateCell[],
  getCategory: CategoryResolver,
  hiddenCategoryIds: ReadonlySet<string> = new Set(),
): Record<string, number> => {
  const windowStart = cells[0].iso;
  const windowEnd = cells[cells.length - 1].iso;
  const beforeWindow = dayBeforeISO(windowStart);

  let carryIn = 0;
  const netByDate: Record<string, number> = {};
  for (const event of events) {
    const sumInto =
      (onAmount: (signed: number, iso: string) => void) =>
      (iso: string, patch: OccurrenceOverride["patch"] | undefined) => {
        // The resolved category id (a deleted category resolves to the
        // "unknown" sentinel, which is itself hideable via the filter bar).
        const categoryId = getCategory(
          patch?.categoryId ?? event.categoryId,
        ).id;
        if (hiddenCategoryIds.has(categoryId)) return;
        onAmount(
          signedAmount(
            patch?.direction ?? event.direction,
            patch?.amount ?? event.amount,
          ),
          iso,
        );
      };
    if (event.date <= beforeWindow) {
      forEachOccurrence(
        event,
        event.date,
        beforeWindow,
        sumInto((signed) => {
          carryIn += signed;
        }),
        // Unoverridden occurrences all carry the event's own category, amount,
        // and direction, so the whole stretch filters and sums as one unit.
        (count) => {
          if (hiddenCategoryIds.has(getCategory(event.categoryId).id)) return;
          carryIn += count * signedAmount(event.direction, event.amount);
        },
      );
    }
    forEachOccurrence(
      event,
      windowStart,
      windowEnd,
      sumInto((signed, iso) => {
        netByDate[iso] = (netByDate[iso] ?? 0) + signed;
      }),
    );
  }

  const balances: Record<string, number> = {};
  let running = carryIn;
  for (const cell of cells) {
    running += netByDate[cell.iso] ?? 0;
    balances[cell.iso] = running;
  }
  return balances;
};
