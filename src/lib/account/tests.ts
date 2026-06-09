import { describe, it, expect } from "vitest";
import { provisionAccountKeys, unlockWithPassword } from "./index";
import { isKeyMaterial } from "./types";

describe("provisionAccountKeys / unlockWithPassword", () => {
  it("provisions material and unlocks the same DEK from the password", async () => {
    const provisioned = await provisionAccountKeys(
      "correct horse",
      "user@example.com",
    );
    expect(isKeyMaterial(provisioned.keyMaterial)).toBe(true);
    expect(provisioned.dek).toBeInstanceOf(Uint8Array);
    expect(typeof provisioned.authSecret).toBe("string");
    expect(typeof provisioned.recoveryKey).toBe("string");

    const dek = await unlockWithPassword(
      "correct horse",
      "user@example.com",
      provisioned.keyMaterial,
    );
    expect(dek).toEqual(provisioned.dek);
  });

  it("records the KDF version in the material", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    expect(provisioned.keyMaterial.kdf_version).toBeGreaterThanOrEqual(1);
  });

  it("fails to unlock with the wrong password", async () => {
    const provisioned = await provisionAccountKeys("right", "user@example.com");
    await expect(
      unlockWithPassword("wrong", "user@example.com", provisioned.keyMaterial),
    ).rejects.toThrow();
  });
});
