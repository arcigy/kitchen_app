import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { applyModuleParameterPreset, createDefaultModulePackageParameters } from "../../core/module-package/runtime/module-runtime-adapter";
import { extendedFurnitureModulePackages } from "../../system/module-packages/extendedFurniture";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { summarizeMaterialUsage } from "../../layout/bom/materialUsageSummary";
import { projectMaterialQuantitiesFromUsageSummary } from "../../layout/bom/projectMaterialQuantities";
import { projectMaterialCategoryForBomItem } from "../../layout/bom/projectMaterialCategory";
import { calculateFwmFurnitureBOM } from "./calculation";
import { FWM_FURNITURE_SPECS } from "./definitions";
import { makeDefaultFwmFurnitureParams, type FwmFurnitureParams } from "./types";
import { measurePanel } from "./panelMeasurement";

const catalog = getSystemSeedCatalog();
function calculate(type: FwmFurnitureParams["type"], overrides: Record<string, unknown> = {}) {
  return calculateFwmFurnitureBOM({ ...makeDefaultFwmFurnitureParams(type), requiresWorktop: false, worktopThicknessMm: 0, ...overrides }, makeDefaultKitchenContext(catalog), catalog);
}
function quantities(result: ReturnType<typeof calculate>) {
  return Object.fromEntries(projectMaterialQuantitiesFromUsageSummary(summarizeMaterialUsage([result.quoteBom])).map(item => [item.category, item.quantity]));
}

describe("manufacturing arithmetic through the production Materials path", () => {
  it("750 × 600 wall cabinet: 2.684 m of front edging and 3.756 m of corpus edging", () => {
    const result = calculate("fwm_catalog_wall_cabinet", { width: 600, height: 750, depth: 400, plinthHeight: 0, shelfCount: 2, doorCount: 1, frontGap: 2, sideGap: 2 });
    const q = quantities(result);
    expect(q.edge_front).toBeCloseTo(2 * (596 + 746) / 1000, 4);
    expect(q.edge_other).toBeCloseTo((2 * 750 + 4 * 564) / 1000, 4);
    expect(q.corpus).toBeCloseTo((2 * 750 * 381 + 2 * 564 * 381 + 2 * 564 * 373) / 1_000_000, 3);
    expect(q.front).toBeCloseTo(596 * 746 / 1_000_000, 4);
    expect(q.back).toBeCloseTo(564 * 714 / 1_000_000, 4);
    expect(result.quoteBom.items.find(item => item.id === "door-fronts")?.dimensionsMm).toEqual({ length: 596, width: 746, thickness: 18 });
  });

  it("subtracts the meeting gap once for two door leaves", () => {
    const result = calculate("fwm_catalog_wall_cabinet", { width: 900, height: 750, doorCount: 2, plinthHeight: 0, frontGap: 3, sideGap: 4 });
    expect(quantities(result).edge_front).toBeCloseTo(2 * 2 * (444.5 + 744) / 1000, 4);
  });

  it("uses the real unequal drawer fronts and excludes backs/bottoms from edging", () => {
    const result = calculate("fwm_catalog_base_drawers", { width: 600, height: 800, depth: 530, plinthHeight: 100, drawerCount: 3, drawer1FrontHeightMm: 200, drawer2FrontHeightMm: 300, drawer3FrontHeightMm: 300, frontGap: 2, sideGap: 2 });
    const fronts = result.quoteBom.items.filter(item => item.itemType === "board" && item.materialGroup === "front");
    expect(fronts.map(item => [item.dimensionsMm?.width, item.quantity])).toEqual([[173, 1], [259.5, 2]]);
    expect(quantities(result).edge_front).toBeCloseTo(2 * (3 * 596 + 692) / 1000, 4);
    expect(result.quoteBom.items.find(item => item.id === "drawer-bottoms")?.dimensionsMm).toEqual({ length: 401, width: 516, thickness: 8 });
    const boardIds = new Set(result.quoteBom.items.filter(item => ["back", "drawer_bottom"].includes(item.materialGroup ?? "")).flatMap(item => item.sourcePartIds ?? [item.id]));
    expect(result.quoteBom.items.filter(item => item.itemType === "edge_band").some(item => item.sourcePartIds?.some(id => boardIds.has(id)))).toBe(false);
    expect(result.quoteBom.items.filter(item => item.category === "runner").reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
  });

  it("an open niche has corpus edging and no imaginary front edges", () => {
    const result = calculate("fwm_catalog_base_open_end", { width: 300, height: 700, depth: 400, plinthHeight: 0, shelfCount: 0, hasDoors: false });
    expect(quantities(result).edge_front).toBe(0);
    expect(quantities(result).edge_other).toBeCloseTo((2 * 700 + 2 * 264) / 1000, 4);
  });

  it("uses role, not supplier material family, when the same board/edge is reused", () => {
    const material = catalog.materials.find(item => item.materialType === "board" && item.boardFamily === "front")!;
    const result = calculate("fwm_catalog_wall_cabinet", { width: 600, height: 750, plinthHeight: 0, bodyMaterialId: material.id, shelfMaterialId: material.id, frontMaterialId: material.id });
    expect(quantities(result).edge_other).toBeCloseTo(3.756, 4);
    expect(quantities(result).edge_front).toBeCloseTo(2.684, 4);
    const edge = result.quoteBom.items.find(item => item.itemType === "edge_band" && item.materialGroup === "corpus")!;
    edge.material = { ...edge.material!, edgeFamily: "front" };
    expect(projectMaterialCategoryForBomItem(edge)).toBe("edge_other");
    expect(quantities(result).edge_other).toBeCloseTo(3.756, 4);
  });

  it("keeps required metres even when no edge material has been assigned", () => {
    const empty = { ...catalog, materials: catalog.materials.filter(item => item.materialType !== "edge") };
    const result = calculateFwmFurnitureBOM({ ...makeDefaultFwmFurnitureParams("fwm_catalog_wall_cabinet"), height: 750 }, makeDefaultKitchenContext(empty), empty);
    expect(quantities(result).edge_other).toBeCloseTo(3.756, 4);
    expect(quantities(result).edge_front).toBeCloseTo(2.684, 4);
    expect(result.pricing.validationErrors.length).toBeGreaterThan(0);
  });

  it("keeps hardware requirements when supplier components have not been assigned", () => {
    const empty = { ...catalog, components: [] };
    const params = makeDefaultFwmFurnitureParams("fwm_catalog_base_doors");
    const missing = calculateFwmFurnitureBOM(params, makeDefaultKitchenContext(empty), empty);
    const assigned = calculateFwmFurnitureBOM(params, makeDefaultKitchenContext(catalog), catalog);
    const hardware = (result: typeof missing) => result.quoteBom.items.filter(item => item.itemType === "hardware").map(item => [item.category, item.quantity]);
    expect(hardware(missing)).toEqual(hardware(assigned));
    expect(missing.pricing.validationErrors.length).toBeGreaterThan(0);
  });

  it("scales boards, edges, hardware and labour exactly once for repeated cabinets", () => {
    const one = calculate("fwm_catalog_base_drawers", { quantity: 1 });
    const three = calculate("fwm_catalog_base_drawers", { quantity: 3 });
    expect(three.quoteBom.moduleInstance.quantity).toBe(3);
    for (const item of three.quoteBom.items) {
      const original = one.quoteBom.items.find(candidate => candidate.id === item.id)!;
      expect(item.quantity).toBe(original.quantity * 3);
      expect(item.pricingQuantity).toBeCloseTo(original.pricingQuantity * 3, 4);
      if (item.itemType === "board" || item.itemType === "edge_band") {
        expect(item.sourcePartIds).toHaveLength(item.quantity);
        expect(new Set(item.sourcePartIds).size).toBe(item.quantity);
      }
    }
    const summary = summarizeMaterialUsage([three.quoteBom]);
    const single = summarizeMaterialUsage([one.quoteBom]);
    expect(summary.boardPieces).toBe(single.boardPieces * 3);
    expect(summary.boardAreaM2).toBeCloseTo(single.boardAreaM2 * 3, 3);
    expect(summary.edgeLengthLm).toBeCloseTo(single.edgeLengthLm * 3, 3);
    expect(summary.hardwarePieces).toBe(single.hardwarePieces * 3);
    expect(three.pricing.laborCostFixed).toBe(one.pricing.laborCostFixed * 3);
    const boardSources = new Set(three.quoteBom.items.filter(item => item.itemType === "board").flatMap(item => item.sourcePartIds ?? []));
    for (const edge of three.quoteBom.items.filter(item => item.itemType === "edge_band")) {
      expect(edge.sourcePartIds?.every(id => boardSources.has(id))).toBe(true);
    }
  });

  it("includes plinth boards in the physical board total while displaying their running metres", () => {
    const result = calculate("fwm_catalog_base_doors", { plinthHeight: 100 });
    const summary = summarizeMaterialUsage([result.quoteBom]);
    const boards = result.quoteBom.items.filter(item => item.itemType === "board");
    expect(summary.boardPieces).toBe(boards.reduce((sum, item) => sum + item.quantity, 0));
    expect(summary.boardAreaM2).toBeCloseTo(boards.reduce((sum, item) => sum + item.metrics!.areaM2!, 0), 4);
    expect(summary.groups.find(group => group.id === "plinth")?.quantity).toBeCloseTo(0.6, 4);
  });

  it("measures the narrow face of a strip even when it is narrower than board thickness", () => {
    const mesh = new Mesh(new BoxGeometry(0.012, 0.700, 0.018), new MeshBasicMaterial());
    const part = measurePanel(mesh, 18);
    expect(part.horizontalMm).toBeCloseTo(12, 4);
    expect(part.verticalMm).toBeCloseTo(700, 4);
    expect(part.thicknessMm).toBeCloseTo(18, 4);
    expect(part.areaMm2).toBeCloseTo(8400, 2);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it.each(["fwm_catalog_base_corner", "fwm_catalog_wall_cabinet"] as const)("%s keeps 18 mm stock thickness despite imported mitres/display scaling", type => {
    const result = calculate(type, { variant: "corner_chamfered", boardThickness: 18, frontThicknessMm: 18 });
    const imported = result.quoteBom.items.filter(item => item.itemType === "board" && item.id.startsWith("corner-chamfered") && ["corpus", "front"].includes(item.materialGroup ?? ""));
    expect(imported.length).toBeGreaterThan(0);
    for (const item of imported) expect(item.dimensionsMm?.thickness, item.id).toBe(18);
  });

  it.each([
    { variant: "corner_90", legs: 7, clips: 4, hinges: 4, handles: 2 },
    { variant: "corner_1d", legs: 5, clips: 2, hinges: 2, handles: 1 },
    { variant: "corner_chamfered", legs: 5, clips: 2, hinges: 2, handles: 1 }
  ])("$variant counts hardware assemblies, not their individual display meshes", ({ variant, legs, clips, hinges, handles }) => {
    const result = calculate("fwm_catalog_base_corner", { variant });
    const count = (category: string) => result.quoteBom.items.filter(item => item.itemType === "hardware" && item.category === category).reduce((sum, item) => sum + item.quantity, 0);
    expect(count("leg")).toBe(legs);
    expect(count("plinth_clip")).toBe(clips);
    expect(count("hinge")).toBe(hinges);
    expect(count("handle")).toBe(handles);
    for (const board of result.quoteBom.items.filter(item => item.itemType === "board")) {
      expect(board.metrics?.wasteMultiplier).toBe(variant === "corner_90" ? 1.1 : 1);
      expect(board.pricingQuantity).toBeCloseTo(board.metrics!.areaM2! * board.metrics!.wasteMultiplier!, 3);
    }
  });

  it("does not charge hidden chamfered rear/closing panels or the rear shelf chamfer as front edging", () => {
    const base = calculate("fwm_catalog_base_corner", { variant: "corner_chamfered", shelfCount: 1, backChamferMm: 0 });
    const cutBack = calculate("fwm_catalog_base_corner", { variant: "corner_chamfered", shelfCount: 1, backChamferMm: 150 });
    for (const result of [base, cutBack]) {
      for (const id of ["corner-chamfered-back-left-panel-edge", "corner-chamfered-back-corner-panel-edge", "corner-chamfered-right-side-panel-edge"]) {
        expect(result.quoteBom.items.some(item => item.id === id), id).toBe(false);
      }
      const shelf = result.quoteBom.items.find(item => item.id === "corner-chamfered-shelves-edge")!;
      expect(shelf.pricingQuantity).toBeGreaterThan(0);
      expect(shelf.pricingQuantity).toBeLessThan(1);
    }
    for (const id of ["corner-chamfered-top-panel-edge", "corner-chamfered-bottom-panel-edge", "corner-chamfered-diagonal-front-edge"]) {
      expect(cutBack.quoteBom.items.find(item => item.id === id)?.pricingQuantity).toBeCloseTo(base.quoteBom.items.find(item => item.id === id)!.pricingQuantity, 3);
    }
  });

  it.each(FWM_FURNITURE_SPECS)("$moduleType keeps edging tied to existing source boards", spec => {
    const result = calculate(spec.moduleType);
    const boards = new Map(result.quoteBom.items.filter(item => item.itemType === "board").flatMap(item => (item.sourcePartIds ?? [item.id]).map(id => [id, item] as const)));
    for (const item of result.quoteBom.items.filter(item => item.itemType === "edge_band")) {
      expect(item.pricingQuantity).toBeGreaterThan(0);
      expect(item.sourcePartIds).toHaveLength(item.quantity);
      const board = boards.get(item.sourcePartIds![0]!)!;
      expect(board).toBeDefined();
      expect(item.pricingQuantity).toBeLessThanOrEqual(2 * (board.dimensionsMm!.length + board.dimensionsMm!.width) * board.quantity / 1000 + 0.01);
      expect(projectMaterialCategoryForBomItem(item)).toBe(board.materialGroup === "front" ? "edge_front" : "edge_other");
    }
    expect(quantities(result).edge_other).toBeGreaterThan(0);
    expect(result.pricing.groups.edge_bands.lengthLm).toBeCloseTo(result.quoteBom.items.filter(item => item.itemType === "edge_band").reduce((sum, item) => sum + item.pricingQuantity, 0), 4);
  });
});

const presets = extendedFurnitureModulePackages.flatMap(modulePackage => [
  { name: `${modulePackage.module.modulePackageId}/default`, modulePackage, presetId: null },
  ...(modulePackage.parameterPresets?.presets ?? []).map(preset => ({ name: `${modulePackage.module.modulePackageId}/${preset.presetId}`, modulePackage, presetId: preset.presetId }))
]);

describe("every advertised module variant", () => {
  const variants = FWM_FURNITURE_SPECS.flatMap(spec => spec.variantOptions.map(variant => ({ type: spec.moduleType, variant })));
  it.each(variants)("$type/$variant has valid cut dimensions and consistent measured edges", ({ type, variant }) => {
    const result = calculate(type, { variant });
    for (const item of result.quoteBom.items) {
      expect(Number.isFinite(item.pricingQuantity), item.id).toBe(true);
      expect(item.pricingQuantity, item.id).toBeGreaterThan(0);
      if (item.itemType !== "board") continue;
      for (const value of Object.values(item.dimensionsMm!)) expect(value, item.id).toBeGreaterThan(0);
      expect(item.metrics?.areaM2, item.id).toBeLessThanOrEqual(item.dimensionsMm!.length * item.dimensionsMm!.width * item.quantity / 1_000_000 + 0.001);
    }
    const q = quantities(result);
    expect(q.edge_other).toBeGreaterThan(0);
    expect(q.edge_front + q.edge_other).toBeCloseTo(result.pricing.groups.edge_bands.lengthLm, 3);
  });
});

describe("all published module presets", () => {
  it.each(presets)("$name has finite positive panels and consistent material totals", ({ modulePackage, presetId }) => {
    const defaults = createDefaultModulePackageParameters(modulePackage);
    const params = presetId ? applyModuleParameterPreset({ modulePackage, parameters: defaults, presetId }) : defaults;
    const result = calculateFwmFurnitureBOM({ ...params, type: modulePackage.module.moduleType } as FwmFurnitureParams, makeDefaultKitchenContext(catalog), catalog);
    expect(result.quoteBom.items.length).toBeGreaterThan(0);
    expect(new Set(result.quoteBom.items.map(item => item.id)).size).toBe(result.quoteBom.items.length);
    for (const item of result.quoteBom.items) {
      expect(Number.isFinite(item.pricingQuantity), item.id).toBe(true);
      expect(item.pricingQuantity, item.id).toBeGreaterThan(0);
      if (item.itemType === "board") {
        for (const dimension of Object.values(item.dimensionsMm!)) expect(dimension, item.id).toBeGreaterThan(0);
        expect(item.metrics?.areaM2, item.id).toBeLessThanOrEqual(item.dimensionsMm!.length * item.dimensionsMm!.width * item.quantity / 1_000_000 + 0.001);
      }
    }
    const q = quantities(result);
    expect(q.edge_other).toBeGreaterThan(0);
    expect(q.edge_front + q.edge_other).toBeCloseTo(result.pricing.groups.edge_bands.lengthLm, 3);
  });
});
