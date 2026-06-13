import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryColor } from "@/types";
import CategoryCombobox from "./index";

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

describe("CategoryCombobox", () => {
  it("selects an existing category", async () => {
    const onChange = vi.fn();
    render(
      <CategoryCombobox
        categories={cats}
        value=""
        onChange={onChange}
        onCreateCategory={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.click(await screen.findByText("Rent"));
    expect(onChange).toHaveBeenCalledWith("rent");
  });

  it("offers to create a new category when the typed name has no match", async () => {
    const onCreate = vi.fn(async (name: string, color: CategoryColor) => ({
      id: name.toLowerCase(),
      name,
      color,
      updatedAt: new Date().toISOString(),
    }));
    const onChange = vi.fn();
    render(
      <CategoryCombobox
        categories={cats}
        value=""
        onChange={onChange}
        onCreateCategory={onCreate}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/search or create/i),
      "Groceries",
    );
    await userEvent.click(await screen.findByText(/create "Groceries"/i));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith("Groceries", expect.any(String)),
    );
    expect(onChange).toHaveBeenCalledWith("groceries");
  });

  it("does not offer create when the name matches an existing category (case-insensitive)", async () => {
    render(
      <CategoryCombobox
        categories={cats}
        value=""
        onChange={vi.fn()}
        onCreateCategory={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /category/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/search or create/i),
      "work",
    );
    expect(screen.queryByText(/create "work"/i)).not.toBeInTheDocument();
  });
});
