import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandingPage from "./index";

describe("LandingPage", () => {
  it("makes the free / no sign-up promises visible", () => {
    render(<LandingPage onTryNow={vi.fn()} />);
    expect(screen.getAllByText(/free forever/i)).not.toHaveLength(0);
    expect(screen.getByText(/no sign-up/i)).toBeInTheDocument();
    expect(screen.getByText(/not even an email/i)).toBeInTheDocument();
  });

  it("enters the app when Try Now is clicked", async () => {
    const onTryNow = vi.fn();
    render(<LandingPage onTryNow={onTryNow} />);

    await userEvent.click(screen.getByRole("button", { name: /try now/i }));
    expect(onTryNow).toHaveBeenCalledTimes(1);
  });
});
