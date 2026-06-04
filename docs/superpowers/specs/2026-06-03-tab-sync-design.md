# Cross-Tab Sync Design

Date: 2026-06-03
Status: Approved

## Goal

When the user changes data in one tuxbank tab (creating, editing, or deleting events or categories, or importing a backup), every other open tab shows the change without a manual reload.

## Scope

Synced: persisted data only, meaning events and categories, including changes made by a JSON import.

Not synced: per-tab UI state. Each tab keeps its own visible month and its own hidden-category filters.

## Approach

BroadcastChannel signal plus reload from IndexedDB.

After every successful write, the writing tab posts a signal-only message on a `BroadcastChannel`. Receiving tabs re-read events and categories from IndexedDB and update their in-memory state. IndexedDB stays the single source of truth; the message carries no data, so there is no payload schema to version and nothing to drift.

BroadcastChannel does not deliver messages to the tab that posted them, so the writing tab (which already updated its state optimistically) sees no echo and there is no feedback loop.

Alternatives considered and rejected:

- Payload-carrying messages (broadcast the changed record, patch state in memory): avoids a DB re-read but duplicates state-mutation logic on the receive side, needs a versioned message schema, and can drift from DB truth. Imports would still need a full reload.
- localStorage `storage`-event ping: the pre-BroadcastChannel hack. Works, but pollutes localStorage and has quirky event semantics. No reason to prefer it.

## Architecture

### New module: `src/lib/tabSync/`

React-free, standard directory layout.

- `index.ts` exports:
  - `notifyDataChanged(): void` posts a signal-only message on the channel.
  - `subscribeToDataChanges(callback: () => void): () => void` registers a callback and returns an unsubscribe function.
- `consts.ts` holds `SYNC_CHANNEL_NAME` (`"tuxbank-data-sync"`).
- `tests.ts` holds the module tests.

Internals: one lazily created module-level `BroadcastChannel` per tab (the same singleton pattern as `dbPromise` in `src/lib/storage`). The channel stays open for the tab's lifetime. Subscribe and unsubscribe manage a listener set on the shared channel, so React StrictMode's mount, unmount, remount cycle cannot kill it. If `BroadcastChannel` is undefined in the environment, `notifyDataChanged` is a no-op and `subscribeToDataChanges` returns a no-op unsubscribe.

### Storage layer changes (`src/lib/storage`)

`putEvent`, `deleteEvent`, `putCategory`, `deleteCategory`, and `commitImport` call `notifyDataChanged()` after their write succeeds. Failed writes never notify. `commitImport` notifies once, after the transaction commits. Placing the notify in the storage layer means every write path, current and future, broadcasts automatically.

### CalendarContext changes (`src/context/CalendarContext`)

- New `refreshFromStorage()`: re-reads events and categories from storage and updates `events`, `categories`, and `categoriesRef`. It does not touch `hiddenCategoryIds`.
- The existing `reloadData()` (used after import) becomes `refreshFromStorage()` plus the filter reset, so there is one read path.
- An effect subscribes `refreshFromStorage` via `subscribeToDataChanges` and unsubscribes on cleanup.
- A sequence-counter ref guards overlapping refreshes: each refresh increments the counter and only applies its results if it is still the latest. A slow older read that resolves late cannot clobber a newer one.

### Data flow

Tab A saves an event. Tab A updates its state optimistically, the IndexedDB write succeeds, and the storage layer broadcasts. Tab B's subscription fires, Tab B re-reads events and categories from IndexedDB, and Tab B's state updates.

## Edge cases

- Editing an event another tab deleted: the calendar updates immediately and the open dialog keeps its form values. Saving still wins. `updateEvent` currently no-ops when the event id is missing from state; it gains a fallback that creates a fresh event (new id) from the form input when the event no longer exists. The fallback applies regardless of edit scope: with the original series gone, the form input becomes a new standalone event, including any recurrence set in the form. Deleting an already-deleted event stays a harmless no-op.
- Hidden category deleted elsewhere: stale ids in the per-tab `hiddenCategoryIds` set match nothing and are harmless.
- Background tabs: BroadcastChannel delivers to them and they refresh too. Data is small, so no deferral is needed.
- Rapid successive writes: each message triggers a refresh; the sequence counter ensures only the newest read lands. No debounce to start, since the data size does not justify it.
- Mid-edit sync policy (chosen during design): apply remote changes immediately, last save wins. No deferral, no conflict warnings.

## Error handling

A failed refresh mirrors the initial-load behavior: a storage error with code `UNAVAILABLE` flips `storageAvailable` to false; any other failure leaves the current (stale) state in place rather than crashing. Notify failures cannot corrupt anything because messages carry no data; the worst case is a tab that misses one change until the next notification arrives.

## Testing

vitest with fake-indexeddb, behavior-focused per the project standard.

- `src/lib/tabSync/tests.ts`: a subscriber receives a notification posted from a second channel instance; unsubscribing stops callbacks; both functions are safe no-ops when `BroadcastChannel` is absent. Node 18+ provides `BroadcastChannel` globally; if the jsdom environment lacks working delivery, a small in-memory stand-in goes in `src/lib/tabSync/testing.ts`, following the `resetDbForTests` pattern (imported only from test files).
- `src/lib/storage/tests.ts` additions: a successful `putEvent`, `deleteEvent`, and `commitImport` notifies subscribers; a failed write does not.
- Context-level test: write to storage directly and fire a notification from a second channel; the provider re-renders with the new event and hidden-category filters survive the refresh.
- Manual verification: the user checks the final result in a real browser with two tabs (create, edit, delete, import; watch the other tab).

## Documentation

`docs/TRD.md` gets a short tabSync section, since this adds a module and changes the data-flow story.
