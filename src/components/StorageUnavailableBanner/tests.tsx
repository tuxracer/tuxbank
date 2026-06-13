import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StorageUnavailableBanner from "./index";

describe("StorageUnavailableBanner", () => {
  it("shows the unavailable message and no reset button when not resettable", () => {
    render(<StorageUnavailableBanner resettable={false} onReset={vi.fn()} />);
    expect(screen.getByText(/local storage unavailable/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reset local data/i }),
    ).not.toBeInTheDocument();
  });

  it("offers a reset button (behind a confirm step) when resettable", async () => {
    const onReset = vi.fn();
    render(<StorageUnavailableBanner resettable onReset={onReset} />);

    await userEvent.click(
      screen.getByRole("button", { name: /reset local data/i }),
    );
    // Nothing happens until the destructive action is confirmed.
    expect(onReset).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /delete and reload/i }),
    );
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("cancel dismisses the confirm without resetting", async () => {
    const onReset = vi.fn();
    render(<StorageUnavailableBanner resettable onReset={onReset} />);

    await userEvent.click(
      screen.getByRole("button", { name: /reset local data/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.queryByRole("button", { name: /delete and reload/i }),
    ).not.toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /reset local data/i }),
    ).toBeInTheDocument();
  });
});
