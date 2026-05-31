import { StorageError } from "../types";
import type { ConnectionStatus, DbConnection } from "../types";
import { createMemoryConnection } from "./memoryConnection";
import { createWorkerConnection } from "./workerConnection";

let connectionPromise: Promise<DbConnection> | null = null;
let testConnection: DbConnection | null = null;
const statusListeners = new Set<(status: ConnectionStatus) => void>();

export const onConnectionStatus = (
  callback: (status: ConnectionStatus) => void,
): (() => void) => {
  statusListeners.add(callback);
  return () => {
    statusListeners.delete(callback);
  };
};

const emitStatus = (status: ConnectionStatus): void => {
  for (const listener of statusListeners) listener(status);
};

export const getConnection = (): Promise<DbConnection> => {
  if (testConnection) return Promise.resolve(testConnection);
  if (!connectionPromise) {
    if (typeof Worker === "undefined") {
      emitStatus("unavailable");
      connectionPromise = Promise.reject(new StorageError("UNAVAILABLE"));
      connectionPromise.catch(() => {}); // avoid unhandled rejection warnings
    } else {
      connectionPromise = Promise.resolve(createWorkerConnection(emitStatus));
    }
  }
  return connectionPromise;
};

/** Test-only: install a fresh in-memory connection so each test starts clean. */
export const resetDbForTests = async (): Promise<void> => {
  testConnection = await createMemoryConnection();
};
