import { describe, it, expect } from "vitest";
import { formatCurrency, formatSignedCompact } from "./index";

describe("formatCurrency", () => {
  it("formats a full USD amount with cents", () => {
    expect(formatCurrency(4200)).toBe("$4,200.00");
    expect(formatCurrency(-1500.5)).toBe("-$1,500.50");
  });

  it("formats a compact signed amount without cents", () => {
    expect(formatSignedCompact(3000)).toBe("+3,000");
    expect(formatSignedCompact(-1500)).toBe("-1,500");
  });
});
