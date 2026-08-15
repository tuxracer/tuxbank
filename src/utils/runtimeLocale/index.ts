/**
 * The runtime's default locale: the one every `undefined`-locale Intl
 * formatter in the app resolves to. Rendered Intl text (month names, weekday
 * headers, date labels) carries this as its `lang` attribute, since the
 * document itself stays lang="en" while the app's copy is English. Casing is
 * the visible reason: several of these surfaces are CSS-uppercased, and
 * text-transform is locale-sensitive (Turkish i -> İ).
 */
export const RUNTIME_LOCALE: string =
  new Intl.DateTimeFormat().resolvedOptions().locale;
