"use client";

import { useMemo, useState } from "react";
import type { CalendarEvent, Occurrence } from "@/types";
import type { EventInput } from "@/lib/recurrence";
import {
  CalendarProvider,
  useCalendar,
  type EditScope,
} from "@/context/CalendarContext";
import CalendarToolbar from "@/components/CalendarToolbar";
import MonthGrid from "@/components/MonthGrid";
import EventDialog from "@/components/EventDialog";
import RecurrenceScopeDialog from "@/components/RecurrenceScopeDialog";
import ManageCategoriesDialog from "@/components/ManageCategoriesDialog";
import DataDialog from "@/components/DataDialog";
import StorageLockedOverlay from "@/components/StorageLockedOverlay";

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
  | { action: "delete"; event: CalendarEvent; occurrenceDate: string };

const CalendarScreen = () => {
  const cal = useCalendar();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  const totalOccurrences = useMemo(
    () =>
      Object.values(cal.occurrencesByDate).reduce(
        (n, list) => n + (list?.length ?? 0),
        0,
      ),
    [cal.occurrencesByDate],
  );

  const openCreate = (date: string) => setEditor({ mode: "create", date });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
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

  const confirmScope = (chosen: EditScope) => {
    if (!scope) return;
    if (scope.action === "edit")
      void cal.updateEvent(
        scope.event.id,
        scope.input,
        chosen,
        scope.occurrenceDate,
      );
    else void cal.deleteEvent(scope.event.id, chosen, scope.occurrenceDate);
    setScope(null);
  };

  return (
    <main
      className="cy-scanlines flex h-[100dvh] flex-col gap-3 p-3.5"
      onKeyDown={onKeyDown}
    >
      {cal.storageLocked && <StorageLockedOverlay />}

      {cal.loaded && !cal.storageAvailable && (
        <div className="cy-mono border border-[color:var(--cy-magenta)] px-4 py-2 text-xs text-[color:var(--cy-magenta)]">
          ◢ LOCAL STORAGE UNAVAILABLE — changes won&apos;t be saved this
          session.
        </div>
      )}

      <CalendarToolbar
        monthLabel={cal.monthLabel}
        recordCount={cal.events.length}
        usedCategories={cal.usedCategories}
        activeCategoryIds={cal.activeCategoryIds}
        onPrev={cal.goToPrevMonth}
        onNext={cal.goToNextMonth}
        onToday={cal.goToToday}
        onToggleCategory={cal.toggleCategory}
        onManageCategories={() => setManageOpen(true)}
        onManageData={() => setDataOpen(true)}
        onNewEvent={() => openCreate(cal.todayISO)}
        endBalance={
          cal.balancesByDate[cal.cells[cal.cells.length - 1].iso] ?? 0
        }
      />

      <MonthGrid
        cells={cal.cells}
        todayISO={cal.todayISO}
        occurrencesByDate={cal.occurrencesByDate}
        onSelectDate={openCreate}
        onSelectOccurrence={openEdit}
        gridLabel={`Calendar for ${cal.monthLabel}`}
        balancesByDate={cal.balancesByDate}
      />

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
        onOpenChange={setDataOpen}
      />
    </main>
  );
};

const Page = () => (
  <CalendarProvider>
    <CalendarScreen />
  </CalendarProvider>
);

export default Page;
