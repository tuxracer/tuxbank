import { uniqueBy } from "remeda";
import {
  BILL_RECURRENCE,
  CADENCE_PER_YEAR,
  CADENCE_RECURRENCE,
  INTRO_BILL_CATEGORY,
  INTRO_INCOME_CATEGORY,
  MONTHS_PER_YEAR,
  STARTING_BALANCE_TITLE,
} from "./consts";
import type {
  IncomeCadence,
  IntroAnswers,
  IntroPlan,
  IntroPlannedEvent,
} from "./types";

export * from "./consts";
export * from "./types";

/**
 * A figure typed into one of the flow's amount fields. Accepts what a number
 * input hands back (plain digits with an optional decimal point) and nothing
 * else; zero and negatives are not amounts the flow can file, so they read as
 * "nothing entered".
 */
export const parseAmount = (raw: string): number | null => {
  const amount = Number(raw.trim());
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/**
 * What the income comes to over an average month, for the readout under the
 * field. Whole units: the figure is a feel for the scale, not a ledger entry.
 */
export const monthlyEquivalent = (
  amount: number,
  cadence: IncomeCadence,
): number => Math.round((amount * CADENCE_PER_YEAR[cadence]) / MONTHS_PER_YEAR);

/**
 * Turns the visitor's answers into the events the calendar opens with. The
 * running balance starts from zero at the first event, so the opening balance
 * becomes a one-off deposit on today's date: every day after it then carries a
 * real figure, and the visitor can edit or delete it like any other event.
 * Skipped answers contribute nothing, so an all-skipped flow plans an empty
 * month rather than failing.
 */
export const buildIntroPlan = (
  answers: IntroAnswers,
  todayISO: string,
): IntroPlan => {
  const events: IntroPlannedEvent[] = [];

  if (answers.balance !== null) {
    events.push({
      title: STARTING_BALANCE_TITLE,
      date: todayISO,
      category: null,
      amount: answers.balance,
      direction: "deposit",
      recurrence: null,
    });
  }

  if (answers.income) {
    events.push({
      title: answers.income.title,
      date: answers.income.nextDate,
      category: INTRO_INCOME_CATEGORY,
      amount: answers.income.amount,
      direction: "deposit",
      recurrence: CADENCE_RECURRENCE[answers.income.cadence],
    });
  }

  if (answers.bill) {
    events.push({
      title: answers.bill.title,
      date: answers.bill.nextDate,
      category: INTRO_BILL_CATEGORY,
      amount: answers.bill.amount,
      direction: "withdrawal",
      recurrence: BILL_RECURRENCE,
    });
  }

  const categories = uniqueBy(
    events.flatMap((event) => (event.category ? [event.category] : [])),
    (category) => category.name,
  );

  return { categories, events };
};
