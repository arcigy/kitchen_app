import { describe, expect, it } from "vitest";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import { projectMaterialCategoryForBomItem } from "./projectMaterialCategory";

function item(overrides: Partial<PortableQuoteBomItem>): PortableQuoteBomItem {
  return {
    id: "line",
    itemType: "board",
    category: "board",
    name: "Line",
    description: "Line",
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    quantity: 1,
    pricingQuantity: 1,
    ...overrides
  };
}

describe("projectMaterialCategoryForBomItem", () => {
  it("maps board aliases to the same stable Materials categories", () => {
    expect(projectMaterialCategoryForBomItem(item({ materialGroup: "carcass" }))).toBe("corpus");
    expect(projectMaterialCategoryForBomItem(item({ materialGroup: "shelf" }))).toBe("corpus");
    expect(projectMaterialCategoryForBomItem(item({ materialGroup: "drawer_box" }))).toBe("drawer_bottom");
    expect(projectMaterialCategoryForBomItem(item({ materialGroup: "back_panel" }))).toBe("back");
  });

  it("splits front edges from other edges", () => {
    expect(projectMaterialCategoryForBomItem(item({
      itemType: "edge_band",
      pricingBasis: "linear_length",
      pricingUnit: "lm",
      materialGroup: "front"
    }))).toBe("edge_front");
    expect(projectMaterialCategoryForBomItem(item({
      itemType: "edge_band",
      pricingBasis: "linear_length",
      pricingUnit: "lm",
      materialGroup: "body"
    }))).toBe("edge_other");
  });

  it("keeps direct hardware types and folds mounting hardware into fasteners", () => {
    expect(projectMaterialCategoryForBomItem(item({
      itemType: "hardware",
      pricingBasis: "piece",
      pricingUnit: "pcs",
      component: { componentType: "hinge" } as PortableQuoteBomItem["component"]
    }))).toBe("hinge");
    expect(projectMaterialCategoryForBomItem(item({
      itemType: "hardware",
      pricingBasis: "piece",
      pricingUnit: "pcs",
      component: { componentType: "plinth_clip" } as PortableQuoteBomItem["component"]
    }))).toBe("fastener");
  });
});
