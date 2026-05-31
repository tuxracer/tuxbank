import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { resetDbForTests } from "@/lib/storage";
import { CalendarProvider, useCalendar } from "./index";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CalendarProvider>{children}</CalendarProvider>
);

describe("CalendarContext", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("creates a one-off event and exposes it as an occurrence", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.createEvent({
        title: "Dentist",
        date: "2026-05-08",
        categoryId: "health",
        notes: undefined,
        recurrence: null,
      });
      result.current.goToDate(new Date(2026, 4, 1));
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-08"]?.[0]?.title).toBe(
        "Dentist",
      );
    });
  });

  it("deletes one occurrence of a recurring series", async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let id = "";
    await act(async () => {
      result.current.goToDate(new Date(2026, 4, 1));
      await result.current.createEvent({
        title: "Standup",
        date: "2026-05-04",
        categoryId: "work",
        notes: undefined,
        recurrence: { freq: "weekly", interval: 1, endsOn: null },
      });
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    id = result.current.events[0].id;

    await act(async () => {
      await result.current.deleteEvent(id, "this", "2026-05-11");
    });

    await waitFor(() => {
      expect(result.current.occurrencesByDate["2026-05-11"]).toBeUndefined();
      expect(result.current.occurrencesByDate["2026-05-04"]).toBeDefined();
    });
  });
});
