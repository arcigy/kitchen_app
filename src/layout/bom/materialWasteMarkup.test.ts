import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { createDefaultProjectMarginSettingsState } from "../../core/project-margins/project-margin-types";
import type { ProjectMaterialAssignment } from "../../core/project-materials/project-material-types";
import { calculateCommercialPricingFromQuoteBom, type PortableQuoteBomItem, type PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import { applyProjectManufacturingPricing } from "./projectManufacturingPricing";
import { buildProjectMarginsView } from "./projectMargins";

describe("30% material waste followed by 100% markup", () => {
  for (const itemType of ["board", "edge_band"] as const) for (const assigned of [false, true]) {
    it.each([1, 3])(`${itemType}, project snapshot=${assigned}, %s copies: 100 → 130 → 260 per net unit, exactly once`, copies => {
      const catalog = { clientId: "waste-markup-test", ...createSystemCatalogSeed() };
      const definition = { ...catalog.materials[0]!, id: "requirement.material", materialType: itemType === "board" ? "board" as const : "edge" as const,
        pricingUnit: itemType === "board" ? "m2" as const : "lm" as const,
        pricingBasis: itemType === "board" ? "sheet_area" as const : "linear_length" as const };
      catalog.materials.push(definition); catalog.priceList.currency = "EUR";
      catalog.priceList.prices[definition.id] = assigned ? 7 : 100;
      const item: PortableQuoteBomItem = {
        id: "used-material", itemType, category: itemType, materialGroup: "body", name: "Material", description: "Material",
        quantity: copies, pricingQuantityBase: copies, pricingQuantity: copies,
        pricingBasis: definition.pricingBasis, pricingUnit: definition.pricingUnit,
        metrics: itemType === "board" ? { areaM2: copies } : { edgeLengthLm: copies },
        dimensionsMm: { length: 1000, width: 1000, thickness: 18 },
        material: { ...definition, catalogId: definition.id, assignmentSource: "catalog" },
        catalogRef: { entityType: "material", catalogId: definition.id }
      };
      const quoteBom: PortableQuoteBomPayload = { schemaVersion: "module-quote-bom.v1", moduleType: "test", displayName: "Test", generatedAt: "2026-09-24T00:00:00.000Z", moduleInstance: { quantity: copies, widthMm: 1000, heightMm: 1000, depthMm: 600 }, items: [item] };
      const result = { moduleType: "test", displayName: "Test", quoteBom, materialsSnapshot: null,
        pricing: calculateCommercialPricingFromQuoteBom({ quoteBom, catalog, laborCostFixed: 0 }) };
      const settings = createDefaultProjectMarginSettingsState(); settings.initialized = true; settings.defaultMarginPercent = 100;
      settings.manufacturing.pricingMode = "configured"; settings.manufacturing.boardWastePercent = 30; settings.manufacturing.edgeWastePercent = 30;
      settings.manufacturing.preassemblyByModuleType.test = 0;
      const assignment: ProjectMaterialAssignment = {
        assignmentId: itemType === "board" ? "material-assignment:corpus" : "material-assignment:edge_other",
        category: itemType === "board" ? "corpus" : "edge_other", kind: "material", materialId: definition.id, source: "user", customValues: {}, updatedAt: quoteBom.generatedAt,
        snapshots: { material: { definition, unitPrice: 100, currency: "EUR", priceListId: null, capturedAt: quoteBom.generatedAt } }
      };
      const input = { instanceId: "module-1", kind: "module" as const, catalog, settings: settings.manufacturing };
      const once = applyProjectManufacturingPricing({ ...input, result });
      const twice = applyProjectManufacturingPricing({ ...input, result: once });
      for (const priced of [once, twice]) {
        expect(priced.quoteBom.items[0]!.pricingQuantityBase).toBe(copies);
        expect(priced.pricing.items[0]!.pricingQuantity).toBeCloseTo(copies * 1.3, 4);
        const view = buildProjectMarginsView([{ instanceId: input.instanceId, kind: "module", label: "Test", result: priced }], settings,
          { currency: "EUR", materialAssignments: assigned ? [assignment] : [] });
        expect(view.summary).toMatchObject({ baseCost: 130 * copies, marginAmount: 130 * copies, finalPrice: 260 * copies, missingPriceCount: 0 });
        expect(view.warnings).toEqual([]);
      }
    });
  }
});
