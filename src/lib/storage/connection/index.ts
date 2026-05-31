import { StorageError } from "../types";
import type { ConnectionStatus, DbConnection } from "../types";
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

/**
 * Test-only hook (called from connection/testing.ts). Kept here so the
 * in-memory connection — which imports the @sqlite.org/sqlite-wasm package — is
 * never reachable from the browser bundle (only test files import testing.ts).
 */
export const setTestConnection = (connection: DbConnection): void => {
  testConnection = connection;
};
