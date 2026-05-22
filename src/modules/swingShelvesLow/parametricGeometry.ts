import * as THREE from "three";
import type { ClientCatalog, ComponentType, MaterialDefinition } from "../../core/catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../../core/catalog/material-render-request";
import type { PortableMaterialsSnapshot } from "../runtime/portableCommercial";
import { getPortableMaterialsSnapshotSelections } from "../runtime/portableCommercial";
import {
  createModuleRuntimeCatalogContext,
  type MaterialFallbackKind,
  type ModuleRuntimeCatalogContext
} from "../runtime/runtimeCatalog";
import { normalizeSwingShelvesLowParams, type SwingShelvesLowParams } from "./types";

const MM_TO_M = 0.001;
const kitchenBackAnchorName = "__kitchen_back_anchor";

type PreviewMaterial = {
  colorHex: string;
  roughness: number;
  metalness: number;
  thicknessMm?: number | null;
  catalogMaterial?: MaterialDefinition;
};

type PartSizeMm = {
  width: number;
  height: number;
  depth: number;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toMeters(valueMm: number) {
  return valueMm * MM_TO_M;
}

function createMeshMaterial(preview: PreviewMaterial) {
  return new THREE.MeshStandardMaterial({
    color: preview.colorHex,
    roughness: preview.roughness,
    metalness: preview.metalness
  });
}

function tagsForPart(partName: string): string[] {
  if (/front/i.test(partName)) return ["module", "front", "door", "wood"];
  if (/back/i.test(partName)) return ["module", "back"];
  if (/shelf/i.test(partName)) return ["module", "shelf", "wood"];
  if (/plinth|kick/i.test(partName)) return ["module", "plinth"];
  return ["module", "body", "wood"];
}

function applyPartMetadata(mesh: THREE.Mesh, sizeMm: PartSizeMm, paramKeys: string[], preview?: PreviewMaterial, partName = mesh.name) {
  mesh.userData.selectable = true;
  mesh.userData.paramKeys = [...paramKeys];
  mesh.userData.tags = tagsForPart(partName);
  if (preview?.catalogMaterial) {
    mesh.userData.catalogMaterialId = preview.catalogMaterial.id;
    mesh.userData.catalogMaterialName = preview.catalogMaterial.displayName;
    mesh.userData.materialRequest = createMaterialRequestFromCatalogMaterial(preview.catalogMaterial);
  }
  mesh.userData.dimensionsMm = {
    width: sizeMm.width,
    height: sizeMm.height,
    depth: sizeMm.depth
  };
}

function addBoxPart(args: {
  group: THREE.Group;
  name: string;
  sizeMm: PartSizeMm;
  positionMm: { x: number; y: number; z: number };
  preview: PreviewMaterial;
  paramKeys: string[];
}) {
  const geometry = new THREE.BoxGeometry(
    toMeters(Math.max(1, args.sizeMm.width)),
    toMeters(Math.max(1, args.sizeMm.height)),
    toMeters(Math.max(1, args.sizeMm.depth))
  );
  const mesh = new THREE.Mesh(geometry, createMeshMaterial(args.preview));
  mesh.name = args.name;
  mesh.position.set(toMeters(args.positionMm.x), toMeters(args.positionMm.y), toMeters(args.positionMm.z));
  applyPartMetadata(mesh, args.sizeMm, args.paramKeys, args.preview, args.name);
  args.group.add(mesh);
  return mesh;
}

function addCylinderPart(args: {
  group: THREE.Group;
  name: string;
  diameterMm: number;
  lengthMm: number;
  axis: "x" | "y" | "z";
  positionMm: { x: number; y: number; z: number };
  preview: PreviewMaterial;
  paramKeys: string[];
  radialSegments?: number;
}) {
  const radiusM = toMeters(Math.max(1, args.diameterMm) / 2);
  const lengthM = toMeters(Math.max(1, args.lengthMm));
  const geometry = new THREE.CylinderGeometry(
    radiusM,
    radiusM,
    lengthM,
    args.radialSegments ?? 20,
    1
  );
  const mesh = new THREE.Mesh(geometry, createMeshMaterial(args.preview));
  mesh.name = args.name;
  if (args.axis === "x") mesh.rotation.z = Math.PI / 2;
  if (args.axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(toMeters(args.positionMm.x), toMeters(args.positionMm.y), toMeters(args.positionMm.z));
  applyPartMetadata(
    mesh,
    args.axis === "x"
      ? { width: args.lengthMm, height: args.diameterMm, depth: args.diameterMm }
      : args.axis === "y"
        ? { width: args.diameterMm, height: args.lengthMm, depth: args.diameterMm }
        : { width: args.diameterMm, height: args.diameterMm, depth: args.lengthMm },
    args.paramKeys,
    args.preview,
    args.name
  );
  args.group.add(mesh);
  return mesh;
}

const fallbackBodyPreview: PreviewMaterial = {
  colorHex: "#f3f3ef",
  roughness: 0.78,
  metalness: 0.02
};

const fallbackFrontPreview: PreviewMaterial = {
  colorHex: "#d7d9dd",
  roughness: 0.9,
  metalness: 0.02
};

const fallbackBackPreview: PreviewMaterial = {
  colorHex: "#c8ccd1",
  roughness: 0.72,
  metalness: 0.02
};

const fallbackHardwarePreview: PreviewMaterial = {
  colorHex: "#3a3f4b",
  roughness: 0.45,
  metalness: 0.55
};

function resolveBoardSlot(partName: string) {
  if (partName === "leftSide") return "left-side";
  if (partName === "rightSide") return "right-side";
  if (partName === "bottom") return "bottom-panel";
  if (partName === "top") return "top-panel";
  if (partName === "back") return "back-panel";
  if (partName === "plinth") return "plinth";
  if (/^shelf-\d+-x$/i.test(partName)) return "shelf";
  if (partName === "door_front_z") return "door-front-z";
  if (partName === "door_front_x") return "door-front-x";
  return null;
}

function fallbackKindForPart(partName: string): MaterialFallbackKind {
  if (/front/i.test(partName)) return "front";
  if (/back/i.test(partName)) return "backPanel";
  if (/plinth/i.test(partName)) return "plinth";
  return "carcass";
}

function resolveBoardPreview(
  partName: string,
  params: Record<string, unknown>,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  fallback: PreviewMaterial,
  catalogContext: ModuleRuntimeCatalogContext | null
): PreviewMaterial {
  const boardSlot = resolveBoardSlot(partName);
  if (!boardSlot) return fallback;
  const { slotMaterialCatalogIds, slotThicknesses } = catalogContext
    ? getPortableMaterialsSnapshotSelections(materialsSnapshot, params, catalogContext.catalog)
    : { slotMaterialCatalogIds: {} as Record<string, string>, slotThicknesses: {} as Record<string, number> };
  const selectedCatalogId = slotMaterialCatalogIds[boardSlot];
  const selectedMaterial =
    (selectedCatalogId ? catalogContext?.getMaterialById(selectedCatalogId) : null) ??
    catalogContext?.resolveMaterial(undefined, fallbackKindForPart(partName));
  if (!selectedMaterial) return fallback;
  return {
    colorHex: selectedMaterial.preview.colorHex,
    roughness: selectedMaterial.preview.roughness,
    metalness: selectedMaterial.preview.metalness,
    thicknessMm: slotThicknesses[boardSlot] ?? selectedMaterial.defaultThicknessMm,
    catalogMaterial: selectedMaterial
  };
}

function resolveBoardThickness(
  partName: string,
  params: Record<string, unknown>,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  fallback: number,
  catalogContext: ModuleRuntimeCatalogContext | null
) {
  return getNumber(resolveBoardPreview(partName, params, materialsSnapshot, fallbackBodyPreview, catalogContext).thicknessMm, fallback);
}

function resolveComponentPreview(
  componentId: string | null | undefined,
  fallback: PreviewMaterial,
  catalogContext: ModuleRuntimeCatalogContext | null,
  componentType: ComponentType
) {
  const component = catalogContext?.resolveComponent(componentId, componentType);
  if (!component) return fallback;
  return {
    colorHex: component.preview.colorHex,
    roughness: component.preview.roughness,
    metalness: component.preview.metalness
  };
}

function getShelfGaps(params: SwingShelvesLowParams, shelfBoardCount: number, availableGapSpaceMm: number) {
  const positiveCount = Math.max(0, shelfBoardCount);
  if (positiveCount === 0) return [];

  if (params.shelfAutoFit === true) {
    const equalGapMm = Math.max(1, availableGapSpaceMm / (positiveCount + 1));
    return Array.from({ length: positiveCount }, () => equalGapMm);
  }

  const raw = Array.isArray(params.shelfGaps)
    ? params.shelfGaps.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0)
    : [];
  const next = raw.slice(0, positiveCount);
  while (next.length < positiveCount) {
    next.push(next[next.length - 1] ?? 120);
  }
  return next;
}

function getHingeCentersMm(doorBottomMm: number, doorTopMm: number, count: number, topOffsetMm: number, bottomOffsetMm: number) {
  const safeCount = Math.max(1, count);
  if (safeCount === 1) return [(doorBottomMm + doorTopMm) * 0.5];

  const firstMm = doorBottomMm + bottomOffsetMm;
  const lastMm = doorTopMm - topOffsetMm;
  if (safeCount === 2) return [firstMm, lastMm];

  return Array.from({ length: safeCount }, (_, index) => {
    const t = index / (safeCount - 1);
    return firstMm + (lastMm - firstMm) * t;
  });
}

function addDoorHandle(args: {
  group: THREE.Group;
  name: string;
  params: SwingShelvesLowParams;
  xMm: number;
  yMm: number;
  zMm: number;
  preview: PreviewMaterial;
}) {
  const handleType = typeof args.params.handleType === "string" ? args.params.handleType.trim().toLowerCase() : "bar";
  const handleLengthMm = Math.max(40, Math.round(getNumber(args.params.handleLengthMm, 160)));
  const handleSizeMm = Math.max(8, Math.round(getNumber(args.params.handleSizeMm, 12)));
  const handleProjectionMm = Math.max(6, Math.round(getNumber(args.params.handleProjectionMm, 14)));
  const handleEmbedMm = 1;
  const paramKeys = ["handleComponentId", "handleType", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"];

  if (handleType === "none") return;
  if (handleType === "knob") {
    addCylinderPart({
      group: args.group,
      name: args.name,
      diameterMm: handleSizeMm,
      lengthMm: handleProjectionMm,
      axis: "z",
      positionMm: { x: args.xMm, y: args.yMm, z: args.zMm + handleProjectionMm * 0.5 - handleEmbedMm },
      preview: args.preview,
      paramKeys
    });
    return;
  }

  addBoxPart({
    group: args.group,
    name: args.name,
    sizeMm: { width: handleLengthMm, height: handleSizeMm, depth: handleProjectionMm },
    positionMm: { x: args.xMm, y: args.yMm, z: args.zMm + handleProjectionMm * 0.5 - handleEmbedMm },
    preview: args.preview,
    paramKeys
  });
}

function addHingeAssembly(args: {
  group: THREE.Group;
  prefix: string;
  xMm: number;
  yMm: number;
  zMm: number;
  directionX: 1 | -1;
  preview: PreviewMaterial;
}) {
  const paramKeys = ["hingeComponentId", "hingeCountPerDoor", "hingeTopOffsetMm", "hingeBottomOffsetMm", "doorOpen"];
  addBoxPart({
    group: args.group,
    name: `${args.prefix}`,
    sizeMm: { width: 62, height: 34, depth: 2.5 },
    positionMm: { x: args.xMm, y: args.yMm, z: args.zMm },
    preview: args.preview,
    paramKeys
  });
  addBoxPart({
    group: args.group,
    name: `${args.prefix}_cup`,
    sizeMm: { width: 34.468, height: 35, depth: 10.45 },
    positionMm: { x: args.xMm, y: args.yMm, z: args.zMm + 8.475 },
    preview: fallbackHardwarePreview,
    paramKeys
  });
  addBoxPart({
    group: args.group,
    name: `${args.prefix}_arm`,
    sizeMm: { width: 18, height: 12, depth: 30 },
    positionMm: { x: args.xMm + args.directionX * 22, y: args.yMm, z: args.zMm - 16.25 },
    preview: fallbackHardwarePreview,
    paramKeys
  });
}

function attachDoorPivot(group: THREE.Group, pivotName: string, pivotXMm: number, pivotZMm: number, objectNames: string[]) {
  const pivot = new THREE.Group();
  pivot.name = pivotName;
  pivot.position.set(toMeters(pivotXMm), 0, toMeters(pivotZMm));
  group.add(pivot);
  group.updateMatrixWorld(true);
  for (const name of objectNames) {
    const obj = group.getObjectByName(name);
    if (!obj || obj.parent === pivot) continue;
    pivot.attach(obj);
  }
  return pivot;
}

export function buildSwingShelvesLowParametric(
  params: SwingShelvesLowParams,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  catalog: ClientCatalog
) {
  params = normalizeSwingShelvesLowParams(params);
  const catalogContext = catalog ? createModuleRuntimeCatalogContext(catalog) : null;
  const group = new THREE.Group();
  group.name = "swingShelvesLowModule";

  const widthMm = Math.max(300, Math.round(getNumber(params.width, 800)));
  const totalHeightMm = Math.max(200, Math.round(getNumber(params.height, 700)));
  const worktopThicknessMm = Math.max(0, Math.round(getNumber(params.worktopThicknessMm, 38)));
  const heightCarcassMm = Math.max(80, Math.round(getNumber(params.heightCarcass, totalHeightMm - worktopThicknessMm)));
  const totalDepthMm = Math.max(200, Math.round(getNumber(params.depth, 560)));

  const frontThicknessMm = resolveBoardThickness("door_front_z", params as Record<string, unknown>, materialsSnapshot, Math.round(getNumber(params.frontThicknessMm, 19)), catalogContext);
  const boardThicknessMm = resolveBoardThickness("leftSide", params as Record<string, unknown>, materialsSnapshot, Math.round(getNumber(params.boardThickness, 18)), catalogContext);
  const shelfThicknessMm = resolveBoardThickness("shelf-1-x", params as Record<string, unknown>, materialsSnapshot, Math.round(getNumber(params.shelfThickness, boardThicknessMm)), catalogContext);
  const backThicknessMm = resolveBoardThickness("back", params as Record<string, unknown>, materialsSnapshot, Math.round(getNumber(params.backThickness, 6)), catalogContext);

  const carcassDepthMm = Math.max(80, totalDepthMm - frontThicknessMm);
  const carcassCenterZMm = -frontThicknessMm * 0.5;
  const plinthHeightMm = clamp(Math.round(getNumber(params.plinthHeight, 100)), 0, Math.max(0, heightCarcassMm - boardThicknessMm * 2));
  const plinthSetbackMm = clamp(Math.round(getNumber(params.plinthSetbackMm, 60)), 0, Math.max(0, carcassDepthMm - boardThicknessMm));
  const sideGapMm = Math.max(0, Math.round(getNumber(params.sideGap, 2)));
  const topGapMm = Math.max(0, Math.round(getNumber(params.topGap, 2)));
  const bottomGapMm = Math.max(0, Math.round(getNumber(params.bottomGap, 2)));
  const frontGapMm = Math.max(0, Math.round(getNumber(params.frontGap, 2)));
  const hingeCount = Math.max(1, Math.round(getNumber(params.hingeCountPerDoor, 2)));
  const hingeTopOffsetMm = Math.max(0, Math.round(getNumber(params.hingeTopOffsetMm, 110)));
  const hingeBottomOffsetMm = Math.max(0, Math.round(getNumber(params.hingeBottomOffsetMm, 110)));
  const handlePositionMm = Math.max(0, Math.round(getNumber(params.handlePositionMm, 60)));
  const backGrooveDepthMm = clamp(Math.round(getNumber(params.backGrooveDepthMm, 8)), 0, boardThicknessMm);
  const backGrooveWidthMm = clamp(
    Math.round(getNumber(params.backGrooveWidthMm, 8)),
    backThicknessMm,
    Math.max(backThicknessMm, carcassDepthMm * 0.25)
  );
  const backGrooveClearanceMm = clamp(Math.round(getNumber(params.backGrooveClearanceMm, 1)), 0, boardThicknessMm);

  const sideHeightMm = Math.max(1, heightCarcassMm - plinthHeightMm);
  const innerWidthMm = Math.max(1, widthMm - boardThicknessMm * 2);
  const backVisibleWidthMm = Math.max(1, innerWidthMm + 2 * backGrooveDepthMm - backGrooveClearanceMm);
  const backVisibleHeightMm = Math.max(1, sideHeightMm - 2 * boardThicknessMm + 2 * backGrooveDepthMm - backGrooveClearanceMm);
  const backInsetHalfMm = Math.max(Math.max(backThicknessMm, backGrooveWidthMm) * 0.5, boardThicknessMm * 0.5);
  const frontPlaneZMm = totalDepthMm * 0.5 - frontThicknessMm * 0.5;
  const plinthThicknessMm = boardThicknessMm;
  const plinthCenterZMm = carcassCenterZMm + carcassDepthMm * 0.5 - plinthSetbackMm - plinthThicknessMm * 0.5;

  const bodyPreview = resolveBoardPreview("leftSide", params as Record<string, unknown>, materialsSnapshot, fallbackBodyPreview, catalogContext);
  const topPreview = resolveBoardPreview("top", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext);
  const shelfPreview = resolveBoardPreview("shelf-1-x", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext);
  const backPreview = resolveBoardPreview("back", params as Record<string, unknown>, materialsSnapshot, fallbackBackPreview, catalogContext);
  const frontPreview = resolveBoardPreview("door_front_z", params as Record<string, unknown>, materialsSnapshot, fallbackFrontPreview, catalogContext);
  const plinthPreview = resolveBoardPreview("plinth", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext);
  const handlePreview = resolveComponentPreview(
    typeof params.handleComponentId === "string" ? params.handleComponentId : null,
    fallbackHardwarePreview,
    catalogContext,
    "handle"
  );
  const hingePreview = resolveComponentPreview(
    typeof params.hingeComponentId === "string" ? params.hingeComponentId : null,
    {
      colorHex: "#aeb3bb",
      roughness: 0.25,
      metalness: 0.88
    },
    catalogContext,
    "hinge"
  );
  const legPreview = resolveComponentPreview(
    typeof params.legComponentId === "string" ? params.legComponentId : null,
    {
      colorHex: "#1e232b",
      roughness: 0.45,
      metalness: 0.55
    },
    catalogContext,
    "leg"
  );
  const clipPreview = resolveComponentPreview(
    typeof params.clipComponentId === "string" ? params.clipComponentId : null,
    {
      colorHex: "#1e232b",
      roughness: 0.45,
      metalness: 0.55
    },
    catalogContext,
    "plinth_clip"
  );

  addBoxPart({
    group,
    name: "leftSide",
    sizeMm: { width: boardThicknessMm, height: sideHeightMm, depth: carcassDepthMm },
    positionMm: { x: -widthMm * 0.5 + boardThicknessMm * 0.5, y: plinthHeightMm + sideHeightMm * 0.5, z: carcassCenterZMm },
    preview: bodyPreview,
    paramKeys: ["width", "heightCarcass", "depth", "plinthHeight", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "rightSide",
    sizeMm: { width: boardThicknessMm, height: sideHeightMm, depth: carcassDepthMm },
    positionMm: { x: widthMm * 0.5 - boardThicknessMm * 0.5, y: plinthHeightMm + sideHeightMm * 0.5, z: carcassCenterZMm },
    preview: bodyPreview,
    paramKeys: ["width", "heightCarcass", "depth", "plinthHeight", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "bottom",
    sizeMm: { width: innerWidthMm, height: boardThicknessMm, depth: carcassDepthMm },
    positionMm: { x: 0, y: plinthHeightMm + boardThicknessMm * 0.5, z: carcassCenterZMm },
    preview: resolveBoardPreview("bottom", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext),
    paramKeys: ["width", "heightCarcass", "depth", "plinthHeight", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "top",
    sizeMm: { width: innerWidthMm, height: boardThicknessMm, depth: carcassDepthMm },
    positionMm: { x: 0, y: heightCarcassMm - boardThicknessMm * 0.5, z: carcassCenterZMm },
    preview: topPreview,
    paramKeys: ["width", "heightCarcass", "depth", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "back",
    sizeMm: { width: backVisibleWidthMm, height: backVisibleHeightMm, depth: backThicknessMm },
    positionMm: {
      x: 0,
      y: plinthHeightMm + boardThicknessMm + backVisibleHeightMm * 0.5,
      z: carcassCenterZMm - carcassDepthMm * 0.5 + backInsetHalfMm
    },
    preview: backPreview,
    paramKeys: [
      "width",
      "heightCarcass",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveClearanceMm",
      "plinthHeight"
    ]
  });

  if (plinthHeightMm > 0) {
    addBoxPart({
      group,
      name: "plinth",
      sizeMm: { width: innerWidthMm, height: plinthHeightMm, depth: plinthThicknessMm },
      positionMm: { x: 0, y: plinthHeightMm * 0.5, z: plinthCenterZMm },
      preview: plinthPreview,
      paramKeys: ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]
    });
  }

  const legDiameterMm = 40;
  const legTopClearanceMm = 2;
  const legHeightMm = Math.max(1, plinthHeightMm - legTopClearanceMm);
  const frontLegZMm = carcassCenterZMm + carcassDepthMm * 0.5 - plinthSetbackMm - plinthThicknessMm - legDiameterMm * 0.5 - 10;
  const backLegZMm = carcassCenterZMm - carcassDepthMm * 0.5 + 60;
  const legOuterXMm = widthMm * 0.5 - 50;
  const frontLegNames = [
    ["leg_FL", -legOuterXMm, frontLegZMm],
    ["leg_FR", legOuterXMm, frontLegZMm],
    ["leg_BL", -legOuterXMm, backLegZMm],
    ["leg_BR", legOuterXMm, backLegZMm],
    ["leg_BC", 0, backLegZMm]
  ] as const;

  for (const [name, xMm, zMm] of frontLegNames) {
    addCylinderPart({
      group,
      name,
      diameterMm: legDiameterMm,
      lengthMm: legHeightMm,
      axis: "y",
      positionMm: { x: xMm, y: legHeightMm * 0.5, z: zMm },
      preview: legPreview,
      paramKeys: ["width", "plinthHeight", "plinthSetbackMm", "depth", "legComponentId"]
    });
  }

  for (const [name, xMm] of [
    ["leg_FL_clip", -legOuterXMm],
    ["leg_FR_clip", legOuterXMm]
  ] as const) {
    addBoxPart({
      group,
      name,
      sizeMm: { width: 47.917, height: 16, depth: 49.463 },
      positionMm: { x: xMm, y: Math.max(16, plinthHeightMm * 0.4), z: frontLegZMm + 4.268 },
      preview: clipPreview,
      paramKeys: ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness", "clipComponentId", "legComponentId"]
    });
  }

  const shelfBoardCount = Math.max(0, Math.round(getNumber(params.shelfCount, 4)) - 1);
  const internalBottomMm = plinthHeightMm + boardThicknessMm;
  const internalTopMm = heightCarcassMm - boardThicknessMm;
  const internalHeightMm = Math.max(1, internalTopMm - internalBottomMm);
  const availableGapSpaceMm = Math.max(0, internalHeightMm - shelfBoardCount * shelfThicknessMm);
  const shelfGapsMm = getShelfGaps(params, shelfBoardCount, availableGapSpaceMm);
  const shelfDepthMm = Math.max(40, carcassDepthMm - backThicknessMm - 29);
  let shelfCursorMm = internalBottomMm;

  for (let index = 0; index < shelfBoardCount; index += 1) {
    shelfCursorMm += Math.max(0, shelfGapsMm[index] ?? 0);
    const shelfCenterYMm = shelfCursorMm + shelfThicknessMm * 0.5;
    addBoxPart({
      group,
      name: `shelf-${index + 1}-x`,
      sizeMm: { width: innerWidthMm, height: shelfThicknessMm, depth: shelfDepthMm },
      positionMm: { x: 0, y: shelfCenterYMm, z: carcassCenterZMm + 26.5 },
      preview: shelfPreview,
      paramKeys: ["shelfCount", "shelfThickness", "shelfAutoFit", "shelfGaps", "heightCarcass", "depth"]
    });
    shelfCursorMm += shelfThicknessMm;
  }

  const doorDouble = params.doorDouble !== false;
  const meetingGapMm = doorDouble ? frontGapMm : 0;
  const doorWidthMm = Math.max(40, doorDouble ? (widthMm - sideGapMm * 2 - meetingGapMm) * 0.5 : widthMm - sideGapMm * 2);
  const doorHeightMm = Math.max(40, heightCarcassMm - plinthHeightMm - topGapMm - bottomGapMm);
  const doorCenterYMm = plinthHeightMm + bottomGapMm + doorHeightMm * 0.5;
  const doorBottomMm = doorCenterYMm - doorHeightMm * 0.5;
  const doorTopMm = doorCenterYMm + doorHeightMm * 0.5;
  const seamHalfGapMm = meetingGapMm * 0.5;
  const handleInsetFromMeetingEdgeMm = clamp(Math.round(doorWidthMm * 0.3), 80, 140);
  const leftDoorCenterXMm = -seamHalfGapMm - doorWidthMm * 0.5;
  const rightDoorCenterXMm = seamHalfGapMm + doorWidthMm * 0.5;

  const buildDoor = (args: {
    doorName: "door_front_z" | "door_front_x";
    handleName: "door_front_z_handle" | "door_front_x_handle";
    centerXMm: number;
    hingeDirectionX: -1 | 1;
  }) => {
    addBoxPart({
      group,
      name: args.doorName,
      sizeMm: { width: doorWidthMm, height: doorHeightMm, depth: frontThicknessMm },
      positionMm: { x: args.centerXMm, y: doorCenterYMm, z: frontPlaneZMm },
      preview: frontPreview,
      paramKeys: ["width", "heightCarcass", "frontThicknessMm", "sideGap", "topGap", "bottomGap", "frontGap", "doorDouble", "doorOpen"]
    });

    const handleCenterXMm = args.centerXMm - args.hingeDirectionX * (doorWidthMm * 0.5 - handleInsetFromMeetingEdgeMm);
    const handleLengthMm = Math.max(40, Math.round(getNumber(params.handleLengthMm, 160)));
    const handleCenterYMm = clamp(doorTopMm - handlePositionMm - handleLengthMm * 0.5, doorBottomMm + handleLengthMm * 0.5, doorTopMm - handleLengthMm * 0.5);
    addDoorHandle({
      group,
      name: args.handleName,
      params,
      xMm: handleCenterXMm,
      yMm: handleCenterYMm,
      zMm: frontPlaneZMm + frontThicknessMm * 0.5,
      preview: handlePreview
    });

    const hingeCentersMm = getHingeCentersMm(doorBottomMm, doorTopMm, hingeCount, hingeTopOffsetMm, hingeBottomOffsetMm);
    const hingeCenterXMm = args.centerXMm + args.hingeDirectionX * (doorWidthMm * 0.5 - 37);
    const hingeCenterZMm = frontPlaneZMm - frontThicknessMm * 0.5 - 11;
    for (let index = 0; index < hingeCentersMm.length; index += 1) {
      addHingeAssembly({
        group,
        prefix: `${args.doorName}_hinge_${index + 1}`,
        xMm: hingeCenterXMm,
        yMm: hingeCentersMm[index]!,
        zMm: hingeCenterZMm,
        directionX: args.hingeDirectionX,
        preview: hingePreview
      });
    }
  };

  if (doorDouble) {
    buildDoor({
      doorName: "door_front_z",
      handleName: "door_front_z_handle",
      centerXMm: leftDoorCenterXMm,
      hingeDirectionX: -1
    });
    buildDoor({
      doorName: "door_front_x",
      handleName: "door_front_x_handle",
      centerXMm: rightDoorCenterXMm,
      hingeDirectionX: 1
    });
  } else {
    buildDoor({
      doorName: "door_front_z",
      handleName: "door_front_z_handle",
      centerXMm: 0,
      hingeDirectionX: -1
    });
  }

  if (params.doorOpen === true) {
    if (doorDouble) {
      const leftPivot = attachDoorPivot(
        group,
        "__swing_shelves_left_pivot",
        leftDoorCenterXMm - doorWidthMm * 0.5,
        frontPlaneZMm,
        [
          "door_front_z",
          "door_front_z_handle",
          ...Array.from({ length: hingeCount }, (_, index) => [
            `door_front_z_hinge_${index + 1}`,
            `door_front_z_hinge_${index + 1}_cup`,
            `door_front_z_hinge_${index + 1}_arm`
          ]).flat()
        ]
      );
      leftPivot.rotation.y = Math.PI / 2;

      const rightPivot = attachDoorPivot(
        group,
        "__swing_shelves_right_pivot",
        rightDoorCenterXMm + doorWidthMm * 0.5,
        frontPlaneZMm,
        [
          "door_front_x",
          "door_front_x_handle",
          ...Array.from({ length: hingeCount }, (_, index) => [
            `door_front_x_hinge_${index + 1}`,
            `door_front_x_hinge_${index + 1}_cup`,
            `door_front_x_hinge_${index + 1}_arm`
          ]).flat()
        ]
      );
      rightPivot.rotation.y = -Math.PI / 2;
    } else {
      const pivot = attachDoorPivot(
        group,
        "__swing_shelves_single_pivot",
        -doorWidthMm * 0.5,
        frontPlaneZMm,
        [
          "door_front_z",
          "door_front_z_handle",
          ...Array.from({ length: hingeCount }, (_, index) => [
            `door_front_z_hinge_${index + 1}`,
            `door_front_z_hinge_${index + 1}_cup`,
            `door_front_z_hinge_${index + 1}_arm`
          ]).flat()
        ]
      );
      pivot.rotation.y = Math.PI / 2;
    }
  }

  const kitchenBackAnchor = new THREE.Object3D();
  kitchenBackAnchor.name = kitchenBackAnchorName;
  kitchenBackAnchor.position.set(0, 0, toMeters(-totalDepthMm * 0.5));
  kitchenBackAnchor.visible = false;
  group.add(kitchenBackAnchor);

  return group;
}
