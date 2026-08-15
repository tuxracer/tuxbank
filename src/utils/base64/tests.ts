import { describe, it, expect } from "vitest";
import { toBase64, fromBase64, toBase64Url, fromBase64Url } from "./index";

describe("base64", () => {
  it("round-trips bytes including 0 and 255", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("encodes to standard base64", () => {
    expect(toBase64(new Uint8Array([0]))).toBe("AA==");
  });

  it("round-trips payloads past the fromCharCode argument limit", () => {
    const bytes = Uint8Array.from({ length: 300_000 }, (_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe("base64url helpers", () => {
  it("round-trips bytes through base64url", () => {
    const bytes = Uint8Array.from(
      { length: 64 },
      (_, i) => (i * 37 + 250) % 256,
    );
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("emits no characters that need URL escaping", () => {
    // 0xfb 0xef 0xff encodes to "++//" territory in plain base64.
    const bytes = new Uint8Array([0xfb, 0xef, 0xff, 0xfe, 0x3e, 0x3f]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });

  it("round-trips lengths that would need padding", () => {
    for (const len of [1, 2, 3, 4, 5]) {
      const bytes = new Uint8Array(len).fill(0xab);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });
});
