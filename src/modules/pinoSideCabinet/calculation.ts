import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { PortableCommercialPricingPayload, PortableQuoteBomPayload } from "../runtime/portableCommercial";
import { createPinoSideCabinetLayout, normalizePinoSideCabinetParams, type PinoSideCabinetParams } from "./types";

export function calculateBOM(params: PinoSideCabinetParams, _ctx: KitchenContext, _catalog: ClientCatalog): BOMResult {
  const normalized = normalizePinoSideCabinetParams(params);
  const layout = createPinoSideCabinetLayout(normalized);
  const generatedAt = new Date().toISOString();
  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "pino_side_cabinet",
    displayName: layout.definition.moduleLabel,
    generatedAt,
    moduleInstance: {
      quantity: 1,
      widthMm: normalized.width,
      heightMm: normalized.height,
      depthMm: normalized.depth
    },
    systemParameters: {
      definitionId: normalized.definitionId,
      catalogKey: normalized.catalogKey,
      sourcePage: layout.definition.sourcePage,
      productTemplateName: layout.definition.productTemplateName,
      articleFamily: layout.definition.articleFamily,
      variantCode: layout.definition.variantCode,
      catalogPricing: layout.catalogRow
    },
    items: []
  };
  const pricing: PortableCommercialPricingPayload = {
    schemaVersion: "module-commercial-pricing.v1",
    moduleType: "pino_side_cabinet",
    displayName: layout.definition.moduleLabel,
    generatedAt,
    pricingStatus: "incomplete",
    validationErrors: ["PINO/Nobilia side cabinet BOM is a geometry/review prototype; production pricing is not enabled."],
    moduleInstance: quoteBom.moduleInstance,
    items: [],
    groups: {
      boards: { areaM2: 0, pricedAreaM2: 0, cost: 0 },
      edge_bands: { lengthLm: 0, cost: 0 },
      hardware: { pieces: 0, cost: 0 }
    },
    priceInputs: {
      currency: "EUR",
      boardWasteMultiplier: 1,
      laborCostFixed: 0,
      marginPercent: 0
    },
    calculationFormulas: {},
    materialCost: 0,
    laborCostFixed: 0,
    subtotalCost: 0,
    marginPercent: 0,
    marginAmount: 0,
    finalPrice: 0
  };
  return {
    moduleType: "pino_side_cabinet",
    displayName: layout.definition.moduleLabel,
    quoteBom,
    pricing,
    materialsSnapshot: null
  };
}
