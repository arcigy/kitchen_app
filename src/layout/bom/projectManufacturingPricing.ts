import type { ClientCatalog } from "../../core/catalog/catalog-types";
import {
  normalizeProjectManufacturingSettings,
  resolvePreassemblyRate,
  type ProjectManufacturingSettings
} from "../../core/project-manufacturing/project-manufacturing-types";
import { calculateCommercialPricingFromQuoteBom, type PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import type { BOMResult } from "./bomTypes";

export type ProjectManufacturingPricingInput = {
  instanceId: string;
  kind: "module" | "worktop" | "customFurniture" | "ledStrip";
  result: BOMResult;
  catalog: ClientCatalog;
  settings?: ProjectManufacturingSettings | unknown;
  presetId?: string;
};

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function catalogId(item: PortableQuoteBomItem): string | null {
  return item.material?.catalogId ?? item.catalogRef?.catalogId ?? item.pricingLookup?.sourceCatalogId ?? null;
}

function netQuantity(item: PortableQuoteBomItem): number {
  if (item.itemType === "board") return item.metrics?.areaM2 ?? item.pricingQuantityBase ?? item.pricingQuantity;
  if (item.itemType === "edge_band") return item.metrics?.edgeLengthLm ?? item.pricingQuantityBase ?? item.pricingQuantity;
  return item.pricingQuantityBase ?? item.pricingQuantity;
}

function wastePercent(settings: ProjectManufacturingSettings, item: PortableQuoteBomItem): number | null {
  const id = catalogId(item);
  if (item.itemType === "board") return id && settings.boardWasteByMaterialId[id] !== undefined
    ? settings.boardWasteByMaterialId[id]!
    : settings.boardWastePercent;
  if (item.itemType === "edge_band") return id && settings.edgeWasteByMaterialId[id] !== undefined
    ? settings.edgeWasteByMaterialId[id]!
    : settings.edgeWastePercent;
  return 0;
}

function pricedItems(settings: ProjectManufacturingSettings, items: PortableQuoteBomItem[]) {
  return items.map((item) => {
    const next = structuredClone(item);
    if (settings.pricingMode !== "configured" || (next.itemType !== "board" && next.itemType !== "edge_band")) return next;
    const net = netQuantity(next);
    const percent = wastePercent(settings, next);
    next.pricingQuantityBase = round(net);
    if (percent === null) {
      next.pricingQuantity = round(net);
      next.validationErrors = [...(next.validationErrors ?? []), `Item ${next.id} is missing ${next.itemType === "board" ? "board" : "edge"} waste percentage.`];
      return next;
    }
    next.pricingQuantity = round(net * (1 + percent / 100));
    next.metrics = {
      ...next.metrics,
      ...(next.itemType === "board" ? { wasteMultiplier: round(1 + percent / 100) } : {})
    };
    next.notes = [...(next.notes ?? []), `Net quantity: ${round(net)}`, `Manufacturing waste: ${round(percent, 2)} %`];
    return next;
  });
}

/**
 * Applies project manufacturing inputs once, immediately before commercial pricing.
 * Raw quote BOM quantities remain the clean production demand in pricingQuantityBase.
 */
export function applyProjectManufacturingPricing(input: ProjectManufacturingPricingInput): BOMResult {
  const settings = normalizeProjectManufacturingSettings(input.settings);
  if (settings.pricingMode === "legacy") return input.result;
  const quoteBom = structuredClone(input.result.quoteBom);
  quoteBom.items = pricedItems(settings, quoteBom.items);

  const preassembly = input.kind === "module"
    ? resolvePreassemblyRate(settings, input.instanceId, quoteBom.moduleType, input.presetId)
    : { source: "legacy" as const, amount: 0 };
  const missingPreassembly = input.kind === "module" && preassembly.amount === null;
  const pricing = calculateCommercialPricingFromQuoteBom({
    quoteBom,
    catalog: input.catalog,
    boardWasteMultiplier: 1,
    laborCostFixed: preassembly.amount ?? 0,
    preassembly
  });
  if (missingPreassembly) {
    pricing.validationErrors = [...pricing.validationErrors, `Module ${input.instanceId} is missing an explicit preassembly rate.`];
    pricing.pricingStatus = "incomplete";
  }
  return { ...input.result, quoteBom, pricing };
}
