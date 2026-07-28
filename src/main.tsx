import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics, type BeforeSend } from "@vercel/analytics/react";
import { isTrackingOptedOut } from "privacy-signals";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/chakra-petch/latin-400.css";
import "@fontsource/chakra-petch/latin-500.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@fontsource/share-tech-mono/latin-400.css";
import "./globals.css";
import App from "./App";
import { registerSW } from "virtual:pwa-register";

// Fire-and-forget: with autoUpdate, an updated worker activates immediately
// and the register client reloads the page to apply it. registerSW no-ops
// where service workers are unsupported; failure just means the app runs
// without offline support, as before.
registerSW();

const container = document.getElementById("root");
if (!container) {
  // Unrecoverable bootstrap failure — no caller to handle a typed error.
  throw new Error("#root element missing from index.html");
}

// Drop analytics events when the browser signals a tracking opt-out (DNT or
// GPC). Checked per event so a mid-session signal change is respected, and
// only an explicit `false` (signals readable, no opt-out) lets an event
// through — an unreadable signal is treated as an opt-out.
const beforeSend: BeforeSend = (event) =>
  isTrackingOptedOut() === false ? event : null;

createRoot(container).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={beforeSend} />
  </StrictMode>,
);
