import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { createMaterialCatalog } from "../../core/catalog/material-catalog";
import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import { validateClientCatalog } from "../../core/catalog/catalog-validation";
import { demosCatalogData, isDemosCatalogGenerated } from "./demosCatalog";

describe("Démos SK system catalog", () => {
  it("loads generated Démos catalog data as the system seed", () => {
    expect(isDemosCatalogGenerated()).toBe(true);
    const seed = createSystemCatalogSeed();

    expect(seed.materials.length).toBeGreaterThanOrEqual(6497);
    expect(seed.components.length).toBeGreaterThanOrEqual(33521);
    expect(seed.materials.some((material) => material.id.startsWith("mat.demos."))).toBe(true);
    expect(seed.components.some((component) => component.id.startsWith("cmp.demos."))).toBe(true);
    expect(seed.components.some((component) => component.id === "cmp.leg.adjustable.100.black" && component.componentType === "leg")).toBe(true);
    expect(seed.components.some((component) => component.id === "cmp.clip.plinth.standard" && component.componentType === "plinth_clip")).toBe(true);
    expect(seed.priceList.name).toContain("Démos SK");
  });

  it("splits boards and components into usable catalog groups", () => {
    const seed = createSystemCatalogSeed();
    const activeBoards = seed.materials.filter((material) => material.isActive);
    const activeComponents = seed.components.filter((component) => component.isActive);

    expect(activeBoards.some((material) => material.category === "Démos dosky: korpusové dosky")).toBe(true);
    expect(activeBoards.some((material) => material.category === "Démos dosky: chrbty MDF/HDF")).toBe(true);
    expect(activeBoards.some((material) => material.boardFamily === "worktop")).toBe(true);
    expect(activeComponents.some((component) => component.tags.includes("Démos komponenty: kľučky a úchytky"))).toBe(true);
    expect(activeComponents.some((component) => component.componentType === "handle")).toBe(true);
    expect(activeComponents.some((component) => component.componentType === "leg")).toBe(true);
    expect(activeComponents.some((component) => component.componentType === "hinge")).toBe(true);
    expect(activeComponents.some((component) => component.componentType === "runner")).toBe(true);
    expect(seed.components.some((component) => !component.isActive && component.tags.includes("demos-unused"))).toBe(true);
  });

  it("supports fetch by Démos catalog ID and validates defaults", () => {
    const seed = createSystemCatalogSeed();
    const catalog = validateClientCatalog({ clientId: "test-client", ...seed });
    const materialCatalog = createMaterialCatalog(catalog);
    const pricingCatalog = createPricingCatalog(catalog);

    const material = seed.materials.find((item) => item.isActive && item.boardFamily === "body");
    const component = seed.components.find((item) => item.isActive && item.componentType === "handle");
    expect(material).toBeTruthy();
    expect(component).toBeTruthy();

    expect(materialCatalog.getMaterialDefinitionById(material!.id)?.supplierSource?.supplier).toBe("demos-sk");
    expect(pricingCatalog.getComponentDefinitionById(component!.id)?.supplierSource?.supplier).toBe("demos-sk");
    expect(pricingCatalog.getUnitPriceForCatalogId(material!.id)).toBeGreaterThan(0);
    expect(pricingCatalog.getUnitPriceForCatalogId(component!.id)).toBeGreaterThan(0);
    expect(seed.materials.some((item) => item.id === seed.kitchenDefaults.backPanelMaterialId)).toBe(true);
    expect(seed.components.some((item) => item.id === seed.kitchenDefaults.defaultDrawerSystemComponentId)).toBe(true);
  });

  it("keeps Démos grouping summary available for catalog UI/reporting", () => {
    expect(demosCatalogData.summary.materials["Démos dosky: chrbty MDF/HDF"]).toBeGreaterThan(0);
    expect(demosCatalogData.summary.components["Démos komponenty: kľučky a úchytky"]).toBeGreaterThan(0);
    expect(demosCatalogData.summary.components["Démos komponenty: ostatné nepoužívané"]).toBeGreaterThan(0);
  });

  it("keeps Demos board colors neutral until image sampling supplies the preview color", () => {
    const seed = createSystemCatalogSeed();
    const byId = new Map(seed.materials.map((material) => [material.id, material]));

    expect(byId.get("mat.demos.495386")?.color).toBe("Beech");
    expect(byId.get("mat.demos.495386")?.preview.colorHex).toBe("#a8835a");
    expect(byId.get("mat.demos.495009")?.color).toBe("Green");
    expect(byId.get("mat.demos.495009")?.preview.colorHex).toBe("#a8835a");
    expect(byId.get("mat.demos.495008")?.color).toBe("Blue");
    expect(byId.get("mat.demos.495008")?.preview.colorHex).toBe("#a8835a");
    expect(byId.get("mat.demos.495388")?.color).toBe("Walnut");
    expect(byId.get("mat.demos.495017")?.color).toBe("Anthracite");
  });
});
