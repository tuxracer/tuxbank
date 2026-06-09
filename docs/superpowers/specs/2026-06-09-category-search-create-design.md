# Shared category search-and-create: design

Date: 2026-06-09
Status: Approved, ready for implementation planning

## Goal

Let the user create a new category directly from the Manage Categories dialog,
using the same search-and-create interaction that already exists in the Edit
Event category selector (`CategoryCombobox`). Today the dialog can only rename,
recolor, and delete existing categories; the only way to create one is the
combobox's "Create ..." row while editing an event.

Rather than duplicate that interaction, factor it into one shared implementation
that both surfaces consume. The combobox keeps `cmdk` for its selectable list.

## Behavior

Both surfaces share one interaction:

- A search field filters the existing categories by case-insensitive substring on
  the name as you type.
- When the trimmed query is non-empty and no existing category matches it exactly
  (normalized via `categoryKey`), a `Create "<query>"` affordance appears, with a
  color picker (the five-swatch palette) for the new category's color.
- Choosing the create affordance creates the category with the typed name and the
  selected color, then clears the query and resets the color back to the default.

In the **Manage Categories dialog** specifically:

| Case | Result |
| --- | --- |
| Empty query | All categories shown; no create row. "No categories yet." still shows when there are zero categories. |
| Query matches existing rows | The editable rename/recolor/delete rows filter to the matches. |
| Query matches no category exactly | A `Create "<query>"` row plus color picker appears below the rows. |
| Click the create row | Calls `createCategory(name, color)`, then resets the search field. The new category appears in the now-unfiltered list. |

In the **Edit Event selector** (`CategoryCombobox`) the create affordance creates
the category and immediately selects it (closing the popover), unchanged from
today.

## Design decisions

Settled during brainstorming and fixed for this version:

1. **Match semantics are case-insensitive substring**, identical to the
   combobox's current filter. No fuzzy/subsequence matching, no new dependency.
2. **Sharing is by a hook plus a presentational component, not a single wrapping
   component.** The two surfaces render their rows differently (the selector's
   rows are click-to-select `cmdk` items; the dialog's rows are edit-in-place:
   rename input + recolor swatches + Delete), so a single list component does not
   fit. The shared pieces are the search/eligibility logic (`useCategorySearch`)
   and small presentational components (`CategoryCreateRow`, `CategoryColorPicker`,
   `CategoryDot`).
3. **The combobox keeps `cmdk`** for its selectable list and its arrow-key
   navigation over categories.
4. **The create affordance moves from inside the `cmdk` list to a row just below
   it** in the combobox, so both surfaces render the same `CategoryCreateRow`.
   Selecting existing categories keeps full arrow-key navigation; the create row
   is reached by click, or by pressing Enter when the query matches no existing
   category. This is the one combobox-visible change and is accepted as the trade
   for a single shared create-row.
5. **No new context API.** The dialog reuses the existing
   `createCategory(name, color)`, which already dedupes by normalized name and
   assigns a GUID id. Because the create row is hidden whenever an exact match
   exists, a duplicate cannot be created through this UI, so the dialog needs no
   create-collision error state (the existing rename-collision error is
   unchanged).

## Shared pieces

### `useCategorySearch(categories)` hook

Co-located in the new `CategoryCreateRow` module and re-exported from its
`index`, following the existing precedent of a hook living with its feature module
(`useCalendar` in `src/context/CalendarContext`) rather than a separate
`src/hooks/` tree. It owns the logic currently inline in the combobox:

```ts
const {
  query,        // string
  setQuery,     // (q: string) => void
  filtered,     // Category[] - case-insensitive substring on name
  hasExact,     // categoryKey(name) === categoryKey(query) for some category
  showCreate,   // query.trim() !== "" && !hasExact
  newColor,     // CategoryColor, defaults to the palette's first color (cyan)
  setNewColor,  // (c: CategoryColor) => void
  reset,        // () => void - clears query, resets newColor to default
} = useCategorySearch(categories);
```

### `CategoryCreateRow` component (`src/components/CategoryCreateRow/`)

The `Create "<query>"` clickable line plus a `CategoryColorPicker` (labelled
`Color`) for the new category's color. Callers render it only when `showCreate`
is true.

```ts
type CategoryCreateRowProps = {
  query: string;
  color: CategoryColor;
  onPickColor: (color: CategoryColor) => void;
  onCreate: () => void; // each surface supplies the closure
};
```

`onCreate` is a no-arg closure so each surface decides what "create" means: the
combobox creates then selects the new category; the dialog creates then resets
the field. Both read the current `query` and `newColor` from the hook.

### `CategoryDot` component (`src/components/CategoryDot/`)

The neon category swatch (`background` accent + glow), currently a local `Dot` in
the combobox and an inline `<span>` in the Manage dialog. Used by the combobox's
list items, `CategoryCreateRow`'s create line, and `CategoryColorPicker`.

### `CategoryColorPicker` component (`src/components/CategoryColorPicker/`)

A row of selectable color swatches: each palette color rendered as a
`title=<color>` button wrapping a `CategoryDot`, with the selected color outlined.

```ts
type CategoryColorPickerProps = {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  label?: string; // e.g. "Color"; omitted renders the swatches only
};
```

Used in three places (meeting the extract-at-3 rule): the Manage dialog's per-row
recolor control (`value={c.color}`, `onChange` recolors that category, no label),
and `CategoryCreateRow`'s new-category picker (`value={newColor}`,
`label="Color"`). The combobox gets it transitively through `CategoryCreateRow`.
Consolidating here means the Manage dialog's per-row swatches adopt the shared dot
size, a small visual change from the slightly larger dots today. Each swatch
button keeps its `title=<color>`, so existing tests that locate swatches by title
still work.

### `PALETTE` consolidation

`PALETTE` is currently defined identically in both
`src/components/CategoryCombobox/consts.ts` and
`src/components/ManageCategoriesDialog/consts.ts`. Move it to
`src/utils/categoryColor` (its natural home, alongside `catColorVar`/`catGlowVar`)
as the single source, plus a `DEFAULT_CATEGORY_COLOR` (the first palette entry)
for the hook's default. Delete the two now-empty component `consts.ts` files and
the `export * from "./consts"` lines that re-export them.

## Surface changes

### `CategoryCombobox`

- Replace local `query` / `newColor` state and the `filtered` / `hasExact` /
  `showCreate` derivations with `useCategorySearch`.
- Replace the local `Dot` with `CategoryDot`.
- Replace the inline create-`CommandItem` and its color strip with
  `<CategoryCreateRow>` rendered just below the `CommandList`, guarded by
  `showCreate`.
- `choose()` and popover-close call `reset()`.
- Enter-to-create: when `showCreate` and the query matches no existing category
  (`filtered.length === 0`), pressing Enter in the search input creates. When
  there are matches, Enter keeps `cmdk`'s default of selecting the highlighted
  match.

### `ManageCategoriesDialog`

- Add a search `Input` at the top, driven by `useCategorySearch`
  (placeholder "Search or create...").
- Map `filtered` instead of `categories` for the editable rename/recolor/delete
  rows.
- Replace each row's inline recolor swatches with `<CategoryColorPicker
  value={c.color} onChange={(color) => onRecolor(c.id, color)} />`.
- Render `<CategoryCreateRow>` below the rows when `showCreate`; its `onCreate`
  calls the new `onCreate` prop then `reset()`.
- Add `onCreate: (name: string, color: CategoryColor) => void` to the props.
- On dialog close, call `reset()` alongside the existing `confirmId` /
  `renameError` clears.
- "No categories yet." stays, gated on the total category count (not the filtered
  count).

### `App.tsx`

Wire the new prop to the existing context function:

```tsx
onCreate={(name, color) => void cal.createCategory(name, color)}
```

No `CalendarContext` changes.

## Testing

- **`CategoryCreateRow/tests.tsx`**
  - Hook (`renderHook`): `filtered` is case-insensitive substring; `hasExact` is
    case-insensitive exact via `categoryKey`; `showCreate` is true only for a
    non-empty query with no exact match; `reset` clears the query and restores the
    default color.
  - Component: renders `Create "<query>"`; clicking it calls `onCreate`; clicking
    a swatch calls `onPickColor` with that color; the selected color is outlined.
- **`ManageCategoriesDialog/tests.tsx`** (add)
  - Typing a query filters the rows (e.g. "ren" shows Rent, hides Work).
  - A novel query shows the `Create "<query>"` row; clicking it calls `onCreate`
    with the trimmed name and the selected color.
  - Typing an existing name (case-insensitive) does not show the create row.
  - Existing rename/recolor/delete tests stay green: the per-row recolor swatches
    move to the shared `CategoryColorPicker` but keep their `title=<color>`
    buttons, and at rest `query === ""` so no create strip renders, leaving the
    `getAllByTitle` / `getByDisplayValue` lookups unchanged.
- **`CategoryCombobox/tests.tsx`**
  - The existing select and create-on-the-fly tests still pass against the
    refactor; adjust selectors only if needed.

jsdom has no layout engine, so the popover/dialog positioning and the create-row
placement are verified in a real browser as part of the usual manual check.

## Documentation

Update `docs/TRD.md` where it describes `CategoryCombobox` and
`ManageCategoriesDialog` to mention the shared `useCategorySearch` hook,
`CategoryCreateRow`, `CategoryColorPicker`, and `CategoryDot`, and that categories
can now be created from the Manage Categories dialog.

## Files affected

Create:

- `docs/superpowers/specs/2026-06-09-category-search-create-design.md` (this file)
- `src/components/CategoryCreateRow/index.tsx` (component + `useCategorySearch`)
- `src/components/CategoryCreateRow/types.ts`
- `src/components/CategoryCreateRow/tests.tsx`
- `src/components/CategoryColorPicker/index.tsx`
- `src/components/CategoryColorPicker/types.ts`
- `src/components/CategoryDot/index.tsx`

Modify:

- `src/utils/categoryColor/index.ts` (add `PALETTE`, `DEFAULT_CATEGORY_COLOR`)
- `src/components/CategoryCombobox/index.tsx`
- `src/components/CategoryCombobox/tests.tsx`
- `src/components/ManageCategoriesDialog/index.tsx`
- `src/components/ManageCategoriesDialog/types.ts`
- `src/components/ManageCategoriesDialog/tests.tsx`
- `src/App.tsx`
- `docs/TRD.md`

Delete:

- `src/components/CategoryCombobox/consts.ts`
- `src/components/ManageCategoriesDialog/consts.ts`
