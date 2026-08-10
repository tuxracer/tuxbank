import { beforeEach, describe, expect, it } from "vitest";
import { DEVICE_LINK_HASH_PREFIX } from "@/lib/deviceLink";
import { markLandingDismissed, shouldShowLanding } from "./index";

describe("landingGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("shows the landing page on a first visit", () => {
    expect(shouldShowLanding()).toBe(true);
  });

  it("skips the landing page once it has been dismissed", () => {
    markLandingDismissed();
    expect(shouldShowLanding()).toBe(false);
  });

  it("keeps the dismissal across a simulated revisit", () => {
    markLandingDismissed();
    // A new visit re-evaluates from storage alone; nothing in memory carries over.
    expect(shouldShowLanding()).toBe(false);
  });

  it("skips the landing page for a device-link sign-in", () => {
    window.location.hash = `${DEVICE_LINK_HASH_PREFIX}payload`;
    expect(shouldShowLanding()).toBe(false);
  });

  it("still shows the landing page for unrelated hashes", () => {
    window.location.hash = "#something-else";
    expect(shouldShowLanding()).toBe(true);
  });
});
