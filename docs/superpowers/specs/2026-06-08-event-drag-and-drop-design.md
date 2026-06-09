# Drag-and-drop events: design

Date: 2026-06-08
Status: Approved, ready for implementation planning

## Goal

Let the user move an event to a different day by dragging its chip onto another
day cell in the month grid. Today events can only be moved by opening the editor
and changing the date field. Drag-and-drop is a faster, direct way to do the same
thing.

## Behavior

Drag any event chip and drop it on a different day cell to move it.

| Case | Result |
| --- | --- |
| Non-recurring event | The event's `date` changes to the drop day. No prompt. |
| Recurring, "This occurrence" | The occurrence is cancelled on its original day and re-created as a standalone (non-recurring) event on the drop day, carrying its title, amount, category, direction, and notes. It loses the recurring (↻) series link. |
| Recurring, "This and following" | The series splits at the dragged occurrence. The original series ends the day before the occurrence, and a new series resumes anchored on the drop day, sliding the rest of the pattern by the drag offset. |
| Recurring, "All events" | The whole series slides by the drag offset. The anchor date, every per-occurrence override key, and `recurrence.endsOn` (when set) all shift by the same number of days. |

Edge cases:

- Dropping on the same day the chip already sits on is a no-op.
- Dropping outside any day cell is a no-op.
- A plain click (no drag) still opens the event editor, unchanged.
- If the source event was deleted in another tab between drag start and drop, the
  move is a no-op.
- Only the chips shown directly in a day cell (the first few) are draggable.
  Events in the "+N more" overflow popover are not draggable in this version.

For recurring events the existing recurrence scope dialog (this / this and
following / all) opens after the drop to pick the scope, matching how edit and
delete already prompt. Non-recurring events move immediately with no prompt.

After every successful move a toast appears with an Undo action.

## Design decisions

These were settled during brainstorming and are fixed for this version:

1. Recurring drags prompt for scope rather than always moving the whole series or
   refusing to move recurring events.
2. "This occurrence" detaches the occurrence into a standalone one-off event
   rather than storing a new "moved-to" override. This reuses existing primitives
   and keeps the `OccurrenceOverride` type unchanged.
3. The drag mechanics use the `@dnd-kit/core` library (pointer and touch support
   out of the box) rather than native HTML5 drag-and-drop or hand-rolled pointer
   handlers.
4. Successful moves show an Undo toast, which means introducing `sonner` (the app
   has no toast system today).
5. "All events" slides `endsOn` along with the anchor and overrides, so the whole
   timeline moves rigidly and the occurrence count stays the same.
6. No keyboard-drag in this version. Keyboard users still change an event's date
   through the editor. This is a deliberate scope boundary; the grid already binds
   arrow keys for cell focus navigation, and adding a keyboard drag sensor would
   conflict.

## Domain logic: `src/lib/recurrence`

No change to the `OccurrenceOverride` type. New pure helpers, each with tests:

- `shiftISO(iso, days)`: add a day count to a `YYYY-MM-DD` string using date-fns,
  staying in local time.
- `daysBetweenISO(from, to)`: whole-day difference between two `YYYY-MM-DD`
  strings.
- `shiftSeries(event, offsetDays)`: returns a copy of the event with `date`, every
  `override.occurrenceDate`, and `recurrence.endsOn` (when non-null) shifted by
  `offsetDays`. Drives the "All events" case.
- `buildMovedFollowing(current, fromDate, toDate, newId, nowISO)`: returns the new
  tail series for the "This and following" case. The tail is anchored at `toDate`,
  with `endsOn` and any carried-forward overrides (those at or after `fromDate`)
  shifted by the offset `toDate - fromDate`. Paired with the existing
  `truncateBefore(current, fromDate)` which ends the original series the day
  before.

The "This occurrence" detach reuses the existing `cancelOccurrence` plus a
standalone event built in the context. No new recurrence helper is needed for it.

## Context API: `src/context/CalendarContext`

One new method on the `useCalendar()` value and its type:

```ts
moveEvent(
  occurrence: Occurrence,
  toDate: string,
  scope: EditScope,
): Promise<() => Promise<void>>;
```

It branches on the four cases:

- Non-recurring (or `scope === "all"` collapses to a whole-series shift for
  recurring): change the date or call `shiftSeries`.
- `scope === "this"` on a recurring event: `cancelOccurrence` on the series, plus
  create a standalone event at `toDate` from the occurrence's resolved fields
  (title, amount, category id, direction, notes), `recurrence: null`.
- `scope === "following"`: `truncateBefore` on the original plus
  `buildMovedFollowing` for the new tail. Persist both.

Persistence reuses the existing `persist()` / `putEvent` / `deleteEvent` wrappers,
so cross-tab sync (storage broadcasts a change signal after writes) and the
storage-unavailable banner keep working without changes. `events` state updates in
the same way the other mutations do, so `occurrencesByDate` and `balancesByDate`
recompute on their own.

`moveEvent` returns an undo thunk. Undo is uniform across all four cases: before
mutating, snapshot the affected events as `{ id, prev: CalendarEvent | null }`
(where `prev` is `null` for an event that did not exist before, such as the
detached standalone or the new following tail). The undo thunk restores each
snapshot by putting back `prev`, or deleting the event when `prev` is `null`, and
updates `events` state to match.

## Drag mechanics: `@dnd-kit/core`

- `DndContext` lives in `App.tsx` wrapping `<MonthGrid>`. It configures a
  `PointerSensor` with `activationConstraint: { distance: 5 }` so a click only
  becomes a drag after about five pixels of movement, which preserves
  click-to-edit on the chips. Collision detection uses `pointerWithin`.
- `EventChip` calls `useDraggable`, passing the `occurrence` in the draggable
  `data`. The chip gets `touch-action: none` so a touch drag does not scroll the
  page. Its existing `onClick` edit handler stays.
- `DayCell` calls `useDroppable({ id: cell.iso })` and adds a drop-highlight class
  while `isOver` is true.
- A `DragOverlay` in `App` renders a themed floating copy of the dragged chip.

`onDragStart` records the active occurrence (for the overlay). `onDragEnd` reads
the dragged occurrence from `active.data` and the target ISO date from `over.id`.
If there is no `over`, or the target equals the occurrence's current date, it does
nothing. For a non-recurring event it calls `moveEvent` directly and shows the
toast. For a recurring event it opens the scope dialog, and the move runs when the
user confirms a scope.

## Scope prompt and undo UI

- `RecurrenceScopeDialog` gains a `"move"` action alongside `"edit"` and
  `"delete"`, with copy that fits moving. App's `ScopeState` gains a `move`
  variant carrying `{ occurrence, toDate }`, and `confirmScope` routes it to
  `moveEvent`.
- Add `sonner` for the toast. A small `src/components/ui/sonner.tsx` wraps sonner's
  `Toaster`, hardcoded to the dark cyberpunk theme (no `next-themes` dependency
  since the app has a single fixed theme), mounted once in `App`. Visual overrides
  go in `globals.css` as unlayered `.cy-*` rules covering visual properties only,
  per the existing styling convention.
- After a successful move: `toast("Moved to <date>", { action: { label: "Undo",
  onClick: () => void undo() } })`, where `undo` is the thunk returned by
  `moveEvent`.

## Testing

- Unit tests (vitest) for the new pure helpers, asserting behavior through
  `expandEvent` rather than checking internal shapes: after a move the occurrence
  is gone from the old day and present on the new day; the series stays intact for
  the Following and All cases; `endsOn` and override keys shift correctly; offsets
  across month boundaries work.
- The drag interaction itself cannot be tested in jsdom, which has no layout
  engine. The drag, drop highlight, overlay, scope prompt, and undo toast are
  verified in a real browser as part of the usual manual check.

## New dependencies

- `@dnd-kit/core`
- `sonner`

## Documentation

Update `docs/TRD.md` to document `moveEvent`, the drag-and-drop feature, and the
addition of sonner for toasts.

## Files affected

Create:

- `docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md` (this file)
- `src/components/ui/sonner.tsx`

Modify:

- `src/lib/recurrence/index.ts` and `src/lib/recurrence/tests.ts`
- `src/context/CalendarContext/index.tsx` and `src/context/CalendarContext/types.ts`
- `src/components/EventChip/index.tsx`
- `src/components/DayCell/index.tsx`
- `src/components/RecurrenceScopeDialog/index.tsx` and its consts/types
- `src/App.tsx`
- `src/globals.css`
- `docs/TRD.md`
- `package.json`
