import * as THREE from "three";
import {
  getPortableMaterialsSnapshotSelections,
  type PortableMaterialsSnapshot
} from "./portableCommercial";
import { getComponentDefinitionById } from "../../data/pricing/componentDefinitions";
import { getComponentGeometryDefinitionForComponentId } from "../../data/pricing/componentGeometryDefinitions";
import { getMaterialDefinitionById } from "../../data/pricing/materialDefinitions";
import type { ComponentGeometryDefinition } from "../../data/pricing/types";

export type PortableGeometryPart = {
  id: string;
  label: string;
  kind: "panel" | "front" | "drawer-box" | "back-panel" | "hardware" | "support";
  materialRole: "body" | "front" | "drawer" | "hardware";
  sizeMm: {
    width: number;
    height: number;
    depth: number;
    thickness: number;
  };
  quantity: number;
  paramKeys: string[];
  formulas: Record<string, string>;
  notes?: string[];
};

export type PortableGeometrySnapshot = {
  moduleType: string;
  displayName: string;
  dimensions: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
    worktopThicknessMm: number;
    plinthHeightMm: number;
  };
  parameterEffects: Array<{
    parameter: string;
    effect: string;
  }>;
  parts: PortableGeometryPart[];
};

type PortableLiveMaterial = {
  name?: string | null;
  colorHex?: string | null;
  transparent?: boolean;
  opacity?: number | null;
};

type PortableLiveVector = {
  x: number;
  y: number;
  z: number;
};

type PortableLivePart = {
  name: string;
  selectable?: boolean;
  visible?: boolean;
  paramKeys?: string[];
  positionMm?: PortableLiveVector;
  sizeMm?: PortableLiveVector;
  centerMm?: PortableLiveVector;
  materials?: PortableLiveMaterial[];
};

export type PortableLiveStateSnapshot = {
  moduleType: string;
  displayName?: string;
  params?: Record<string, unknown>;
  liveRuntime?: {
    moduleType?: string;
    params?: Record<string, unknown>;
    parts?: PortableLivePart[];
  };
};

const MM_TO_M = 0.001;

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ensureRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function evaluateFormula(
  expression: string | undefined,
  context: Record<string, unknown>,
  fallback: number
): number {
  if (!expression) return fallback;
  try {
    const evaluator = new Function("context", `with (context) { return (${expression}); }`) as (
      context: Record<string, unknown>
    ) => unknown;
    const next = evaluator(context);
    return typeof next === "number" && Number.isFinite(next) ? next : fallback;
  } catch {
    return fallback;
  }
}

function resolveSnapshotDimensions(params: Record<string, unknown>, snapshot: PortableGeometrySnapshot) {
  return {
    widthMm: getNumber(params.width, getNumber(params.lengthX, snapshot.dimensions.widthMm)),
    heightMm: getNumber(params.height, snapshot.dimensions.heightMm),
    depthMm: getNumber(params.lengthZ, getNumber(params.depth, snapshot.dimensions.depthMm)),
    worktopThicknessMm: getNumber(params.worktopThicknessMm, snapshot.dimensions.worktopThicknessMm),
    plinthHeightMm: getNumber(params.plinthHeight, snapshot.dimensions.plinthHeightMm)
  };
}

function resolveLiveDimensions(params: Record<string, unknown>, baseParams: Record<string, unknown>) {
  return {
    widthMm: getNumber(params.width, getNumber(params.lengthX, getNumber(baseParams.width, getNumber(baseParams.lengthX, 800)))),
    heightMm: getNumber(params.height, getNumber(baseParams.height, 720)),
    depthMm: getNumber(params.lengthZ, getNumber(params.depth, getNumber(baseParams.lengthZ, getNumber(baseParams.depth, 560)))),
    worktopThicknessMm: getNumber(params.worktopThicknessMm, getNumber(baseParams.worktopThicknessMm, 38)),
    plinthHeightMm: getNumber(params.plinthHeight, getNumber(baseParams.plinthHeight, 100)),
    plinthSetbackMm: getNumber(params.plinthSetbackMm, getNumber(baseParams.plinthSetbackMm, 0))
  };
}

function resolveDrawerFrontHeights(params: Record<string, unknown>, snapshot: PortableGeometrySnapshot): number[] {
  const raw = params.drawerFrontHeights;
  if (Array.isArray(raw)) {
    const values = raw.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
    if (values.length > 0) return values;
  }
  return snapshot.parts.filter((part) => part.kind === "front").map((part) => part.sizeMm.height);
}

function resolvePartSize(
  part: PortableGeometryPart,
  params: Record<string, unknown>,
  snapshot: PortableGeometrySnapshot,
  drawerHeights: number[]
) {
  const dimensions = resolveSnapshotDimensions(params, snapshot);
  const boardThickness = getNumber(params.boardThickness, 18);
  const backThickness = getNumber(params.backThickness, 8);
  const frontThicknessMm = getNumber(params.frontThicknessMm, part.sizeMm.thickness);
  const frontGap = getNumber(params.frontGap, 2);
  const sideGap = getNumber(params.sideGap, 2);
  const topGap = getNumber(params.topGap, 2);
  const bottomGap = getNumber(params.bottomGap, 2);
  const drawerBoxThickness = getNumber(params.drawerBoxThickness, part.sizeMm.thickness);
  const drawerBoxSideHeight = getNumber(params.drawerBoxSideHeight, part.sizeMm.height);
  const drawerBackReserveMm = getNumber(params.drawerBackReserveMm, 8);
  const formulaContext: Record<string, unknown> = {
    ...params,
    width: dimensions.widthMm,
    height: dimensions.heightMm,
    depth: dimensions.depthMm,
    lengthX: dimensions.widthMm,
    lengthZ: dimensions.depthMm,
    boardThickness,
    backThickness,
    frontThicknessMm,
    frontGap,
    sideGap,
    topGap,
    bottomGap,
    plinthHeight: dimensions.plinthHeightMm,
    plinthHeightMm: dimensions.plinthHeightMm,
    worktopThicknessMm: dimensions.worktopThicknessMm,
    drawerBoxThickness,
    drawerBoxSideHeight,
    drawerBackReserveMm,
    drawerFrontHeights: drawerHeights
  };

  return {
    width: Math.max(1, evaluateFormula(part.formulas.width, formulaContext, part.sizeMm.width)),
    height: Math.max(1, evaluateFormula(part.formulas.height, formulaContext, part.sizeMm.height)),
    depth: Math.max(1, evaluateFormula(part.formulas.depth, formulaContext, part.sizeMm.depth)),
    thickness: Math.max(1, evaluateFormula(part.formulas.thickness, formulaContext, part.sizeMm.thickness))
  };
}

function getFallbackMaterial(part: PortableGeometryPart) {
  if (part.materialRole === "front") {
    return new THREE.MeshStandardMaterial({ color: 0x5b7dd3, roughness: 0.6, metalness: 0.05 });
  }
  if (part.materialRole === "drawer") {
    return new THREE.MeshStandardMaterial({ color: 0xd8a25f, roughness: 0.7, metalness: 0.05 });
  }
  if (part.materialRole === "hardware") {
    return new THREE.MeshStandardMaterial({ color: 0x434955, roughness: 0.45, metalness: 0.3 });
  }
  return new THREE.MeshStandardMaterial({ color: 0xb8bcc7, roughness: 0.78, metalness: 0.02 });
}

function placePart(args: {
  part: PortableGeometryPart;
  index: number;
  size: { width: number; height: number; depth: number; thickness: number };
  params: Record<string, unknown>;
  snapshot: PortableGeometrySnapshot;
  drawerHeights: number[];
}): THREE.Vector3 {
  const { part, index, size, params, snapshot, drawerHeights } = args;
  const dims = resolveSnapshotDimensions(params, snapshot);
  const widthMm = dims.widthMm;
  const heightMm = dims.heightMm;
  const depthMm = dims.depthMm;
  const plinthHeightMm = dims.plinthHeightMm;
  const frontGap = getNumber(params.frontGap, 2);
  const frontThicknessMm = getNumber(params.frontThicknessMm, size.thickness);
  const plinthSetbackMm = getNumber(params.plinthSetbackMm, 0);
  const boardThickness = getNumber(params.boardThickness, 18);

  const frontParts = snapshot.parts.filter((entry) => entry.kind === "front");
  const frontIndex =
    part.kind === "front" || part.kind === "drawer-box" || (part.kind === "hardware" && /handle/i.test(part.id))
      ? Math.max(
          0,
          snapshot.parts
            .filter((entry) => entry.kind === "front")
            .findIndex((entry) => entry.id === part.id.replace("drawer-box", "drawer-front"))
        )
      : -1;

  let drawerCursor = plinthHeightMm + getNumber(params.bottomGap, 2);
  const drawerCenters = drawerHeights.map((drawerHeight) => {
    const center = drawerCursor + drawerHeight / 2;
    drawerCursor += drawerHeight + frontGap;
    return center;
  });

  if (/left/i.test(part.id)) {
    return new THREE.Vector3(
      (-widthMm / 2 + size.thickness / 2) * MM_TO_M,
      (plinthHeightMm + size.height / 2) * MM_TO_M,
      0
    );
  }

  if (/right/i.test(part.id)) {
    return new THREE.Vector3(
      (widthMm / 2 - size.thickness / 2) * MM_TO_M,
      (plinthHeightMm + size.height / 2) * MM_TO_M,
      0
    );
  }

  if (/back/i.test(part.id)) {
    return new THREE.Vector3(
      0,
      (plinthHeightMm + size.height / 2 + boardThickness) * MM_TO_M,
      (-depthMm / 2 + size.depth / 2) * MM_TO_M
    );
  }

  if (/plinth|kick/i.test(part.id)) {
    return new THREE.Vector3(
      0,
      size.height * 0.5 * MM_TO_M,
      (depthMm / 2 - size.depth / 2 - plinthSetbackMm) * MM_TO_M
    );
  }

  if (/top/i.test(part.id)) {
    return new THREE.Vector3(0, (heightMm - dims.worktopThicknessMm - size.thickness / 2) * MM_TO_M, 0);
  }

  if (/bottom/i.test(part.id)) {
    return new THREE.Vector3(0, (plinthHeightMm + size.thickness / 2) * MM_TO_M, 0);
  }

  if (part.kind === "front") {
    const resolvedIndex = frontIndex >= 0 ? frontIndex : Math.min(index, Math.max(0, frontParts.length - 1));
    const centerY = drawerCenters[resolvedIndex] ?? plinthHeightMm + size.height / 2;
    return new THREE.Vector3(0, centerY * MM_TO_M, (depthMm / 2 + size.depth / 2) * MM_TO_M);
  }

  if (part.kind === "drawer-box") {
    const resolvedIndex = frontIndex >= 0 ? frontIndex : 0;
    const centerY = drawerCenters[resolvedIndex] ?? plinthHeightMm + size.height / 2;
    return new THREE.Vector3(
      0,
      centerY * MM_TO_M,
      (depthMm / 2 - frontThicknessMm - size.depth / 2 - 12) * MM_TO_M
    );
  }

  if (part.kind === "hardware" && /handle/i.test(part.id)) {
    const centerY = drawerCenters[0] ?? heightMm / 2;
    return new THREE.Vector3(0, centerY * MM_TO_M, (depthMm / 2 + size.depth / 2 + frontThicknessMm) * MM_TO_M);
  }

  return new THREE.Vector3(
    (((index % 3) - 1) * (widthMm * 0.15)) * MM_TO_M,
    (heightMm + 40 + Math.floor(index / 3) * 50) * MM_TO_M,
    0
  );
}

function toMeshPositionCentered(positionMm: number, axisSizeMm: number, spanMm: number, stretch: boolean) {
  const leftGapMm = positionMm - axisSizeMm / 2 + spanMm / 2;
  const rightGapMm = spanMm / 2 - (positionMm + axisSizeMm / 2);
  const anchoredLeft = leftGapMm <= rightGapMm;
  if (stretch) {
    const nextSizeMm = Math.max(1, spanMm - leftGapMm - rightGapMm);
    const nextPositionMm = -spanMm / 2 + leftGapMm + nextSizeMm / 2;
    return { positionMm: nextPositionMm, sizeMm: nextSizeMm };
  }
  const nextPositionMm = anchoredLeft
    ? -spanMm / 2 + leftGapMm + axisSizeMm / 2
    : spanMm / 2 - rightGapMm - axisSizeMm / 2;
  return { positionMm: nextPositionMm, sizeMm: axisSizeMm };
}

function toMeshPositionVertical(
  positionMm: number,
  axisSizeMm: number,
  baseHeightMm: number,
  nextHeightMm: number,
  gapAdjustments: { bottomMm?: number; topMm?: number },
  stretch: boolean
) {
  const bottomGapMm = positionMm - axisSizeMm / 2 + (gapAdjustments.bottomMm ?? 0);
  const topGapMm = baseHeightMm - (positionMm + axisSizeMm / 2) + (gapAdjustments.topMm ?? 0);
  if (stretch) {
    const nextSizeMm = Math.max(1, nextHeightMm - bottomGapMm - topGapMm);
    const nextPositionMm = bottomGapMm + nextSizeMm / 2;
    return { positionMm: nextPositionMm, sizeMm: nextSizeMm };
  }
  const anchoredBottom = bottomGapMm <= topGapMm;
  const nextPositionMm = anchoredBottom
    ? bottomGapMm + axisSizeMm / 2
    : nextHeightMm - topGapMm - axisSizeMm / 2;
  return { positionMm: nextPositionMm, sizeMm: axisSizeMm };
}

function shouldStretchAxis(part: PortableLivePart, axis: "x" | "y" | "z", spanMm: number, axisSizeMm: number) {
  const keys = new Set(part.paramKeys ?? []);
  if (axis === "x" && !keys.has("width")) return false;
  if (axis === "z" && !keys.has("depth")) return false;
  if (
    axis === "y" &&
    !keys.has("height") &&
    !keys.has("plinthHeight") &&
    !keys.has("worktopThicknessMm") &&
    !keys.has("drawerFrontHeights")
  ) {
    return false;
  }

  if (axisSizeMm >= spanMm * 0.45) return true;
  const sizes = part.sizeMm;
  if (!sizes) return false;
  const orthogonal = axis === "x" ? [sizes.y, sizes.z] : axis === "y" ? [sizes.x, sizes.z] : [sizes.x, sizes.y];
  return axisSizeMm >= Math.max(...orthogonal) * 1.25;
}

function makeRuntimeMaterial(part: PortableLivePart) {
  const firstVisibleMaterial = part.materials?.find((entry) => !!entry.colorHex);
  const color = firstVisibleMaterial?.colorHex ?? "#b8bcc7";
  const transparent = firstVisibleMaterial?.transparent === true;
  const opacity = clamp(getNumber(firstVisibleMaterial?.opacity, 1), 0, 1);
  const roughness = transparent ? 0.35 : 0.72;
  const metalness = /screw|rail|handle|clip|leg/i.test(part.name) ? 0.35 : 0.04;
  return new THREE.MeshStandardMaterial({
    color,
    transparent,
    opacity,
    roughness,
    metalness
  });
}

function canonicalizePortableBoardPartName(partName: string) {
  if (partName === "side_end_x") return "left-side";
  if (partName === "side_end_z") return "right-side";
  if (partName === "back_x") return "back-panel-x";
  if (partName === "back_z") return "back-panel-z";
  if (partName === "back_corner_panel") return "back-corner-panel";
  if (partName === "bottom_x") return "bottom-panel-x";
  if (partName === "bottom_z") return "bottom-panel-z";
  if (partName === "top_x_front") return "top-panel-x-front";
  if (partName === "top_x_back") return "top-panel-x-back";
  if (partName === "top_z") return "top-panel-z";
  if (partName === "kick_x") return "plinth-x";
  if (partName === "kick_z") return "plinth-z";
  if (partName === "door_front_x") return "door-front-x";
  if (partName === "door_front_z") return "door-front-z";
  const cornerShelfMatch = partName.match(/^shelf_(\d+)_(x|z)$/i);
  if (cornerShelfMatch) return `shelf-${cornerShelfMatch[1]}-${cornerShelfMatch[2]!.toLowerCase()}`;
  if (partName === "leftSide") return "left-side";
  if (partName === "rightSide") return "right-side";
  if (partName === "bottom") return "bottom-panel";
  if (partName === "topRailFront" || partName === "topRailBack") return "top-panel";
  if (partName === "back") return "back-panel";
  if (partName === "kick") return "plinth";
  const frontMatch = partName.match(/^front_(\d+)$/i);
  if (frontMatch) return `drawer-front-${frontMatch[1]}`;
  const drawerSideMatch = partName.match(/^drawer_(\d+)_side[LR]$/i);
  if (drawerSideMatch) return `drawer-box-${drawerSideMatch[1]}-side-panels`;
  const drawerBackMatch = partName.match(/^drawer_(\d+)_back$/i);
  if (drawerBackMatch) return `drawer-box-${drawerBackMatch[1]}-front-back-panels`;
  const drawerBottomMatch = partName.match(/^drawer_(\d+)_bottom$/i);
  if (drawerBottomMatch) return `drawer-box-${drawerBottomMatch[1]}-bottom-panel`;
  return null;
}

function resolvePortableBoardSlot(partName: string, snapshot: PortableMaterialsSnapshot | null | undefined) {
  const slotAssignments = snapshot?.slotAssignments ?? [];
  const exact = slotAssignments.find((slot) => slot.slotId === partName || slot.partId === partName);
  if (exact) return exact.slotId;

  const canonical = canonicalizePortableBoardPartName(partName);
  if (!canonical) return null;
  return slotAssignments.find((slot) => slot.slotId === canonical || slot.partId === canonical)?.slotId ?? canonical;
}

function getLegacyMaterialIdForFamily(
  family: string | undefined,
  params: Record<string, unknown>
) {
  const materials = ensureRecord(params.materials);
  const readString = (...values: unknown[]) =>
    values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

  if (family === "front") {
    return readString(params.frontMaterialId, materials?.frontMaterialId, materials?.frontKey);
  }
  if (family === "back") {
    return readString(params.backMaterialId, materials?.backMaterialId, materials?.backKey);
  }
  if (family === "drawer_bottom" || family === "drawer_box" || family === "drawer") {
    return readString(params.drawerMaterialId, materials?.drawerMaterialId, materials?.drawerKey);
  }
  if (family === "shelf") {
    return readString(params.shelfMaterialId, materials?.shelfMaterialId, materials?.bodyMaterialId, materials?.bodyKey);
  }
  return readString(params.bodyMaterialId, materials?.bodyMaterialId, materials?.bodyKey);
}

function getLegacyMaterialColorForFamily(
  family: string | undefined,
  params: Record<string, unknown>
) {
  const materials = ensureRecord(params.materials);
  const readString = (...values: unknown[]) =>
    values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

  if (family === "front") {
    return readString(params.frontColor, materials?.frontColor);
  }
  if (family === "back") {
    return readString(params.backColor, materials?.backColor);
  }
  if (family === "drawer_bottom" || family === "drawer_box" || family === "drawer") {
    return readString(params.drawerColor, materials?.drawerColor);
  }
  if (family === "shelf") {
    return readString(params.shelfColor, materials?.shelfColor, params.bodyColor, materials?.bodyColor);
  }
  return readString(params.bodyColor, materials?.bodyColor);
}

function resolvePortableComponentAssignment(partName: string, params: Record<string, unknown>, snapshot: PortableMaterialsSnapshot | null | undefined) {
  const componentAssignments = snapshot?.componentAssignments ?? [];
  const findAssigned = (assignmentKey: string) => componentAssignments.find((entry) => entry.assignmentKey === assignmentKey)?.component ?? null;

  if (/^handle_/i.test(partName) || /^doorHandle_/i.test(partName)) {
    const explicit = typeof params.handleComponentId === "string" ? getComponentDefinitionById(params.handleComponentId) : null;
    return explicit ? { ...explicit, catalogId: explicit.id } : (findAssigned("door-handles") ?? findAssigned("drawer-handles"));
  }
  if (/^leg_/i.test(partName)) {
    const explicit = typeof params.legComponentId === "string" ? getComponentDefinitionById(params.legComponentId) : null;
    return explicit ? { ...explicit, catalogId: explicit.id } : findAssigned("adjustable-legs");
  }
  if (/^drawer_\d+_rail[LR]$/i.test(partName)) {
    const explicit = typeof params.runnerComponentId === "string" ? getComponentDefinitionById(params.runnerComponentId) : null;
    return explicit ? { ...explicit, catalogId: explicit.id } : findAssigned("drawer-runners");
  }
  if (/^hinge_/i.test(partName)) {
    const explicit = typeof params.hingeComponentId === "string" ? getComponentDefinitionById(params.hingeComponentId) : null;
    return explicit ? { ...explicit, catalogId: explicit.id } : findAssigned("door-hinges");
  }
  if (/^kickClip_/i.test(partName) || /^plinth-clip/i.test(partName)) {
    const explicit = typeof params.clipComponentId === "string" ? getComponentDefinitionById(params.clipComponentId) : null;
    return explicit ? { ...explicit, catalogId: explicit.id } : findAssigned("plinth-clips");
  }
  return null;
}

function resolveLivePartOverride(
  partName: string,
  params: Record<string, unknown>,
  snapshot: PortableMaterialsSnapshot | null | undefined
) {
  const boardSlot = resolvePortableBoardSlot(partName, snapshot);
  if (boardSlot) {
    const { slotMaterialCatalogIds, slotThicknesses } = getPortableMaterialsSnapshotSelections(snapshot, params);
    const slotAssignment = (snapshot?.slotAssignments ?? []).find((slot) => slot.slotId === boardSlot || slot.partId === boardSlot) ?? null;
    const selectedCatalogId = slotMaterialCatalogIds[boardSlot];
    const legacyCatalogId = getLegacyMaterialIdForFamily(slotAssignment?.boardFamily, params);
    const selectedMaterial =
      (selectedCatalogId ? getMaterialDefinitionById(selectedCatalogId) : null) ??
      (legacyCatalogId ? getMaterialDefinitionById(legacyCatalogId) : null);
    if (selectedMaterial) {
      return {
        colorHex: selectedMaterial.preview.colorHex,
        roughness: selectedMaterial.preview.roughness,
        metalness: selectedMaterial.preview.metalness,
        thicknessMm:
          slotThicknesses[boardSlot] ??
          (slotAssignment?.thicknessParameterKey && typeof params[slotAssignment.thicknessParameterKey] === "number"
            ? (params[slotAssignment.thicknessParameterKey] as number)
            : selectedMaterial.defaultThicknessMm)
      };
    }

    const legacyColor = getLegacyMaterialColorForFamily(slotAssignment?.boardFamily, params);
    if (legacyColor) {
      return {
        colorHex: legacyColor,
        roughness: 0.72,
        metalness: 0.04,
        thicknessMm:
          slotThicknesses[boardSlot] ??
          (slotAssignment?.thicknessParameterKey && typeof params[slotAssignment.thicknessParameterKey] === "number"
            ? (params[slotAssignment.thicknessParameterKey] as number)
            : null)
      };
    }
  }

  const component = resolvePortableComponentAssignment(partName, params, snapshot);
  if (component) {
    const geometry = getComponentGeometryDefinitionForComponentId(component.catalogId);
    return {
      colorHex: component.preview.colorHex,
      roughness: component.preview.roughness,
      metalness: component.preview.metalness,
      thicknessMm: null as number | null,
      componentGeometry: geometry
    };
  }

  return null;
}

function applyComponentGeometrySize(
  part: PortableLivePart,
  sizeMm: { x: number; y: number; z: number },
  componentGeometry: ComponentGeometryDefinition | null | undefined
) {
  if (!componentGeometry) return sizeMm;
  const next = { ...sizeMm };
  const dims = componentGeometry.dimensionsMm;

  if (componentGeometry.componentType === "handle") {
    if (componentGeometry.archetype === "handle_knob") {
      const diameterMm = Math.max(1, dims.diameterMm ?? dims.widthMm ?? sizeMm.y);
      const projectionMm = Math.max(1, dims.projectionMm ?? dims.depthMm ?? sizeMm.z);
      if (/front_z/i.test(part.name)) {
        next.x = diameterMm;
        next.y = diameterMm;
        next.z = projectionMm;
      } else {
        next.x = projectionMm;
        next.y = diameterMm;
        next.z = diameterMm;
      }
      return next;
    }

    const lengthMm = Math.max(1, dims.lengthMm ?? sizeMm.x ?? sizeMm.z);
    const heightMm = Math.max(1, dims.heightMm ?? dims.thicknessMm ?? sizeMm.y);
    const projectionMm = Math.max(1, dims.projectionMm ?? dims.depthMm ?? sizeMm.z);
    if (/front_z/i.test(part.name)) {
      next.x = lengthMm;
      next.y = heightMm;
      next.z = projectionMm;
    } else {
      next.x = projectionMm;
      next.y = heightMm;
      next.z = lengthMm;
    }
    return next;
  }

  if (componentGeometry.componentType === "leg") {
    next.x = Math.max(1, dims.widthMm ?? dims.diameterMm ?? sizeMm.x);
    next.y = Math.max(1, dims.heightMm ?? sizeMm.y);
    next.z = Math.max(1, dims.depthMm ?? dims.diameterMm ?? sizeMm.z);
    return next;
  }

  if (componentGeometry.componentType === "hinge") {
    if (/front_z/i.test(part.name)) {
      next.x = Math.max(1, dims.widthMm ?? sizeMm.x);
      next.y = Math.max(1, dims.heightMm ?? sizeMm.y);
      next.z = Math.max(1, dims.depthMm ?? sizeMm.z);
    } else {
      next.x = Math.max(1, dims.depthMm ?? sizeMm.x);
      next.y = Math.max(1, dims.heightMm ?? sizeMm.y);
      next.z = Math.max(1, dims.widthMm ?? sizeMm.z);
    }
    return next;
  }

  if (componentGeometry.componentType === "plinth_clip") {
    next.x = Math.max(1, dims.widthMm ?? sizeMm.x);
    next.y = Math.max(1, dims.heightMm ?? sizeMm.y);
    next.z = Math.max(1, dims.depthMm ?? sizeMm.z);
    return next;
  }

  return next;
}

function getPrimaryAxis(size: PortableLiveVector): "x" | "y" | "z" {
  if (size.x >= size.y && size.x >= size.z) return "x";
  if (size.y >= size.x && size.y >= size.z) return "y";
  return "z";
}

type LivePartGeometry = {
  axis: "x" | "y" | "z" | null;
  geometry: THREE.BufferGeometry;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
};

function createCylinderGeometry(
  axis: "x" | "y" | "z",
  radiusMm: number,
  heightMm: number,
  options?: {
    radialSegments?: number;
    openEnded?: boolean;
    thetaStart?: number;
    thetaLength?: number;
    rotationX?: number;
    rotationY?: number;
    rotationZ?: number;
  }
): LivePartGeometry {
  return {
    axis,
    geometry: new THREE.CylinderGeometry(
      radiusMm * MM_TO_M,
      radiusMm * MM_TO_M,
      heightMm * MM_TO_M,
      options?.radialSegments ?? 24,
      1,
      options?.openEnded ?? false,
      options?.thetaStart ?? 0,
      options?.thetaLength ?? Math.PI * 2
    ),
    rotationX: options?.rotationX,
    rotationY: options?.rotationY,
    rotationZ: options?.rotationZ
  };
}

function createLegGeometry(sizeMm: PortableLiveVector) {
  return createCylinderGeometry("y", Math.max(sizeMm.x, sizeMm.z) / 2, sizeMm.y);
}

function createCollarGeometry(sizeMm: PortableLiveVector) {
  const gapAngle = Math.PI * 0.35;
  const radiusMm = Math.max(sizeMm.x, sizeMm.z) / 2;
  return createCylinderGeometry("y", radiusMm, sizeMm.y, {
    radialSegments: 24,
    openEnded: true,
    thetaStart: gapAngle / 2,
    thetaLength: Math.PI * 2 - gapAngle,
    rotationY: Math.PI
  });
}

function createScrewGeometry(part: PortableLivePart, sizeMm: PortableLiveVector) {
  const axis = /head/i.test(part.name) ? "z" : getPrimaryAxis(sizeMm);
  const radiusMm =
    axis === "x"
      ? Math.max(sizeMm.y, sizeMm.z) / 2
      : axis === "y"
        ? Math.max(sizeMm.x, sizeMm.z) / 2
        : Math.max(sizeMm.x, sizeMm.y) / 2;
  const heightMm = axis === "x" ? sizeMm.x : axis === "y" ? sizeMm.y : sizeMm.z;
  return createCylinderGeometry(axis, radiusMm, heightMm, {
    radialSegments: /head/i.test(part.name) ? 16 : 12
  });
}

function createLivePartGeometry(
  part: PortableLivePart,
  sizeMm: PortableLiveVector,
  componentGeometry?: ComponentGeometryDefinition | null
): LivePartGeometry {
  if (componentGeometry?.componentType === "handle") {
    if (componentGeometry.archetype === "handle_knob") {
      const axis = /front_z/i.test(part.name) ? "z" : "x";
      const radiusMm = Math.max(sizeMm.x, sizeMm.y, sizeMm.z) / 2;
      const heightMm = axis === "z" ? sizeMm.z : sizeMm.x;
      return createCylinderGeometry(axis, radiusMm, heightMm, {
        radialSegments: 24
      });
    }
    if (componentGeometry.archetype === "handle_bar") {
      const axis = /front_z/i.test(part.name) ? "x" : "z";
      const radiusMm = Math.max(sizeMm.y, Math.min(sizeMm.x, sizeMm.z)) / 2;
      const heightMm = axis === "x" ? sizeMm.x : sizeMm.z;
      return createCylinderGeometry(axis, radiusMm, heightMm, {
        radialSegments: 18
      });
    }
  }
  if (/^leg_/i.test(part.name)) {
    return createLegGeometry(sizeMm);
  }
  if (/_collar$/i.test(part.name)) {
    return createCollarGeometry(sizeMm);
  }
  if (/screw/i.test(part.name)) {
    return createScrewGeometry(part, sizeMm);
  }
  return {
    axis: null,
    geometry: new THREE.BoxGeometry(
      Math.max(1, sizeMm.x) * MM_TO_M,
      Math.max(1, sizeMm.y) * MM_TO_M,
      Math.max(1, sizeMm.z) * MM_TO_M
    )
  };
}

function orientLivePartMesh(mesh: THREE.Mesh, axis: "x" | "y" | "z" | null) {
  if (axis === "x") {
    mesh.rotation.z = Math.PI / 2;
    return;
  }
  if (axis === "z") {
    mesh.rotation.x = Math.PI / 2;
  }
}

function buildMeshFromLivePart(
  part: PortableLivePart,
  currentParams: Record<string, unknown>,
  baseParams: Record<string, unknown>,
  materialsSnapshot?: PortableMaterialsSnapshot | null
) {
  if (!part.sizeMm) return null;
  const baseDims = resolveLiveDimensions(baseParams, baseParams);
  const nextDims = resolveLiveDimensions(currentParams, baseParams);
  const center = part.centerMm ?? part.positionMm;
  if (!center) return null;

  const stretchX = shouldStretchAxis(part, "x", baseDims.widthMm, part.sizeMm.x);
  const stretchY = shouldStretchAxis(part, "y", baseDims.heightMm, part.sizeMm.y);
  const stretchZ = shouldStretchAxis(part, "z", baseDims.depthMm, part.sizeMm.z);

  const x = toMeshPositionCentered(center.x, part.sizeMm.x, nextDims.widthMm, stretchX);
  const y = toMeshPositionVertical(center.y, part.sizeMm.y, baseDims.heightMm, nextDims.heightMm, {
    bottomMm:
      (part.paramKeys ?? []).includes("plinthHeight") ? nextDims.plinthHeightMm - baseDims.plinthHeightMm : 0,
    topMm:
      (part.paramKeys ?? []).includes("worktopThicknessMm")
        ? nextDims.worktopThicknessMm - baseDims.worktopThicknessMm
        : 0
  }, stretchY);
  const z = toMeshPositionCentered(
    center.z,
    part.sizeMm.z,
    nextDims.depthMm,
    stretchZ
  );

  if ((part.paramKeys ?? []).includes("plinthSetbackMm")) {
    const delta = nextDims.plinthSetbackMm - baseDims.plinthSetbackMm;
    const positiveFaceGap = nextDims.depthMm / 2 - (z.positionMm + z.sizeMm / 2);
    const negativeFaceGap = z.positionMm - z.sizeMm / 2 + nextDims.depthMm / 2;
    if (positiveFaceGap <= negativeFaceGap) {
      z.positionMm -= delta;
    }
  }

  const sizeMm = {
    x: Math.max(1, x.sizeMm),
    y: Math.max(1, y.sizeMm),
    z: Math.max(1, z.sizeMm)
  };
  const override = resolveLivePartOverride(part.name, currentParams, materialsSnapshot);
  const componentGeometry = override?.componentGeometry ?? null;
  if (override?.thicknessMm) {
    const minAxis = (["x", "y", "z"] as const).sort((left, right) => sizeMm[left] - sizeMm[right])[0];
    sizeMm[minAxis] = Math.max(1, override.thicknessMm);
  }
  const geometrySize = applyComponentGeometrySize(part, sizeMm, componentGeometry);
  const { geometry, axis, rotationX, rotationY, rotationZ } = createLivePartGeometry(part, geometrySize, componentGeometry);
  const mesh = new THREE.Mesh(
    geometry,
    override
      ? new THREE.MeshStandardMaterial({
          color: override.colorHex,
          roughness: override.roughness,
          metalness: override.metalness
        })
      : makeRuntimeMaterial(part)
  );
  mesh.name = part.name;
  mesh.position.set(x.positionMm * MM_TO_M, y.positionMm * MM_TO_M, z.positionMm * MM_TO_M);
  orientLivePartMesh(mesh, axis);
  if (typeof rotationX === "number") mesh.rotation.x += rotationX;
  if (typeof rotationY === "number") mesh.rotation.y += rotationY;
  if (typeof rotationZ === "number") mesh.rotation.z += rotationZ;
  mesh.visible = part.visible !== false;
  mesh.userData.selectable = part.selectable !== false;
  mesh.userData.paramKeys = [...(part.paramKeys ?? [])];
  mesh.userData.dimensionsMm = {
    width: geometrySize.x,
    height: geometrySize.y,
    depth: geometrySize.z
  };
  return mesh;
}

export function buildPortableLiveModuleGroup(
  params: Record<string, unknown>,
  snapshot: PortableLiveStateSnapshot,
  materialsSnapshot?: PortableMaterialsSnapshot | null
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${snapshot.moduleType}PortableLiveModule`;
  const baseParams = snapshot.liveRuntime?.params ?? snapshot.params ?? {};
  const parts = snapshot.liveRuntime?.parts ?? [];
  for (const part of parts) {
    const mesh = buildMeshFromLivePart(part, params, baseParams, materialsSnapshot);
    if (!mesh) continue;
    group.add(mesh);
  }
  return group;
}

export function buildPortableModuleGroup(
  params: Record<string, unknown>,
  snapshot: PortableGeometrySnapshot
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${snapshot.moduleType}PortableModule`;
  const drawerHeights = resolveDrawerFrontHeights(params, snapshot);

  snapshot.parts.forEach((part, index) => {
    const size = resolvePartSize(part, params, snapshot, drawerHeights);
    const quantity = Math.max(1, Math.round(part.quantity));
    for (let copyIndex = 0; copyIndex < quantity; copyIndex += 1) {
      const geometry = new THREE.BoxGeometry(
        Math.max(size.width, 1) * MM_TO_M,
        Math.max(size.height, 1) * MM_TO_M,
        Math.max(size.depth, 1) * MM_TO_M
      );
      const mesh = new THREE.Mesh(geometry, getFallbackMaterial(part));
      mesh.name = quantity === 1 ? part.id : `${part.id}_${copyIndex + 1}`;
      mesh.position.copy(placePart({ part, index, size, params, snapshot, drawerHeights }));
      if (quantity > 1 && !/handle/i.test(part.id)) {
        mesh.position.x += (copyIndex - (quantity - 1) / 2) * Math.max(size.width * 1.1, 60) * MM_TO_M;
      }
      mesh.userData.selectable = true;
      mesh.userData.paramKeys = [...part.paramKeys];
      mesh.userData.dimensionsMm = {
        width: size.width,
        height: size.height,
        depth: size.depth
      };
      mesh.userData.portablePart = {
        id: part.id,
        label: part.label,
        kind: part.kind,
        materialRole: part.materialRole,
        notes: part.notes ?? []
      };
      group.add(mesh);
    }
  });

  return group;
}
