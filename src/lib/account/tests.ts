import { describe, it, expect, vi } from "vitest";
import {
  provisionAccountKeys,
  unlockWithPassword,
  unlockWithRecoveryKey,
  rewrapForNewPassword,
  unlockWithKek,
} from "./index";
import { isKeyMaterial } from "./types";
import { deriveKeys } from "@/lib/crypto";

// Controls what the account wrappers see as the Supabase client.
let mockClient: unknown = null;
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    get supabase() {
      return mockClient;
    },
  };
});

import { signUp, uploadKeyMaterial, fetchKeyMaterial } from "./index";

describe("account wrappers without configuration", () => {
  it("throws NOT_CONFIGURED when there is no Supabase client", async () => {
    mockClient = null;
    await expect(signUp("a@b.com", "secret")).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});

describe("key material wrappers", () => {
  it("uploads key material via insert", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockClient = { from: () => ({ insert }) };
    await uploadKeyMaterial({
      wrapped_dek: "a",
      wrapped_dek_nonce: "b",
      recovery_wrapped_dek: "c",
      recovery_nonce: "d",
      kdf_version: 1,
    });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("throws NO_KEY_MATERIAL when the fetched row is missing or malformed", async () => {
    mockClient = {
      from: () => ({
        select: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    };
    await expect(fetchKeyMaterial()).rejects.toMatchObject({
      code: "NO_KEY_MATERIAL",
    });
  });

  it("returns valid fetched key material", async () => {
    const row = {
      wrapped_dek: "a",
      wrapped_dek_nonce: "b",
      recovery_wrapped_dek: "c",
      recovery_nonce: "d",
      kdf_version: 1,
    };
    mockClient = {
      from: () => ({
        select: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    };
    expect(await fetchKeyMaterial()).toEqual(row);
  });
});

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

describe("unlockWithRecoveryKey", () => {
  it("unlocks the same DEK from the recovery key", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    const dek = await unlockWithRecoveryKey(
      provisioned.recoveryKey,
      provisioned.keyMaterial,
    );
    expect(dek).toEqual(provisioned.dek);
  });

  it("fails with the wrong recovery key", async () => {
    const provisioned = await provisionAccountKeys("pw", "user@example.com");
    const other = await provisionAccountKeys("pw2", "user2@example.com");
    await expect(
      unlockWithRecoveryKey(other.recoveryKey, provisioned.keyMaterial),
    ).rejects.toThrow();
  });
});

describe("rewrapForNewPassword", () => {
  // Four real Argon2id runs (64 MiB memory cost each); under full-suite
  // parallel load this can exceed the default 5s timeout on a busy machine.
  it(
    "lets the new password unlock the DEK and the old one stop working",
    { timeout: 15_000 },
    async () => {
      const provisioned = await provisionAccountKeys(
        "old pw",
        "user@example.com",
      );
      const rewrapped = await rewrapForNewPassword(
        "new pw",
        "user@example.com",
        provisioned.dek,
      );

      // The material after a password change keeps the recovery columns, swaps the password columns.
      const updated = {
        ...provisioned.keyMaterial,
        wrapped_dek: rewrapped.wrapped_dek,
        wrapped_dek_nonce: rewrapped.wrapped_dek_nonce,
      };

      const dekNew = await unlockWithPassword(
        "new pw",
        "user@example.com",
        updated,
      );
      expect(dekNew).toEqual(provisioned.dek);
      await expect(
        unlockWithPassword("old pw", "user@example.com", updated),
      ).rejects.toThrow();
      expect(typeof rewrapped.authSecret).toBe("string");
      expect(rewrapped.authSecret).not.toBe(provisioned.authSecret);
    },
  );
});

describe("staged password rewrap", () => {
  // Several real Argon2id runs; see the rewrapForNewPassword timeout note.
  it(
    "lets both the old and the new password unlock while a change is staged",
    { timeout: 20_000 },
    async () => {
      const { keyMaterial, dek } = await provisionAccountKeys(
        "old pw",
        "a@b.com",
      );
      const rewrapped = await rewrapForNewPassword("new pw", "a@b.com", dek);
      // What stagePasswordRewrap uploads: new wrap primary, old wrap staged.
      const staged = {
        ...keyMaterial,
        wrapped_dek: rewrapped.wrapped_dek,
        wrapped_dek_nonce: rewrapped.wrapped_dek_nonce,
        wrapped_dek_prev: keyMaterial.wrapped_dek,
        wrapped_dek_prev_nonce: keyMaterial.wrapped_dek_nonce,
      };
      expect(await unlockWithPassword("new pw", "a@b.com", staged)).toEqual(
        dek,
      );
      // The auth flip may not have happened yet: the old password must still
      // open the staged wrap or a mid-change failure locks other devices out.
      expect(await unlockWithPassword("old pw", "a@b.com", staged)).toEqual(
        dek,
      );
    },
  );
});

describe("unlockWithKek", () => {
  it("unwraps the DEK with a directly supplied KEK", async () => {
    const { keyMaterial, dek } = await provisionAccountKeys(
      "pw-123456",
      "a@b.com",
    );
    const { kek } = await deriveKeys("pw-123456", "a@b.com");
    expect(await unlockWithKek(kek, keyMaterial)).toEqual(dek);
  });

  it("rejects with a wrong KEK", async () => {
    const { keyMaterial } = await provisionAccountKeys("pw-123456", "a@b.com");
    await expect(
      unlockWithKek(new Uint8Array(32).fill(9), keyMaterial),
    ).rejects.toThrow();
  });
});
