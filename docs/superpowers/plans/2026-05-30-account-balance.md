# Account Balance on the Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `amount` + deposit/withdrawal `direction` to every calendar event and show a cumulative running account balance on each day of the month view.

**Architecture:** `amount`/`direction` become required fields on `CalendarEvent` and `Occurrence` (legacy rows normalized to `$0` deposit on read). A new pure `src/lib/balance` module computes per-day running balances by summing all transaction occurrences up to each visible day (carry-in via enumeration, recurrence cap raised so infinite series sum correctly). `CalendarContext` memoizes `balancesByDate`; `DayCell` renders it.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, date-fns, react-hook-form + zod, vitest. See [docs/TRD.md](../../TRD.md), [CLAUDE.md](../../../CLAUDE.md), and the design spec [docs/superpowers/specs/2026-05-30-account-balance-design.md](../specs/2026-05-30-account-balance-design.md).

---

## File Structure

```
src/types/index.ts                         # + TransactionDirection, amount/direction on CalendarEvent & Occurrence
src/lib/recurrence/index.ts                # populate occ amount/direction; EventInput +fields; buildFollowingSeries +fields; raise MAX_ITER
src/lib/storage/index.ts                    # withTransactionDefaults() normalizer in getAllEvents
src/lib/balance/{index.ts,tests.ts}         # NEW: signedAmount + computeRunningBalances
src/utils/formatCurrency/{index.ts,tests.ts} # NEW: formatCurrency + formatSignedCompact
src/context/CalendarContext/index.tsx       # createEvent sets amount/direction; expose balancesByDate (memo)
src/components/EventDialog/{schema.ts,index.tsx,tests.tsx}  # Amount + Direction fields
src/components/EventChip/index.tsx          # show signed amount
src/components/DayCell/index.tsx            # show running balance (color by sign)
src/components/MonthGrid/index.tsx          # thread balancesByDate
src/app/globals.css                         # .cy-balance / .cy-balance-neg
src/app/page.tsx                            # pass balancesByDate; optional HUD readout
```

Convention reminders (CLAUDE.md): module = directory with `index.ts(x)`; tests colocated as `tests.ts(x)`; type guards over `as`; named constants; **local dates via date-fns, never `toISOString()`**; cyberpunk `.cy-*` classes are visual-only (never `position`).

---

## Task 1: Introduce `amount`/`direction` across the model + editor (suite stays green)

Making the fields **required** breaks every `CalendarEvent`/`Occurrence` literal until all producers and fixtures are updated, so this is one atomic, green commit.

**Files:**
- Modify: `src/types/index.ts`, `src/lib/recurrence/index.ts`, `src/context/CalendarContext/index.tsx`, `src/components/EventDialog/schema.ts`, `src/components/EventDialog/index.tsx`
- Modify tests: `src/lib/recurrence/tests.ts`, `src/lib/storage/tests.ts`, `src/context/CalendarContext/tests.tsx`, `src/components/MonthGrid/tests.tsx`, `src/components/EventDialog/tests.tsx`

- [ ] **Step 1: Add the types** in `src/types/index.ts`

Add the direction type and the two fields:
```ts
export type TransactionDirection = "deposit" | "withdrawal";
```
In `CalendarEvent` (after `categoryId`):
```ts
  amount: number; // >= 0; editor enforces > 0
  direction: TransactionDirection;
```
In `Occurrence` (after `category`):
```ts
  amount: number;
  direction: TransactionDirection;
```
Leave `isCalendarEvent` unchanged (stays tolerant of missing amount/direction so legacy rows still load).

- [ ] **Step 2: Populate occurrences + extend EventInput + carry through split** in `src/lib/recurrence/index.ts`

In `expandEvent`, the non-recurring return object — add:
```ts
        amount: event.amount,
        direction: event.direction,
```
In the recurring `result.push({ ... })` — add the same two lines (`amount: event.amount, direction: event.direction`). (Amounts are series-level; overrides do not change them.)

Extend `EventInput`:
```ts
export type EventInput = {
  title: string;
  date: string;
  categoryId: string;
  notes?: string;
  amount: number;
  direction: TransactionDirection;
  recurrence: Recurrence | null;
};
```
(Add `import type { ..., TransactionDirection } from "@/types";` to the existing type import.)

In `buildFollowingSeries`, the returned object — add:
```ts
  amount: input.amount,
  direction: input.direction,
```

- [ ] **Step 3: Set fields in context create** — `src/context/CalendarContext/index.tsx`

In `createEvent`, the `event: CalendarEvent = { ... }` literal — add:
```ts
      amount: input.amount,
      direction: input.direction,
```
(The `updateEvent` "all" branch uses `{ ...current, ...input }` and already carries them through.)

- [ ] **Step 4: Editor — schema + form fields + mapper** — `src/components/EventDialog/schema.ts` and `index.tsx`

In `schema.ts`, add to the zod object (before `.refine`):
```ts
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    direction: z.enum(["deposit", "withdrawal"]),
```
And in `toEventInput`, add to the returned object:
```ts
  amount: v.amount,
  direction: v.direction,
```
In `index.tsx` `buildDefaults`: add `amount` and `direction` to BOTH returned objects.
- edit branch: `amount: sourceEvent.amount, direction: sourceEvent.direction,`
- create branch: `amount: 0, direction: "deposit",`
Add the fields to the form, after the Category block (uses native `<select>` for Direction, consistent with the existing Category/Repeat selects — register-based, simpler than a Radix RadioGroup; same behavior):
```tsx
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" step="0.01" min={0} {...register("amount")} />
              {errors.amount && (
                <p className="text-xs text-[color:var(--cy-magenta)]">{errors.amount.message}</p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="direction">Type</Label>
              <select id="direction" className="cy-btn px-3 py-2 text-sm" {...register("direction")}>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
          </div>
```

- [ ] **Step 5: Update all existing fixtures** so they compile and keep asserting behavior.

- `src/lib/recurrence/tests.ts`: add `amount: 0, direction: "deposit",` to the `base` `CalendarEvent` literal and the `series` `CalendarEvent` literal. In the `buildFollowingSeries` test, add `amount: 0, direction: "deposit",` to the inline `EventInput` object.
- `src/lib/storage/tests.ts`: add `amount: 0, direction: "deposit",` to the `make(id)` `CalendarEvent` literal.
- `src/context/CalendarContext/tests.tsx`: add `amount: <n>, direction: "<...>",` to every `createEvent({ ... })` call (use `amount: 100, direction: "deposit"` unless the test needs otherwise).
- `src/components/MonthGrid/tests.tsx`: add `amount: 0, direction: "deposit",` to every `Occurrence` literal (the standalone `occ` and the `occ(i)` factory).
- `src/components/EventDialog/tests.tsx`: add `amount: 0, direction: "deposit",` to the `sourceEvent` `CalendarEvent` literal and `amount: 0, direction: "deposit",` to the `occurrence` `Occurrence` literal. Update the **"submits a valid one-off event"** test to fill the amount before submitting and assert it:
```tsx
    await userEvent.type(screen.getByLabelText(/title/i), "Dentist");
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), "50");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Dentist", date: "2026-05-14", amount: 50, direction: "deposit", recurrence: null,
    });
```

- [ ] **Step 6: Add an editor validation test** — append to `src/components/EventDialog/tests.tsx` inside the describe:
```tsx
  it("blocks submit when amount is not greater than zero", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/title/i), "Coffee");
    await userEvent.clear(screen.getByLabelText(/amount/i)); // defaults to 0
    await userEvent.type(screen.getByLabelText(/amount/i), "0");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText("Amount must be greater than 0")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: Verify green & commit**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm check`
Expected: tsc clean; all suites pass (existing counts + 1 new dialog test); check exit 0.
```bash
git add src/types src/lib/recurrence src/context src/components/EventDialog src/lib/storage/tests.ts src/components/MonthGrid/tests.tsx
git commit -m "feat: add amount + deposit/withdrawal direction to calendar events"
```

---

## Task 2: Normalize legacy events on read (migration)

**Files:**
- Modify: `src/lib/storage/index.ts`
- Test: `src/lib/storage/tests.ts`

- [ ] **Step 1: Write the failing test** — append to `src/lib/storage/tests.ts`:
```ts
it("backfills amount/direction defaults for legacy events missing them", async () => {
  // write a legacy-shaped row directly (no amount/direction)
  const legacy = {
    id: "legacy", title: "Old", date: "2026-05-14", categoryId: "work",
    recurrence: null, overrides: [], createdAt: "t", updatedAt: "t",
  };
  await putEvent(legacy as unknown as CalendarEvent);
  const [loaded] = await getAllEvents();
  expect(loaded.amount).toBe(0);
  expect(loaded.direction).toBe("deposit");
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm exec vitest run src/lib/storage/tests.ts`
Expected: FAIL — `loaded.amount` is `undefined`.

- [ ] **Step 3: Add the normalizer + apply it** in `src/lib/storage/index.ts`

Add (after imports):
```ts
const withTransactionDefaults = (event: CalendarEvent): CalendarEvent => ({
  ...event,
  amount: typeof event.amount === "number" ? event.amount : 0,
  direction: event.direction === "withdrawal" ? "withdrawal" : "deposit",
});
```
In `getAllEvents`, change the return to normalize:
```ts
    return rows.filter(isCalendarEvent).map(withTransactionDefaults);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/lib/storage/tests.ts`
Expected: PASS (all storage tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/storage
git commit -m "feat: normalize legacy events to \$0 deposit on read"
```

---

## Task 3: Currency formatting util

**Files:**
- Create: `src/utils/formatCurrency/index.ts`, `src/utils/formatCurrency/tests.ts`

- [ ] **Step 1: Write the failing test** — `src/utils/formatCurrency/tests.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatCurrency, formatSignedCompact } from "./index";

describe("formatCurrency", () => {
  it("formats a full USD amount with cents", () => {
    expect(formatCurrency(4200)).toBe("$4,200.00");
    expect(formatCurrency(-1500.5)).toBe("-$1,500.50");
  });

  it("formats a compact signed amount without cents", () => {
    expect(formatSignedCompact(3000)).toBe("+3,000");
    expect(formatSignedCompact(-1500)).toBe("-1,500");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/utils/formatCurrency/tests.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/utils/formatCurrency/index.ts`:
```ts
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const COMPACT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "always" });

export const formatCurrency = (amount: number): string => USD.format(amount);
export const formatSignedCompact = (amount: number): string => COMPACT.format(amount);
```
(Locale pinned to `en-US` so output is deterministic for tests; currency is USD per spec §9.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/utils/formatCurrency/tests.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/utils/formatCurrency
git commit -m "feat: USD currency formatting helpers"
```

---

## Task 4: Balance engine + uncapped carry-in

**Files:**
- Modify: `src/lib/recurrence/index.ts` (raise `MAX_ITER`)
- Create: `src/lib/balance/index.ts`, `src/lib/balance/tests.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/balance/tests.ts`:
```ts
import { describe, it, expect } from "vitest";
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarEvent } from "@/types";
import { PRESET_CATEGORIES } from "@/types";
import { buildMonthGrid } from "@/lib/dateGrid";
import { makeCategoryResolver } from "@/lib/recurrence";
import { computeRunningBalances, signedAmount } from "./index";

const getCategory = makeCategoryResolver(PRESET_CATEGORIES);
const may = buildMonthGrid(new Date(2026, 4, 1)); // 2026-04-26 .. 2026-06-06

const evt = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e", title: "t", date: "2026-05-10", categoryId: "work",
  amount: 100, direction: "deposit", recurrence: null, overrides: [],
  createdAt: "", updatedAt: "", ...over,
});

describe("signedAmount", () => {
  it("negates withdrawals", () => {
    expect(signedAmount("deposit", 100)).toBe(100);
    expect(signedAmount("withdrawal", 100)).toBe(-100);
  });
});

describe("computeRunningBalances", () => {
  it("is 0 before a transaction and reflects it on/after its day", () => {
    const b = computeRunningBalances([evt({ amount: 100, direction: "deposit" })], may, getCategory);
    expect(b["2026-05-09"]).toBe(0);
    expect(b["2026-05-10"]).toBe(100);
    expect(b["2026-05-11"]).toBe(100);
  });

  it("nets deposits and withdrawals cumulatively, can go negative", () => {
    const events = [
      evt({ id: "a", date: "2026-05-05", amount: 200, direction: "withdrawal" }),
      evt({ id: "b", date: "2026-05-08", amount: 50, direction: "deposit" }),
    ];
    const b = computeRunningBalances(events, may, getCategory);
    expect(b["2026-05-05"]).toBe(-200);
    expect(b["2026-05-08"]).toBe(-150);
  });

  it("carries the balance in from a previous month (before the window)", () => {
    // April grid window starts 2026-03-29; an event on 2026-03-01 is before it
    const aprilGrid = buildMonthGrid(new Date(2026, 3, 1));
    const b = computeRunningBalances([evt({ date: "2026-03-01", amount: 300, direction: "deposit" })], aprilGrid, getCategory);
    expect(b[aprilGrid[0].iso]).toBe(300); // first visible day already includes the carry-in
  });

  it("accumulates a recurring weekly deposit each occurrence", () => {
    const weekly = evt({ date: "2026-05-04", amount: 100, direction: "deposit", recurrence: { freq: "weekly", interval: 1, endsOn: null } });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b["2026-05-04"]).toBe(100);
    expect(b["2026-05-11"]).toBe(200);
    expect(b["2026-05-18"]).toBe(300);
  });

  it("sums an infinite daily series with an old anchor (carry-in past the old 1000 cap)", () => {
    const daily = evt({ date: "2022-01-01", amount: 1, direction: "deposit", recurrence: { freq: "daily", interval: 1, endsOn: null } });
    const b = computeRunningBalances([daily], may, getCategory);
    const firstDay = may[0].iso; // 2026-04-26 -> ~1576 days of $1, exceeds the old 1000 cap
    const expected = differenceInCalendarDays(parseISO(firstDay), parseISO("2022-01-01")) + 1;
    expect(b[firstDay]).toBe(expected);
  });

  it("excludes a cancelled occurrence", () => {
    const weekly = evt({
      date: "2026-05-04", amount: 100, direction: "deposit",
      recurrence: { freq: "weekly", interval: 1, endsOn: null },
      overrides: [{ occurrenceDate: "2026-05-11", cancelled: true }],
    });
    const b = computeRunningBalances([weekly], may, getCategory);
    expect(b["2026-05-11"]).toBe(100); // unchanged from 05-04 (the 05-11 occurrence is gone)
    expect(b["2026-05-18"]).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/lib/balance/tests.ts`
Expected: FAIL — module not found (and the infinite-series test would fail under the old cap once the module exists).

- [ ] **Step 3: Raise the recurrence cap** in `src/lib/recurrence/index.ts`

Change the constant so long/infinite carry-in spans are not truncated (the loop already terminates at `hardEndISO`; this is only a runaway backstop):
```ts
const MAX_ITER = 1_000_000;
```

- [ ] **Step 4: Implement the engine** — `src/lib/balance/index.ts`:
```ts
import type { CalendarEvent, Occurrence, TransactionDirection } from "@/types";
import type { DateCell } from "@/lib/dateGrid";
import {
  dayBeforeISO,
  expandEvent,
  expandEvents,
  type CategoryResolver,
} from "@/lib/recurrence";

export const signedAmount = (direction: TransactionDirection, amount: number): number =>
  direction === "withdrawal" ? -amount : amount;

const sumSigned = (occurrences: Occurrence[]): number =>
  occurrences.reduce((total, o) => total + signedAmount(o.direction, o.amount), 0);

/** Running account balance for each visible day: starts at 0, cumulative across all transactions up to & including that day. */
export const computeRunningBalances = (
  events: CalendarEvent[],
  cells: DateCell[],
  getCategory: CategoryResolver,
): Record<string, number> => {
  const windowStart = cells[0].iso;
  const windowEnd = cells[cells.length - 1].iso;
  const beforeWindow = dayBeforeISO(windowStart);

  // carry-in: net of every occurrence strictly before the visible window
  let carryIn = 0;
  for (const event of events) {
    if (event.date > beforeWindow) continue; // no occurrence can fall before the window
    carryIn += sumSigned(expandEvent(event, event.date, beforeWindow, getCategory));
  }

  // net change per visible day
  const netByDate: Record<string, number> = {};
  for (const o of expandEvents(events, windowStart, windowEnd, getCategory)) {
    netByDate[o.date] = (netByDate[o.date] ?? 0) + signedAmount(o.direction, o.amount);
  }

  // accumulate forward across the grid
  const balances: Record<string, number> = {};
  let running = carryIn;
  for (const cell of cells) {
    running += netByDate[cell.iso] ?? 0;
    balances[cell.iso] = running;
  }
  return balances;
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/lib/balance/tests.ts && pnpm test`
Expected: balance suite passes (incl. the infinite-series test); full suite green.

- [ ] **Step 6: Commit**
```bash
git add src/lib/balance src/lib/recurrence/index.ts
git commit -m "feat: running-balance engine; uncap recurrence iteration for carry-in"
```

---

## Task 5: Expose `balancesByDate` from CalendarContext

**Files:**
- Modify: `src/context/CalendarContext/index.tsx`
- Test: `src/context/CalendarContext/tests.tsx`

- [ ] **Step 1: Write the failing test** — append inside the describe in `src/context/CalendarContext/tests.tsx`:
```tsx
  it("exposes a running balance per day from event deposits/withdrawals", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Paycheck", date: "2026-05-08", categoryId: "work", notes: undefined,
        amount: 1000, direction: "deposit", recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.balancesByDate["2026-05-08"]).toBe(1000));
    expect(result.current.balancesByDate["2026-05-07"]).toBe(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/context/CalendarContext/tests.tsx`
Expected: FAIL — `balancesByDate` undefined.

- [ ] **Step 3: Implement** in `src/context/CalendarContext/index.tsx`

Add the import:
```ts
import { computeRunningBalances } from "@/lib/balance";
```
Add to `CalendarContextValue`:
```ts
  balancesByDate: Record<string, number>;
```
Add the memo (next to `occurrencesByDate`):
```ts
  const balancesByDate = useMemo(
    () => computeRunningBalances(events, cells, getCategory),
    [events, cells],
  );
```
Add `balancesByDate` to the `value` object.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/context/CalendarContext/tests.tsx && pnpm check`
Expected: PASS; check exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/context/CalendarContext
git commit -m "feat: expose running balancesByDate from CalendarContext"
```

---

## Task 6: Show the signed amount on event chips

**Files:**
- Modify: `src/components/EventChip/index.tsx`
- Test: `src/components/EventChip/tests.tsx` (new)

- [ ] **Step 1: Write the failing test** — `src/components/EventChip/tests.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Occurrence } from "@/types";
import EventChip from "./index";

const occ = (over: Partial<Occurrence>): Occurrence => ({
  eventId: "e", date: "2026-05-14", title: "Rent",
  category: { id: "work", name: "Work", color: "cyan" },
  amount: 1500, direction: "withdrawal", isRecurring: false, ...over,
});

describe("EventChip", () => {
  it("shows a withdrawal as a negative compact amount", () => {
    render(<EventChip occurrence={occ({})} onSelect={vi.fn()} />);
    expect(screen.getByText("-1,500")).toBeInTheDocument();
  });

  it("shows a deposit as a positive compact amount", () => {
    render(<EventChip occurrence={occ({ title: "Pay", amount: 3000, direction: "deposit" })} onSelect={vi.fn()} />);
    expect(screen.getByText("+3,000")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/EventChip/tests.tsx`
Expected: FAIL — amount not rendered.

- [ ] **Step 3: Implement** — in `src/components/EventChip/index.tsx`

Add the import:
```ts
import { formatSignedCompact } from "@/utils/formatCurrency";
import { signedAmount } from "@/lib/balance";
```
Inside the component, before `return`:
```ts
  const delta = signedAmount(occurrence.direction, occurrence.amount);
```
Add the amount after the title span (inside the button):
```tsx
      <span className="cy-mono ml-auto pl-1">{formatSignedCompact(delta)}</span>
```
(`ml-auto` pushes it to the right; keep the existing `↻` marker and title span.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/components/EventChip/tests.tsx && pnpm check`
Expected: PASS (2 tests); check exit 0.

- [ ] **Step 5: Commit**
```bash
git add src/components/EventChip
git commit -m "feat: show signed amount on event chips"
```

---

## Task 7: Show the running balance on each day cell

**Files:**
- Modify: `src/app/globals.css`, `src/components/DayCell/index.tsx`, `src/components/MonthGrid/index.tsx`
- Test: `src/components/MonthGrid/tests.tsx`

- [ ] **Step 1: Write the failing test** — append inside the describe in `src/components/MonthGrid/tests.tsx`:
```tsx
  it("renders the running balance for a day when provided", () => {
    render(
      <MonthGrid
        cells={buildMonthGrid(new Date(2026, 4, 1))}
        todayISO="2026-05-14"
        occurrencesByDate={{}}
        balancesByDate={{ "2026-05-14": 4200 }}
        onSelectDate={vi.fn()}
        onSelectOccurrence={vi.fn()}
      />,
    );
    expect(screen.getByText("$4,200.00")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/components/MonthGrid/tests.tsx`
Expected: FAIL — `balancesByDate` not a prop / balance not rendered.

- [ ] **Step 3: Add balance styles** — append to `src/app/globals.css`:
```css
.cy-balance {
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  color: var(--cy-cyan);
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.45);
}
.cy-balance-neg {
  color: var(--cy-magenta);
  text-shadow: 0 0 8px rgba(255, 42, 109, 0.5);
}
```

- [ ] **Step 4: Render balance in `DayCell`** — `src/components/DayCell/index.tsx`

Add import:
```ts
import { formatCurrency } from "@/utils/formatCurrency";
```
Add `balance: number;` to `DayCellProps` and destructure it. After the chips `<div>` (still inside the cell), add:
```tsx
      <span
        className={`cy-balance mt-auto self-end ${balance < 0 ? "cy-balance-neg" : ""}`}
      >
        {formatCurrency(balance)}
      </span>
```
(`mt-auto self-end` pins it to the bottom-right; the cell is already a flex column.)

- [ ] **Step 5: Thread the prop through `MonthGrid`** — `src/components/MonthGrid/index.tsx`

Add to `MonthGridProps`:
```ts
  balancesByDate?: Record<string, number>;
```
Destructure it (default to an empty object): `balancesByDate = {}`. Pass to each `DayCell`:
```tsx
            balance={balancesByDate[cell.iso] ?? 0}
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm exec vitest run src/components/MonthGrid/tests.tsx && pnpm test && pnpm check`
Expected: MonthGrid tests pass (existing + new); full suite green; check exit 0.

- [ ] **Step 7: Commit**
```bash
git add src/app/globals.css src/components/DayCell src/components/MonthGrid
git commit -m "feat: show running balance on each day cell"
```

---

## Task 8: Wire balances into the page + HUD readout

**Files:**
- Modify: `src/app/page.tsx`, `src/components/CalendarToolbar/index.tsx`

- [ ] **Step 1: Pass balances to the grid** — in `src/app/page.tsx`, add to the `<MonthGrid ... />`:
```tsx
        balancesByDate={cal.balancesByDate}
```

- [ ] **Step 2: Add a HUD balance readout** — `src/components/CalendarToolbar/index.tsx`

Add `endBalance: number;` to `CalendarToolbarProps`. Import the formatter:
```ts
import { formatCurrency } from "@/utils/formatCurrency";
```
In the HUD status line (the right-hand `<span className="dim">`), append:
```tsx
&nbsp; BAL ◢ {formatCurrency(endBalance)}
```
In `src/app/page.tsx`, pass it (balance on the last visible day):
```tsx
        endBalance={cal.balancesByDate[cal.cells[cal.cells.length - 1].iso] ?? 0}
```

- [ ] **Step 3: Verify build + types**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc clean; production build succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/app/page.tsx src/components/CalendarToolbar
git commit -m "feat: wire running balance into the grid and HUD"
```

---

## Task 9: Final verification + docs

**Files:**
- Modify: `docs/TRD.md`

- [ ] **Step 1: Full gates**

Run: `pnpm test` (all suites), then `pnpm check` (exit 0), then `pnpm build` (succeeds). Fix anything red before proceeding.

- [ ] **Step 2: Browser smoke test (real Chrome — jsdom can't verify layout/visibility)**

`rm -rf .next && pnpm dev` (per CLAUDE.md gotcha: Turbopack can serve stale CSS). Then at `http://localhost:3000`:
- Create an event with Amount `1000`, Deposit → its chip shows `+1,000`; the day's balance shows `$1,000.00` in cyan; later days carry it.
- Create a Withdrawal of `1500` on a later day → that day's balance goes negative and renders magenta.
- Confirm the HUD shows `BAL ◢ <end-of-month balance>`.
- Take a screenshot to confirm rendering (not just the a11y tree).

- [ ] **Step 3: Update `docs/TRD.md`**

Add to §4.2 (events) that events carry an **amount** + **deposit/withdrawal direction**; add a short subsection noting each day shows a **cumulative running balance** (starts at 0, carried across months) computed by `src/lib/balance`. Keep it concise; do not reformat the file.

- [ ] **Step 4: Commit**
```bash
git add docs/TRD.md
git commit -m "docs: document amount/direction fields and running balance in TRD"
```

---

## Self-Review (author)

- **Spec coverage:** data model + migration (T1, T2) · signed amount + balance engine with carry-in & cap removal (T4) · cumulative-across-months + infinite-series + cancelled + negative tests (T4) · context `balancesByDate` (T5) · editor amount/direction + validation (T1) · chip amount (T6) · per-cell balance with sign color (T7) · HUD readout (T8) · USD formatting (T3) · TRD docs (T9). All spec sections map to a task.
- **Type consistency:** `EventInput`, `CalendarEvent`, `Occurrence` all gain `amount: number` + `direction: TransactionDirection`; `signedAmount(direction, amount)` and `computeRunningBalances(events, cells, getCategory)` are used identically in engine/context/tests; `balancesByDate: Record<string, number>` is the same shape in context → MonthGrid (`balancesByDate?`) → DayCell (`balance: number`).
- **Ordering/green-ness:** T1 is the atomic required-field rollout (all producers + fixtures) so the suite stays green; every later task is an additive, independently green increment.
- **Known nuance for the implementer:** the Direction field uses a native `<select>` (consistent with the existing Category/Repeat selects), not a Radix RadioGroup — same behavior; flag if a segmented toggle is wanted. EventDialog create-form defaults `amount` to `0` (must be changed to a positive value before save) — acceptable for v1.
