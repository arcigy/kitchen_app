import * as THREE from "three";
import type { ClientCatalog } from "../../catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../../catalog/material-render-request";
import type { FurnQuoteModulePackage, ModuleGeometryPrimitive, ModuleParameterPresetRatioParameter } from "../module-package-types";
import { getModuleDescriptors } from "../../../modules/registry";
import { FWM_FURNITURE_SPECS, getFwmRuntimeBuilderKey } from "../../../modules/fwmFurniture/definitions";
import { createModuleRuntimeCatalogContext } from "../../../modules/runtime/runtimeCatalog";
import type { TrustedModuleRuntimeBuilder } from "./module-runtime-contract";

const MM_TO_M = 0.001;
const REVIT_PREVIEW_TAG = "revit-export-preview";

const BUILDER_KEYS: Record<string, string> = {
  "cornerShelfLower.v1": "corner_shelf_lower",
  "drawerLow.v1": "drawer_low",
  "flapShelvesLow.v1": "flap_shelves_low",
  "fridgeTall.v1": "fridge_tall",
  "pinoSideCabinet.v1": "pino_side_cabinet",
  "swingShelvesLow.v1": "swing_shelves_low",
  ...Object.fromEntries(FWM_FURNITURE_SPECS.map((spec) => [getFwmRuntimeBuilderKey(spec.moduleType), spec.moduleType]))
};

export function getTrustedRuntimeBuilderKeys(): string[] {
  return Object.keys(BUILDER_KEYS).sort();
}

export function hasTrustedRuntimeBuilder(runtimeBuilderKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDER_KEYS, runtimeBuilderKey);
}

export function resolveTrustedRuntimeBuilder(runtimeBuilderKey: string): TrustedModuleRuntimeBuilder | null {
  const moduleType = BUILDER_KEYS[runtimeBuilderKey];
  if (!moduleType) return null;
  const descriptor = getModuleDescriptors().find((entry) => entry.type === moduleType);
  if (!descriptor) return null;
  return {
    key: runtimeBuilderKey,
    moduleType,
    label: descriptor.label,
    build: (params: Record<string, unknown>, catalog: ClientCatalog): THREE.Group =>
      descriptor.build({ ...descriptor.defaultParams(), ...params } as Parameters<typeof descriptor.build>[0], catalog)
  };
}

export function buildModulePackageGeometry(args: {
  runtimeBuilderKey: string;
  parameters: Record<string, unknown>;
  catalog: ClientCatalog;
}): THREE.Group {
  const builder = resolveTrustedRuntimeBuilder(args.runtimeBuilderKey);
  if (!builder) throw new Error(`Unknown trusted runtime builder: ${args.runtimeBuilderKey}`);
  const group = builder.build(args.parameters, args.catalog);
  group.userData.modulePackageBuildParameters = group.userData.modulePackageBuildParameters ?? { ...args.parameters };
  group.userData.runtimeBuilderKey = args.runtimeBuilderKey;
  return group;
}

export function createDefaultModulePackageParameters(modulePackage: FurnQuoteModulePackage): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const parameter of modulePackage.parameters.parameters) {
    if ("defaultValue" in parameter) parameters[parameter.key] = parameter.defaultValue;
  }
  parameters.modulePackageId = modulePackage.module.modulePackageId;
  parameters.moduleType = modulePackage.module.moduleType;
  parameters.packageVersion = modulePackage.module.version;
  if (modulePackage.integrity.packageHash) parameters.packageHash = modulePackage.integrity.packageHash;
  return parameters;
}

function readPresetNumber(params: Record<string, unknown>, key: string, fallback: number): number {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function roundPresetNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function computeDrawerPresetRatioValues(params: Record<string, unknown>, ratio: ModuleParameterPresetRatioParameter): number[] {
  const count = Math.max(0, Math.round(readPresetNumber(params, ratio.countParameter, ratio.ratios.length)));
  if (count <= 0) return [];
  const selectedRatios = ratio.order === "top-down"
    ? ratio.ratios.slice(0, count).reverse()
    : ratio.ratios.slice(0, count);
  const normalizedRatios = selectedRatios.length === count && selectedRatios.every((value) => Number.isFinite(value) && value > 0)
    ? selectedRatios
    : Array.from({ length: count }, () => 1);
  if (ratio.parameterKey !== "drawerFrontHeightsMm") return normalizedRatios.map(roundPresetNumber);

  const height = readPresetNumber(params, "height", readPresetNumber(params, "heightMm", 720));
  const plinth = readPresetNumber(params, "plinthHeight", 0);
  const gap = readPresetNumber(params, "frontGap", 2);
  const frontAreaHeight = Math.max(80, height - plinth - gap * 2);
  const availableHeight = Math.max(40, frontAreaHeight - gap * (count - 1));
  const ratioSum = normalizedRatios.reduce((sum, value) => sum + value, 0);
  return normalizedRatios.map((value) => roundPresetNumber((value / ratioSum) * availableHeight));
}

export function applyModuleParameterPreset(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: Record<string, unknown>;
  presetId: string;
}): Record<string, unknown> {
  const preset = args.modulePackage.parameterPresets?.presets.find((candidate) => candidate.presetId === args.presetId);
  if (!preset) return { ...args.parameters };
  const freeKeys = new Set(args.modulePackage.parameterPresets?.freeParameterKeys ?? []);
  const next: Record<string, unknown> = { ...args.parameters };
  for (const [key, value] of Object.entries(preset.parameterValues)) {
    if (freeKeys.has(key)) continue;
    next[key] = value;
  }
  for (const ratio of preset.ratioParameters ?? []) {
    if (freeKeys.has(ratio.parameterKey)) continue;
    const values = computeDrawerPresetRatioValues(next, ratio);
    next[ratio.parameterKey] = values.map((value) => String(value)).join(",");
    if (ratio.indexedParameterPrefix && ratio.indexedParameterSuffix) {
      for (let index = 0; index < values.length; index += 1) {
        const key = `${ratio.indexedParameterPrefix}${index + 1}${ratio.indexedParameterSuffix}`;
        if (!freeKeys.has(key)) next[key] = values[index];
      }
      for (let index = values.length; index < 12; index += 1) {
        const key = `${ratio.indexedParameterPrefix}${index + 1}${ratio.indexedParameterSuffix}`;
        if (Object.prototype.hasOwnProperty.call(next, key) && !freeKeys.has(key)) next[key] = 0;
      }
    }
  }
  return next;
}

export function createModulePackageDefaultParams(args: {
  modulePackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
}): Record<string, unknown> {
  return {
    ...createDefaultModulePackageParameters(args.modulePackage),
    materialAssignments: resolveModulePackageMaterialAssignments(args),
    componentAssignments: resolveModulePackageComponentAssignments(args),
    type: args.modulePackage.module.moduleType
  };
}

function mapPackageParameterValue(toKey: string, value: unknown, params: Record<string, unknown>): unknown {
  if (toKey === "shelfGaps" && typeof value === "number" && Number.isFinite(value)) {
    const shelfCount = typeof params.shelfCount === "number" && Number.isFinite(params.shelfCount)
      ? Math.max(1, Math.round(params.shelfCount))
      : 4;
    return Array.from({ length: shelfCount }, () => value);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canonicalMaterialGroup(value: unknown): string {
  const group = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (group === "body" || group === "carcass" || group === "shelf") return "corpus";
  return group;
}

function resolveAssignedMaterialId(assignments: Record<string, unknown>, slot: string, rawSlot: string): string | undefined {
  const candidates = slot === "corpus"
    ? [slot, rawSlot, "carcass", "body", "shelf"]
    : [slot, rawSlot];
  for (const key of candidates) {
    const value = assignments[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function fallbackKindForMaterialSlot(slot: string): "carcass" | "front" | "backPanel" | "drawer" | "plinth" | "worktop" {
  if (slot === "front") return "front";
  if (slot === "back") return "backPanel";
  if (slot === "drawer_bottom") return "drawer";
  if (slot === "plinth") return "plinth";
  if (slot === "worktop") return "worktop";
  return "carcass";
}

function inferCatalogVisualColor(
  resolved: { id: string; displayName: string; colorHex: string },
  catalogMaterial: { color?: string; decor?: string; name?: string } | undefined,
  fallbackColorHex: string
): string {
  const preview = /^#[0-9a-f]{6}$/i.test(resolved.colorHex) ? resolved.colorHex.toLowerCase() : "";
  if (preview && preview !== "#a8835a" && !resolved.id.startsWith("mat.demos.")) return preview;
  const tokens = `${resolved.id} ${resolved.displayName} ${catalogMaterial?.color ?? ""} ${catalogMaterial?.decor ?? ""} ${catalogMaterial?.name ?? ""}`.toLowerCase();
  if (/biela|biely|white|alpsk|w980|w1000|w1100|w5001|101 sm/.test(tokens)) return "#eeeae0";
  if (/black|cierna|antracit|anthracite|basalt|charcoal/.test(tokens)) return "#2f3235";
  if (/grey|gray|seda|strieb|silver|stone|concrete/.test(tokens)) return "#8b8d88";
  if (/oak|dub|beech|buk|maple|javor|wood|drevo/.test(tokens)) return "#b9854f";
  return preview || fallbackColorHex;
}

function readNumber(value: unknown, params: Record<string, unknown>, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const paramValue = params[value];
    if (typeof paramValue === "number" && Number.isFinite(paramValue)) return paramValue;
  }
  return fallback;
}

function readVectorMm(value: unknown): THREE.Vector3 | null {
  if (!isRecord(value)) return null;
  const x = value.x;
  const y = value.y;
  const z = value.z;
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof z !== "number" || !Number.isFinite(z)
  ) {
    return null;
  }
  return new THREE.Vector3(x, y, z);
}

type AxisAnchor = {
  source: number;
  target: number;
};

type RevitDeclarativeParametricContext = {
  xAnchors: AxisAnchor[];
  yAnchors: AxisAnchor[];
  zAnchors: AxisAnchor[];
  sourceParameters: Record<string, number>;
  targetParameters: Record<string, number>;
};

function readPackageDefaultNumber(modulePackage: FurnQuoteModulePackage, key: string, fallback: number): number {
  const normalizedKey = key.toLowerCase().replace(/[\s_]/g, "");
  const parameter = modulePackage.parameters.parameters.find((candidate) =>
    candidate.key.toLowerCase().replace(/[\s_]/g, "") === normalizedKey
  );
  return typeof parameter?.defaultValue === "number" && Number.isFinite(parameter.defaultValue)
    ? parameter.defaultValue
    : fallback;
}

function readParamNumberWithAliases(
  params: Record<string, unknown>,
  modulePackage: FurnQuoteModulePackage,
  keys: string[],
  fallback: number
): number {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  for (const key of keys) {
    const value = readPackageDefaultNumber(modulePackage, key, NaN);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function hasChangedNumberParam(params: Record<string, unknown>, key: string, defaultValue: number): boolean {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value - defaultValue) > 0.001;
}

function readPrimitiveVerticesMm(primitive: ModuleGeometryPrimitive): THREE.Vector3[] {
  const vertices = Array.isArray(primitive.params.verticesMm) ? primitive.params.verticesMm : [];
  return vertices.flatMap((vertex) => {
    const vector = readVectorMm(vertex);
    return vector ? [vector] : [];
  });
}

function calculatePrimitiveBoundsMm(primitives: ModuleGeometryPrimitive[]) {
  const box = new THREE.Box3();
  let hasPoint = false;
  for (const primitive of primitives) {
    for (const vertex of readPrimitiveVerticesMm(primitive)) {
      box.expandByPoint(vertex);
      hasPoint = true;
    }
  }
  return hasPoint ? box : null;
}

function hasTag(modulePackage: FurnQuoteModulePackage, tag: string): boolean {
  return (modulePackage.module.tags ?? []).some((candidate) => candidate.toLowerCase() === tag);
}

function scaledThickness(sourceThickness: number, sourceBoardThickness: number, targetBoardThickness: number): number {
  if (sourceThickness <= 0) return sourceThickness;
  if (sourceBoardThickness <= 0) return sourceThickness;
  return sourceThickness * (targetBoardThickness / sourceBoardThickness);
}

function addAxisAnchor(anchors: AxisAnchor[], source: number, target: number) {
  if (!Number.isFinite(source) || !Number.isFinite(target)) return;
  anchors.push({ source, target });
}

function normalizeAxisAnchors(anchors: AxisAnchor[]): AxisAnchor[] {
  const sorted = [...anchors].sort((a, b) => a.source - b.source);
  const normalized: AxisAnchor[] = [];
  for (const anchor of sorted) {
    const previous = normalized[normalized.length - 1];
    if (previous && Math.abs(previous.source - anchor.source) < 0.001) {
      previous.target = anchor.target;
    } else {
      normalized.push({ ...anchor });
    }
  }
  return normalized;
}

function mapByAnchors(value: number, anchors: AxisAnchor[]): number {
  if (anchors.length < 2) return value;
  if (value <= anchors[0]!.source) {
    const a = anchors[0]!;
    const b = anchors[1]!;
    const sourceSpan = b.source - a.source;
    if (Math.abs(sourceSpan) < 0.001) return a.target;
    return a.target + ((value - a.source) / sourceSpan) * (b.target - a.target);
  }
  for (let index = 1; index < anchors.length; index += 1) {
    const a = anchors[index - 1]!;
    const b = anchors[index]!;
    if (value <= b.source) {
      const sourceSpan = b.source - a.source;
      if (Math.abs(sourceSpan) < 0.001) return b.target;
      return a.target + ((value - a.source) / sourceSpan) * (b.target - a.target);
    }
  }
  const a = anchors[anchors.length - 2]!;
  const b = anchors[anchors.length - 1]!;
  const sourceSpan = b.source - a.source;
  if (Math.abs(sourceSpan) < 0.001) return b.target;
  return a.target + ((value - a.source) / sourceSpan) * (b.target - a.target);
}

function createRevitDeclarativeParametricContext(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: Record<string, unknown>;
}): RevitDeclarativeParametricContext | null {
  if (args.modulePackage.geometry.mode !== "declarative") return null;
  if (!hasTag(args.modulePackage, REVIT_PREVIEW_TAG)) return null;
  const bounds = calculatePrimitiveBoundsMm(args.modulePackage.geometry.primitives);
  if (!bounds) return null;

  const sourceLengthX = readPackageDefaultNumber(args.modulePackage, "lengthz", bounds.max.x - bounds.min.x);
  const sourceLengthZ = readPackageDefaultNumber(args.modulePackage, "lengthx", bounds.max.z - bounds.min.z);
  const sourceDepth = readPackageDefaultNumber(args.modulePackage, "depth", 560);
  const sourcePlinth = readPackageDefaultNumber(args.modulePackage, "plinth_height", 150);
  const sourceCorpus = readPackageDefaultNumber(args.modulePackage, "corpus_height", bounds.max.y - sourcePlinth);
  const sourceBoard = readPackageDefaultNumber(args.modulePackage, "hrubka_dosky", 20);
  const sourceShelf = readPackageDefaultNumber(args.modulePackage, "vyska_policky", 250);
  const sourceHeight = readPackageDefaultNumber(args.modulePackage, "height", sourceCorpus);
  const sourceTop = sourcePlinth + sourceCorpus;

  const targetLengthX = readParamNumberWithAliases(args.parameters, args.modulePackage, ["lengthz", "lengthZ"], sourceLengthX);
  const targetLengthZ = readParamNumberWithAliases(args.parameters, args.modulePackage, ["lengthx", "lengthX"], sourceLengthZ);
  const targetDepth = Math.max(
    1,
    Math.min(
      readParamNumberWithAliases(args.parameters, args.modulePackage, ["depth"], sourceDepth),
      Math.max(targetLengthX, targetLengthZ)
    )
  );
  const targetPlinth = readParamNumberWithAliases(args.parameters, args.modulePackage, ["plinth_height", "plinthHeight"], sourcePlinth);
  const explicitCorpus = readParamNumberWithAliases(args.parameters, args.modulePackage, ["corpus_height", "heightCarcass"], sourceCorpus);
  const explicitHeight = readParamNumberWithAliases(args.parameters, args.modulePackage, ["height"], sourceHeight);
  const targetCorpus = hasChangedNumberParam(args.parameters, "corpus_height", sourceCorpus) ||
    hasChangedNumberParam(args.parameters, "heightCarcass", sourceCorpus)
      ? explicitCorpus
      : hasChangedNumberParam(args.parameters, "height", sourceHeight)
        ? explicitHeight
        : sourceCorpus;
  const targetBoard = readParamNumberWithAliases(args.parameters, args.modulePackage, ["hrubka_dosky", "boardThickness"], sourceBoard);
  const targetShelf = readParamNumberWithAliases(args.parameters, args.modulePackage, ["vyska_policky"], sourceShelf);
  const targetTop = targetPlinth + targetCorpus;

  const edgeThicknessX = 18;
  const edgeThicknessZ = 18;
  const innerThicknessX = 19;
  const innerThicknessZ = 19;
  const topThickness = 18;
  const plinthInset = 60;

  const targetEdgeThicknessX = scaledThickness(edgeThicknessX, sourceBoard, targetBoard);
  const targetEdgeThicknessZ = scaledThickness(edgeThicknessZ, sourceBoard, targetBoard);
  const targetInnerThicknessX = scaledThickness(innerThicknessX, sourceBoard, targetBoard);
  const targetInnerThicknessZ = scaledThickness(innerThicknessZ, sourceBoard, targetBoard);
  const targetBoardY = scaledThickness(sourceBoard, sourceBoard, targetBoard);
  const targetTopThickness = scaledThickness(topThickness, sourceBoard, targetBoard);

  const xAnchors: AxisAnchor[] = [];
  addAxisAnchor(xAnchors, bounds.min.x, 0);
  addAxisAnchor(xAnchors, bounds.min.x + edgeThicknessX, targetEdgeThicknessX);
  addAxisAnchor(xAnchors, sourceDepth - innerThicknessX, targetDepth - targetInnerThicknessX);
  addAxisAnchor(xAnchors, sourceDepth, targetDepth);
  addAxisAnchor(xAnchors, sourceLengthX - plinthInset, targetLengthX - plinthInset);
  addAxisAnchor(xAnchors, sourceLengthX, targetLengthX);

  const zAnchors: AxisAnchor[] = [];
  addAxisAnchor(zAnchors, bounds.min.z, 0);
  addAxisAnchor(zAnchors, bounds.min.z + edgeThicknessZ, targetEdgeThicknessZ);
  addAxisAnchor(zAnchors, sourceDepth - innerThicknessZ, targetDepth - targetInnerThicknessZ);
  addAxisAnchor(zAnchors, sourceDepth, targetDepth);
  addAxisAnchor(zAnchors, sourceLengthZ, targetLengthZ);

  const yAnchors: AxisAnchor[] = [];
  addAxisAnchor(yAnchors, bounds.min.y, 0);
  addAxisAnchor(yAnchors, sourcePlinth, targetPlinth);
  addAxisAnchor(yAnchors, sourcePlinth + sourceBoard, targetPlinth + targetBoardY);
  addAxisAnchor(yAnchors, sourcePlinth + sourceShelf, targetPlinth + targetShelf);
  addAxisAnchor(yAnchors, sourcePlinth + sourceShelf + sourceBoard, targetPlinth + targetShelf + targetBoardY);
  addAxisAnchor(yAnchors, sourceTop - topThickness, targetTop - targetTopThickness);
  addAxisAnchor(yAnchors, sourceTop, targetTop);

  return {
    xAnchors: normalizeAxisAnchors(xAnchors),
    yAnchors: normalizeAxisAnchors(yAnchors),
    zAnchors: normalizeAxisAnchors(zAnchors),
    sourceParameters: {
      lengthx: sourceLengthZ,
      lengthz: sourceLengthX,
      depth: sourceDepth,
      plinth_height: sourcePlinth,
      corpus_height: sourceCorpus,
      hrubka_dosky: sourceBoard,
      vyska_policky: sourceShelf
    },
    targetParameters: {
      lengthx: targetLengthZ,
      lengthz: targetLengthX,
      depth: targetDepth,
      plinth_height: targetPlinth,
      corpus_height: targetCorpus,
      hrubka_dosky: targetBoard,
      vyska_policky: targetShelf
    }
  };
}

function transformRevitDeclarativeVertexMm(vector: THREE.Vector3, context: RevitDeclarativeParametricContext | null): THREE.Vector3 {
  if (!context) return vector;
  return new THREE.Vector3(
    mapByAnchors(vector.x, context.xAnchors),
    mapByAnchors(vector.y, context.yAnchors),
    mapByAnchors(vector.z, context.zAnchors)
  );
}

function readMaterial(args: {
  primitive: ModuleGeometryPrimitive;
  params: Record<string, unknown>;
  catalog: ClientCatalog;
}) {
  const catalogContext = createModuleRuntimeCatalogContext(args.catalog);
  const assignments = isRecord(args.params.materialAssignments) ? args.params.materialAssignments : {};
  const rawMaterialSlotId = typeof args.primitive.params.materialSlotId === "string"
    ? args.primitive.params.materialSlotId
    : "carcass";
  const materialSlotId = canonicalMaterialGroup(rawMaterialSlotId) || "corpus";
  const materialId = resolveAssignedMaterialId(assignments, materialSlotId, rawMaterialSlotId);
  const fallback = fallbackKindForMaterialSlot(materialSlotId);
  const resolved = catalogContext.resolveRenderMaterial(materialId, fallback);
  const primitiveColorHex = readColorHex(args.primitive.params.materialColorHex) ?? fallbackColorForMaterialGroup(materialSlotId);
  const materialName = readPrimitiveString(args.primitive.params.materialName) ?? resolved.displayName;
  const catalogMaterial = catalogContext.resolveMaterial(materialId, fallback);
  const renderColorHex = materialSlotId === "corpus"
    ? inferCatalogVisualColor(resolved, catalogMaterial, primitiveColorHex)
    : primitiveColorHex ?? inferCatalogVisualColor(resolved, catalogMaterial, primitiveColorHex);
  const material = new THREE.MeshStandardMaterial({
    color: Number.parseInt((renderColorHex ?? "#b8bcc7").slice(1), 16),
    roughness: resolved.roughness,
    metalness: resolved.metalness,
    side: THREE.DoubleSide
  });
  material.userData.catalogMaterialId = resolved.id;
  material.userData.catalogMaterialName = materialName;
  material.userData.materialSlotId = materialSlotId;
  material.userData.materialGroup = canonicalMaterialGroup(readPrimitiveString(args.primitive.params.materialGroup) ?? materialSlotId) || materialSlotId;
  material.userData.materialName = materialName;
  material.userData.materialColorHex = renderColorHex;
  material.userData.renderColorHex = renderColorHex;
  material.userData.revitMaterialElementId = readPrimitiveString(args.primitive.params.revitMaterialElementId);
  material.userData.materialSource = readPrimitiveString(args.primitive.params.materialSource);
  if (catalogMaterial) material.userData.materialRequest = createMaterialRequestFromCatalogMaterial(catalogMaterial);
  return material;
}

function tagDeclarativeMesh(mesh: THREE.Mesh, primitive: ModuleGeometryPrimitive, dimensionsMm?: Record<string, number>) {
  const boardName = readPrimitiveString(primitive.params.boardName);
  mesh.name = primitive.id;
  mesh.userData.selectable = true;
  mesh.userData.tags = ["module", "revit", primitive.primitiveType];
  mesh.userData.primitiveId = primitive.id;
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName ?? primitive.id;
  mesh.userData.materialGroup = canonicalMaterialGroup(readPrimitiveString(primitive.params.materialGroup));
  mesh.userData.materialSlotId = canonicalMaterialGroup(readPrimitiveString(primitive.params.materialSlotId));
  mesh.userData.materialId = readPrimitiveString(primitive.params.materialId);
  mesh.userData.materialName = readPrimitiveString(primitive.params.materialName);
  mesh.userData.materialColorHex = readColorHex(primitive.params.materialColorHex) ?? fallbackColorForMaterialGroup(mesh.userData.materialGroup);
  mesh.userData.renderColorHex = mesh.userData.materialColorHex;
  mesh.userData.materialParameterName = readPrimitiveString(primitive.params.materialParameterName);
  mesh.userData.materialParameterValue = readPrimitiveString(primitive.params.materialParameterValue);
  mesh.userData.revitMaterialElementId = readPrimitiveString(primitive.params.revitMaterialElementId);
  mesh.userData.materialSource = readPrimitiveString(primitive.params.materialSource);
  mesh.userData.sourceElementId = primitive.params.sourceElementId;
  mesh.userData.sourceUniqueId = readPrimitiveString(primitive.params.sourceUniqueId);
  mesh.userData.sourceName = readPrimitiveString(primitive.params.sourceName);
  mesh.userData.sourceClass = readPrimitiveString(primitive.params.sourceClass);
  mesh.userData.revitCategory = readPrimitiveString(primitive.params.revitCategory);
  if (isRecord(primitive.params.revitProperties)) mesh.userData.revitProperties = primitive.params.revitProperties;
  if (dimensionsMm) mesh.userData.dimensionsMm = dimensionsMm;
  if (Array.isArray(primitive.params.paramKeys)) mesh.userData.paramKeys = primitive.params.paramKeys;
}

function copyDeclarativeMaterialMetadata(mesh: THREE.Mesh) {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material) return;
  const data = material.userData as Record<string, unknown>;
  if (typeof data.catalogMaterialId === "string") mesh.userData.catalogMaterialId = data.catalogMaterialId;
  if (typeof data.catalogMaterialName === "string") mesh.userData.catalogMaterialName = data.catalogMaterialName;
  if (typeof data.materialGroup === "string") mesh.userData.materialGroup = data.materialGroup;
  if (typeof data.materialSlotId === "string") mesh.userData.materialSlotId = data.materialSlotId;
  if (typeof data.materialColorHex === "string") mesh.userData.materialColorHex = data.materialColorHex;
  if (typeof data.renderColorHex === "string") mesh.userData.renderColorHex = data.renderColorHex;
}

function readPrimitiveString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readColorHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function fallbackColorForMaterialGroup(group: unknown): string {
  const value = canonicalMaterialGroup(group);
  if (value.includes("front")) return "#d7d2c7";
  if (value.includes("worktop")) return "#9b846a";
  if (value.includes("plinth")) return "#4f4f4f";
  if (value.includes("back")) return "#c8ccd1";
  if (value.includes("hardware")) return "#464646";
  return "#eeeae0";
}

function buildDeclarativeBox(args: {
  primitive: ModuleGeometryPrimitive;
  params: Record<string, unknown>;
  catalog: ClientCatalog;
}) {
  const primitiveParams = args.primitive.params;
  const minMm = readVectorMm(primitiveParams.minMm);
  const maxMm = readVectorMm(primitiveParams.maxMm);
  const widthMm = minMm && maxMm
    ? Math.abs(maxMm.x - minMm.x)
    : readNumber(primitiveParams.width ?? primitiveParams.widthParam, args.params, 800);
  const heightMm = minMm && maxMm
    ? Math.abs(maxMm.y - minMm.y)
    : readNumber(primitiveParams.height ?? primitiveParams.heightParam, args.params, 720);
  const depthMm = minMm && maxMm
    ? Math.abs(maxMm.z - minMm.z)
    : readNumber(primitiveParams.depth ?? primitiveParams.depthParam, args.params, 560);
  const centerMm = minMm && maxMm
    ? new THREE.Vector3((minMm.x + maxMm.x) / 2, (minMm.y + maxMm.y) / 2, (minMm.z + maxMm.z) / 2)
    : readVectorMm(primitiveParams.centerMm) ?? readVectorMm(primitiveParams.positionMm) ?? new THREE.Vector3(0, heightMm / 2, 0);

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(1, widthMm) * MM_TO_M, Math.max(1, heightMm) * MM_TO_M, Math.max(1, depthMm) * MM_TO_M),
    readMaterial(args)
  );
  mesh.position.set(centerMm.x * MM_TO_M, centerMm.y * MM_TO_M, centerMm.z * MM_TO_M);
  tagDeclarativeMesh(mesh, args.primitive, { width: widthMm, height: heightMm, depth: depthMm });
  copyDeclarativeMaterialMetadata(mesh);
  return mesh;
}

function buildDeclarativeMesh(args: {
  primitive: ModuleGeometryPrimitive;
  params: Record<string, unknown>;
  catalog: ClientCatalog;
  revitParametricContext?: RevitDeclarativeParametricContext | null;
}) {
  const vertices = Array.isArray(args.primitive.params.verticesMm) ? args.primitive.params.verticesMm : [];
  const indices = Array.isArray(args.primitive.params.indices) ? args.primitive.params.indices : [];
  const positions: number[] = [];
  for (const vertex of vertices) {
    const vector = readVectorMm(vertex);
    if (!vector) continue;
    const transformed = transformRevitDeclarativeVertexMm(vector, args.revitParametricContext ?? null);
    positions.push(transformed.x * MM_TO_M, transformed.y * MM_TO_M, transformed.z * MM_TO_M);
  }
  const indexValues = indices.filter((value): value is number => Number.isInteger(value) && value >= 0);
  if (positions.length < 9 || indexValues.length < 3) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indexValues);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const mesh = new THREE.Mesh(geometry, readMaterial(args));
  const box = geometry.boundingBox;
  const dimensionsMm = box
    ? {
        width: (box.max.x - box.min.x) / MM_TO_M,
        height: (box.max.y - box.min.y) / MM_TO_M,
        depth: (box.max.z - box.min.z) / MM_TO_M
      }
    : undefined;
  tagDeclarativeMesh(mesh, args.primitive, dimensionsMm);
  copyDeclarativeMaterialMetadata(mesh);
  if (args.revitParametricContext) {
    mesh.userData.revitParametricRuntime = true;
    mesh.userData.revitParametricTargetParameters = args.revitParametricContext.targetParameters;
  }
  return mesh;
}

function buildDeclarativePackageGeometry(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters: Record<string, unknown>;
  catalog: ClientCatalog;
}): THREE.Group {
  const group = new THREE.Group();
  group.name = args.modulePackage.module.modulePackageId;
  const geometry = args.modulePackage.geometry;
  if (geometry.mode !== "declarative") return group;
  const revitParametricContext = createRevitDeclarativeParametricContext({
    modulePackage: args.modulePackage,
    parameters: args.parameters
  });
  for (const primitive of geometry.primitives) {
    const mesh = primitive.primitiveType === "mesh"
      ? buildDeclarativeMesh({ primitive, params: args.parameters, catalog: args.catalog, revitParametricContext })
      : primitive.primitiveType === "box"
        ? buildDeclarativeBox({ primitive, params: args.parameters, catalog: args.catalog })
        : null;
    if (mesh) group.add(mesh);
  }
  group.userData.modulePackageBuildParameters = { ...args.parameters };
  group.userData.modulePackageId = args.modulePackage.module.modulePackageId;
  group.userData.geometryMode = "declarative";
  if (revitParametricContext) {
    group.userData.revitParametricRuntime = true;
    group.userData.revitParametricSourceParameters = revitParametricContext.sourceParameters;
    group.userData.revitParametricTargetParameters = revitParametricContext.targetParameters;
  }
  return group;
}

export function buildModulePackageGeometryFromPackage(args: {
  modulePackage: FurnQuoteModulePackage;
  parameters?: Record<string, unknown>;
  catalog: ClientCatalog;
}): THREE.Group {
  const defaults = createDefaultModulePackageParameters(args.modulePackage);
  const mapped: Record<string, unknown> = { ...defaults, ...(args.parameters ?? {}) };
  if (args.modulePackage.geometry.mode === "declarative") {
    return buildDeclarativePackageGeometry({
      modulePackage: args.modulePackage,
      parameters: mapped,
      catalog: args.catalog
    });
  }
  for (const [fromKey, toKey] of Object.entries(args.modulePackage.geometry.parameterMapping ?? {})) {
    if (fromKey in mapped) mapped[toKey] = mapPackageParameterValue(toKey, mapped[fromKey], mapped);
  }
  return buildModulePackageGeometry({
    runtimeBuilderKey: args.modulePackage.geometry.runtimeBuilderKey,
    parameters: mapped,
    catalog: args.catalog
  });
}

export function resolveModulePackageMaterialAssignments(args: {
  modulePackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
  explicitAssignments?: Record<string, string>;
}): Record<string, string> {
  const defaults = args.catalog.kitchenDefaults;
  const resolved: Record<string, string> = {};
  for (const slot of args.modulePackage.materials.slots) {
    const explicit = args.explicitAssignments?.[slot.slotId];
    const value = explicit ??
      (slot.defaultFrom === "catalog.kitchenDefaults.carcassMaterialId" ? defaults.carcassMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.frontMaterialId" ? defaults.frontMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.worktopMaterialId" ? defaults.worktopMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.plinthMaterialId" ? defaults.plinthMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.backPanelMaterialId" ? defaults.backPanelMaterialId :
        slot.defaultFrom === "catalog.kitchenDefaults.drawerBottomMaterialId" ? defaults.drawerBottomMaterialId :
        undefined);
    if (value && args.catalog.materials.some((material) => material.id === value)) {
      const canonicalSlot = canonicalMaterialGroup(slot.slotId) || slot.slotId;
      resolved[canonicalSlot] = value;
      if (canonicalSlot === "corpus") resolved.carcass = value;
    }
  }
  return resolved;
}

export function resolveModulePackageComponentAssignments(args: {
  modulePackage: FurnQuoteModulePackage;
  catalog: ClientCatalog;
  explicitAssignments?: Record<string, string>;
}): Record<string, string> {
  const defaults = args.catalog.kitchenDefaults;
  const resolved: Record<string, string> = {};
  for (const slot of args.modulePackage.components.slots) {
    const explicit = args.explicitAssignments?.[slot.slotId];
    const value = explicit ??
      (slot.defaultFrom === "catalog.kitchenDefaults.defaultHandleComponentId" ? defaults.defaultHandleComponentId :
        slot.defaultFrom === "catalog.kitchenDefaults.defaultHingeComponentId" ? defaults.defaultHingeComponentId :
        slot.defaultFrom === "catalog.kitchenDefaults.defaultDrawerSystemComponentId" ? defaults.defaultDrawerSystemComponentId :
        undefined);
    if (value && args.catalog.components.some((component) => component.id === value)) resolved[slot.slotId] = value;
  }
  return resolved;
}
