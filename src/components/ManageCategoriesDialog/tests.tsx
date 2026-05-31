import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@/types";
import ManageCategoriesDialog from "./index";

const cats: Category[] = [
  { id: "work", name: "Work", color: "cyan" },
  { id: "rent", name: "Rent", color: "magenta" },
];
const base = {
  open: true,
  categories: cats,
  usageCountById: { work: 2, rent: 0 },
  onRename: vi.fn(),
  onRecolor: vi.fn(),
  onDelete: vi.fn(),
  onOpenChange: vi.fn(),
};

describe("ManageCategoriesDialog", () => {
  it("renames a category", async () => {
    const onRename = vi.fn();
    render(<ManageCategoriesDialog {...base} onRename={onRename} />);
    const input = screen.getByDisplayValue("Rent");
    await userEvent.clear(input);
    await userEvent.type(input, "Mortgage");
    await userEvent.tab(); // blur commits
    expect(onRename).toHaveBeenCalledWith("rent", "Mortgage");
  });

  it("recolors a category", async () => {
    const onRecolor = vi.fn();
    render(<ManageCategoriesDialog {...base} onRecolor={onRecolor} />);
    // each category row exposes 5 color swatches labelled by color
    const greenSwatches = screen.getAllByRole("button", { name: "green" });
    await userEvent.click(greenSwatches[0]); // recolor "Work" -> green
    expect(onRecolor).toHaveBeenCalledWith("work", "green");
  });

  it("confirms deletion and reports usage count", async () => {
    const onDelete = vi.fn();
    render(<ManageCategoriesDialog {...base} onDelete={onDelete} />);
    await userEvent.click(
      screen.getAllByRole("button", { name: /delete/i })[0],
    ); // delete "Work" (used by 2)
    expect(await screen.findByText(/2 events use/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith("work");
  });
});
