import { useEffect, useMemo, useState } from "react";
import { parseISO } from "date-fns";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { isOccurrence } from "@/types";
import type { CalendarEvent, Occurrence } from "@/types";
import type { EventInput } from "@/lib/recurrence";
import {
  CalendarProvider,
  useCalendar,
  type EditScope,
} from "@/context/CalendarContext";
import { SyncProvider, useSync } from "@/context/SyncContext";
import { trackEvent } from "@/lib/analytics";
import { markLandingDismissed, shouldShowLanding } from "@/lib/landingGate";
import { prefersReducedMotion } from "@/utils/prefersReducedMotion";
import LandingPage from "@/components/LandingPage";
import CalendarToolbar from "@/components/CalendarToolbar";
import DayPanel from "@/components/DayPanel";
import MonthGrid from "@/components/MonthGrid";
import { useIsCompact } from "@/hooks/useIsCompact";
import EventChip from "@/components/EventChip";
import EventDialog from "@/components/EventDialog";
import RecurrenceScopeDialog from "@/components/RecurrenceScopeDialog";
import SettingsDialog, { type SettingsTab } from "@/components/SettingsDialog";
import StorageUnavailableBanner from "@/components/StorageUnavailableBanner";
import { Toaster } from "@/components/ui/sonner";

const noop = () => {};
// Pointer travel before a chip press becomes a drag; below this a press is a
// click that opens the editor instead.
const DRAG_ACTIVATION_DISTANCE_PX = 5;
const dropDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/*
 * Try Now handoff choreography. The landing lifts out (`.cy-exit` in
 * globals.css — the fallback below covers its animationend never firing, e.g.
 * animations disabled outside the reduced-motion query), then the calendar
 * screen lands top-down on the landing's own `cy-land` grammar: toolbar,
 * console, then the compact day panel — the same order LANDING_ENTRANCE_MS
 * brought the landing in. Plays only on this handoff, never on a normal boot.
 */
const LANDING_EXIT_FALLBACK_MS = 400;
const APP_ENTRANCE_MS = { toolbar: 0, console: 70, panel: 140 } as const;

type EditorState =
  | { mode: "create"; date: string }
  | { mode: "edit"; occurrence: Occurrence; event: CalendarEvent };

type ScopeState =
  | {
      action: "edit";
      input: EventInput;
      event: CalendarEvent;
      occurrenceDate: string;
    }
  | { action: "delete"; event: CalendarEvent; occurrenceDate: string }
  | { action: "move"; occurrence: Occurrence; toDate: string };

const CalendarScreen = ({ entrance = false }: { entrance?: boolean }) => {
  const cal = useCalendar();
  const sync = useSync();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Which settings tab is showing; null is the compact root menu (and the
  // default tab on wide screens).
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  // Two onboarding steps can arrive with the dialog closed: a scanned device
  // link lands on the TOTP challenge, and a conflict detected on a
  // cached-key resume (page reload, window focus, network reconnect) lands
  // on the sign-in data choice. Open settings on the Sync tab so either
  // prompt is visible. (No-op for normal sign-ins: the pane is already
  // showing when step changes.)
  useEffect(() => {
    if (sync.step === "signin-totp" || sync.step === "signin-choice") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSettingsTab("sync");
      setSettingsOpen(true);
    }
  }, [sync.step]);
  const selectedYear = cal.visibleMonth.getFullYear();
  const selectedMonth = cal.visibleMonth.getMonth();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(
    null,
  );
  const isCompact = useIsCompact();
  // Compact-mode day selection. Falls back to today (when the visible month
  // contains it) or the first in-month day whenever the stored pick is not in
  // the current grid, so month navigation resets the selection naturally.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const resolvedSelectedDate = useMemo(() => {
    if (selectedDate && cal.cells.some((c) => c.iso === selectedDate))
      return selectedDate;
    if (cal.cells.some((c) => c.iso === cal.todayISO && c.inMonth))
      return cal.todayISO;
    return cal.cells.find((c) => c.inMonth)?.iso ?? cal.todayISO;
  }, [selectedDate, cal.cells, cal.todayISO]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );

  const totalOccurrences = useMemo(
    () =>
      Object.values(cal.occurrencesByDate).reduce(
        (n, list) => n + (list?.length ?? 0),
        0,
      ),
    [cal.occurrencesByDate],
  );

  const openCreate = (date: string) => setEditor({ mode: "create", date });

  // Which layout the action came from; the compact layout swaps the New Event
  // button for the day panel's + Add. (SettingsDialog reports its own
  // per-tab open events.)
  const layout = isCompact ? "compact" : "full";

  const openNewEvent = (date: string) => {
    trackEvent("new-event-clicked", { layout });
    openCreate(date);
  };

  const openSettings = () => {
    trackEvent("settings-opened", { layout });
    setSettingsTab(null);
    setSettingsOpen(true);
  };

  // Recover from an unopenable local database by deleting it and reloading, so
  // the app reopens against a fresh one.
  const handleResetLocalData = async () => {
    await cal.resetLocalData();
    window.location.reload();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    )
      return;
    if (e.key === "PageUp") cal.goToPrevMonth();
    if (e.key === "PageDown") cal.goToNextMonth();
    if (e.key.toLowerCase() === "n" && !editor && !scope)
      openCreate(cal.todayISO);
  };
  const openEdit = (occurrence: Occurrence) => {
    const event = cal.events.find((e) => e.id === occurrence.eventId);
    if (event) setEditor({ mode: "edit", occurrence, event });
  };

  const handleSubmit = (input: EventInput) => {
    if (!editor) return;
    if (editor.mode === "create") {
      void cal.createEvent(input);
      setEditor(null);
      return;
    }
    if (!editor.event.recurrence) {
      void cal.updateEvent(
        editor.event.id,
        input,
        "all",
        editor.occurrence.date,
      );
      setEditor(null);
      return;
    }
    setScope({
      action: "edit",
      input,
      event: editor.event,
      occurrenceDate: editor.occurrence.date,
    });
    setEditor(null);
  };

  const handleDelete = () => {
    if (!editor || editor.mode !== "edit") return;
    if (!editor.event.recurrence) {
      void cal.deleteEvent(editor.event.id, "all", editor.occurrence.date);
      setEditor(null);
      return;
    }
    setScope({
      action: "delete",
      event: editor.event,
      occurrenceDate: editor.occurrence.date,
    });
    setEditor(null);
  };

  const runMove = async (
    occurrence: Occurrence,
    toDate: string,
    moveScope: EditScope,
  ) => {
    const undo = await cal.moveEvent(occurrence, toDate, moveScope);
    toast(`Moved to ${dropDateFormatter.format(parseISO(toDate))}`, {
      action: { label: "Undo", onClick: () => void undo() },
    });
  };

  const handleDragStart = (e: DragStartEvent) => {
    const occurrence = e.active.data.current?.occurrence;
    if (isOccurrence(occurrence)) setActiveOccurrence(occurrence);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveOccurrence(null);
    const { active, over } = e;
    if (!over) return;
    const occurrence = active.data.current?.occurrence;
    if (!isOccurrence(occurrence)) return;
    const toDate = String(over.id);
    if (toDate === occurrence.date) return;
    const event = cal.events.find((ev) => ev.id === occurrence.eventId);
    if (!event) return;
    if (!event.recurrence) {
      void runMove(occurrence, toDate, "all");
      return;
    }
    setScope({ action: "move", occurrence, toDate });
  };

  // Entrance choreography for the Try Now handoff; both collapse to no-ops on
  // a normal boot so the calendar paints settled.
  const landClass = entrance ? "cy-land" : "";
  const landStyle = (delayMs: number) =>
    entrance ? { animationDelay: `${delayMs}ms` } : undefined;

  const confirmScope = (chosen: EditScope) => {
    if (!scope) return;
    if (scope.action === "edit")
      void cal.updateEvent(
        scope.event.id,
        scope.input,
        chosen,
        scope.occurrenceDate,
      );
    else if (scope.action === "delete")
      void cal.deleteEvent(scope.event.id, chosen, scope.occurrenceDate);
    else void runMove(scope.occurrence, scope.toDate, chosen);
    setScope(null);
  };

  return (
    <main
      className={`flex h-[100dvh] flex-col ${isCompact ? "gap-2 p-2" : "gap-3 p-3.5"}`}
      onKeyDown={onKeyDown}
    >
      {cal.loaded && !cal.storageAvailable && (
        <StorageUnavailableBanner
          resettable={cal.storageResettable}
          onReset={handleResetLocalData}
        />
      )}

      <div className={landClass} style={landStyle(APP_ENTRANCE_MS.toolbar)}>
        <CalendarToolbar
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          minYear={cal.yearRange.min}
          maxYear={cal.yearRange.max}
          onSelectMonth={(monthIndex) =>
            cal.goToDate(new Date(selectedYear, monthIndex, 1))
          }
          onSelectYear={(year) =>
            cal.goToDate(new Date(year, selectedMonth, 1))
          }
          usedCategories={cal.usedCategories}
          activeCategoryIds={cal.activeCategoryIds}
          onPrev={cal.goToPrevMonth}
          onNext={cal.goToNextMonth}
          onToday={cal.goToToday}
          onToggleCategory={cal.toggleCategory}
          onOpenSettings={openSettings}
          onNewEvent={() => openNewEvent(cal.todayISO)}
          compact={isCompact}
        />
      </div>

      {/* The calendar sits in a bordered console panel like the landing
          preview's, but follows the active theme rather than pinning the
          landing's dark ink. */}
      <section
        className={`flex min-h-0 flex-1 flex-col border border-[color:var(--cy-line)] bg-[color:var(--cy-bg)] ${landClass}`}
        style={landStyle(APP_ENTRANCE_MS.console)}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className={`flex min-h-0 flex-1 flex-col ${isCompact ? "p-1.5" : "p-2 lg:p-3"}`}
          >
            <MonthGrid
              cells={cal.cells}
              todayISO={cal.todayISO}
              compact={isCompact}
              selectedISO={isCompact ? resolvedSelectedDate : undefined}
              onSwipeLeft={isCompact ? cal.goToNextMonth : undefined}
              onSwipeRight={isCompact ? cal.goToPrevMonth : undefined}
              onPrevMonth={cal.goToPrevMonth}
              onNextMonth={cal.goToNextMonth}
              occurrencesByDate={cal.occurrencesByDate}
              onSelectDate={isCompact ? setSelectedDate : openCreate}
              onSelectOccurrence={openEdit}
              balancesByDate={cal.balancesByDate}
            />
          </div>
          <DragOverlay>
            {activeOccurrence ? (
              <EventChip occurrence={activeOccurrence} onSelect={noop} />
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>

      {isCompact && (
        <div className={landClass} style={landStyle(APP_ENTRANCE_MS.panel)}>
          <DayPanel
            dateISO={resolvedSelectedDate}
            occurrences={cal.occurrencesByDate[resolvedSelectedDate] ?? []}
            balance={cal.balancesByDate[resolvedSelectedDate] ?? 0}
            onSelectOccurrence={openEdit}
            onAddEvent={() => openNewEvent(resolvedSelectedDate)}
          />
        </div>
      )}

      {cal.loaded && totalOccurrences === 0 && (
        <p
          className={`cy-mono text-center text-xs text-[color:var(--cy-muted)] ${landClass}`}
          style={landStyle(APP_ENTRANCE_MS.panel)}
        >
          {isCompact
            ? "◢ No events this month — tap a day, then + Add."
            : "◢ No events this month — click a day or “+ New Event” to begin."}
        </p>
      )}

      {editor && (
        <EventDialog
          open
          mode={editor.mode}
          categories={cal.categories}
          defaultDate={
            editor.mode === "create" ? editor.date : editor.occurrence.date
          }
          initialOccurrence={
            editor.mode === "edit" ? editor.occurrence : undefined
          }
          sourceEvent={editor.mode === "edit" ? editor.event : undefined}
          onOpenChange={(open) => !open && setEditor(null)}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onCreateCategory={cal.createCategory}
        />
      )}

      {scope && (
        <RecurrenceScopeDialog
          open
          action={scope.action}
          onConfirm={confirmScope}
          onOpenChange={(open) => !open && setScope(null)}
        />
      )}

      <SettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          // Reopening always starts from the root menu / default tab.
          if (!open) setSettingsTab(null);
        }}
        data={{
          currentEventCount: cal.events.length,
          currentCategoryCount: cal.categories.length,
          storageAvailable: cal.storageAvailable,
          includesCloud: sync.unlocked,
          onExport: cal.exportData,
          onPreviewImport: cal.previewImport,
          onCommitImport: sync.importData,
          onClearAllData: sync.resetAllData,
        }}
        categories={{
          categories: cal.categories,
          usageCountById: cal.categoryUsageCount,
          onRename: (id, name) => void cal.updateCategory(id, { name }),
          onRecolor: (id, color) => void cal.updateCategory(id, { color }),
          onDelete: (id) => void cal.deleteCategory(id),
          onCreate: (name, color) => void cal.createCategory(name, color),
        }}
      />
      <Toaster />
    </main>
  );
};

const App = () => {
  const [phase, setPhase] = useState<"landing" | "leaving" | "app">(() =>
    shouldShowLanding() ? "landing" : "app",
  );
  // The calendar's entrance choreography plays only on the handoff from the
  // landing page, never on a boot that skips straight to the calendar.
  const [cameFromLanding, setCameFromLanding] = useState(false);

  useEffect(() => {
    if (phase === "landing") trackEvent("landing-viewed");
  }, [phase]);

  // Backstop for the exit handoff: if the landing's animationend never fires
  // (animations disabled outside the reduced-motion query), swap anyway.
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(
      () => setPhase("app"),
      LANDING_EXIT_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase !== "app") {
    return (
      <LandingPage
        onTryNow={() => {
          markLandingDismissed();
          trackEvent("try-now-clicked");
          setCameFromLanding(true);
          setPhase(prefersReducedMotion() ? "app" : "leaving");
        }}
        leaving={phase === "leaving"}
        onExited={() => setPhase("app")}
      />
    );
  }

  return (
    <CalendarProvider>
      <SyncProvider>
        <CalendarScreen entrance={cameFromLanding} />
      </SyncProvider>
    </CalendarProvider>
  );
};

export default App;
