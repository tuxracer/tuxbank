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
  onCreateCategory: vi.fn(),
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
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), "50");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: "Dentist",
      date: "2026-05-14",
      amount: 50,
      direction: "withdrawal",
      recurrence: null,
    });
  });

  it("blocks submit when amount is not greater than zero", async () => {
    const onSubmit = vi.fn();
    render(<EventDialog {...baseProps} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/title/i), "Coffee");
    await userEvent.clear(screen.getByLabelText(/amount/i));
    await userEvent.type(screen.getByLabelText(/amount/i), "0");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(
      await screen.findByText("Amount must be greater than 0"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the series anchor date (not the clicked occurrence) when editing a recurring event", async () => {
    const onSubmit = vi.fn();
    const sourceEvent = {
      id: "s1",
      title: "Standup",
      date: "2026-05-04",
      categoryId: "work",
      amount: 50,
      direction: "deposit" as const,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
      overrides: [],
      createdAt: "",
      updatedAt: "",
    };
    const occurrence = {
      eventId: "s1",
      date: "2026-05-11",
      title: "Standup",
      category: {
        id: "work",
        name: "Work",
        color: "cyan" as const,
        updatedAt: new Date().toISOString(),
      },
      amount: 50,
      direction: "deposit" as const,
      isRecurring: true,
    };
    render(
      <EventDialog
        {...baseProps}
        mode="edit"
        initialOccurrence={occurrence}
        sourceEvent={sourceEvent}
        onSubmit={onSubmit}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].date).toBe("2026-05-04");
  });

  it("shows read-only sync debug metadata (id, timestamps, recurrence) when editing", () => {
    const sourceEvent = {
      id: "evt-123",
      title: "Rent",
      date: "2026-05-04",
      categoryId: "work",
      amount: 50,
      direction: "withdrawal" as const,
      recurrence: {
        freq: "weekly" as const,
        interval: 2,
        endsOn: "2026-05-31",
      },
      overrides: [{ occurrenceDate: "2026-05-11", cancelled: true }],
      createdAt: "2026-05-01T08:30:00.000Z",
      updatedAt: "2026-05-09T14:02:11.000Z",
    };
    const occurrence = {
      eventId: "evt-123",
      date: "2026-05-18",
      title: "Rent",
      category: {
        id: "work",
        name: "Work",
        color: "cyan" as const,
        updatedAt: "",
      },
      amount: 50,
      direction: "withdrawal" as const,
      isRecurring: true,
    };
    render(
      <EventDialog
        {...baseProps}
        mode="edit"
        initialOccurrence={occurrence}
        sourceEvent={sourceEvent}
      />,
    );
    // The underlying row id and both timestamps are the decisive fields for
    // telling a duplicated row apart from one event drawn twice.
    expect(screen.getByText("evt-123")).toBeInTheDocument();
    expect(screen.getByText("2026-05-09T14:02:11.000Z")).toBeInTheDocument();
    expect(screen.getByText("2026-05-01T08:30:00.000Z")).toBeInTheDocument();
    expect(
      screen.getByText("weekly, interval 2, ends 2026-05-31"),
    ).toBeInTheDocument();
    // The clicked occurrence date, distinct from the locked series anchor.
    expect(screen.getByText("2026-05-18")).toBeInTheDocument();
  });

  it("hides the debug metadata when creating a new event", () => {
    render(<EventDialog {...baseProps} mode="create" />);
    expect(screen.queryByText(/debug/i)).not.toBeInTheDocument();
  });

  it("pre-fills amount and direction from the occurrence's resolved values, not the series base", async () => {
    const onSubmit = vi.fn();
    const sourceEvent = {
      id: "s1",
      title: "Rent",
      date: "2026-05-04",
      categoryId: "work",
      amount: 50,
      direction: "withdrawal" as const,
      recurrence: { freq: "weekly" as const, interval: 1, endsOn: null },
      overrides: [
        {
          occurrenceDate: "2026-05-11",
          patch: { amount: 250, direction: "deposit" as const },
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    // The clicked occurrence carries a prior per-occurrence patch (250 / deposit).
    const occurrence = {
      eventId: "s1",
      date: "2026-05-11",
      title: "Rent",
      category: {
        id: "work",
        name: "Work",
        color: "cyan" as const,
        updatedAt: new Date().toISOString(),
      },
      amount: 250,
      direction: "deposit" as const,
      isRecurring: true,
    };
    render(
      <EventDialog
        {...baseProps}
        mode="edit"
        initialOccurrence={occurrence}
        sourceEvent={sourceEvent}
        onSubmit={onSubmit}
      />,
    );
    // Re-saving without touching the fields must preserve the occurrence's
    // patched values, not silently revert them to the series base (50 / withdrawal).
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].amount).toBe(250);
    expect(onSubmit.mock.calls[0][0].direction).toBe("deposit");
  });
});
