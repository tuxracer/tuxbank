"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import { categoryKey } from "@/types";
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
  getAllCategories,
  putCategory,
  deleteCategory as dbDeleteCategory,
} from "@/lib/storage";
import { computeRunningBalances } from "@/lib/balance";

export type EditScope = "this" | "following" | "all";

type CalendarContextValue = {
  visibleMonth: Date;
  monthLabel: string;
  cells: DateCell[];
  todayISO: string;
  events: CalendarEvent[];
  occurrencesByDate: Partial<Record<string, Occurrence[]>>;
  balancesByDate: Record<string, number>;
  categories: readonly Category[];
  usedCategories: Category[];
  categoryUsageCount: Record<string, number>;
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
  createCategory: (name: string, color: CategoryColor) => Promise<Category>;
  updateCategory: (
    id: string,
    patch: { name?: string; color?: CategoryColor },
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const categoriesRef = useRef<Category[]>([]);
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [activeColors, setActiveColors] = useState<Set<CategoryColor>>(
    () => new Set(ALL_COLORS),
  );

  const setCategoriesWithRef = useCallback(
    (updater: (prev: Category[]) => Category[]) => {
      setCategories((prev) => {
        const next = updater(prev);
        categoriesRef.current = next;
        return next;
      });
    },
    [],
  );

  const getCategory = useMemo(
    () => makeCategoryResolver(categories),
    [categories],
  );

  useEffect(() => {
    let active = true;
    Promise.all([getAllEvents(), getAllCategories()])
      .then(([loadedEvents, loadedCategories]) => {
        if (!active) return;
        setEvents(loadedEvents);
        categoriesRef.current = loadedCategories;
        setCategories(loadedCategories);
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
  }, [events, cells, activeColors, getCategory]);

  const balancesByDate = useMemo(
    () => computeRunningBalances(events, cells, getCategory),
    [events, cells, getCategory],
  );

  const createEvent = useCallback(
    async (input: EventInput) => {
      const event: CalendarEvent = {
        id: newId(),
        title: input.title,
        date: input.date,
        categoryId: input.categoryId,
        amount: input.amount,
        direction: input.direction,
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

  const usedCategories = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const e of events) seen.set(e.categoryId, getCategory(e.categoryId));
    return [...seen.values()];
  }, [events, getCategory]);

  const categoryUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events)
      counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1;
    return counts;
  }, [events]);

  const createCategory = useCallback(
    async (name: string, color: CategoryColor): Promise<Category> => {
      const id = categoryKey(name);
      const existing = categoriesRef.current.find((c) => c.id === id);
      if (existing) return existing;
      const category: Category = { id, name: name.trim(), color };
      categoriesRef.current = [...categoriesRef.current, category];
      setCategoriesWithRef(() => categoriesRef.current);
      await persist(() => putCategory(category));
      return category;
    },
    [persist, setCategoriesWithRef],
  );

  const updateCategory = useCallback(
    async (id: string, patch: { name?: string; color?: CategoryColor }) => {
      const current = categoriesRef.current.find((c) => c.id === id);
      if (!current) return;
      const next: Category = {
        ...current,
        ...patch,
        name: patch.name?.trim() ?? current.name,
      };
      categoriesRef.current = categoriesRef.current.map((c) =>
        c.id === id ? next : c,
      );
      setCategoriesWithRef(() => categoriesRef.current);
      await persist(() => putCategory(next));
    },
    [persist, setCategoriesWithRef],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      categoriesRef.current = categoriesRef.current.filter((c) => c.id !== id);
      setCategoriesWithRef(() => categoriesRef.current);
      await persist(() => dbDeleteCategory(id));
    },
    [persist, setCategoriesWithRef],
  );

  const value: CalendarContextValue = {
    visibleMonth,
    monthLabel: monthFormatter.format(visibleMonth),
    cells,
    todayISO,
    events,
    occurrencesByDate,
    balancesByDate,
    categories,
    usedCategories,
    categoryUsageCount,
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
    createCategory,
    updateCategory,
    deleteCategory,
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
