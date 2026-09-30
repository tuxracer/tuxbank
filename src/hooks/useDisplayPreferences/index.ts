import { useSyncExternalStore } from "react";
import type { Day } from "date-fns";
import {
  readDisplayPreferences,
  subscribeToDisplayPreferences,
  writeDisplayPreferences,
  type WeekCount,
} from "@/lib/displayPreferences";
import { WEEK_STARTS_ON } from "@/lib/dateGrid";
import { LOCAL_CURRENCY } from "@/utils/formatCurrency";

/**
 * The stored display preferences plus their resolved values: the currency and
 * week start fall back to the locale-derived default when set to automatic
 * (`null`). `weeksVisible` has nothing to resolve: its `null` is the month
 * view, whose row count depends on the month on screen.
 * Every consumer subscribes itself, so changing a preference in the settings
 * pane re-renders the calendar live.
 */
export const useDisplayPreferences = () => {
  const preferences = useSyncExternalStore(
    subscribeToDisplayPreferences,
    readDisplayPreferences,
  );
  return {
    preferences,
    currency: preferences.currency ?? LOCAL_CURRENCY,
    weekStartsOn: preferences.weekStartsOn ?? WEEK_STARTS_ON,
    weeksVisible: preferences.weeksVisible,
    setCurrency: (currency: string | null) =>
      writeDisplayPreferences({ currency }),
    setWeekStartsOn: (weekStartsOn: Day | null) =>
      writeDisplayPreferences({ weekStartsOn }),
    setWeeksVisible: (weeksVisible: WeekCount | null) =>
      writeDisplayPreferences({ weeksVisible }),
  };
};
