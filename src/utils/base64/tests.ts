import { describe, it, expect } from "vitest";
import { toBase64, fromBase64 } from "./index";

describe("base64", () => {
  it("round-trips bytes including 0 and 255", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("encodes to standard base64", () => {
    expect(toBase64(new Uint8Array([0]))).toBe("AA==");
  });
});
