# Design — Custom Categories (managed, persisted)

**Status:** Approved for planning · **Date:** 2026-05-30 · **Feature:** persisted, user-managed categories with a creatable combobox and a manage dialog

Replaces the hardcoded preset categories with a **persisted, user-managed category store**. When adding an event, users pick an existing category or create a new one (name + color) via an autocomplete combobox; categories can be renamed, recolored, and deleted in a dedicated Manage Categories dialog. Builds on the [cyberpunk calendar](../../TRD.md) + [account balance](2026-05-30-account-balance-design.md).

---

## 1. Decisions

- **Persisted `categories` store** (IndexedDB) — no hardcoded presets; the store starts empty for a fresh user.
- **Events keep `categoryId`** (reference model). Editing a category propagates to all events that use it.
- **Create** via a shadcn **creatable combobox** in the event editor (pick existing or type a new name + pick a color).
- **Edit / recolor / delete** in a dedicated **Manage Categories** dialog (opened from the toolbar).
- **Delete in use:** allowed after a confirm that warns how many events use it; orphaned events fall back to a neutral **Uncategorized** rendering.
- **Per-category toolbar filter** (replaces the 5 color swatches) — a toggle per category currently in use, plus an **Uncategorized** toggle when orphaned events exist.
- **Colors:** limited to the existing **5 neon palette** colors (`CategoryColor`).
- **Identity:** a category `id` is the **normalized name** (`name.trim().toLowerCase()`), so matching/dedupe is case-insensitive.

---

## 2. Data Model & Store

`Category` is unchanged: `{ id: string; name: string; color: CategoryColor }`. `CalendarEvent.categoryId: string` is unchanged. `Occurrence.category: Category` is unchanged (still resolved).

- **New IndexedDB object store `categories`** (keyed by `id`) in the existing `cyber-calendar` DB. This requires bumping `DB_VERSION` `1 → 2` and adding the store in the `idb` `upgrade` callback.
- **Resolver is now store-backed.** `makeCategoryResolver(categories)` already takes a category array; `CalendarContext` builds it from the **loaded store** instead of `PRESET_CATEGORIES`. A missing id resolves to the **Uncategorized** fallback `{ id: "__uncategorized__", name: "Uncategorized", color: "cyan" }` (repurposes today's `UNKNOWN_CATEGORY`).
- **`PRESET_CATEGORIES` is removed from the UI/runtime** and repurposed as a **legacy migration map** only.
- **Migration (DB v2 upgrade):** within the upgrade transaction, after creating the `categories` store, read all rows from `events`, collect distinct `categoryId`s, and seed a category row for each: legacy ids via the map (`work→{Work, cyan}`, `personal→{Personal, magenta}`, `health→{Health, green}`, `finance→{Finance, yellow}`, `social→{Social, orange}`); any unmapped id → `{ id, name: id, color: "cyan" }`. A fresh DB (no events) seeds nothing.
- `expandEvent` / `expandEvents` / `computeRunningBalances` keep their `getCategory` param **unchanged** — only the resolver's data source changes. Event/occurrence shapes and their fixtures are untouched.

### Category key helper
`categoryKey(name) = name.trim().toLowerCase()` — used as the `id` for user-created categories (legacy ids are already lowercase keys).

---

## 3. Storage layer (`src/lib/storage`)

Add to the repository (alongside the event functions, same DB):
- `getAllCategories(): Promise<Category[]>` — read + `isCategory`-filter the `categories` store.
- `putCategory(category: Category): Promise<void>`
- `deleteCategory(id: string): Promise<void>`
- A new `isCategory` type guard in `@/types`.
- The `upgrade` callback creates the `categories` store at v2 and runs the seed migration described in §2.
- Errors map to the existing typed `StorageError` codes; `resetDbForTests` clears the DB (already does).

---

## 4. CalendarContext API

- Load `categories` on mount (with `loaded`/error handling mirroring events).
- Build the resolver from loaded categories; the existing `occurrencesByDate` / `balancesByDate` memos use it unchanged.
- Expose:
  - `categories: Category[]` — full managed store list (for the combobox + Manage dialog).
  - `usedCategories: Category[]` — distinct resolved categories actually referenced by events, plus the Uncategorized fallback if any event references a missing id (for the toolbar filter).
  - `categoryUsageCount: Record<string, number>` — number of events per `categoryId` (for the delete confirm).
  - `createCategory(name: string, color: CategoryColor): Promise<Category>` — keys by `categoryKey(name)`; if that id already exists, returns the existing one (no duplicate); persists + updates state; returns the category so the editor can set `categoryId`.
  - `updateCategory(id, { name?, color? }): Promise<void>` — persists; propagates to all events via the resolver (events keep the id).
  - `deleteCategory(id): Promise<void>` — removes from the store; events keep the now-missing `categoryId` and resolve to Uncategorized.
- Filter state: replace `activeColors: Set<CategoryColor>` / `toggleColor` with **`activeCategoryIds: Set<string>` / `toggleCategory(id)`** (all on by default). `occurrencesByDate` filters by resolved `category.id`.

---

## 5. UI

**5.1 Category combobox (EventDialog).** Replace the native `<select>` with a creatable combobox (`Command` + `Popover`; add the shadcn `command` primitive). Props-driven: receives `categories` + `onCreateCategory(name, color)`. Behavior: a trigger button showing the selected category's color dot + name; opens a searchable list of categories (color dot + name); typing filters by name; if the typed text has no case-insensitive id match, a **`+ Create "<name>"`** row appears; a **5-neon-swatch color row** sets the new category's color (active when creating; reflects + locks to the chosen category's color when an existing one is selected). Selecting existing sets the form `categoryId`; creating calls `onCreateCategory` then sets `categoryId` to the returned id. A created category **persists immediately** to the store (it's a first-class managed entity) even if the event is then cancelled — an unwanted one can be removed via the Manage dialog. Integrated with react-hook-form via a controlled value (Controller or `setValue`/`watch`). Required.

**5.2 Manage Categories dialog (new `ManageCategoriesDialog`).** Opened from a toolbar button (e.g., a small `◢ CATEGORIES` control). Props-driven: `categories`, `usageCountById`, `onRename(id, name)`, `onRecolor(id, color)`, `onDelete(id)`, `open`, `onOpenChange`. Lists every store category as a row: an inline rename input, a 5-swatch recolor, and a delete button. Delete opens a confirm (shadcn Dialog) noting `N events use "<name>"` (from `usageCountById`); on confirm, calls `onDelete`. Cyberpunk-styled (`cy-dialog`).

**5.3 Per-category filter (CalendarToolbar).** Replace the 5 color swatches with a toggle per `usedCategories` entry (color dot + name, dimmed when off), plus an **Uncategorized** toggle when present. `aria-pressed` per toggle; `toggleCategory(id)` on click. Add the **Categories** button that opens the Manage dialog.

Empty states: fresh user → empty combobox list ("type to create"), no filter toggles.

---

## 6. Validation & errors

- Combobox/create: category name required, non-empty (trimmed); color required (defaults to the first palette color until changed). Duplicate name (same `categoryKey`) reuses the existing category rather than erroring.
- Manage dialog rename: non-empty; renaming to a name whose key collides with another category is rejected inline (avoid id collisions). Recolor always valid.
- Storage errors surface via the existing `StorageError` path; category reads/writes that fail flip the storage banner (best-effort, in-memory continues).

---

## 7. Testing (vitest, behavior-focused)

- **Storage:** `categories` CRUD round-trips (via `fake-indexeddb`); the **v2 migration seeds** category rows from legacy event `categoryId`s (legacy map + unknown-id fallback); a fresh DB seeds none.
- **Context:** `createCategory` (new + dedupe by key), `updateCategory` propagates to events' resolved occurrences, `deleteCategory` → affected occurrences resolve to Uncategorized; `usedCategories` / `categoryUsageCount` correct; `toggleCategory` hides/shows occurrences.
- **Combobox:** lists categories; filters on type; `+ Create` appears only when no case-insensitive match; selecting existing sets the id; creating calls `onCreateCategory` and selects it.
- **Manage dialog:** rename/recolor invoke callbacks; delete shows the usage count and confirms.
- Update fixtures where the resolver source changed (tests that imported `PRESET_CATEGORIES` use a local category fixture or the legacy map).

---

## 8. Out of Scope

Arbitrary hex colors (palette is the 5 neon colors); category icons; merging categories; reordering; per-occurrence category overrides beyond the existing title/category/notes patch; multi-select category assignment.

## 9. Assumptions

- Single user, local device; small number of categories.
- Category identity is its normalized name (case-insensitive); two names differing only by case are the same category.
- Deleting a category never deletes events; orphaned events render Uncategorized until edited.
- Colors remain the 5-color `CategoryColor` palette.
