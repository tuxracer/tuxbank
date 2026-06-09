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
import { buildMonthGrid } from "@/lib/dateGrid";
import {
  buildFollowingSeries,
  buildMovedFollowing,
  cancelOccurrence,
  daysBetweenISO,
  expandEvents,
  makeCategoryResolver,
  patchOccurrence,
  shiftSeries,
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
  exportDatabase,
  validateImport,
  commitImport,
  clearAllData as dbClearAllData,
} from "@/lib/storage";
import { subscribeToDataChanges } from "@/lib/tabSync";
import { downloadBlob } from "@/utils/downloadBlob";
import { computeRunningBalances } from "@/lib/balance";

import type { CalendarContextValue, EditScope } from "./types";
import { YEAR_LOOKAHEAD } from "./consts";

export * from "./consts";
export * from "./types";

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
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(
    () => new Set(),
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

  const toggleCategory = useCallback((id: string) => {
    setHiddenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const refreshSeqRef = useRef(0);

  /**
   * Re-read events + categories from storage (e.g. after another tab writes).
   * Leaves per-tab UI state (visible month, hidden categories) alone.
   */
  const refreshFromStorage = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    try {
      const [loadedEvents, loadedCategories] = await Promise.all([
        getAllEvents(),
        getAllCategories(),
      ]);
      if (seq !== refreshSeqRef.current) return; // superseded by a newer refresh
      categoriesRef.current = loadedCategories;
      setCategories(loadedCategories);
      setEvents(loadedEvents);
    } catch (error) {
      if (seq !== refreshSeqRef.current) return;
      if (isStorageError(error) && error.code === "UNAVAILABLE")
        setStorageAvailable(false);
      // Otherwise keep the current (stale) state; the next notification retries.
    }
  }, []);

  const reloadData = useCallback(async () => {
    await refreshFromStorage();
    setHiddenCategoryIds(new Set());
  }, [refreshFromStorage]);

  useEffect(() => {
    return subscribeToDataChanges(() => {
      void refreshFromStorage();
    });
  }, [refreshFromStorage]);

  const exportData = useCallback(async () => {
    const json = await exportDatabase();
    downloadBlob(
      new Blob([json], { type: "application/json" }),
      `tuxbank-backup-${format(new Date(), "yyyy-MM-dd")}.json`,
    );
  }, []);

  const previewImport = useCallback(async (file: File) => {
    return validateImport(await file.text());
  }, []);

  const importData = useCallback(
    async (file: File) => {
      await commitImport(await file.text());
      await reloadData();
    },
    [reloadData],
  );

  const clearAllData = useCallback(async () => {
    await dbClearAllData();
    await reloadData();
  }, [reloadData]);

  const cells = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const todayISO = format(new Date(), "yyyy-MM-dd");

  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const visibleYear = visibleMonth.getFullYear();
    const eventYears = events
      .map((e) => Number(e.date.slice(0, 4)))
      .filter((y) => Number.isFinite(y));
    const firstEventYear = eventYears.length
      ? eventYears.reduce((a, b) => Math.min(a, b))
      : currentYear;
    return {
      min: Math.min(firstEventYear, currentYear, visibleYear),
      max: Math.max(currentYear + YEAR_LOOKAHEAD, visibleYear),
    };
  }, [events, visibleMonth]);

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
    ).filter((o) => !hiddenCategoryIds.has(o.category.id));
    return groupBy(occ, (o) => o.date) as Partial<Record<string, Occurrence[]>>;
  }, [events, cells, hiddenCategoryIds, getCategory]);

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
      if (!current) {
        // The event vanished (deleted in another tab). The save still wins:
        // recreate it from the form input under a new id, whatever the scope.
        await createEvent(input);
        return;
      }

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
          amount: input.amount,
          direction: input.direction,
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
    [events, persist, createEvent],
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

  const moveEvent = useCallback(
    async (
      occurrence: Occurrence,
      toDate: string,
      scope: EditScope,
    ): Promise<() => Promise<void>> => {
      const current = events.find((e) => e.id === occurrence.eventId);
      // Source vanished (e.g. deleted in another tab): nothing to move or undo.
      if (!current) return async () => {};

      // Snapshot affected events so undo can restore them. prev === null marks an
      // event that did not exist before (the detached one-off or the new tail).
      const snapshot: { id: string; prev: CalendarEvent | null }[] = [];
      const writes: CalendarEvent[] = [];

      if (!current.recurrence || scope === "all") {
        const moved = current.recurrence
          ? shiftSeries(current, daysBetweenISO(occurrence.date, toDate))
          : { ...current, date: toDate };
        snapshot.push({ id: current.id, prev: current });
        writes.push({ ...moved, updatedAt: nowISO() });
      } else if (scope === "this") {
        const cancelled = {
          ...cancelOccurrence(current, occurrence.date),
          updatedAt: nowISO(),
        };
        const standalone: CalendarEvent = {
          id: newId(),
          title: occurrence.title,
          date: toDate,
          categoryId: occurrence.category.id,
          amount: occurrence.amount,
          direction: occurrence.direction,
          notes: occurrence.notes,
          recurrence: null,
          overrides: [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        snapshot.push({ id: current.id, prev: current });
        snapshot.push({ id: standalone.id, prev: null });
        writes.push(cancelled, standalone);
      } else {
        const truncated = {
          ...truncateBefore(current, occurrence.date),
          updatedAt: nowISO(),
        };
        const tail = buildMovedFollowing(
          current,
          occurrence.date,
          toDate,
          newId(),
          nowISO(),
        );
        snapshot.push({ id: current.id, prev: current });
        snapshot.push({ id: tail.id, prev: null });
        writes.push(truncated, tail);
      }

      setEvents((prev) => {
        const byId = new Map(prev.map((e) => [e.id, e]));
        for (const w of writes) byId.set(w.id, w);
        return [...byId.values()];
      });
      await persist(async () => {
        for (const w of writes) await putEvent(w);
      });

      return async () => {
        setEvents((prev) => {
          const byId = new Map(prev.map((e) => [e.id, e]));
          for (const s of snapshot) {
            if (s.prev) byId.set(s.id, s.prev);
            else byId.delete(s.id);
          }
          return [...byId.values()];
        });
        await persist(async () => {
          for (const s of snapshot) {
            if (s.prev) await putEvent(s.prev);
            else await dbDelete(s.id);
          }
        });
      };
    },
    [events, persist],
  );

  const usedCategories = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const e of events) {
      const cat = getCategory(e.categoryId);
      if (!seen.has(cat.id)) seen.set(cat.id, cat);
    }
    return [...seen.values()];
  }, [events, getCategory]);

  const activeCategoryIds = useMemo(
    () =>
      new Set(
        usedCategories
          .map((c) => c.id)
          .filter((cid) => !hiddenCategoryIds.has(cid)),
      ),
    [usedCategories, hiddenCategoryIds],
  );

  const categoryUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events)
      counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1;
    return counts;
  }, [events]);

  const createCategory = useCallback(
    async (name: string, color: CategoryColor): Promise<Category> => {
      const key = categoryKey(name);
      const existing = categoriesRef.current.find(
        (c) => categoryKey(c.name) === key,
      );
      if (existing) return existing;
      const category: Category = {
        id: newId(),
        name: name.trim(),
        color,
        updatedAt: nowISO(),
      };
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
      if (patch.name !== undefined) {
        const collision = categoriesRef.current.find(
          (c) =>
            c.id !== id && categoryKey(c.name) === categoryKey(patch.name!),
        );
        if (collision) return;
      }
      const next: Category = {
        ...current,
        ...patch,
        name: patch.name?.trim() ?? current.name,
        updatedAt: nowISO(),
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
    yearRange,
    monthLabel: monthFormatter.format(visibleMonth),
    cells,
    todayISO,
    events,
    occurrencesByDate,
    balancesByDate,
    categories,
    usedCategories,
    categoryUsageCount,
    activeCategoryIds,
    storageAvailable,
    loaded,
    goToPrevMonth: () => setVisibleMonth((m) => addMonths(m, -1)),
    goToNextMonth: () => setVisibleMonth((m) => addMonths(m, 1)),
    goToToday: () => setVisibleMonth(startOfMonth(new Date())),
    goToDate: (date) => setVisibleMonth(startOfMonth(date)),
    toggleCategory,
    createEvent,
    updateEvent,
    deleteEvent,
    moveEvent,
    createCategory,
    updateCategory,
    deleteCategory,
    exportData,
    previewImport,
    importData,
    clearAllData,
    refreshFromStorage,
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
