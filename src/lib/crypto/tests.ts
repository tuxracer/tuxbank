import { describe, it, expect } from "vitest";
import { deriveKeys } from "./index";
import { encryptPayload, decryptPayload } from "./index";

describe("deriveKeys", () => {
  it("is deterministic for the same password and email", async () => {
    const a = await deriveKeys(
      "correct horse battery staple",
      "user@example.com",
    );
    const b = await deriveKeys(
      "correct horse battery staple",
      "user@example.com",
    );
    expect(a.kek).toEqual(b.kek);
    expect(a.authSecret).toEqual(b.authSecret);
  });

  it("normalizes the email so case and surrounding spaces do not matter", async () => {
    const a = await deriveKeys("pw", "User@Example.com");
    const b = await deriveKeys("pw", "  user@example.com  ");
    expect(a.kek).toEqual(b.kek);
    expect(a.authSecret).toEqual(b.authSecret);
  });

  it("produces a 32-byte KEK and a non-empty authSecret string", async () => {
    const { kek, authSecret } = await deriveKeys("pw", "user@example.com");
    expect(kek).toBeInstanceOf(Uint8Array);
    expect(kek.length).toBe(32);
    expect(typeof authSecret).toBe("string");
    expect(authSecret.length).toBeGreaterThan(0);
  });

  it("changes when the password changes", async () => {
    const a = await deriveKeys("password-one", "user@example.com");
    const b = await deriveKeys("password-two", "user@example.com");
    expect(a.kek).not.toEqual(b.kek);
    expect(a.authSecret).not.toEqual(b.authSecret);
  });

  it("changes when the email changes", async () => {
    const a = await deriveKeys("pw", "one@example.com");
    const b = await deriveKeys("pw", "two@example.com");
    expect(a.kek).not.toEqual(b.kek);
    expect(a.authSecret).not.toEqual(b.authSecret);
  });
});

describe("encryptPayload / decryptPayload", () => {
  const dek = () => crypto.getRandomValues(new Uint8Array(32));

  it("round-trips a JSON-serializable object", async () => {
    const key = dek();
    const value = {
      amount: 1_500,
      direction: "withdrawal",
      date: "2026-06-08",
    };
    const box = await encryptPayload(value, key);
    expect(await decryptPayload(box, key)).toEqual(value);
  });

  it("produces a different nonce and ciphertext each time", async () => {
    const key = dek();
    const a = await encryptPayload({ x: 1 }, key);
    const b = await encryptPayload({ x: 1 }, key);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("throws when decrypting with the wrong key", async () => {
    const box = await encryptPayload({ secret: true }, dek());
    await expect(decryptPayload(box, dek())).rejects.toThrow();
  });
});
