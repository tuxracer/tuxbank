import { describe, it, expect } from "vitest";
import { formatSignedCompact, resolveLocalCurrency } from "./index";

describe("resolveLocalCurrency", () => {
  it("maps a full locale's region to its currency", () => {
    expect(resolveLocalCurrency("de-DE")).toBe("EUR");
    expect(resolveLocalCurrency("en-GB")).toBe("GBP");
    expect(resolveLocalCurrency("en-US")).toBe("USD");
  });

  it("fills in the likely region for a bare language tag", () => {
    expect(resolveLocalCurrency("ja")).toBe("JPY");
    expect(resolveLocalCurrency("fr")).toBe("EUR");
  });

  it("falls back to USD for unknown regions and malformed locales", () => {
    expect(resolveLocalCurrency("en-001")).toBe("USD");
    expect(resolveLocalCurrency("not a locale!")).toBe("USD");
  });
});

describe("formatSignedCompact", () => {
  it("always carries an explicit sign", () => {
    expect(formatSignedCompact(3000).startsWith("+")).toBe(true);
    expect(formatSignedCompact(-1500).startsWith("-")).toBe(true);
  });
});
