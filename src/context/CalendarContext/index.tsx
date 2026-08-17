import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { addMonths, startOfMonth } from "date-fns";
import { groupBy } from "remeda";
import type {
  CalendarEvent,
  Category,
  CategoryColor,
  Occurrence,
} from "@/types";
import { categoryKey, UNKNOWN_CATEGORY } from "@/types";
import { buildMonthGrid, toISODate } from "@/lib/dateGrid";
import {
  buildFollowingSeries,
  buildMovedFollowing,
  cancelOccurrence,
  daysBetweenISO,
  expandEvents,
  makeCategoryResolver,
  patchedCategoryId,
  patchOccurrence,
  shiftSeries,
  truncateBefore,
  type EventInput,
} from "@/lib/recurrence";
import {
  applyEventChanges,
  deleteEvent as dbDelete,
  getAllEvents,
  isStorageError,
  putEvent,
  getAllCategories,
  putCategory,
  deleteCategory as dbDeleteCategory,
  exportDatabase,
  validateImport,
  clearAllData as dbClearAllData,
  deleteDatabase,
} from "@/lib/storage";
import { subscribeToDataChanges } from "@/lib/tabSync";
import { trackEvent } from "@/lib/analytics";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import { hydrateDisplayPreferences } from "@/lib/displayPreferences";
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

// What the app was doing when storage failed: reading it at startup, writing an
// edit, or re-reading after another tab (or a sync pull) changed it.
type StorageAction = "load" | "write" | "refresh";

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
  // Synchronous mirror of `categories` for duplicate-name checks: two rapid
  // createCategory calls (combobox double-submit) land before the state
  // re-render, so state alone would miss the dedupe. Written ONLY through
  // applyCategories below — never assign categoriesRef.current directly.
  const categoriesRef = useRef<Category[]>([]);
  const applyCategories = useCallback(
    (updater: (prev: Category[]) => Category[]): void => {
      categoriesRef.current = updater(categoriesRef.current);
      setCategories(categoriesRef.current);
    },
    [],
  );
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [storageResettable, setStorageResettable] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);

  // Whether this session has already reported a storage failure. Once storage
  // is down every later read and write fails the same way, so one broken
  // session sends one event rather than one per edit.
  const storageErrorReportedRef = useRef(false);

  // Record a storage failure: mark storage unavailable, and resettable when the
  // database exists but could not be opened (OPEN_FAILED) — deleting it can
  // recover. Returns whether the error was a StorageError (vs. a real bug).
  const handleStorageError = useCallback(
    (error: unknown, action: StorageAction): boolean => {
      if (!isStorageError(error)) return false;
      setStorageAvailable(false);
      if (error.code === "OPEN_FAILED") setStorageResettable(true);
      if (!storageErrorReportedRef.current) {
        storageErrorReportedRef.current = true;
        trackEvent("storage-error", { action, code: error.code });
      }
      return true;
    },
    [],
  );
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(
    () => new Set(),
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

  // `loaded` covers every stored thing the first paint depends on, display
  // preferences included: the week start decides the shape of the grid, so
  // rendering before it is known would lay the month out wrong and reflow.
  // hydrateDisplayPreferences swallows its own storage errors, so it can only
  // resolve and never blocks this gate.
  useEffect(() => {
    let active = true;
    Promise.all([
      getAllEvents(),
      getAllCategories(),
      hydrateDisplayPreferences(),
    ])
      .then(([loadedEvents, loadedCategories]) => {
        if (!active) return;
        setEvents(loadedEvents);
        applyCategories(() => loadedCategories);
        setLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        handleStorageError(error, "load");
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [handleStorageError, applyCategories]);

  const persist = useCallback(
    async (write: () => Promise<void>) => {
      try {
        await write();
      } catch (error) {
        if (!handleStorageError(error, "write")) throw error;
      }
    },
    [handleStorageError],
  );

  const refreshSeqRef = useRef(0);

  /**
   * Re-read events + categories from storage (e.g. after another tab writes).
   * Leaves per-tab UI state (visible month, hidden categories) alone.
   */
  const refreshFromStorage = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    // Display preferences are synced rows too, so every path that rewrites
    // storage behind our back (a sync pull, an import, a reset) has to reload
    // them alongside the events. Their own store notifies its subscribers.
    void hydrateDisplayPreferences();
    try {
      const [loadedEvents, loadedCategories] = await Promise.all([
        getAllEvents(),
        getAllCategories(),
      ]);
      if (seq !== refreshSeqRef.current) return; // superseded by a newer refresh
      applyCategories(() => loadedCategories);
      setEvents(loadedEvents);
    } catch (error) {
      if (seq !== refreshSeqRef.current) return;
      handleStorageError(error, "refresh");
      // Otherwise keep the current (stale) state; the next notification retries.
    }
  }, [handleStorageError, applyCategories]);

  const resetLocalData = useCallback(async () => {
    await deleteDatabase();
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
      `tuxbank-backup-${toISODate(new Date())}.json`,
    );
  }, []);

  const previewImport = useCallback(async (file: File) => {
    return validateImport(await file.text());
  }, []);

  const clearAllData = useCallback(async () => {
    await dbClearAllData();
    await reloadData();
  }, [reloadData]);

  const { weekStartsOn } = useDisplayPreferences();
  const cells = useMemo(
    () => buildMonthGrid(visibleMonth, weekStartsOn),
    [visibleMonth, weekStartsOn],
  );
  const todayISO = toISODate(new Date());

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
    () => computeRunningBalances(events, cells, getCategory, hiddenCategoryIds),
    [events, cells, getCategory, hiddenCategoryIds],
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
        const next = {
          ...patchOccurrence(current, occurrenceDate, {
            title: input.title,
            categoryId: input.categoryId,
            amount: input.amount,
            direction: input.direction,
          }),
          updatedAt: nowISO(),
        };
        setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
        await persist(() => putEvent(next));
        return;
      }

      // "This and following" from the first occurrence spans the whole
      // series. Splitting would truncate the head to zero occurrences, a
      // ghost row that syncs and exports forever, so rewrite the series in
      // place instead (keeping its id). The override at the split date is
      // dropped, superseded by the submitted input, matching
      // buildFollowingSeries.
      if (occurrenceDate <= current.date) {
        const next: CalendarEvent = {
          ...current,
          ...input,
          date: occurrenceDate,
          overrides: current.overrides.filter(
            (o) => o.occurrenceDate > occurrenceDate,
          ),
          updatedAt: nowISO(),
        };
        setEvents((prev) => prev.map((e) => (e.id === id ? next : e)));
        await persist(() => putEvent(next));
        return;
      }

      const truncated = {
        ...truncateBefore(current, occurrenceDate),
        updatedAt: nowISO(),
      };
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
      // One transaction: committing the truncation without its replacement
      // tail would permanently drop the following occurrences.
      await persist(() => applyEventChanges([truncated, created]));
    },
    [events, persist, createEvent],
  );

  const deleteEvent = useCallback(
    async (id: string, scope: EditScope, occurrenceDate: string) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;

      if (
        !current.recurrence ||
        scope === "all" ||
        // "Following" from the first occurrence leaves nothing behind;
        // truncating would keep a ghost row with zero occurrences.
        (scope === "following" && occurrenceDate <= current.date)
      ) {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        await persist(() => dbDelete(id));
        return;
      }

      const next = {
        ...(scope === "this"
          ? cancelOccurrence(current, occurrenceDate)
          : truncateBefore(current, occurrenceDate)),
        updatedAt: nowISO(),
      };
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

      if (
        !current.recurrence ||
        scope === "all" ||
        // "Following" from the first occurrence moves the whole series;
        // splitting would leave a ghost head with zero occurrences.
        (scope === "following" && occurrence.date <= current.date)
      ) {
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
        // The stored categoryId (occurrence patch, else the series base), not
        // the resolved occurrence.category.id: a deleted category resolves to
        // the UNKNOWN_CATEGORY sentinel, whose id must never be persisted.
        const override = current.overrides.find(
          (o) => o.occurrenceDate === occurrence.date,
        );
        const standalone: CalendarEvent = {
          id: newId(),
          title: occurrence.title,
          date: toDate,
          categoryId: patchedCategoryId(override?.patch, current),
          amount: occurrence.amount,
          direction: occurrence.direction,
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
      // One transaction: a cancelled/truncated series must never commit
      // without its paired replacement event.
      await persist(() => applyEventChanges(writes));

      return async () => {
        // Restore with a fresh stamp: putting the snapshot back verbatim
        // would leave its old updatedAt at/below the sync cursor, so the
        // undo would never be pushed and the next pull would re-apply the
        // move on every device.
        const restoredAt = nowISO();
        const restores = snapshot.flatMap((s) =>
          s.prev ? [{ ...s.prev, updatedAt: restoredAt }] : [],
        );
        const removals = snapshot.flatMap((s) => (s.prev ? [] : [s.id]));
        setEvents((prev) => {
          const byId = new Map(prev.map((e) => [e.id, e]));
          for (const r of restores) byId.set(r.id, r);
          for (const id of removals) byId.delete(id);
          return [...byId.values()];
        });
        await persist(() => applyEventChanges(restores, removals));
      };
    },
    [events, persist],
  );

  const usedCategories = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const e of events) {
      const cat = getCategory(e.categoryId);
      // "Uncategorized" is the absence of a choice, not a category the user
      // made, so it gets no filter chip: those events always stay visible.
      if (cat.id === UNKNOWN_CATEGORY.id) continue;
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
    for (const e of events) {
      if (e.categoryId === null) continue; // uncategorized counts toward nothing
      counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1;
    }
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
      applyCategories((prev) => [...prev, category]);
      await persist(() => putCategory(category));
      return category;
    },
    [persist, applyCategories],
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
      applyCategories((prev) => prev.map((c) => (c.id === id ? next : c)));
      await persist(() => putCategory(next));
    },
    [persist, applyCategories],
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      applyCategories((prev) => prev.filter((c) => c.id !== id));
      await persist(() => dbDeleteCategory(id));
    },
    [persist, applyCategories],
  );

  const goToPrevMonth = useCallback(
    () => setVisibleMonth((m) => addMonths(m, -1)),
    [],
  );
  const goToNextMonth = useCallback(
    () => setVisibleMonth((m) => addMonths(m, 1)),
    [],
  );
  const goToToday = useCallback(
    () => setVisibleMonth(startOfMonth(new Date())),
    [],
  );
  const goToDate = useCallback(
    (date: Date) => setVisibleMonth(startOfMonth(date)),
    [],
  );

  // Memoized so a provider re-render without changed state hands consumers
  // the same context identity (React.memo below stays effective).
  const value: CalendarContextValue = useMemo(
    () => ({
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
      storageResettable,
      loaded,
      goToPrevMonth,
      goToNextMonth,
      goToToday,
      goToDate,
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
      clearAllData,
      resetLocalData,
      refreshFromStorage,
    }),
    [
      visibleMonth,
      yearRange,
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
      storageResettable,
      loaded,
      goToPrevMonth,
      goToNextMonth,
      goToToday,
      goToDate,
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
      clearAllData,
      resetLocalData,
      refreshFromStorage,
    ],
  );

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
