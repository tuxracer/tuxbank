import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { analyticsBeforeSend } from "@/lib/analytics";
// Woff2-only @font-face declarations over the @fontsource font files; see
// fonts.css for why the packages' own CSS is not imported. JetBrains Mono 500
// carries the figure in an event chip (.cy-chip-amount); without it the
// weight silently falls back to 400.
import "./fonts.css";
import "./globals.css";
import App from "./App";
import { registerSW } from "virtual:pwa-register";

// Fire-and-forget: with autoUpdate, an updated worker activates immediately.
// Freshness is the network's job (navigations are network-first), so the page
// is already running the newest build by the time a new worker takes over;
// `onNeedReload` suppresses the register client's reload, which would only
// throw away what the user was in the middle of. registerSW no-ops where
// service workers are unsupported; failure just means the app runs without
// offline support, as before.
registerSW({ onNeedReload: () => {} });

const container = document.getElementById("root");
if (!container) {
  // Unrecoverable bootstrap failure — no caller to handle a typed error.
  throw new Error("#root element missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={analyticsBeforeSend} />
  </StrictMode>,
);
