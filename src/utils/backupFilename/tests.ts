import { describe, it, expect } from "vitest";
import { defaultBackupFilename, resolveBackupFilename } from "./index";

describe("resolveBackupFilename", () => {
  it("appends the extension to a bare name and keeps one already present", () => {
    expect(resolveBackupFilename("my-budget")).toBe("my-budget.json");
    expect(resolveBackupFilename("my-budget.json")).toBe("my-budget.json");
    expect(resolveBackupFilename("MY-BUDGET.JSON")).toBe("MY-BUDGET.JSON");
  });

  it("falls back to the default when the name is blank or only separators", () => {
    const fallback = `${defaultBackupFilename()}.json`;
    expect(resolveBackupFilename("")).toBe(fallback);
    expect(resolveBackupFilename("   ")).toBe(fallback);
    expect(resolveBackupFilename("/\\")).toBe(fallback);
  });

  it("strips path separators", () => {
    expect(resolveBackupFilename(" ../etc/passwd ")).toBe("..etcpasswd.json");
  });
});
