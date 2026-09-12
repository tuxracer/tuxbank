import { isString } from "remeda";
import type { CategoryColor, TransactionDirection, Recurrence } from "@/types";

/** How often the income the visitor describes arrives. */
export type IncomeCadence = "weekly" | "biweekly" | "monthly";

const INCOME_CADENCES: readonly IncomeCadence[] = [
  "weekly",
  "biweekly",
  "monthly",
];

export const isIncomeCadence = (value: unknown): value is IncomeCadence =>
  isString(value) && INCOME_CADENCES.includes(value as IncomeCadence);

export type IntroIncome = {
  title: string;
  amount: number;
  cadence: IncomeCadence;
  /** The next day it lands, `yyyy-MM-dd`: the series anchor. */
  nextDate: string;
};

export type IntroBill = {
  title: string;
  amount: number;
  /** The next day it is due, `yyyy-MM-dd`: the monthly series anchor. */
  nextDate: string;
};

/**
 * What the visitor told the first-run flow. Every answer is optional: `null`
 * means the step was skipped, and the plan simply leaves it out.
 */
export type IntroAnswers = {
  balance: number | null;
  income: IntroIncome | null;
  bill: IntroBill | null;
};

/** A category the plan needs, by name: the flow resolves it to an id on commit. */
export type IntroCategory = {
  name: string;
  color: CategoryColor;
};

/** One event to create, its category named rather than identified. */
export type IntroPlannedEvent = {
  title: string;
  date: string;
  category: IntroCategory | null;
  amount: number;
  direction: TransactionDirection;
  recurrence: Recurrence | null;
};

export type IntroPlan = {
  /** Every category the events below name, once each, in first-use order. */
  categories: IntroCategory[];
  events: IntroPlannedEvent[];
};
