import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PRESET_CATEGORIES } from "@/types";
import EventDialog from "./index";

const baseProps = {
  open: true,
  mode: "create" as const,
  categories: PRESET_CATEGORIES,
  defaultDate: "2026-05-14",
  initialOccurrence: undefined,
  sourceEvent: undefined,
  onOpenChange: vi.fn(),
  onSubmit: vi.fn(),
  onDelete: vi.fn(),
};

describe("EventDialog", () => {
  it("blocks submit and shows an error when the title is empty", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid one-off event as an EventInput", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/title/i), "Dentist");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        title: "Dentist",
        date: "2026-05-14",
        recurrence: null,
      });
    });
  });
});
