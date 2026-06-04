import { describe, it, expect, afterEach, vi } from "vitest";
import {
  notifyDataChanged,
  resetChannelForTests,
  subscribeToDataChanges,
  SYNC_CHANNEL_NAME,
} from "./index";

describe("tabSync", () => {
  afterEach(() => {
    resetChannelForTests();
    vi.unstubAllGlobals();
  });

  it("invokes subscribers when another tab posts on the sync channel", async () => {
    const callback = vi.fn();
    subscribeToDataChanges(callback);

    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.postMessage("data-changed");

    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    otherTab.close();
  });

  it("notifyDataChanged reaches other tabs on the sync channel", async () => {
    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    const received = new Promise<void>((resolve) => {
      otherTab.onmessage = () => resolve();
    });

    notifyDataChanged();

    await received;
    otherTab.close();
  });

  it("does not invoke local subscribers for this tab's own notifications", async () => {
    const callback = vi.fn();
    subscribeToDataChanges(callback);

    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    const received = new Promise<void>((resolve) => {
      otherTab.onmessage = () => resolve();
    });

    notifyDataChanged();
    await received; // the message went out to other tabs...
    expect(callback).not.toHaveBeenCalled(); // ...but never echoed back here

    otherTab.close();
  });

  it("stops invoking a subscriber after unsubscribe", async () => {
    const unsubscribed = vi.fn();
    const stillSubscribed = vi.fn();
    const unsubscribe = subscribeToDataChanges(unsubscribed);
    subscribeToDataChanges(stillSubscribed);
    unsubscribe();

    const otherTab = new BroadcastChannel(SYNC_CHANNEL_NAME);
    otherTab.postMessage("data-changed");

    await vi.waitFor(() => expect(stillSubscribed).toHaveBeenCalledTimes(1));
    expect(unsubscribed).not.toHaveBeenCalled();
    otherTab.close();
  });

  it("degrades to no-ops when BroadcastChannel is unavailable", () => {
    vi.stubGlobal("BroadcastChannel", undefined);

    expect(() => notifyDataChanged()).not.toThrow();
    const unsubscribe = subscribeToDataChanges(() => undefined);
    expect(() => unsubscribe()).not.toThrow();
  });
});
