import { DB_FILENAME, LOCK_NAME, POOL_DIR, VFS_NAME } from "../consts";
import type { SyncDb } from "../types";
import { initSyncDb } from "./sqliteDb";

// sqlite-wasm is loaded at runtime from public/sqlite/ (copied by
// scripts/copy-sqlite-wasm.mjs) rather than imported statically. Its package
// entry pulls in the Worker1 promiser, whose `new Worker(new URL(<dynamic>,
// import.meta.url))` Turbopack cannot statically bundle. The `turbopackIgnore`
// comment + runtime URL keep it out of the build graph. The type is recovered
// via a type-only `import()` (erased at compile time, so nothing is bundled).
type Sqlite3InitFn = (typeof import("@sqlite.org/sqlite-wasm"))["default"];
const SQLITE_WASM_URL = "/sqlite/index.mjs";

// Structural view of the dedicated worker global. TS environment annotation
// only — external message data is still validated by shape before use.
interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  navigator: { locks: LockManager };
}
const ctx = globalThis as unknown as WorkerScope;

let sync: SyncDb | null = null;

const initSqlite = async () => {
  try {
    const mod = await import(/* turbopackIgnore: true */ SQLITE_WASM_URL);
    const init: Sqlite3InitFn = mod.default;
    return await init();
  } catch (error) {
    ctx.postMessage({
      type: "status",
      status: "unavailable",
      error: String(error),
    });
    return null;
  }
};

const boot = async (): Promise<void> => {
  const sqlite3 = await initSqlite();
  if (!sqlite3) return;

  const open = async (): Promise<void> => {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        name: VFS_NAME,
        directory: POOL_DIR,
        clearOnInit: false,
        initialCapacity: 6,
      });
      const db = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
      sync = initSyncDb(db);
      ctx.postMessage({ type: "status", status: "ready" });
    } catch (error) {
      ctx.postMessage({
        type: "status",
        status: "unavailable",
        error: String(error),
      });
    }
  };

  // Grab the DB lock; if another tab holds it, announce and wait for handoff.
  void ctx.navigator.locks.request(
    LOCK_NAME,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (lock) {
        await open();
        await new Promise<never>(() => {}); // hold the lock for the worker's lifetime
        return;
      }
      ctx.postMessage({ type: "status", status: "waiting-locked" });
      await ctx.navigator.locks.request(
        LOCK_NAME,
        { mode: "exclusive" },
        async () => {
          await open();
          await new Promise<never>(() => {}); // hold
        },
      );
    },
  );
};

ctx.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!sync) {
    ctx.postMessage({ id: message.id, error: "NOT_READY" });
    return;
  }
  try {
    if (message.op === "selectAll") {
      ctx.postMessage({
        id: message.id,
        rows: sync.selectAll(message.sql, message.bind),
      });
    } else if (message.op === "run") {
      sync.run(message.sql, message.bind);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "tx") {
      sync.tx(message.ops);
      ctx.postMessage({ id: message.id });
    }
  } catch (error) {
    ctx.postMessage({ id: message.id, error: String(error) });
  }
};

void boot();
