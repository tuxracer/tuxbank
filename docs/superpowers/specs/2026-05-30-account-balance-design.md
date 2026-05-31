# Design — Account Balance on the Calendar

**Status:** Approved for planning · **Date:** 2026-05-30 · **Feature:** running account balance from event deposits/withdrawals

Extends the [cyberpunk calendar](../../TRD.md) so each event carries an **amount** and a **deposit/withdrawal direction**, and every day in the month view shows the **running account balance** — the cumulative total of all deposits minus withdrawals up to and including that day, carried continuously across months.

---

## 1. Goal & Decisions

Turn the calendar into a lightweight cash-flow view (à la CalendarBudget): see your projected balance day-by-day.

Approved decisions:
- **Cumulative balance, carried across months.** `balance(day) = Σ signed amount of every occurrence with date ≤ day`, starting from **0**.
- **No opening-balance setting.** Baseline is 0; the user models starting funds by adding a deposit event.
- **Every event has an amount.** A required positive amount plus a required deposit/withdrawal direction.
- **Series-level amounts.** Every occurrence of a recurring event uses the event's amount/direction; per-occurrence overrides do **not** change the amount (out of scope for v1).
- **Carry-in via enumeration, cap removed.** The cumulative carry-in (transactions before the visible window) is summed by enumerating occurrences; the truncating iteration cap is removed so long/infinite recurrences sum correctly.

---

## 2. Data Model & Migration

```ts
export type TransactionDirection = "deposit" | "withdrawal";

// CalendarEvent gains:
amount: number;             // >= 0 in storage; > 0 enforced by the editor
direction: TransactionDirection;

// Occurrence gains (carried from the event — series-level, not patchable):
amount: number;
direction: TransactionDirection;
```

- **Signed amount helper** (exported from `src/lib/balance`): `signedAmount(direction, amount) = direction === "withdrawal" ? -amount : amount`. The `EventChip` derives its own sign directly from `direction`.
- `expandEvent` sets each occurrence's `amount = event.amount` and `direction = event.direction`. The override `patch` shape is unchanged (`{ title?, categoryId?, notes? }`) — amounts are series-level.
- **Migration / back-compat:** `isCalendarEvent` stays tolerant (does **not** require `amount`/`direction`, so pre-feature rows still load). `getAllEvents` normalizes every loaded row through `withTransactionDefaults(event)` which fills `amount: 0, direction: "deposit"` when absent. A `$0` event has zero balance impact and renders as `$0.00`. New writes always include both fields. No IndexedDB version bump.
- **Currency formatting:** a shared `formatCurrency(n)` built on `new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })`. USD is a v1 constant (locale/currency configurable later).

---

## 3. Balance Engine — `src/lib/balance` (pure)

```ts
computeRunningBalances(
  events: CalendarEvent[],
  cells: DateCell[],            // the visible 42-day grid
  getCategory: CategoryResolver,
): Record<string, number>        // dateISO -> running balance
```

Algorithm:
1. `windowStart = cells[0].iso`, `windowEnd = cells[cells.length - 1].iso`.
2. **Carry-in:** for each event, sum `signedAmount` of every occurrence in `[event.date, dayBeforeISO(windowStart)]` via `expandEvent(event, event.date, dayBeforeISO(windowStart), getCategory)`. Sum across events = `carryIn`. (Non-recurring events contribute their single transaction if before the window.)
3. **Window deltas:** `expandEvents(events, windowStart, windowEnd, getCategory)`, summed per `date` into `netByDate`.
4. **Accumulate:** `running = carryIn`; iterate `cells` in order, `running += netByDate[cell.iso] ?? 0`, set `result[cell.iso] = running`.

Cancelled occurrences are already dropped by `expandEvent`, so they contribute 0. Pure and unit-testable; memoized in `CalendarContext` (recompute on `events` or `cells` change).

**Cap change:** `expandEvent`'s `MAX_ITER` truncation is removed (raised to a high runaway backstop, e.g. `1_000_000`). The loop already terminates at `hardEndISO` for any finite range, so an infinite recurrence (`endsOn: null`) is summed correctly up to the window. Cost is `O(occurrences before the window)` per event — fast and memoized for personal-scale data.

---

## 4. State wiring — `CalendarContext`

- Add `balancesByDate: Record<string, number>` to the context value, computed with `useMemo` from `events` + `cells` via `computeRunningBalances`.
- Pass it to `MonthGrid` (new prop `balancesByDate`) → `DayCell` (new prop `balance: number`).

---

## 5. UI

**EventDialog** — two new fields:
- **Amount:** `Input type="number"` (step `0.01`, `min` 0), required.
- **Direction:** shadcn `RadioGroup` (Deposit / Withdrawal), neon-styled, required. Default `deposit`.
- `EventInput` and `toEventInput` gain `amount` + `direction`.

**DayCell** — running balance at the bottom of every cell:
- Currency-formatted via `formatCurrency`.
- Color-coded: **≥ 0 → cyan/green glow, < 0 → magenta glow** (new `.cy-balance` / `.cy-balance-neg` classes, visual props only — no `position`, per the globals.css layering note).
- Shown on all cells (continuous), dimmed on out-of-month days.

**EventChip** — append the signed amount, currency-formatted and compact (e.g., `+3,000` / `−1,500`). Category color stays the chip accent.

**Toolbar HUD** *(optional, low-cost)* — a projected-balance readout, e.g. `BAL ◢ $4,200` (balance on the last visible day, or today). Include if it fits cleanly; not required.

Cell sketch:
```
┌────────────────────┐
│ 14 (today glow)    │
│ ▸ Paycheck  +3,000 │   cyan chip
│ ▸ Rent      −1,500 │   magenta chip
│         $4,200.00  │   running balance (cyan ≥0 / magenta <0)
└────────────────────┘
```

---

## 6. Validation & Error Handling

- **zod (EventDialog schema):** `amount` = `z.coerce.number()` `> 0` ("Amount must be greater than 0"); `direction` = `z.enum(["deposit", "withdrawal"])`. Inline field errors, submit-time validation (consistent with the existing form).
- Migrated legacy events sit at `$0` until edited; editing one requires entering a positive amount (form rule).
- No new storage error paths; balance computation is pure and total (returns 0s when there are no events).

---

## 7. Testing (vitest, behavior-focused)

**Balance engine (`src/lib/balance/tests.ts`):**
- Single deposit and single withdrawal → balance correct on and after that day, 0 before.
- Cumulative across multiple days within a month.
- **Carry-in across a month boundary:** a transaction in an earlier month is reflected in a later month's balances.
- Recurring weekly deposit → balance steps up on each occurrence.
- **Infinite recurring event with an old anchor viewed in a later month** → carry-in summed correctly (cap-removed).
- Cancelled occurrence excluded from the balance.
- Negative balance (withdrawal before any deposit).

**Migration:** a legacy event object lacking `amount`/`direction` loads with defaults and contributes 0.

**Components:** EventDialog amount/direction validation (empty/0 amount blocks submit, valid submits an `EventInput` with `amount`+`direction`); DayCell renders the formatted balance with the correct sign class; EventChip shows the signed amount.

---

## 8. Out of Scope (v1)

Per-occurrence amount overrides; multiple accounts; multi-currency; an opening-balance/as-of-date setting; reports/charts/category spend trends; importing transactions.

## 9. Assumptions

- Currency is **USD** (single constant).
- Amount is a positive magnitude (`> 0`) plus a direction; legacy events default to `$0` deposit.
- Personal-scale data — enumeration-based carry-in is fast enough; no caching beyond the context `useMemo`.
