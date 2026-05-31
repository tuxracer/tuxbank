import { StorageError } from "../types";
import type { ConnectionStatus, DbConnection, Row, SqlValue } from "../types";

type Pending = {
  resolve: (rows: Row[]) => void;
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
      const isFull = String(message.error).toLowerCase().includes("full");
      const code = entry.read
        ? "READ_FAILED"
        : isFull
          ? "QUOTA_EXCEEDED"
          : "WRITE_FAILED";
      entry.reject(new StorageError(code, message.error));
    } else {
      entry.resolve(message.rows ?? []);
    }
  };

  worker.onerror = (event) => {
    rejectReady(new StorageError("UNAVAILABLE", event.message));
  };

  const call = (
    payload: { op: string; sql?: string; bind?: SqlValue[]; ops?: unknown },
    read: boolean,
  ): Promise<Row[]> =>
    new Promise<Row[]>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, read });
      worker.postMessage({ id, ...payload });
    });

  return {
    async selectAll(sql, bind = []) {
      await ready;
      return call({ op: "selectAll", sql, bind }, true);
    },
    async run(sql, bind = []) {
      await ready;
      await call({ op: "run", sql, bind }, false);
    },
    async tx(ops) {
      await ready;
      await call({ op: "tx", ops }, false);
    },
  };
};
