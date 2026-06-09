# Shared Category Search-and-Create Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user create a category from the Manage Categories dialog using the same search-and-create interaction as the Edit Event selector, by factoring that interaction into shared pieces both surfaces use.

**Architecture:** Extract a `useCategorySearch` hook (query + substring filter + create-eligibility + new-color state) and three small presentational components (`CategoryDot`, `CategoryColorPicker`, `CategoryCreateRow`). Refactor `CategoryCombobox` to consume them (keeping `cmdk` for its list), and extend `ManageCategoriesDialog` with a search field, filtered rows, a per-row `CategoryColorPicker`, and a `CategoryCreateRow`. The dialog reuses the existing `createCategory` context function; no context/storage changes.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind v4, shadcn/ui (Radix + cmdk), vitest + @testing-library/react.

---

## File Structure

**Create:**
- `src/components/CategoryDot/index.tsx` — the neon category swatch (one responsibility: render a colored dot).
- `src/components/CategoryColorPicker/index.tsx` + `types.ts` — a row of selectable color swatches with an optional label.
- `src/components/CategoryCreateRow/index.tsx` + `types.ts` + `tests.tsx` — the `useCategorySearch` hook and the `Create "<query>"` row (create line + color picker).

**Modify:**
- `src/utils/categoryColor/index.ts` — add the shared `PALETTE` and `DEFAULT_CATEGORY_COLOR`.
- `src/components/CategoryCombobox/index.tsx` — consume the shared pieces.
- `src/components/ManageCategoriesDialog/index.tsx` + `types.ts` + `tests.tsx` — search + filter + create + shared color picker.
- `src/App.tsx` — wire the dialog's `onCreate` to `createCategory`.
- `docs/TRD.md` — document the shared pieces and dialog creation.

**Delete:**
- `src/components/CategoryCombobox/consts.ts` and `src/components/ManageCategoriesDialog/consts.ts` (their only export, `PALETTE`, moves to the util).

---

## Task 1: Shared palette constants

**Files:**
- Modify: `src/utils/categoryColor/index.ts`

- [ ] **Step 1: Add `PALETTE` and `DEFAULT_CATEGORY_COLOR`**

Append to `src/utils/categoryColor/index.ts` (after the existing `catGlowVar`):

```ts
/** Ordered category color palette, shown left to right in color pickers. */
export const PALETTE: CategoryColor[] = [
  "cyan",
  "magenta",
  "yellow",
  "green",
  "orange",
];

/** Default color for a newly created category. */
export const DEFAULT_CATEGORY_COLOR: CategoryColor = PALETTE[0];
```

`CategoryColor` is already imported at the top of this file.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm check`
Expected: PASS (the two component `consts.ts` files still define their own `PALETTE`; that duplication is removed in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/utils/categoryColor/index.ts
git commit -m "feat: add shared category palette constants"
```

---

## Task 2: `CategoryDot` component

**Files:**
- Create: `src/components/CategoryDot/index.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/CategoryDot/index.tsx` (this is the combobox's current local `Dot`, promoted to a shared component):

```tsx
import type { CategoryColor } from "@/types";
import { catColorVar, catGlowVar } from "@/utils/categoryColor";

export const CategoryDot = ({ color }: { color: CategoryColor }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    style={{
      background: catColorVar(color),
      boxShadow: `0 0 6px ${catGlowVar(color)}`,
    }}
  />
);
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/CategoryDot/index.tsx
git commit -m "feat: add shared CategoryDot component"
```

---

## Task 3: `CategoryColorPicker` component

**Files:**
- Create: `src/components/CategoryColorPicker/types.ts`
- Create: `src/components/CategoryColorPicker/index.tsx`

- [ ] **Step 1: Create the props type**

Create `src/components/CategoryColorPicker/types.ts`:

```ts
import type { CategoryColor } from "@/types";

export type CategoryColorPickerProps = {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  label?: string;
};
```

- [ ] **Step 2: Create the component**

Create `src/components/CategoryColorPicker/index.tsx`:

```tsx
import { catColorVar, PALETTE } from "@/utils/categoryColor";
import { CategoryDot } from "@/components/CategoryDot";

import type { CategoryColorPickerProps } from "./types";

export * from "./types";

export const CategoryColorPicker = ({
  value,
  onChange,
  label,
}: CategoryColorPickerProps) => (
  <div className="flex items-center gap-2">
    {label && (
      <span className="cy-mono text-[10px] uppercase text-[color:var(--cy-muted)]">
        {label}
      </span>
    )}
    {PALETTE.map((color) => (
      <button
        key={color}
        type="button"
        title={color}
        onClick={() => onChange(color)}
        className="rounded-full p-0.5"
        style={{
          outline: value === color ? `2px solid ${catColorVar(color)}` : "none",
        }}
      >
        <CategoryDot color={color} />
      </button>
    ))}
  </div>
);
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/CategoryColorPicker
git commit -m "feat: add shared CategoryColorPicker component"
```

---

## Task 4: `useCategorySearch` hook

**Files:**
- Create: `src/components/CategoryCreateRow/types.ts`
- Create: `src/components/CategoryCreateRow/index.tsx`
- Create: `src/components/CategoryCreateRow/tests.tsx`

- [ ] **Step 1: Create the types**

Create `src/components/CategoryCreateRow/types.ts` (includes the component props too; the component itself is added in Task 5):

```ts
import type { Category, CategoryColor } from "@/types";

export type UseCategorySearch = {
  query: string;
  setQuery: (query: string) => void;
  filtered: Category[];
  hasExact: boolean;
  showCreate: boolean;
  newColor: CategoryColor;
  setNewColor: (color: CategoryColor) => void;
  reset: () => void;
};

export type CategoryCreateRowProps = {
  query: string;
  color: CategoryColor;
  onPickColor: (color: CategoryColor) => void;
  onCreate: () => void;
};
```

- [ ] **Step 2: Write the failing hook tests**

Create `src/components/CategoryCreateRow/tests.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Category } from "@/types";
import { useCategorySearch } from "./index";

const cats: Category[] = [
  { id: "work", name: "Work", color: "cyan", updatedAt: new Date().toISOString() },
  { id: "rent", name: "Rent", color: "magenta", updatedAt: new Date().toISOString() },
];

describe("useCategorySearch", () => {
  it("filters categories by case-insensitive substring", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("RE"));
    expect(result.current.filtered.map((c) => c.id)).toEqual(["rent"]);
  });

  it("flags an exact match case-insensitively and hides create", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("work"));
    expect(result.current.hasExact).toBe(true);
    expect(result.current.showCreate).toBe(false);
  });

  it("shows create for a non-empty query with no exact match", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("Food"));
    expect(result.current.showCreate).toBe(true);
  });

  it("does not show create for a whitespace-only query", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("   "));
    expect(result.current.showCreate).toBe(false);
  });

  it("reset clears the query and restores the default color", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    const initialColor = result.current.newColor;
    act(() => {
      result.current.setQuery("Food");
      result.current.setNewColor("orange");
    });
    act(() => result.current.reset());
    expect(result.current.query).toBe("");
    expect(result.current.newColor).toBe(initialColor);
  });
});
```

- [ ] **Step 3: Create the hook (minimal `index.tsx`)**

Create `src/components/CategoryCreateRow/index.tsx` with just the hook for now:

```tsx
import { useCallback, useState } from "react";
import type { Category } from "@/types";
import { categoryKey } from "@/types";
import { DEFAULT_CATEGORY_COLOR } from "@/utils/categoryColor";

import type { UseCategorySearch } from "./types";

export * from "./types";

export const useCategorySearch = (
  categories: readonly Category[],
): UseCategorySearch => {
  const [query, setQuery] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_CATEGORY_COLOR);

  const q = query.trim();
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase()),
  );
  const hasExact = categories.some((c) => categoryKey(c.name) === categoryKey(q));
  const showCreate = q.length > 0 && !hasExact;

  const reset = useCallback(() => {
    setQuery("");
    setNewColor(DEFAULT_CATEGORY_COLOR);
  }, []);

  return {
    query,
    setQuery,
    filtered,
    hasExact,
    showCreate,
    newColor,
    setNewColor,
    reset,
  };
};
```

- [ ] **Step 4: Run the hook tests**

Run: `pnpm test src/components/CategoryCreateRow`
Expected: PASS (all 5 `useCategorySearch` tests).

- [ ] **Step 5: Verify it compiles**

Run: `pnpm check`
Expected: PASS (`CategoryCreateRowProps` is exported but unused until Task 5; that is fine).

- [ ] **Step 6: Commit**

```bash
git add src/components/CategoryCreateRow
git commit -m "feat: add useCategorySearch hook"
```

---

## Task 5: `CategoryCreateRow` component

**Files:**
- Modify: `src/components/CategoryCreateRow/index.tsx`
- Modify: `src/components/CategoryCreateRow/tests.tsx`

- [ ] **Step 1: Add the failing component tests**

Append to `src/components/CategoryCreateRow/tests.tsx`. Also update the existing import line at the top of the file from `import { useCategorySearch } from "./index";` to include the component and add `render`, `screen`, `userEvent`, and `vi`:

Replace the top imports block with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import { CategoryCreateRow, useCategorySearch } from "./index";
```

Then append this describe block at the end of the file:

```tsx
describe("CategoryCreateRow", () => {
  it("renders the create label and fires onCreate when clicked", async () => {
    const onCreate = vi.fn();
    render(
      <CategoryCreateRow
        query="Food"
        color="cyan"
        onPickColor={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.click(screen.getByText(/create "Food"/i));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("fires onPickColor when a swatch is clicked", async () => {
    const onPickColor = vi.fn();
    render(
      <CategoryCreateRow
        query="Food"
        color="cyan"
        onPickColor={onPickColor}
        onCreate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTitle("green"));
    expect(onPickColor).toHaveBeenCalledWith("green");
  });
});
```

- [ ] **Step 2: Run tests to verify the component tests fail**

Run: `pnpm test src/components/CategoryCreateRow`
Expected: FAIL with "CategoryCreateRow is not exported" (or undefined component). The hook tests still pass.

- [ ] **Step 3: Add the component to `index.tsx`**

In `src/components/CategoryCreateRow/index.tsx`, update the imports and append the component. Change the import block at the top to:

```tsx
import { useCallback, useState } from "react";
import type { Category } from "@/types";
import { categoryKey } from "@/types";
import { DEFAULT_CATEGORY_COLOR } from "@/utils/categoryColor";
import { CategoryDot } from "@/components/CategoryDot";
import { CategoryColorPicker } from "@/components/CategoryColorPicker";

import type { CategoryCreateRowProps, UseCategorySearch } from "./types";
```

Then add this component below the `useCategorySearch` export:

```tsx
export const CategoryCreateRow = ({
  query,
  color,
  onPickColor,
  onCreate,
}: CategoryCreateRowProps) => (
  <div className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] p-2">
    <button
      type="button"
      onClick={onCreate}
      className="flex items-center gap-2 text-left text-sm"
    >
      <CategoryDot color={color} /> Create &quot;{query}&quot;
    </button>
    <CategoryColorPicker value={color} onChange={onPickColor} label="Color" />
  </div>
);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/components/CategoryCreateRow`
Expected: PASS (hook tests + both component tests).

- [ ] **Step 5: Verify it compiles**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/CategoryCreateRow
git commit -m "feat: add CategoryCreateRow component"
```

---

## Task 6: Refactor `CategoryCombobox` onto the shared pieces

**Files:**
- Modify: `src/components/CategoryCombobox/index.tsx`
- Delete: `src/components/CategoryCombobox/consts.ts`

The existing combobox tests (`src/components/CategoryCombobox/tests.tsx`) are the safety net for this refactor; do not change them.

- [ ] **Step 1: Replace `index.tsx` with the refactored version**

Overwrite `src/components/CategoryCombobox/index.tsx` with:

```tsx
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CyberFrame } from "@/components/CyberFrame";
import { CyControlFrame } from "@/components/CyControlFrame";
import { CategoryDot } from "@/components/CategoryDot";
import {
  CategoryCreateRow,
  useCategorySearch,
} from "@/components/CategoryCreateRow";

import type { CategoryComboboxProps } from "./types";

export * from "./types";

const CategoryCombobox = ({
  categories,
  value,
  onChange,
  onCreateCategory,
}: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const { query, setQuery, filtered, showCreate, newColor, setNewColor, reset } =
    useCategorySearch(categories);

  const selected = categories.find((c) => c.id === value);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    reset();
  };

  const create = async () => {
    const category = await onCreateCategory(query.trim(), newColor);
    choose(category.id);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <CyControlFrame>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cy-btn flex items-center gap-2 px-3 py-2 text-sm"
          >
            {selected ? (
              <>
                <CategoryDot color={selected.color} />
                {selected.name}
              </>
            ) : (
              <span className="text-[color:var(--cy-muted)]">
                Select category…
              </span>
            )}
          </button>
        </PopoverTrigger>
      </CyControlFrame>
      <PopoverContent className="cy-dialog w-64 border-0 p-0">
        <CyberFrame />
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && showCreate && filtered.length === 0) {
                e.preventDefault();
                void create();
              }
            }}
          />
          <CommandList>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => choose(c.id)}
                >
                  <CategoryDot color={c.color} /> {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {showCreate && (
            <CategoryCreateRow
              query={query.trim()}
              color={newColor}
              onPickColor={setNewColor}
              onCreate={() => void create()}
            />
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
```

- [ ] **Step 2: Delete the now-unused consts file**

Run: `git rm src/components/CategoryCombobox/consts.ts`

(`PALETTE` now comes from `@/utils/categoryColor`; nothing else imports this file — verified by grep.)

- [ ] **Step 3: Run the combobox tests**

Run: `pnpm test src/components/CategoryCombobox`
Expected: PASS (all 3 tests: select existing, offer create, no-create-on-exact-match).

- [ ] **Step 4: Verify the whole project compiles and lints**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/CategoryCombobox
git commit -m "refactor: build CategoryCombobox on shared category search pieces"
```

---

## Task 7: Add search-and-create to `ManageCategoriesDialog`

**Files:**
- Modify: `src/components/ManageCategoriesDialog/types.ts`
- Modify: `src/components/ManageCategoriesDialog/tests.tsx`
- Modify: `src/components/ManageCategoriesDialog/index.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/ManageCategoriesDialog/consts.ts`

- [ ] **Step 1: Add `onCreate` to the props type**

Overwrite `src/components/ManageCategoriesDialog/types.ts`:

```ts
import type { Category, CategoryColor } from "@/types";

export type ManageCategoriesDialogProps = {
  open: boolean;
  categories: readonly Category[];
  usageCountById: Record<string, number>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: CategoryColor) => void;
  onDelete: (id: string) => void;
  onCreate: (name: string, color: CategoryColor) => void;
  onOpenChange: (open: boolean) => void;
};
```

- [ ] **Step 2: Add `onCreate` to the test fixture and write failing tests**

In `src/components/ManageCategoriesDialog/tests.tsx`, add `onCreate: vi.fn(),` to the `base` object (alongside the other `vi.fn()` callbacks). Then append these three tests inside the `describe("ManageCategoriesDialog", ...)` block:

```tsx
it("filters the rows by the search query", async () => {
  render(<ManageCategoriesDialog {...base} />);
  await userEvent.type(
    screen.getByPlaceholderText(/search or create/i),
    "rent",
  );
  expect(screen.getByDisplayValue("Rent")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("Work")).not.toBeInTheDocument();
});

it("creates a new category with the typed name and chosen color", async () => {
  const onCreate = vi.fn();
  render(<ManageCategoriesDialog {...base} onCreate={onCreate} />);
  await userEvent.type(
    screen.getByPlaceholderText(/search or create/i),
    "Food",
  );
  // No existing category matches "Food", so the create row's swatch is the only one.
  await userEvent.click(screen.getByTitle("green"));
  await userEvent.click(screen.getByText(/create "Food"/i));
  expect(onCreate).toHaveBeenCalledWith("Food", "green");
});

it("does not offer create when the name matches an existing category", async () => {
  render(<ManageCategoriesDialog {...base} />);
  await userEvent.type(
    screen.getByPlaceholderText(/search or create/i),
    "work",
  );
  expect(screen.queryByText(/create "work"/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `pnpm test src/components/ManageCategoriesDialog`
Expected: FAIL on the three new tests (no search box / create row yet). The four existing tests still pass.

- [ ] **Step 4: Refactor `index.tsx`**

Overwrite `src/components/ManageCategoriesDialog/index.tsx`:

```tsx
import { useState } from "react";
import { categoryKey } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CyberFrame } from "@/components/CyberFrame";
import { CategoryColorPicker } from "@/components/CategoryColorPicker";
import {
  CategoryCreateRow,
  useCategorySearch,
} from "@/components/CategoryCreateRow";

import type { ManageCategoriesDialogProps } from "./types";

export * from "./types";

const ManageCategoriesDialog = ({
  open,
  categories,
  usageCountById,
  onRename,
  onRecolor,
  onDelete,
  onCreate,
  onOpenChange,
}: ManageCategoriesDialogProps) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirming = categories.find((c) => c.id === confirmId);
  const [renameError, setRenameError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const { query, setQuery, filtered, showCreate, newColor, setNewColor, reset } =
    useCategorySearch(categories);

  const handleCreate = () => {
    onCreate(query.trim(), newColor);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmId(null);
          setRenameError(null);
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="cy-dialog border-0 sm:max-w-md">
        <CyberFrame />
        <DialogHeader>
          <DialogTitle className="cy-display uppercase tracking-wide">
            Manage Categories
          </DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search or create…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {categories.length === 0 && (
          <p className="cy-mono text-xs text-[color:var(--cy-muted)]">
            No categories yet.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) {
                      const collides = categories.some(
                        (o) =>
                          o.id !== c.id &&
                          categoryKey(o.name) === categoryKey(v),
                      );
                      if (collides) {
                        setRenameError({
                          id: c.id,
                          message: `A category named "${v}" already exists.`,
                        });
                        e.target.value = c.name;
                      } else {
                        setRenameError(null);
                        onRename(c.id, v);
                      }
                    }
                  }}
                />
                <CategoryColorPicker
                  value={c.color}
                  onChange={(color) => onRecolor(c.id, color)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[color:var(--cy-magenta)]"
                  onClick={() => setConfirmId(c.id)}
                >
                  Delete
                </Button>
              </div>
              {renameError?.id === c.id && (
                <p className="cy-mono text-xs text-[color:var(--cy-magenta)]">
                  {renameError.message}
                </p>
              )}
            </div>
          ))}
        </div>

        {showCreate && (
          <CategoryCreateRow
            query={query.trim()}
            color={newColor}
            onPickColor={setNewColor}
            onCreate={handleCreate}
          />
        )}

        {confirming && (
          <div className="cy-mono mt-2 flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-2 text-xs">
            <span>
              {usageCountById[confirming.id] ?? 0} events use &quot;
              {confirming.name}&quot;. They&apos;ll become Uncategorized.
            </span>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmId(null)}
              >
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

- [ ] **Step 5: Wire `onCreate` in `App.tsx`**

In `src/App.tsx`, find the `<ManageCategoriesDialog ... />` element (around line 301). Add the `onCreate` prop next to the other handlers:

```tsx
        onDelete={(id) => void cal.deleteCategory(id)}
        onCreate={(name, color) => void cal.createCategory(name, color)}
        onOpenChange={setManageOpen}
```

- [ ] **Step 6: Delete the now-unused consts file**

Run: `git rm src/components/ManageCategoriesDialog/consts.ts`

- [ ] **Step 7: Run the dialog tests**

Run: `pnpm test src/components/ManageCategoriesDialog`
Expected: PASS (four existing tests + three new tests).

- [ ] **Step 8: Verify the whole project compiles, lints, and tests**

Run: `pnpm check && pnpm test`
Expected: PASS (full suite).

- [ ] **Step 9: Commit**

```bash
git add src/components/ManageCategoriesDialog src/App.tsx
git commit -m "feat: create categories from the Manage Categories dialog"
```

---

## Task 8: Update the technical reference

**Files:**
- Modify: `docs/TRD.md`

- [ ] **Step 1: Find the relevant sections**

Run: `grep -n "CategoryCombobox\|ManageCategoriesDialog\|CategoryDot" docs/TRD.md`
Expected: line numbers for the component descriptions.

- [ ] **Step 2: Update the descriptions**

In the `CategoryCombobox` and `ManageCategoriesDialog` descriptions, note that both share the `useCategorySearch` hook and the `CategoryCreateRow`, `CategoryColorPicker`, and `CategoryDot` components, and that categories can now be created from the Manage Categories dialog (typing a new name surfaces a `Create "<name>"` row with a color picker; the search field also filters existing categories). Keep the plain, direct voice required by `CLAUDE.md` (no em dashes, no AI-isms).

- [ ] **Step 3: Verify formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/TRD.md
git commit -m "docs: document shared category search-and-create"
```

---

## Self-Review Notes

- **Spec coverage:** `useCategorySearch` (Task 4), `CategoryCreateRow` (Task 5), `CategoryColorPicker` (Task 3), `CategoryDot` (Task 2), `PALETTE`/`DEFAULT_CATEGORY_COLOR` consolidation (Task 1, with deletions in Tasks 6-7), combobox refactor with create-row-below-list and Enter-to-create (Task 6), dialog search/filter/create/per-row picker + `onCreate` prop + `App.tsx` wiring (Task 7), docs (Task 8). All spec sections map to a task.
- **Type consistency:** `UseCategorySearch` and `CategoryCreateRowProps` are defined once in `CategoryCreateRow/types.ts` and consumed unchanged; `onCreate: (name, color) => void` matches between the dialog props, the tests, and the `App.tsx` wiring to `createCategory(name, color)`.
- **Existing tests stay green:** at rest `query === ""`, so no create row renders; per-row recolor swatches keep `title=<color>`, so `getAllByTitle`/`getByDisplayValue`/`getByRole(button, /delete/i)` lookups in the existing dialog tests are unaffected. The combobox's three tests cover its refactor.
