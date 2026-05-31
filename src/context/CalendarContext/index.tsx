"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { groupBy } from "remeda";
import type {
  CalendarEvent,
  Category,
  CategoryColor,
  Occurrence,
} from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { buildMonthGrid, type DateCell } from "@/lib/dateGrid";
import {
  buildFollowingSeries,
  cancelOccurrence,
  expandEvents,
  makeCategoryResolver,
  patchOccurrence,
  truncateBefore,
  type EventInput,
} from "@/lib/recurrence";
import {
  deleteEvent as dbDelete,
  getAllEvents,
  isStorageError,
  putEvent,
} from "@/lib/storage";

export type EditScope = "this" | "following" | "all";

type CalendarContextValue = {
  visibleMonth: Date;
  monthLabel: string;
  cells: DateCell[];
  todayISO: string;
  events: CalendarEvent[];
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  categories: readonly Category[];
  activeColors: Set<CategoryColor>;
  storageAvailable: boolean;
  loaded: boolean;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  goToDate: (date: Date) => void;
  toggleColor: (color: CategoryColor) => void;
  createEvent: (input: EventInput) => Promise<void>;
  updateEvent: (
    id: string,
    input: EventInput,
    scope: EditScope,
    occurrenceDate: string,
  ) => Promise<void>;
  deleteEvent: (
    id: string,
    scope: EditScope,
    occurrenceDate: string,
  ) => Promise<void>;
};

const ALL_COLORS: CategoryColor[] = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "orange",
];
const newId = (): string => crypto.randomUUID();
const nowISO = (): string => new Date().toISOString();
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);

const CalendarContext = createContext<CalendarContextValue | null>(null);

export const CalendarProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    startOfMonth(new Date()),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [activeColors, setActiveColors] = useState<Set<CategoryColor>>(
    () => new Set(ALL_COLORS),
  );

  useEffect(() => {
    let active = true;
    getAllEvents()
      .then((loadedEvents) => {
        if (!active) return;
        setEvents(loadedEvents);
        setLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        if (isStorageError(error) && error.code === "UNAVAILABLE")
          setStorageAvailable(false);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (write: () => Promise<void>) => {
    try {
      await write();
    } catch (error) {
      if (isStorageError(error)) setStorageAvailable(false);
      else throw error;
    }
  }, []);

  const cells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const todayISO = format(new Date(), "yyyy-MM-dd");

  const occurrencesByDate = useMemo((): Partial<
    Record<string, Occurrence[]>
  > => {
    const windowStart = cells[0].iso;
    const windowEnd = cells[cells.length - 1].iso;
    const occ = expandEvents(
      events,
      windowStart,
      windowEnd,
      getCategory,
    ).filter((o) => activeColors.has(o.category.color));
    return groupBy(occ, (o) => o.date) as Partial<Record<string, Occurrence[]>>;
  }, [events, cells, activeColors]);

  const createEvent = useCallback(
    async (input: EventInput) => {
      const event: CalendarEvent = {
        id: newId(),
        title: input.title,
        date: input.date,
        categoryId: input.categoryId,
        notes: input.notes,
        recurrence: input.recurrence,
        overrides: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      setEvents((prev) => [...prev, event]);
      await persist(() => putEvent(event));
    },
    [persist],
  );

  const updateEvent = useCallback(
    async (
      id: string,
      input: EventInput,
      scope: EditScope,
      occurrenceDate: string,
    ) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;

      if (!current.recurrence || scope === "all") {
        const next: CalendarEvent = {
          ...current,
          ...input,
          updatedAt: nowISO(),
        };
        setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
        await persist(() => putEvent(next));
        return;
      }

      if (scope === "this") {
        const next = patchOccurrence(current, occurrenceDate, {
          title: input.title,
          categoryId: input.categoryId,
          notes: input.notes,
        });
        setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
        await persist(() => putEvent(next));
        return;
      }

      const truncated = truncateBefore(current, occurrenceDate);
      const created = buildFollowingSeries(
        current,
        occurrenceDate,
        input,
        newId(),
        nowISO(),
      );
      setEvents((prev) => [
        ...prev.map((e) => (e.id === id ? truncated : e)),
        created,
      ]);
      await persist(async () => {
        await putEvent(truncated);
        await putEvent(created);
      });
    },
    [events, persist],
  );

  const deleteEvent = useCallback(
    async (id: string, scope: EditScope, occurrenceDate: string) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;

      if (!current.recurrence || scope === "all") {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        await persist(() => dbDelete(id));
        return;
      }

      const next =
        scope === "this"
          ? cancelOccurrence(current, occurrenceDate)
          : truncateBefore(current, occurrenceDate);
      setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
      await persist(() => putEvent(next));
    },
    [events, persist],
  );

  const value: CalendarContextValue = {
    visibleMonth,
    monthLabel: monthFormatter.format(visibleMonth),
    cells,
    todayISO,
    events,
    occurrencesByDate,
    categories: PRESET_CATEGORIES,
    activeColors,
    storageAvailable,
    loaded,
    goToPrevMonth: () => setVisibleMonth((m) => addMonths(m, -1)),
    goToNextMonth: () => setVisibleMonth((m) => addMonths(m, 1)),
    goToToday: () => setVisibleMonth(startOfMonth(new Date())),
    goToDate: (date) => setVisibleMonth(startOfMonth(date)),
    toggleColor: (color) =>
      setActiveColors((prev) => {
        const next = new Set(prev);
        if (next.has(color)) next.delete(color);
        else next.add(color);
        return next;
      }),
    createEvent,
    updateEvent,
    deleteEvent,
  };

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = (): CalendarContextValue => {
  const ctx = useContext(CalendarContext);
  if (!ctx)
    throw new Error("useCalendar must be used within a CalendarProvider");
  return ctx;
};
