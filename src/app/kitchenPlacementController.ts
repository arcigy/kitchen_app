import * as THREE from "three";
import { createPlanSnapper, type PlanSnapBinding, type PlanSnapResult } from "./planSnap";
import { buildMeasureGuides, type AssociativeMeasureContext } from "./measureAssociative";
import { pointInPolygonXZ } from "./sharedUtils";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  KitchenPlacementBinding,
  KitchenWorktopInstance,
  LayoutInstance,
  SectionInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { ModuleParams } from "../model/cabinetTypes";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleContextBindingSource, ModulePlacementContext } from "../core/module-package/module-package-types";
import type { KitchenContext } from "../layout/kitchenContext";
import type { LayoutTool } from "../layout/appState";
import type { MeasureState } from "./measureTools";
import { validateKitchenModulePackagePlacement } from "../layout/modulePackagePlacementIntegration";
import {
  getKitchenModuleRole,
  isKitchenCornerModule,
  staysOutsideKitchenWorktopFootprint,
  type KitchenModuleEditLayer
} from "../layout/kitchenModuleRules";
import { applyKitchenContextToModuleParams } from "../layout/kitchenMaterialSync";
import { getVendorPreferredPlacementContext, validateVendorPlacementCandidate } from "../layout/vendorPlacementRules";
import {
  getKitchenWorktopPolygon,
  getKitchenWorktopSegmentDepthMm,
  kitchenWorktopPointToWorld,
  sanitizeKitchenWorktopPath
} from "../layout/worktopGeometry";
import { deriveKitchenRunEndClosure } from "./kitchenRunEndClosure";
import { toFreePlanBinding } from "./measureAssociative";
import { findKitchenPlacementGroup, resolveKitchenPlacementBackOffset } from "./moduleKitchenPlacement";
import {
  reflowKitchenRunModules,
  requestedKitchenRunCenterForGap,
  type KitchenRunCornerArm,
  type KitchenRunDimensionModule,
  type KitchenRunDimensionSource
} from "../layout/kitchenRunDimensions";
import {
  requestedKitchenCornerParamValue,
  resolveKitchenCornerDimensionParam,
  type KitchenCornerDimensionAxis
} from "../layout/kitchenCornerDimensionParams";
import {
  moveKitchenWorktopSegmentByAdjacentLength,
  resizeKitchenWorktopSegment as resizeWorktopSegmentParams,
  setKitchenWorktopSegmentDepth
} from "../layout/worktopSegmentEditing";
import {
  createPinoSideCabinetPlacementCandidate,
  getPinoSideCabinetPreferredPlacementContext,
  validatePinoSideCabinetPlacementCandidate
} from "../modules/pinoSideCabinet/rules";
import type { PinoSideCabinetParams } from "../modules/pinoSideCabinet/types";

type KitchenGroupState = {
  id: string;
  name: string;
  ctx: KitchenContext;
  instanceIds: string[];
};

type PolygonClipMultiPolygon = Array<Array<Array<[number, number]>>>;

function getChangedKitchenContextKeys(nextCtx: KitchenContext, prevCtx: KitchenContext) {
  const keys = new Set<string>();
  const nextRecord = nextCtx as unknown as Record<string, unknown>;
  const prevRecord = prevCtx as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(nextRecord), ...Object.keys(prevRecord)])) {
    if (!Object.is(nextRecord[key], prevRecord[key])) keys.add(key);
  }
  return keys;
}

function contextSourceKey(source: ModuleContextBindingSource) {
  const match = source.match(/^ctx\.([A-Za-z0-9_]+)$/);
  return match?.[1] ?? null;
}

function modulePackageReadsChangedKitchenContext(modulePackage: FurnQuoteModulePackage | null, changedKeys: Set<string>) {
  if (changedKeys.size === 0) return false;
  const bindings = modulePackage?.behavior?.contextBindings?.filter((binding) => binding.contextType === "kitchenGroup") ?? [];
  if (bindings.length === 0) return true;
  for (const binding of bindings) {
    const sources = [
      ...(binding.parameterSync ?? []).map((rule) => rule.source),
      ...(binding.materialSync ?? []).map((rule) => rule.source),
      ...(binding.componentSync ?? []).map((rule) => rule.source)
    ];
    for (const source of sources) {
      const key = contextSourceKey(source);
      if (key && changedKeys.has(key)) return true;
    }
  }
  return false;
}

const worktopContextKeys = new Set([
  "heightMm",
  "worktopDepthMm",
  "worktopThicknessMm",
  "worktopCornerCutMm",
  "worktopOverhangSideMm",
  "worktopMaterialId"
]);

function hasAnyChangedContextKey(changedKeys: Set<string>, testedKeys: Set<string>) {
  for (const key of changedKeys) {
    if (testedKeys.has(key)) return true;
  }
  return false;
}

export type KitchenPlacementControllerContext = {
  S: {
    activeKitchenGroupId: string | null;
    kitchenCtx: KitchenContext;
    kitchenEditMode: boolean;
    kitchenGroups: KitchenGroupState[];
  };
  walls: WallInstance[];
  instances: LayoutInstance[];
  floors: FloorInstance[];
  columns?: ColumnInstance[];
  sections?: SectionInstance[];
  getWindows?: () => WindowInstance[];
  getDoors?: () => DoorInstance[];
  customFurniture?: CustomFurnitureInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  wallSolvedOutlines: Map<string, Array<{ x: number; z: number }>>;
  getKitchenWorktopBackGuidePath: (params: KitchenWorktopInstance["params"], backOffsetMm?: number) => THREE.Vector3[];
  rebuildInstance: (
    inst: LayoutInstance,
    opts?: {
      skipLayoutValidation?: boolean;
      skipLayoutPanelUpdate?: boolean;
      preserveBackAnchor?: boolean;
      previousParams?: ModuleParams;
      sourceKey?: string;
    }
  ) => boolean;
  rebuildKitchenGroupWorktops: (groupId: string, nextCtx?: KitchenContext) => void;
  rebuildKitchenWorktop: (worktop: KitchenWorktopInstance) => void;
  updateLayoutPanel: () => void;
  getWallSolvedJoinPolys: () => Array<Array<{ x: number; z: number }>>;
  getWallUnionPolys: () => PolygonClipMultiPolygon | null;
  getLayoutTool: () => LayoutTool;
  getWallChainStart: () => THREE.Vector3 | null;
  commitHistory: () => void;
  catalog: ClientCatalog;
  modulePackages?: readonly FurnQuoteModulePackage[];
};

export function createKitchenPlacementController(ctx: KitchenPlacementControllerContext) {
  const S = ctx.S;
  const walls = ctx.walls;
  const instances = ctx.instances;
  const floors = ctx.floors;
  const kitchenWorktops = ctx.kitchenWorktops;
  const wallSolvedOutlines = ctx.wallSolvedOutlines;
  const getKitchenWorktopBackGuidePath = ctx.getKitchenWorktopBackGuidePath;
  const rebuildInstance = ctx.rebuildInstance;
  const rebuildKitchenGroupWorktops = ctx.rebuildKitchenGroupWorktops;
  const updateLayoutPanel = ctx.updateLayoutPanel;

  const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const kitchenBackAnchorName = "__kitchen_back_anchor";
  const kitchenCornerAnchorName = "__kitchen_corner_anchor";
  const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
  const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
  const kitchenAnchorMaxDistanceM = 0.18;
  const kitchenAnchorMaxAngleDeltaRad = Math.PI / 3;
  const kitchenRunEndClosureSyncing = new WeakSet<LayoutInstance>();

  const getModulePackageForInstance = (inst: LayoutInstance) => {
    const params = inst.params as Record<string, unknown>;
    const explicitPackageId = typeof params.modulePackageId === "string" ? params.modulePackageId : null;
    if (explicitPackageId) {
      return ctx.modulePackages?.find((modulePackage) => modulePackage.module.modulePackageId === explicitPackageId) ?? null;
    }
    return ctx.modulePackages?.find((modulePackage) => modulePackage.module.moduleType === inst.params.type) ?? null;
  };

  const getModuleWidthLimitsMm = (inst: LayoutInstance) => {
    const modulePackage = getModulePackageForInstance(inst);
    const widthParameter = modulePackage?.parameters.parameters.find((parameter) => parameter.key === "width" || parameter.key === "widthMm");
    const dimensionRule = modulePackage?.constraints.dimensionRules?.width;
    return {
      minWidthMm: Math.max(1, dimensionRule?.min ?? widthParameter?.min ?? 1),
      maxWidthMm: Math.max(1, dimensionRule?.max ?? widthParameter?.max ?? 100_000)
    };
  };

  const getInstanceWidthMm = (inst: LayoutInstance) =>
    Math.max(1, (inst.localBox.max.x - inst.localBox.min.x) * 1000);

  const getInstanceWidthParamKey = (inst: LayoutInstance) => {
    const params = inst.params as Record<string, unknown>;
    if (typeof params.width === "number") return "width";
    if (typeof params.widthMm === "number") return "widthMm";
    return "width";
  };

  const firstPlacementError = (result: { errors: Array<{ message: string }> }) =>
    result.errors[0]?.message ?? "Placement does not match module package rules.";

  const getPreferredPlacementContext = (modulePackage: FurnQuoteModulePackage | null, params: ModuleParams): ModulePlacementContext => {
    if (params.type === "pino_side_cabinet") {
      return getPinoSideCabinetPreferredPlacementContext(params as PinoSideCabinetParams);
    }
    const vendorPreferred = getVendorPreferredPlacementContext(params as unknown as Record<string, unknown>, null);
    if (vendorPreferred) return vendorPreferred;
    const allowed = modulePackage?.placement.allowedContexts ?? [];
    if (allowed.includes("kitchen_wall")) return "kitchen_wall";
    if (allowed.includes("appliance_zone")) return "appliance_zone";
    if (allowed.includes("floor")) return "floor";
    return "kitchen_wall";
  };

  const describePlacementTarget = (placementContext: ModulePlacementContext) =>
    placementContext === "appliance_zone" ? "appliance zone beside the worktop" : "beside the worktop";

  const getPinoPlacementValidation = (params: ModuleParams, placementContext: ModulePlacementContext) => {
    if (params.type !== "pino_side_cabinet") return null;
    const pinoParams = params as PinoSideCabinetParams;
    return validatePinoSideCabinetPlacementCandidate(
      pinoParams,
      createPinoSideCabinetPlacementCandidate(pinoParams, placementContext)
    );
  };

  const getVendorPlacementValidation = (params: ModuleParams, placementContext: ModulePlacementContext) => {
    if (params.type === "pino_side_cabinet") return null;
    return validateVendorPlacementCandidate(params as unknown as Record<string, unknown>, placementContext);
  };

  const normalizeAngleRad = (angle: number) => {
    let next = angle;
    while (next <= -Math.PI) next += Math.PI * 2;
    while (next > Math.PI) next -= Math.PI * 2;
    return next;
  };

  const getModuleLocalBackCenter = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenBackAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3((inst.localBox.min.x + inst.localBox.max.x) * 0.5, 0, inst.localBox.min.z);
  };

  const isCornerKitchenModule = (instOrParams: LayoutInstance | ModuleParams) => {
    const maybeParams = "params" in instOrParams ? instOrParams.params : instOrParams;
    const modulePackage = "root" in instOrParams && "params" in instOrParams
      ? getModulePackageForInstance(instOrParams as LayoutInstance)
      : null;
    return isKitchenCornerModule(maybeParams as Record<string, unknown>, modulePackage);
  };

  const moduleStaysOutsideKitchenWorktop = (instOrParams: LayoutInstance | ModuleParams) =>
    staysOutsideKitchenWorktopFootprint(
      ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>
    );

  const getKitchenModulePlacementY = (instOrParams: LayoutInstance | ModuleParams, groupId?: string | null) => {
    const params = ("params" in instOrParams ? instOrParams.params : instOrParams) as Record<string, unknown>;
    if (getKitchenModuleRole(params) !== "upper") return 0;
    const inferredGroupId = "kitchenGroupId" in instOrParams && typeof instOrParams.kitchenGroupId === "string" ? instOrParams.kitchenGroupId : null;
    const effectiveGroupId = groupId ?? inferredGroupId;
    const group = findKitchenPlacementGroup({ kitchenGroupId: effectiveGroupId, kitchenGroups: S.kitchenGroups });
    const ctx = group?.ctx ?? S.kitchenCtx;
    return ctx.upperStartHeightMm / 1000;
  };

  const getModuleLocalKitchenCornerAnchor = (inst: LayoutInstance) => {
    inst.root.updateMatrixWorld(true);
    const anchor = inst.module.getObjectByName(kitchenCornerAnchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.min.z);
  };

  const getModuleLocalKitchenCornerAxisAnchor = (inst: LayoutInstance, axis: "x" | "z") => {
    inst.root.updateMatrixWorld(true);
    const anchorName = axis === "x" ? kitchenCornerXAnchorName : kitchenCornerZAnchorName;
    const anchor = inst.module.getObjectByName(anchorName);
    if (anchor) {
      const world = new THREE.Vector3();
      anchor.getWorldPosition(world);
      return inst.root.worldToLocal(world.clone());
    }
    return axis === "x"
      ? new THREE.Vector3(inst.localBox.max.x, 0, inst.localBox.min.z)
      : new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.max.z);
  };

  const getModuleKitchenCornerExtents = (inst: LayoutInstance) => {
    const corner = getModuleLocalKitchenCornerAnchor(inst);
    const xAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const zAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    return {
      corner,
      xLength: Math.max(0.001, xAnchor.clone().sub(corner).length()),
      zLength: Math.max(0.001, zAnchor.clone().sub(corner).length())
    };
  };

  const getModuleKitchenCornerRotationOffset = (inst: LayoutInstance) => {
    const raw = inst.module.userData.kitchenCornerRotationOffsetRad ?? inst.root.userData.kitchenCornerRotationOffsetRad;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };

  const getProjectedKitchenCornerFootprintPlacement = (
    inst: LayoutInstance,
    corner: THREE.Vector3,
    rotationY: number,
    xDir: THREE.Vector3,
    zDir: THREE.Vector3
  ) => {
    const { min, max } = inst.localBox;
    const values = [min.x, min.z, max.x, max.z];
    if (values.some((value) => !Number.isFinite(value))) return null;
    const euler = new THREE.Euler(0, rotationY, 0);
    const points = [
      new THREE.Vector3(min.x, 0, min.z),
      new THREE.Vector3(max.x, 0, min.z),
      new THREE.Vector3(max.x, 0, max.z),
      new THREE.Vector3(min.x, 0, max.z)
    ].map((point) => point.applyEuler(euler));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const point of points) {
      const x = point.dot(xDir);
      const z = point.dot(zDir);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
    return {
      position: corner.clone().sub(xDir.clone().multiplyScalar(minX)).sub(zDir.clone().multiplyScalar(minZ)),
      xLength: Math.max(0.001, maxX - minX),
      zLength: Math.max(0.001, maxZ - minZ)
    };
  };

  const getModuleLocalKitchenAnchor = (inst: LayoutInstance) =>
    isCornerKitchenModule(inst) ? getModuleLocalKitchenCornerAnchor(inst) : getModuleLocalBackCenter(inst);

  const getModuleWorldKitchenAnchor = (inst: LayoutInstance) => getModuleLocalKitchenAnchor(inst).applyMatrix4(inst.root.matrixWorld);

  const preserveWorldKitchenAnchor = (inst: LayoutInstance, previousWorldAnchor: THREE.Vector3) => {
    const nextWorldAnchor = getModuleWorldKitchenAnchor(inst);
    if (isCornerKitchenModule(inst)) {
      const delta = previousWorldAnchor.clone().sub(nextWorldAnchor);
      delta.y = 0;
      if (delta.lengthSq() <= 1e-12) return;
      inst.root.position.add(delta);
      inst.root.position.y = getKitchenModulePlacementY(inst);
      inst.root.updateMatrixWorld(true);
      return;
    }

    const frontDir = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, inst.root.rotation.y, 0)).normalize();
    const deltaDepth = previousWorldAnchor.clone().sub(nextWorldAnchor).dot(frontDir);
    if (Math.abs(deltaDepth) <= 1e-9) return;
    inst.root.position.addScaledVector(frontDir, deltaDepth);
    inst.root.position.y = getKitchenModulePlacementY(inst);
    inst.root.updateMatrixWorld(true);
  };

  let measureStateRef: Pick<MeasureState, "measures"> | null = null;

  const getAssociativeMeasureContext = (): AssociativeMeasureContext => ({
    walls,
    instances,
    floors,
    columns: ctx.columns ?? [],
    sections: ctx.sections ?? [],
    windows: ctx.getWindows?.() ?? [],
    doors: ctx.getDoors?.() ?? [],
    customFurniture: ctx.customFurniture ?? [],
    worktops: kitchenWorktops,
    measures: (measureStateRef?.measures ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      aBinding: item.aBinding,
      bBinding: item.bBinding
    })),
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const bindingFromPlanSnap = (snapped: PlanSnapResult | null, fallbackPoint: THREE.Vector3): PlanSnapBinding =>
    snapped?.binding ?? toFreePlanBinding(fallbackPoint);

  const snapPoint2D = createPlanSnapper({
    getWalls: () => walls,
    getInstances: () => instances,
    getFloors: () => floors,
    getColumns: () => ctx.columns ?? [],
    getSections: () => ctx.sections ?? [],
    getWindows: () => ctx.getWindows?.() ?? [],
    getDoors: () => ctx.getDoors?.() ?? [],
    getCustomFurniture: () => ctx.customFurniture ?? [],
    getKitchenWorktops: () => kitchenWorktops,
    getMeasureGuides: () => buildMeasureGuides(getAssociativeMeasureContext()),
    getWallSolvedOutlines: () => wallSolvedOutlines,
    getWallSolvedJoinPolys: () => ctx.getWallSolvedJoinPolys(),
    getWallUnionPolys: () => ctx.getWallUnionPolys(),
    getLayoutTool: () => ctx.getLayoutTool(),
    getWallChainStart: () => ctx.getWallChainStart(),
    getModuleLocalBackCenter,
    getKitchenWorktopPolygon
  });

  const getKitchenGuideSegmentInfo = (
    worktop: KitchenWorktopInstance,
    segmentIndex: number,
    backOffsetMm: number
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 2) return null;
    const safeIndex = clampNumber(segmentIndex, 0, guidePath.length - 2);
    const start = guidePath[safeIndex]!;
    const end = guidePath[safeIndex + 1]!;
    const segment = end.clone().sub(start);
    segment.y = 0;
    const length = segment.length();
    if (length < 1e-6) return null;
    const dir = segment.clone().multiplyScalar(1 / length);
    const frontNormal = new THREE.Vector3(-dir.z, 0, dir.x);
    if (worktop.params.mirrored) frontNormal.multiplyScalar(-1);
    const rotationY = Math.atan2(frontNormal.x, frontNormal.z);
    return { start, end, dir, length, frontNormal, rotationY };
  };

  const getKitchenCornerPlacementInfo = (
    worktop: KitchenWorktopInstance,
    cornerIndex: number,
    backOffsetMm: number,
    inst: LayoutInstance
  ) => {
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    if (guidePath.length < 3) return null;
    const safeCornerIndex = clampNumber(cornerIndex, 1, guidePath.length - 2);
    const prev = guidePath[safeCornerIndex - 1]!;
    const corner = guidePath[safeCornerIndex]!;
    const next = guidePath[safeCornerIndex + 1]!;
    const prevVec = prev.clone().sub(corner);
    const nextVec = next.clone().sub(corner);
    prevVec.y = 0;
    nextVec.y = 0;
    const prevLength = prevVec.length();
    const nextLength = nextVec.length();
    if (prevLength < 1e-6 || nextLength < 1e-6) return null;

    const prevDir = prevVec.clone().multiplyScalar(1 / prevLength);
    const nextDir = nextVec.clone().multiplyScalar(1 / nextLength);
    if (Math.abs(prevDir.dot(nextDir)) > 0.999) return null;

    const cornerExtents = getModuleKitchenCornerExtents(inst);
    const localCorner = cornerExtents.corner;
    const rotationOffset = getModuleKitchenCornerRotationOffset(inst);
    const makeCornerPlacement = (
      xDir: THREE.Vector3,
      zDir: THREE.Vector3,
      xLength: number,
      zLength: number,
      rotationY: number,
      forceProjectedFootprint = false
    ) => {
      const projectedPlacement = forceProjectedFootprint || Math.abs(rotationOffset) > 1e-9
        ? getProjectedKitchenCornerFootprintPlacement(inst, corner, rotationY, xDir, zDir)
        : null;
      const rotatedCorner = localCorner.clone().applyEuler(new THREE.Euler(0, rotationY, 0));
      const position = projectedPlacement?.position ?? corner.clone().sub(rotatedCorner);
      position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      return {
        binding: {
          kind: "corner" as const,
          worktopId: worktop.id,
          segmentIndex: safeCornerIndex - 1,
          offsetAlongM: 0,
          cornerIndex: safeCornerIndex
        },
        corner,
        position,
        rotationY,
        valid:
          xLength + 1e-6 >= (projectedPlacement?.xLength ?? cornerExtents.xLength) &&
          zLength + 1e-6 >= (projectedPlacement?.zLength ?? cornerExtents.zLength),
        xDir,
        zDir,
        xLength,
        zLength
      };
    };

    const tryAssignment = (xDir: THREE.Vector3, zDir: THREE.Vector3, xLength: number, zLength: number) => {
      const axisRotationY = Math.atan2(zDir.x, zDir.z);
      const rotatedX = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, axisRotationY, 0)).normalize();
      const rotatedZ = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, axisRotationY, 0)).normalize();
      if (rotatedX.dot(xDir) < 0.999 || rotatedZ.dot(zDir) < 0.999) return null;
      return makeCornerPlacement(xDir, zDir, xLength, zLength, axisRotationY + rotationOffset);
    };

    const basePlacement =
      tryAssignment(prevDir, nextDir, prevLength, nextLength) ??
      tryAssignment(nextDir, prevDir, nextLength, prevLength);
    if (!basePlacement) return null;

    const side = (inst.params as Record<string, unknown>).side;
    if (side !== "right") return basePlacement;

    const bisector = basePlacement.xDir.clone().add(basePlacement.zDir);
    if (bisector.lengthSq() < 1e-9) return basePlacement;
    bisector.normalize();
    const bisectorAngleY = Math.atan2(bisector.x, bisector.z);
    const mirroredRotationY = normalizeAngleRad(2 * bisectorAngleY - basePlacement.rotationY);
    return makeCornerPlacement(
      basePlacement.xDir,
      basePlacement.zDir,
      basePlacement.xLength,
      basePlacement.zLength,
      mirroredRotationY,
      true
    );
  };

  const getKitchenCornerArmBindingInfo = (inst: LayoutInstance, backOffsetMm: number) => {
    if (!isCornerKitchenModule(inst)) return null;
    const binding = inst.kitchenPlacement;
    if (!binding || (binding.kind ?? "segment") !== "corner") return null;

    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId) ?? null;
    if (!worktop) return null;

    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    const cornerIndex = Math.max(1, Math.min(binding.cornerIndex ?? 1, guidePath.length - 2));
    const cornerPoint = guidePath[cornerIndex];
    const prevPoint = guidePath[cornerIndex - 1];
    const nextPoint = guidePath[cornerIndex + 1];
    if (!cornerPoint || !prevPoint || !nextPoint) return null;

    const prevDir = prevPoint.clone().sub(cornerPoint).setY(0);
    const nextDir = nextPoint.clone().sub(cornerPoint).setY(0);
    if (prevDir.lengthSq() < 1e-8 || nextDir.lengthSq() < 1e-8) return null;
    prevDir.normalize();
    nextDir.normalize();

    const localCorner = getModuleLocalKitchenCornerAnchor(inst);
    const localXAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "x");
    const localZAnchor = getModuleLocalKitchenCornerAxisAnchor(inst, "z");
    const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld);
    const xDir = localXAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    const zDir = localZAnchor.clone().applyMatrix4(inst.root.matrixWorld).sub(worldCorner).setY(0);
    if (xDir.lengthSq() < 1e-8 || zDir.lengthSq() < 1e-8) return null;
    xDir.normalize();
    zDir.normalize();

    const resolveSegmentIndex = (axisDir: THREE.Vector3) => {
      const prevDot = axisDir.dot(prevDir);
      const nextDot = axisDir.dot(nextDir);
      if (prevDot >= nextDot && prevDot > 0.9) return cornerIndex - 1;
      if (nextDot > 0.9) return cornerIndex;
      return null;
    };

    const extents = getModuleKitchenCornerExtents(inst);
    return {
      worktopId: binding.worktopId,
      cornerIndex,
      xSegmentIndex: resolveSegmentIndex(xDir),
      zSegmentIndex: resolveSegmentIndex(zDir),
      xLengthM: extents.xLength,
      zLengthM: extents.zLength
    };
  };

  const getKitchenSegmentReservedDetails = (
    groupId: string | null,
    worktopId: string,
    segmentIndex: number,
    backOffsetMm: number,
    ignoreInstanceId?: string | null,
    moduleRole?: KitchenModuleEditLayer
  ) => {
    if (!groupId) return { startM: 0, endM: 0 };
    let startM = 0;
    let endM = 0;
    let startArm: KitchenRunCornerArm | undefined;
    let endArm: KitchenRunCornerArm | undefined;

    const reserve = (side: "start" | "end", moduleId: string, axis: KitchenCornerDimensionAxis, lengthM: number) => {
      if (side === "start") {
        if (lengthM <= startM) return;
        startM = lengthM;
        startArm = { moduleId, axis, lengthMm: lengthM * 1000 };
        return;
      }
      if (lengthM <= endM) return;
      endM = lengthM;
      endArm = { moduleId, axis, lengthMm: lengthM * 1000 };
    };

    for (const other of instances) {
      if (
        other.id === ignoreInstanceId ||
        other.kitchenGroupId !== groupId ||
        !isCornerKitchenModule(other) ||
        (moduleRole != null && getKitchenModuleRole(other.params as Record<string, unknown>) !== moduleRole)
      ) continue;
      const armInfo = getKitchenCornerArmBindingInfo(other, backOffsetMm);
      if (!armInfo || armInfo.worktopId !== worktopId) continue;

      if (armInfo.xSegmentIndex === segmentIndex) {
        reserve(segmentIndex < armInfo.cornerIndex ? "end" : "start", other.id, "x", armInfo.xLengthM);
      }
      if (armInfo.zSegmentIndex === segmentIndex) {
        reserve(segmentIndex < armInfo.cornerIndex ? "end" : "start", other.id, "z", armInfo.zLengthM);
      }
    }

    return { startM, endM, startArm, endArm };
  };

  const getKitchenSegmentReservedMargins = (
    ...args: Parameters<typeof getKitchenSegmentReservedDetails>
  ) => {
    const { startM, endM } = getKitchenSegmentReservedDetails(...args);
    return { startM, endM };
  };

  const inferKitchenPlacementBinding = (
    inst: LayoutInstance,
    groupId: string,
    backOffsetMm: number
  ): KitchenPlacementBinding | null => {
    if (moduleStaysOutsideKitchenWorktop(inst)) return null;
    const groupWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === groupId);
    if (groupWorktops.length === 0) return null;

    if (isCornerKitchenModule(inst)) {
      const localCorner = getModuleLocalKitchenCornerAnchor(inst);
      const worldCorner = localCorner.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
      let best:
        | {
            binding: KitchenPlacementBinding;
            distanceSq: number;
            angleDelta: number;
          }
        | null = null;

      for (const worktop of groupWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, inst);
          if (!info) continue;
          const distanceSq = info.corner.distanceToSquared(worldCorner);
          const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));
          if (
            !best ||
            distanceSq < best.distanceSq - 1e-9 ||
            (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
          ) {
            best = {
              binding: info.binding,
              distanceSq,
              angleDelta
            };
          }
        }
      }

      if (!best) return null;
      if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
      if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
      return best.binding;
    }

    const localBackCenter = getModuleLocalBackCenter(inst);
    const worldBackCenter = localBackCenter.clone().applyMatrix4(inst.root.matrixWorld).setY(0);
    let best:
      | {
          binding: KitchenPlacementBinding;
          distanceSq: number;
          angleDelta: number;
        }
      | null = null;

    for (const worktop of groupWorktops) {
      for (let segmentIndex = 0; segmentIndex < getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm).length - 1; segmentIndex += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, segmentIndex, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(groupId, worktop.id, segmentIndex, backOffsetMm, inst.id);
        const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const cursorOffset = worldBackCenter.clone().sub(info.start);
        const projected = clampNumber(cursorOffset.dot(info.dir), minAlong, maxAlong);
        const closestOnGuide = info.start.clone().addScaledVector(info.dir, projected);
        const distanceSq = closestOnGuide.distanceToSquared(worldBackCenter);
        const angleDelta = Math.abs(normalizeAngleRad(info.rotationY - inst.root.rotation.y));

        if (
          !best ||
          distanceSq < best.distanceSq - 1e-9 ||
          (Math.abs(distanceSq - best.distanceSq) < 1e-9 && angleDelta < best.angleDelta)
        ) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex,
              offsetAlongM: projected
            },
            distanceSq,
            angleDelta
          };
        }
      }
    }

    if (!best) return null;
    if (Math.sqrt(best.distanceSq) > kitchenAnchorMaxDistanceM) return null;
    if (best.angleDelta > kitchenAnchorMaxAngleDeltaRad) return null;
    return best.binding;
  };

  const applyKitchenPlacementBinding = (
    inst: LayoutInstance,
    binding: KitchenPlacementBinding,
    backOffsetMm: number,
    opts?: { skipRunEndClosureSync?: boolean }
  ) => {
    const worktop = kitchenWorktops.find((item) => item.id === binding.worktopId);
    if (!worktop) return false;

    if ((binding.kind ?? "segment") === "corner" || (isCornerKitchenModule(inst) && binding.cornerIndex != null)) {
      const info = getKitchenCornerPlacementInfo(
        worktop,
        binding.cornerIndex ?? binding.segmentIndex + 1,
        backOffsetMm,
        inst
      );
      if (!info) return false;
      inst.root.rotation.y = info.rotationY;
      inst.root.position.copy(info.position);
      inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
      inst.root.updateMatrixWorld(true);
      inst.kitchenPlacement = { ...info.binding };
      if (!opts?.skipRunEndClosureSync) syncKitchenRunEndClosure(inst, backOffsetMm);
      return true;
    }

    const info = getKitchenGuideSegmentInfo(worktop, binding.segmentIndex, backOffsetMm);
    if (!info) return false;

    const localBackCenter = getModuleLocalBackCenter(inst);
    const halfModuleWidthM = Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
    const reserved = getKitchenSegmentReservedMargins(inst.kitchenGroupId ?? worktop.kitchenGroupId, worktop.id, binding.segmentIndex, backOffsetMm, inst.id);
    const minAlong = reserved.startM + halfModuleWidthM;
    const maxAlong = info.length - reserved.endM - halfModuleWidthM;
    if (maxAlong + 1e-6 < minAlong) return false;
    const clampedAlong =
      clampNumber(binding.offsetAlongM, minAlong, maxAlong);
    const backCenter = info.start.clone().addScaledVector(info.dir, clampedAlong);
    const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));

    inst.root.rotation.y = info.rotationY;
    inst.root.position.copy(backCenter.clone().sub(rotatedBackCenter));
    inst.root.position.y = getKitchenModulePlacementY(inst, worktop.kitchenGroupId);
    inst.root.updateMatrixWorld(true);
    inst.kitchenPlacement = {
      worktopId: binding.worktopId,
      segmentIndex: binding.segmentIndex,
      offsetAlongM: clampedAlong
    };
    if (!opts?.skipRunEndClosureSync) syncKitchenRunEndClosure(inst, backOffsetMm);
    return true;
  };

  const syncKitchenRunEndClosure = (inst: LayoutInstance, backOffsetMm: number) => {
    if (kitchenRunEndClosureSyncing.has(inst)) return false;
    const params = inst.params as Record<string, unknown>;
    const hasExistingClosureState =
      "kitchenEndClosureLeft" in params ||
      "kitchenEndClosureRight" in params ||
      "kitchenEndClosureBackGapMm" in params;
    const supportsClosure = inst.module.userData.supportsKitchenRunEndClosure === true;
    if (!supportsClosure && !hasExistingClosureState) return false;

    const binding = inst.kitchenPlacement;
    const worktop = binding ? kitchenWorktops.find((item) => item.id === binding.worktopId) ?? null : null;
    const guidePath = worktop ? getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm) : [];
    const state = deriveKitchenRunEndClosure({
      enabled: supportsClosure && getKitchenModuleRole(params) === "base" && !isCornerKitchenModule(inst),
      binding,
      guidePath,
      moduleWidthM: Math.max(0.002, inst.localBox.max.x - inst.localBox.min.x),
      moduleRotationY: inst.root.rotation.y,
      backGapMm: backOffsetMm
    });

    const changed =
      params.kitchenEndClosureLeft !== state.left ||
      params.kitchenEndClosureRight !== state.right ||
      params.kitchenEndClosureBackGapMm !== state.backGapMm;
    if (!changed) return false;

    const previous = {
      left: params.kitchenEndClosureLeft,
      right: params.kitchenEndClosureRight,
      backGapMm: params.kitchenEndClosureBackGapMm
    };
    const previousBinding = binding ? structuredClone(binding) : null;
    params.kitchenEndClosureLeft = state.left;
    params.kitchenEndClosureRight = state.right;
    params.kitchenEndClosureBackGapMm = state.backGapMm;

    kitchenRunEndClosureSyncing.add(inst);
    const rebuilt = rebuildInstance(inst, {
      skipLayoutValidation: true,
      skipLayoutPanelUpdate: true,
      preserveBackAnchor: true,
      sourceKey: inst.params.type
    });
    if (!rebuilt) {
      if (previous.left === undefined) delete params.kitchenEndClosureLeft;
      else params.kitchenEndClosureLeft = previous.left;
      if (previous.right === undefined) delete params.kitchenEndClosureRight;
      else params.kitchenEndClosureRight = previous.right;
      if (previous.backGapMm === undefined) delete params.kitchenEndClosureBackGapMm;
      else params.kitchenEndClosureBackGapMm = previous.backGapMm;
      kitchenRunEndClosureSyncing.delete(inst);
      return false;
    }
    if (previousBinding) applyKitchenPlacementBinding(inst, previousBinding, backOffsetMm, { skipRunEndClosureSync: true });
    kitchenRunEndClosureSyncing.delete(inst);
    return true;
  };

  const syncKitchenRunEndClosures = (groupId: string, backOffsetMm?: number) => {
    const group = findKitchenPlacementGroup({ kitchenGroupId: groupId, kitchenGroups: S.kitchenGroups });
    const resolvedBackOffsetMm = backOffsetMm ?? group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
    let changed = false;
    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      changed = syncKitchenRunEndClosure(inst, resolvedBackOffsetMm) || changed;
    }
    return changed;
  };

  const getKitchenRunDimensionSources = (
    groupId: string,
    moduleRole: KitchenModuleEditLayer = "base"
  ): KitchenRunDimensionSource[] => {
    const backOffsetMm = resolveKitchenPlacementBackOffset({
      kitchenGroupId: groupId,
      kitchenGroups: S.kitchenGroups,
      defaultWorktopBackOffsetMm: S.kitchenCtx.worktopBackOffsetMm
    });
    const sources: KitchenRunDimensionSource[] = [];
    for (const worktop of kitchenWorktops) {
      if (worktop.kitchenGroupId !== groupId) continue;
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      const worktopEdgePath = sanitizeKitchenWorktopPath(worktop.params.path).map(kitchenWorktopPointToWorld);
      for (let segmentIndex = 0; segmentIndex < guidePath.length - 1; segmentIndex += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, segmentIndex, backOffsetMm);
        if (!info) continue;
        const worktopEdgeStart = worktopEdgePath[segmentIndex];
        const worktopEdgeEnd = worktopEdgePath[segmentIndex + 1];
        const reserved = getKitchenSegmentReservedDetails(groupId, worktop.id, segmentIndex, backOffsetMm, null, moduleRole);
        const modules: KitchenRunDimensionModule[] = [];
        for (const inst of instances) {
          const binding = inst.kitchenPlacement;
          if (
            inst.kitchenGroupId !== groupId ||
            !binding ||
            (binding.kind ?? "segment") !== "segment" ||
            binding.worktopId !== worktop.id ||
            binding.segmentIndex !== segmentIndex ||
            getKitchenModuleRole(inst.params as Record<string, unknown>) !== moduleRole ||
            isCornerKitchenModule(inst)
          ) continue;
          const limits = getModuleWidthLimitsMm(inst);
          modules.push({
            id: inst.id,
            centerMm: binding.offsetAlongM * 1000,
            widthMm: getInstanceWidthMm(inst),
            ...limits
          });
        }
        sources.push({
          id: `${worktop.id}:${segmentIndex}`,
          groupId,
          worktopId: worktop.id,
          segmentIndex,
          lengthMm: info.length * 1000,
          worktopDepthMm: getKitchenWorktopSegmentDepthMm(worktop.params, segmentIndex),
          start: { x: info.start.x, z: info.start.z },
          end: { x: info.end.x, z: info.end.z },
          frontNormal: { x: info.frontNormal.x, z: info.frontNormal.z },
          worktopEdgeStart: worktopEdgeStart ? { x: worktopEdgeStart.x, z: worktopEdgeStart.z } : undefined,
          worktopEdgeEnd: worktopEdgeEnd ? { x: worktopEdgeEnd.x, z: worktopEdgeEnd.z } : undefined,
          worktopEdgeLengthMm: worktopEdgeStart && worktopEdgeEnd
            ? worktopEdgeStart.distanceTo(worktopEdgeEnd) * 1000
            : undefined,
          reservedStartMm: reserved.startM * 1000,
          reservedEndMm: reserved.endM * 1000,
          reservedStartArm: reserved.startArm,
          reservedEndArm: reserved.endArm,
          modules
        });
      }
    }
    return sources;
  };

  type KitchenRunModuleEditResult =
    | { ok: true; appliedValueMm: number; clamped: boolean }
    | { ok: false; reason: "missing-module" | "missing-run" | "invalid-value" | "run-too-small" | "rebuild-failed" };

  const applyKitchenRunModuleEdit = (args: {
    instanceId: string;
    widthMm?: number;
    gap?: { side: "before" | "after"; valueMm: number };
  }): KitchenRunModuleEditResult => {
    const inst = instances.find((item) => item.id === args.instanceId) ?? null;
    if (!inst?.kitchenGroupId) return { ok: false, reason: "missing-module" };
    const groupId = inst.kitchenGroupId;
    const moduleRole = getKitchenModuleRole(inst.params as Record<string, unknown>);
    if (moduleRole === "tall") return { ok: false, reason: "missing-run" };
    const source = getKitchenRunDimensionSources(groupId, moduleRole).find((run) => run.modules.some((module) => module.id === inst.id)) ?? null;
    if (!source) return { ok: false, reason: "missing-run" };
    let requestedCenterMm = source.modules.find((module) => module.id === inst.id)?.centerMm ?? 0;
    if (args.gap) {
      const center = requestedKitchenRunCenterForGap({
        side: args.gap.side,
        gapMm: args.gap.valueMm,
        selectedModuleId: inst.id,
        lengthMm: source.lengthMm,
        reservedStartMm: source.reservedStartMm,
        reservedEndMm: source.reservedEndMm,
        modules: source.modules
      });
      if (center == null) return { ok: false, reason: "invalid-value" };
      requestedCenterMm = center;
    }
    const reflow = reflowKitchenRunModules({
      lengthMm: source.lengthMm,
      reservedStartMm: source.reservedStartMm,
      reservedEndMm: source.reservedEndMm,
      modules: source.modules,
      selectedModuleId: inst.id,
      requestedWidthMm: args.widthMm,
      requestedCenterMm
    });
    if (!reflow.ok) return { ok: false, reason: reflow.reason };

    const affected = source.modules
      .map((module) => instances.find((item) => item.id === module.id) ?? null)
      .filter((item): item is LayoutInstance => !!item);
    const snapshots = affected.map((item) => ({
      item,
      params: item === inst ? structuredClone(item.params) : null,
      position: item.root.position.clone(),
      rotationY: item.root.rotation.y,
      binding: item.kitchenPlacement ? structuredClone(item.kitchenPlacement) : null
    }));
    const widthKey = getInstanceWidthParamKey(inst);
    if (args.widthMm != null) {
      const previousParams = structuredClone(inst.params);
      (inst.params as Record<string, unknown>)[widthKey] = reflow.selectedWidthMm;
      if (!rebuildInstance(inst, {
        skipLayoutValidation: true,
        skipLayoutPanelUpdate: true,
        preserveBackAnchor: true,
        previousParams,
        sourceKey: widthKey
      })) {
        inst.params = previousParams;
        rebuildInstance(inst, { skipLayoutValidation: true, skipLayoutPanelUpdate: true });
        return { ok: false, reason: "rebuild-failed" };
      }
    }

    const backOffsetMm = resolveKitchenPlacementBackOffset({
      kitchenGroupId: groupId,
      kitchenGroups: S.kitchenGroups,
      defaultWorktopBackOffsetMm: S.kitchenCtx.worktopBackOffsetMm
    });
    let applied = true;
    for (const item of affected) {
      const centerMm = reflow.centersMm.get(item.id);
      if (centerMm == null) continue;
      applied = applyKitchenPlacementBinding(item, {
        worktopId: source.worktopId,
        segmentIndex: source.segmentIndex,
        offsetAlongM: centerMm / 1000
      }, backOffsetMm) && applied;
    }
    if (!applied) {
      for (const snapshot of snapshots) {
        if (snapshot.params) {
          snapshot.item.params = structuredClone(snapshot.params);
          rebuildInstance(snapshot.item, { skipLayoutValidation: true, skipLayoutPanelUpdate: true });
        }
        snapshot.item.root.position.copy(snapshot.position);
        snapshot.item.root.rotation.y = snapshot.rotationY;
        snapshot.item.kitchenPlacement = snapshot.binding ? structuredClone(snapshot.binding) : null;
        snapshot.item.root.updateMatrixWorld(true);
      }
      syncKitchenRunEndClosures(groupId, backOffsetMm);
      return { ok: false, reason: "rebuild-failed" };
    }

    syncKitchenRunEndClosures(groupId, backOffsetMm);
    updateLayoutPanel();
    ctx.commitHistory();
    return {
      ok: true,
      appliedValueMm: args.widthMm != null ? reflow.selectedWidthMm : args.gap?.valueMm ?? 0,
      clamped: args.widthMm != null
        ? Math.abs(reflow.selectedWidthMm - args.widthMm) > 0.01
        : reflow.clamped
    };
  };

  const resizeKitchenRunModule = (instanceId: string, widthMm: number) =>
    applyKitchenRunModuleEdit({ instanceId, widthMm });

  const resizeKitchenCornerArm = (
    instanceId: string,
    axis: KitchenCornerDimensionAxis,
    requestedLengthMm: number
  ): KitchenRunModuleEditResult => {
    const inst = instances.find((item) => item.id === instanceId) ?? null;
    if (!inst?.kitchenGroupId || !isCornerKitchenModule(inst) || !Number.isFinite(requestedLengthMm)) {
      return { ok: false, reason: "missing-module" };
    }
    const params = inst.params as Record<string, unknown>;
    const param = resolveKitchenCornerDimensionParam(params, axis);
    if (!param) return { ok: false, reason: "invalid-value" };
    const groupId = inst.kitchenGroupId;
    const moduleRole = getKitchenModuleRole(params);
    if (moduleRole === "tall") return { ok: false, reason: "missing-run" };
    const backOffsetMm = resolveKitchenPlacementBackOffset({
      kitchenGroupId: groupId,
      kitchenGroups: S.kitchenGroups,
      defaultWorktopBackOffsetMm: S.kitchenCtx.worktopBackOffsetMm
    });
    const armInfo = getKitchenCornerArmBindingInfo(inst, backOffsetMm);
    if (!armInfo) return { ok: false, reason: "missing-run" };
    const currentLengthMm = (axis === "x" ? armInfo.xLengthM : armInfo.zLengthM) * 1000;
    if (!currentLengthMm) return { ok: false, reason: "missing-run" };
    const source = getKitchenRunDimensionSources(groupId, moduleRole).find((run) =>
      run.reservedStartArm?.moduleId === inst.id && run.reservedStartArm.axis === axis ||
      run.reservedEndArm?.moduleId === inst.id && run.reservedEndArm.axis === axis
    ) ?? null;
    if (!source) return { ok: false, reason: "missing-run" };
    const atStart = source.reservedStartArm?.moduleId === inst.id && source.reservedStartArm.axis === axis;
    const oppositeReservedMm = atStart ? source.reservedEndMm : source.reservedStartMm;
    const straightWidthsMm = source.modules.reduce((sum, module) => sum + module.widthMm, 0);
    const maximumArmMm = source.lengthMm - oppositeReservedMm - straightWidthsMm;
    const minimumArmMm = currentLengthMm + param.minimumMm - param.currentValueMm;
    if (maximumArmMm < minimumArmMm - 0.01) return { ok: false, reason: "run-too-small" };
    const appliedRequestMm = Math.max(minimumArmMm, Math.min(maximumArmMm, requestedLengthMm));
    const nextParamValue = requestedKitchenCornerParamValue({
      param,
      currentArmLengthMm: currentLengthMm,
      requestedArmLengthMm: appliedRequestMm
    });
    if (nextParamValue == null) return { ok: false, reason: "invalid-value" };

    const affected = instances.filter((item) => item.kitchenGroupId === groupId);
    const snapshots = affected.map((item) => ({
      item,
      params: item === inst ? structuredClone(item.params) : null,
      position: item.root.position.clone(),
      rotationY: item.root.rotation.y,
      binding: item.kitchenPlacement ? structuredClone(item.kitchenPlacement) : null
    }));
    const rollback = () => {
      for (const snapshot of snapshots) {
        if (snapshot.params) {
          snapshot.item.params = structuredClone(snapshot.params);
          rebuildInstance(snapshot.item, { skipLayoutValidation: true, skipLayoutPanelUpdate: true });
        }
        snapshot.item.root.position.copy(snapshot.position);
        snapshot.item.root.rotation.y = snapshot.rotationY;
        snapshot.item.kitchenPlacement = snapshot.binding ? structuredClone(snapshot.binding) : null;
        snapshot.item.root.updateMatrixWorld(true);
      }
      syncKitchenRunEndClosures(groupId, backOffsetMm);
    };

    const previousParams = structuredClone(inst.params);
    params[param.key] = nextParamValue;
    if (!rebuildInstance(inst, {
      skipLayoutValidation: true,
      skipLayoutPanelUpdate: true,
      preserveBackAnchor: true,
      previousParams,
      sourceKey: param.key
    }) || !inst.kitchenPlacement || !applyKitchenPlacementBinding(inst, inst.kitchenPlacement, backOffsetMm, { skipRunEndClosureSync: true })) {
      rollback();
      return { ok: false, reason: "rebuild-failed" };
    }

    const updatedArmInfo = getKitchenCornerArmBindingInfo(inst, backOffsetMm);
    const appliedLengthMm = updatedArmInfo
      ? (axis === "x" ? updatedArmInfo.xLengthM : updatedArmInfo.zLengthM) * 1000
      : 0;
    if (!appliedLengthMm) {
      rollback();
      return { ok: false, reason: "rebuild-failed" };
    }

    const affectedRuns = getKitchenRunDimensionSources(groupId, moduleRole).filter((run) =>
      run.reservedStartArm?.moduleId === inst.id || run.reservedEndArm?.moduleId === inst.id
    );
    let placementsValid = true;
    for (const run of affectedRuns) {
      const sorted = [...run.modules].sort((a, b) => a.centerMm - b.centerMm || a.id.localeCompare(b.id));
      const usableStartMm = run.reservedStartMm;
      const usableEndMm = run.lengthMm - run.reservedEndMm;
      const totalWidthMm = sorted.reduce((sum, module) => sum + module.widthMm, 0);
      if (totalWidthMm > usableEndMm - usableStartMm + 0.01) {
        placementsValid = false;
        break;
      }
      const centers = new Map<string, number>();
      let cursorMm = usableStartMm;
      for (const module of sorted) {
        const centerMm = Math.max(module.centerMm, cursorMm + module.widthMm / 2);
        centers.set(module.id, centerMm);
        cursorMm = centerMm + module.widthMm / 2;
      }
      const overflowMm = Math.max(0, cursorMm - usableEndMm);
      for (const module of sorted) {
        const item = instances.find((candidate) => candidate.id === module.id) ?? null;
        const centerMm = centers.get(module.id);
        if (!item || centerMm == null) continue;
        placementsValid = applyKitchenPlacementBinding(item, {
          worktopId: run.worktopId,
          segmentIndex: run.segmentIndex,
          offsetAlongM: (centerMm - overflowMm) / 1000
        }, backOffsetMm, { skipRunEndClosureSync: true }) && placementsValid;
      }
    }
    if (!placementsValid) {
      rollback();
      return { ok: false, reason: "run-too-small" };
    }

    syncKitchenRunEndClosures(groupId, backOffsetMm);
    updateLayoutPanel();
    ctx.commitHistory();
    return {
      ok: true,
      appliedValueMm: appliedLengthMm,
      clamped: Math.abs(appliedLengthMm - requestedLengthMm) > 0.01
    };
  };

  const moveKitchenRunModuleByGap = (instanceId: string, side: "before" | "after", gapMm: number) =>
    applyKitchenRunModuleEdit({ instanceId, gap: { side, valueMm: gapMm } });

  const editKitchenWorktopSegment = (args: {
    worktopId: string;
    segmentIndex: number;
    depthMm?: number;
    lengthMm?: number;
    adjacentSegmentIndex?: number;
  }): KitchenRunModuleEditResult => {
    const worktop = kitchenWorktops.find((item) => item.id === args.worktopId) ?? null;
    if (!worktop) return { ok: false, reason: "missing-run" };
    const currentStart = worktop.params.path[args.segmentIndex];
    const currentEnd = worktop.params.path[args.segmentIndex + 1];
    if (!currentStart || !currentEnd) return { ok: false, reason: "missing-run" };
    const nextParams = args.depthMm != null
      ? setKitchenWorktopSegmentDepth(worktop.params, args.segmentIndex, args.depthMm)
      : args.adjacentSegmentIndex != null && args.lengthMm != null
        ? moveKitchenWorktopSegmentByAdjacentLength(
            worktop.params,
            args.segmentIndex,
            args.adjacentSegmentIndex,
            args.lengthMm
          )
      : args.lengthMm != null
        ? resizeWorktopSegmentParams(worktop.params, args.segmentIndex, args.lengthMm)
        : null;
    if (!nextParams) return { ok: false, reason: "invalid-value" };

    const previousParams = structuredClone(worktop.params);
    const affected = instances.filter((item) => item.kitchenPlacement?.worktopId === worktop.id);
    const snapshots = affected.map((item) => ({
      item,
      position: item.root.position.clone(),
      rotationY: item.root.rotation.y,
      binding: item.kitchenPlacement ? structuredClone(item.kitchenPlacement) : null
    }));
    const rollback = () => {
      worktop.params = structuredClone(previousParams);
      ctx.rebuildKitchenWorktop(worktop);
      for (const snapshot of snapshots) {
        snapshot.item.root.position.copy(snapshot.position);
        snapshot.item.root.rotation.y = snapshot.rotationY;
        snapshot.item.kitchenPlacement = snapshot.binding ? structuredClone(snapshot.binding) : null;
        snapshot.item.root.updateMatrixWorld(true);
      }
    };

    worktop.params = nextParams;
    ctx.rebuildKitchenWorktop(worktop);
    const group = S.kitchenGroups.find((item) => item.id === worktop.kitchenGroupId) ?? null;
    const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? S.kitchenCtx.worktopBackOffsetMm;
    let applied = true;
    if (args.lengthMm != null) {
      for (const item of affected.filter((candidate) => isCornerKitchenModule(candidate))) {
        if (!item.kitchenPlacement) continue;
        applied = applyKitchenPlacementBinding(item, item.kitchenPlacement, backOffsetMm, { skipRunEndClosureSync: true }) && applied;
      }
      for (const role of ["base", "upper"] as const) {
        const runs = getKitchenRunDimensionSources(worktop.kitchenGroupId, role).filter((run) => run.worktopId === worktop.id);
        for (const run of runs) {
          const sorted = [...run.modules].sort((a, b) => a.centerMm - b.centerMm || a.id.localeCompare(b.id));
          const usableStartMm = run.reservedStartMm;
          const usableEndMm = run.lengthMm - run.reservedEndMm;
          if (sorted.reduce((sum, module) => sum + module.widthMm, 0) > usableEndMm - usableStartMm + 0.01) {
            applied = false;
            break;
          }
          let cursorMm = usableStartMm;
          const centers = new Map<string, number>();
          for (const module of sorted) {
            const centerMm = Math.max(module.centerMm, cursorMm + module.widthMm / 2);
            centers.set(module.id, centerMm);
            cursorMm = centerMm + module.widthMm / 2;
          }
          const overflowMm = Math.max(0, cursorMm - usableEndMm);
          for (const module of sorted) {
            const item = instances.find((candidate) => candidate.id === module.id) ?? null;
            const centerMm = centers.get(module.id);
            if (!item || centerMm == null) continue;
            applied = applyKitchenPlacementBinding(item, {
              worktopId: run.worktopId,
              segmentIndex: run.segmentIndex,
              offsetAlongM: (centerMm - overflowMm) / 1000
            }, backOffsetMm, { skipRunEndClosureSync: true }) && applied;
          }
        }
      }
    }
    if (!applied) {
      rollback();
      return { ok: false, reason: "run-too-small" };
    }

    syncKitchenRunEndClosures(worktop.kitchenGroupId, backOffsetMm);
    updateLayoutPanel();
    ctx.commitHistory();
    const measuredSegmentIndex = args.adjacentSegmentIndex ?? args.segmentIndex;
    const updatedStart = worktop.params.path[measuredSegmentIndex]!;
    const updatedEnd = worktop.params.path[measuredSegmentIndex + 1]!;
    const appliedValueMm = args.depthMm != null
      ? worktop.params.segmentDepthsMm?.[args.segmentIndex] ?? worktop.params.depthMm
      : Math.hypot(updatedEnd.x - updatedStart.x, updatedEnd.z - updatedStart.z);
    const requestedValueMm = args.depthMm ?? args.lengthMm ?? appliedValueMm;
    return { ok: true, appliedValueMm, clamped: Math.abs(appliedValueMm - requestedValueMm) > 0.01 };
  };

  const rebuildKitchenGroupLayout = (
    groupId: string,
    nextCtx: KitchenContext,
    prevCtx: KitchenContext = nextCtx
  ) => {
    const bindings = new Map<string, KitchenPlacementBinding>();
    const changedContextKeys = getChangedKitchenContextKeys(nextCtx, prevCtx);
    const shouldRebuildWorktops = hasAnyChangedContextKey(changedContextKeys, worktopContextKeys);

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = inst.kitchenPlacement ?? inferKitchenPlacementBinding(inst, groupId, prevCtx.worktopBackOffsetMm);
      if (!binding) continue;
      bindings.set(inst.id, { ...binding });
      inst.kitchenPlacement = { ...binding };
    }

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const modulePackage = getModulePackageForInstance(inst);
      if (!modulePackageReadsChangedKitchenContext(modulePackage, changedContextKeys)) continue;
      applyKitchenContextToModuleParams(inst.params, nextCtx, ctx.catalog, modulePackage);
      rebuildInstance(inst, { skipLayoutValidation: true, skipLayoutPanelUpdate: true, preserveBackAnchor: true });
    }

    if (shouldRebuildWorktops) rebuildKitchenGroupWorktops(groupId, nextCtx);

    for (const inst of instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const binding = bindings.get(inst.id) ?? inst.kitchenPlacement;
      if (binding && applyKitchenPlacementBinding(inst, binding, nextCtx.worktopBackOffsetMm)) continue;
      inst.kitchenPlacement = inferKitchenPlacementBinding(inst, groupId, nextCtx.worktopBackOffsetMm);
      syncKitchenRunEndClosure(inst, nextCtx.worktopBackOffsetMm);
    }

    updateLayoutPanel();
  };

  const getTallKitchenPlacementConstraint = (
    ghost: LayoutInstance,
    cursorWorld: THREE.Vector3,
    activeWorktops: KitchenWorktopInstance[],
    backOffsetMm: number
  ) => {
    if (!moduleStaysOutsideKitchenWorktop(ghost)) return null;
    const modulePackage = getModulePackageForInstance(ghost);
    const placementContext = getPreferredPlacementContext(modulePackage, ghost.params);

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);
    let cursorOnWorktop = false;
    let closestGuideDistanceSq = Number.POSITIVE_INFINITY;
    let best:
      | {
          position: THREE.Vector3;
          rotationY: number;
          distanceSq: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const polygon = getKitchenWorktopPolygon(worktop.params);
      if (polygon.length >= 3 && pointInPolygonXZ({ x: cursorWorld.x, z: cursorWorld.z }, polygon.map((point) => ({ x: point.x, z: point.z })))) {
        cursorOnWorktop = true;
      }

      const firstInfo = getKitchenGuideSegmentInfo(worktop, 0, backOffsetMm);
      const lastGuidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      const lastInfo = lastGuidePath.length >= 2 ? getKitchenGuideSegmentInfo(worktop, lastGuidePath.length - 2, backOffsetMm) : null;
      const edgeCandidates = [
        firstInfo
          ? {
              edgePoint: firstInfo.start.clone().addScaledVector(firstInfo.dir, -halfModuleWidthM),
              rotationY: firstInfo.rotationY
            }
          : null,
        lastInfo
          ? {
              edgePoint: lastInfo.start.clone().addScaledVector(lastInfo.dir, lastInfo.length + halfModuleWidthM),
              rotationY: lastInfo.rotationY
            }
          : null
      ].filter((candidate): candidate is { edgePoint: THREE.Vector3; rotationY: number } => candidate != null);

      if (firstInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(firstInfo.start).dot(firstInfo.dir), 0, firstInfo.length);
        const closestOnGuide = firstInfo.start.clone().addScaledVector(firstInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }
      if (lastInfo) {
        const projected = clampNumber(cursorWorld.clone().sub(lastInfo.start).dot(lastInfo.dir), 0, lastInfo.length);
        const closestOnGuide = lastInfo.start.clone().addScaledVector(lastInfo.dir, projected);
        closestGuideDistanceSq = Math.min(closestGuideDistanceSq, closestOnGuide.distanceToSquared(cursorWorld));
      }

      for (const candidate of edgeCandidates) {
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, candidate.rotationY, 0));
        const position = candidate.edgePoint.clone().sub(rotatedBackCenter);
        position.y = 0;
        const distanceSq = candidate.edgePoint.distanceToSquared(cursorWorld);
        if (!best || distanceSq < best.distanceSq) {
          best = {
            position,
            rotationY: candidate.rotationY,
            distanceSq
          };
        }
      }
    }

    if (!best) return null;
    if (!cursorOnWorktop && Math.sqrt(closestGuideDistanceSq) > 0.45) return null;

    const packageValidation = modulePackage
      ? validateKitchenModulePackagePlacement({
          modulePackage,
          candidate: {
            placementContext,
            hasWall: true,
            hasFloor: true,
            hasCorner: false,
            hasTwoPerpendicularWalls: false,
            touchesBothWalls: false
          }
        })
      : null;
    const validByPackage = packageValidation?.valid ?? true;
    const pinoPlacementValidation = getPinoPlacementValidation(ghost.params, placementContext);
    const vendorPlacementValidation = getVendorPlacementValidation(ghost.params, placementContext);
    const validByPino = pinoPlacementValidation?.valid ?? true;
    const validByVendor = vendorPlacementValidation?.valid ?? true;
    const pinoPlacementIssue = pinoPlacementValidation?.errors[0] ?? pinoPlacementValidation?.warnings[0] ?? null;
    const vendorPlacementIssue = vendorPlacementValidation?.errors[0] ?? vendorPlacementValidation?.warnings[0] ?? null;

    return {
      kitchenPlacement: null,
      position: best.position,
      rotationY: best.rotationY,
      valid: validByPackage && validByPino && validByVendor,
      enforceRoomBounds: true,
      enforceWallOverlap: true,
      statusText: !validByPino && pinoPlacementIssue
        ? `Placement: ${pinoPlacementIssue}`
        : !validByVendor && vendorPlacementIssue
        ? `Placement: ${vendorPlacementIssue}`
        : !validByPackage && packageValidation
        ? `Placement: ${firstPlacementError(packageValidation)}`
        : pinoPlacementIssue
        ? `Placement: ${pinoPlacementIssue}`
        : vendorPlacementIssue
        ? `Placement: ${vendorPlacementIssue}`
        : `Placement: Tall module snaps ${describePlacementTarget(placementContext)}.`
    };
  };

  const getKitchenPlacementConstraint = (ghost: LayoutInstance, cursorWorld: THREE.Vector3) => {
    if (!S.kitchenEditMode || !S.activeKitchenGroupId) return null;

    const activeWorktops = kitchenWorktops.filter((worktop) => worktop.kitchenGroupId === S.activeKitchenGroupId);
    if (activeWorktops.length === 0) return null;
    const backOffsetMm = resolveKitchenPlacementBackOffset({
      kitchenGroupId: S.activeKitchenGroupId,
      kitchenGroups: S.kitchenGroups,
      defaultWorktopBackOffsetMm: S.kitchenCtx.worktopBackOffsetMm
    });

    if (moduleStaysOutsideKitchenWorktop(ghost)) {
      return getTallKitchenPlacementConstraint(ghost, cursorWorld, activeWorktops, backOffsetMm);
    }

    if (isCornerKitchenModule(ghost)) {
      const modulePackage = getModulePackageForInstance(ghost);
      let best:
        | {
            binding: KitchenPlacementBinding;
            position: THREE.Vector3;
            rotationY: number;
            valid: boolean;
            distance: number;
          }
        | null = null;

      for (const worktop of activeWorktops) {
        const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
        for (let cornerIndex = 1; cornerIndex < guidePath.length - 1; cornerIndex += 1) {
          const info = getKitchenCornerPlacementInfo(worktop, cornerIndex, backOffsetMm, ghost);
          if (!info) continue;
          const distance = info.corner.distanceToSquared(cursorWorld);
          if (!best || distance < best.distance) {
            best = {
              binding: info.binding,
              position: info.position,
              rotationY: info.rotationY,
              valid: info.valid,
              distance
            };
          }
        }
      }

      if (!best) {
        const packageValidation = modulePackage
          ? validateKitchenModulePackagePlacement({
              modulePackage,
              candidate: {
                placementContext: "kitchen_wall",
                hasWall: true,
                hasFloor: true,
                hasCorner: false,
                hasTwoPerpendicularWalls: false,
                touchesBothWalls: false
              }
            })
          : null;
        return {
          kitchenPlacement: null,
          position: ghost.root.position.clone(),
          rotationY: ghost.root.rotation.y,
          valid: false,
          enforceRoomBounds: false,
          enforceWallOverlap: false,
          statusText: packageValidation && !packageValidation.valid
            ? `Placement: ${firstPlacementError(packageValidation)}`
            : "Placement: Corner module can be inserted only into a worktop corner."
        };
      }

      const packageValidation = modulePackage
        ? validateKitchenModulePackagePlacement({
            modulePackage,
            candidate: {
              placementContext: "kitchen_corner",
              hasWall: true,
              hasFloor: true,
              hasCorner: true,
              cornerAngleDeg: 90,
              hasTwoPerpendicularWalls: best.valid,
              touchesBothWalls: best.valid,
              snapPosition: best.position,
              snapRotation: best.rotationY
            }
          })
        : null;
      const validByPackage = packageValidation?.valid ?? true;

      return {
        kitchenPlacement: best.binding,
        position: best.position,
        rotationY: best.rotationY,
        valid: best.valid && validByPackage,
        enforceRoomBounds: false,
        enforceWallOverlap: false,
        statusText: !validByPackage && packageValidation
          ? `Placement: ${firstPlacementError(packageValidation)}`
          : best.valid
          ? "Placement: Corner module binds only to the worktop back-line corner."
        : "Placement: Corner module needs a worktop corner."
      };
    }

    const localBackCenter = getModuleLocalBackCenter(ghost);
    const halfModuleWidthM = Math.max(0.001, (ghost.localBox.max.x - ghost.localBox.min.x) * 0.5);
    const modulePackage = getModulePackageForInstance(ghost);
    const placementContext = getPreferredPlacementContext(modulePackage, ghost.params);

    let best:
      | {
          binding: KitchenPlacementBinding;
          position: THREE.Vector3;
          rotationY: number;
          valid: boolean;
          distance: number;
          cursorFrontDistance: number;
        }
      | null = null;

    for (const worktop of activeWorktops) {
      const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
      if (guidePath.length < 2) continue;

      for (let index = 0; index < guidePath.length - 1; index += 1) {
        const info = getKitchenGuideSegmentInfo(worktop, index, backOffsetMm);
        if (!info) continue;
        const reserved = getKitchenSegmentReservedMargins(S.activeKitchenGroupId, worktop.id, index, backOffsetMm, ghost.id);
        const minAlong = reserved.startM + halfModuleWidthM;
        const maxAlong = info.length - reserved.endM - halfModuleWidthM;
        if (maxAlong + 1e-6 < minAlong) continue;
        const guideStart = info.start;
        const cursorOffset = cursorWorld.clone().sub(guideStart);
        const projected = cursorOffset.dot(info.dir);
        const closestOnGuide = guideStart.clone().addScaledVector(info.dir, clampNumber(projected, 0, info.length));
        const backCenterDistance = closestOnGuide.distanceToSquared(cursorWorld);
        const cursorFrontDistance = cursorOffset.dot(info.frontNormal);
        const clampedAlongGuide = clampNumber(projected, minAlong, maxAlong);
        const backCenter = guideStart.clone().addScaledVector(info.dir, clampedAlongGuide);
        const rotatedBackCenter = localBackCenter.clone().applyEuler(new THREE.Euler(0, info.rotationY, 0));
        const position = backCenter.clone().sub(rotatedBackCenter);
        position.y = 0;

        if (
          !best ||
          backCenterDistance < best.distance - 1e-9 ||
          (Math.abs(backCenterDistance - best.distance) <= 1e-9 && cursorFrontDistance > best.cursorFrontDistance + 1e-9)
        ) {
          best = {
            binding: {
              worktopId: worktop.id,
              segmentIndex: index,
              offsetAlongM: clampedAlongGuide
            },
            position,
            rotationY: info.rotationY,
            valid: true,
            distance: backCenterDistance,
            cursorFrontDistance
          };
        }
      }
    }

    if (!best) return null;
    const packageValidation = modulePackage
      ? validateKitchenModulePackagePlacement({
          modulePackage,
          candidate: {
            placementContext,
            hasWall: true,
            hasFloor: true,
            hasCorner: false,
            hasTwoPerpendicularWalls: false,
            touchesBothWalls: false,
            snapPosition: best.position,
            snapRotation: best.rotationY
          }
        })
      : null;
    const pinoPlacementValidation = getPinoPlacementValidation(ghost.params, placementContext);
    const vendorPlacementValidation = getVendorPlacementValidation(ghost.params, placementContext);
    const validByPackage = packageValidation?.valid ?? true;
    const validByPino = pinoPlacementValidation?.valid ?? true;
    const validByVendor = vendorPlacementValidation?.valid ?? true;
    const placementIssue =
      pinoPlacementValidation?.errors[0] ??
      vendorPlacementValidation?.errors[0] ??
      packageValidation?.errors[0]?.message ??
      pinoPlacementValidation?.warnings[0] ??
      vendorPlacementValidation?.warnings[0] ??
      null;
    best.position.y = getKitchenModulePlacementY(ghost, S.activeKitchenGroupId);
    return {
      kitchenPlacement: best.binding,
      position: best.position,
      rotationY: best.rotationY,
      valid: best.valid && validByPackage && validByPino && validByVendor,
      enforceRoomBounds: false,
      enforceWallOverlap: false,
      statusText: !best.valid
        ? "Placement: module is too wide for the selected worktop segment."
        : placementIssue
        ? `Placement: ${placementIssue}`
        : placementContext === "appliance_zone"
        ? "Placement: module moves along the appliance zone aligned to the worktop back line."
        : "Placement: module moves along the back line under the worktop."
    };
  };

  return {
    clampNumber,
    normalizeAngleRad,
    getModuleLocalBackCenter,
    isCornerKitchenModule,
    moduleStaysOutsideKitchenWorktop,
    getKitchenModulePlacementY,
    getModuleLocalKitchenCornerAnchor,
    getModuleLocalKitchenCornerAxisAnchor,
    getModuleKitchenCornerExtents,
    getModuleLocalKitchenAnchor,
    getModuleWorldKitchenAnchor,
    preserveWorldKitchenAnchor,
    getAssociativeMeasureContext,
    bindingFromPlanSnap,
    snapPoint2D,
    getKitchenGuideSegmentInfo,
    getKitchenCornerPlacementInfo,
    getKitchenCornerArmBindingInfo,
    getKitchenSegmentReservedMargins,
    inferKitchenPlacementBinding,
    applyKitchenPlacementBinding,
    syncKitchenRunEndClosure,
    syncKitchenRunEndClosures,
    getKitchenRunDimensionSources,
    resizeKitchenRunModule,
    resizeKitchenCornerArm,
    moveKitchenRunModuleByGap,
    editKitchenWorktopSegment,
    rebuildKitchenGroupLayout,
    getTallKitchenPlacementConstraint,
    getKitchenPlacementConstraint,
    setMeasureStateRef: (next: Pick<MeasureState, "measures">) => { measureStateRef = next; }
  };
}
