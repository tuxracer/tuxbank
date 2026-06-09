import { useMemo, useState } from "react";
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
import CalendarToolbar from "@/components/CalendarToolbar";
import MonthGrid from "@/components/MonthGrid";
import EventChip from "@/components/EventChip";
import EventDialog from "@/components/EventDialog";
import RecurrenceScopeDialog from "@/components/RecurrenceScopeDialog";
import ManageCategoriesDialog from "@/components/ManageCategoriesDialog";
import DataDialog from "@/components/DataDialog";
import StorageUnavailableBanner from "@/components/StorageUnavailableBanner";
import { SyncDialog } from "@/components/SyncDialog";
import { Toaster } from "@/components/ui/sonner";

const noop = () => {};
// Pointer travel before a chip press becomes a drag; below this a press is a
// click that opens the editor instead.
const DRAG_ACTIVATION_DISTANCE_PX = 5;
const dropDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

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

const CalendarScreen = () => {
  const cal = useCalendar();
  const sync = useSync();
  const selectedYear = cal.visibleMonth.getFullYear();
  const selectedMonth = cal.visibleMonth.getMonth();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(
    null,
  );
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

  // Wipe everything locally (tombstoned), then push so a signed-in account is
  // cleared on every device. syncNow self-gates: it no-ops when signed out or
  // locked, leaving the tombstones to push on the next unlock/sync.
  const clearAllData = async () => {
    await cal.clearAllData();
    await sync.syncNow();
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
      className="cy-scanlines flex h-[100dvh] flex-col gap-3 p-3.5"
      onKeyDown={onKeyDown}
    >
      {cal.loaded && !cal.storageAvailable && (
        <StorageUnavailableBanner
          resettable={cal.storageResettable}
          onReset={handleResetLocalData}
        />
      )}

      <CalendarToolbar
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        minYear={cal.yearRange.min}
        maxYear={cal.yearRange.max}
        onSelectMonth={(monthIndex) =>
          cal.goToDate(new Date(selectedYear, monthIndex, 1))
        }
        onSelectYear={(year) => cal.goToDate(new Date(year, selectedMonth, 1))}
        recordCount={cal.events.length}
        usedCategories={cal.usedCategories}
        activeCategoryIds={cal.activeCategoryIds}
        onPrev={cal.goToPrevMonth}
        onNext={cal.goToNextMonth}
        onToday={cal.goToToday}
        onToggleCategory={cal.toggleCategory}
        onManageCategories={() => setManageOpen(true)}
        onManageData={() => setDataOpen(true)}
        onSync={() => setSyncOpen(true)}
        onNewEvent={() => openCreate(cal.todayISO)}
        endBalance={
          cal.balancesByDate[cal.cells[cal.cells.length - 1].iso] ?? 0
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <MonthGrid
          cells={cal.cells}
          todayISO={cal.todayISO}
          occurrencesByDate={cal.occurrencesByDate}
          onSelectDate={openCreate}
          onSelectOccurrence={openEdit}
          balancesByDate={cal.balancesByDate}
        />
        <DragOverlay>
          {activeOccurrence ? (
            <EventChip occurrence={activeOccurrence} onSelect={noop} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {cal.loaded && totalOccurrences === 0 && (
        <p className="cy-mono text-center text-xs text-[color:var(--cy-muted)]">
          ◢ No events this month — click a day or &ldquo;+ New Event&rdquo; to
          begin.
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

      <ManageCategoriesDialog
        open={manageOpen}
        categories={cal.categories}
        usageCountById={cal.categoryUsageCount}
        onRename={(id, name) => void cal.updateCategory(id, { name })}
        onRecolor={(id, color) => void cal.updateCategory(id, { color })}
        onDelete={(id) => void cal.deleteCategory(id)}
        onOpenChange={setManageOpen}
      />
      <DataDialog
        open={dataOpen}
        currentEventCount={cal.events.length}
        currentCategoryCount={cal.categories.length}
        storageAvailable={cal.storageAvailable}
        onExport={cal.exportData}
        onPreviewImport={cal.previewImport}
        onCommitImport={cal.importData}
        onClearAllData={clearAllData}
        onOpenChange={setDataOpen}
      />
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
      <Toaster />
    </main>
  );
};

const App = () => (
  <CalendarProvider>
    <SyncProvider>
      <CalendarScreen />
    </SyncProvider>
  </CalendarProvider>
);

export default App;
