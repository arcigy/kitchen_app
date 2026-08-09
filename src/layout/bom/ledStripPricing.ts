import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import { calculateCommercialPricingFromQuoteBom, type PortableComponentRef, type PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import type { LedStripGroup } from "../ledStripTypes";
import { ledStripGroupAreaM2, ledStripGroupLengthMm } from "../ledStripTypes";
import type { BOMResult } from "./bomTypes";

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function createLedStripQuoteBom(group: LedStripGroup, catalog: ClientCatalog): PortableQuoteBomPayload {
  const component = group.params.lightingComponentId
    ? createPricingCatalog(catalog).getComponentDefinitionById(group.params.lightingComponentId)
    : null;
  const areaM2 = ledStripGroupAreaM2(group);
  const profileWidthMm = group.params.profileWidthMm;
  const validationErrors: string[] = [];
  if (!component) validationErrors.push("LED pĂˇsik nemĂˇ priradenĂ˝ lighting komponent.");
  if (areaM2 == null || profileWidthMm == null) validationErrors.push("LED pĂˇsik nemĂˇ platnĂş ĹˇĂ­rku profilu pre vĂ˝poÄŤet m2.");
  if (component && component.componentType !== "lighting") validationErrors.push("PriradenĂ˝ komponent nie je typu lighting.");
  const componentRef = component ? { ...component, catalogId: component.id } satisfies PortableComponentRef : null;
  const lengthMm = ledStripGroupLengthMm(group);
  const quantity = areaM2 ?? 0;

  return {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "led_strip",
    displayName: group.params.name,
    generatedAt: new Date().toISOString(),
    moduleInstance: { quantity: 1, widthMm: Math.round(lengthMm), heightMm: 0, depthMm: Math.round(profileWidthMm ?? 0) },
    items: [{
      id: `led-strip-${group.id}`,
      itemType: "lighting",
      category: "lighting",
      name: group.params.name,
      description: "LED pĂˇsik",
      pricingBasis: "sheet_area",
      pricingUnit: "m2",
      quantity: 1,
      pricingQuantity: round(quantity),
      pricingQuantityBase: round(quantity),
      dimensionsMm: { length: Math.round(lengthMm), width: Math.round(profileWidthMm ?? 0), thickness: 0 },
      metrics: { areaM2: round(quantity), billableAreaM2: round(quantity), wasteMultiplier: 1 },
      component: componentRef,
      catalogRef: componentRef ? { entityType: "component", catalogId: componentRef.catalogId, displayName: componentRef.displayName, pricingBasis: "sheet_area", pricingUnit: "m2" } : null,
      pricingLookup: componentRef ? { key: componentRef.catalogId, sourceCatalogId: componentRef.catalogId, sourceEntityType: "component", resolution: "catalog_id" } : null,
      sourcePartIds: [group.id],
      notes: [`DÄşĹľka strednice: ${round(lengthMm / 1000)} m`, `Ĺ Ă­rka profilu: ${profileWidthMm ?? "?"} mm`, `Plocha: ${round(quantity)} m2`],
      validationErrors,
      variantKey: `led-group:${group.id}`,
      variantLabel: group.params.name,
      pricingGroup: "hardware"
    }]
  };
}

export function createLedStripBOM(group: LedStripGroup, catalog: ClientCatalog): BOMResult {
  const quoteBom = createLedStripQuoteBom(group, catalog);
  return {
    moduleType: quoteBom.moduleType,
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({ quoteBom, catalog, boardWasteMultiplier: 1, laborCostFixed: 0 }),
    materialsSnapshot: null
  };
}
