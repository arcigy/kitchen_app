import type { AppLocale } from "../i18n";

/** Locale-safe, deterministic copy used when no model response is available. */
export function assistantCopy(locale: AppLocale | undefined, sk: string, cs: string, en: string): string {
  return locale === "cs-CZ" ? cs : locale === "en-GB" ? en : sk;
}

export function assistantCount(locale: AppLocale | undefined, count: number, sk: string, cs: string, en: string): string {
  return assistantCopy(locale, `${sk} ${count}`, `${cs} ${count}`, `${en} ${count}`);
}
