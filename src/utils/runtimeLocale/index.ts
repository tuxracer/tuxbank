/**
 * The runtime's default locale: the one every `undefined`-locale Intl
 * formatter in the app resolves to. Rendered Intl text (month names, weekday
 * headers, date labels) carries this as its `lang` attribute, since the
 * document itself stays lang="en" while the app's copy is English, so
 * hyphenation, casing and assistive tech treat that text as the locale it
 * was formatted in rather than as English.
 */
export const RUNTIME_LOCALE: string =
  new Intl.DateTimeFormat().resolvedOptions().locale;
