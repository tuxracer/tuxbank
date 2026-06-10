import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
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

const container = document.getElementById("root");
if (!container) {
  // Unrecoverable bootstrap failure — no caller to handle a typed error.
  throw new Error("#root element missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
