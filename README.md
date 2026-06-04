# tuxbank

A single-user, full-page month calendar for tracking money in and out — wrapped in a cyberpunk-inspired interface. Every event is an all-day, date-based entry with an amount and a deposit/withdrawal direction, and the calendar keeps a running balance as the month plays out. Everything runs in your browser: no backend, no accounts, no network.

## Features

- **Full-viewport month grid** — the calendar is the whole app, with month/year navigation.
- **Deposits & withdrawals** — each event carries an amount and a direction; a running balance is computed across the calendar.
- **Recurring events** — repeat events and edit or delete them at three scopes: this occurrence, this and following, or the whole series.
- **Categories** — organize events with color-coded categories.
- **Backup & restore** — export the whole database to JSON and import it back, from the in-app Data dialog.

## Getting started

```bash
pnpm install
pnpm dev   # → http://localhost:5173
```

Other commands:

```bash
pnpm build       # Production build (vite build → dist/)
pnpm start       # Serve the production build (vite preview)
pnpm test        # Run tests once (vitest run)
pnpm test:watch  # Run tests in watch mode
pnpm check       # Verify formatting + lint + typecheck
pnpm format      # Auto-fix formatting (prettier --write)
```

## Your data

All data lives in your browser's IndexedDB, on your device. Nothing is sent anywhere — there's no sign-in, no sync, and no server.

That also means the browser holds the only copy: clearing site data wipes the calendar. Use the in-app **Data** dialog to export a JSON backup periodically, and import it to restore or move to another browser.

## License

[MIT](LICENSE)
