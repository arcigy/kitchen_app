import { getMaterialDefinitionById, materialDefinitions } from "../data/pricing/materialDefinitions";
import type { MaterialDefinition } from "../data/pricing/types";
import type { ModuleParams } from "../model/cabinetTypes";
import {
  normalizeCornerShelfLowerParams,
  type CornerShelfLowerParams
} from "../modules/cornerShelfLower/types";
import cornerShelfLowerMaterialsSnapshot from "../modules/cornerShelfLower/package/definitions/corner_shelf_lower.materials.snapshot.json";
import drawerLowMaterialsSnapshot from "../modules/drawerLow/package/definitions/drawer_low.materials.snapshot.json";
import { updateCommercialSelections, type PortableMaterialsSnapshot } from "../modules/runtime/portableCommercial";
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

function applyDrawerLowKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;

  record.height = ctx.heightMm;
  record.heightCarcass = ctx.moduleHeightMm;
  record.depth = ctx.moduleDepthMm;

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    materials.bodyKey = corpus.id;
    materials.bodyMaterialId = corpus.id;
    materials.bodyName = corpus.displayName;
    materials.bodyColor = corpus.preview.colorHex;
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    materials.frontKey = fronts.id;
    materials.frontMaterialId = fronts.id;
    materials.frontName = fronts.displayName;
    materials.frontColor = fronts.preview.colorHex;
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    materials.backKey = back.id;
    materials.backMaterialId = back.id;
    materials.backName = back.displayName;
    materials.backColor = back.preview.colorHex;
  }

  const drawerBottom = getKitchenMaterial(ctx, "drawer_bottom");
  if (drawerBottom) {
    record.drawerBottomThickness = drawerBottom.defaultThicknessMm;
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm);
  }

  updateCommercialSelections(record, (current) => {
    const boardMaterials = { ...current.boardMaterials };
    const boardThicknesses = { ...current.boardThicknesses };

    for (const slot of drawerLowSnapshot.slotAssignments ?? []) {
      const family = (slot.boardFamily ?? slot.assignedMaterial.family ?? null) as KitchenBoardFamily | null;
      if (!family || family === "worktop") continue;
      const selected = getKitchenMaterial(ctx, family);
      if (!selected) continue;
      boardMaterials[slot.slotId] = selected.id;
      boardThicknesses[slot.slotId] = selected.defaultThicknessMm;
    }

    return {
      boardMaterials,
      boardThicknesses
    };
  });
}

function applyCornerShelfLowerKitchenMaterials(params: ModuleParams, ctx: KitchenContext) {
  const record = params as Record<string, unknown>;
  const materials = ensureRecord(record.materials);
  record.materials = materials;

  record.height = ctx.heightMm;
  record.heightCarcass = ctx.moduleHeightMm;
  record.depth = ctx.moduleDepthMm;
  record.plinthHeight = ctx.plinthHeightMm;
  record.plinthSetbackMm = ctx.plinthDepthMm;

  const corpus = getKitchenMaterial(ctx, "body");
  if (corpus) {
    record.boardThickness = corpus.defaultThicknessMm;
    materials.bodyKey = corpus.id;
    materials.bodyMaterialId = corpus.id;
    materials.bodyName = corpus.displayName;
    materials.bodyColor = corpus.preview.colorHex;
  }

  const fronts = getKitchenMaterial(ctx, "front");
  if (fronts) {
    record.frontThicknessMm = fronts.defaultThicknessMm;
    materials.frontKey = fronts.id;
    materials.frontMaterialId = fronts.id;
    materials.frontName = fronts.displayName;
    materials.frontColor = fronts.preview.colorHex;
  }

  const back = getKitchenMaterial(ctx, "back");
  if (back) {
    record.backThickness = back.defaultThicknessMm;
    materials.backKey = back.id;
    materials.backMaterialId = back.id;
    materials.backName = back.displayName;
    materials.backColor = back.preview.colorHex;
  }

  if ("worktopThicknessMm" in record) {
    record.worktopThicknessMm = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm);
  }

  updateCommercialSelections(record, (current) => {
    const boardMaterials = { ...current.boardMaterials };
    const boardThicknesses = { ...current.boardThicknesses };

    for (const slot of cornerShelfLowerSnapshot.slotAssignments ?? []) {
      const family = (slot.boardFamily ?? slot.assignedMaterial.family ?? null) as KitchenBoardFamily | null;
      if (!family || family === "worktop") continue;
      const selected = getKitchenMaterial(ctx, family);
      if (!selected) continue;
      boardMaterials[slot.slotId] = selected.id;
      boardThicknesses[slot.slotId] = selected.defaultThicknessMm;
    }

    return {
      boardMaterials,
      boardThicknesses
    };
  });

  Object.assign(
    record,
    normalizeCornerShelfLowerParams(record as CornerShelfLowerParams)
  );
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
  return params;
}
