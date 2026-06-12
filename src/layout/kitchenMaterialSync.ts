import type { ClientCatalog, ComponentDefinition, MaterialDefinition } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { applyModuleContextBindings } from "../core/module-package/runtime/module-context-binding";
import type { ModuleParams } from "../model/cabinetTypes";
import {
  normalizeCornerShelfLowerParams,
  type CornerShelfLowerParams
} from "../modules/cornerShelfLower/types";
import { getKitchenModuleRole } from "./kitchenModuleRules";
import cornerShelfLowerMaterialsSnapshot from "../modules/cornerShelfLower/package/definitions/corner_shelf_lower.materials.snapshot.json";
import drawerLowMaterialsSnapshot from "../modules/drawerLow/package/definitions/drawer_low.materials.snapshot.json";
import {
  normalizeFlapShelvesLowParams,
  type FlapShelvesLowParams
} from "../modules/flapShelvesLow/types";
import flapShelvesLowMaterialsSnapshot from "../modules/flapShelvesLow/package/definitions/flap_shelves_low.materials.snapshot.json";
import {
  normalizeFridgeTallParams,
  type FridgeTallParams
} from "../modules/fridgeTall/types";
import fridgeTallMaterialsSnapshot from "../modules/fridgeTall/package/definitions/fridge_tall.materials.snapshot.json";
import {
  normalizeSwingShelvesLowParams,
  type SwingShelvesLowParams
} from "../modules/swingShelvesLow/types";
import swingShelvesLowMaterialsSnapshot from "../modules/swingShelvesLow/package/definitions/swing_shelves_low.materials.snapshot.json";
import { isFwmFurnitureModuleType, normalizeFwmFurnitureParams, type FwmFurnitureParams } from "../modules/fwmFurniture/types";
import type { PortableMaterialsSnapshot } from "../modules/runtime/portableCommercial";
import type { KitchenContext } from "./kitchenContext";

type KitchenBoardFamily = "front" | "body" | "back" | "drawer_bottom" | "worktop" | "shelf";

type KitchenMaterialField = {
  [K in KitchenBoardFamily]: keyof Pick<
    KitchenContext,
    "frontsMaterialId" | "corpusMaterialId" | "backMaterialId" | "drawerBottomMaterialId" | "worktopMaterialId"
  >;
};

type KitchenMaterialSelectOption = {
  id: string;
  label: string;
};

const kitchenMaterialFieldByFamily: KitchenMaterialField = {
  front: "frontsMaterialId",
  body: "corpusMaterialId",
  back: "backMaterialId",
  drawer_bottom: "drawerBottomMaterialId",
  worktop: "worktopMaterialId",
  shelf: "corpusMaterialId"
};

const cornerShelfLowerSnapshot = cornerShelfLowerMaterialsSnapshot as unknown as PortableMaterialsSnapshot;
const drawerLowSnapshot = drawerLowMaterialsSnapshot as unknown as PortableMaterialsSnapshot;
const flapShelvesLowSnapshot = flapShelvesLowMaterialsSnapshot as unknown as PortableMaterialsSnapshot;
const fridgeTallSnapshot = fridgeTallMaterialsSnapshot as unknown as PortableMaterialsSnapshot;
const swingShelvesLowSnapshot = swingShelvesLowMaterialsSnapshot as unknown as PortableMaterialsSnapshot;

function getMaterialSnapshotForModuleType(type: ModuleParams["type"]): PortableMaterialsSnapshot | undefined {
  if (type === "corner_shelf_lower") return cornerShelfLowerSnapshot;
  if (type === "drawer_low") return drawerLowSnapshot;
  if (type === "fridge_tall") return fridgeTallSnapshot;
  if (type === "flap_shelves_low") return flapShelvesLowSnapshot;
  if (type === "swing_shelves_low") return swingShelvesLowSnapshot;
  return undefined;
}

function normalizeSyncedModuleParams(params: ModuleParams) {
  const record = params as Record<string, unknown>;
  if (isFwmFurnitureModuleType(params.type)) Object.assign(record, normalizeFwmFurnitureParams(record as FwmFurnitureParams));
  if (params.type === "corner_shelf_lower") Object.assign(record, normalizeCornerShelfLowerParams(record as CornerShelfLowerParams));
  if (params.type === "fridge_tall") Object.assign(record, normalizeFridgeTallParams(record as FridgeTallParams));
  if (params.type === "flap_shelves_low") Object.assign(record, normalizeFlapShelvesLowParams(record as FlapShelvesLowParams));
  if (params.type === "swing_shelves_low") Object.assign(record, normalizeSwingShelvesLowParams(record as SwingShelvesLowParams));
}

function matchesKitchenBoardFamily(material: MaterialDefinition, family: KitchenBoardFamily) {
  if (family === "shelf") return material.boardFamily === "body";
  return material.boardFamily === family;
}

function getBoardMaterialOptions(family: KitchenBoardFamily, catalog: ClientCatalog): MaterialDefinition[] {
  return catalog.materials.filter(
    (material): material is MaterialDefinition =>
      material.materialType === "board" && material.isActive && matchesKitchenBoardFamily(material, family)
  );
}

function normalizeBaseMaterialId(materialId: string) {
  const match = materialId.match(/^(.*)\.(\d+(?:_\d+)?)$/);
  return match ? match[1]! : materialId;
}

function stripThicknessSuffix(label: string) {
  return label.replace(/\s+\d+(?:[.,]\d+)?\s*mm$/i, "").trim();
}

function getMaterialDefinitionById(catalog: ClientCatalog, id: string): MaterialDefinition | null {
  return catalog.materials.find((material) => material.id === id) ?? null;
}

function getComponentDefinitionById(catalog: ClientCatalog, id: string): ComponentDefinition | null {
  return catalog.components.find((component) => component.id === id) ?? null;
}

function getKitchenMaterial(ctx: KitchenContext, family: KitchenBoardFamily, catalog: ClientCatalog): MaterialDefinition | null {
  const field = kitchenMaterialFieldByFamily[family];
  const requestedId = ctx[field];
  const requested = getMaterialDefinitionById(catalog, requestedId);
  if (requested?.materialType === "board" && matchesKitchenBoardFamily(requested, family)) {
    return requested;
  }
  return getBoardMaterialOptions(family, catalog)[0] ?? null;
}

function getMaterialByIdForFamily(
  materialId: string,
  family: KitchenBoardFamily,
  catalog: ClientCatalog
): MaterialDefinition | null {
  const requested = getMaterialDefinitionById(catalog, materialId);
  if (requested?.materialType === "board" && matchesKitchenBoardFamily(requested, family)) {
    return requested;
  }
  return getBoardMaterialOptions(family, catalog)[0] ?? null;
}

function getSortedThicknesses(material: MaterialDefinition | null): number[] {
  if (!material) return [];
  const values = material.availableThicknessesMm.filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return [material.defaultThicknessMm];
  return [...new Set(values)].sort((left, right) => left - right);
}

export function getKitchenWorktopThicknessOptions(worktopMaterialId: string, catalog: ClientCatalog): number[] {
  return getSortedThicknesses(getMaterialByIdForFamily(worktopMaterialId, "worktop", catalog));
}

export function resolveKitchenWorktopThickness(worktopMaterialId: string, desiredThicknessMm: number, catalog: ClientCatalog): number {
  const material = getMaterialByIdForFamily(worktopMaterialId, "worktop", catalog);
  const options = getSortedThicknesses(material);
  if (options.length === 0) return Math.max(1, Math.round(desiredThicknessMm || 0));

  const desired = Number.isFinite(desiredThicknessMm) ? desiredThicknessMm : (material?.defaultThicknessMm ?? options[0]!);
  const exact = options.find((value) => value === desired);
  if (exact != null) return exact;

  return (
    [...options].sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired))[0] ??
    material?.defaultThicknessMm ??
    options[0]!
  );
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveHandleGeometryKind(componentId: string): "bar" | "knob" {
  return componentId.includes(".knob.") ? "knob" : "bar";
}

function applyKitchenHandleSelection(params: Record<string, unknown>, ctx: KitchenContext, catalog: ClientCatalog) {
  const component = getComponentDefinitionById(catalog, ctx.handleComponentId);
  if (!component || component.componentType !== "handle") {
    params.handleType = "none";
    delete params.handleComponentId;
    return;
  }
  params.handleComponentId = component.id;
  params.handleType = resolveHandleGeometryKind(component.id);
  params.handleLengthMm = component.nominalLengthMm ?? 160;
}

function applyLegacyMaterialAliases(
  params: Record<string, unknown>,
  family: KitchenBoardFamily,
  material: MaterialDefinition
) {
  const materials = ensureRecord(params.materials);
  params.materials = materials;
  const colorHex = material.preview.colorHex;

  if (family === "front") {
    params.frontMaterialId = material.id;
    params.frontColor = colorHex;
    materials.frontKey = material.id;
    materials.frontMaterialId = material.id;
    materials.frontName = material.displayName;
    materials.frontColor = colorHex;
    return;
  }

  if (family === "back") {
    params.backMaterialId = material.id;
    params.backColor = colorHex;
    materials.backKey = material.id;
    materials.backMaterialId = material.id;
    materials.backName = material.displayName;
    materials.backColor = colorHex;
    return;
  }

  if (family === "drawer_bottom") {
    params.drawerMaterialId = material.id;
    params.drawerColor = colorHex;
    materials.drawerKey = material.id;
    materials.drawerMaterialId = material.id;
    materials.drawerName = material.displayName;
    materials.drawerColor = colorHex;
    return;
  }

  if (family === "shelf") {
    params.shelfMaterialId = material.id;
    params.shelfColor = colorHex;
    materials.shelfMaterialId = material.id;
    materials.shelfName = material.displayName;
    materials.shelfColor = colorHex;
    return;
  }

  params.bodyMaterialId = material.id;
  params.bodyColor = colorHex;
  materials.bodyKey = material.id;
  materials.bodyMaterialId = material.id;
  materials.bodyName = material.displayName;
  materials.bodyColor = colorHex;
  materials.backInsideColor = colorHex;
}

function applyKitchenCommercialSelections(
  params: Record<string, unknown>,
  ctx: KitchenContext,
  catalog: ClientCatalog,
  snapshot: PortableMaterialsSnapshot
) {
  const boardMaterials: Record<string, string> = {};
  const boardThicknesses: Record<string, number> = {};

  for (const slot of snapshot.slotAssignments ?? []) {
    const family = (slot.boardFamily ?? slot.assignedMaterial.family ?? null) as KitchenBoardFamily | null;
    if (!family || family === "worktop") continue;
    const selected = getKitchenMaterial(ctx, family, catalog);
    if (!selected) continue;
    boardMaterials[slot.slotId] = selected.id;
    boardThicknesses[slot.slotId] = selected.defaultThicknessMm;
  }

  params.commercialSelections = {
    boardMaterials,
    boardThicknesses
  };
}

function getPositiveInteger(value: unknown, fallback: number) {
  return Math.max(1, Math.round(typeof value === "number" && Number.isFinite(value) ? value : fallback));
}

function setBoardSelection(
  params: Record<string, unknown>,
  slotId: string,
  material: MaterialDefinition
) {
  const commercialSelections = ensureRecord(params.commercialSelections);
  const boardMaterials = ensureRecord(commercialSelections.boardMaterials);
  const boardThicknesses = ensureRecord(commercialSelections.boardThicknesses);
  boardMaterials[slotId] = material.id;
  boardThicknesses[slotId] = material.defaultThicknessMm;
  commercialSelections.boardMaterials = boardMaterials;
  commercialSelections.boardThicknesses = boardThicknesses;
  params.commercialSelections = commercialSelections;
}

function applyDrawerLowDynamicSelections(params: Record<string, unknown>, ctx: KitchenContext, catalog: ClientCatalog) {
  const drawerCount = getPositiveInteger(params.drawerCount, 3);
  const fronts = getKitchenMaterial(ctx, "front", catalog);
  const drawerBottom = getKitchenMaterial(ctx, "drawer_bottom", catalog);

  for (let index = 1; index <= drawerCount; index += 1) {
    if (fronts) setBoardSelection(params, `drawer-front-${index}`, fronts);
    if (drawerBottom) setBoardSelection(params, `drawer-box-${index}-bottom-panel`, drawerBottom);
  }
}

function applyDrawerLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  const role = getKitchenModuleRole(record);

  if (role === "base") {
    record.height = ctx.heightMm;
    record.heightCarcass = ctx.moduleHeightMm;
    record.depth = ctx.moduleDepthMm;
    record.plinthHeight = ctx.plinthHeightMm;
    record.plinthSetbackMm = ctx.plinthDepthMm;
  } else if (role === "upper") {
    record.height = ctx.upperHeightMm;
    record.heightCarcass = ctx.upperHeightMm;
    record.depth = ctx.upperDepthMm;
  }

  const corpus = getKitchenMaterial(ctx, "body", catalog);
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front", catalog);
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back", catalog);
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  const drawerBottom = getKitchenMaterial(ctx, "drawer_bottom", catalog);
  if (drawerBottom) {
    record.drawerBottomThickness = drawerBottom.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "drawer_bottom", drawerBottom);
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm, catalog);
  }

  applyKitchenHandleSelection(record, ctx, catalog);

  applyKitchenCommercialSelections(record, ctx, catalog, drawerLowSnapshot);
  applyDrawerLowDynamicSelections(record, ctx, catalog);
}

function applyCornerShelfLowerKitchenMaterials(params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  const role = getKitchenModuleRole(record);

  if (role === "base") {
    record.height = ctx.heightMm;
    record.heightCarcass = ctx.moduleHeightMm;
    record.depth = ctx.moduleDepthMm;
    record.plinthHeight = ctx.plinthHeightMm;
    record.plinthSetbackMm = ctx.plinthDepthMm;
  } else if (role === "upper") {
    record.height = ctx.upperHeightMm;
    record.heightCarcass = ctx.upperHeightMm;
    record.depth = ctx.upperDepthMm;
  }

  const corpus = getKitchenMaterial(ctx, "body", catalog);
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front", catalog);
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back", catalog);
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm, catalog);
  }

  applyKitchenHandleSelection(record, ctx, catalog);

  applyKitchenCommercialSelections(record, ctx, catalog, cornerShelfLowerSnapshot);

  Object.assign(
    record,
    normalizeCornerShelfLowerParams(record as CornerShelfLowerParams)
  );
}

function applyFridgeTallKitchenMaterials(params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  record.worktopThicknessMm = 0;
  record.depth = ctx.moduleDepthMm;
  record.plinthHeight = ctx.plinthHeightMm;
  record.plinthSetbackMm = ctx.plinthDepthMm;

  const corpus = getKitchenMaterial(ctx, "body", catalog);
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front", catalog);
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back", catalog);
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx, catalog);
  applyKitchenCommercialSelections(record, ctx, catalog, fridgeTallSnapshot);

  Object.assign(record, normalizeFridgeTallParams(record as FridgeTallParams));
}

function applyFlapShelvesLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  record.kitchenModuleRole = "top";
  record.requiresWorktop = false;
  record.worktopThicknessMm = 0;
  record.wallMounted = true;
  record.height = ctx.upperHeightMm;
  record.depth = ctx.upperDepthMm;
  record.plinthHeight = 0;

  const corpus = getKitchenMaterial(ctx, "body", catalog);
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
  }

  const shelf = getKitchenMaterial(ctx, "shelf", catalog);
  if (shelf) {
    record.shelfThickness = shelf.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "shelf", shelf);
  }

  const fronts = getKitchenMaterial(ctx, "front", catalog);
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back", catalog);
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx, catalog);
  applyKitchenCommercialSelections(record, ctx, catalog, flapShelvesLowSnapshot);

  Object.assign(record, normalizeFlapShelvesLowParams(record as FlapShelvesLowParams));
}

function applySwingShelvesLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext, catalog: ClientCatalog) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  record.kitchenModuleRole = "base";
  record.requiresWorktop = true;

  record.height = ctx.heightMm;
  record.heightCarcass = ctx.moduleHeightMm;
  record.depth = ctx.moduleDepthMm;
  record.plinthHeight = ctx.plinthHeightMm;
  record.plinthSetbackMm = ctx.plinthDepthMm;
  record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm, catalog);

  const corpus = getKitchenMaterial(ctx, "body", catalog);
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    record.shelfThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front", catalog);
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back", catalog);
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx, catalog);
  applyKitchenCommercialSelections(record, ctx, catalog, swingShelvesLowSnapshot);

  Object.assign(record, normalizeSwingShelvesLowParams(record as SwingShelvesLowParams));
}

export function getKitchenBoardMaterialSelectOptions(family: KitchenBoardFamily, catalog: ClientCatalog): KitchenMaterialSelectOption[] {
  const options = new Map<string, KitchenMaterialSelectOption>();

  for (const material of getBoardMaterialOptions(family, catalog)) {
    const baseId = normalizeBaseMaterialId(material.id);
    if (options.has(baseId)) continue;
    options.set(baseId, {
      id: material.id,
      label: stripThicknessSuffix(material.displayName)
    });
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function applyKitchenContextToModuleParams(
  params: ModuleParams,
  ctx: KitchenContext,
  catalog: ClientCatalog,
  modulePackage?: FurnQuoteModulePackage | null
): ModuleParams {
  if (modulePackage?.behavior?.contextBindings?.some((binding) => binding.contextType === "kitchenGroup")) {
    applyModuleContextBindings({
      modulePackage,
      params: params as unknown as Record<string, unknown>,
      contextType: "kitchenGroup",
      context: ctx as unknown as Record<string, unknown>,
      catalog,
      materialSnapshot: getMaterialSnapshotForModuleType(params.type)
    });
    normalizeSyncedModuleParams(params);
    return params;
  }

  if (params.type === "corner_shelf_lower") {
    applyCornerShelfLowerKitchenMaterials(params, ctx, catalog);
  }
  if (params.type === "drawer_low") {
    applyDrawerLowKitchenMaterials(params, ctx, catalog);
  }
  if (params.type === "fridge_tall") {
    applyFridgeTallKitchenMaterials(params, ctx, catalog);
  }
  if (params.type === "flap_shelves_low") {
    applyFlapShelvesLowKitchenMaterials(params, ctx, catalog);
  }
  if (params.type === "swing_shelves_low") {
    applySwingShelvesLowKitchenMaterials(params, ctx, catalog);
  }
  return params;
}
