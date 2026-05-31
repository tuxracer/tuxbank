// Copies the sqlite-wasm browser runtime into public/sqlite/ so the dedicated
// Web Worker can load it at runtime (see src/lib/storage/connection/worker.ts).
// This keeps the package out of Turbopack's static graph — its Worker1 entry
// uses `new Worker(new URL(<dynamic>, import.meta.url))`, which Turbopack cannot
// bundle. Run automatically before `dev` and `build`.
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const distDir = join(
  dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json")),
  "dist",
);
const outDir = join(process.cwd(), "public", "sqlite");

const FILES = [
  "index.mjs",
  "sqlite3-worker1.mjs",
  "sqlite3-opfs-async-proxy.js",
  "sqlite3.wasm",
];

await mkdir(outDir, { recursive: true });
for (const file of FILES) {
  await cp(join(distDir, file), join(outDir, file));
}
console.log(`Copied ${FILES.length} sqlite-wasm files to public/sqlite/`);
