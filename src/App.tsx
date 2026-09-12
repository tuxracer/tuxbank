import { useCallback, useEffect, useMemo, useState } from "react";
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
import { hasOccurrenceAfter, isSameRecurrence } from "@/lib/recurrence";
import type { EventInput } from "@/lib/recurrence";
import {
  CalendarProvider,
  useCalendar,
  type EditScope,
} from "@/context/CalendarContext";
import { SyncProvider, useSync } from "@/context/SyncContext";
import { stripUtmParams, trackEvent } from "@/lib/analytics";
import { defaultFocusISO } from "@/lib/dateGrid";
import { markLandingDismissed, shouldShowLanding } from "@/lib/landingGate";
import { prefersReducedMotion } from "@/utils/prefersReducedMotion";
import LandingPage from "@/components/LandingPage";
import IntroFlow, { type IntroOutcome } from "@/components/IntroFlow";
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
 * animations disabled outside the reduced-motion query), the first-run flow
 * lands and later lifts out the same way, and then the calendar screen lands
 * top-down on the landing's own `cy-land` grammar: toolbar, console, then the
 * compact day panel — the same order LANDING_ENTRANCE_MS brought the landing
 * in. Plays only on this handoff, never on a normal boot.
 */
const EXIT_FALLBACK_MS = 400;
const APP_ENTRANCE_MS = { toolbar: 0, console: 70, panel: 140 } as const;

/**
 * The screens between a first visit and the calendar. Each `-exit` phase is
 * the previous screen playing its lift-out; the next screen mounts when it
 * ends. A return visit boots straight to `calendar`.
 */
type Phase = "landing" | "landing-exit" | "intro" | "intro-exit" | "calendar";

/** What the calendar says on arrival from the first-run flow. */
const welcomeMessage = (outcome: IntroOutcome): string =>
  outcome.eventCount > 0
    ? "Your month is ready. Pick any day to add more."
    : "Pick any day to add your first event.";

/**
 * How long the first load may take before it is worth saying so. Reading the
 * local database normally finishes within a frame or two, and a notice that
 * flashes for 20ms reads as a glitch; this only shows up when something is
 * genuinely slow, such as another tab holding an old database version open.
 */
const SLOW_LOAD_NOTICE_MS = 1_000;

// One owner for the "does this mutation need the recurrence-scope dialog?"
// policy: a non-recurring event has exactly one occurrence, so every mutation
// applies to the whole event ("all") without asking. A bounded series whose
// anchor is its only occurrence gets the same treatment: every scope spans
// that one occurrence, so the dialog would offer one choice in three
// spellings.
const needsScopeChoice = (event: CalendarEvent): boolean =>
  event.recurrence !== null && hasOccurrenceAfter(event, event.date);

// "All events" is redundant when the split is offered from the series' first
// occurrence: "this and following" already spans every occurrence.
const allowAllScope = (
  event: CalendarEvent,
  occurrenceDate: string,
  allowFollowing: boolean,
): boolean => !(allowFollowing && occurrenceDate === event.date);

type EditorState =
  | { mode: "create"; date: string }
  | { mode: "edit"; occurrence: Occurrence; event: CalendarEvent };

type ScopeState = {
  /**
   * False when nothing follows this occurrence and "this event" is on offer,
   * which makes the split a second spelling of that same choice.
   */
  allowFollowing: boolean;
  /**
   * False on the series' first occurrence while the split is offered:
   * "this and following" already spans every occurrence there, so "all
   * events" would be a second spelling of that same choice.
   */
  allowAll: boolean;
} & (
  | {
      action: "edit";
      input: EventInput;
      event: CalendarEvent;
      occurrenceDate: string;
      /** False when the edit changes the recurrence rule, which a single-occurrence edit can't carry. */
      allowThis: boolean;
    }
  | { action: "delete"; event: CalendarEvent; occurrenceDate: string }
  | { action: "move"; occurrence: Occurrence; toDate: string }
);

const CalendarScreen = ({
  entrance = false,
  welcome = null,
}: {
  entrance?: boolean;
  /** Set on arrival from the first-run flow; the calendar greets once with it. */
  welcome?: IntroOutcome | null;
}) => {
  const cal = useCalendar();
  const sync = useSync();
  // One greeting, on mount: the Toaster below is a child, so it has subscribed
  // by the time this effect runs. Nothing re-fires it, since `welcome` never
  // changes for the life of the screen.
  useEffect(() => {
    if (welcome) toast(welcomeMessage(welcome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Closing clears editor/scope, but unmounting the dialog in that same
  // render cuts its exit animation to nothing. Retain the last non-null
  // value so the dialog stays mounted (with open=false) while Radix plays
  // the close motion; Radix unmounts the portal contents itself when the
  // animation ends.
  const [lastEditor, setLastEditor] = useState<EditorState | null>(null);
  if (editor && editor !== lastEditor) setLastEditor(editor);
  const [lastScope, setLastScope] = useState<ScopeState | null>(null);
  if (scope && scope !== lastScope) setLastScope(scope);
  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(
    null,
  );
  const isCompact = useIsCompact();
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (cal.loaded) return;
    const id = setTimeout(() => setSlowLoad(true), SLOW_LOAD_NOTICE_MS);
    return () => clearTimeout(id);
  }, [cal.loaded]);
  // Compact-mode day selection. Falls back to today (when the visible month
  // contains it) or the first in-month day whenever the stored pick is not in
  // the current grid, so month navigation resets the selection naturally.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const resolvedSelectedDate = useMemo(() => {
    if (selectedDate && cal.cells.some((c) => c.iso === selectedDate))
      return selectedDate;
    return defaultFocusISO(cal.cells, cal.todayISO);
  }, [selectedDate, cal.cells, cal.todayISO]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );

  // openCreate and openEdit reach every DayCell through MonthGrid, and
  // DayCell is memoized: a fresh identity per render would re-render all 42
  // cells on every screen-level state change (drag start/end, dialogs).
  const openCreate = useCallback(
    (date: string) => setEditor({ mode: "create", date }),
    [],
  );

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
  const openEdit = useCallback(
    (occurrence: Occurrence) => {
      const event = cal.events.find((e) => e.id === occurrence.eventId);
      if (event) setEditor({ mode: "edit", occurrence, event });
    },
    [cal.events],
  );

  const handleSubmit = (input: EventInput) => {
    if (!editor) return;
    if (editor.mode === "create") {
      void cal.createEvent(input);
      setEditor(null);
      return;
    }
    if (!needsScopeChoice(editor.event)) {
      void cal.updateEvent(
        editor.event.id,
        input,
        // A single-occurrence series edits as "following" so an override at
        // the occurrence is superseded by the submitted input; "all" would
        // keep the patch and let it overrule the values just saved.
        editor.event.recurrence ? "following" : "all",
        editor.occurrence.date,
      );
      setEditor(null);
      return;
    }
    const sameRecurrence = isSameRecurrence(
      input.recurrence,
      editor.event.recurrence,
    );
    // A rule change re-anchors the series at this occurrence, so the split
    // still carries the new schedule forward even from the old last one.
    const allowFollowing =
      !sameRecurrence ||
      hasOccurrenceAfter(editor.event, editor.occurrence.date);
    const allowAll = allowAllScope(
      editor.event,
      editor.occurrence.date,
      allowFollowing,
    );
    if (!sameRecurrence && !allowAll) {
      // A rule change on the first occurrence leaves "this and following" as
      // the only scope on offer; apply it without asking.
      void cal.updateEvent(
        editor.event.id,
        input,
        "following",
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
      allowThis: sameRecurrence,
      allowFollowing,
      allowAll,
    });
    setEditor(null);
  };

  const handleDelete = () => {
    if (!editor || editor.mode !== "edit") return;
    if (!needsScopeChoice(editor.event)) {
      void cal.deleteEvent(editor.event.id, "all", editor.occurrence.date);
      setEditor(null);
      return;
    }
    const allowFollowing = hasOccurrenceAfter(
      editor.event,
      editor.occurrence.date,
    );
    setScope({
      action: "delete",
      event: editor.event,
      occurrenceDate: editor.occurrence.date,
      allowFollowing,
      allowAll: allowAllScope(
        editor.event,
        editor.occurrence.date,
        allowFollowing,
      ),
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
    if (!needsScopeChoice(event)) {
      void runMove(occurrence, toDate, "all");
      return;
    }
    const allowFollowing = hasOccurrenceAfter(event, occurrence.date);
    setScope({
      action: "move",
      occurrence,
      toDate,
      allowFollowing,
      allowAll: allowAllScope(event, occurrence.date, allowFollowing),
    });
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

  // Hold the first paint until the stored state that decides the layout is in
  // hand. The week start comes from the settings store, so painting early
  // would build the grid on a guess and reshuffle every column once the real
  // value arrives. One short blank beats a visible reflow, and it is what lets
  // the preferences live in IndexedDB alone with no second copy to keep true.
  if (!cal.loaded) {
    return (
      <main
        className={`flex h-[100dvh] flex-col items-center justify-center ${isCompact ? "gap-2 p-2" : "gap-3 p-3.5"}`}
      >
        {slowLoad && <p className="cy-hud">Loading…</p>}
      </main>
    );
  }

  return (
    <main
      className={`flex h-[100dvh] flex-col ${isCompact ? "gap-2 p-2" : "gap-3 p-3.5"}`}
      onKeyDown={onKeyDown}
    >
      {!cal.storageAvailable && (
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

      {/* The calendar sits on the same ground plate as the landing
          preview's console, but follows the active theme rather than pinning
          the landing's dark ink. */}
      <section
        className={`cy-frame flex min-h-0 flex-1 flex-col ${landClass}`}
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

      {lastEditor && (
        <EventDialog
          open={editor !== null}
          mode={lastEditor.mode}
          categories={cal.categories}
          defaultDate={
            lastEditor.mode === "create"
              ? lastEditor.date
              : lastEditor.occurrence.date
          }
          initialOccurrence={
            lastEditor.mode === "edit" ? lastEditor.occurrence : undefined
          }
          sourceEvent={
            lastEditor.mode === "edit" ? lastEditor.event : undefined
          }
          onOpenChange={(open) => !open && setEditor(null)}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onCreateCategory={cal.createCategory}
        />
      )}

      {lastScope && (
        <RecurrenceScopeDialog
          open={scope !== null}
          action={lastScope.action}
          allowThis={lastScope.action === "edit" ? lastScope.allowThis : true}
          allowFollowing={lastScope.allowFollowing}
          allowAll={lastScope.allowAll}
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
  const [phase, setPhase] = useState<Phase>(() =>
    shouldShowLanding() ? "landing" : "calendar",
  );
  // The calendar's entrance choreography and greeting play only on the
  // handoff from the first-run flow, never on a boot that skips straight to
  // the calendar.
  const [welcome, setWelcome] = useState<IntroOutcome | null>(null);

  // A scanned QR lands with utm_* tags in the query; drop them once the page
  // has painted. Attribution survives the early strip: the analytics module
  // captured the tags at load and re-attaches them to each event it sends.
  useEffect(() => {
    stripUtmParams();
  }, []);

  useEffect(() => {
    if (phase === "landing") trackEvent("landing-viewed");
  }, [phase]);

  // Backstop for the exit handoffs: if the leaving screen's animationend never
  // fires (animations disabled outside the reduced-motion query), swap anyway.
  useEffect(() => {
    if (phase !== "landing-exit" && phase !== "intro-exit") return;
    const next: Phase = phase === "landing-exit" ? "intro" : "calendar";
    const timer = window.setTimeout(() => setPhase(next), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "landing" || phase === "landing-exit") {
    return (
      <LandingPage
        onTryNow={() => {
          markLandingDismissed();
          trackEvent("try-now-clicked");
          setPhase(prefersReducedMotion() ? "intro" : "landing-exit");
        }}
        leaving={phase === "landing-exit"}
        onExited={() => setPhase("intro")}
      />
    );
  }

  return (
    <CalendarProvider>
      <SyncProvider>
        {phase === "intro" || phase === "intro-exit" ? (
          <IntroFlow
            onFinish={(outcome) => {
              setWelcome(outcome);
              setPhase(prefersReducedMotion() ? "calendar" : "intro-exit");
            }}
            leaving={phase === "intro-exit"}
            onExited={() => setPhase("calendar")}
          />
        ) : (
          <CalendarScreen entrance={welcome !== null} welcome={welcome} />
        )}
      </SyncProvider>
    </CalendarProvider>
  );
};

export default App;
