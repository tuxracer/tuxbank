import { describe, it, expect } from "vitest";
import { sealedBoxToRow, rowToSealedBox } from "./index";

describe("sealedBox row serialization", () => {
  it("round-trips a sealed box through base64 text", () => {
    const box = {
      nonce: new Uint8Array([1, 2, 3, 4, 5]),
      ciphertext: new Uint8Array([9, 8, 7, 6, 0, 255]),
    };
    const row = sealedBoxToRow(box);
    expect(typeof row.nonce).toBe("string");
    expect(typeof row.ciphertext).toBe("string");
    const back = rowToSealedBox(row);
    expect(back.nonce).toEqual(box.nonce);
    expect(back.ciphertext).toEqual(box.ciphertext);
  });

  it("produces standard base64 strings", () => {
    const row = sealedBoxToRow({
      nonce: new Uint8Array([0]),
      ciphertext: new Uint8Array([0]),
    });
    expect(row.nonce).toBe("AA==");
    expect(row.ciphertext).toBe("AA==");
  });
});
