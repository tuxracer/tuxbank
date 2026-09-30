import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { useDisplayPreferences } from "@/hooks/useDisplayPreferences";
import { isWeekCount, isWeekStartDay } from "@/lib/displayPreferences";
import { WEEK_STARTS_ON } from "@/lib/dateGrid";
import { trackEvent } from "@/lib/analytics";
import { LOCAL_CURRENCY } from "@/utils/formatCurrency";
import { RUNTIME_LOCALE } from "@/utils/runtimeLocale";
import { weekdayLabel } from "@/utils/weekdayLabel";

/** The seven date-fns day indexes, Sunday-first, for the week-start options. */
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** The fixed week counts the calendar can show in place of the whole month. */
const WEEK_COUNTS = [1, 2, 3, 4, 5, 6] as const;

const weekCountLabels = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "week",
  unitDisplay: "long",
});

const currencyNames = new Intl.DisplayNames(undefined, { type: "currency" });

/** Every currency the engine can format, labeled "USD · US Dollar". */
const CURRENCY_OPTIONS = Intl.supportedValuesOf("currency").map((code) => ({
  code,
  label: `${code} · ${currencyNames.of(code) ?? code}`,
}));

/**
 * The Display pane of the settings dialog: overrides for the currency amounts
 * are labeled with, the weekday the grid starts on, and how many weeks the
 * grid shows at once. All default to "automatic": the first two follow the
 * browser's locale, and the third shows the whole month.
 */
const DisplaySettings = () => {
  const { preferences, setCurrency, setWeekStartsOn, setWeeksVisible } =
    useDisplayPreferences();

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <Label htmlFor="display-currency" className="cy-label">
          Currency
        </Label>
        <p className="text-xs text-[color:var(--cy-muted)]">
          Amounts and balances are labeled with this currency. Automatic follows
          the browser locale. No conversion is applied.
        </p>
        <NativeSelect
          id="display-currency"
          className="cy-btn text-xs"
          lang={RUNTIME_LOCALE}
          value={preferences.currency ?? ""}
          onChange={(e) => {
            const currency = e.target.value === "" ? null : e.target.value;
            setCurrency(currency);
            trackEvent("display-changed", {
              setting: "currency",
              automatic: currency === null,
            });
          }}
        >
          <option value="">Automatic ({LOCAL_CURRENCY})</option>
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </section>

      <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
        <Label htmlFor="display-week-start" className="cy-label">
          Week starts on
        </Label>
        <p className="text-xs text-[color:var(--cy-muted)]">
          The weekday the calendar columns begin with. Automatic follows the
          browser locale.
        </p>
        <NativeSelect
          id="display-week-start"
          className="cy-btn text-xs"
          lang={RUNTIME_LOCALE}
          value={
            preferences.weekStartsOn === null ? "" : preferences.weekStartsOn
          }
          onChange={(e) => {
            const parsed =
              e.target.value === "" ? null : Number(e.target.value);
            const weekStartsOn = isWeekStartDay(parsed) ? parsed : null;
            setWeekStartsOn(weekStartsOn);
            trackEvent("display-changed", {
              setting: "week-start",
              automatic: weekStartsOn === null,
            });
          }}
        >
          <option value="">
            Automatic ({weekdayLabel(WEEK_STARTS_ON, "long")})
          </option>
          {WEEK_DAYS.map((day) => (
            <option key={day} value={day}>
              {weekdayLabel(day, "long")}
            </option>
          ))}
        </NativeSelect>
      </section>

      <section className="flex flex-col gap-2 border-t border-[color:var(--cy-line)] pt-3">
        <Label htmlFor="display-weeks-visible" className="cy-label">
          Weeks shown
        </Label>
        <p className="text-xs text-[color:var(--cy-muted)]">
          How many weeks the calendar shows at once. Automatic shows the whole
          month. With a set number, the arrows move by that many weeks.
        </p>
        <NativeSelect
          id="display-weeks-visible"
          className="cy-btn text-xs"
          lang={RUNTIME_LOCALE}
          value={preferences.weeksVisible ?? ""}
          onChange={(e) => {
            const parsed =
              e.target.value === "" ? null : Number(e.target.value);
            const weeksVisible = isWeekCount(parsed) ? parsed : null;
            setWeeksVisible(weeksVisible);
            trackEvent("display-changed", {
              setting: "weeks-visible",
              automatic: weeksVisible === null,
            });
          }}
        >
          <option value="">Automatic (full month)</option>
          {WEEK_COUNTS.map((count) => (
            <option key={count} value={count}>
              {weekCountLabels.format(count)}
            </option>
          ))}
        </NativeSelect>
      </section>
    </div>
  );
};

export default DisplaySettings;
