import { StorageError, isStorageErrorCode } from "../types";
import type {
  ConnectionStatus,
  DbConnection,
  ImportPreview,
  Row,
  SqlValue,
  StorageErrorCode,
} from "../types";

interface WorkerOk {
  rows?: Row[];
  bytes?: Uint8Array<ArrayBuffer>;
  preview?: ImportPreview;
}

type Pending = {
  resolve: (value: WorkerOk) => void;
  reject: (error: StorageError) => void;
  read: boolean;
};

export const createWorkerConnection = (
  emit: (status: ConnectionStatus) => void,
): DbConnection => {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  let nextId = 1;
  const pending = new Map<number, Pending>();

  let resolveReady = (): void => {};
  let rejectReady: (error: StorageError) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  emit("connecting");

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.type === "status") {
      emit(message.status);
      if (message.status === "ready") resolveReady();
      else if (message.status === "unavailable")
        rejectReady(new StorageError("UNAVAILABLE", message.error));
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) {
      const explicit: StorageErrorCode | null = isStorageErrorCode(message.code)
        ? message.code
        : null;
      const code: StorageErrorCode =
        explicit ??
        (entry.read
          ? "READ_FAILED"
          : String(message.error).toLowerCase().includes("full")
            ? "QUOTA_EXCEEDED"
            : "WRITE_FAILED");
      entry.reject(new StorageError(code, message.error));
    } else {
      entry.resolve({
        rows: message.rows,
        bytes: message.bytes,
        preview: message.preview,
      });
    }
  };

  worker.onerror = (event) => {
    rejectReady(new StorageError("UNAVAILABLE", event.message));
  };

  const call = (
    payload: {
      op: string;
      sql?: string;
      bind?: SqlValue[];
      ops?: unknown;
      bytes?: Uint8Array;
    },
    read: boolean,
  ): Promise<WorkerOk> =>
    new Promise<WorkerOk>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, read });
      worker.postMessage({ id, ...payload });
    });

  return {
    async selectAll(sql, bind = []) {
      await ready;
      const { rows } = await call({ op: "selectAll", sql, bind }, true);
      return rows ?? [];
    },
    async run(sql, bind = []) {
      await ready;
      await call({ op: "run", sql, bind }, false);
    },
    async tx(ops) {
      await ready;
      await call({ op: "tx", ops }, false);
    },
    async exportDb() {
      await ready;
      const { bytes } = await call({ op: "export" }, true);
      if (!bytes) throw new StorageError("EXPORT_FAILED");
      return bytes;
    },
    async validateImport(bytes) {
      await ready;
      const { preview } = await call({ op: "import-validate", bytes }, true);
      if (!preview) throw new StorageError("IMPORT_INVALID");
      return preview;
    },
    async commitImport(bytes) {
      await ready;
      await call({ op: "import-commit", bytes }, false);
    },
  };
};
