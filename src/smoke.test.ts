import { describe, it, expect } from "vitest";
import { getAllEvents } from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";

describe("test harness", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("provides a working fake-IndexedDB test database", async () => {
    await resetDbForTests();
    expect(await getAllEvents()).toEqual([]);
  });
});
