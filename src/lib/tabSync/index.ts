import { SYNC_CHANNEL_NAME } from "./consts";

export * from "./consts";

let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

const getChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    // Fires only for messages posted by OTHER channel instances (other tabs);
    // a tab never receives its own postMessage, so there is no echo loop.
    channel.onmessage = () => {
      for (const listener of listeners) listener();
    };
  }
  return channel;
};

/** Tell every other open tab that events/categories changed in storage. */
export const notifyDataChanged = (): void => {
  getChannel()?.postMessage("data-changed");
};

/**
 * Invoke `callback` whenever another tab announces a data change.
 * Returns an unsubscribe function.
 */
export const subscribeToDataChanges = (callback: () => void): (() => void) => {
  if (!getChannel()) return () => undefined;
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

/** Test-only: close the shared channel and drop all listeners. */
export const resetChannelForTests = (): void => {
  channel?.close();
  channel = null;
  listeners.clear();
};
