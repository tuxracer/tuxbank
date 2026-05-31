# Custom Categories (managed, persisted) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded preset categories with a persisted, user-managed category store — create on the fly via a combobox, edit/recolor/delete in a Manage dialog, and filter the calendar per category.

**Architecture:** A new IndexedDB `categories` store (DB v2, seeded from legacy events on upgrade). Events keep `categoryId`; `CalendarContext` builds the resolver from the loaded store (missing id → Uncategorized) so edits propagate. A creatable shadcn combobox (`Command`+`Popover`) handles select/create; a Manage Categories dialog handles rename/recolor/delete; the toolbar filter becomes per-category.

**Tech Stack:** Next.js 16 / React 19 / TS, `idb`, shadcn/ui (`command`,`popover`,`dialog`), react-hook-form + zod, date-fns, vitest. Spec: [docs/superpowers/specs/2026-05-30-custom-categories-design.md](../specs/2026-05-30-custom-categories-design.md). Conventions: [CLAUDE.md](../../../CLAUDE.md) (ESM, type guards, named consts, `pnpm check` before commit; jsdom can't verify layout — verify UI in a real browser; `rm -rf .next` if Turbopack serves stale CSS).

---

## File Structure

```
src/types/index.ts                         # + isCategory guard; + categoryKey(); keep PRESET_CATEGORIES (legacy map) + UNKNOWN_CATEGORY (fallback)
src/lib/storage/index.ts                    # DB v2 + categories store + seed migration; getAllCategories/putCategory/deleteCategory; seedCategoriesFromEvents()
src/lib/storage/tests.ts                    # categories CRUD + migration tests
src/context/CalendarContext/index.tsx       # load categories, store-backed resolver, CRUD, usedCategories, usageCount; (later) per-category filter
src/components/ui/command.tsx               # shadcn (generated)
src/components/CategoryCombobox/{index.tsx,tests.tsx}   # NEW creatable combobox + color picker
src/components/ManageCategoriesDialog/{index.tsx,tests.tsx} # NEW manage dialog
src/components/EventDialog/index.tsx        # use CategoryCombobox; + onCreateCategory prop
src/components/CalendarToolbar/index.tsx    # per-category filter + Manage button
src/app/page.tsx                            # wire categories/CRUD/filter/manage dialog
```

---

## Task 1: Category guard + key helper

**Files:** Modify `src/types/index.ts`; Test `src/types/tests.ts`.

- [ ] **Step 1: Write the failing test** — append inside `src/types/tests.ts`:
```ts
import { isCategory, categoryKey } from "./index";

describe("category helpers", () => {
  it("validates a Category shape", () => {
    expect(isCategory({ id: "work", name: "Work", color: "cyan" })).toBe(true);
    expect(isCategory({ id: "x", name: "X", color: "beige" })).toBe(false);
    expect(isCategory({ id: "x", name: 5, color: "cyan" })).toBe(false);
    expect(isCategory(null)).toBe(false);
  });

  it("derives a normalized, case-insensitive key from a name", () => {
    expect(categoryKey("  Groceries ")).toBe("groceries");
    expect(categoryKey("GROCERIES")).toBe("groceries");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/types/tests.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** in `src/types/index.ts` (add after `isCategoryColor`):
```ts
export const isCategory = (value: unknown): value is Category =>
  isPlainObject(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isCategoryColor(value.color);

export const categoryKey = (name: string): string => name.trim().toLowerCase();
```

- [ ] **Step 4: Run to verify pass** — `pnpm exec vitest run src/types/tests.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/types
git commit -m "feat: isCategory guard and categoryKey helper"
```

---

## Task 2: Categories store + CRUD + v2 migration

**Files:** Modify `src/lib/storage/index.ts`; Test `src/lib/storage/tests.ts`.

- [ ] **Step 1: Write the failing tests** — append inside `describe("storage repository", ...)` in `src/lib/storage/tests.ts`:
```ts
import type { Category } from "@/types";
import { getAllCategories, putCategory, deleteCategory, seedCategoriesFromEvents } from "./index";

describe("categories store", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("starts empty and round-trips categories", async () => {
    expect(await getAllCategories()).toEqual([]);
    await putCategory({ id: "groceries", name: "Groceries", color: "green" });
    await putCategory({ id: "rent", name: "Rent", color: "magenta" });
    const all = await getAllCategories();
    expect(all.map((c) => c.id).sort()).toEqual(["groceries", "rent"]);
  });

  it("deletes a category", async () => {
    await putCategory({ id: "groceries", name: "Groceries", color: "green" });
    await deleteCategory("groceries");
    expect(await getAllCategories()).toEqual([]);
  });

  it("derives seed categories from legacy event categoryIds", () => {
    const events = [
      { categoryId: "finance" }, { categoryId: "finance" }, { categoryId: "mystery" },
    ] as unknown as CalendarEvent[];
    const seeded = seedCategoriesFromEvents(events);
    expect(seeded).toContainEqual({ id: "finance", name: "Finance", color: "yellow" });
    expect(seeded).toContainEqual({ id: "mystery", name: "mystery", color: "cyan" });
    expect(seeded.filter((c) => c.id === "finance")).toHaveLength(1); // deduped
  });

  it("seeds the categories store from existing events on the v2 upgrade", async () => {
    // build a v1 DB (events store only) with one legacy event, then open via our v2 code
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("cyber-calendar", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("events", { keyPath: "id" });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("events", "readwrite");
        tx.objectStore("events").put({
          id: "e1", title: "Old", date: "2026-05-01", categoryId: "finance",
          amount: 0, direction: "deposit", recurrence: null, overrides: [], createdAt: "", updatedAt: "",
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const cats = await getAllCategories();
    expect(cats).toContainEqual({ id: "finance", name: "Finance", color: "yellow" });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/lib/storage/tests.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** in `src/lib/storage/index.ts`.

Add imports/usage of `Category`, `isCategory`, `PRESET_CATEGORIES`:
```ts
import type { CalendarEvent, Category } from "@/types";
import { isCalendarEvent, isCategory, PRESET_CATEGORIES } from "@/types";
```
Add the store name + version bump:
```ts
const DB_VERSION = 2;
const CATEGORY_STORE = "categories";
```
Add the legacy map + seed helper (pure, exported for tests):
```ts
const LEGACY_CATEGORY_BY_ID = new Map(PRESET_CATEGORIES.map((c) => [c.id, c]));

/** Build the category records implied by the categoryIds already on events. */
export const seedCategoriesFromEvents = (events: CalendarEvent[]): Category[] => {
  const byId = new Map<string, Category>();
  for (const event of events) {
    if (byId.has(event.categoryId)) continue;
    const legacy = LEGACY_CATEGORY_BY_ID.get(event.categoryId);
    byId.set(
      event.categoryId,
      legacy ?? { id: event.categoryId, name: event.categoryId, color: "cyan" },
    );
  }
  return [...byId.values()];
};
```
Update the `openDB` `upgrade` callback to create the categories store and seed it from existing events:
```ts
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CATEGORY_STORE)) {
          const categories = db.createObjectStore(CATEGORY_STORE, { keyPath: "id" });
          // seed from any events that already exist (legacy upgrade)
          tx.objectStore(STORE)
            .getAll()
            .then((rows) => {
              for (const cat of seedCategoriesFromEvents(rows.filter(isCalendarEvent))) {
                categories.put(cat);
              }
            });
        }
      },
      blocked() {},
    }).catch((cause) => {
      dbPromise = null;
      throw new StorageError("UNAVAILABLE", cause);
    });
```
Add the category CRUD functions (mirror the event ones):
```ts
export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const db = await getDb();
    const rows = await db.getAll(CATEGORY_STORE);
    return rows.filter(isCategory);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("READ_FAILED", error);
  }
};

export const putCategory = async (category: Category): Promise<void> => {
  try {
    const db = await getDb();
    await db.put(CATEGORY_STORE, category);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("WRITE_FAILED", error);
  }
};

export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const db = await getDb();
    await db.delete(CATEGORY_STORE, id);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("WRITE_FAILED", error);
  }
};
```

- [ ] **Step 4: Run to verify pass** — `pnpm exec vitest run src/lib/storage/tests.ts` → all pass. Then full `pnpm test`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/storage
git commit -m "feat: persisted categories store + v2 migration seeding from events"
```

---

## Task 3: CalendarContext — categories, store-backed resolver, CRUD

This adds category state + CRUD and switches the resolver to the store **without** changing the filter yet (the existing color filter keeps working — Task 7 swaps it). Additive → stays green.

**Files:** Modify `src/context/CalendarContext/index.tsx`, `src/components/EventDialog/index.tsx` (one-line guard); Test `src/context/CalendarContext/tests.tsx`.

- [ ] **Step 1: Write the failing test** — append inside `describe("CalendarContext", ...)`:
```tsx
  it("manages categories: create (dedupe by key), update propagates, delete -> Uncategorized", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.createCategory("Groceries", "green");
      await result.current.createCategory("groceries", "magenta"); // same key -> no dup
    });
    expect(result.current.categories.filter((c) => c.id === "groceries")).toHaveLength(1);

    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Food", date: "2026-05-08", categoryId: created!.id, notes: undefined,
        amount: 20, direction: "withdrawal", recurrence: null,
      });
    });
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name).toBe("Groceries"),
    );

    await act(async () => {
      await result.current.updateCategory("groceries", { name: "Food & Drink" });
    });
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name).toBe("Food & Drink"),
    );

    await act(async () => {
      await result.current.deleteCategory("groceries");
    });
    await waitFor(() =>
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.category.name).toBe("Uncategorized"),
    );
    expect(result.current.categoryUsageCount["groceries"]).toBe(1);
  });
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/context/CalendarContext/tests.tsx` → FAIL.

- [ ] **Step 3: Implement** in `src/context/CalendarContext/index.tsx`.

Update imports — replace the `PRESET_CATEGORIES` value import with the storage category functions and keep `UNKNOWN_CATEGORY`/`makeCategoryResolver`:
```ts
import type { CalendarEvent, Category, CategoryColor, Occurrence } from "@/types";
import { categoryKey } from "@/types";
import {
  deleteEvent as dbDelete, getAllEvents, isStorageError, putEvent,
  getAllCategories, putCategory, deleteCategory as dbDeleteCategory,
} from "@/lib/storage";
```
Remove the module-level `const getCategory = makeCategoryResolver(PRESET_CATEGORIES);`. Add category state + a resolver memo inside the provider:
```ts
  const [categories, setCategories] = useState<Category[]>([]);
  // ... existing events/loaded/storageAvailable state ...
  const getCategory = useMemo(() => makeCategoryResolver(categories), [categories]);
```
(`makeCategoryResolver` already returns `UNKNOWN_CATEGORY` for a missing id — that is the Uncategorized fallback.) Import `makeCategoryResolver` from `@/lib/recurrence` (already imported there).

Load categories alongside events in the mount effect:
```ts
    Promise.all([getAllEvents(), getAllCategories()])
      .then(([loadedEvents, loadedCategories]) => {
        if (!active) return;
        setEvents(loadedEvents);
        setCategories(loadedCategories);
        setLoaded(true);
      })
      .catch((error) => {
        if (!active) return;
        if (isStorageError(error) && error.code === "UNAVAILABLE") setStorageAvailable(false);
        setLoaded(true);
      });
```
Make the `occurrencesByDate` and `balancesByDate` memos depend on `getCategory` (replace the stale module const) — add `getCategory` to their dep arrays and use the memoized resolver.

Add derived values + CRUD actions:
```ts
  const usedCategories = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const e of events) seen.set(e.categoryId, getCategory(e.categoryId));
    return [...seen.values()];
  }, [events, getCategory]);

  const categoryUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.categoryId] = (counts[e.categoryId] ?? 0) + 1;
    return counts;
  }, [events]);

  const createCategory = useCallback(async (name: string, color: CategoryColor): Promise<Category> => {
    const id = categoryKey(name);
    const existing = categories.find((c) => c.id === id);
    if (existing) return existing;
    const category: Category = { id, name: name.trim(), color };
    setCategories((prev) => [...prev, category]);
    await persist(() => putCategory(category));
    return category;
  }, [categories, persist]);

  const updateCategory = useCallback(async (id: string, patch: { name?: string; color?: CategoryColor }) => {
    const current = categories.find((c) => c.id === id);
    if (!current) return;
    const next: Category = { ...current, ...patch, name: patch.name?.trim() ?? current.name };
    setCategories((prev) => prev.map((c) => (c.id === id ? next : c)));
    await persist(() => putCategory(next));
  }, [categories, persist]);

  const deleteCategory = useCallback(async (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    await persist(() => dbDeleteCategory(id));
  }, [persist]);
```
Add `categories`, `usedCategories`, `categoryUsageCount`, `createCategory`, `updateCategory`, `deleteCategory` to the `CalendarContextValue` type and the returned `value`. (Keep `categories` updated from state; the old `categories: PRESET_CATEGORIES` line in `value`, if present, becomes `categories`.)

- [ ] **Step 4: Defensive guard in `src/components/EventDialog/index.tsx`** — in `buildDefaults`, change the create branch's `categoryId: categories[0].id` to:
```ts
      categoryId: categories[0]?.id ?? "",
```
(so an empty category list doesn't crash; a category is still required by zod).

- [ ] **Step 5: Run tests** — `pnpm exec vitest run src/context/CalendarContext/tests.tsx` → pass. Full `pnpm test`; `pnpm check`.

- [ ] **Step 6: Commit**
```bash
git add src/context src/components/EventDialog/index.tsx
git commit -m "feat: store-backed categories + CRUD in CalendarContext"
```

---

## Task 4: Add the shadcn `command` primitive

**Files:** Create `src/components/ui/command.tsx`.

- [ ] **Step 1: Add it** — `pnpm dlx shadcn@latest add command` (installs `cmdk` + `command.tsx`).
- [ ] **Step 2: Verify** — `pnpm exec tsc --noEmit` passes; `src/components/ui/command.tsx` exists (`Command`, `CommandInput`, `CommandList`, `CommandItem`, `CommandGroup`, `CommandEmpty`). Run `pnpm check` (run `pnpm format` if needed).
- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "feat: add shadcn command primitive"
```

---

## Task 5: CategoryCombobox component

**Files:** Create `src/components/CategoryCombobox/index.tsx`, `src/components/CategoryCombobox/tests.tsx`.

- [ ] **Step 1: Write the failing test** — `src/components/CategoryCombobox/tests.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import CategoryCombobox from "./index";

const cats: Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "rent", name: "Rent", color: "magenta" },
];

describe("CategoryCombobox", () => {
  it("selects an existing category", async () => {
    const onChange = vi.fn();
    render(<CategoryCombobox categories={cats} value="" onChange={onChange} onCreateCategory={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.click(await screen.findByText("Rent"));
    expect(onChange).toHaveBeenCalledWith("rent");
  });

  it("offers to create a new category when the typed name has no match", async () => {
    const onCreate = vi.fn(async (name: string, color: string) => ({ id: name.toLowerCase(), name, color }));
    const onChange = vi.fn();
    render(<CategoryCombobox categories={cats} value="" onChange={onChange} onCreateCategory={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), "Groceries");
    await userEvent.click(await screen.findByText(/create "Groceries"/i));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Groceries", expect.any(String)));
    expect(onChange).toHaveBeenCalledWith("groceries");
  });

  it("does not offer create when the name matches an existing category (case-insensitive)", async () => {
    render(<CategoryCombobox categories={cats} value="" onChange={vi.fn()} onCreateCategory={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.type(screen.getByPlaceholderText(/search or create/i), "work");
    expect(screen.queryByText(/create "work"/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/components/CategoryCombobox/tests.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/components/CategoryCombobox/index.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { Category, CategoryColor } from "@/types";
import { NEON_HEX, categoryKey } from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const PALETTE: CategoryColor[] = ["cyan", "magenta", "yellow", "green", "orange"];

type CategoryComboboxProps = {
  categories: Category[];
  value: string; // selected categoryId, "" if none
  onChange: (categoryId: string) => void;
  onCreateCategory: (name: string, color: CategoryColor) => Promise<Category> | Category;
};

const Dot = ({ color }: { color: CategoryColor }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    style={{ background: NEON_HEX[color], boxShadow: `0 0 6px ${NEON_HEX[color]}` }}
  />
);

const CategoryCombobox = ({ categories, value, onChange, onCreateCategory }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newColor, setNewColor] = useState<CategoryColor>("cyan");

  const selected = categories.find((c) => c.id === value);
  const q = query.trim();
  const filtered = categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const hasExact = categories.some((c) => c.id === categoryKey(q));
  const showCreate = q.length > 0 && !hasExact;

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const create = async () => {
    const category = await onCreateCategory(q, newColor);
    choose(category.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Category"
          className="cy-btn flex items-center gap-2 px-3 py-2 text-sm"
        >
          {selected ? (
            <>
              <Dot color={selected.color} />
              {selected.name}
            </>
          ) : (
            <span className="text-[color:var(--cy-muted)]">Select category…</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="cy-dialog w-64 border-0 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search or create…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => choose(c.id)}>
                  <Dot color={c.color} /> {c.name}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem value={`__create__${q}`} onSelect={create}>
                  <Dot color={newColor} /> Create &quot;{q}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          {showCreate && (
            <div className="flex items-center gap-2 border-t border-[color:var(--cy-line)] p-2">
              <span className="cy-mono text-[10px] uppercase text-[color:var(--cy-muted)]">Color</span>
              {PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setNewColor(color)}
                  className="rounded-full p-0.5"
                  style={{ outline: newColor === color ? `2px solid ${NEON_HEX[color]}` : "none" }}
                >
                  <Dot color={color} />
                </button>
              ))}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
```

- [ ] **Step 4: Run to verify pass** — `pnpm exec vitest run src/components/CategoryCombobox/tests.tsx` → 3 pass. If the Radix Popover open-on-click is flaky in jsdom, ensure `@testing-library/user-event` `setup()` isn't required (default `userEvent.click` works); do NOT weaken assertions — the flow is re-verified in a real browser in Task 9. Run full `pnpm test`; `pnpm check`.

- [ ] **Step 5: Commit**
```bash
git add src/components/CategoryCombobox
git commit -m "feat: creatable category combobox with color picker"
```

---

## Task 6: Use CategoryCombobox in EventDialog

**Files:** Modify `src/components/EventDialog/index.tsx`, `src/app/page.tsx`; Test `src/components/EventDialog/tests.tsx`.

- [ ] **Step 1: Update EventDialog** — `src/components/EventDialog/index.tsx`:
  - Add prop `onCreateCategory: (name: string, color: CategoryColor) => Promise<Category> | Category;` to `EventDialogProps` (import `Category`, `CategoryColor` from `@/types`).
  - Import `CategoryCombobox from "@/components/CategoryCombobox"`.
  - Replace the Category `<select>` block with the combobox, wired to RHF via `watch`/`setValue`:
```tsx
          <div className="flex flex-col gap-1">
            <Label htmlFor="categoryId">Category</Label>
            <CategoryCombobox
              categories={categories}
              value={watch("categoryId")}
              onChange={(id) => setValue("categoryId", id, { shouldValidate: true })}
              onCreateCategory={onCreateCategory}
            />
            {errors.categoryId && (
              <p className="text-xs text-[color:var(--cy-magenta)]">{errors.categoryId.message}</p>
            )}
          </div>
```
  (Keep the zod `categoryId: z.string().min(1, "Pick a category")` — already present.)

- [ ] **Step 2: Wire the page** — in `src/app/page.tsx`, pass `onCreateCategory={cal.createCategory}` to `<EventDialog ... />` (alongside the existing `categories={cal.categories}`).

- [ ] **Step 3: Update EventDialog tests** — `src/components/EventDialog/tests.tsx`:
  - Add `onCreateCategory: vi.fn()` to `baseProps`.
  - The "submits a valid one-off event" test still works because `buildDefaults` defaults `categoryId` to `categories[0]?.id` (baseProps passes a non-empty `categories`, e.g. the existing fixture). Confirm `baseProps.categories` is a non-empty array (e.g. `[{ id: "work", name: "Work", color: "cyan" }]`); if it currently imports `PRESET_CATEGORIES`, leave it.
  - No category-combobox interaction is needed in these tests (covered by Task 5). Just ensure the new required prop is present so it compiles and the default category submits.

- [ ] **Step 4: Run** — `pnpm exec vitest run src/components/EventDialog/tests.tsx` → pass. Full `pnpm test`; `pnpm exec tsc --noEmit`; `pnpm check`.

- [ ] **Step 5: Commit**
```bash
git add src/components/EventDialog src/app/page.tsx
git commit -m "feat: EventDialog uses the category combobox"
```

---

## Task 7: Per-category filter (context + toolbar + page)

Swaps the color filter for a per-category filter. Touches context + toolbar + page together so it stays green.

**Files:** Modify `src/context/CalendarContext/index.tsx`, `src/components/CalendarToolbar/index.tsx`, `src/app/page.tsx`; Test `src/context/CalendarContext/tests.tsx`.

- [ ] **Step 1: Update the context filter test** — in `src/context/CalendarContext/tests.tsx`, REPLACE the existing color-filter test ("hides occurrences whose category color is filtered out") with:
```tsx
  it("hides occurrences whose category is toggled off", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    let id = "";
    await act(async () => {
      const c = await result.current.createCategory("Work", "cyan");
      id = c.id;
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup", date: "2026-05-08", categoryId: id, notes: undefined,
        amount: 0, direction: "deposit", recurrence: null,
      });
    });
    await waitFor(() => expect(result.current.occurrencesByDate["2026-05-08"]).toBeDefined());
    await act(async () => result.current.toggleCategory(id));
    await waitFor(() => expect(result.current.occurrencesByDate["2026-05-08"]).toBeUndefined());
    await act(async () => result.current.toggleCategory(id));
    await waitFor(() => expect(result.current.occurrencesByDate["2026-05-08"]).toBeDefined());
  });
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/context/CalendarContext/tests.tsx` → FAIL (`toggleCategory`/category filter missing).

- [ ] **Step 3: Update the context** — `src/context/CalendarContext/index.tsx`:
  - Replace the `activeColors` state with category-id filtering. Remove `activeColors`/`toggleColor`/`ALL_COLORS`. Add:
```ts
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(() => new Set());
  const toggleCategory = useCallback((id: string) => {
    setHiddenCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const activeCategoryIds = useMemo(
    () => new Set(usedCategories.map((c) => c.id).filter((id) => !hiddenCategoryIds.has(id))),
    [usedCategories, hiddenCategoryIds],
  );
```
  (Tracking *hidden* ids defaults every category to visible without enumerating them.)
  - In the `occurrencesByDate` memo, change the filter from `activeColors.has(o.category.color)` to `!hiddenCategoryIds.has(o.category.id)`; add `hiddenCategoryIds` to its deps.
  - Update `CalendarContextValue` + `value`: remove `activeColors`/`toggleColor`; add `activeCategoryIds: Set<string>` and `toggleCategory`.

- [ ] **Step 4: Update CalendarToolbar** — `src/components/CalendarToolbar/index.tsx`:
  - Replace the props `categories`/`activeColors`/`onToggleColor` filter section with `usedCategories: Category[]`, `activeCategoryIds: Set<string>`, `onToggleCategory: (id: string) => void`, and add `onManageCategories: () => void`.
  - Render a toggle per `usedCategories` entry (color dot via `NEON_HEX[c.color]` + `c.name`, `aria-pressed={activeCategoryIds.has(c.id)}`, dimmed when off, `onClick={() => onToggleCategory(c.id)}`), plus a `◢ CATEGORIES` button (`cy-btn`) calling `onManageCategories`. Keep the `+ New Event` CTA + nav + HUD.

- [ ] **Step 5: Wire the page** — `src/app/page.tsx`: pass `usedCategories={cal.usedCategories}`, `activeCategoryIds={cal.activeCategoryIds}`, `onToggleCategory={cal.toggleCategory}`, and `onManageCategories={() => setManageOpen(true)}` (add `const [manageOpen, setManageOpen] = useState(false);`). Remove the old `categories`/`activeColors`/`onToggleColor` toolbar props.

- [ ] **Step 6: Run** — `pnpm exec vitest run src/context/CalendarContext/tests.tsx` → pass. Full `pnpm test`; `pnpm exec tsc --noEmit`; `pnpm check`.

- [ ] **Step 7: Commit**
```bash
git add src/context src/components/CalendarToolbar src/app/page.tsx
git commit -m "feat: per-category toolbar filter (replaces color filter)"
```

---

## Task 8: Manage Categories dialog

**Files:** Create `src/components/ManageCategoriesDialog/index.tsx`, `src/components/ManageCategoriesDialog/tests.tsx`; Modify `src/app/page.tsx`.

- [ ] **Step 1: Write the failing test** — `src/components/ManageCategoriesDialog/tests.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import ManageCategoriesDialog from "./index";

const cats: Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "rent", name: "Rent", color: "magenta" },
];
const base = {
  open: true, categories: cats, usageCountById: { work: 2, rent: 0 },
  onRename: vi.fn(), onRecolor: vi.fn(), onDelete: vi.fn(), onOpenChange: vi.fn(),
};

describe("ManageCategoriesDialog", () => {
  it("renames a category", async () => {
    const onRename = vi.fn();
    render(<ManageCategoriesDialog {...base} onRename={onRename} />);
    const input = screen.getByDisplayValue("Rent");
    await userEvent.clear(input);
    await userEvent.type(input, "Mortgage");
    await userEvent.tab(); // blur commits
    expect(onRename).toHaveBeenCalledWith("rent", "Mortgage");
  });

  it("recolors a category", async () => {
    const onRecolor = vi.fn();
    render(<ManageCategoriesDialog {...base} onRecolor={onRecolor} />);
    // each category row exposes 5 color swatches labelled by color
    const greenSwatches = screen.getAllByRole("button", { name: "green" });
    await userEvent.click(greenSwatches[0]); // recolor "Work" -> green
    expect(onRecolor).toHaveBeenCalledWith("work", "green");
  });

  it("confirms deletion and reports usage count", async () => {
    const onDelete = vi.fn();
    render(<ManageCategoriesDialog {...base} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]); // delete "Work" (used by 2)
    expect(await screen.findByText(/2 events use/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith("work");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm exec vitest run src/components/ManageCategoriesDialog/tests.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/components/ManageCategoriesDialog/index.tsx`:
```tsx
"use client";

import { useState } from "react";
import type { Category, CategoryColor } from "@/types";
import { NEON_HEX } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PALETTE: CategoryColor[] = ["cyan", "magenta", "yellow", "green", "orange"];

type ManageCategoriesDialogProps = {
  open: boolean;
  categories: Category[];
  usageCountById: Record<string, number>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: CategoryColor) => void;
  onDelete: (id: string) => void;
  onOpenChange: (open: boolean) => void;
};

const ManageCategoriesDialog = ({
  open, categories, usageCountById, onRename, onRecolor, onDelete, onOpenChange,
}: ManageCategoriesDialogProps) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = categories.find((c) => c.id === confirmId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">Manage Categories</DialogTitle>
        </DialogHeader>

        {categories.length === 0 && (
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">No categories yet.</p>
        )}

        <div className="flex flex-col gap-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input
                defaultValue={c.name}
                aria-label={`Name for ${c.name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== c.name) onRename(c.id, v);
                }}
              />
              <div className="flex items-center gap-1">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => onRecolor(c.id, color)}
                    className="rounded-full p-0.5"
                    style={{ outline: c.color === color ? `2px solid ${NEON_HEX[color]}` : "none" }}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: NEON_HEX[color], boxShadow: `0 0 6px ${NEON_HEX[color]}` }}
                    />
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="text-[color:var(--cy-magenta)]"
                onClick={() => setConfirmId(c.id)}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>

        {confirming && (
          <div className="cy-mono mt-2 flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-2 text-xs">
            <span>
              {usageCountById[confirming.id] ?? 0} events use &quot;{confirming.name}&quot;. They&apos;ll become
              Uncategorized.
            </span>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmId(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="text-[color:var(--cy-magenta)]"
                onClick={() => {
                  onDelete(confirming.id);
                  setConfirmId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManageCategoriesDialog;
```

- [ ] **Step 4: Wire the page** — `src/app/page.tsx`: render the dialog and pass context callbacks:
```tsx
      <ManageCategoriesDialog
        open={manageOpen}
        categories={cal.categories}
        usageCountById={cal.categoryUsageCount}
        onRename={(id, name) => void cal.updateCategory(id, { name })}
        onRecolor={(id, color) => void cal.updateCategory(id, { color })}
        onDelete={(id) => void cal.deleteCategory(id)}
        onOpenChange={setManageOpen}
      />
```
(import `ManageCategoriesDialog`; `manageOpen` state was added in Task 7.)

- [ ] **Step 5: Run** — `pnpm exec vitest run src/components/ManageCategoriesDialog/tests.tsx` → pass. Full `pnpm test`; `pnpm exec tsc --noEmit`; `pnpm check`.

- [ ] **Step 6: Commit**
```bash
git add src/components/ManageCategoriesDialog src/app/page.tsx
git commit -m "feat: Manage Categories dialog (rename / recolor / delete)"
```

---

## Task 9: Final verification + browser smoke + docs

**Files:** Modify `docs/TRD.md`.

- [ ] **Step 1: Full gates** — `pnpm test` (all pass), `pnpm check` (exit 0; the pre-existing EventDialog `watch()` warning is acceptable), `pnpm build` (succeeds). Fix anything red.

- [ ] **Step 2: Browser smoke test (real Chrome — jsdom can't verify the combobox/popover layout).** `rm -rf .next && pnpm dev`, open `http://localhost:3000`:
  - Open **+ New Event** → the Category field is a combobox; type a new name (e.g. "Groceries"), pick a color, **Create** → the event saves with a colored chip.
  - Add another event reusing the existing "Groceries" from the list.
  - Open **Categories** (toolbar) → rename "Groceries" → the chips update; recolor it → chips update; **Delete** it (confirm shows the usage count) → those events render **Uncategorized**.
  - Toggle a category in the toolbar filter → its events hide/show.
  - Screenshot to confirm rendering (not just the a11y tree).

- [ ] **Step 3: Update `docs/TRD.md`** — in §4.3 Categories, replace the "fixed preset list" wording with: categories are **user-managed and persisted** (no presets; the store starts empty), created via a combobox in the editor and edited/recolored/deleted in a Manage Categories dialog; deleting an in-use category leaves its events **Uncategorized**; the toolbar filter is **per category**. Note colors stay the 5 neon palette. Keep it concise; don't reformat the file.

- [ ] **Step 4: Commit**
```bash
git add docs/TRD.md
git commit -m "docs: document user-managed categories in TRD"
```

---

## Self-Review (author)

- **Spec coverage:** persisted store + v2 migration (T2) · store-backed resolver + Uncategorized fallback + CRUD + usedCategories/usageCount (T3) · combobox create/select/dedupe + color pick (T4–T6) · per-category filter (T7) · Manage dialog rename/recolor/delete-confirm (T8) · `isCategory`/`categoryKey` (T1) · docs (T9). Every spec section maps to a task.
- **Type consistency:** `Category {id,name,color}`, `categoryKey(name)`, `createCategory(name,color)→Category`, `updateCategory(id,{name?,color?})`, `deleteCategory(id)`, `usedCategories`, `categoryUsageCount`, `activeCategoryIds`/`toggleCategory` are used identically across context, combobox, manage dialog, toolbar, page, and tests. Events keep `categoryId`; `Occurrence.category` stays `Category`; `getCategory` param unchanged on `expandEvent`/`expandEvents`/`computeRunningBalances`.
- **Green-ness:** T2/T3 are additive (old color filter still works); T6 restores create-ability before T7 removes the color filter; T7 swaps filter state + toolbar + page atomically.
- **Implementer notes:** (1) `makeCategoryResolver`/`UNKNOWN_CATEGORY` are reused as-is (UNKNOWN_CATEGORY is the Uncategorized fallback; id `"unknown"`). (2) `PRESET_CATEGORIES` is retained only as the legacy migration map + test fixture — not seeded into a fresh store. (3) cmdk + Radix Popover interactions can be finicky in jsdom; if a CategoryCombobox test can't open the popover via click, do not weaken assertions — the flow is re-verified in the real browser at Task 9. (4) Category creation persists immediately (first-class); unwanted ones are removed via Manage.
