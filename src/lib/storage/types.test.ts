import { describe, it, expect } from "vitest";
import { isStorageErrorCode } from "./types";

describe("isStorageErrorCode", () => {
  it("accepts known codes", () => {
    expect(isStorageErrorCode("IMPORT_INVALID")).toBe(true);
    expect(isStorageErrorCode("EXPORT_FAILED")).toBe(true);
    expect(isStorageErrorCode("WRITE_FAILED")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isStorageErrorCode("NOPE")).toBe(false);
    expect(isStorageErrorCode(42)).toBe(false);
    expect(isStorageErrorCode(undefined)).toBe(false);
  });
});
