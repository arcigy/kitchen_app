import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { additionalBoardParams, type AdditionalBoardInput } from "./additionalBoardDialog";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { buildProjectPricingViews } from "../layout/bom/projectPricing";
import { buildProjectMaterialScopes } from "../layout/bom/materialUsageSummary";
import { buildProjectMarginsView } from "../layout/bom/projectMargins";
import { createDefaultProjectMarginSettingsState } from "../core/project-margins/project-margin-types";
import { createDefaultProjectMaterialAssignments } from "../core/project-materials/project-material-business";
import { createProjectMaterialRuntimeCatalog } from "./projectMaterialRuntimeCatalog";
import { validateBacksplashFurniture } from "../core/project-save/backsplash-validation";

describe("additional board manufacturing", () => {
  it.each(["horizontal", "vertical"] as const)("keeps %s dimensions, material and per-edge demand through save projection, BOM and margins", orientation => {
    const catalog: ClientCatalog = { clientId: "qa", ...createSystemCatalogSeed() };
    const material = catalog.materials.find(item => item.materialType === "board" && item.boardFamily === "body")!;
    const edge = structuredClone(material); edge.id = "qa-edge"; edge.materialType = "edge"; edge.pricingBasis = "linear_length"; edge.pricingUnit = "lm"; edge.edgeFamily = "body"; delete edge.boardFamily; catalog.materials.push(edge);
    catalog.priceList.prices[material.id] = 20; catalog.priceList.prices[edge.id] = 2;
    const params = additionalBoardParams({ name: "QA cover", lengthMm: 600, widthMm: 400, thicknessMm: 18.1, elevationMm: 800, orientation, materialId: material.id, edgeMaterialId: edge.id, edges: [true, false, true, false] });
    const restored = JSON.parse(JSON.stringify(params)); expect(restored.boards[0].thicknessMm).toBe(18.1); expect(() => validateBacksplashFurniture(restored)).not.toThrow();
    const furniture: CustomFurnitureInstance = { id: "qa-board", params: restored, root: new THREE.Group(), boundaryLine: new THREE.Line(), boardsRoot: new THREE.Group(), boardObjects: [] };
    const runtime = createProjectMaterialRuntimeCatalog(catalog), assignments = createDefaultProjectMaterialAssignments(catalog, "2026-10-02T00:00:00Z");
    assignments.assignments.find(item => item.category === "corpus")!.snapshots.material!.unitPrice = 500;
    runtime.applyProjectAssignments(assignments);
    // Explicitly chosen product keeps its own price even when the general corpus uses a different product.
    runtime.catalog.priceList.prices[material.id] = 20;
    const context = makeDefaultKitchenContext(runtime.catalog);
    const entries = buildProjectPricingViews([], [], [furniture], context, runtime.catalog);
    const board = entries[0]!.result.pricing.items.find(item => item.itemType === "board")!;
    // The factory accepts fractional input; existing editor and BOM normalization use whole millimetres.
    expect(board.dimensionsMm).toEqual({ length: 600, width: 400, thickness: 18 }); expect(board.metrics?.areaM2).toBe(.24);
    const edgeLength = entries[0]!.result.pricing.items.filter(item => item.itemType === "edge_band").reduce((sum,item)=>sum+item.pricingQuantity,0);
    expect(edgeLength).toBe(1.2);
    const scope = buildProjectMaterialScopes({ instances: [], worktops: [], customFurniture: [furniture], kitchenGroups: [], kitchenContext: context, catalog: runtime.catalog });
    expect(scope[0]!.items.find(item => item.unit === "m2")?.layoutTarget).toEqual({ kind: "custom-furniture-board", furnitureId: furniture.id, boardId: "board1" });
    const margins = buildProjectMarginsView(entries, createDefaultProjectMarginSettingsState(), { materialAssignments: assignments.assignments });
    expect(margins.groups.find(group => group.category === "corpus")?.baseCost).toBe(board.itemCost);
  });
  it("rejects impossible dimensions without creating a project entity", () => {
    const input: AdditionalBoardInput = { name: "board", lengthMm: 0, widthMm: 400, thicknessMm: 18, elevationMm: 0, orientation: "horizontal", materialId: "board", edgeMaterialId: "", edges: [] };
    expect(() => additionalBoardParams(input)).toThrow(); input.lengthMm = NaN; expect(() => additionalBoardParams(input)).toThrow();
  });
});
