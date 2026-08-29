import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { PortableCommercialPricingPayload, PortableQuoteBomItem, PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import { normalizeApplianceSubmoduleParams, type ApplianceSubmoduleParams } from "./types";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function calculateApplianceSubmoduleBOM(params: ApplianceSubmoduleParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  void catalog;
  const p = normalizeApplianceSubmoduleParams(params);
  const price = Math.max(0, round(p.priceNet, 2));
  const item: PortableQuoteBomItem = {
    id: `appliance-${p.applianceSubmoduleType}`,
    itemType: "hardware",
    category: "appliance",
    name: `${p.brand} ${p.model}`.trim(),
    description: p.info,
    pricingBasis: "piece",
    pricingUnit: "pcs",
    quantity: 1,
    pricingQuantity: 1,
    materialGroup: "appliance",
    sourcePartIds: [`appliance_submodule_${p.applianceSubmoduleType}`],
    notes: [p.notes, `placementRule=${p.placementRule}`, `powerW=${p.powerW}`].filter(Boolean),
    pricingGroup: "hardware",
    pricingQuantityBase: 1,
    unitPrice: price,
    itemCost: price,
    itemCostFormula: "priceNet"
  };
  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "appliance_submodule",
    displayName: p.displayName,
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: p.width,
      heightMm: p.height,
      depthMm: p.depth,
      wallMounted: false
    },
    systemParameters: {
      applianceSubmoduleType: p.applianceSubmoduleType,
      brand: p.brand,
      model: p.model,
      placementRule: p.placementRule,
      hostOpeningWidthMm: p.hostOpeningWidthMm,
      hostOpeningHeightMm: p.hostOpeningHeightMm,
      hostOpeningDepthMm: p.hostOpeningDepthMm
    },
    materials: {},
    items: [item]
  };
  return {
    moduleType: "appliance_submodule",
    displayName: p.displayName,
    quoteBom,
    pricing: makePricing(quoteBom, item, price),
    materialsSnapshot: null
  };
}

function makePricing(quoteBom: PortableQuoteBomPayload, item: PortableQuoteBomItem, price: number): PortableCommercialPricingPayload {
  return {
    schemaVersion: "module-commercial-pricing.v1",
    moduleType: quoteBom.moduleType,
    displayName: quoteBom.displayName,
    generatedAt: quoteBom.generatedAt,
    pricingStatus: "ok",
    validationErrors: [],
    moduleInstance: quoteBom.moduleInstance,
    materials: quoteBom.materials,
    items: [item],
    groups: {
      boards: { areaM2: 0, pricedAreaM2: 0, cost: 0 },
      edge_bands: { lengthLm: 0, cost: 0 },
      hardware: { pieces: 1, cost: price }
    },
    priceInputs: {
      currency: "EUR",
      boardWasteMultiplier: 1,
      laborCostFixed: 0,
      marginPercent: 0
    },
    calculationFormulas: {
      applianceCost: "priceNet",
      finalPrice: "priceNet"
    },
    aggregates: {
      componentsByCatalogId: [{
        catalogId: `appliance.${String(quoteBom.systemParameters?.applianceSubmoduleType ?? "unknown")}`,
        displayName: item.name,
        componentType: "appliance",
        pieces: 1,
        itemCount: 1
      }]
    },
    materialCost: price,
    laborCostFixed: 0,
    subtotalCost: price,
    marginPercent: 0,
    marginAmount: 0,
    finalPrice: price
  };
}
