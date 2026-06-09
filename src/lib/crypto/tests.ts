import { describe, it, expect } from "vitest";
import { deriveKeys } from "./index";

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
