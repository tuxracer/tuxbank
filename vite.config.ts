import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";

const resolveCommitSha = (): string => {
  // Vercel injects this at build time; prefer it so the SHA matches the deployed commit.
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"]).toString().trim();
  } catch {
    return "unknown";
  }
};

const commitShaMeta = (): Plugin => {
  const sha = resolveCommitSha();
  return {
    name: "commit-sha-meta",
    transformIndexHtml: (html) =>
      html.replace(
        "</head>",
        `  <meta name="version" content="${sha}" />\n  </head>`,
      ),
  };
};

const PRECACHE_MAX_FILE_SIZE = 5_000_000; // headroom so the single no-split bundle (libsodium + supabase) stays precacheable as it grows past workbox's 2 MiB default
const NAVIGATION_CACHE = "tuxbank-navigation";
const NAVIGATION_NETWORK_TIMEOUT_SECONDS = 3; // bound the wait on a connection that is up but not answering before falling back to cache

const pwa = () =>
  VitePWA({
    registerType: "autoUpdate",
    manifest: {
      name: "TuxBank",
      short_name: "TuxBank",
      description:
        "Local-first budget calendar that tracks deposits and withdrawals on a full-page month view, works offline with no account, and offers optional end-to-end encrypted sync across devices.",
      display: "standalone",
      start_url: "/",
      // Suppress the plugin's defaults (#ffffff / #42b883); undefined keys are
      // dropped from the serialized manifest.
      background_color: undefined,
      theme_color: undefined,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      maximumFileSizeToCacheInBytes: PRECACHE_MAX_FILE_SIZE,
      // Two workbox defaults answer a navigation from the precache before
      // anything in `runtimeCaching` is consulted, which is what kept online
      // visitors on the previous deploy's `index.html` (and its hashed bundle)
      // until they hard-reloaded. `navigateFallback` generates a cache-first
      // NavigationRoute, and `directoryIndex` makes the precache route itself
      // answer "/" with the precached "index.html". Both are cleared here so
      // navigations reach the network-first route below; the precached copy is
      // still reachable, as that route's explicit offline fallback.
      navigateFallback: undefined,
      directoryIndex: null,
      runtimeCaching: [
        {
          // Navigations go to the network first, so an online visitor always
          // lands on the newest `index.html`. Cache and precache are fallbacks
          // for an offline or unresponsive network, not the default response.
          urlPattern: ({ request }) => request.mode === "navigate",
          handler: "NetworkFirst",
          options: {
            cacheName: NAVIGATION_CACHE,
            networkTimeoutSeconds: NAVIGATION_NETWORK_TIMEOUT_SECONDS,
            // Last resort: the precached shell, which is always consistent
            // with the precached assets the same worker installed.
            precacheFallback: { fallbackURL: "index.html" },
          },
        },
      ],
    },
  });

export default defineConfig({
  plugins: [react(), tailwindcss(), commitShaMeta(), pwa()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/tests.[jt]s?(x)"],
  },
});
