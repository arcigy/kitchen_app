import { getMaterialDefinitionById, materialDefinitions } from "../data/pricing/materialDefinitions";
import type { MaterialDefinition } from "../data/pricing/types";
import { applyDrawerLowHandleComponentToParams } from "../data/pricing/handleComponentPresets";
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

function matchesKitchenBoardFamily(material: MaterialDefinition, family: KitchenBoardFamily) {
  if (family === "shelf") return material.boardFamily === "body";
  return material.boardFamily === family;
}

function getBoardMaterialOptions(family: KitchenBoardFamily): MaterialDefinition[] {
  return materialDefinitions.filter(
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

function getKitchenMaterial(ctx: KitchenContext, family: KitchenBoardFamily): MaterialDefinition | null {
  const field = kitchenMaterialFieldByFamily[family];
  const requestedId = ctx[field];
  const requested = getMaterialDefinitionById(requestedId);
  if (requested?.materialType === "board" && matchesKitchenBoardFamily(requested, family)) {
    return requested;
  }
  return getBoardMaterialOptions(family)[0] ?? null;
}

function getMaterialByIdForFamily(
  materialId: string,
  family: KitchenBoardFamily
): MaterialDefinition | null {
  const requested = getMaterialDefinitionById(materialId);
  if (requested?.materialType === "board" && matchesKitchenBoardFamily(requested, family)) {
    return requested;
  }
  return getBoardMaterialOptions(family)[0] ?? null;
}

function getSortedThicknesses(material: MaterialDefinition | null): number[] {
  if (!material) return [];
  const values = material.availableThicknessesMm.filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return [material.defaultThicknessMm];
  return [...new Set(values)].sort((left, right) => left - right);
}

export function getKitchenWorktopThicknessOptions(worktopMaterialId: string): number[] {
  return getSortedThicknesses(getMaterialByIdForFamily(worktopMaterialId, "worktop"));
}

export function resolveKitchenWorktopThickness(worktopMaterialId: string, desiredThicknessMm: number): number {
  const material = getMaterialByIdForFamily(worktopMaterialId, "worktop");
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

function applyKitchenHandleSelection(params: Record<string, unknown>, ctx: KitchenContext) {
  const nextParams = applyDrawerLowHandleComponentToParams(params, ctx.handleComponentId);
  Object.assign(params, nextParams);
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
  snapshot: PortableMaterialsSnapshot
) {
  const boardMaterials: Record<string, string> = {};
  const boardThicknesses: Record<string, number> = {};

  for (const slot of snapshot.slotAssignments ?? []) {
    const family = (slot.boardFamily ?? slot.assignedMaterial.family ?? null) as KitchenBoardFamily | null;
    if (!family || family === "worktop") continue;
    const selected = getKitchenMaterial(ctx, family);
    if (!selected) continue;
    boardMaterials[slot.slotId] = selected.id;
    boardThicknesses[slot.slotId] = selected.defaultThicknessMm;
  }

  params.commercialSelections = {
    boardMaterials,
    boardThicknesses
  };
}

function applyDrawerLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
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

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  const drawerBottom = getKitchenMaterial(ctx, "drawer_bottom");
  if (drawerBottom) {
    record.drawerBottomThickness = drawerBottom.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "drawer_bottom", drawerBottom);
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm);
  }

  applyKitchenHandleSelection(record, ctx);

  applyKitchenCommercialSelections(record, ctx, drawerLowSnapshot);
}

function applyCornerShelfLowerKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
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

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm);
  }

  applyKitchenHandleSelection(record, ctx);

  applyKitchenCommercialSelections(record, ctx, cornerShelfLowerSnapshot);

  Object.assign(
    record,
    normalizeCornerShelfLowerParams(record as CornerShelfLowerParams)
  );
}

function applyFridgeTallKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;
  record.worktopThicknessMm = 0;
  record.depth = ctx.moduleDepthMm;
  record.plinthHeight = ctx.plinthHeightMm;
  record.plinthSetbackMm = ctx.plinthDepthMm;

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx);
  applyKitchenCommercialSelections(record, ctx, fridgeTallSnapshot);

  Object.assign(record, normalizeFridgeTallParams(record as FridgeTallParams));
}

function applyFlapShelvesLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
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

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
  }

  const shelf = getKitchenMaterial(ctx, "shelf");
  if (shelf) {
    record.shelfThickness = shelf.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "shelf", shelf);
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx);
  applyKitchenCommercialSelections(record, ctx, flapShelvesLowSnapshot);

  Object.assign(record, normalizeFlapShelvesLowParams(record as FlapShelvesLowParams));
}

function applySwingShelvesLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
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
  record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm);

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    record.shelfThickness = corpus.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "body", corpus);
    applyLegacyMaterialAliases(record, "shelf", corpus);
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "front", fronts);
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    applyLegacyMaterialAliases(record, "back", back);
  }

  applyKitchenHandleSelection(record, ctx);
  applyKitchenCommercialSelections(record, ctx, swingShelvesLowSnapshot);

  Object.assign(record, normalizeSwingShelvesLowParams(record as SwingShelvesLowParams));
}

export function getKitchenBoardMaterialSelectOptions(family: KitchenBoardFamily): KitchenMaterialSelectOption[] {
  const options = new Map<string, KitchenMaterialSelectOption>();

  for (const material of getBoardMaterialOptions(family)) {
    const baseId = normalizeBaseMaterialId(material.id);
    if (options.has(baseId)) continue;
    options.set(baseId, {
      id: material.id,
      label: stripThicknessSuffix(material.displayName)
    });
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function applyKitchenContextToModuleParams(params: ModuleParams, ctx: KitchenContext): ModuleParams {
  if (params.type === "corner_shelf_lower") {
    applyCornerShelfLowerKitchenMaterials(params, ctx);
  }
  if (params.type === "drawer_low") {
    applyDrawerLowKitchenMaterials(params, ctx);
  }
  if (params.type === "fridge_tall") {
    applyFridgeTallKitchenMaterials(params, ctx);
  }
  if (params.type === "flap_shelves_low") {
    applyFlapShelvesLowKitchenMaterials(params, ctx);
  }
  if (params.type === "swing_shelves_low") {
    applySwingShelvesLowKitchenMaterials(params, ctx);
  }
  return params;
}
