export type PriceDisplayCurrency = "CZK" | "EUR";

export const DEFAULT_PRICE_DISPLAY_CURRENCY: PriceDisplayCurrency = "CZK";
export const EUR_TO_CZK_RATE = 24.193;
export const PRICE_DISPLAY_CURRENCY_STORAGE_KEY = "arcigy.priceDisplayCurrency";

export function isPriceDisplayCurrency(value: string | null | undefined): value is PriceDisplayCurrency {
  return value === "CZK" || value === "EUR";
}

export function readPriceDisplayCurrency(): PriceDisplayCurrency {
  try {
    const stored = window.localStorage.getItem(PRICE_DISPLAY_CURRENCY_STORAGE_KEY);
    return isPriceDisplayCurrency(stored) ? stored : DEFAULT_PRICE_DISPLAY_CURRENCY;
  } catch {
    return DEFAULT_PRICE_DISPLAY_CURRENCY;
  }
}

export function writePriceDisplayCurrency(currency: PriceDisplayCurrency) {
  try {
    window.localStorage.setItem(PRICE_DISPLAY_CURRENCY_STORAGE_KEY, currency);
  } catch {
    // ignore storage failures
  }
}

export function eurToDisplayCurrency(valueEur: number, currency: PriceDisplayCurrency): number {
  return currency === "CZK" ? valueEur * EUR_TO_CZK_RATE : valueEur;
}

export function czkToEur(valueCzk: number): number {
  return valueCzk / EUR_TO_CZK_RATE;
}

export function formatDisplayCurrency(valueEur: number, currency: PriceDisplayCurrency): string {
  return new Intl.NumberFormat(currency === "CZK" ? "cs-CZ" : "sk-SK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(eurToDisplayCurrency(valueEur, currency));
}

export function formatCzk(valueCzk: number | null): string {
  if (valueCzk == null) return "unknown";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 2
  }).format(valueCzk);
}
