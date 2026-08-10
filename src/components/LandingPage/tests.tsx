import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandingPage from "./index";

describe("LandingPage", () => {
  it("enters the app when Try Now is clicked", async () => {
    const onTryNow = vi.fn();
    render(<LandingPage onTryNow={onTryNow} />);

    await userEvent.click(screen.getByRole("button", { name: /try now/i }));
    expect(onTryNow).toHaveBeenCalledTimes(1);
  });
});
