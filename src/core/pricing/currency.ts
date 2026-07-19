export type PriceCurrency = "EUR" | "CZK";

export const EUR_TO_CZK_RATE = 24.193;

export function isPriceCurrency(value: unknown): value is PriceCurrency {
  return value === "EUR" || value === "CZK";
}

export function convertPriceCurrency(
  value: number,
  sourceCurrency: PriceCurrency,
  targetCurrency: PriceCurrency
): number {
  if (sourceCurrency === targetCurrency) return value;
  return sourceCurrency === "EUR"
    ? value * EUR_TO_CZK_RATE
    : value / EUR_TO_CZK_RATE;
}

export function priceCurrencyLocale(currency: PriceCurrency): "cs-CZ" | "sk-SK" {
  return currency === "CZK" ? "cs-CZ" : "sk-SK";
}
