import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LandingPage, { buildPreviewMonth } from "./index";
import { LANDING_PREVIEW_CARRY_IN } from "./consts";

describe("LandingPage", () => {
  it("enters the app when Try Now is clicked", async () => {
    const onTryNow = vi.fn();
    render(<LandingPage onTryNow={onTryNow} />);

    await userEvent.click(screen.getByRole("button", { name: /try now/i }));
    expect(onTryNow).toHaveBeenCalledTimes(1);
  });
});

describe("buildPreviewMonth", () => {
  const balanceOn = (
    month: ReturnType<typeof buildPreviewMonth>,
    iso: string,
  ) => month.days.find((day) => day.iso === iso)?.balance;

  it("lays the preview month out from the given week start", () => {
    const sunday = buildPreviewMonth(0);
    const monday = buildPreviewMonth(1);

    // March 1 2026 is a Sunday, so a Monday-start grid opens on the six days
    // of February that finish the week the 1st ends, and spills into a sixth.
    expect(sunday.days[0].iso).toBe("2026-03-01");
    expect(sunday.rows).toBe(5);
    expect(monday.days[0].iso).toBe("2026-02-23");
    expect(monday.rows).toBe(6);

    // Those leading days are outside the month, so nothing is spent on them
    // and the balance holds at the carry-in until rent lands on the 1st.
    expect(monday.days[0].balance).toBe(LANDING_PREVIEW_CARRY_IN);
    expect(balanceOn(monday, "2026-03-01")).toBe(
      balanceOn(sunday, "2026-03-01"),
    );
    expect(monday.totals).toEqual(sunday.totals);
  });
});
