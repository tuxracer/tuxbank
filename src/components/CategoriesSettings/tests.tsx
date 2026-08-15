import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import CategoriesSettings from "./index";

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
const base = {
  categories: cats,
  usageCountById: { work: 2, rent: 0 },
  onRename: vi.fn(),
  onRecolor: vi.fn(),
  onDelete: vi.fn(),
  onCreate: vi.fn(),
};

describe("CategoriesSettings", () => {
  it("renames a category", async () => {
    const onRename = vi.fn();
    render(<CategoriesSettings {...base} onRename={onRename} />);
    const input = screen.getByDisplayValue("Rent");
    await userEvent.clear(input);
    await userEvent.type(input, "Mortgage");
    await userEvent.tab(); // blur commits
    expect(onRename).toHaveBeenCalledWith("rent", "Mortgage");
  });

  it("recolors a category", async () => {
    const onRecolor = vi.fn();
    render(<CategoriesSettings {...base} onRecolor={onRecolor} />);
    // each category row exposes 5 color swatches titled by color
    const greenSwatches = screen.getAllByTitle("green");
    await userEvent.click(greenSwatches[0]); // recolor "Work" -> green
    expect(onRecolor).toHaveBeenCalledWith("work", "green");
  });

  it("confirms deletion and reports usage count", async () => {
    const onDelete = vi.fn();
    render(<CategoriesSettings {...base} onDelete={onDelete} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: /delete/i })[0],
    ); // delete "Work" (used by 2)
    const usage = await screen.findByText(/2 events use/i);
    // scope to the confirmation section — the row buttons are also named "Delete"
    const confirmSection = usage.parentElement as HTMLElement;
    await userEvent.click(
      within(confirmSection).getByRole("button", { name: /^delete$/i }),
    );
    expect(onDelete).toHaveBeenCalledWith("work");
  });

  it("shows an inline error and does not call onRename when renaming to a colliding name", async () => {
    const onRename = vi.fn();
    render(<CategoriesSettings {...base} onRename={onRename} />);
    // Rename "Rent" to "Work" (case-insensitive collision)
    const input = screen.getByDisplayValue("Rent");
    await userEvent.clear(input);
    await userEvent.type(input, "Work");
    await userEvent.tab(); // blur commits
    expect(onRename).not.toHaveBeenCalled();
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
  });

  it("filters the rows by the search query", async () => {
    render(<CategoriesSettings {...base} />);
    await userEvent.type(
      screen.getByPlaceholderText(/search or create/i),
      "rent",
    );
    expect(screen.getByDisplayValue("Rent")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Work")).not.toBeInTheDocument();
  });

  it("creates a new category with the typed name and chosen color", async () => {
    const onCreate = vi.fn();
    render(<CategoriesSettings {...base} onCreate={onCreate} />);
    await userEvent.type(
      screen.getByPlaceholderText(/search or create/i),
      "Food",
    );
    // No existing category matches "Food", so the create row's swatch is the only one.
    await userEvent.click(screen.getByTitle("green"));
    await userEvent.click(screen.getByText(/create "Food"/i));
    expect(onCreate).toHaveBeenCalledWith("Food", "green");
    expect(screen.getByPlaceholderText(/search or create/i)).toHaveValue("");
  });

  it("does not offer create when the name matches an existing category", async () => {
    render(<CategoriesSettings {...base} />);
    await userEvent.type(
      screen.getByPlaceholderText(/search or create/i),
      "work",
    );
    expect(screen.queryByText(/create "work"/i)).not.toBeInTheDocument();
  });
});
