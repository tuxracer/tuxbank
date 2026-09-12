import { isString } from "remeda";

/** The screens of the first-run flow, in order; `welcome` carries no question. */
export type IntroStep = "welcome" | "balance" | "income" | "bill";

const INTRO_STEPS: readonly IntroStep[] = [
  "welcome",
  "balance",
  "income",
  "bill",
];

export const isIntroStep = (value: unknown): value is IntroStep =>
  isString(value) && INTRO_STEPS.includes(value as IntroStep);

/** What the flow put on the calendar, reported once the writes have landed. */
export type IntroOutcome = {
  balance: boolean;
  income: boolean;
  bill: boolean;
  /** How many events the flow created; zero means the visitor skipped everything. */
  eventCount: number;
};

export type IntroFlowProps = {
  /** Called once every planned category and event has been written. */
  onFinish: (outcome: IntroOutcome) => void;
  /** Plays the exit animation; `onExited` reports when it has finished. */
  leaving?: boolean;
  /** Called when the exit animation ends; the caller swaps in the calendar. */
  onExited?: () => void;
};
