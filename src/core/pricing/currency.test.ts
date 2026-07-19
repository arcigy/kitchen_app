import { describe, expect, it } from "vitest";

import {
  EUR_TO_CZK_RATE,
  convertPriceCurrency,
  isPriceCurrency,
  priceCurrencyLocale,
} from "./currency";

describe("client price currency", () => {
  it("converts between the supported client currencies without changing same-currency values", () => {
    expect(convertPriceCurrency(10, "EUR", "CZK")).toBeCloseTo(10 * EUR_TO_CZK_RATE);
    expect(convertPriceCurrency(10 * EUR_TO_CZK_RATE, "CZK", "EUR")).toBeCloseTo(10);
    expect(convertPriceCurrency(123.45, "CZK", "CZK")).toBe(123.45);
  });

  it("recognizes supported profile values and their locales", () => {
    expect(isPriceCurrency("EUR")).toBe(true);
    expect(isPriceCurrency("CZK")).toBe(true);
    expect(isPriceCurrency("USD")).toBe(false);
    expect(priceCurrencyLocale("EUR")).toBe("sk-SK");
    expect(priceCurrencyLocale("CZK")).toBe("cs-CZ");
  });
});
