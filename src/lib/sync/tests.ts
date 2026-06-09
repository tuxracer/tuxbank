import { describe, it, expect } from "vitest";
import { generateDek } from "@/lib/crypto";
import type { CalendarEvent } from "@/types";
import { encryptRecord, decryptRow, isRemoteNewer } from "./index";

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  title: "Rent",
  date: "2026-06-09",
  categoryId: "work",
  amount: 1_500,
  direction: "withdrawal",
  recurrence: null,
  overrides: [],
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  ...over,
});

describe("isRemoteNewer", () => {
  it("is true when there is no local record", () => {
    expect(isRemoteNewer("2026-06-09T00:00:00.000Z", undefined)).toBe(true);
  });
  it("is true only when the remote timestamp is strictly greater", () => {
    expect(
      isRemoteNewer("2026-06-09T00:00:02.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(true);
    expect(
      isRemoteNewer("2026-06-09T00:00:01.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(false);
    expect(
      isRemoteNewer("2026-06-09T00:00:00.000Z", "2026-06-09T00:00:01.000Z"),
    ).toBe(false);
  });
});

describe("encryptRecord / decryptRow", () => {
  it("round-trips an event and exposes routing metadata in the clear", async () => {
    const dek = await generateDek();
    const row = await encryptRecord(event(), dek);
    expect(row.id).toBe("e1");
    expect(row.updated_at).toBe("2026-06-09T00:00:00.000Z");
    expect(row.deleted).toBe(false);
    expect(typeof row.ciphertext).toBe("string");
    // The sensitive fields are not in the plaintext columns.
    expect(JSON.stringify(row)).not.toContain("Rent");
    expect(JSON.stringify(row)).not.toContain("1500");
    expect(await decryptRow(row, dek)).toEqual(event());
  });

  it("fails to decrypt a row with the wrong key", async () => {
    const row = await encryptRecord(event(), await generateDek());
    await expect(decryptRow(row, await generateDek())).rejects.toThrow();
  });
});
