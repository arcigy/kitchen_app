import {
  convertPriceCurrency,
  EUR_TO_CZK_RATE,
  isPriceCurrency,
  type PriceCurrency
} from "../core/pricing/currency";
import { formatLocalizedCurrency } from "../i18n";

export type PriceDisplayCurrency = PriceCurrency;

export const DEFAULT_PRICE_DISPLAY_CURRENCY: PriceDisplayCurrency = "CZK";
export { EUR_TO_CZK_RATE };
export const PRICE_DISPLAY_CURRENCY_STORAGE_KEY = "arcigy.priceDisplayCurrency";

export function isPriceDisplayCurrency(value: string | null | undefined): value is PriceDisplayCurrency {
  return isPriceCurrency(value);
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
  return convertPriceCurrency(valueEur, "EUR", currency);
}

export function czkToEur(valueCzk: number): number {
  return valueCzk / EUR_TO_CZK_RATE;
}

export function formatDisplayCurrency(valueEur: number, currency: PriceDisplayCurrency): string {
  return formatLocalizedCurrency(eurToDisplayCurrency(valueEur, currency), currency, { maximumFractionDigits: 2 });
}

export function formatCzk(valueCzk: number | null): string {
  if (valueCzk == null) return "unknown";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 2
  }).format(valueCzk);
}
