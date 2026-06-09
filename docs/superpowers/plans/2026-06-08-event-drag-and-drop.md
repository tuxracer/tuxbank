# Event Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user move an event to a different day by dragging its chip onto another day cell in the month grid, with recurring events prompting for scope and every move offering an Undo toast.

**Architecture:** Pure date-shift helpers in `src/lib/recurrence` drive the data-model side of a move. A new `moveEvent` method on `CalendarContext` orchestrates the four cases (non-recurring, recurring this/following/all) and returns an undo thunk built from a before-snapshot. The UI uses `@dnd-kit/core`: `EventChip` becomes draggable (via a thin `DraggableEventChip` wrapper), `DayCell` becomes a drop target, and `App` hosts the `DndContext`, drag handlers, recurrence scope prompt, and a `sonner` toast.

**Tech Stack:** React 19, TypeScript, `@dnd-kit/core` (drag-and-drop), `sonner` (toasts), date-fns, vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md`

**Testing note:** The pure recurrence helpers and the `isOccurrence` guard are covered by vitest (Tasks 2-5). The context method and all UI wiring (Tasks 6-11) cannot be meaningfully tested in jsdom, which has no layout engine and cannot simulate a real pointer drag (see CLAUDE.md gotcha). Those tasks are gated on `pnpm check` (format + lint + typecheck) per step and verified by hand in a real browser in Task 13. This matches the project's documented approach and the spec's testing section.

**Known limitation (deliberate, v1):** Only the first three chips shown directly in a day cell are draggable. Events that overflow into the "+N more" popover are not draggable; the user drags them after they fit in the cell, or changes their date through the editor. This is recorded in the spec and TRD in Task 12.

---

## File Structure

Create:
- `src/components/DraggableEventChip/index.tsx` — wraps `EventChip` with `useDraggable`.
- `src/components/ui/sonner.tsx` — themed `sonner` `Toaster`.

Modify:
- `src/lib/recurrence/index.ts` — add `shiftISO`, `daysBetweenISO`, `shiftSeries`, `buildMovedFollowing`.
- `src/lib/recurrence/tests.ts` — tests for the four new helpers.
- `src/types/index.ts` — add `isOccurrence` type guard.
- `src/types/tests.ts` — tests for `isOccurrence` (create if absent).
- `src/context/CalendarContext/types.ts` — add `moveEvent` to `CalendarContextValue`.
- `src/context/CalendarContext/index.tsx` — implement `moveEvent`.
- `src/components/EventChip/types.ts` — optional drag props.
- `src/components/EventChip/index.tsx` — spread drag props onto the button.
- `src/components/DayCell/index.tsx` — droppable + render `DraggableEventChip`.
- `src/components/RecurrenceScopeDialog/types.ts` — add `"move"` action.
- `src/components/RecurrenceScopeDialog/index.tsx` — title for `"move"`.
- `src/App.tsx` — `DndContext`, sensors, drag handlers, scope `move`, toast, `Toaster`.
- `src/globals.css` — drop highlight, dragging dim, toast theming.
- `docs/TRD.md` — document the feature.
- `docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md` — record the popover limitation.
- `package.json` / lockfile — new dependencies.

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Add the runtime dependencies**

Run:

```bash
pnpm add @dnd-kit/core sonner
```

Expected: pnpm adds `@dnd-kit/core` and `sonner` to `dependencies` and updates the lockfile. `@dnd-kit/core` pulls its own `@dnd-kit/utilities` and `@dnd-kit/accessibility` automatically; do not add those separately. Do not add `@dnd-kit/sortable` (not needed) or `next-themes` (the app has a single fixed theme).

- [ ] **Step 2: Verify the project still builds and lints**

Run:

```bash
pnpm check
```

Expected: PASS (no usage yet, so this only confirms the install did not break config).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add @dnd-kit/core and sonner"
```

---

## Task 2: Date-shift helpers (`shiftISO`, `daysBetweenISO`)

**Files:**
- Modify: `src/lib/recurrence/index.ts`
- Test: `src/lib/recurrence/tests.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `src/lib/recurrence/tests.ts`, and add `shiftISO` and `daysBetweenISO` to the existing import from `./index` at the top of the file (the second import block, alongside `cancelOccurrence`, etc.):

```ts
describe("date-shift helpers", () => {
  it("shifts an ISO date forward and backward in local time", () => {
    expect(shiftISO("2026-05-04", 8)).toBe("2026-05-12");
    expect(shiftISO("2026-05-12", -8)).toBe("2026-05-04");
  });

  it("crosses month and non-leap-year boundaries correctly", () => {
    expect(shiftISO("2026-02-27", 2)).toBe("2026-03-01");
    expect(shiftISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts whole days between two ISO dates, signed", () => {
    expect(daysBetweenISO("2026-05-04", "2026-05-12")).toBe(8);
    expect(daysBetweenISO("2026-05-12", "2026-05-04")).toBe(-8);
    expect(daysBetweenISO("2026-05-04", "2026-05-04")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: FAIL with `shiftISO is not defined` / `daysBetweenISO is not defined`.

- [ ] **Step 3: Implement the helpers**

In `src/lib/recurrence/index.ts`, extend the date-fns import on line 1 to include `addDays` and `differenceInCalendarDays`:

```ts
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  subDays,
} from "date-fns";
```

Then add these exports near the other date helpers (for example just after `dayBeforeISO`):

```ts
export const shiftISO = (iso: string, days: number): string =>
  format(addDays(parseISO(iso), days), "yyyy-MM-dd");

export const daysBetweenISO = (from: string, to: string): number =>
  differenceInCalendarDays(parseISO(to), parseISO(from));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: PASS (all recurrence tests, including the three new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurrence/index.ts src/lib/recurrence/tests.ts
git commit -m "feat(recurrence): add shiftISO and daysBetweenISO helpers"
```

---

## Task 3: `shiftSeries` helper (All-scope move)

**Files:**
- Modify: `src/lib/recurrence/index.ts`
- Test: `src/lib/recurrence/tests.ts`

- [ ] **Step 1: Write the failing test**

Add `shiftSeries` to the `./index` import block, then append this `describe` to `src/lib/recurrence/tests.ts`:

```ts
describe("shiftSeries (all-scope move)", () => {
  const weekly: CalendarEvent = {
    ...base,
    date: "2026-05-04",
    recurrence: { freq: "weekly", interval: 1, endsOn: "2026-05-25" },
    overrides: [{ occurrenceDate: "2026-05-11", cancelled: true }],
  };

  it("slides the anchor, endsOn, and override keys by the offset", () => {
    const shifted = shiftSeries(weekly, 1);
    expect(shifted.date).toBe("2026-05-05");
    expect(shifted.recurrence?.endsOn).toBe("2026-05-26");
    expect(shifted.overrides).toEqual([
      { occurrenceDate: "2026-05-12", cancelled: true },
    ]);
  });

  it("keeps the cancelled occurrence aligned after the shift", () => {
    const shifted = shiftSeries(weekly, 1);
    // Original fired 05-04/11/18/25 with 05-11 cancelled.
    // Shifted +1 fires 05-05/12/19/26 with 05-12 cancelled.
    expect(datesOf(shifted, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-05",
      "2026-05-19",
      "2026-05-26",
    ]);
  });

  it("leaves a null endsOn null", () => {
    const forever = {
      ...weekly,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
    };
    expect(shiftSeries(forever, 3).recurrence?.endsOn).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: FAIL with `shiftSeries is not defined`.

- [ ] **Step 3: Implement `shiftSeries`**

Add to `src/lib/recurrence/index.ts` (after the helpers from Task 2):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurrence/index.ts src/lib/recurrence/tests.ts
git commit -m "feat(recurrence): add shiftSeries for whole-series moves"
```

---

## Task 4: `buildMovedFollowing` helper (Following-scope move)

**Files:**
- Modify: `src/lib/recurrence/index.ts`
- Test: `src/lib/recurrence/tests.ts`

- [ ] **Step 1: Write the failing test**

Add `buildMovedFollowing` to the `./index` import block, then append this `describe` to `src/lib/recurrence/tests.ts`:

```ts
describe("buildMovedFollowing (following-scope move)", () => {
  const series: CalendarEvent = {
    ...base,
    date: "2026-05-04",
    recurrence: { freq: "weekly", interval: 1, endsOn: null },
    overrides: [
      { occurrenceDate: "2026-05-11", cancelled: true },
      { occurrenceDate: "2026-05-25", patch: { notes: "keep" } },
    ],
  };

  it("anchors the tail at the drop date with a fresh id", () => {
    const tail = buildMovedFollowing(
      series,
      "2026-05-18",
      "2026-05-19",
      "new-id",
      "2026-05-30T00:00:00.000Z",
    );
    expect(tail.id).toBe("new-id");
    expect(tail.date).toBe("2026-05-19");
    expect(tail.createdAt).toBe("2026-05-30T00:00:00.000Z");
  });

  it("carries forward only on/after overrides, shifted by the offset", () => {
    const tail = buildMovedFollowing(
      series,
      "2026-05-18",
      "2026-05-19",
      "new-id",
      "2026-05-30T00:00:00.000Z",
    );
    // 05-11 is before the split (dropped); 05-25 carries forward shifted +1 to 05-26.
    expect(tail.overrides).toEqual([
      { occurrenceDate: "2026-05-26", patch: { notes: "keep" } },
    ]);
  });

  it("shifts a non-null endsOn by the offset and leaves null as null", () => {
    const bounded = {
      ...series,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: "2026-06-15" },
    };
    const tail = buildMovedFollowing(
      bounded,
      "2026-05-18",
      "2026-05-20",
      "id2",
      "2026-05-30T00:00:00.000Z",
    );
    expect(tail.recurrence?.endsOn).toBe("2026-06-17");
    expect(
      buildMovedFollowing(
        series,
        "2026-05-18",
        "2026-05-20",
        "id3",
        "2026-05-30T00:00:00.000Z",
      ).recurrence?.endsOn,
    ).toBeNull();
  });

  it("pairs with truncateBefore to split the series with no overlap", () => {
    const head = truncateBefore(series, "2026-05-18");
    const tail = buildMovedFollowing(
      series,
      "2026-05-18",
      "2026-05-19",
      "new-id",
      "2026-05-30T00:00:00.000Z",
    );
    // Head stops 05-04/11(cancelled)/... ending 05-17; tail resumes 05-19 onward.
    expect(datesOf(head, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-04",
      // 05-11 cancelled
    ]);
    expect(datesOf(tail, "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-19",
      "2026-05-26",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: FAIL with `buildMovedFollowing is not defined`.

- [ ] **Step 3: Implement `buildMovedFollowing`**

Add to `src/lib/recurrence/index.ts` (after `shiftSeries`):

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm exec vitest run src/lib/recurrence/tests.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurrence/index.ts src/lib/recurrence/tests.ts
git commit -m "feat(recurrence): add buildMovedFollowing for following-scope moves"
```

---

## Task 5: `isOccurrence` type guard

**Files:**
- Modify: `src/types/index.ts`
- Test: `src/types/tests.ts` (create if it does not exist)

- [ ] **Step 1: Write the failing test**

Create `src/types/tests.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { isOccurrence, PRESET_CATEGORIES } from "./index";

describe("isOccurrence", () => {
  const valid = {
    eventId: "e1",
    date: "2026-05-04",
    title: "Rent",
    category: PRESET_CATEGORIES[0],
    amount: 1200,
    direction: "withdrawal",
    isRecurring: true,
  };

  it("accepts a well-formed occurrence", () => {
    expect(isOccurrence(valid)).toBe(true);
  });

  it("rejects non-objects and null", () => {
    expect(isOccurrence(null)).toBe(false);
    expect(isOccurrence("nope")).toBe(false);
    expect(isOccurrence(undefined)).toBe(false);
  });

  it("rejects objects missing or mistyping required fields", () => {
    expect(isOccurrence({ ...valid, amount: "1200" })).toBe(false);
    expect(isOccurrence({ ...valid, direction: "sideways" })).toBe(false);
    expect(isOccurrence({ ...valid, isRecurring: "yes" })).toBe(false);
    expect(isOccurrence({ ...valid, category: { id: "x" } })).toBe(false);
  });
});
```

(`PRESET_CATEGORIES` is re-exported from `src/types/index.ts` via `export * from "./consts"`.)

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec vitest run src/types/tests.ts
```

Expected: FAIL with `isOccurrence is not defined`.

- [ ] **Step 3: Implement the guard**

In `src/types/index.ts`, extend the remeda import on line 1 to add `isNumber` and `isBoolean`:

```ts
import { isString, isArray, isPlainObject, isNumber, isBoolean } from "remeda";
```

Then add this export after `isCalendarEvent` (it depends on `isCategory`, which is defined above it):

```ts
export const isOccurrence = (value: unknown): value is Occurrence =>
  isPlainObject(value) &&
  isString(value.eventId) &&
  isString(value.date) &&
  isString(value.title) &&
  isCategory(value.category) &&
  isNumber(value.amount) &&
  (value.direction === "deposit" || value.direction === "withdrawal") &&
  isBoolean(value.isRecurring);
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm exec vitest run src/types/tests.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/types/tests.ts
git commit -m "feat(types): add isOccurrence type guard"
```

---

## Task 6: `moveEvent` on CalendarContext

**Files:**
- Modify: `src/context/CalendarContext/types.ts`
- Modify: `src/context/CalendarContext/index.tsx`

This task is verified by `pnpm check` (typecheck) plus the Task 13 browser pass. It is orchestration over the already-tested helpers from Tasks 2-5, so it has no separate vitest (there is no context-test harness in this repo and jsdom cannot exercise the drag flow).

- [ ] **Step 1: Add `moveEvent` to the context type**

In `src/context/CalendarContext/types.ts`, add this member to `CalendarContextValue` (after `deleteEvent`):

```ts
  moveEvent: (
    occurrence: Occurrence,
    toDate: string,
    scope: EditScope,
  ) => Promise<() => Promise<void>>;
```

`Occurrence` and `EditScope` are already imported/defined in this file.

- [ ] **Step 2: Import the new helpers**

In `src/context/CalendarContext/index.tsx`, add `buildMovedFollowing`, `daysBetweenISO`, and `shiftSeries` to the existing import from `@/lib/recurrence` (the block that already imports `cancelOccurrence`, `truncateBefore`, etc.):

```ts
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
```

- [ ] **Step 3: Implement `moveEvent`**

In `src/context/CalendarContext/index.tsx`, add this `useCallback` right after `deleteEvent` (before `usedCategories`):

```ts
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
```

- [ ] **Step 4: Expose `moveEvent` on the context value**

In the `value: CalendarContextValue = { ... }` object, add `moveEvent` after `deleteEvent`:

```ts
    updateEvent,
    deleteEvent,
    moveEvent,
    createCategory,
```

- [ ] **Step 5: Verify typecheck and existing tests pass**

Run:

```bash
pnpm check && pnpm test
```

Expected: PASS (formatting, lint, typecheck, and the full vitest suite).

- [ ] **Step 6: Commit**

```bash
git add src/context/CalendarContext/index.tsx src/context/CalendarContext/types.ts
git commit -m "feat(calendar): add moveEvent with undo to CalendarContext"
```

---

## Task 7: Make `EventChip` draggable

**Files:**
- Modify: `src/components/EventChip/types.ts`
- Modify: `src/components/EventChip/index.tsx`
- Create: `src/components/DraggableEventChip/index.tsx`

Verified by `pnpm check` plus the Task 13 browser pass.

- [ ] **Step 1: Add optional drag props to the chip type**

Replace the contents of `src/components/EventChip/types.ts` with:

```ts
import type { Occurrence } from "@/types";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";

export type EventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
  dragRef?: (element: HTMLElement | null) => void;
  dragListeners?: DraggableSyntheticListeners;
  dragAttributes?: DraggableAttributes;
  isDragging?: boolean;
};
```

- [ ] **Step 2: Spread the drag props onto the button**

Replace the contents of `src/components/EventChip/index.tsx` with:

```tsx
import { catColorVar, catGlowVar } from "@/utils/categoryColor";
import { formatSignedCompact } from "@/utils/formatCurrency";
import { signedAmount } from "@/lib/balance";

import type { EventChipProps } from "./types";

export * from "./types";

const EventChip = ({
  occurrence,
  onSelect,
  dragRef,
  dragListeners,
  dragAttributes,
  isDragging,
}: EventChipProps) => {
  const { color } = occurrence.category;
  const delta = signedAmount(occurrence.direction, occurrence.amount);
  return (
    <button
      ref={dragRef}
      type="button"
      className={`cy-chip w-full text-left${isDragging ? " cy-chip-dragging" : ""}`}
      style={{
        borderLeftColor: catColorVar(color),
        boxShadow: `-1px 0 8px color-mix(in srgb, ${catGlowVar(color)} 40%, transparent)`,
        touchAction: "none",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(occurrence);
      }}
      title={occurrence.title}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
    >
      {occurrence.isRecurring && <span>↻</span>}
      <span className="truncate">{occurrence.title}</span>
      <span className="cy-mono ml-auto pl-1">{formatSignedCompact(delta)}</span>
    </button>
  );
};

export default EventChip;
```

(`touch-action: none` lets a touch drag start without scrolling the page. The drag listeners are spread last so they never override the explicit `onClick`; they carry pointer handlers, not click handlers, so click-to-edit is preserved by the activation distance configured in Task 11.)

- [ ] **Step 3: Create the draggable wrapper**

Create `src/components/DraggableEventChip/index.tsx`:

```tsx
import { useDraggable } from "@dnd-kit/core";
import type { Occurrence } from "@/types";
import EventChip from "@/components/EventChip";

type DraggableEventChipProps = {
  occurrence: Occurrence;
  onSelect: (occurrence: Occurrence) => void;
};

const DraggableEventChip = ({
  occurrence,
  onSelect,
}: DraggableEventChipProps) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${occurrence.eventId}:${occurrence.date}`,
    data: { occurrence },
  });
  return (
    <EventChip
      occurrence={occurrence}
      onSelect={onSelect}
      dragRef={setNodeRef}
      dragListeners={listeners}
      dragAttributes={attributes}
      isDragging={isDragging}
    />
  );
};

export default DraggableEventChip;
```

- [ ] **Step 4: Verify typecheck and lint pass**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EventChip src/components/DraggableEventChip
git commit -m "feat(chip): make EventChip draggable via DraggableEventChip"
```

---

## Task 8: Make `DayCell` a drop target

**Files:**
- Modify: `src/components/DayCell/index.tsx`

Verified by `pnpm check` plus the Task 13 browser pass.

- [ ] **Step 1: Wire the droppable and render draggable chips**

Replace the contents of `src/components/DayCell/index.tsx` with:

```tsx
import { useDroppable } from "@dnd-kit/core";
import DraggableEventChip from "@/components/DraggableEventChip";
import DayEventsPopover from "@/components/DayEventsPopover";
import { CyberFrame } from "@/components/CyberFrame";
import { formatCurrency } from "@/utils/formatCurrency";

import { MAX_VISIBLE_CHIPS } from "./consts";
import type { DayCellProps } from "./types";

export * from "./consts";
export * from "./types";

const DayCell = ({
  cell,
  isToday,
  tabIndex,
  occurrences,
  balance,
  dateLabel,
  onSelectDate,
  onSelectOccurrence,
}: DayCellProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: cell.iso });
  const visible = occurrences.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = occurrences.slice(MAX_VISIBLE_CHIPS);
  const classes = ["cy-cell", "flex", "min-h-0", "flex-col", "gap-1", "p-1.5"];
  if (!cell.inMonth) classes.push("out");
  if (isToday) classes.push("today");
  if (isOver) classes.push("drop");

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      tabIndex={tabIndex}
      data-iso={cell.iso}
      className={classes.join(" ")}
      onClick={() => onSelectDate(cell.iso)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelectDate(cell.iso);
      }}
    >
      <CyberFrame
        chamfer={12}
        corners={["tr"]}
        color={isToday ? "var(--cy-yellow)" : "var(--cy-line)"}
      />
      <span className="cy-cell-num">
        {String(cell.dayOfMonth).padStart(2, "0")}
      </span>
      <div className="flex flex-col gap-1 overflow-hidden">
        {visible.map((o) => (
          <DraggableEventChip
            key={`${o.eventId}:${o.date}`}
            occurrence={o}
            onSelect={onSelectOccurrence}
          />
        ))}
        {overflow.length > 0 && (
          <DayEventsPopover
            label={`+${overflow.length} more`}
            dateLabel={dateLabel}
            occurrences={occurrences}
            onSelect={onSelectOccurrence}
          />
        )}
      </div>
      <span
        className={`cy-balance mt-auto self-end ${balance < 0 ? "cy-balance-neg" : ""}`}
      >
        {formatCurrency(balance)}
      </span>
    </div>
  );
};

export default DayCell;
```

(The `data-iso` attribute and grid keyboard navigation are unchanged; `setNodeRef` is the cell's only ref, so there is no conflict. The overflow popover keeps plain non-draggable chips, the deliberate v1 limitation noted at the top.)

- [ ] **Step 2: Verify typecheck and lint pass**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DayCell/index.tsx
git commit -m "feat(daycell): accept dropped chips as a droppable target"
```

---

## Task 9: Add a `"move"` action to the recurrence scope dialog

**Files:**
- Modify: `src/components/RecurrenceScopeDialog/types.ts`
- Modify: `src/components/RecurrenceScopeDialog/index.tsx`

Verified by `pnpm check` plus the Task 13 browser pass.

- [ ] **Step 1: Allow `"move"` in the props type**

In `src/components/RecurrenceScopeDialog/types.ts`, change the `action` field:

```ts
  action: "edit" | "delete" | "move";
```

- [ ] **Step 2: Add the title for `"move"`**

In `src/components/RecurrenceScopeDialog/index.tsx`, replace the `DialogTitle` body:

```tsx
          <DialogTitle className="cy-display uppercase tracking-wide">
            {action === "edit"
              ? "Edit recurring event"
              : action === "delete"
                ? "Delete recurring event"
                : "Move recurring event"}
          </DialogTitle>
```

(The scope options - This event / This and following / All events - read correctly for a move, so `consts.ts` is unchanged.)

- [ ] **Step 3: Verify typecheck and lint pass**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/RecurrenceScopeDialog
git commit -m "feat(scope-dialog): support a move action"
```

---

## Task 10: Themed `sonner` Toaster and drag styles

**Files:**
- Create: `src/components/ui/sonner.tsx`
- Modify: `src/globals.css`

Verified by `pnpm check` plus the Task 13 browser pass.

- [ ] **Step 1: Create the Toaster wrapper**

Create `src/components/ui/sonner.tsx`:

```tsx
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    position="bottom-center"
    toastOptions={{
      classNames: {
        toast: "cy-toast",
        actionButton: "cy-toast-action",
      },
    }}
    {...props}
  />
);

export { Toaster };
```

- [ ] **Step 2: Add the drop, dragging, and toast styles**

Append to the end of `src/globals.css` (these are intentionally unlayered `.cy-*` rules covering visual props only, matching the existing convention):

```css
/* Drop target highlight while a chip is dragged over a day cell. Mirrors the
   `today` cyan treatment: outer glow on the host, inset glow on the chamfered
   fill so the highlight follows the cell's clipped shape. */
.cy-cell.drop {
  box-shadow: 0 0 16px var(--cy-glow-cyan-soft);
}
.cy-cell.drop::before {
  box-shadow: inset 0 0 22px var(--cy-glow-cyan-soft);
}
/* The source chip dims while its DragOverlay copy follows the pointer. */
.cy-chip-dragging {
  opacity: 0.35;
}
/* sonner toast themed to the cyberpunk panel look. */
.cy-toast {
  background: linear-gradient(
    180deg,
    var(--cy-dialog-top),
    var(--cy-dialog-bottom)
  );
  color: var(--cy-text);
  border: 1px solid var(--cy-line);
  border-radius: 0;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
}
.cy-toast-action {
  background: var(--cy-cyan);
  color: var(--cy-cta-fg);
  border-radius: 0;
}
```

- [ ] **Step 3: Verify formatting, lint, and typecheck pass**

Run:

```bash
pnpm check
```

Expected: PASS. If prettier flags the CSS or TSX, run `pnpm format` and re-run `pnpm check`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sonner.tsx src/globals.css
git commit -m "feat(ui): add themed sonner Toaster and drag styles"
```

---

## Task 11: Wire drag-and-drop into `App`

**Files:**
- Modify: `src/App.tsx`

Verified by `pnpm check` plus the Task 13 browser pass.

- [ ] **Step 1: Update imports and add module-level helpers**

In `src/App.tsx`, replace the top import section (lines 1-14, through the `DataDialog` import) with:

```tsx
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
import CalendarToolbar from "@/components/CalendarToolbar";
import MonthGrid from "@/components/MonthGrid";
import EventChip from "@/components/EventChip";
import EventDialog from "@/components/EventDialog";
import RecurrenceScopeDialog from "@/components/RecurrenceScopeDialog";
import ManageCategoriesDialog from "@/components/ManageCategoriesDialog";
import DataDialog from "@/components/DataDialog";
import { Toaster } from "@/components/ui/sonner";

const noop = () => {};
const dropDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
```

- [ ] **Step 2: Extend `ScopeState` with a move variant**

Replace the `ScopeState` type (currently lines 20-27) with:

```tsx
type ScopeState =
  | {
      action: "edit";
      input: EventInput;
      event: CalendarEvent;
      occurrenceDate: string;
    }
  | { action: "delete"; event: CalendarEvent; occurrenceDate: string }
  | { action: "move"; occurrence: Occurrence; toDate: string };
```

- [ ] **Step 3: Add drag state and sensors**

Inside `CalendarScreen`, just after the existing `const [dataOpen, setDataOpen] = useState(false);`, add:

```tsx
  const [activeOccurrence, setActiveOccurrence] = useState<Occurrence | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
```

- [ ] **Step 4: Add the move runner and drag handlers**

Add these inside `CalendarScreen` (for example just before `confirmScope`):

```tsx
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
```

- [ ] **Step 5: Route the move through `confirmScope`**

Replace `confirmScope` (currently lines 107-118) with:

```tsx
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
```

- [ ] **Step 6: Wrap the grid in a `DndContext` and mount the overlay + Toaster**

Replace the `<MonthGrid ... />` element (currently lines 156-163) with:

```tsx
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
```

Then add `<Toaster />` just before the closing `</main>` tag (after the `<DataDialog ... />`):

```tsx
      <Toaster />
    </main>
```

- [ ] **Step 7: Verify formatting, lint, typecheck, and tests pass**

Run:

```bash
pnpm check && pnpm test
```

Expected: PASS. If prettier complains, run `pnpm format` then re-run.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(calendar): drag-and-drop events with scope prompt and undo toast"
```

---

## Task 12: Documentation

**Files:**
- Modify: `docs/TRD.md`
- Modify: `docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md`

- [ ] **Step 1: Record the popover limitation in the spec**

In `docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md`, under the "Edge cases" list in the Behavior section, add:

```markdown
- Only the chips shown directly in a day cell (the first few) are draggable.
  Events in the "+N more" overflow popover are not draggable in this version.
```

- [ ] **Step 2: Document the feature in the TRD**

In `docs/TRD.md`, find the section describing `CalendarContext` / the `useCalendar()` API and the `src/lib/recurrence` module. Add documentation, in the existing plain voice (no em dashes), covering:

- The new `moveEvent(occurrence, toDate, scope)` context method: it moves an event to a new day, returns an undo thunk, and persists through the same storage path as the other mutations (so cross-tab sync and the storage-unavailable banner apply).
- The recurrence helpers `shiftISO`, `daysBetweenISO`, `shiftSeries` (all-scope slide), and `buildMovedFollowing` (following-scope tail).
- The drag-and-drop UX: `@dnd-kit/core` powers it, chips are draggable, day cells are drop targets, recurring drags reuse the recurrence scope dialog (now with a `"move"` action), and a `sonner` toast offers Undo. Note that "this occurrence" detaches into a standalone one-off event, that "all" slides `endsOn` with the series, and that overflow-popover chips are not draggable.

Match the heading style and depth of the surrounding TRD entries. Do not invent file paths; reference the ones changed in this plan.

- [ ] **Step 3: Verify formatting passes**

Run:

```bash
pnpm check
```

Expected: PASS (prettier checks markdown too). Run `pnpm format` if it flags the docs.

- [ ] **Step 4: Commit**

```bash
git add docs/TRD.md docs/superpowers/specs/2026-06-08-event-drag-and-drop-design.md
git commit -m "docs: document event drag-and-drop (moveEvent, helpers, TRD)"
```

---

## Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated gate**

Run:

```bash
pnpm check && pnpm test
```

Expected: PASS on formatting, lint, typecheck, and the entire vitest suite.

- [ ] **Step 2: Manual browser verification**

Run `pnpm dev` and open http://localhost:5173. Confirm each of the following (jsdom cannot test these, so they must be checked by hand):

1. A plain click on a chip still opens the editor (drag did not break click-to-edit).
2. Dragging a non-recurring event's chip onto another day shows a cyan drop highlight on the hovered cell, moves the event on drop, and shows a "Moved to <date>" toast. Clicking Undo restores it to the original day.
3. The running balances and any per-day totals update to reflect the move.
4. Dragging a recurring event's chip opens the scope dialog titled "Move recurring event":
   - This event: the dragged occurrence detaches to the drop day as a one-off (no ↻ badge); the rest of the series is unchanged.
   - This and following: the series splits, with later occurrences resuming on the new day-of-week/offset.
   - All events: the entire series slides by the drag offset.
5. Dropping a chip back on its own day does nothing (no toast).
6. The drag overlay chip is visible and themed while dragging, and the source chip dims.
7. Touch drag works (or, if testing on desktop only, a pen/touch emulation drag) without scrolling the page.

- [ ] **Step 3: Confirm the branch is clean**

Run:

```bash
git status
```

Expected: clean working tree, all work committed on `feat/event-drag-and-drop`.

---

## Self-review notes

- Spec coverage: behavior table (Tasks 6, 11), domain helpers (Tasks 2-4), `moveEvent` + undo (Task 6), dnd-kit mechanics (Tasks 7, 8, 11), scope prompt move action (Task 9), sonner toast (Tasks 10, 11), testing (Tasks 2-5 automated, Task 13 manual), docs and dependencies (Tasks 1, 12). The "this occurrence detaches" and "all slides endsOn" decisions are exercised in Task 6 and the Task 13 checklist.
- Type consistency: `moveEvent(occurrence, toDate, scope) => Promise<() => Promise<void>>` is identical in the type (Task 6 Step 1), the implementation (Step 3), and the call sites (Task 11). `isOccurrence`, `shiftSeries`, `buildMovedFollowing`, `daysBetweenISO`, and `shiftISO` names match across definition and use.
