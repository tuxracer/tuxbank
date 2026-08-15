import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useIsCompact } from "./index";

type ChangeListener = () => void;

// Controllable matchMedia stand-in: one shared MQL object whose `matches`
// flips via setMatches, notifying subscribed change listeners. The hook's
// query is min-width (desktop matches), so compact = !matches.
const installFakeMatchMedia = (matchesMinWidth: boolean) => {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: matchesMinWidth,
    media: "(min-width: 640px)",
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
  };
  const matchMedia = vi.fn().mockReturnValue(mql);
  vi.stubGlobal("matchMedia", matchMedia);
  const setMatches = (matches: boolean) => {
    mql.matches = matches;
    listeners.forEach((listener) => listener());
  };
  return { matchMedia, setMatches };
};

describe("useIsCompact", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a wide viewport as not compact", () => {
    installFakeMatchMedia(true);
    const { result } = renderHook(() => useIsCompact());
    expect(result.current).toBe(false);
  });

  it("reports a narrow viewport as compact", () => {
    installFakeMatchMedia(false);
    const { result } = renderHook(() => useIsCompact());
    expect(result.current).toBe(true);
  });

  it("updates live when the media query match flips", () => {
    const { setMatches } = installFakeMatchMedia(true);
    const { result } = renderHook(() => useIsCompact());
    act(() => setMatches(false));
    expect(result.current).toBe(true);
    act(() => setMatches(true));
    expect(result.current).toBe(false);
  });
});
