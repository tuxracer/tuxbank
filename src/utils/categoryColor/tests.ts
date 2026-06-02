import { describe, it, expect } from "vitest";
import { catColorVar, catGlowVar } from ".";

describe("categoryColor CSS-var helpers", () => {
  it("maps a category color to its solid accent CSS var", () => {
    expect(catColorVar("cyan")).toBe("var(--cat-cyan)");
    expect(catColorVar("orange")).toBe("var(--cat-orange)");
  });

  it("maps a category color to its glow CSS var", () => {
    expect(catGlowVar("magenta")).toBe("var(--cat-magenta-glow)");
    expect(catGlowVar("green")).toBe("var(--cat-green-glow)");
  });
});
