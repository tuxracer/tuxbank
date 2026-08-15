import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { analyticsBeforeSend } from "@/lib/analytics";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/chakra-petch/latin-400.css";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
// 500 carries the figure in an event chip (.cy-chip-amount); without it the
// weight silently falls back to 400.
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";
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
