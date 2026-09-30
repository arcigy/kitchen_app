import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { createDefaultProjectManufacturingSettings } from "../../core/project-manufacturing/project-manufacturing-types";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { calculateCommercialPricingFromQuoteBom, type PortableMaterialRef, type PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import type { BOMResult } from "./bomTypes";
import { applyProjectManufacturingPricing } from "./projectManufacturingPricing";

const catalog: ClientCatalog = { clientId: "manufacturing-test", ...createSystemCatalogSeed() };
const boardDefinition = catalog.materials.find((item) => item.materialType === "board")!;
const edgeDefinition = catalog.materials.find((item) => item.materialType === "edge") ?? boardDefinition;

function material(definition: typeof boardDefinition): PortableMaterialRef {
  return { ...definition, catalogId: definition.id, key: definition.id, family: definition.boardFamily ?? definition.edgeFamily, assignmentSource: "catalog" };
}

function result(): BOMResult {
  const board = material(boardDefinition);
  const edge = material(edgeDefinition);
  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "base_cabinet",
    displayName: "Test cabinet",
    generatedAt: "2026-09-18T00:00:00.000Z",
    moduleInstance: { quantity: 1, widthMm: 1000, heightMm: 720, depthMm: 560 },
    items: [
      {
        id: "board", itemType: "board", category: "carcass", name: "Board", description: "Board", pricingBasis: "sheet_area", pricingUnit: "m2",
        quantity: 1, pricingQuantity: 1.1, pricingQuantityBase: 1, dimensionsMm: { length: 1000, width: 1000, thickness: 18 },
        metrics: { areaM2: 1, billableAreaM2: 1.1, wasteMultiplier: 1.1 }, material: board, catalogRef: { entityType: "material", catalogId: board.catalogId }, pricingLookup: { sourceCatalogId: board.catalogId }, pricingGroup: "boards"
      },
      {
        id: "edge", itemType: "edge_band", category: "edge_band", name: "Edge", description: "Edge", pricingBasis: "linear_length", pricingUnit: "lm",
        quantity: 1, pricingQuantity: 2, pricingQuantityBase: 2, metrics: { edgeLengthLm: 2 }, material: edge, catalogRef: { entityType: "material", catalogId: edge.catalogId }, pricingLookup: { sourceCatalogId: edge.catalogId }, pricingGroup: "edge_bands"
      }
    ]
  };
  return {
    moduleType: quoteBom.moduleType,
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({ quoteBom, catalog, boardWasteMultiplier: 1, laborCostFixed: 48 }),
    materialsSnapshot: null
  };
}

describe("project manufacturing pricing", () => {
  it("keeps net demand and applies board and edge waste once before pricing", () => {
    const settings = createDefaultProjectManufacturingSettings();
    settings.pricingMode = "configured";
    settings.boardWastePercent = 12;
    settings.edgeWastePercent = 5;
    settings.preassemblyByModuleType.base_cabinet = 20;
    const next = applyProjectManufacturingPricing({ instanceId: "cabinet-1", kind: "module", result: result(), catalog, settings });

    expect(next.quoteBom.items[0]).toMatchObject({ pricingQuantityBase: 1, pricingQuantity: 1.12, metrics: { areaM2: 1 } });
    expect(next.quoteBom.items[1]).toMatchObject({ pricingQuantityBase: 2, pricingQuantity: 2.1, metrics: { edgeLengthLm: 2 } });
    expect(next.pricing.preassembly).toEqual({ source: "module", amount: 20 });
    expect(next.pricing.laborCostFixed).toBe(20);
  });

  it("uses the cabinet rate first and accepts explicit zero", () => {
    const settings = createDefaultProjectManufacturingSettings();
    settings.pricingMode = "configured";
    settings.boardWastePercent = 0;
    settings.edgeWastePercent = 0;
    settings.preassemblyByModuleType.base_cabinet = 20;
    settings.preassemblyByPreset.presetA = 10;
    settings.preassemblyByInstanceId["cabinet-1"] = 0;
    const next = applyProjectManufacturingPricing({ instanceId: "cabinet-1", kind: "module", result: result(), catalog, settings, presetId: "presetA" });

    expect(next.pricing.preassembly).toEqual({ source: "instance", amount: 0 });
    expect(next.pricing.laborCostFixed).toBe(0);
    expect(next.pricing.pricingStatus).toBe("ok");
  });

  it("marks missing configured rates as incomplete instead of inventing a price", () => {
    const settings = createDefaultProjectManufacturingSettings();
    settings.pricingMode = "configured";
    const next = applyProjectManufacturingPricing({ instanceId: "cabinet-1", kind: "module", result: result(), catalog, settings });

    expect(next.pricing.pricingStatus).toBe("incomplete");
    expect(next.pricing.validationErrors.join(" ")).toMatch(/waste percentage|preassembly rate/);
  });

  it("uses the half-stock worktop format without applying percentage waste a second time", () => {
    const worktop = material({
      ...boardDefinition,
      id: "test.worktop.half-format",
      pricingUnit: "m2",
      pricingBasis: "sheet_area",
      metadata: { supplierLengthMm: 4100, supplierWidthMm: 635, worktopPurchaseIncrement: 0.5 }
    });
    const worktopCatalog = structuredClone(catalog);
    worktopCatalog.materials.push(worktop);
    worktopCatalog.priceList.prices[worktop.catalogId] = 100;
    const quoteBom: PortableQuoteBomPayload = {
      schemaVersion: "module-quote-bom.v1",
      moduleType: "worktop_test",
      displayName: "Half-format worktop",
      generatedAt: "2026-09-29T00:00:00.000Z",
      moduleInstance: { quantity: 1, widthMm: 1850, heightMm: 38, depthMm: 600 },
      items: [{
        id: "worktop",
        itemType: "board",
        category: "worktop",
        materialGroup: "worktop",
        name: "Worktop",
        description: "One 1850 mm cut",
        pricingBasis: "sheet_area",
        pricingUnit: "m2",
        quantity: 1,
        pricingQuantity: 1.11,
        pricingQuantityBase: 1.11,
        dimensionsMm: { length: 1850, width: 600, thickness: 38 },
        worktopCutsMm: [{ length: 1850, width: 600 }],
        metrics: { areaM2: 1.11 },
        material: worktop,
        catalogRef: { entityType: "material", catalogId: worktop.catalogId },
        pricingLookup: { sourceCatalogId: worktop.catalogId }
      }]
    };
    const source: BOMResult = {
      moduleType: quoteBom.moduleType,
      displayName: quoteBom.displayName,
      quoteBom,
      pricing: calculateCommercialPricingFromQuoteBom({ quoteBom, catalog: worktopCatalog, boardWasteMultiplier: 1, laborCostFixed: 0 }),
      materialsSnapshot: null
    };
    const settings = createDefaultProjectManufacturingSettings();
    settings.pricingMode = "configured";
    settings.boardWastePercent = 30;

    const next = applyProjectManufacturingPricing({ instanceId: "worktop-1", kind: "worktop", result: source, catalog: worktopCatalog, settings });
    const priced = next.pricing.items[0]!;
    expect(priced.purchasedStockPieces).toBe(0.5);
    expect(priced.pricingQuantity).toBeCloseTo(1.30175, 6);
    expect(priced.itemCost).toBeCloseTo(130.17, 2);
    expect(priced.metrics?.wasteMultiplier).toBeUndefined();
    expect(priced.notes?.some((note) => note.includes("Manufacturing waste"))).toBe(false);
  });
});


describe("report 50 per-cabinet rates independent of waste", () => {
  it("charges three cabinets once and preserves every legacy material line", () => {
    const original = result(); original.quoteBom.moduleInstance.quantity = 3;
    const moduleLabor = { schemaVersion: 1, inherited: { source: "preset", rate: { amount: 200, currency: original.pricing.priceInputs.currency } } };
    const next = applyProjectManufacturingPricing({ instanceId: "cabinet", kind: "module", result: original, catalog, settings: createDefaultProjectManufacturingSettings(), moduleLabor });
    expect(next.pricing.laborCostFixed).toBe(600);
    expect(next.pricing.items).toEqual(original.pricing.items);
    expect(next.quoteBom.items).toEqual(original.quoteBom.items);
    expect(next.pricing.priceInputs.boardWasteMultiplier).toBe(original.pricing.priceInputs.boardWasteMultiplier);
    expect(next.pricing.materialCost).toBe(original.pricing.materialCost);
    expect(next.pricing.finalPrice).toBeCloseTo(original.pricing.materialCost + 600, 2);
  });
  it("accepts zero and reports missing inherited work as incomplete", () => {
    const original = result();
    const moduleLabor = { schemaVersion: 1, inherited: { source: "missing", rate: null }, override: { amount: 0, currency: "CZK" } };
    const zero = applyProjectManufacturingPricing({ instanceId: "cabinet", kind: "module", result: original, catalog, moduleLabor });
    expect(zero.pricing.laborCostFixed).toBe(0); expect(zero.pricing.preassembly?.source).toBe("instance");
    const missing = applyProjectManufacturingPricing({ instanceId: "cabinet", kind: "module", result: original, catalog, moduleLabor: { schemaVersion: 1, inherited: moduleLabor.inherited } });
    expect(missing.pricing.pricingStatus).toBe("incomplete");
    expect(missing.pricing.validationErrors.join(" ")).toContain("preassembly rate");
  });
});

it("preserves the historical configured entry total for an old project with multiple cabinets", () => {
  const settings = createDefaultProjectManufacturingSettings();
  settings.pricingMode = "configured"; settings.boardWastePercent = 0; settings.edgeWastePercent = 0;
  settings.preassemblyByInstanceId.cabinet = 200;
  const original = result(); original.quoteBom.moduleInstance.quantity = 3;
  const old = applyProjectManufacturingPricing({ instanceId: "cabinet", kind: "module", result: original, catalog, settings });
  expect(old.pricing.laborCostFixed).toBe(200);
  const updated = applyProjectManufacturingPricing({ instanceId: "cabinet", kind: "module", result: original, catalog, settings, moduleLabor: { schemaVersion: 1, inherited: { source: "module", rate: { amount: 200, currency: original.pricing.priceInputs.currency } } } });
  expect(updated.pricing.laborCostFixed).toBe(600);
});
