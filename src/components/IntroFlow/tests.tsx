import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarProvider } from "@/context/CalendarContext";
import { getAllCategories, getAllEvents } from "@/lib/storage";
import { resetDbForTests } from "@/lib/storage/testing";
import { INTRO_INCOME_CATEGORY } from "@/lib/introPlan";
import IntroFlow from "./index";

describe("IntroFlow", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("writes the answered steps as real categories and events, then hands off", async () => {
    const onFinish = vi.fn();
    render(
      <CalendarProvider>
        <IntroFlow onFinish={onFinish} />
      </CalendarProvider>,
    );
    const user = userEvent.setup();

    // Every advancing control waits for the stored data to be read first.
    const start = screen.getByRole("button", { name: /let.s go/i });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    // Balance: skipped.
    await user.click(screen.getByRole("button", { name: /skip this/i }));
    // Income: answered.
    await user.type(screen.getByLabelText(/amount each time/i), "2310");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));
    // Bill: skipped, which finishes the flow.
    await user.click(screen.getByRole("button", { name: /skip this/i }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(onFinish).toHaveBeenCalledWith({
      balance: false,
      income: true,
      bill: false,
      eventCount: 1,
    });

    const categories = await getAllCategories();
    const events = await getAllEvents();
    expect(categories).toHaveLength(1);
    expect(events).toHaveLength(1);
    // The event carries the id of the category created a moment before it,
    // not the name the plan knew it by.
    expect(categories[0].name).toBe(INTRO_INCOME_CATEGORY.name);
    expect(events[0].categoryId).toBe(categories[0].id);
    expect(events[0]).toMatchObject({
      amount: 2_310,
      direction: "deposit",
      recurrence: { freq: "weekly", interval: 2, endsOn: null },
    });
  });
});
