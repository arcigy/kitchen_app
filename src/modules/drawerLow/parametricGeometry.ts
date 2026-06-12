import * as THREE from "three";
import { normalizeDrawerLowParams, type DrawerLowParams } from "./types";
import type { ClientCatalog, ComponentType, MaterialDefinition } from "../../core/catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../../core/catalog/material-render-request";
import type { PortableMaterialsSnapshot } from "../runtime/portableCommercial";
import { getPortableMaterialsSnapshotSelections } from "../runtime/portableCommercial";
import {
  createModuleRuntimeCatalogContext,
  type MaterialFallbackKind,
  type ModuleRuntimeCatalogContext
} from "../runtime/runtimeCatalog";

const MM_TO_M = 0.001;

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

function roundCount(value: unknown, fallback: number) {
  return Math.max(1, Math.round(getNumber(value, fallback)));
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
  if (/drawer_/i.test(partName)) return ["module", "drawer", "drawer_bottom"];
  if (/back/i.test(partName)) return ["module", "back"];
  if (/kick|plinth/i.test(partName)) return ["module", "plinth"];
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
  openEnded?: boolean;
  thetaLength?: number;
}) {
  const radiusM = toMeters(Math.max(1, args.diameterMm) / 2);
  const lengthM = toMeters(Math.max(1, args.lengthMm));
  const geometry = new THREE.CylinderGeometry(
    radiusM,
    radiusM,
    lengthM,
    args.radialSegments ?? 20,
    1,
    args.openEnded ?? false,
    0,
    args.thetaLength ?? Math.PI * 2
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

function resolveDrawerLowBoardSlot(partName: string) {
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

function fallbackKindForDrawerPart(partName: string): MaterialFallbackKind {
  if (/front/i.test(partName)) return "front";
  if (/back/i.test(partName)) return "backPanel";
  if (/drawer_/i.test(partName)) return "drawer";
  return "carcass";
}

function resolveBoardPreview(
  partName: string,
  params: Record<string, unknown>,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  fallback: PreviewMaterial,
  catalogContext: ModuleRuntimeCatalogContext | null
): PreviewMaterial {
  const boardSlot = resolveDrawerLowBoardSlot(partName);
  if (!boardSlot) return fallback;
  const { slotMaterialCatalogIds, slotThicknesses } = catalogContext
    ? getPortableMaterialsSnapshotSelections(materialsSnapshot, params, catalogContext.catalog)
    : { slotMaterialCatalogIds: {} as Record<string, string>, slotThicknesses: {} as Record<string, number> };
  const selectedCatalogId = slotMaterialCatalogIds[boardSlot];
  const selectedMaterial =
    (selectedCatalogId ? catalogContext?.getMaterialById(selectedCatalogId) : null) ??
    catalogContext?.resolveMaterial(undefined, fallbackKindForDrawerPart(partName));
  if (!selectedMaterial) return fallback;
  return {
    colorHex: selectedMaterial.preview.colorHex,
    roughness: selectedMaterial.preview.roughness,
    metalness: selectedMaterial.preview.metalness,
    thicknessMm: slotThicknesses[boardSlot] ?? selectedMaterial.defaultThicknessMm,
    catalogMaterial: selectedMaterial
  };
}

function resolveComponentPreview(
  componentId: string | null | undefined,
  fallback: PreviewMaterial,
  catalogContext: ModuleRuntimeCatalogContext | null,
  componentType: ComponentType
): PreviewMaterial {
  const component = catalogContext?.resolveComponent(componentId, componentType);
  if (!component) return fallback;
  return {
    colorHex: component.preview.colorHex,
    roughness: component.preview.roughness,
    metalness: component.preview.metalness
  };
}

function resolveBoardThickness(
  partName: string,
  params: Record<string, unknown>,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  fallback: number,
  catalogContext: ModuleRuntimeCatalogContext | null
) {
  return getNumber(resolveBoardPreview(partName, params, materialsSnapshot, fallbackBoardPreview, catalogContext).thicknessMm, fallback);
}

const fallbackBoardPreview: PreviewMaterial = {
  colorHex: "#d7d9dd",
  roughness: 0.78,
  metalness: 0.02
};

const fallbackFrontPreview: PreviewMaterial = {
  colorHex: "#a97f57",
  roughness: 0.72,
  metalness: 0.02
};

const fallbackDrawerPreview: PreviewMaterial = {
  colorHex: "#dbc29d",
  roughness: 0.72,
  metalness: 0.02
};

const fallbackHardwarePreview: PreviewMaterial = {
  colorHex: "#3a3f4b",
  roughness: 0.45,
  metalness: 0.55
};

function resolveFrontHeights(params: Record<string, unknown>, drawerCount: number, stackHeightMm: number) {
  const rawHeights = Array.isArray(params.drawerFrontHeights)
    ? params.drawerFrontHeights.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    : [];
  const preset = typeof params.frontStackPreset === "string" ? params.frontStackPreset.toLowerCase() : "equal";
  const topFrontHeightMm = Math.max(1, getNumber(params.topFrontHeightMm, 160));

  let heights: number[];
  if (rawHeights.length === drawerCount) {
    heights = [...rawHeights];
  } else if (preset.includes("top") && drawerCount > 1) {
    const topHeight = clamp(topFrontHeightMm, 1, Math.max(1, stackHeightMm - (drawerCount - 1)));
    const remaining = Math.max(1, stackHeightMm - topHeight);
    const equal = Math.floor(remaining / (drawerCount - 1));
    heights = Array.from({ length: drawerCount - 1 }, () => equal);
    const sum = heights.reduce((total, value) => total + value, 0);
    heights.push(topHeight + (remaining - sum));
  } else {
    const equal = Math.floor(stackHeightMm / drawerCount);
    heights = Array.from({ length: drawerCount }, () => equal);
    heights[heights.length - 1] += stackHeightMm - equal * drawerCount;
  }

  const currentSum = heights.reduce((total, value) => total + value, 0);
  heights[heights.length - 1] = Math.max(1, heights[heights.length - 1]! + (stackHeightMm - currentSum));
  return heights;
}

export function buildDrawerLowParametric(
  params: DrawerLowParams,
  materialsSnapshot: PortableMaterialsSnapshot | null | undefined,
  catalog: ClientCatalog
): THREE.Group {
  params = normalizeDrawerLowParams(params);
  const catalogContext = catalog ? createModuleRuntimeCatalogContext(catalog) : null;
  const group = new THREE.Group();
  group.name = "drawerLowModule";

  const widthMm = Math.max(200, getNumber(params.width, 800));
  const totalHeightMm = Math.max(200, getNumber(params.height, 700));
  const totalDepthMm = Math.max(200, getNumber(params.depth, 560));
  const worktopThicknessMm = Math.max(0, getNumber(params.worktopThicknessMm, 38));
  const carcassTopMm = Math.max(50, getNumber(params.heightCarcass, totalHeightMm - worktopThicknessMm));
  const plinthHeightMm = clamp(getNumber(params.plinthHeight, 100), 0, carcassTopMm - 20);

  const boardThicknessMm = resolveBoardThickness("leftSide", params as Record<string, unknown>, materialsSnapshot, getNumber(params.boardThickness, 18), catalogContext);
  const backThicknessMm = resolveBoardThickness("back", params as Record<string, unknown>, materialsSnapshot, getNumber(params.backThickness, 6), catalogContext);
  const frontThicknessMm = resolveBoardThickness(
    "front_1",
    params as Record<string, unknown>,
    materialsSnapshot,
    getNumber(params.frontThicknessMm, 18),
    catalogContext
  );
  const drawerBoxThicknessMm = resolveBoardThickness(
    "drawer_1_sideL",
    params as Record<string, unknown>,
    materialsSnapshot,
    getNumber(params.drawerBoxThickness, 13),
    catalogContext
  );
  const carcassDepthMm = Math.max(80, totalDepthMm - frontThicknessMm);
  const carcassCenterZMm = -frontThicknessMm / 2;

  const backGrooveDepthMm = clamp(getNumber(params.backGrooveDepthMm, 8), 0, boardThicknessMm);
  const backGrooveWidthMm = clamp(
    getNumber(params.backGrooveWidthMm, 8),
    backThicknessMm,
    Math.max(backThicknessMm, carcassDepthMm * 0.25)
  );
  const backGrooveClearanceMm = clamp(getNumber(params.backGrooveClearanceMm, 1), 0, boardThicknessMm);
  const plinthSetbackMm = clamp(getNumber(params.plinthSetbackMm, 60), 0, carcassDepthMm / 2);
  const frontGapMm = Math.max(0, getNumber(params.frontGap, 2));
  const sideGapMm = Math.max(0, getNumber(params.sideGap, 2));
  const topGapMm = Math.max(0, getNumber(params.topGap, 2));
  const bottomGapMm = Math.max(0, getNumber(params.bottomGap, 2));
  const sideClearanceMm = Math.max(0, getNumber(params.sideClearanceMm, 4));
  const drawerBackReserveMm = Math.max(0, getNumber(params.drawerBackReserveMm, 8));
  const drawerBoxSideHeightMm = Math.max(20, getNumber(params.drawerBoxSideHeight, 110));
  const drawerCount = roundCount(params.drawerCount, 3);

  const sideHeightMm = Math.max(1, carcassTopMm - plinthHeightMm);
  const innerWidthMm = Math.max(1, widthMm - 2 * boardThicknessMm);
  const topRailDepthMm = Math.min(carcassDepthMm * 0.25, Math.max(60, boardThicknessMm * 3));
  const backVisibleWidthMm = Math.max(1, innerWidthMm + 2 * backGrooveDepthMm - backGrooveClearanceMm);
  const backVisibleHeightMm = Math.max(1, sideHeightMm - 2 * boardThicknessMm + 2 * backGrooveDepthMm - backGrooveClearanceMm);
  const carcassRearZMm = carcassCenterZMm - carcassDepthMm / 2;
  const carcassFrontZMm = carcassCenterZMm + carcassDepthMm / 2;
  const backRearFaceZMm = carcassRearZMm;
  const backInnerFaceZMm = backRearFaceZMm + backThicknessMm;
  const drawerRearFaceZMm = backInnerFaceZMm + drawerBackReserveMm;
  const drawerFrontFaceZMm = carcassFrontZMm - 11;
  const drawerSideDepthMm = Math.max(50, drawerFrontFaceZMm - drawerRearFaceZMm);
  const drawerCenterZMm = (drawerRearFaceZMm + drawerFrontFaceZMm) / 2;
  const kickThicknessMm = Math.min(boardThicknessMm, carcassDepthMm * 0.2);
  const kickCenterZMm = carcassCenterZMm + carcassDepthMm / 2 - kickThicknessMm / 2 - plinthSetbackMm;

  const bodyPreview = resolveBoardPreview("leftSide", params as Record<string, unknown>, materialsSnapshot, fallbackBoardPreview, catalogContext);
  const topPreview = resolveBoardPreview("topRailFront", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext);
  const backPreview = resolveBoardPreview("back", params as Record<string, unknown>, materialsSnapshot, fallbackBoardPreview, catalogContext);
  const kickPreview = resolveBoardPreview("kick", params as Record<string, unknown>, materialsSnapshot, bodyPreview, catalogContext);
  const frontPreview = resolveBoardPreview("front_1", params as Record<string, unknown>, materialsSnapshot, fallbackFrontPreview, catalogContext);
  const drawerSidePreview = resolveBoardPreview("drawer_1_sideL", params as Record<string, unknown>, materialsSnapshot, fallbackDrawerPreview, catalogContext);
  const drawerBottomPreview = resolveBoardPreview("drawer_1_bottom", params as Record<string, unknown>, materialsSnapshot, fallbackDrawerPreview, catalogContext);
  const handleComponentId = catalogContext?.resolveComponentId(params.handleComponentId as string | undefined, "handle", "handle") ?? null;
  const legComponentId = catalogContext?.resolveComponentId(params.legComponentId as string | undefined, "leg") ?? null;
  const runnerComponentId = catalogContext?.resolveComponentId(params.runnerComponentId as string | undefined, "runner", "drawerSystem") ?? null;
  const handlePreview = resolveComponentPreview(handleComponentId, fallbackHardwarePreview, catalogContext, "handle");
  const legPreview = resolveComponentPreview(legComponentId, {
    colorHex: "#1e232b",
    roughness: 0.45,
    metalness: 0.55
  }, catalogContext, "leg");
  const runnerPreview = resolveComponentPreview(runnerComponentId, {
    colorHex: "#9ca3ad",
    roughness: 0.3,
    metalness: 0.82
  }, catalogContext, "runner");
  const clipPreview = resolveComponentPreview(params.clipComponentId as string | undefined, {
    colorHex: "#1e232b",
    roughness: 0.45,
    metalness: 0.35
  }, catalogContext, "plinth_clip");

  addBoxPart({
    group,
    name: "leftSide",
    sizeMm: { width: boardThicknessMm, height: sideHeightMm, depth: carcassDepthMm },
    positionMm: { x: -widthMm / 2 + boardThicknessMm / 2, y: plinthHeightMm + sideHeightMm / 2, z: carcassCenterZMm },
    preview: bodyPreview,
    paramKeys: ["width", "height", "depth", "boardThickness", "plinthHeight", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "rightSide",
    sizeMm: { width: boardThicknessMm, height: sideHeightMm, depth: carcassDepthMm },
    positionMm: { x: widthMm / 2 - boardThicknessMm / 2, y: plinthHeightMm + sideHeightMm / 2, z: carcassCenterZMm },
    preview: bodyPreview,
    paramKeys: ["width", "height", "depth", "boardThickness", "plinthHeight", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "bottom",
    sizeMm: { width: innerWidthMm, height: boardThicknessMm, depth: carcassDepthMm },
    positionMm: { x: 0, y: plinthHeightMm + boardThicknessMm / 2, z: carcassCenterZMm },
    preview: bodyPreview,
    paramKeys: ["width", "depth", "boardThickness", "plinthHeight"]
  });

  addBoxPart({
    group,
    name: "topRailFront",
    sizeMm: { width: innerWidthMm, height: boardThicknessMm, depth: topRailDepthMm },
    positionMm: { x: 0, y: carcassTopMm - boardThicknessMm / 2, z: carcassCenterZMm + carcassDepthMm / 2 - topRailDepthMm / 2 },
    preview: topPreview,
    paramKeys: ["width", "depth", "height", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "topRailBack",
    sizeMm: { width: innerWidthMm, height: boardThicknessMm, depth: topRailDepthMm },
    positionMm: { x: 0, y: carcassTopMm - boardThicknessMm / 2, z: carcassCenterZMm - carcassDepthMm / 2 + topRailDepthMm / 2 },
    preview: topPreview,
    paramKeys: ["width", "depth", "height", "boardThickness", "worktopThicknessMm"]
  });

  addBoxPart({
    group,
    name: "back",
    sizeMm: { width: backVisibleWidthMm, height: backVisibleHeightMm, depth: backThicknessMm },
    positionMm: {
      x: 0,
      y: plinthHeightMm + boardThicknessMm + backVisibleHeightMm / 2,
      z: backRearFaceZMm + backThicknessMm / 2
    },
    preview: backPreview,
    paramKeys: [
      "width",
      "height",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveOffsetMm",
      "backGrooveClearanceMm",
      "plinthHeight",
      "worktopThicknessMm"
    ]
  });

  if (plinthHeightMm > 0) {
    const legComponent = catalogContext?.resolveComponent(legComponentId, "leg");
    const legDiameterMm = getNumber(legComponent?.nominalHeightMm, 100) > 120 ? 44 : 40;
    const legXOffsetMm = widthMm / 2 - 30;
    const legFrontZMm = Math.min(carcassCenterZMm + carcassDepthMm / 2 - 60, kickCenterZMm - kickThicknessMm / 2 - legDiameterMm / 2 - 10);
    const legBackZMm = carcassCenterZMm - carcassDepthMm / 2 + 60;
    const legNames = [
      ["leg_FL", -legXOffsetMm, legFrontZMm],
      ["leg_FR", legXOffsetMm, legFrontZMm],
      ["leg_BL", -legXOffsetMm, legBackZMm],
      ["leg_BR", legXOffsetMm, legBackZMm]
    ] as const;

    for (const [name, x, z] of legNames) {
      addCylinderPart({
        group,
        name,
        diameterMm: legDiameterMm,
        lengthMm: plinthHeightMm,
        axis: "y",
        positionMm: { x, y: plinthHeightMm / 2, z },
        preview: legPreview,
        paramKeys: ["plinthHeight", "plinthSetbackMm", "depth", "width"]
      });
    }

    addBoxPart({
      group,
      name: "plinth-clip-fl",
      sizeMm: { width: 48, height: 16, depth: 65 },
      positionMm: { x: -legXOffsetMm, y: Math.max(16, plinthHeightMm * 0.4), z: legFrontZMm + 12 },
      preview: clipPreview,
      paramKeys: ["boardThickness", "depth", "plinthHeight", "plinthSetbackMm", "width"]
    });

    addBoxPart({
      group,
      name: "plinth-clip-fr",
      sizeMm: { width: 48, height: 16, depth: 65 },
      positionMm: { x: legXOffsetMm, y: Math.max(16, plinthHeightMm * 0.4), z: legFrontZMm + 12 },
      preview: clipPreview,
      paramKeys: ["boardThickness", "depth", "plinthHeight", "plinthSetbackMm", "width"]
    });
  }

  addBoxPart({
    group,
    name: "kick",
    sizeMm: { width: widthMm, height: plinthHeightMm, depth: kickThicknessMm },
    positionMm: { x: 0, y: plinthHeightMm / 2, z: kickCenterZMm },
    preview: kickPreview,
    paramKeys: ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]
  });

  const visibleStackHeightMm = Math.max(
    drawerCount,
    totalHeightMm - worktopThicknessMm - plinthHeightMm - topGapMm - bottomGapMm - frontGapMm * (drawerCount - 1)
  );
  const frontHeightsMm = resolveFrontHeights(params as Record<string, unknown>, drawerCount, Math.round(visibleStackHeightMm));
  const frontWidthMm = Math.max(1, widthMm - sideGapMm * 2);
  const frontPlaneZMm = totalDepthMm / 2 - frontThicknessMm / 2;

  const handleType = typeof params.handleType === "string" ? params.handleType.toLowerCase() : "bar";
  const handleLengthMm = Math.max(0, getNumber(params.handleLengthMm, 160));
  const handleSizeMm = Math.max(0, getNumber(params.handleSizeMm, 12));
  const handleProjectionMm = Math.max(0, getNumber(params.handleProjectionMm, 14));
  const handlePositionMm = Math.max(0, getNumber(params.handlePositionMm, 60));

  const drawerOuterWidthMm = Math.max(40, widthMm - 2 * boardThicknessMm - sideClearanceMm * 2);
  const drawerBackWidthMm = Math.max(20, drawerOuterWidthMm - drawerBoxThicknessMm * 2);
  const railDepthMm = Math.max(50, drawerSideDepthMm - 5);
  const railWidthMm = 8;
  const railHeightMm = 12;
  const drawerBottomOffsetMm = 40;

  let frontBaseMm = plinthHeightMm + bottomGapMm;

  for (let index = 0; index < drawerCount; index += 1) {
    const drawerIndex = index + 1;
    const frontHeightMm = Math.max(1, frontHeightsMm[index] ?? 1);
    const frontCenterYMm = frontBaseMm + frontHeightMm / 2;
    const drawerApertureHeightMm = Math.max(20, frontHeightMm - frontGapMm * 2);
    const drawerBoxBaseYMm = frontBaseMm + drawerBottomOffsetMm;
    const drawerSideCenterYMm = drawerBoxBaseYMm + drawerBoxSideHeightMm / 2;
    const drawerBottomThicknessMm = resolveBoardThickness(
      `drawer_${drawerIndex}_bottom`,
      params as Record<string, unknown>,
      materialsSnapshot,
      getNumber(params.drawerBottomThickness, drawerBoxThicknessMm),
      catalogContext
    );
    const drawerBottomWidthMm = Math.max(1, drawerOuterWidthMm - drawerBoxThicknessMm * 2);
    const drawerBottomDepthMm = Math.max(1, drawerSideDepthMm - drawerBoxThicknessMm);

    addBoxPart({
      group,
      name: `front_${drawerIndex}`,
      sizeMm: { width: frontWidthMm, height: frontHeightMm, depth: frontThicknessMm },
      positionMm: { x: 0, y: frontCenterYMm, z: frontPlaneZMm },
      preview: resolveBoardPreview(`front_${drawerIndex}`, params as Record<string, unknown>, materialsSnapshot, frontPreview, catalogContext),
      paramKeys: [
        "width",
        "height",
        "depth",
        "frontThicknessMm",
        "sideGap",
        "topGap",
        "bottomGap",
        "frontGap",
        "drawerCount",
        "drawerFrontHeights",
        "frontStackPreset",
        "topFrontHeightMm",
        "handleType",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ]
    });

    if (handleType !== "none") {
      const handleCenterYMm = frontCenterYMm + frontHeightMm / 2 - handlePositionMm;
      const handleParamKeys = [
        "handleType",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm",
        "frontThicknessMm"
      ];

      if (handleType === "knob") {
        const knobDiameterMm = Math.max(8, handleSizeMm || 28);
        const knobDepthMm = Math.max(8, handleProjectionMm || 28);
        addCylinderPart({
          group,
          name: `handle_${drawerIndex}`,
          diameterMm: knobDiameterMm,
          lengthMm: knobDepthMm,
          axis: "z",
          positionMm: { x: 0, y: handleCenterYMm, z: frontPlaneZMm + frontThicknessMm / 2 + knobDepthMm / 2 },
          preview: handlePreview,
          paramKeys: handleParamKeys
        });
        addCylinderPart({
          group,
          name: `handle_${drawerIndex}_screw_1_shaft`,
          diameterMm: 3.2,
          lengthMm: frontThicknessMm + knobDepthMm + 4,
          axis: "z",
          positionMm: { x: 0, y: handleCenterYMm, z: frontPlaneZMm + knobDepthMm / 2 },
          preview: runnerPreview,
          paramKeys: ["handleType", "handlePositionMm", "frontThicknessMm", "handleSizeMm", "handleProjectionMm"]
        });
      } else if (handleType === "gola") {
        const golaHeightMm = Math.max(6, handleSizeMm || 14);
        const golaDepthMm = Math.max(6, handleProjectionMm || 10);
        addBoxPart({
          group,
          name: `gola_${drawerIndex}`,
          sizeMm: { width: Math.max(60, handleLengthMm || frontWidthMm), height: golaHeightMm, depth: golaDepthMm },
          positionMm: {
            x: 0,
            y: frontCenterYMm + frontHeightMm / 2 - golaHeightMm / 2 - 2,
            z: frontPlaneZMm - frontThicknessMm / 2 + golaDepthMm / 2
          },
          preview: handlePreview,
          paramKeys: ["handleType", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]
        });
      } else {
        const handleWidthMm = Math.max(40, handleLengthMm || Math.min(frontWidthMm * 0.6, 160));
        const handleHeightMm = Math.max(6, handleSizeMm || 12);
        const handleDepthMm = Math.max(6, handleProjectionMm || 14);
        addBoxPart({
          group,
          name: `handle_${drawerIndex}`,
          sizeMm: { width: handleWidthMm, height: handleHeightMm, depth: handleDepthMm },
          positionMm: {
            x: 0,
            y: handleCenterYMm,
            z: frontPlaneZMm + frontThicknessMm / 2 + handleDepthMm / 2
          },
          preview: handlePreview,
          paramKeys: handleParamKeys
        });

        const screwOffsetMm = handleType === "cup" ? Math.min(handleWidthMm * 0.35, Math.max(30, handleWidthMm - 80)) : Math.min(handleWidthMm * 0.25, 40);
        const screwXs = handleType === "cup" ? [-screwOffsetMm, screwOffsetMm] : [-screwOffsetMm, screwOffsetMm];
        for (let screwIndex = 0; screwIndex < screwXs.length; screwIndex += 1) {
          const screwX = screwXs[screwIndex] ?? 0;
          addCylinderPart({
            group,
            name: `handle_${drawerIndex}_screw_${screwIndex + 1}_head`,
            diameterMm: 8,
            lengthMm: 2.5,
            axis: "z",
            positionMm: {
              x: screwX,
              y: handleCenterYMm,
              z: frontPlaneZMm - frontThicknessMm / 2 - 1.25
            },
            preview: runnerPreview,
            paramKeys: ["handleType", "handlePositionMm", "frontThicknessMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]
          });
          addCylinderPart({
            group,
            name: `handle_${drawerIndex}_screw_${screwIndex + 1}_shaft`,
            diameterMm: 3.2,
            lengthMm: frontThicknessMm + handleDepthMm + 4,
            axis: "z",
            positionMm: {
              x: screwX,
              y: handleCenterYMm,
              z: frontPlaneZMm + handleDepthMm / 2
            },
            preview: runnerPreview,
            paramKeys: ["handleType", "handlePositionMm", "frontThicknessMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]
          });
        }
      }
    }

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_sideL`,
      sizeMm: { width: drawerBoxThicknessMm, height: drawerBoxSideHeightMm, depth: drawerSideDepthMm },
      positionMm: {
        x: -drawerOuterWidthMm / 2 + drawerBoxThicknessMm / 2,
        y: drawerSideCenterYMm,
        z: drawerCenterZMm
      },
      preview: resolveBoardPreview(`drawer_${drawerIndex}_sideL`, params as Record<string, unknown>, materialsSnapshot, drawerSidePreview, catalogContext),
      paramKeys: ["backThickness", "drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_sideR`,
      sizeMm: { width: drawerBoxThicknessMm, height: drawerBoxSideHeightMm, depth: drawerSideDepthMm },
      positionMm: {
        x: drawerOuterWidthMm / 2 - drawerBoxThicknessMm / 2,
        y: drawerSideCenterYMm,
        z: drawerCenterZMm
      },
      preview: resolveBoardPreview(`drawer_${drawerIndex}_sideR`, params as Record<string, unknown>, materialsSnapshot, drawerSidePreview, catalogContext),
      paramKeys: ["backThickness", "drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_back`,
      sizeMm: { width: drawerBackWidthMm, height: drawerBoxSideHeightMm, depth: drawerBoxThicknessMm },
      positionMm: {
        x: 0,
        y: drawerSideCenterYMm,
        z: drawerCenterZMm - drawerSideDepthMm / 2 + drawerBoxThicknessMm / 2
      },
      preview: resolveBoardPreview(`drawer_${drawerIndex}_back`, params as Record<string, unknown>, materialsSnapshot, drawerSidePreview, catalogContext),
      paramKeys: ["backThickness", "drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_bottom`,
      sizeMm: { width: drawerBottomWidthMm, height: drawerBottomThicknessMm, depth: drawerBottomDepthMm },
      positionMm: {
        x: 0,
        y: drawerBoxBaseYMm + drawerBottomThicknessMm / 2,
        z: drawerCenterZMm + drawerBoxThicknessMm / 2
      },
      preview: resolveBoardPreview(`drawer_${drawerIndex}_bottom`, params as Record<string, unknown>, materialsSnapshot, drawerBottomPreview, catalogContext),
      paramKeys: ["backThickness", "drawerBottomThickness", "drawerBoxThickness", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_railL`,
      sizeMm: { width: railWidthMm, height: railHeightMm, depth: railDepthMm },
      positionMm: {
        x: -drawerOuterWidthMm / 2 + railWidthMm / 2,
        y: drawerBoxBaseYMm - railHeightMm / 2 - 8,
        z: drawerCenterZMm + (drawerSideDepthMm - railDepthMm) / 2
      },
      preview: runnerPreview,
      paramKeys: ["backThickness", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    addBoxPart({
      group,
      name: `drawer_${drawerIndex}_railR`,
      sizeMm: { width: railWidthMm, height: railHeightMm, depth: railDepthMm },
      positionMm: {
        x: drawerOuterWidthMm / 2 - railWidthMm / 2,
        y: drawerBoxBaseYMm - railHeightMm / 2 - 8,
        z: drawerCenterZMm + (drawerSideDepthMm - railDepthMm) / 2
      },
      preview: runnerPreview,
      paramKeys: ["backThickness", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    frontBaseMm += frontHeightMm + frontGapMm;
  }

  const kitchenBackAnchor = new THREE.Object3D();
  kitchenBackAnchor.name = "__kitchen_back_anchor";
  kitchenBackAnchor.position.set(0, 0, toMeters(-totalDepthMm / 2));
  kitchenBackAnchor.visible = false;
  group.add(kitchenBackAnchor);

  return group;
}
