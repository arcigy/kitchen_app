import { describe, expect, it } from "vitest";
import { createPricingCatalog, withPricingCatalogContext } from "./pricing-catalog";
import { createSystemCatalogSeed } from "./catalog-bootstrap";

describe("pricing calculation context", () => {
  it("shares one index within a calculation and rebuilds after catalogue changes", () => {
    const catalog = createSystemCatalogSeed();
    withPricingCatalogContext(catalog, () => {
      const first = createPricingCatalog(catalog);
      expect(createPricingCatalog(catalog)).toBe(first);
      withPricingCatalogContext(catalog, () => expect(createPricingCatalog(catalog)).toBe(first));
    });
    const material = { ...catalog.materials[0]!, id: "new-material" };
    catalog.materials = [...catalog.materials, material];
    withPricingCatalogContext(catalog, () => expect(createPricingCatalog(catalog).getMaterialDefinitionById(material.id)).toBe(material));
  });
  it("discards the index after failure and never shares between projects", () => {
    const first = createSystemCatalogSeed(), second = structuredClone(first);
    const id = first.materials[0]!.id;
    first.priceList.prices[id] = 17; second.priceList.prices[id] = 42;
    expect(() => withPricingCatalogContext(first, () => { throw new Error("calculation failed"); })).toThrow();
    withPricingCatalogContext(first, () => withPricingCatalogContext(second, () => {
      expect(createPricingCatalog(first).getUnitPriceForCatalogId(id)).toBe(17);
      expect(createPricingCatalog(second).getUnitPriceForCatalogId(id)).toBe(42);
      expect(createPricingCatalog(first)).not.toBe(createPricingCatalog(second));
    }));
  });
});
