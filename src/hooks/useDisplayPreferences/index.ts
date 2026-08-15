import { useSyncExternalStore } from "react";
import type { Day } from "date-fns";
import {
  readDisplayPreferences,
  subscribeToDisplayPreferences,
  writeDisplayPreferences,
} from "@/lib/displayPreferences";
import { WEEK_STARTS_ON } from "@/lib/dateGrid";
import { LOCAL_CURRENCY } from "@/utils/formatCurrency";

/**
 * The stored display preferences plus their resolved values: each override
 * falls back to the locale-derived default when set to automatic (`null`).
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
    setCurrency: (currency: string | null) =>
      writeDisplayPreferences({ currency }),
    setWeekStartsOn: (weekStartsOn: Day | null) =>
      writeDisplayPreferences({ weekStartsOn }),
  };
};
