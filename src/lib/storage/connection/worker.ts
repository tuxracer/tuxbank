import { DB_FILENAME, LOCK_NAME, POOL_DIR, VFS_NAME } from "../consts";
import { StorageError } from "../types";
import type { SyncDb } from "../types";
import { initSyncDb } from "./sqliteDb";
import { exportBytes, validateBytes } from "./dbFile";

// sqlite-wasm is loaded at runtime from public/sqlite/ (copied by
// scripts/copy-sqlite-wasm.mjs) rather than imported statically. Its package
// entry pulls in the Worker1 promiser, whose `new Worker(new URL(<dynamic>,
// import.meta.url))` Turbopack cannot statically bundle. The `turbopackIgnore`
// comment + runtime URL keep it out of the build graph. The type is recovered
// via a type-only `import()` (erased at compile time, so nothing is bundled).
type Sqlite3InitFn = (typeof import("@sqlite.org/sqlite-wasm"))["default"];
type Sqlite3 = Awaited<ReturnType<Sqlite3InitFn>>;
type PoolUtil = Awaited<ReturnType<Sqlite3["installOpfsSAHPoolVfs"]>>;
type SahDb = InstanceType<PoolUtil["OpfsSAHPoolDb"]>;
const SQLITE_WASM_URL = "/sqlite/index.mjs";

// Structural view of the dedicated worker global. TS environment annotation
// only — external message data is still validated by shape before use.
interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  navigator: { locks: LockManager };
}
const ctx = globalThis as unknown as WorkerScope;

let sqlite3: Sqlite3 | null = null;
let poolUtil: PoolUtil | null = null;
let db: SahDb | null = null;
let sync: SyncDb | null = null;

const initSqlite = async (): Promise<Sqlite3 | null> => {
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

/** Replace the live OPFS database with validated bytes, then reopen. */
const commitImport = async (id: number, bytes: Uint8Array): Promise<void> => {
  // Capture into locals: module-level `let`s assigned inside closures aren't
  // narrowed by TS across the awaits/calls below.
  const s3 = sqlite3;
  const pool = poolUtil;
  const current = db;
  if (!s3 || !pool || !current) {
    ctx.postMessage({ id, error: "NOT_READY" });
    return;
  }
  try {
    validateBytes(s3, bytes); // throws IMPORT_INVALID — live file untouched
    sync = null; // appear not-ready while the file is swapped out
    current.close();
    await pool.importDb(DB_FILENAME, bytes);
    const reopened = new pool.OpfsSAHPoolDb(DB_FILENAME);
    db = reopened;
    sync = initSyncDb(reopened);
    ctx.postMessage({ id });
  } catch (error) {
    // Recover a live connection so the app keeps working after a failed swap.
    try {
      const recovered = new pool.OpfsSAHPoolDb(DB_FILENAME);
      db = recovered;
      sync = initSyncDb(recovered);
    } catch (recoveryError) {
      // Couldn't reopen — surface it (otherwise the worker is stuck in a
      // silent NOT_READY state); subsequent ops will report NOT_READY.
      console.error(
        "[worker] reopen after failed import failed:",
        recoveryError,
      );
    }
    ctx.postMessage({
      id,
      error: String(error),
      code: error instanceof StorageError ? error.code : undefined,
    });
  }
};

const boot = async (): Promise<void> => {
  sqlite3 = await initSqlite();
  if (!sqlite3) return;
  const s3 = sqlite3;

  const open = async (): Promise<void> => {
    try {
      const pool = await s3.installOpfsSAHPoolVfs({
        name: VFS_NAME,
        directory: POOL_DIR,
        clearOnInit: false,
        initialCapacity: 6,
      });
      const handle = new pool.OpfsSAHPoolDb(DB_FILENAME);
      poolUtil = pool;
      db = handle;
      sync = initSyncDb(handle);
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
  // Capture into locals so TS narrows them across the branch body (module-level
  // `let`s assigned in closures are otherwise widened back to `| null`).
  const s3 = sqlite3;
  const current = db;
  const syncDb = sync;
  if (!syncDb || !s3 || !poolUtil || !current) {
    ctx.postMessage({ id: message.id, error: "NOT_READY" });
    return;
  }
  try {
    if (message.op === "selectAll") {
      ctx.postMessage({
        id: message.id,
        rows: syncDb.selectAll(message.sql, message.bind),
      });
    } else if (message.op === "run") {
      syncDb.run(message.sql, message.bind);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "tx") {
      syncDb.tx(message.ops);
      ctx.postMessage({ id: message.id });
    } else if (message.op === "export") {
      const bytes = exportBytes(s3, current.pointer);
      ctx.postMessage({ id: message.id, bytes }, [bytes.buffer]);
    } else if (message.op === "import-validate") {
      const preview = validateBytes(s3, message.bytes);
      ctx.postMessage({ id: message.id, preview });
    } else if (message.op === "import-commit") {
      // async — commitImport posts its own reply (success or error) for this id
      void commitImport(message.id, message.bytes);
    }
  } catch (error) {
    ctx.postMessage({
      id: message.id,
      error: String(error),
      code: error instanceof StorageError ? error.code : undefined,
    });
  }
};

void boot();
