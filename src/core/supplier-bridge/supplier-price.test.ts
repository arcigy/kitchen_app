import { describe, expect, it } from "vitest";
import {
  parseLocalizedSupplierAmount,
  parseSupplierPrice,
  parseSupplierPriceBasis,
  parseSupplierVatMode
} from "./supplier-price";

describe("supplier price normalization", () => {
  it("parses localized prices, units and VAT modes", () => {
    expect(parseLocalizedSupplierAmount("1 234,56 €")).toBe(1234.56);
    expect(parseLocalizedSupplierAmount("1,234.56 USD")).toBe(1234.56);
    expect(parseSupplierPriceBasis("EUR / m²")).toBe("m2");
    expect(parseSupplierPriceBasis("cena za balenie")).toBe("package");
    expect(parseSupplierVatMode("23,40 € bez DPH")).toBe("excluded");
    expect(parseSupplierVatMode("28,08 € s DPH")).toBe("included");
    expect(parseSupplierVatMode("23,40 €")).toBe("unknown");
  });

  it("converts a sheet price to m2 only when both dimensions are known", () => {
    const normalized = parseSupplierPrice({
      rawPriceText: "60,00 € bez DPH",
      rawUnitText: "za dosku",
      widthMm: 2_000,
      lengthMm: 3_000,
      observedAt: "2026-07-10T08:00:00.000Z"
    });
    expect(normalized).toMatchObject({
      amount: 60,
      priceBasis: "sheet",
      vatMode: "excluded",
      normalizedAmount: 10,
      normalizedPriceBasis: "m2",
      normalizationConfidence: 0.98
    });
    expect(normalized.normalizationCalculation).toContain("2000 * 3000");

    const withoutDimensions = parseSupplierPrice({ rawPriceText: "60 €", rawUnitText: "sheet" });
    expect(withoutDimensions).toMatchObject({ normalizedAmount: 60, normalizedPriceBasis: "sheet" });
  });
});
