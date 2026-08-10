import type { Occurrence } from "@/types";
import type { DateCell } from "@/lib/dateGrid";

export type MonthRailProps = {
  /** First-of-month date naming the visible month. */
  month: Date;
  cells: DateCell[];
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate: Record<string, number>;
};

/** The three figures printed on the console rail. */
export type MonthTotals = {
  /** Sum of the month's deposits, positive. */
  deposits: number;
  /** Sum of the month's withdrawals, negative. */
  withdrawals: number;
  /** Running balance at the month's last day. */
  end: number;
};
