import { addDays, differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { DAYS_PER_WEEK, toISODate } from "@/lib/dateGrid";
import type {
  CalendarEvent,
  Category,
  Occurrence,
  OccurrenceOverride,
  Recurrence,
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
  return (categoryId) =>
    (categoryId === null ? undefined : byId.get(categoryId)) ??
    UNKNOWN_CATEGORY;
};

/**
 * The stored categoryId an occurrence carries: the override patch's when the
 * patch sets one (null = explicitly uncategorized), else the event's own.
 * `patch?.categoryId ?? event.categoryId` is wrong here: `??` would fall
 * through an explicit null and resurrect the series' category.
 */
export const patchedCategoryId = (
  patch: OccurrenceOverride["patch"] | undefined,
  event: CalendarEvent,
): string | null =>
  patch === undefined || patch.categoryId === undefined
    ? event.categoryId
    : patch.categoryId;

const indexOverrides = (
  overrides: OccurrenceOverride[],
): Record<string, OccurrenceOverride> =>
  Object.fromEntries(overrides.map((o) => [o.occurrenceDate, o]));

/**
 * Closed-form fast path for daily/weekly aggregation: these frequencies never
 * clamp (unlike a day-31 monthly anchor), so the unoverridden occurrence
 * count over any range is pure day arithmetic, and only the overrides need
 * individual visits. Cancelled overrides get no visit at all; patched ones
 * are visited with their patch, exactly like the iterative walk.
 */
const forEachDayStepped = (
  event: CalendarEvent,
  stepDays: number,
  windowStartISO: string,
  windowEndISO: string,
  visit: (iso: string, patch: OccurrenceOverride["patch"] | undefined) => void,
  visitUnoverridden: (count: number) => void,
): void => {
  const { endsOn } = event.recurrence!;
  const hardEndISO = endsOn && endsOn < windowEndISO ? endsOn : windowEndISO;
  if (hardEndISO < event.date) return;

  const firstStep = Math.max(
    0,
    Math.ceil(daysBetweenISO(event.date, windowStartISO) / stepDays),
  );
  const lastStep = Math.floor(
    daysBetweenISO(event.date, hardEndISO) / stepDays,
  );
  if (lastStep < firstStep) return;

  let count = lastStep - firstStep + 1;
  // indexOverrides dedupes same-date overrides (last wins) the same way the
  // iterative walk's lookup does, so a duplicated date can't double-subtract.
  for (const override of Object.values(indexOverrides(event.overrides))) {
    const iso = override.occurrenceDate;
    if (iso < windowStartISO || iso > hardEndISO) continue;
    const days = daysBetweenISO(event.date, iso);
    // Off-pattern overrides never match a candidate in the iterative walk, so
    // they are ignored here too.
    if (days < 0 || days % stepDays !== 0) continue;
    count -= 1;
    if (!override.cancelled) visit(iso, override.patch);
  }
  if (count > 0) visitUnoverridden(count);
};

/**
 * Visit every non-cancelled occurrence of an event inside the window without
 * materializing Occurrence objects. expandEvent builds on this; callers that
 * only aggregate (the balance carry-in over a series' whole history) use it
 * directly so a long-lived daily series does not allocate thousands of
 * throwaway objects per recompute.
 *
 * `visitUnoverridden` is an optional aggregation fast path: when the caller
 * needs no per-date detail for unoverridden occurrences (their title, amount,
 * and direction all come from the event itself), daily and weekly series
 * report them as a single count instead of one visit per occurrence, turning
 * a walk over a years-old daily series into O(overrides). Monthly and yearly
 * series stay on the iterative walk (their clamp-skip rule needs real dates,
 * and they step at most once per month/year anyway).
 */
export const forEachOccurrence = (
  event: CalendarEvent,
  windowStartISO: string,
  windowEndISO: string,
  visit: (iso: string, patch: OccurrenceOverride["patch"] | undefined) => void,
  visitUnoverridden?: (count: number) => void,
): void => {
  if (!event.recurrence) {
    if (event.date < windowStartISO || event.date > windowEndISO) return;
    visit(event.date, undefined);
    return;
  }

  const { freq, interval, endsOn } = event.recurrence;
  if (visitUnoverridden && (freq === "daily" || freq === "weekly")) {
    forEachDayStepped(
      event,
      interval * (freq === "weekly" ? DAYS_PER_WEEK : 1),
      windowStartISO,
      windowEndISO,
      visit,
      visitUnoverridden,
    );
    return;
  }
  const anchor = parseISO(event.date);
  const windowStart = parseISO(windowStartISO);
  const hardEndISO = endsOn && endsOn < windowEndISO ? endsOn : windowEndISO;
  const overrides = indexOverrides(event.overrides);

  const approxUnits = UNITS_BETWEEN[freq](anchor, windowStart);
  let i = Math.max(0, Math.floor(approxUnits / interval) - 1);

  for (let guard = 0; guard < MAX_ITER; guard += 1, i += 1) {
    const candidate = STEP[freq](anchor, i * interval);
    const iso = toISODate(candidate);
    if (iso > hardEndISO) break;
    if (iso < windowStartISO) continue;
    if (!landsOnAnchorDay(candidate, anchor, freq)) continue;

    const override = overrides[iso];
    if (override?.cancelled) continue;
    visit(iso, override?.patch);
  }
};

export const expandEvent = (
  event: CalendarEvent,
  windowStartISO: string,
  windowEndISO: string,
  getCategory: CategoryResolver,
): Occurrence[] => {
  const result: Occurrence[] = [];
  forEachOccurrence(event, windowStartISO, windowEndISO, (iso, patch) => {
    result.push({
      eventId: event.id,
      date: iso,
      title: patch?.title ?? event.title,
      category: getCategory(patchedCategoryId(patch, event)),
      amount: patch?.amount ?? event.amount,
      direction: patch?.direction ?? event.direction,
      isRecurring: event.recurrence !== null,
    });
  });
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
  toISODate(subDays(parseISO(iso), 1));

export const shiftISO = (iso: string, days: number): string =>
  toISODate(addDays(parseISO(iso), days));

export const daysBetweenISO = (from: string, to: string): number =>
  differenceInCalendarDays(parseISO(to), parseISO(from));

/**
 * Whether the series has another occurrence strictly after `afterISO`. An
 * open-ended rule always does: overrides are a finite list, so cancellations
 * can never exhaust an unbounded series. A bounded one is walked from the day
 * after to its `endsOn`.
 */
export const hasOccurrenceAfter = (
  event: CalendarEvent,
  afterISO: string,
): boolean => {
  const { recurrence } = event;
  if (!recurrence) return false;
  if (!recurrence.endsOn) return true;

  const from = shiftISO(afterISO, 1);
  if (from > recurrence.endsOn) return false;

  let found = false;
  forEachOccurrence(
    event,
    from,
    recurrence.endsOn,
    () => {
      found = true;
    },
    (count) => {
      if (count > 0) found = true;
    },
  );
  return found;
};

export const buildMovedFollowing = (
  event: CalendarEvent,
  fromDate: string,
  toDate: string,
  id: string,
  nowISO: string,
): CalendarEvent => {
  const offset = daysBetweenISO(fromDate, toDate);
  return {
    ...event,
    id,
    date: toDate,
    recurrence: event.recurrence
      ? {
          ...event.recurrence,
          endsOn: event.recurrence.endsOn
            ? shiftISO(event.recurrence.endsOn, offset)
            : null,
        }
      : null,
    overrides: event.overrides
      .filter((o) => o.occurrenceDate >= fromDate)
      .map((o) => ({
        ...o,
        occurrenceDate: shiftISO(o.occurrenceDate, offset),
      })),
    createdAt: nowISO,
    updatedAt: nowISO,
  };
};

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
  recurrence: input.recurrence,
  // Strictly after the split: an override at fromDate is superseded by the
  // submitted input (carrying it would silently overrule the values the user
  // just saved for that occurrence).
  overrides: event.overrides.filter((o) => o.occurrenceDate > fromDate),
  createdAt: nowISO,
  updatedAt: nowISO,
});

/** Whether two recurrence rules describe the same schedule. */
export const isSameRecurrence = (
  a: Recurrence | null,
  b: Recurrence | null,
): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.freq === b.freq &&
    a.interval === b.interval &&
    a.endsOn === b.endsOn);
