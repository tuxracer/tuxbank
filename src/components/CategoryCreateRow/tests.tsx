import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import { CategoryCreateRow, useCategorySearch } from "./index";

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

describe("CategoryCreateRow", () => {
  it("renders the create label and fires onCreate when clicked", async () => {
    const onCreate = vi.fn();
    render(
      <CategoryCreateRow
        query="Food"
        color="cyan"
        onPickColor={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.click(screen.getByText(/create "Food"/i));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("fires onPickColor when a swatch is clicked", async () => {
    const onPickColor = vi.fn();
    render(
      <CategoryCreateRow
        query="Food"
        color="cyan"
        onPickColor={onPickColor}
        onCreate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTitle("green"));
    expect(onPickColor).toHaveBeenCalledWith("green");
  });
});
