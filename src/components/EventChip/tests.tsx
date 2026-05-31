import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Occurrence } from "@/types";
import EventChip from "./index";

const occ = (over: Partial<Occurrence>): Occurrence => ({
  eventId: "e",
  date: "2026-05-14",
  title: "Rent",
  category: { id: "work", name: "Work", color: "cyan" },
  amount: 1500,
  direction: "withdrawal",
  isRecurring: false,
  ...over,
});

describe("EventChip", () => {
  it("shows a withdrawal as a negative compact amount", () => {
    render(<EventChip occurrence={occ({})} onSelect={vi.fn()} />);
    expect(screen.getByText("-1,500")).toBeInTheDocument();
  });

  it("shows a deposit as a positive compact amount", () => {
    render(
      <EventChip
        occurrence={occ({ title: "Pay", amount: 3000, direction: "deposit" })}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("+3,000")).toBeInTheDocument();
  });
});
