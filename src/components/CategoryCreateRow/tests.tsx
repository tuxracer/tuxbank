import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Category } from "@/types";
import { useCategorySearch } from "./index";

const cats: Category[] = [
  {
    id: "work",
    name: "Work",
    color: "cyan",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "rent",
    name: "Rent",
    color: "magenta",
    updatedAt: new Date().toISOString(),
  },
];

describe("useCategorySearch", () => {
  it("filters categories by case-insensitive substring", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("RE"));
    expect(result.current.filtered.map((c) => c.id)).toEqual(["rent"]);
  });

  it("flags an exact match case-insensitively and hides create", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("work"));
    expect(result.current.hasExact).toBe(true);
    expect(result.current.showCreate).toBe(false);
  });

  it("shows create for a non-empty query with no exact match", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("Food"));
    expect(result.current.showCreate).toBe(true);
  });

  it("does not show create for a whitespace-only query", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    act(() => result.current.setQuery("   "));
    expect(result.current.showCreate).toBe(false);
  });

  it("reset clears the query and restores the default color", () => {
    const { result } = renderHook(() => useCategorySearch(cats));
    const initialColor = result.current.newColor;
    act(() => {
      result.current.setQuery("Food");
      result.current.setNewColor("orange");
    });
    act(() => result.current.reset());
    expect(result.current.query).toBe("");
    expect(result.current.newColor).toBe(initialColor);
  });
});
