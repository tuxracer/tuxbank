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

/**
 * These re-import the module after rewriting the address bar, because the
 * boot-time UTM capture happens at module load: that ordering (capture, then
 * strip, then send) is exactly the behavior under test.
 */
describe("UTM capture and strip", () => {
  const loadWithUrl = async (url: string) => {
    window.history.replaceState(null, "", url);
    vi.resetModules();
    return await import(".");
  };

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.resetModules();
  });

  it("re-attaches boot-time utm params to events sent after the strip", async () => {
    const mod = await loadWithUrl("/?utm_source=landing&utm_medium=qr");

    mod.stripUtmParams();
    const sent = mod.analyticsBeforeSend({
      type: "pageview",
      url: window.location.href,
    });

    expect(sent).not.toBeNull();
    const url = new URL(sent!.url);
    expect(url.searchParams.get("utm_source")).toBe("landing");
    expect(url.searchParams.get("utm_medium")).toBe("qr");
  });

  it("strips only utm params, leaving other params and the hash alone", async () => {
    const mod = await loadWithUrl("/?utm_source=landing&keep=1#fragment");

    mod.stripUtmParams();

    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#fragment");
  });

  it("leaves the history entry untouched when no utm params are present", async () => {
    const mod = await loadWithUrl("/?keep=1");
    const replaceState = vi.spyOn(window.history, "replaceState");

    mod.stripUtmParams();

    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?keep=1");
    replaceState.mockRestore();
  });
});
