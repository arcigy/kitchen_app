import { describe, expect, it } from "vitest";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { LedStripGroup } from "../ledStripTypes";
import { createLedStripBOM } from "./ledStripPricing";

const catalog = (): ClientCatalog => ({
  materials: [], hardware: [], componentGeometry: [], modules: [], kitchenDefaults: {},
  components: [{
    id: "led-profile", entityType: "component", componentType: "lighting", geometryId: "led-profile-geometry",
    name: "LED", displayName: "LED profil", brand: "Test", series: "LED", variant: "10 mm", color: "white",
    pricingBasis: "sheet_area", pricingUnit: "m2", defaultQuantity: 1, isActive: true, tags: [], preview: { colorHex: "#ffffff", roughness: 0.5, metalness: 0 }
  }],
  priceList: { id: "prices", name: "Test", currency: "EUR", isActive: true, prices: { "led-profile": 100 } },
  clientId: "test", meta: { schemaVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
} as unknown as ClientCatalog);

const group = (componentId: string | null = "led-profile"): LedStripGroup => ({
  id: "led1",
  params: { name: "LED pĂˇsik 1", mode: "custom", heightMm: 900, offsetMm: 0, lightingComponentId: componentId, profileWidthMm: 10 },
  runs: [{ id: "led1-run1", points: [{ x: 0, y: 900, z: 0 }, { x: 1500, y: 900, z: 0 }] }]
});

describe("LED strip commercial BOM", () => {
  it("keeps LED material scoped per group and prices literal centreline area in m2", () => {
    const result = createLedStripBOM(group(), catalog());
    const item = result.quoteBom.items[0]!;
    expect(item.variantKey).toBe("led-group:led1");
    expect(item.itemType).toBe("lighting");
    expect(item.pricingQuantity).toBe(0.015);
    expect(result.pricing.pricingStatus).toBe("ok");
    expect(result.pricing.finalPrice).toBe(1.5);
  });

  it("makes a missing profile assignment visibly incomplete instead of silently free", () => {
    const result = createLedStripBOM(group(null), catalog());
    expect(result.pricing.pricingStatus).toBe("incomplete");
    expect(result.pricing.validationErrors.join(" ")).toContain("missing pricing lookup");
  });
});
