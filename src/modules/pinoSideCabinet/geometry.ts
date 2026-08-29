import * as THREE from "three";
import type { ClientCatalog, MaterialDefinition } from "../../core/catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../../core/catalog/material-render-request";
import { createModuleRuntimeCatalogContext, type MaterialFallbackKind } from "../runtime/runtimeCatalog";
import {
  createPinoSideCabinetLayout,
  getPinoSideCabinetApplianceModuleTypeForCategory,
  getPinoSideCabinetApplianceOpening,
  getPinoSideCabinetProductGroup,
  getPinoSideCabinetSystem,
  normalizePinoSideCabinetParams,
  type PinoSideCabinetLayout,
  type PinoSideCabinetLayoutSegment,
  type PinoSideCabinetParams
} from "./types";
import { getPinoHandleByComponentId, type PinoHandleCatalogEntry, type PinoHandlePlacementCode } from "./handleCatalog";
import { getPinoSideCabinetCapability } from "./rules";

const MM_TO_M = 0.001;

type MaterialRole = "body" | "front" | "back" | "shelf" | "plinth" | "hardware";

type PreviewMaterial = {
  colorHex: string;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  opacity?: number;
  catalogMaterial?: MaterialDefinition;
};

type ResolvedHandleSpec = {
  entry: PinoHandleCatalogEntry | null;
  preview: PreviewMaterial;
  renderKind: "bar" | "knob" | "profile";
  lengthMm: number;
  thicknessMm: number;
  projectionMm: number;
  placementCode: PinoHandlePlacementCode;
  offsetMm: number;
};

type PartSizeMm = {
  width: number;
  height: number;
  depth: number;
};

type InteriorBoundsMm = {
  innerWidth: number;
  innerDepth: number;
  innerBottomMm: number;
  innerTopMm: number;
  shelfCenterBottom: number;
  shelfCenterTop: number;
  innerBackZ: number;
  innerFrontZ: number;
  frontPlaneZ: number;
};

type VerticalBandMm = {
  yBottomMm: number;
  yTopMm: number;
};

type ResolvedInteriorPlacement = {
  componentId: string;
  placement: string;
  nameRaw: string;
  itemIndex: number;
  yCenterMm: number;
  yBottomMm: number;
  yTopMm: number;
  heightMm: number;
  depthMm: number;
  supportZone: string;
  collisionLane: "main_volume" | "nested_pullout" | "rear_accessory";
  hostComponentId: string | null;
  zCenterMm: number;
  zFrontMm: number;
  zBackMm: number;
};

type ConstructionPartRole =
  | "side_panel"
  | "carcass_bottom"
  | "carcass_top"
  | "back_panel"
  | "plinth_panel"
  | "front_leaf"
  | "niche_rail"
  | "shelf_panel"
  | "wire_shelf_panel"
  | "shelf_support"
  | "drawer_body"
  | "pullout_body"
  | "runner"
  | "rear_accessory"
  | "handle"
  | "hardware"
  | "unknown";

type ConstructionPartBounds = {
  name: string;
  role: ConstructionPartRole;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

export type PinoSideCabinetConstructionMetrics = {
  frontBottomClearanceMm: number | null;
  plinthTopMm: number;
  carcassInnerBottomMm: number;
  carcassInnerTopMm: number;
  mainVolumePlacementCount: number;
  nestedPulloutPlacementCount: number;
  rearAccessoryPlacementCount: number;
  plinthFrontSetbackMm: number | null;
  maxCarcassJointGapMm: number | null;
  frontSideRevealLeftMm: number | null;
  frontSideRevealRightMm: number | null;
  minFrontCenterGapMm: number | null;
  maxFrontCenterGapMm: number | null;
  shelfSupportCount: number;
  supportedShelfCount: number;
  unsupportedShelfCount: number;
  minMainVolumeGapMm: number | null;
  movingRunnerCount: number;
  supportedMovingBodyCount: number;
  unsupportedMovingBodyCount: number;
  minMovingBodyBottomOffsetMm: number | null;
  maxMovingBodyTopClearanceMm: number | null;
  openedFrontProjectionMm: number | null;
};

export type PinoSideCabinetConstructionReport = {
  issues: PinoSideCabinetConstructionIssue[];
  taggedPartCount: number;
  metrics: PinoSideCabinetConstructionMetrics;
};

export type PinoSideCabinetConstructionIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

type PinoSideCabinetConstructionRules = {
  toleranceMm: number;
  frontToPlinthClearanceMm: number;
  plinthFrontSetbackMm: number;
  mainVolumeClearanceMm: number;
  movingBodyBottomOffsetMm: number;
  movingBodyTopClearanceMm: number;
  movingBodyVerticalToleranceMm: number;
  movingBodySideInsetMm: number;
  shelfSupportVerticalToleranceMm: number;
  shelfSupportInsetXMm: number;
  shelfSupportInsetZMm: number;
  shelfSupportHeightMm: number;
  shelfSupportWidthMm: number;
  shelfSupportDepthMm: number;
};

function getConstructionRules(params: PinoSideCabinetParams): PinoSideCabinetConstructionRules {
  return {
    toleranceMm: 1.5,
    frontToPlinthClearanceMm: params.plinthHeight + Math.max(2, params.frontGap),
    plinthFrontSetbackMm: 36,
    mainVolumeClearanceMm: 12,
    movingBodyBottomOffsetMm: 6,
    movingBodyTopClearanceMm: 10,
    movingBodyVerticalToleranceMm: 2.5,
    movingBodySideInsetMm: 8,
    shelfSupportVerticalToleranceMm: 2.5,
    shelfSupportInsetXMm: 26,
    shelfSupportInsetZMm: 32,
    shelfSupportHeightMm: 10,
    shelfSupportWidthMm: 10,
    shelfSupportDepthMm: 14
  };
}

function toMeters(valueMm: number) {
  return valueMm * MM_TO_M;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function catalogMaterialId(params: PinoSideCabinetParams, role: MaterialRole) {
  const assignments = isRecord(params.materialAssignments) ? params.materialAssignments : {};
  if (role === "front") return params.frontMaterialId ?? assignments.front;
  if (role === "back") return params.backMaterialId ?? assignments.back;
  if (role === "shelf") return params.shelfMaterialId ?? assignments.shelf ?? assignments.carcass;
  if (role === "plinth") return params.plinthMaterialId ?? assignments.plinth ?? assignments.carcass;
  if (role === "body") return params.bodyMaterialId ?? assignments.carcass;
  return undefined;
}

function materialFallback(role: MaterialRole): MaterialFallbackKind {
  if (role === "front") return "front";
  if (role === "back") return "backPanel";
  if (role === "plinth") return "plinth";
  return "carcass";
}

function makePreviewMaterial(params: PinoSideCabinetParams, catalog: ClientCatalog, role: MaterialRole): PreviewMaterial {
  if (role === "hardware") {
    return { colorHex: "#2f3338", roughness: 0.42, metalness: 0.55 };
  }

  const ctx = createModuleRuntimeCatalogContext(catalog);
  const selectedMaterialId = catalogMaterialId(params, role);
  const resolved = ctx.resolveRenderMaterial(selectedMaterialId, materialFallback(role));
  const catalogMaterial = ctx.resolveMaterial(selectedMaterialId, materialFallback(role));
  return {
    colorHex: resolved.colorHex,
    roughness: resolved.roughness,
    metalness: resolved.metalness,
    catalogMaterial: catalogMaterial ?? undefined
  };
}

function meshMaterial(preview: PreviewMaterial) {
  return new THREE.MeshStandardMaterial({
    color: preview.colorHex,
    roughness: preview.roughness,
    metalness: preview.metalness,
    ...(preview.transparent !== undefined ? { transparent: preview.transparent } : {}),
    ...(preview.opacity !== undefined ? { opacity: preview.opacity } : {})
  });
}

function makeComponentPreviewMaterial(catalog: ClientCatalog, componentId: string | null | undefined, fallback: PreviewMaterial): PreviewMaterial {
  if (!componentId) return fallback;
  const component = catalog.components.find((item) => item.id === componentId);
  if (!component) return fallback;
  return {
    colorHex: component.preview.colorHex,
    roughness: component.preview.roughness,
    metalness: component.preview.metalness
  };
}

function resolveHandleSpec(params: PinoSideCabinetParams, catalog: ClientCatalog): ResolvedHandleSpec {
  const fallback = makePreviewMaterial(params, catalog, "hardware");
  const entry = getPinoHandleByComponentId(params.handleComponentId ?? null);
  const geometry = entry
    ? catalog.componentGeometry.find((item) => item.id === entry.geometryId)
    : params.handleComponentId
      ? catalog.componentGeometry.find((item) => item.id === catalog.components.find((component) => component.id === params.handleComponentId)?.geometryId)
      : undefined;
  const renderKind =
    entry?.renderKind ??
    (geometry?.archetype === "handle_knob"
      ? "knob"
      : geometry?.archetype === "handle_profile"
        ? "profile"
        : "bar");
  const lengthMm =
    geometry?.dimensionsMm.lengthMm ??
    entry?.previewLengthMm ??
    entry?.nominalLengthMm ??
    160;
  const thicknessMm =
    geometry?.dimensionsMm.heightMm ??
    geometry?.dimensionsMm.diameterMm ??
    entry?.heightMm ??
    (renderKind === "knob" ? 26 : renderKind === "profile" ? 18 : 12);
  const projectionMm =
    geometry?.dimensionsMm.projectionMm ??
    geometry?.dimensionsMm.depthMm ??
    entry?.projectionMm ??
    entry?.depthMm ??
    24;
  const allowedCodes = entry?.allowedPlacementCodes ?? ["001", "002", "006"];
  const placementCode = (allowedCodes.includes((params.handlePlacementCode ?? "") as PinoHandlePlacementCode)
    ? params.handlePlacementCode
    : entry?.defaultPlacementCode ?? allowedCodes[0] ?? "001") as PinoHandlePlacementCode;
  return {
    entry,
    preview: makeComponentPreviewMaterial(catalog, entry?.componentId ?? params.handleComponentId ?? null, fallback),
    renderKind,
    lengthMm,
    thicknessMm,
    projectionMm,
    placementCode,
    offsetMm: typeof params.handleOffsetMm === "number" && Number.isFinite(params.handleOffsetMm) ? params.handleOffsetMm : 0
  };
}

function tagsForPart(partName: string): string[] {
  if (/front|door|drawer|pullout/i.test(partName)) return ["module", "front", "door", "wood"];
  if (/back/i.test(partName)) return ["module", "back"];
  if (/shelf|police/i.test(partName)) return ["module", "shelf", "wood"];
  if (/hook|holder|handle|hinge|runner/i.test(partName)) return ["module", "hardware"];
  if (/plinth|sokel/i.test(partName)) return ["module", "plinth"];
  return ["module", "body", "wood"];
}

function inferConstructionPartRole(partName: string): ConstructionPartRole {
  if (partName === "pino_side_cabinet_left_side" || partName === "pino_side_cabinet_right_side") return "side_panel";
  if (partName === "pino_side_cabinet_bottom") return "carcass_bottom";
  if (partName === "pino_side_cabinet_top") return "carcass_top";
  if (partName === "pino_side_cabinet_back") return "back_panel";
  if (partName === "pino_side_cabinet_plinth") return "plinth_panel";
  if (/^pino_side_cabinet_front_.*_(flap_door|swing_door|drawer|pullout)$/.test(partName)) return "front_leaf";
  if (/^pino_side_cabinet_open_niche_\d+_(top|bottom)_rail$/.test(partName)) return "niche_rail";
  if (/_support_(front|rear)_(left|right)$/.test(partName)) return "shelf_support";
  if (/^pino_side_cabinet_(adjustable_shelf|fixed_shelf)_\d+_\d+$/.test(partName)) return "shelf_panel";
  if (/^pino_side_cabinet_wire_shelf_\d+_\d+$/.test(partName)) return "wire_shelf_panel";
  if (/_runner_(left|right)$/.test(partName)) return "runner";
  if (/_handle$/.test(partName)) return "handle";
  if (/pino_side_cabinet_(broom_hook|cable_holder)_/.test(partName)) return "rear_accessory";
  if (/_box_(left|right|front|back|bottom)$/.test(partName)) {
    return partName.includes("pullout") ? "pullout_body" : "drawer_body";
  }
  if (/hinge|rail|holder|hook/i.test(partName)) return "hardware";
  return "unknown";
}

function addBox(args: {
  parent: THREE.Object3D;
  name: string;
  sizeMm: PartSizeMm;
  positionMm: { x: number; y: number; z: number };
  preview: PreviewMaterial;
  paramKeys: string[];
}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      toMeters(Math.max(1, args.sizeMm.width)),
      toMeters(Math.max(1, args.sizeMm.height)),
      toMeters(Math.max(1, args.sizeMm.depth))
    ),
    meshMaterial(args.preview)
  );
  mesh.name = args.name;
  mesh.position.set(toMeters(args.positionMm.x), toMeters(args.positionMm.y), toMeters(args.positionMm.z));
  mesh.userData.selectable = true;
  mesh.userData.paramKeys = [...args.paramKeys];
  mesh.userData.tags = tagsForPart(args.name);
  mesh.userData.partRole = inferConstructionPartRole(args.name);
  mesh.userData.dimensionsMm = { ...args.sizeMm };
  if (args.preview.catalogMaterial) {
    mesh.userData.catalogMaterialId = args.preview.catalogMaterial.id;
    mesh.userData.catalogMaterialName = args.preview.catalogMaterial.displayName;
    mesh.userData.materialRequest = createMaterialRequestFromCatalogMaterial(args.preview.catalogMaterial);
  }
  args.parent.add(mesh);
  return mesh;
}

function addHandle(args: {
  parent: THREE.Object3D;
  name: string;
  widthMm: number;
  heightMm: number;
  xMm: number;
  yMm: number;
  zMm: number;
  orientation: "vertical" | "horizontal";
  handleSpec: ResolvedHandleSpec;
}) {
  const preview = args.handleSpec.preview;
  const isHorizontal = args.orientation === "horizontal";
  if (args.handleSpec.renderKind === "knob") {
    const radiusMm = Math.max(10, args.handleSpec.thicknessMm * 0.5);
    const depthMm = Math.max(10, args.handleSpec.projectionMm);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(toMeters(radiusMm), toMeters(radiusMm), toMeters(depthMm), 20),
      meshMaterial(preview)
    );
    mesh.name = args.name;
    mesh.rotation.x = Math.PI * 0.5;
    mesh.position.set(toMeters(args.xMm), toMeters(args.yMm), toMeters(args.zMm));
    mesh.userData.selectable = true;
    mesh.userData.paramKeys = ["handleComponentId", "handlePlacementCode", "handleOffsetMm"];
    mesh.userData.tags = tagsForPart(args.name);
    mesh.userData.partRole = inferConstructionPartRole(args.name);
    mesh.userData.dimensionsMm = { width: radiusMm * 2, height: radiusMm * 2, depth: depthMm };
    args.parent.add(mesh);
    return mesh;
  }

  const targetLengthMm =
    args.handleSpec.renderKind === "profile"
      ? Math.max(80, (isHorizontal ? args.widthMm : args.heightMm) - 18)
      : args.handleSpec.lengthMm;
  const lengthMm = clamp(
    Math.round(targetLengthMm),
    args.handleSpec.renderKind === "profile" ? 60 : 40,
    Math.max(60, isHorizontal ? args.widthMm - 18 : args.heightMm - 18)
  );
  const thicknessMm = clamp(
    Math.round(args.handleSpec.thicknessMm),
    args.handleSpec.renderKind === "profile" ? 12 : 8,
    args.handleSpec.renderKind === "profile" ? 36 : 28
  );
  const depthMm = clamp(
    Math.round(args.handleSpec.projectionMm),
    args.handleSpec.renderKind === "profile" ? 8 : 10,
    args.handleSpec.renderKind === "profile" ? 28 : 48
  );
  return addBox({
    parent: args.parent,
    name: args.name,
    sizeMm: {
      width: isHorizontal ? lengthMm : thicknessMm,
      height: isHorizontal ? thicknessMm : lengthMm,
      depth: depthMm
    },
    positionMm: { x: args.xMm, y: args.yMm, z: args.zMm },
    preview,
    paramKeys: ["handleComponentId", "handlePlacementCode", "handleOffsetMm"]
  });
}

function makeBand(yBottomMm: number, yTopMm: number): VerticalBandMm {
  return {
    yBottomMm: Math.min(yBottomMm, yTopMm),
    yTopMm: Math.max(yBottomMm, yTopMm)
  };
}

function bandHeight(band: VerticalBandMm) {
  return Math.max(0, band.yTopMm - band.yBottomMm);
}

function bandCenter(band: VerticalBandMm) {
  return band.yBottomMm + bandHeight(band) * 0.5;
}

function rangeOverlapMm(minA: number, maxA: number, minB: number, maxB: number) {
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function absoluteGapMm(a: number, b: number) {
  return Math.abs(a - b);
}

function intersectBand(band: VerticalBandMm, clip: VerticalBandMm): VerticalBandMm | null {
  const yBottomMm = Math.max(band.yBottomMm, clip.yBottomMm);
  const yTopMm = Math.min(band.yTopMm, clip.yTopMm);
  return yTopMm > yBottomMm ? { yBottomMm, yTopMm } : null;
}

function mergeBands(bands: VerticalBandMm[], toleranceMm = 2) {
  const sorted = [...bands].sort((a, b) => a.yBottomMm - b.yBottomMm);
  const merged: VerticalBandMm[] = [];
  for (const band of sorted) {
    const previous = merged.at(-1);
    if (previous && band.yBottomMm <= previous.yTopMm + toleranceMm) {
      previous.yTopMm = Math.max(previous.yTopMm, band.yTopMm);
      continue;
    }
    merged.push({ ...band });
  }
  return merged;
}

function clipBands(bands: VerticalBandMm[], clip: VerticalBandMm) {
  return bands
    .map((band) => intersectBand(band, clip))
    .filter((band): band is VerticalBandMm => !!band);
}

function subtractBands(bands: VerticalBandMm[], exclusions: VerticalBandMm[], clearanceMm = 0) {
  let current = [...bands];
  for (const exclusion of exclusions) {
    const padded = makeBand(exclusion.yBottomMm - clearanceMm, exclusion.yTopMm + clearanceMm);
    current = current.flatMap((band) => {
      const overlap = intersectBand(band, padded);
      if (!overlap) return [band];
      const fragments: VerticalBandMm[] = [];
      if (band.yBottomMm < overlap.yBottomMm) {
        fragments.push(makeBand(band.yBottomMm, overlap.yBottomMm));
      }
      if (band.yTopMm > overlap.yTopMm) {
        fragments.push(makeBand(overlap.yTopMm, band.yTopMm));
      }
      return fragments;
    });
  }
  return current.filter((band) => bandHeight(band) > 1);
}

function splitBand(band: VerticalBandMm, count: number) {
  if (count <= 1) return [{ ...band }];
  const height = bandHeight(band);
  if (height <= 0) return [{ ...band }];
  const step = height / count;
  return Array.from({ length: count }, (_, index) =>
    makeBand(band.yBottomMm + step * index, band.yBottomMm + step * (index + 1))
  );
}

function getComponentKind(componentId: string) {
  return getPinoSideCabinetSystem().componentLibrary[componentId]?.kind ?? null;
}

function isDoorSupportKind(componentId: string) {
  const kind = getComponentKind(componentId);
  return kind === "swing_door" || kind === "flap_door";
}

function getInteriorItemHeightMm(componentId: string, params: PinoSideCabinetParams) {
  if (componentId === "adjustable_shelf" || componentId === "fixed_shelf") return params.shelfThickness;
  if (componentId === "wire_shelf") return 8;
  if (componentId === "drawer") return 150;
  if (componentId === "pullout") return 240;
  if (componentId === "broom_hook") return 40;
  if (componentId === "cable_holder") return 70;
  return params.shelfThickness;
}

function definitionHasInteriorPullout(layout: PinoSideCabinetLayout) {
  return layout.definition.interiorComponents.some((component) => component.componentId === "pullout");
}

function getPlacementCollisionLane(componentId: string, layout: PinoSideCabinetLayout) {
  if (componentId === "broom_hook" || componentId === "cable_holder") return "rear_accessory" as const;
  if ((componentId === "wire_shelf" || componentId === "drawer") && definitionHasInteriorPullout(layout)) {
    return "nested_pullout" as const;
  }
  return "main_volume" as const;
}

function getShelfSupportBands(layout: PinoSideCabinetLayout) {
  return mergeBands(
    layout.frontSegments
      .filter((segment) => isDoorSupportKind(segment.componentId))
      .map((segment) => makeBand(segment.yBottomMm, segment.yTopMm))
  );
}

function getCombinedBand(bands: VerticalBandMm[], fallback: VerticalBandMm) {
  if (bands.length === 0) return fallback;
  return makeBand(
    Math.min(...bands.map((band) => band.yBottomMm)),
    Math.max(...bands.map((band) => band.yTopMm))
  );
}

function placeCentersAcrossBands(args: {
  count: number;
  bands: VerticalBandMm[];
  itemHeightMm: number;
  edgePaddingMm: number;
  fallbackBand: VerticalBandMm;
}) {
  const inset = args.itemHeightMm * 0.5 + args.edgePaddingMm;
  const usableBands = mergeBands(args.bands)
    .map((band) => makeBand(band.yBottomMm + inset, band.yTopMm - inset))
    .filter((band) => band.yTopMm >= band.yBottomMm);

  if (usableBands.length === 0) {
    const fallbackCenter = clamp(bandCenter(args.fallbackBand), args.fallbackBand.yBottomMm + inset, args.fallbackBand.yTopMm - inset);
    return Array.from({ length: args.count }, () => fallbackCenter);
  }

  const totalSpan = usableBands.reduce((sum, band) => sum + Math.max(0, bandHeight(band)), 0);
  if (totalSpan <= 1) {
    return Array.from({ length: args.count }, () => bandCenter(getCombinedBand(usableBands, args.fallbackBand)));
  }

  return Array.from({ length: args.count }, (_, index) => {
    const target = (totalSpan * (index + 1)) / (args.count + 1);
    let cursor = 0;
    for (const band of usableBands) {
      const span = Math.max(0, bandHeight(band));
      if (cursor + span >= target) return band.yBottomMm + (target - cursor);
      cursor += span;
    }
    return bandCenter(usableBands.at(-1) ?? args.fallbackBand);
  });
}

function getInteriorBounds(params: PinoSideCabinetParams): InteriorBoundsMm {
  const shelfHalf = params.shelfThickness * 0.5;
  const innerBottomMm = params.plinthHeight + params.boardThickness;
  const innerTopMm = params.height - params.boardThickness;
  const innerBackZ = -params.depth * 0.5 + params.backThickness;
  const innerFrontZ = params.depth * 0.5 - params.frontThicknessMm - 18;
  return {
    innerWidth: Math.max(1, params.width - params.boardThickness * 2),
    innerDepth: Math.max(160, innerFrontZ - innerBackZ),
    innerBottomMm,
    innerTopMm,
    shelfCenterBottom: innerBottomMm + shelfHalf + 4,
    shelfCenterTop: innerTopMm - shelfHalf - 4,
    innerBackZ,
    innerFrontZ,
    frontPlaneZ: params.depth * 0.5
  };
}

function clampCenters(values: number[], bounds: InteriorBoundsMm) {
  return values
    .map((value) => clamp(value, bounds.shelfCenterBottom, bounds.shelfCenterTop))
    .sort((a, b) => a - b);
}

function getPlacementDepthRangeMm(
  componentId: string,
  lane: ResolvedInteriorPlacement["collisionLane"],
  bounds: InteriorBoundsMm
) {
  if (lane === "rear_accessory") {
    const depthMm = Math.min(36, Math.max(18, bounds.innerDepth * 0.12));
    const zBackMm = bounds.innerBackZ + 8;
    const zFrontMm = Math.min(bounds.innerFrontZ - 90, zBackMm + depthMm);
    return {
      depthMm: Math.max(12, zFrontMm - zBackMm),
      zBackMm,
      zFrontMm,
      zCenterMm: zBackMm + Math.max(12, zFrontMm - zBackMm) * 0.5
    };
  }

  if (lane === "nested_pullout") {
    const depthMm = Math.max(120, Math.min(bounds.innerDepth - 88, 220));
    const zFrontMm = bounds.innerFrontZ - 44;
    const zBackMm = zFrontMm - depthMm;
    return {
      depthMm,
      zBackMm,
      zFrontMm,
      zCenterMm: zBackMm + depthMm * 0.5
    };
  }

  if (componentId === "wire_shelf") {
    const depthMm = Math.max(120, bounds.innerDepth - 48);
    const zBackMm = bounds.innerBackZ + 8;
    const zFrontMm = zBackMm + depthMm;
    return {
      depthMm,
      zBackMm,
      zFrontMm,
      zCenterMm: zBackMm + depthMm * 0.5
    };
  }

  if (componentId === "adjustable_shelf" || componentId === "fixed_shelf") {
    const depthMm = Math.max(140, bounds.innerDepth - 8);
    const zBackMm = bounds.innerBackZ + 8;
    const zFrontMm = zBackMm + depthMm;
    return {
      depthMm,
      zBackMm,
      zFrontMm,
      zCenterMm: zBackMm + depthMm * 0.5
    };
  }

  return {
    depthMm: bounds.innerDepth,
    zBackMm: bounds.innerBackZ,
    zFrontMm: bounds.innerFrontZ,
    zCenterMm: bounds.innerBackZ + bounds.innerDepth * 0.5
  };
}

function resolveInteriorPlacements(
  component: { componentId: string; placement: string; count: number; nameRaw: string },
  layout: PinoSideCabinetLayout,
  params: PinoSideCabinetParams
): ResolvedInteriorPlacement[] {
  const bounds = getInteriorBounds(params);
  const collisionLane = getPlacementCollisionLane(component.componentId, layout);
  const depthRange = getPlacementDepthRangeMm(component.componentId, collisionLane, bounds);
  const carcassBand = makeBand(bounds.innerBottomMm, bounds.innerTopMm);
  const supportBands = getShelfSupportBands(layout);
  const supportEnvelope = getCombinedBand(supportBands, carcassBand);
  const upperDoorSegment = layout.frontSegments.find((segment) => segment.componentId === "swing_door");
  const nicheSegment = layout.frontSegments.find((segment) => segment.componentId === "open_niche");
  const itemHeightMm = getInteriorItemHeightMm(component.componentId, params);
  const upperBand = supportBands.at(-1) ?? makeBand(bounds.innerTopMm - 420, bounds.innerTopMm);
  const lowerBand = supportBands[0] ?? makeBand(bounds.innerBottomMm, bounds.innerBottomMm + 420);
  const middleBand = makeBand(
    supportEnvelope.yBottomMm + bandHeight(supportEnvelope) * 0.25,
    supportEnvelope.yTopMm - bandHeight(supportEnvelope) * 0.25
  );
  const lowerHalfBand = makeBand(carcassBand.yBottomMm, carcassBand.yBottomMm + bandHeight(carcassBand) * 0.52);
  const rearUpperBand = nicheSegment
    ? makeBand(Math.max(nicheSegment.yBottomMm + 60, upperBand.yBottomMm), Math.min(nicheSegment.yTopMm - 60, upperBand.yTopMm))
    : upperBand;
  const count = Math.max(1, component.count);
  let centers: number[] = [];
  let supportZone = component.placement;

  switch (component.placement) {
    case "between_upper_and_lower_door": {
      const boundary = upperDoorSegment?.yBottomMm ?? bandCenter(supportEnvelope);
      centers = [clamp(boundary, bounds.innerBottomMm + itemHeightMm * 0.5, bounds.innerTopMm - itemHeightMm * 0.5)];
      supportZone = "door_split";
      break;
    }
    case "upper_zone":
      centers = placeCentersAcrossBands({ count, bands: [upperBand], itemHeightMm, edgePaddingMm: 24, fallbackBand: upperBand });
      supportZone = "upper_zone";
      break;
    case "lower_zone":
      centers = placeCentersAcrossBands({ count, bands: [lowerBand], itemHeightMm, edgePaddingMm: 24, fallbackBand: lowerBand });
      supportZone = "lower_zone";
      break;
    case "middle_lower":
      centers = placeCentersAcrossBands({
        count,
        bands: clipBands(supportBands.length > 0 ? supportBands : [carcassBand], lowerHalfBand),
        itemHeightMm,
        edgePaddingMm: 20,
        fallbackBand: lowerHalfBand
      });
      supportZone = "middle_lower";
      break;
    case "middle_zone":
      centers = placeCentersAcrossBands({ count, bands: [middleBand], itemHeightMm, edgePaddingMm: 20, fallbackBand: middleBand });
      supportZone = "middle_zone";
      break;
    case "full_height":
      if (component.componentId === "drawer" && collisionLane === "main_volume") {
        const reservedBands = layout.definition.interiorComponents
          .filter((candidate) => candidate !== component && isShelfLikeComponent(candidate.componentId))
          .flatMap((candidate) => resolveInteriorPlacements(candidate, layout, params))
          .map((placement) => makeBand(placement.yBottomMm, placement.yTopMm));
        const usableBands = subtractBands([carcassBand], reservedBands, 24);
        centers = placeCentersAcrossBands({
          count,
          bands: usableBands.length > 0 ? usableBands : [carcassBand],
          itemHeightMm,
          edgePaddingMm: 20,
          fallbackBand: carcassBand
        });
      } else {
        centers = placeCentersAcrossBands({ count, bands: [carcassBand], itemHeightMm, edgePaddingMm: 20, fallbackBand: carcassBand });
      }
      supportZone = "full_height";
      break;
    case "lower_split": {
      const cells = splitBand(lowerHalfBand, count);
      centers = cells.map((cell) => {
        const host =
          component.componentId === "drawer"
            ? makeBand(cell.yBottomMm + bandHeight(cell) * 0.45, cell.yTopMm)
            : component.componentId === "pullout"
              ? makeBand(cell.yBottomMm, cell.yBottomMm + bandHeight(cell) * 0.62)
              : cell;
        const [center] = placeCentersAcrossBands({ count: 1, bands: [host], itemHeightMm, edgePaddingMm: 14, fallbackBand: host });
        return center;
      });
      supportZone = "lower_split";
      break;
    }
    case "rear_upper":
      centers = placeCentersAcrossBands({ count, bands: [rearUpperBand], itemHeightMm, edgePaddingMm: 14, fallbackBand: rearUpperBand });
      supportZone = "rear_upper";
      break;
    case "rear_mid":
      centers = placeCentersAcrossBands({ count, bands: [middleBand], itemHeightMm, edgePaddingMm: 14, fallbackBand: middleBand });
      supportZone = "rear_mid";
      break;
    case "distributed":
    default:
      centers = placeCentersAcrossBands({
        count,
        bands: supportBands.length > 0 ? supportBands : [carcassBand],
        itemHeightMm,
        edgePaddingMm: 24,
        fallbackBand: supportEnvelope
      });
      supportZone = "distributed";
      break;
  }

  if (collisionLane === "nested_pullout" && component.componentId === "drawer") {
    const pulloutHostComponent = layout.definition.interiorComponents.find(
      (candidate) => candidate.componentId === "pullout" && candidate.placement === component.placement && candidate.count === component.count
    );
    if (pulloutHostComponent) {
      const hostCenters = resolveInteriorPlacements(pulloutHostComponent, layout, params)
        .sort((a, b) => a.yBottomMm - b.yBottomMm)
        .map((placement) => placement.yCenterMm);
      if (hostCenters.length === count) {
        centers = hostCenters;
      }
    }
  }

  return clampCenters(centers, bounds).map((yCenterMm, itemIndex) => {
    const resolvedHeightMm =
      component.componentId === "pullout" && component.placement === "full_height"
        ? Math.max(itemHeightMm, bounds.innerTopMm - bounds.innerBottomMm - 40)
        : itemHeightMm;
    return {
    componentId: component.componentId,
    placement: component.placement,
    nameRaw: component.nameRaw,
    itemIndex,
    yCenterMm,
    yBottomMm: yCenterMm - resolvedHeightMm * 0.5,
    yTopMm: yCenterMm + resolvedHeightMm * 0.5,
    heightMm: resolvedHeightMm,
    depthMm: depthRange.depthMm,
    supportZone,
    collisionLane,
    hostComponentId: collisionLane === "nested_pullout" ? "pullout" : null,
    zCenterMm: depthRange.zCenterMm,
    zFrontMm: depthRange.zFrontMm,
    zBackMm: depthRange.zBackMm
    };
  });
}

function isShelfLikeComponent(componentId: string) {
  return componentId === "adjustable_shelf" || componentId === "fixed_shelf" || componentId === "wire_shelf";
}

function isSolidInteriorComponent(componentId: string) {
  return isShelfLikeComponent(componentId) || componentId === "drawer" || componentId === "pullout";
}

function collectConstructionPartBounds(root: THREE.Object3D): ConstructionPartBounds[] {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  return root.children
    .flatMap((child) => {
      const bounds: ConstructionPartBounds[] = [];
      child.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const role = inferConstructionPartRole(mesh.name);
        if (role === "unknown") return;
        box.setFromObject(mesh);
        const min = box.min.clone().multiplyScalar(1000);
        const max = box.max.clone().multiplyScalar(1000);
        bounds.push({
          name: mesh.name,
          role,
          minX: min.x,
          maxX: max.x,
          minY: min.y,
          maxY: max.y,
          minZ: min.z,
          maxZ: max.z,
          sizeX: max.x - min.x,
          sizeY: max.y - min.y,
          sizeZ: max.z - min.z
        });
      });
      return bounds;
    })
    .filter((part) => Number.isFinite(part.minX) && Number.isFinite(part.maxX) && Number.isFinite(part.minY) && Number.isFinite(part.maxY));
}

function inspectPinoSideCabinetConstruction(
  params: PinoSideCabinetParams,
  root?: THREE.Object3D
): PinoSideCabinetConstructionReport {
  const normalized = normalizePinoSideCabinetParams(params);
  const rules = getConstructionRules(normalized);
  const layout = createPinoSideCabinetLayout(normalized);
  const bounds = getInteriorBounds(normalized);
  const issues: PinoSideCabinetConstructionIssue[] = [];
  const allPlacements = layout.definition.interiorComponents.flatMap((component) => resolveInteriorPlacements(component, layout, normalized));
  const movingPlacementRecords = layout.definition.interiorComponents.flatMap((component, index) =>
    resolveInteriorPlacements(component, layout, normalized)
      .filter((placement) => placement.componentId === "drawer" || placement.componentId === "pullout")
      .map((placement) => ({
        placement,
        prefix: `pino_side_cabinet_inner_${component.componentId}_${index + 1}_${placement.itemIndex + 1}`
      }))
  );

  const frontBottomLimit = rules.frontToPlinthClearanceMm;
  const lowestFront = layout.frontSegments.at(-1);
  if (lowestFront && lowestFront.yBottomMm < frontBottomLimit) {
    issues.push({
      code: "front_below_plinth",
      severity: "error",
      message: "Front stack enters the plinth zone."
    });
  }

  for (let index = 0; index < layout.frontSegments.length; index += 1) {
    const segment = layout.frontSegments[index]!;
    if (segment.heightMm < 80) {
      issues.push({
        code: "segment_too_small",
        severity: "warning",
        message: `Front segment ${index + 1} is compressed below 80 mm.`
      });
    }
    if (index > 0) {
      const previous = layout.frontSegments[index - 1]!;
      const gap = Math.abs(previous.yBottomMm - segment.yTopMm);
      if (gap > 1) {
        issues.push({
          code: "segment_gap",
          severity: "error",
          message: `Front segments ${index} and ${index + 1} do not touch cleanly.`
        });
      }
    }
  }

  for (const placement of allPlacements) {
    if (placement.yBottomMm < bounds.innerBottomMm - 0.5 || placement.yTopMm > bounds.innerTopMm + 0.5) {
      issues.push({
        code: "interior_out_of_bounds",
        severity: "error",
        message: `${placement.nameRaw} is outside the usable carcass height.`
      });
    }

    if (isShelfLikeComponent(placement.componentId) && placement.yBottomMm < normalized.plinthHeight + normalized.boardThickness) {
      issues.push({
        code: "floating_shelf",
        severity: "error",
        message: `${placement.nameRaw} enters the plinth or bottom board zone.`
      });
    }

    if (placement.zBackMm < bounds.innerBackZ - 2 || placement.zFrontMm > bounds.innerFrontZ + 2) {
      issues.push({
        code: "interior_depth_out_of_bounds",
        severity: "error",
        message: `${placement.nameRaw} leaves the usable cabinet depth.`
      });
    }
  }

  const mainVolumePlacements = allPlacements
    .filter((placement) => placement.collisionLane === "main_volume" && isSolidInteriorComponent(placement.componentId))
    .sort((a, b) => a.yBottomMm - b.yBottomMm);
  let minMainVolumeGapMm: number | null = null;
  for (let index = 1; index < mainVolumePlacements.length; index += 1) {
    const previous = mainVolumePlacements[index - 1]!;
    const current = mainVolumePlacements[index]!;
    const gap = current.yBottomMm - previous.yTopMm;
    minMainVolumeGapMm = minMainVolumeGapMm === null ? gap : Math.min(minMainVolumeGapMm, gap);
    if (current.yBottomMm < previous.yTopMm - 0.5) {
      issues.push({
        code: "interior_overlap",
        severity: "error",
        message: `${current.nameRaw} overlaps vertically with ${previous.nameRaw}.`
      });
      break;
    }
    if (gap < rules.mainVolumeClearanceMm) {
      issues.push({
        code: "interior_gap_too_small",
        severity: "warning",
        message: `${current.nameRaw} leaves only ${Math.round(gap)} mm above ${previous.nameRaw}.`
      });
    }
  }

  const pulloutHosts = allPlacements
    .filter((placement) => placement.componentId === "pullout")
    .sort((a, b) => a.yBottomMm - b.yBottomMm);
  for (const placement of allPlacements.filter((item) => item.collisionLane === "nested_pullout")) {
    const host = pulloutHosts.find((candidate) => placement.yBottomMm >= candidate.yBottomMm - 0.5 && placement.yTopMm <= candidate.yTopMm + 0.5);
    if (!host) {
      issues.push({
        code: "nested_item_without_host",
        severity: "error",
        message: `${placement.nameRaw} is not hosted inside a pullout zone.`
      });
    }
  }

  if (root) {
    const parts = collectConstructionPartBounds(root);
    const roleCounts = parts.reduce<Record<string, number>>((acc, part) => {
      acc[part.role] = (acc[part.role] ?? 0) + 1;
      return acc;
    }, {});
    const innerLeftMm = -normalized.width * 0.5 + normalized.boardThickness;
    const innerRightMm = normalized.width * 0.5 - normalized.boardThickness;
    const expectedBottomTopMm = normalized.plinthHeight + normalized.boardThickness;
    const frontLeaves = parts.filter((part) => part.role === "front_leaf");
    const shelfPanels = parts.filter((part) => part.role === "shelf_panel" || part.role === "wire_shelf_panel");
    const shelfSupports = parts.filter((part) => part.role === "shelf_support");
    const movingBodies = parts.filter((part) => part.role === "drawer_body" || part.role === "pullout_body");
    const runnerParts = parts.filter((part) => part.role === "runner");
    const nicheRails = parts.filter((part) => part.role === "niche_rail");
    const plinthPanel = parts.find((part) => part.role === "plinth_panel");
    const carcassJointGaps: number[] = [];
    const frontCenterGaps: number[] = [];

    if ((roleCounts.side_panel ?? 0) !== 2 || (roleCounts.carcass_bottom ?? 0) !== 1 || (roleCounts.carcass_top ?? 0) !== 1) {
      issues.push({
        code: "carcass_part_count",
        severity: "error",
        message: "Carcass is missing one or more required structural panels."
      });
    }

    const bottomPanel = parts.find((part) => part.role === "carcass_bottom");
    const topPanel = parts.find((part) => part.role === "carcass_top");
    const backPanel = parts.find((part) => part.role === "back_panel");
    const sidePanels = parts.filter((part) => part.role === "side_panel");
    if (bottomPanel && Math.abs(bottomPanel.maxY - expectedBottomTopMm) > rules.toleranceMm) {
      issues.push({
        code: "bottom_panel_misaligned",
        severity: "error",
        message: "Bottom panel is not seated directly above the plinth."
      });
    }
    if (bottomPanel && sidePanels.length === 2) {
      const [leftPanel, rightPanel] = [...sidePanels].sort((a, b) => a.minX - b.minX);
      const leftGap = absoluteGapMm(bottomPanel.minX, leftPanel!.maxX);
      const rightGap = absoluteGapMm(bottomPanel.maxX, rightPanel!.minX);
      const frontFlushGap = Math.max(absoluteGapMm(bottomPanel.maxZ, leftPanel!.maxZ), absoluteGapMm(bottomPanel.maxZ, rightPanel!.maxZ));
      const backFlushGap = Math.max(absoluteGapMm(bottomPanel.minZ, leftPanel!.minZ), absoluteGapMm(bottomPanel.minZ, rightPanel!.minZ));
      carcassJointGaps.push(leftGap, rightGap, frontFlushGap, backFlushGap);
      if (leftGap > rules.toleranceMm || rightGap > rules.toleranceMm || frontFlushGap > rules.toleranceMm || backFlushGap > rules.toleranceMm) {
        issues.push({
          code: "bottom_panel_joint_gap",
          severity: "error",
          message: "Bottom panel is not fitted tightly between the side panels."
        });
      }
    }
    if (topPanel && Math.abs(topPanel.maxY - normalized.height) > rules.toleranceMm) {
      issues.push({
        code: "top_panel_misaligned",
        severity: "error",
        message: "Top panel is not flush with the cabinet height."
      });
    }
    if (topPanel && sidePanels.length === 2) {
      const [leftPanel, rightPanel] = [...sidePanels].sort((a, b) => a.minX - b.minX);
      const leftGap = absoluteGapMm(topPanel.minX, leftPanel!.maxX);
      const rightGap = absoluteGapMm(topPanel.maxX, rightPanel!.minX);
      const frontFlushGap = Math.max(absoluteGapMm(topPanel.maxZ, leftPanel!.maxZ), absoluteGapMm(topPanel.maxZ, rightPanel!.maxZ));
      const backFlushGap = Math.max(absoluteGapMm(topPanel.minZ, leftPanel!.minZ), absoluteGapMm(topPanel.minZ, rightPanel!.minZ));
      carcassJointGaps.push(leftGap, rightGap, frontFlushGap, backFlushGap);
      if (leftGap > rules.toleranceMm || rightGap > rules.toleranceMm || frontFlushGap > rules.toleranceMm || backFlushGap > rules.toleranceMm) {
        issues.push({
          code: "top_panel_joint_gap",
          severity: "error",
          message: "Top panel is not fitted tightly between the side panels."
        });
      }
    }
    if (backPanel) {
      if (backPanel.minY < expectedBottomTopMm - rules.toleranceMm || backPanel.maxY > normalized.height + rules.toleranceMm) {
        issues.push({
          code: "back_panel_misaligned",
          severity: "error",
          message: "Back panel does not stay inside the carcass support span."
        });
      }
      if (backPanel.minX < innerLeftMm - rules.toleranceMm || backPanel.maxX > innerRightMm + rules.toleranceMm) {
        issues.push({
          code: "back_panel_outside_sides",
          severity: "error",
          message: "Back panel protrudes outside the side-panel span."
        });
      }
      if (bottomPanel) {
        const bottomContact = absoluteGapMm(backPanel.minY, bottomPanel.maxY);
        carcassJointGaps.push(bottomContact);
        if (bottomContact > rules.toleranceMm) {
          issues.push({
            code: "back_panel_bottom_gap",
            severity: "error",
            message: "Back panel does not land on the carcass bottom support line."
          });
        }
      }
      if (topPanel) {
        const topContact = absoluteGapMm(backPanel.maxY, topPanel.maxY);
        carcassJointGaps.push(topContact);
        if (topContact > rules.toleranceMm) {
          issues.push({
            code: "back_panel_top_gap",
            severity: "error",
            message: "Back panel does not reach the carcass top support line."
          });
        }
      }
    }
    for (const sidePanel of sidePanels) {
      if (Math.abs(sidePanel.minY - normalized.plinthHeight) > rules.toleranceMm || Math.abs(sidePanel.maxY - normalized.height) > rules.toleranceMm) {
        issues.push({
          code: "side_panel_misaligned",
          severity: "error",
          message: "A side panel does not span cleanly from plinth to top."
        });
        break;
      }
    }
    if (plinthPanel) {
      const plinthSetbackMm = normalized.depth * 0.5 - plinthPanel.maxZ;
      if (plinthSetbackMm < rules.plinthFrontSetbackMm - rules.toleranceMm) {
        issues.push({
          code: "plinth_too_far_forward",
          severity: "error",
          message: "Plinth front is too close to the door line."
        });
      }
    }

    let supportedShelfCount = 0;
    for (const shelf of shelfPanels) {
      if (shelf.minY < expectedBottomTopMm - 0.5) {
        issues.push({
          code: "shelf_below_bottom_panel",
          severity: "error",
          message: `${shelf.name} drops below the carcass bottom support plane.`
        });
      }
      if (shelf.minX < innerLeftMm - 1.5 || shelf.maxX > innerRightMm + 1.5) {
        issues.push({
          code: "shelf_outside_sides",
          severity: "error",
          message: `${shelf.name} protrudes through the cabinet side span.`
        });
      }
      const matchingSupports = shelfSupports.filter((support) => support.name.startsWith(`${shelf.name}_support_`));
      if (matchingSupports.length < 4) {
        issues.push({
          code: "shelf_missing_support",
          severity: "error",
          message: `${shelf.name} is missing visible support hardware.`
        });
        continue;
      }
      const supportsAreAligned = matchingSupports.every((support) => {
        const supportGap = shelf.minY - support.maxY;
        const xInside = support.minX >= shelf.minX - rules.toleranceMm && support.maxX <= shelf.maxX + rules.toleranceMm;
        const zInside = support.minZ >= shelf.minZ - rules.toleranceMm && support.maxZ <= shelf.maxZ + rules.toleranceMm;
        return supportGap >= -rules.toleranceMm && supportGap <= rules.shelfSupportVerticalToleranceMm && xInside && zInside;
      });
      if (!supportsAreAligned) {
        issues.push({
          code: "shelf_support_misaligned",
          severity: "error",
          message: `${shelf.name} has support hardware outside the shelf footprint or detached from the board.`
        });
        continue;
      }
      supportedShelfCount += 1;
    }
    for (const rail of nicheRails) {
      const match = /^pino_side_cabinet_open_niche_(\d+)_(top|bottom)_rail$/.exec(rail.name);
      if (!match) continue;
      const segmentIndex = Number(match[1]) - 1;
      const railPosition = match[2];
      const segment = layout.frontSegments[segmentIndex];
      if (!segment || layout.definition.frontStackTopDown[segmentIndex]?.componentId !== "open_niche") {
        issues.push({
          code: "niche_rail_without_opening",
          severity: "error",
          message: `${rail.name} exists without a matching open niche segment.`
        });
        continue;
      }
      if (rail.minX < innerLeftMm - rules.toleranceMm || rail.maxX > innerRightMm + rules.toleranceMm) {
        issues.push({
          code: "niche_rail_outside_sides",
          severity: "error",
          message: `${rail.name} protrudes through the side span.`
        });
      }
      if (rail.minZ < bounds.innerBackZ - rules.toleranceMm || rail.maxZ > bounds.innerFrontZ + rules.toleranceMm) {
        issues.push({
          code: "niche_rail_depth_out_of_bounds",
          severity: "error",
          message: `${rail.name} leaves the usable cabinet depth.`
        });
      }
      const edgeGap = railPosition === "top"
        ? absoluteGapMm(rail.maxY, segment.yTopMm)
        : absoluteGapMm(rail.minY, segment.yBottomMm);
      if (edgeGap > rules.toleranceMm) {
        issues.push({
          code: "niche_rail_misaligned",
          severity: "error",
          message: `${rail.name} is not seated on the niche opening boundary.`
        });
      }
    }
    let supportedMovingBodyCount = 0;
    let minMovingBodyBottomOffsetMm: number | null = null;
    let maxMovingBodyTopClearanceMm: number | null = null;
    for (const record of movingPlacementRecords) {
      const matchingBodies = movingBodies.filter((part) => part.name.startsWith(`${record.prefix}_box_`));
      const matchingRunners = runnerParts.filter((part) => part.name.startsWith(`${record.prefix}_runner_`));
      if (matchingBodies.length < 5) {
        issues.push({
          code: "moving_body_incomplete",
          severity: "error",
          message: `${record.prefix} is missing one or more drawer/pullout body panels.`
        });
        continue;
      }
      if (matchingRunners.length < 2) {
        issues.push({
          code: "moving_body_missing_runners",
          severity: "error",
          message: `${record.prefix} is missing visible runner hardware.`
        });
        continue;
      }
      const bodyMinY = Math.min(...matchingBodies.map((part) => part.minY));
      const bodyMaxY = Math.max(...matchingBodies.map((part) => part.maxY));
      const bodyMinX = Math.min(...matchingBodies.map((part) => part.minX));
      const bodyMaxX = Math.max(...matchingBodies.map((part) => part.maxX));
      const bodyMinZ = Math.min(...matchingBodies.map((part) => part.minZ));
      const bodyMaxZ = Math.max(...matchingBodies.map((part) => part.maxZ));
      const bottomOffset = bodyMinY - record.placement.yBottomMm;
      const topClearance = record.placement.yTopMm - bodyMaxY;
      minMovingBodyBottomOffsetMm = minMovingBodyBottomOffsetMm === null ? bottomOffset : Math.min(minMovingBodyBottomOffsetMm, bottomOffset);
      maxMovingBodyTopClearanceMm = maxMovingBodyTopClearanceMm === null ? topClearance : Math.max(maxMovingBodyTopClearanceMm, topClearance);
      const yAligned =
        bottomOffset >= rules.movingBodyBottomOffsetMm - rules.movingBodyVerticalToleranceMm &&
        bottomOffset <= rules.movingBodyBottomOffsetMm + rules.movingBodyVerticalToleranceMm &&
        topClearance >= rules.movingBodyTopClearanceMm - rules.movingBodyVerticalToleranceMm &&
        topClearance <= rules.movingBodyTopClearanceMm + rules.movingBodyVerticalToleranceMm;
      const xAligned =
        bodyMinX >= innerLeftMm + rules.movingBodySideInsetMm - rules.toleranceMm &&
        bodyMaxX <= innerRightMm - rules.movingBodySideInsetMm + rules.toleranceMm;
      const zAligned =
        bodyMinZ >= record.placement.zBackMm - rules.toleranceMm &&
        bodyMaxZ <= record.placement.zFrontMm + rules.toleranceMm;
      const runnersAligned = matchingRunners.every((runner) =>
        runner.minY >= bodyMinY - rules.toleranceMm &&
        runner.maxY <= bodyMaxY + rules.toleranceMm &&
        runner.minZ >= bodyMinZ - rules.toleranceMm &&
        runner.maxZ <= bodyMaxZ + rules.toleranceMm
      );
      if (!yAligned || !xAligned || !zAligned || !runnersAligned) {
        issues.push({
          code: "moving_body_misaligned",
          severity: "error",
          message: `${record.prefix} does not stay cleanly inside its assigned drawer/pullout band.`
        });
        continue;
      }
      supportedMovingBodyCount += 1;
    }
    for (const front of frontLeaves) {
      if (front.minY < frontBottomLimit - rules.toleranceMm) {
        issues.push({
          code: "front_leaf_below_plinth",
          severity: "error",
          message: `${front.name} drops into the plinth clearance zone.`
        });
        break;
      }
    }
    const openedFrontProjectionMm = frontLeaves.length > 0 ? Math.max(...frontLeaves.map((part) => part.maxZ - normalized.depth * 0.5)) : null;
    if (normalized.opened && openedFrontProjectionMm !== null && openedFrontProjectionMm <= normalized.frontThicknessMm + 8) {
      issues.push({
        code: "opened_front_not_projecting_outward",
        severity: "error",
        message: "Opened front leaves do not project outward from the cabinet front plane."
      });
    }
    if (!normalized.opened && frontLeaves.length > 0) {
      const frontMinX = Math.min(...frontLeaves.map((part) => part.minX));
      const frontMaxX = Math.max(...frontLeaves.map((part) => part.maxX));
      const leftReveal = frontMinX - (-normalized.width * 0.5);
      const rightReveal = normalized.width * 0.5 - frontMaxX;
      if (Math.abs(leftReveal - normalized.sideGap) > rules.toleranceMm || Math.abs(rightReveal - normalized.sideGap) > rules.toleranceMm) {
        issues.push({
          code: "front_side_reveal_misaligned",
          severity: "error",
          message: "Front leaves do not keep the configured side reveal."
        });
      }

      const frontBySegment = new Map<number, ConstructionPartBounds[]>();
      for (const front of frontLeaves) {
        const match = /^pino_side_cabinet_front_(\d+)_/.exec(front.name);
        if (!match) continue;
        const segmentIndex = Number(match[1]) - 1;
        const current = frontBySegment.get(segmentIndex) ?? [];
        current.push(front);
        frontBySegment.set(segmentIndex, current);
      }
      for (const segmentFronts of frontBySegment.values()) {
        const ordered = [...segmentFronts].sort((a, b) => a.minX - b.minX);
        for (let index = 1; index < ordered.length; index += 1) {
          const gap = ordered[index]!.minX - ordered[index - 1]!.maxX;
          frontCenterGaps.push(gap);
          if (Math.abs(gap - normalized.frontGap) > rules.toleranceMm) {
            issues.push({
              code: "front_center_gap_misaligned",
              severity: "error",
              message: "Split front leaves do not keep the configured center gap."
            });
            break;
          }
        }
      }
    }
    const plinthFrontSetbackMm = plinthPanel ? normalized.depth * 0.5 - plinthPanel.maxZ : null;

    return {
      issues,
      taggedPartCount: parts.length,
      metrics: {
        frontBottomClearanceMm: frontLeaves.length > 0 ? Math.min(...frontLeaves.map((part) => part.minY)) : null,
        plinthTopMm: normalized.plinthHeight,
        carcassInnerBottomMm: expectedBottomTopMm,
        carcassInnerTopMm: normalized.height - normalized.boardThickness,
        mainVolumePlacementCount: mainVolumePlacements.length,
        nestedPulloutPlacementCount: allPlacements.filter((placement) => placement.collisionLane === "nested_pullout").length,
        rearAccessoryPlacementCount: allPlacements.filter((placement) => placement.collisionLane === "rear_accessory").length,
        plinthFrontSetbackMm,
        maxCarcassJointGapMm: carcassJointGaps.length > 0 ? Math.max(...carcassJointGaps) : null,
        frontSideRevealLeftMm: !normalized.opened && frontLeaves.length > 0 ? Math.min(...frontLeaves.map((part) => part.minX)) - (-normalized.width * 0.5) : null,
        frontSideRevealRightMm: !normalized.opened && frontLeaves.length > 0 ? normalized.width * 0.5 - Math.max(...frontLeaves.map((part) => part.maxX)) : null,
        minFrontCenterGapMm: frontCenterGaps.length > 0 ? Math.min(...frontCenterGaps) : null,
        maxFrontCenterGapMm: frontCenterGaps.length > 0 ? Math.max(...frontCenterGaps) : null,
        shelfSupportCount: shelfSupports.length,
        supportedShelfCount,
        unsupportedShelfCount: Math.max(0, shelfPanels.length - supportedShelfCount),
        minMainVolumeGapMm,
        movingRunnerCount: runnerParts.length,
        supportedMovingBodyCount,
        unsupportedMovingBodyCount: Math.max(0, movingPlacementRecords.length - supportedMovingBodyCount),
        minMovingBodyBottomOffsetMm,
        maxMovingBodyTopClearanceMm,
        openedFrontProjectionMm
      }
    };
  }

  return {
    issues,
    taggedPartCount: 0,
    metrics: {
      frontBottomClearanceMm: lowestFront ? lowestFront.yBottomMm + normalized.frontGap * 0.5 : null,
      plinthTopMm: normalized.plinthHeight,
      carcassInnerBottomMm: bounds.innerBottomMm,
      carcassInnerTopMm: bounds.innerTopMm,
      mainVolumePlacementCount: mainVolumePlacements.length,
      nestedPulloutPlacementCount: allPlacements.filter((placement) => placement.collisionLane === "nested_pullout").length,
      rearAccessoryPlacementCount: allPlacements.filter((placement) => placement.collisionLane === "rear_accessory").length,
      plinthFrontSetbackMm: null,
      maxCarcassJointGapMm: null,
      frontSideRevealLeftMm: null,
      frontSideRevealRightMm: null,
      minFrontCenterGapMm: null,
      maxFrontCenterGapMm: null,
      shelfSupportCount: 0,
      supportedShelfCount: 0,
      unsupportedShelfCount: allPlacements.filter((placement) => isShelfLikeComponent(placement.componentId)).length,
      minMainVolumeGapMm,
      movingRunnerCount: 0,
      supportedMovingBodyCount: 0,
      unsupportedMovingBodyCount: allPlacements.filter((placement) => placement.componentId === "drawer" || placement.componentId === "pullout").length,
      minMovingBodyBottomOffsetMm: null,
      maxMovingBodyTopClearanceMm: null,
      openedFrontProjectionMm: null
    }
  };
}

export function validatePinoSideCabinetConstruction(params: PinoSideCabinetParams): PinoSideCabinetConstructionIssue[] {
  return inspectPinoSideCabinetConstruction(params).issues;
}

function addCarcass(group: THREE.Group, params: PinoSideCabinetParams, catalog: ClientCatalog) {
  const body = makePreviewMaterial(params, catalog, "body");
  const back = makePreviewMaterial(params, catalog, "back");
  const plinth = makePreviewMaterial(params, catalog, "plinth");
  const t = params.boardThickness;
  const width = params.width;
  const height = params.height;
  const depth = params.depth;
  const backT = params.backThickness;
  const innerWidth = Math.max(1, width - 2 * t);
  const innerHeight = Math.max(1, height - params.plinthHeight - t);
  const baseY = params.plinthHeight;
  const carcassHeight = Math.max(1, height - params.plinthHeight);
  const carcassCenterY = baseY + carcassHeight * 0.5;

  addBox({
    parent: group,
    name: "pino_side_cabinet_left_side",
    sizeMm: { width: t, height: carcassHeight, depth },
    positionMm: { x: -width * 0.5 + t * 0.5, y: carcassCenterY, z: 0 },
    preview: body,
    paramKeys: ["width", "height", "depth", "boardThickness"]
  });
  addBox({
    parent: group,
    name: "pino_side_cabinet_right_side",
    sizeMm: { width: t, height: carcassHeight, depth },
    positionMm: { x: width * 0.5 - t * 0.5, y: carcassCenterY, z: 0 },
    preview: body,
    paramKeys: ["width", "height", "depth", "boardThickness"]
  });
  addBox({
    parent: group,
    name: "pino_side_cabinet_bottom",
    sizeMm: { width: innerWidth, height: t, depth },
    positionMm: { x: 0, y: baseY + t * 0.5, z: 0 },
    preview: body,
    paramKeys: ["width", "depth", "boardThickness"]
  });
  addBox({
    parent: group,
    name: "pino_side_cabinet_top",
    sizeMm: { width: innerWidth, height: t, depth },
    positionMm: { x: 0, y: height - t * 0.5, z: 0 },
    preview: body,
    paramKeys: ["width", "height", "depth", "boardThickness"]
  });
  addBox({
    parent: group,
    name: "pino_side_cabinet_back",
    sizeMm: { width: innerWidth, height: innerHeight, depth: backT },
    positionMm: { x: 0, y: params.plinthHeight + t + innerHeight * 0.5, z: -depth * 0.5 + backT * 0.5 },
    preview: back,
    paramKeys: ["width", "height", "depth", "backThickness"]
  });
  addBox({
    parent: group,
    name: "pino_side_cabinet_plinth",
    sizeMm: { width, height: params.plinthHeight, depth: 42 },
    positionMm: { x: 0, y: params.plinthHeight * 0.5, z: depth * 0.5 - 70 },
    preview: plinth,
    paramKeys: ["width", "plinthHeight", "plinthMaterialId"]
  });
}

function addOpenNicheOpening(args: {
  group: THREE.Group;
  segment: PinoSideCabinetLayoutSegment;
  params: PinoSideCabinetParams;
  catalog: ClientCatalog;
  index: number;
}) {
  const shelf = makePreviewMaterial(args.params, args.catalog, "body");
  const innerWidth = Math.max(1, args.params.width - args.params.boardThickness * 2 - 14);
  const innerBackZ = -args.params.depth * 0.5 + args.params.backThickness;
  const innerFrontZ = args.params.depth * 0.5 - args.params.frontThicknessMm - 18;
  const innerDepth = Math.max(120, innerFrontZ - innerBackZ - 16);
  const z = innerBackZ + 8 + innerDepth * 0.5;
  addBox({
    parent: args.group,
    name: `pino_side_cabinet_open_niche_${args.index + 1}_top_rail`,
    sizeMm: { width: innerWidth, height: 18, depth: innerDepth },
    positionMm: { x: 0, y: args.segment.yTopMm - 9, z },
    preview: shelf,
    paramKeys: ["definitionId", "width", "depth"]
  });
  addBox({
    parent: args.group,
    name: `pino_side_cabinet_open_niche_${args.index + 1}_bottom_rail`,
    sizeMm: { width: innerWidth, height: 18, depth: innerDepth },
    positionMm: { x: 0, y: args.segment.yBottomMm + 9, z },
    preview: shelf,
    paramKeys: ["definitionId", "width", "depth"]
  });
}

function addDrawerBody(args: {
  parent: THREE.Group;
  params: PinoSideCabinetParams;
  catalog: ClientCatalog;
  name: string;
  pieceWidthMm: number;
  heightMm: number;
  kind: "drawer" | "pullout";
  anchorYMode?: "segment_center" | "placement_bottom";
  targetCenterZMm?: number;
  maxDepthMm?: number;
}) {
  const rules = getConstructionRules(args.params);
  const body = makePreviewMaterial(args.params, args.catalog, "body");
  const shelf = makePreviewMaterial(args.params, args.catalog, "shelf");
  const hardware = makePreviewMaterial(args.params, args.catalog, "hardware");
  const sideThickness = 16;
  const bottomThickness = args.kind === "drawer" ? 8 : 10;
  const outerWidth = Math.max(120, args.pieceWidthMm - 26);
  const depthCapMm = typeof args.maxDepthMm === "number" && Number.isFinite(args.maxDepthMm)
    ? Math.max(180, args.maxDepthMm)
    : Number.POSITIVE_INFINITY;
  const outerDepth = Math.max(
    180,
    Math.min(
      args.params.depth - args.params.backThickness - args.params.frontThicknessMm - 72,
      args.kind === "drawer" ? 460 : 420,
      depthCapMm
    )
  );
  const minBodyHeight = args.kind === "drawer" ? 72 : 150;
  const targetOuterHeight = args.heightMm - rules.movingBodyBottomOffsetMm - rules.movingBodyTopClearanceMm;
  const outerHeight = Math.max(minBodyHeight, Math.min(args.heightMm - 2, targetOuterHeight));
  const innerWidth = Math.max(60, outerWidth - sideThickness * 2);
  const bottomDepth = Math.max(90, outerDepth - sideThickness);
  const bodyCenterY =
    args.anchorYMode === "placement_bottom"
      ? outerHeight * 0.5 + rules.movingBodyBottomOffsetMm
      : -args.heightMm * 0.5 + outerHeight * 0.5 + rules.movingBodyBottomOffsetMm;
  const bodyCenterZ =
    typeof args.targetCenterZMm === "number" && Number.isFinite(args.targetCenterZMm)
      ? args.targetCenterZMm
      : -(outerDepth * 0.5 + args.params.frontThicknessMm * 0.5 - 12);

  addBox({
    parent: args.parent,
    name: `${args.name}_box_left`,
    sizeMm: { width: sideThickness, height: outerHeight, depth: outerDepth },
    positionMm: { x: -outerWidth * 0.5 + sideThickness * 0.5, y: bodyCenterY, z: bodyCenterZ },
    preview: body,
    paramKeys: ["runnerComponentId", "definitionId"]
  });
  addBox({
    parent: args.parent,
    name: `${args.name}_box_right`,
    sizeMm: { width: sideThickness, height: outerHeight, depth: outerDepth },
    positionMm: { x: outerWidth * 0.5 - sideThickness * 0.5, y: bodyCenterY, z: bodyCenterZ },
    preview: body,
    paramKeys: ["runnerComponentId", "definitionId"]
  });
  addBox({
    parent: args.parent,
    name: `${args.name}_box_front`,
    sizeMm: { width: innerWidth, height: outerHeight, depth: sideThickness },
    positionMm: { x: 0, y: bodyCenterY, z: bodyCenterZ + outerDepth * 0.5 - sideThickness * 0.5 },
    preview: body,
    paramKeys: ["runnerComponentId", "definitionId"]
  });
  addBox({
    parent: args.parent,
    name: `${args.name}_box_back`,
    sizeMm: { width: innerWidth, height: outerHeight, depth: sideThickness },
    positionMm: { x: 0, y: bodyCenterY, z: bodyCenterZ - outerDepth * 0.5 + sideThickness * 0.5 },
    preview: body,
    paramKeys: ["runnerComponentId", "definitionId"]
  });
  addBox({
    parent: args.parent,
    name: `${args.name}_box_bottom`,
    sizeMm: { width: innerWidth, height: bottomThickness, depth: bottomDepth },
    positionMm: { x: 0, y: bodyCenterY - outerHeight * 0.5 + bottomThickness * 0.5, z: bodyCenterZ + sideThickness * 0.25 },
    preview: shelf,
    paramKeys: ["runnerComponentId", "definitionId"]
  });

  if (args.kind === "pullout") {
    addBox({
      parent: args.parent,
      name: `${args.name}_upper_rail_left`,
      sizeMm: { width: 10, height: 14, depth: outerDepth },
      positionMm: { x: -outerWidth * 0.5 + 12, y: bodyCenterY + outerHeight * 0.5 - 10, z: bodyCenterZ },
      preview: hardware,
      paramKeys: ["runnerComponentId"]
    });
    addBox({
      parent: args.parent,
      name: `${args.name}_upper_rail_right`,
      sizeMm: { width: 10, height: 14, depth: outerDepth },
      positionMm: { x: outerWidth * 0.5 - 12, y: bodyCenterY + outerHeight * 0.5 - 10, z: bodyCenterZ },
      preview: hardware,
      paramKeys: ["runnerComponentId"]
    });
  }

  addBox({
    parent: args.parent,
    name: `${args.name}_runner_left`,
    sizeMm: { width: 8, height: Math.max(42, outerHeight - 24), depth: outerDepth },
    positionMm: { x: -outerWidth * 0.5 - 8, y: bodyCenterY, z: bodyCenterZ },
    preview: hardware,
    paramKeys: ["runnerComponentId"]
  });
  addBox({
    parent: args.parent,
    name: `${args.name}_runner_right`,
    sizeMm: { width: 8, height: Math.max(42, outerHeight - 24), depth: outerDepth },
    positionMm: { x: outerWidth * 0.5 + 8, y: bodyCenterY, z: bodyCenterZ },
    preview: hardware,
    paramKeys: ["runnerComponentId"]
  });
}

function addFrontLeaf(args: {
  group: THREE.Group;
  params: PinoSideCabinetParams;
  catalog: ClientCatalog;
  segment: PinoSideCabinetLayoutSegment;
  index: number;
  pieceIndex: number;
  pieceCount: number;
  pieceWidthMm: number;
  xCenterMm: number;
}) {
  const component = getPinoSideCabinetSystem().componentLibrary[args.segment.componentId];
  const front = makePreviewMaterial(args.params, args.catalog, "front");
  const handleSpec = resolveHandleSpec(args.params, args.catalog);
  const frontPlaneZ = args.params.depth * 0.5;
  const frontDepth = args.params.frontThicknessMm;
  const height = Math.max(1, args.segment.heightMm - args.params.frontGap);
  const name = `pino_side_cabinet_front_${args.index + 1}_${args.pieceIndex + 1}_${component?.kind ?? args.segment.componentId}`;

  if (component?.kind === "open_niche") {
    addOpenNicheOpening({ group: args.group, segment: args.segment, params: args.params, catalog: args.catalog, index: args.index });
    return;
  }

  if (component?.kind === "flap_door") {
    const pivot = new THREE.Group();
    pivot.name = `${name}_pivot`;
    pivot.position.set(toMeters(args.xCenterMm), toMeters(args.segment.yTopMm), toMeters(frontPlaneZ));
    pivot.rotation.x = args.params.opened ? -Math.PI * 0.38 : 0;
    args.group.add(pivot);
    addBox({
      parent: pivot,
      name,
      sizeMm: { width: args.pieceWidthMm, height, depth: frontDepth },
      positionMm: { x: 0, y: -height * 0.5, z: frontDepth * 0.5 },
      preview: front,
      paramKeys: ["definitionId", "catalogKey", "width", "frontThicknessMm", "frontGap", "frontMaterialId", "opened"]
    });
    addHandle({
      parent: pivot,
      name: `${name}_handle`,
      widthMm: Math.max(80, args.pieceWidthMm - 18),
      heightMm: height,
      xMm: 0,
      yMm:
        handleSpec.renderKind === "profile" || handleSpec.placementCode === "009"
          ? -Math.max(16, handleSpec.thicknessMm * 0.5 + 6) + handleSpec.offsetMm
          : handleSpec.placementCode === "006"
            ? -height * 0.5 + handleSpec.offsetMm
            : -height + Math.min(80, args.segment.heightMm * 0.28) + handleSpec.offsetMm,
      zMm: frontDepth + Math.max(8, handleSpec.projectionMm * 0.5),
      orientation: "horizontal",
      handleSpec
    });
    return;
  }

  if (component?.kind === "swing_door") {
    const hingeSide = args.pieceCount === 1 ? "right" : args.pieceIndex === 0 ? "left" : "right";
    const pivot = new THREE.Group();
    pivot.name = `${name}_pivot`;
    pivot.position.set(
      toMeters(hingeSide === "left" ? args.xCenterMm - args.pieceWidthMm * 0.5 : args.xCenterMm + args.pieceWidthMm * 0.5),
      toMeters(args.segment.yCenterMm),
      toMeters(frontPlaneZ)
    );
    pivot.rotation.y = args.params.opened ? (hingeSide === "left" ? -Math.PI * 0.38 : Math.PI * 0.38) : 0;
    args.group.add(pivot);
    addBox({
      parent: pivot,
      name,
      sizeMm: { width: args.pieceWidthMm, height, depth: frontDepth },
      positionMm: { x: hingeSide === "left" ? args.pieceWidthMm * 0.5 : -args.pieceWidthMm * 0.5, y: 0, z: frontDepth * 0.5 },
      preview: front,
      paramKeys: ["definitionId", "catalogKey", "width", "frontThicknessMm", "frontGap", "frontMaterialId", "opened"]
    });
    const handleEdgeInsetMm = Math.max(26, handleSpec.projectionMm + 12);
    const handleX =
      handleSpec.renderKind === "profile" || handleSpec.placementCode === "009" || handleSpec.placementCode === "002" || handleSpec.placementCode === "006"
        ? 0
        : hingeSide === "left"
          ? args.pieceWidthMm - handleEdgeInsetMm
          : -args.pieceWidthMm + handleEdgeInsetMm;
    addHandle({
      parent: pivot,
      name: `${name}_handle`,
      widthMm: args.pieceWidthMm,
      heightMm: height,
      xMm: handleX,
      yMm:
        handleSpec.renderKind === "profile" || handleSpec.placementCode === "009"
          ? height * 0.5 - Math.max(18, handleSpec.thicknessMm * 0.5 + 8) + handleSpec.offsetMm
          : handleSpec.placementCode === "006"
            ? handleSpec.offsetMm
            : handleSpec.placementCode === "002"
              ? height * 0.5 - Math.min(72, height * 0.22) + handleSpec.offsetMm
              : handleSpec.renderKind === "knob"
                ? handleSpec.offsetMm
                : handleSpec.offsetMm,
      zMm: frontDepth + Math.max(8, handleSpec.projectionMm * 0.5),
      orientation:
        handleSpec.renderKind === "profile" || handleSpec.placementCode === "009" || handleSpec.placementCode === "002" || handleSpec.placementCode === "006" || handleSpec.renderKind === "knob"
          ? "horizontal"
          : "vertical",
      handleSpec
    });
    return;
  }

  const pulloutOffset = args.params.opened ? Math.min(220, args.params.depth * 0.42) : 0;
  const partGroup = new THREE.Group();
  partGroup.name = `${name}_group`;
  partGroup.position.set(toMeters(args.xCenterMm), toMeters(args.segment.yCenterMm), toMeters(frontPlaneZ + frontDepth * 0.5 + pulloutOffset));
  args.group.add(partGroup);
  addBox({
    parent: partGroup,
    name,
    sizeMm: { width: args.pieceWidthMm, height, depth: frontDepth },
    positionMm: { x: 0, y: 0, z: 0 },
    preview: front,
    paramKeys: ["definitionId", "catalogKey", "width", "frontThicknessMm", "frontGap", "frontMaterialId", "opened"]
  });
  addHandle({
    parent: partGroup,
    name: `${name}_handle`,
    widthMm: args.pieceWidthMm,
    heightMm: height,
    xMm: 0,
    yMm:
      handleSpec.renderKind === "profile" || handleSpec.placementCode === "009"
        ? height * 0.5 - Math.max(18, handleSpec.thicknessMm * 0.5 + 8) + handleSpec.offsetMm
        : handleSpec.placementCode === "006"
          ? handleSpec.offsetMm
          : height * 0.5 - Math.min(46, height * 0.24) + handleSpec.offsetMm,
    zMm: frontDepth * 0.5 + Math.max(8, handleSpec.projectionMm * 0.5),
    orientation: "horizontal",
    handleSpec
  });
  if (component?.kind === "drawer" || component?.kind === "pullout") {
    addDrawerBody({
      parent: partGroup,
      params: args.params,
      catalog: args.catalog,
      name,
      pieceWidthMm: args.pieceWidthMm,
      heightMm: height,
      kind: component.kind
    });
  }
}

function addFronts(group: THREE.Group, params: PinoSideCabinetParams, catalog: ClientCatalog) {
  const layout = createPinoSideCabinetLayout(params);
  const totalFrontWidth = Math.max(1, params.width - params.sideGap * 2);

  for (const [index, segment] of layout.frontSegments.entries()) {
    const pieceCount = Math.max(1, segment.count);
    const interPieceGap = pieceCount > 1 ? params.frontGap : 0;
    const pieceWidthMm = Math.max(1, (totalFrontWidth - interPieceGap * (pieceCount - 1)) / pieceCount);
    const startX = -totalFrontWidth * 0.5 + pieceWidthMm * 0.5;
    for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
      addFrontLeaf({
        group,
        params,
        catalog,
        segment,
        index,
        pieceIndex,
        pieceCount,
        pieceWidthMm,
        xCenterMm: startX + pieceIndex * (pieceWidthMm + interPieceGap)
      });
    }
  }
}

function addAppliancePreview(group: THREE.Group, params: PinoSideCabinetParams) {
  if (params.applianceInstalled !== true) return;
  const opening = getPinoSideCabinetApplianceOpening(params);
  if (!opening || !params.applianceCategory) return;
  const applianceModuleType =
    params.applianceModuleType ?? getPinoSideCabinetApplianceModuleTypeForCategory(params.applianceCategory);

  const widthMm = clamp(Math.round(params.applianceWidthMm ?? opening.widthMm), 160, Math.max(160, opening.widthMm - 4));
  const heightMm = clamp(Math.round(params.applianceHeightMm ?? opening.heightMm), 160, Math.max(160, opening.heightMm - 4));
  const depthMm = clamp(Math.round(params.applianceDepthMm ?? opening.depthMm), 120, Math.max(120, opening.depthMm));
  const actualWidthMm = Math.min(widthMm, opening.widthMm - 4);
  const actualHeightMm = Math.min(heightMm, opening.heightMm - 4);
  const actualDepthMm = Math.min(depthMm, opening.depthMm);
  const centerZMm = opening.zBackMm + actualDepthMm * 0.5;
  const centerYMm = opening.yBottomMm + actualHeightMm * 0.5;
  const frontFaceZMm = centerZMm + actualDepthMm * 0.5;

  const applianceGroup = new THREE.Group();
  applianceGroup.name = `pino_side_cabinet_appliance_${params.applianceCategory}`;
  applianceGroup.userData.selectable = true;
  applianceGroup.userData.paramKeys = [
    "applianceInstalled",
    "applianceCategory",
    "applianceModuleType",
    "applianceWidthMm",
    "applianceHeightMm",
    "applianceDepthMm"
  ];
  applianceGroup.userData.tags = ["module", "appliance"];
  applianceGroup.userData.applianceCategory = params.applianceCategory;
  applianceGroup.userData.applianceModuleType = applianceModuleType;
  group.add(applianceGroup);

  const shell: PreviewMaterial = { colorHex: "#1b1e22", roughness: 0.26, metalness: 0.82 };
  const glass: PreviewMaterial = { colorHex: "#2b3035", roughness: 0.08, metalness: 0.12, transparent: true, opacity: 0.72 };
  const accent: PreviewMaterial = { colorHex: "#b8bcc1", roughness: 0.22, metalness: 0.88 };
  const isMicrowaveInsert =
    params.applianceCategory === "microwave_tall" || applianceModuleType === "fwm_microwave_tower_module";
  const isCompactInsert = params.applianceCategory === "compact_appliance" || applianceModuleType === "pino_compact_appliance_insert";
  const trimDepthMm = isCompactInsert ? 18 : 22;
  const bezelHeightMm = isMicrowaveInsert ? actualHeightMm * 0.82 : actualHeightMm * 0.9;
  const glassHeightMm = isMicrowaveInsert ? actualHeightMm * 0.52 : actualHeightMm * 0.62;
  const controlStripHeightMm = isCompactInsert ? 42 : 56;
  const controlStripY = isMicrowaveInsert ? centerYMm + actualHeightMm * 0.28 : centerYMm + actualHeightMm * 0.33;
  const handleY = centerYMm + (isMicrowaveInsert ? 0 : actualHeightMm * 0.12);

  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_body`,
    sizeMm: { width: actualWidthMm, height: actualHeightMm, depth: actualDepthMm },
    positionMm: { x: 0, y: centerYMm, z: centerZMm },
    preview: shell,
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType", "applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]
  });
  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_bezel`,
    sizeMm: { width: actualWidthMm, height: bezelHeightMm, depth: trimDepthMm },
    positionMm: { x: 0, y: centerYMm, z: frontFaceZMm - trimDepthMm * 0.5 + 0.5 },
    preview: shell,
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType", "applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]
  });
  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_glass`,
    sizeMm: { width: Math.max(120, actualWidthMm - 34), height: Math.max(100, glassHeightMm), depth: Math.max(8, trimDepthMm * 0.5) },
    positionMm: {
      x: 0,
      y: centerYMm - actualHeightMm * 0.08,
      z: frontFaceZMm + Math.max(4, trimDepthMm * 0.15)
    },
    preview: glass,
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType", "applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]
  });
  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_control_strip`,
    sizeMm: { width: Math.max(120, actualWidthMm - 28), height: controlStripHeightMm, depth: Math.max(8, trimDepthMm * 0.45) },
    positionMm: {
      x: 0,
      y: controlStripY,
      z: frontFaceZMm + Math.max(3, trimDepthMm * 0.1)
    },
    preview: accent,
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType", "applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]
  });
  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_handle`,
    sizeMm: {
      width: Math.max(120, Math.min(actualWidthMm - 70, actualWidthMm * 0.72)),
      height: 12,
      depth: 18
    },
    positionMm: {
      x: 0,
      y: handleY,
      z: frontFaceZMm + 12
    },
    preview: accent,
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType", "applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]
  });

  addBox({
    parent: applianceGroup,
    name: `${applianceGroup.name}_module_badge`,
    sizeMm: {
      width: Math.max(80, Math.min(actualWidthMm * 0.28, 180)),
      height: 18,
      depth: 3
    },
    positionMm: {
      x: 0,
      y: centerYMm - actualHeightMm * 0.34,
      z: frontFaceZMm + trimDepthMm * 0.5 + 2
    },
    preview: { colorHex: "#d7d9dc", roughness: 0.2, metalness: 0.72 },
    paramKeys: ["applianceInstalled", "applianceCategory", "applianceModuleType"]
  });
}

function addShelfLikePart(args: {
  group: THREE.Group;
  params: PinoSideCabinetParams;
  catalog: ClientCatalog;
  name: string;
  yMm: number;
  zMm: number;
  heightMm: number;
  depthMm: number;
}) {
  const shelf = makePreviewMaterial(args.params, args.catalog, "shelf");
  const innerWidth = Math.max(1, args.params.width - args.params.boardThickness * 2);
  addBox({
    parent: args.group,
    name: args.name,
    sizeMm: { width: innerWidth, height: args.heightMm, depth: args.depthMm },
    positionMm: { x: 0, y: args.yMm, z: args.zMm },
    preview: shelf,
    paramKeys: ["definitionId", "shelfThickness", "shelfMaterialId"]
  });
}

function addShelfSupports(args: {
  group: THREE.Group;
  params: PinoSideCabinetParams;
  catalog: ClientCatalog;
  shelfName: string;
  yMm: number;
  zMm: number;
  shelfHeightMm: number;
  shelfDepthMm: number;
}) {
  const hardware = makePreviewMaterial(args.params, args.catalog, "hardware");
  const rules = getConstructionRules(args.params);
  const innerWidth = Math.max(1, args.params.width - args.params.boardThickness * 2);
  const shelfWidthHalf = innerWidth * 0.5;
  const shelfDepthHalf = args.shelfDepthMm * 0.5;
  const xOffset = Math.max(14, shelfWidthHalf - Math.min(rules.shelfSupportInsetXMm, Math.max(16, shelfWidthHalf * 0.2)));
  const zOffset = Math.max(18, shelfDepthHalf - Math.min(rules.shelfSupportInsetZMm, Math.max(18, shelfDepthHalf * 0.2)));
  const supportCenterY = args.yMm - args.shelfHeightMm * 0.5 - rules.shelfSupportHeightMm * 0.5;
  const supportPositions = [
    { suffix: "front_left", x: -xOffset, z: args.zMm + zOffset },
    { suffix: "front_right", x: xOffset, z: args.zMm + zOffset },
    { suffix: "rear_left", x: -xOffset, z: args.zMm - zOffset },
    { suffix: "rear_right", x: xOffset, z: args.zMm - zOffset }
  ];

  for (const support of supportPositions) {
    addBox({
      parent: args.group,
      name: `${args.shelfName}_support_${support.suffix}`,
      sizeMm: {
        width: rules.shelfSupportWidthMm,
        height: rules.shelfSupportHeightMm,
        depth: rules.shelfSupportDepthMm
      },
      positionMm: {
        x: support.x,
        y: supportCenterY,
        z: support.z
      },
      preview: hardware,
      paramKeys: ["definitionId", "shelfThickness"]
    });
  }
}

function addInterior(group: THREE.Group, params: PinoSideCabinetParams, catalog: ClientCatalog) {
  const layout = createPinoSideCabinetLayout(params);
  const hardware = makePreviewMaterial(params, catalog, "hardware");

  for (const [index, component] of layout.definition.interiorComponents.entries()) {
    const placements = resolveInteriorPlacements(component, layout, params);
    if (component.componentId === "adjustable_shelf" || component.componentId === "fixed_shelf") {
      placements.forEach((placement) => {
        const shelfName = `pino_side_cabinet_${component.componentId}_${index + 1}_${placement.itemIndex + 1}`;
        addShelfLikePart({
          group,
          params,
          catalog,
          name: shelfName,
          yMm: placement.yCenterMm,
          zMm: placement.zCenterMm,
          heightMm: placement.heightMm,
          depthMm: placement.depthMm
        });
        addShelfSupports({
          group,
          params,
          catalog,
          shelfName,
          yMm: placement.yCenterMm,
          zMm: placement.zCenterMm,
          shelfHeightMm: placement.heightMm,
          shelfDepthMm: placement.depthMm
        });
      });
      continue;
    }

    if (component.componentId === "wire_shelf") {
      placements.forEach((placement) => {
        const shelfName = `pino_side_cabinet_wire_shelf_${index + 1}_${placement.itemIndex + 1}`;
        addShelfLikePart({
          group,
          params,
          catalog,
          name: shelfName,
          yMm: placement.yCenterMm,
          zMm: placement.zCenterMm,
          heightMm: placement.heightMm,
          depthMm: placement.depthMm
        });
        addShelfSupports({
          group,
          params,
          catalog,
          shelfName,
          yMm: placement.yCenterMm,
          zMm: placement.zCenterMm,
          shelfHeightMm: placement.heightMm,
          shelfDepthMm: placement.depthMm
        });
      });
      continue;
    }

    if (component.componentId === "drawer" || component.componentId === "pullout") {
      const movingKind: "drawer" | "pullout" = component.componentId === "drawer" ? "drawer" : "pullout";
      placements.forEach((placement) => {
        const interiorGroup = new THREE.Group();
        interiorGroup.name = `pino_side_cabinet_inner_${component.componentId}_${index + 1}_${placement.itemIndex + 1}`;
        interiorGroup.position.set(0, toMeters(placement.yBottomMm), 0);
        group.add(interiorGroup);
        addDrawerBody({
          parent: interiorGroup,
          params,
          catalog,
          name: `pino_side_cabinet_inner_${component.componentId}_${index + 1}_${placement.itemIndex + 1}`,
          pieceWidthMm: Math.max(160, params.width - params.boardThickness * 2 - 18),
          heightMm: placement.heightMm,
          kind: movingKind,
          anchorYMode: "placement_bottom",
          targetCenterZMm: placement.zCenterMm,
          maxDepthMm: placement.depthMm
        });
      });
      continue;
    }

    if (component.componentId === "broom_hook" || component.componentId === "cable_holder") {
      placements.forEach((placement) => {
        addBox({
          parent: group,
          name: `pino_side_cabinet_${component.componentId}_${index + 1}_${placement.itemIndex + 1}`,
          sizeMm: { width: 24, height: placement.heightMm, depth: 20 },
          positionMm: { x: 0, y: placement.yCenterMm, z: placement.zCenterMm },
          preview: hardware,
          paramKeys: ["definitionId"]
        });
      });
    }
  }
}

export function buildPinoSideCabinet(params: PinoSideCabinetParams, catalog: ClientCatalog): THREE.Group {
  const normalized = normalizePinoSideCabinetParams(params);
  const layout = createPinoSideCabinetLayout(normalized);
  const groupDef = getPinoSideCabinetProductGroup(normalized.groupId);
  const capability = getPinoSideCabinetCapability(normalized);
  const applianceOpening = getPinoSideCabinetApplianceOpening(normalized);
  const priceGroup = normalized.priceGroup;
  const selectedPrice = layout.catalogRow?.priceGroupValues?.[priceGroup] ?? null;
  const group = new THREE.Group();
  group.name = "pinoSideCabinetModule";

  addCarcass(group, normalized, catalog);
  addInterior(group, normalized, catalog);
  addFronts(group, normalized, catalog);
  addAppliancePreview(group, normalized);

  const interiorPlacements = layout.definition.interiorComponents.flatMap((component) => resolveInteriorPlacements(component, layout, normalized));
  const constructionReport = inspectPinoSideCabinetConstruction(normalized, group);
  const constructionIssues = constructionReport.issues;
  const selectedHandle = getPinoHandleByComponentId(normalized.handleComponentId ?? null);
  group.userData = {
    moduleType: "pino_side_cabinet",
    groupId: normalized.groupId,
    groupLabel: groupDef.label,
    assemblyContext: capability.assemblyContext,
    kitchenModuleRole: capability.kitchenModuleRole,
    requiresWorktop: capability.requiresWorktop,
    placementZone: capability.placementZone,
    allowedPlacementContexts: capability.allowedPlacementContexts,
    requiresApplianceNiche: capability.requiresApplianceNiche,
    definitionId: normalized.definitionId,
    articleCode: normalized.articleCode,
    catalogKey: normalized.catalogKey,
    priceGroup,
    selectedPrice,
    opened: normalized.opened,
    handleComponentId: normalized.handleComponentId ?? null,
    handlePlacementCode: normalized.handlePlacementCode ?? null,
    handleOffsetMm: normalized.handleOffsetMm ?? 0,
    selectedHandle,
    productTemplateName: layout.definition.productTemplateName,
    articleFamily: layout.definition.articleFamily,
    variantCode: layout.definition.variantCode,
    sourcePage: layout.definition.sourcePage,
    sourceImagePath: layout.definition.sourceImagePath,
    sourceNotes: layout.definition.sourceNotes,
    catalogRow: layout.catalogRow,
    interiorPlacements,
    constructionIssues,
    constructionMetrics: constructionReport.metrics,
    taggedPartCount: constructionReport.taggedPartCount,
    isConstructionValid: constructionIssues.every((issue) => issue.severity !== "error"),
    placementRules: groupDef.placementRules,
    compatibilityRules: groupDef.compatibilityRules,
    capability,
    applianceOpening,
    applianceCategory: normalized.applianceCategory ?? null,
    applianceModuleType: normalized.applianceModuleType ?? null,
    applianceInstalled: normalized.applianceInstalled === true,
    dimensionsMm: {
      width: normalized.width,
      height: normalized.height,
      depth: normalized.depth
    }
  };

  return group;
}
