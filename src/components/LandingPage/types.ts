import type { CategoryColor } from "@/types";

export type LandingPageProps = {
  /** Called when the visitor clicks Try Now; the caller swaps in the app view. */
  onTryNow: () => void;
};

/** One transaction in the static preview month. `amount` is signed. */
export type LandingPreviewEvent = {
  title: string;
  amount: number;
  color: CategoryColor;
};

/** A preview day once its running balance has been resolved. */
export type LandingPreviewDay = {
  /** Day number as printed in the cell (restarts at 1 for trailing days). */
  label: number;
  inMonth: boolean;
  /** Balance carried in from the day before: where the count-up starts. */
  prevBalance: number;
  balance: number;
  event?: LandingPreviewEvent;
};

/** Month totals printed on the console rail. */
export type LandingPreviewTotals = {
  deposits: number;
  withdrawals: number;
  end: number;
};

/** One cell of the spec grid under the console. */
export type LandingSpec = {
  /** Mono HUD key naming the axis (Account, Storage, …). */
  key: string;
  /** The claim, set large in the display face. */
  title: string;
  /** One supporting sentence. */
  body: string;
};
