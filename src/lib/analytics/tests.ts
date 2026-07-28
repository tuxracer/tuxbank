import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsBeforeSend, trackEvent } from ".";

/**
 * Defines a privacy signal the way a browser would expose it. `configurable`
 * lets each test redefine it; jsdom leaves both properties undefined by
 * default, which reads as "no opt-out".
 */
const setSignal = (
  key: "doNotTrack" | "globalPrivacyControl",
  value: unknown,
) => {
  Object.defineProperty(window.navigator, key, { value, configurable: true });
};

const mockQueue = () => {
  const va = vi.fn();
  window.va = va;
  return va;
};

afterEach(() => {
  setSignal("doNotTrack", undefined);
  setSignal("globalPrivacyControl", undefined);
  delete window.va;
});

describe("trackEvent", () => {
  it("queues the event when no opt-out signal is set", () => {
    const va = mockQueue();

    trackEvent("data-exported");

    expect(va).toHaveBeenCalledWith(
      "event",
      expect.objectContaining({ name: "data-exported" }),
    );
  });

  it("passes properties through to the queued event", () => {
    const va = mockQueue();

    trackEvent("new-event-clicked", { layout: "compact" });

    expect(va).toHaveBeenCalledWith(
      "event",
      expect.objectContaining({
        name: "new-event-clicked",
        data: { layout: "compact" },
      }),
    );
  });

  it("sends nothing when Do Not Track is set", () => {
    const va = mockQueue();
    setSignal("doNotTrack", "1");

    trackEvent("data-exported");

    expect(va).not.toHaveBeenCalled();
  });

  it("sends nothing when Global Privacy Control is set", () => {
    const va = mockQueue();
    setSignal("globalPrivacyControl", true);

    trackEvent("signed-in", { method: "password" });

    expect(va).not.toHaveBeenCalled();
  });
});

describe("analyticsBeforeSend", () => {
  const pageview = { type: "pageview", url: "https://example.test/" } as const;

  it("lets the page view through when no opt-out signal is set", () => {
    expect(analyticsBeforeSend(pageview)).toBe(pageview);
  });

  it("cancels the page view when Do Not Track is set", () => {
    setSignal("doNotTrack", "1");

    expect(analyticsBeforeSend(pageview)).toBeNull();
  });

  it("cancels the page view when Global Privacy Control is set", () => {
    setSignal("globalPrivacyControl", true);

    expect(analyticsBeforeSend(pageview)).toBeNull();
  });
});
