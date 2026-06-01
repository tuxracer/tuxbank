import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadBlob } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadBlob", () => {
  it("creates an object URL, clicks a download anchor, and revokes the URL", () => {
    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValueOnce(anchor);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake");
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

    const blob = new Blob(["data"], { type: "application/x-sqlite3" });
    downloadBlob(blob, "tuxbank-backup-2026-05-31.sqlite3");

    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(anchor.getAttribute("href")).toBe("blob:fake");
    expect(anchor.download).toBe("tuxbank-backup-2026-05-31.sqlite3");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:fake");
  });
});
