import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  subDays,
} from "date-fns";
import type {
  CalendarEvent,
  Category,
  Occurrence,
  OccurrenceOverride,
  RecurrenceFreq,
} from "@/types";
import { UNKNOWN_CATEGORY } from "@/types";
import type { CategoryResolver, EventInput } from "./types";
import { MAX_ITER, STEP, UNITS_BETWEEN } from "./consts";

export * from "./types";
export * from "./consts";

// date-fns clamps overflowing days (Jan 31 + 1mo -> Feb 28). Detect clamping and skip.
const landsOnAnchorDay = (
  candidate: Date,
  anchor: Date,
  freq: RecurrenceFreq,
): boolean =>
  freq === "monthly" || freq === "yearly"
    ? candidate.getDate() === anchor.getDate()
    : true;

export const makeCategoryResolver = (
  categories: readonly Category[],
): CategoryResolver => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (categoryId) => byId.get(categoryId) ?? UNKNOWN_CATEGORY;
};

const indexOverrides = (
  overrides: OccurrenceOverride[],
): Record<string, OccurrenceOverride> =>
  Object.fromEntries(overrides.map((o) => [o.occurrenceDate, o]));

export const expandEvent = (
  event: CalendarEvent,
  windowStartISO: string,
  windowEndISO: string,
  getCategory: CategoryResolver,
): Occurrence[] => {
  if (!event.recurrence) {
    if (event.date < windowStartISO || event.date > windowEndISO) return [];
    return [
      {
        eventId: event.id,
        date: event.date,
        title: event.title,
        category: getCategory(event.categoryId),
        amount: event.amount,
        direction: event.direction,
        notes: event.notes,
        isRecurring: false,
      },
    ];
  }

  const { freq, interval, endsOn } = event.recurrence;
  const anchor = parseISO(event.date);
  const windowStart = parseISO(windowStartISO);
  const hardEndISO = endsOn && endsOn < windowEndISO ? endsOn : windowEndISO;
  const overrides = indexOverrides(event.overrides);

  const approxUnits = UNITS_BETWEEN[freq](anchor, windowStart);
  let i = Math.max(0, Math.floor(approxUnits / interval) - 1);

  const result: Occurrence[] = [];
  for (let guard = 0; guard < MAX_ITER; guard += 1, i += 1) {
    const candidate = STEP[freq](anchor, i * interval);
    const iso = format(candidate, "yyyy-MM-dd");
    if (iso > hardEndISO) break;
    if (iso < windowStartISO) continue;
    if (!landsOnAnchorDay(candidate, anchor, freq)) continue;

    const override = overrides[iso];
    if (override?.cancelled) continue;

    const categoryId = override?.patch?.categoryId ?? event.categoryId;
    result.push({
      eventId: event.id,
      date: iso,
      title: override?.patch?.title ?? event.title,
      category: getCategory(categoryId),
      amount: event.amount,
      direction: event.direction,
      notes: override?.patch?.notes ?? event.notes,
      isRecurring: true,
    });
  }
  return result;
};

export const expandEvents = (
  events: CalendarEvent[],
  windowStartISO: string,
  windowEndISO: string,
  getCategory: CategoryResolver,
): Occurrence[] =>
  events.flatMap((e) =>
    expandEvent(e, windowStartISO, windowEndISO, getCategory),
  );

export const dayBeforeISO = (iso: string): string =>
  format(subDays(parseISO(iso), 1), "yyyy-MM-dd");

export const shiftISO = (iso: string, days: number): string =>
  format(addDays(parseISO(iso), days), "yyyy-MM-dd");

export const daysBetweenISO = (from: string, to: string): number =>
  differenceInCalendarDays(parseISO(to), parseISO(from));

export const shiftSeries = (
  event: CalendarEvent,
  offsetDays: number,
): CalendarEvent => ({
  ...event,
  date: shiftISO(event.date, offsetDays),
  recurrence: event.recurrence
    ? {
        ...event.recurrence,
        endsOn: event.recurrence.endsOn
          ? shiftISO(event.recurrence.endsOn, offsetDays)
          : null,
      }
    : null,
  overrides: event.overrides.map((o) => ({
    ...o,
    occurrenceDate: shiftISO(o.occurrenceDate, offsetDays),
  })),
});

const upsertOverride = (
  overrides: OccurrenceOverride[],
  next: OccurrenceOverride,
): OccurrenceOverride[] => [
  ...overrides.filter((o) => o.occurrenceDate !== next.occurrenceDate),
  next,
];

export const cancelOccurrence = (
  event: CalendarEvent,
  occurrenceDate: string,
): CalendarEvent => ({
  ...event,
  overrides: upsertOverride(event.overrides, {
    occurrenceDate,
    cancelled: true,
  }),
});

export const patchOccurrence = (
  event: CalendarEvent,
  occurrenceDate: string,
  patch: NonNullable<OccurrenceOverride["patch"]>,
): CalendarEvent => ({
  ...event,
  overrides: upsertOverride(event.overrides, { occurrenceDate, patch }),
});

export const truncateBefore = (
  event: CalendarEvent,
  fromDate: string,
): CalendarEvent => ({
  ...event,
  recurrence: event.recurrence
    ? { ...event.recurrence, endsOn: dayBeforeISO(fromDate) }
    : null,
});

export const buildFollowingSeries = (
  event: CalendarEvent,
  fromDate: string,
  input: EventInput,
  id: string,
  nowISO: string,
): CalendarEvent => ({
  id,
  title: input.title,
  date: fromDate,
  categoryId: input.categoryId,
  amount: input.amount,
  direction: input.direction,
  notes: input.notes,
  recurrence: input.recurrence,
  overrides: event.overrides.filter((o) => o.occurrenceDate >= fromDate),
  createdAt: nowISO,
  updatedAt: nowISO,
});
