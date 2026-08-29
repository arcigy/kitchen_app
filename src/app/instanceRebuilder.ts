import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { KitchenPlacementBinding, LayoutInstance } from "./localTypes";
import type { ModuleParams } from "../model/cabinetTypes";
import type { AdjacentModuleInfo } from "./modulePlacementHelpers";
import { refreshModuleKitchenPlacement } from "./moduleKitchenPlacement";

type ResizeAnchorSide = "left" | "right" | "front" | "back";

export type RebuildDebugState = {
  ok: boolean;
  stage: string;
  errors?: string[];
  keepRootPositionStable?: boolean;
  resizeAnchorSide?: ResizeAnchorSide | null;
  prevWorldBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  nextWorldBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  inRoom?: boolean;
  overlapsModules?: boolean;
  overlapsWalls?: boolean;
  overlapsWorktops?: boolean;
  movedNeighborInvalid?: boolean;
  propagatedMovedIds?: string[];
} | null;

type InstanceRebuilderContext = {
  S: AppState;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  applyWallConstraints: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  args: { errorsEl: HTMLElement };
  buildModule: (params: ModuleParams) => THREE.Group;
  chooseResizeAnchorSide: (inst: LayoutInstance, infos: AdjacentModuleInfo[]) => ResizeAnchorSide | null;
  collectAdjacentModuleInfos: (inst: LayoutInstance, referenceBox: THREE.Box3) => AdjacentModuleInfo[];
  disposeObject3D: (obj: THREE.Object3D) => void;
  ensurePickAndOutline: (inst: LayoutInstance) => void;
  findInstance: (id: string) => LayoutInstance | null;
  footprintExtentsMatchXZ: (a: THREE.Box3, b: THREE.Box3) => boolean;
  getModuleLocalKitchenAnchor: (inst: LayoutInstance) => THREE.Vector3;
  inferKitchenPlacementBinding: (inst: LayoutInstance, groupId: string, backOffsetMm: number) => KitchenPlacementBinding | null;
  inferTallResizeAnchorSide: (inst: LayoutInstance) => ResizeAnchorSide | null;
  instanceFitsLayoutBounds: (inst: LayoutInstance) => boolean;
  instanceWorldBox: (inst: LayoutInstance) => THREE.Box3;
  instances: LayoutInstance[];
  isCornerKitchenModule: (inst: LayoutInstance) => boolean;
  lastRebuildDebug: RebuildDebugState;
  moduleOverlapsKitchenWorktops: (inst: LayoutInstance) => boolean;
  moduleOverlapsWalls: (inst: LayoutInstance) => boolean;
  moduleRootLocalBox: (root: THREE.Object3D, module: THREE.Object3D) => THREE.Box3;
  normalizeModuleParamsForSource: (params: ModuleParams, sourceKey?: string) => ModuleParams;
  preserveAnchoredResizeSide: (inst: LayoutInstance, prevWorldBox: THREE.Box3, anchorSide: ResizeAnchorSide | null) => void;
  preserveWorldKitchenAnchor: (inst: LayoutInstance, anchor: THREE.Vector3) => void;
  propagateCornerResizeToPinnedNeighbors: (inst: LayoutInstance, previousParams: ModuleParams) => { movedIds: string[] };
  propagateModuleResizeToPinnedNeighbors: (
    inst: LayoutInstance,
    prevWorldBox: THREE.Box3,
    prevBoxesById?: Map<string, THREE.Box3>
  ) => { movedIds: string[] };
  rebuildWallPlanMesh?: () => void;
  rebuildKitchenGroupWorktops?: (groupId: string, kitchenCtx?: AppState["kitchenCtx"]) => void;
  renderErrors: (errorsEl: HTMLElement, errors: string[]) => void;
  tagModuleGeometry: (module: THREE.Object3D, instanceId: string) => void;
  syncKitchenRunEndClosures?: (groupId: string, backOffsetMm?: number) => boolean;
  updateLayoutPanel: () => void;
  validateModule: (params: ModuleParams) => string[];
};

export function createInstanceRebuilder(ctx: InstanceRebuilderContext) {
  const rebuildingKitchenWorktops = new Set<string>();

  function rebuildInstance(
    inst: LayoutInstance,
    opts?: {
      skipLayoutValidation?: boolean;
      skipLayoutPanelUpdate?: boolean;
      preserveBackAnchor?: boolean;
      previousParams?: ModuleParams;
      sourceKey?: string;
    }
  ) {
    const shouldValidateLayout = !opts?.skipLayoutValidation;
    ctx.lastRebuildDebug = null;
    const normalizedParams = ctx.normalizeModuleParamsForSource(structuredClone(inst.params), opts?.sourceKey);
    const errors = ctx.validateModule(normalizedParams);
    ctx.renderErrors(ctx.args.errorsEl, errors);
    if (errors.length > 0) {
      ctx.lastRebuildDebug = { ok: false, stage: "validate", errors: structuredClone(errors) };
      return false;
    }

    const previousParams = structuredClone(opts?.previousParams ?? inst.params);
    inst.params = previousParams;
    const prevWorldBox = shouldValidateLayout ? ctx.instanceWorldBox(inst) : new THREE.Box3();
    const prevAdjacencyInfos = shouldValidateLayout ? ctx.collectAdjacentModuleInfos(inst, prevWorldBox) : [];
    const resizeAnchorSide = shouldValidateLayout
      ? ctx.chooseResizeAnchorSide(inst, prevAdjacencyInfos) ?? ctx.inferTallResizeAnchorSide(inst)
      : null;
    const prevPos = inst.root.position.clone();
    const prevKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
    const prevLocalAnchor = ctx.getModuleLocalKitchenAnchor(inst).clone();
    const prevWorldAnchor = prevLocalAnchor.clone().applyMatrix4(inst.root.matrixWorld);
    const prevModule = inst.module;
    const prevBox = inst.localBox.clone();
    const prevNeighborPositions = new Map<string, THREE.Vector3>();
    const prevWorldBoxesById = new Map<string, THREE.Box3>();
    if (shouldValidateLayout) {
      for (const other of ctx.instances) {
        if (other.id === inst.id) continue;
        prevNeighborPositions.set(other.id, other.root.position.clone());
        prevWorldBoxesById.set(other.id, ctx.instanceWorldBox(other).clone());
      }
      prevWorldBoxesById.set(inst.id, prevWorldBox.clone());
    }

    inst.params = normalizedParams;

    const next = ctx.buildModule(inst.params);
    next.name = `moduleGeom_${inst.id}`;
    ctx.tagModuleGeometry(next, inst.id);

    inst.root.remove(prevModule);
    inst.module = next;
    inst.root.add(inst.module);
    inst.localBox = ctx.moduleRootLocalBox(inst.root, inst.module);
    if (opts?.preserveBackAnchor) {
      const nextLocalAnchor = ctx.getModuleLocalKitchenAnchor(inst);
      const delta = prevLocalAnchor.clone().sub(nextLocalAnchor);
      inst.module.position.add(delta);
      inst.localBox = ctx.moduleRootLocalBox(inst.root, inst.module);
    }
    ctx.ensurePickAndOutline(inst);
    const keepRootPositionStable = shouldValidateLayout && ctx.footprintExtentsMatchXZ(prevWorldBox, ctx.instanceWorldBox(inst));
    if (shouldValidateLayout && !keepRootPositionStable) ctx.preserveAnchoredResizeSide(inst, prevWorldBox, resizeAnchorSide);
    if (opts?.preserveBackAnchor) {
      ctx.preserveWorldKitchenAnchor(inst, prevWorldAnchor);
    } else if (keepRootPositionStable) {
      inst.root.position.copy(prevPos);
      inst.root.updateMatrixWorld(true);
    }

    if (shouldValidateLayout && !opts?.preserveBackAnchor) {
      const clamped = ctx.applyWallConstraints(inst, inst.root.position.clone());
      inst.root.position.copy(clamped);
    }
    const propagated = !shouldValidateLayout
      ? { ok: true, movedIds: [] as string[] }
      : ctx.isCornerKitchenModule(inst)
        ? ctx.propagateCornerResizeToPinnedNeighbors(inst, previousParams)
        : ctx.propagateModuleResizeToPinnedNeighbors(inst, prevWorldBox, prevWorldBoxesById);

    const inRoom = shouldValidateLayout ? ctx.instanceFitsLayoutBounds(inst) : true;
    const overlapsModules = shouldValidateLayout ? ctx.anyOverlap(inst, null) : false;
    const overlapsWalls = shouldValidateLayout ? ctx.moduleOverlapsWalls(inst) : false;
    const overlapsWorktops = shouldValidateLayout ? ctx.moduleOverlapsKitchenWorktops(inst) : false;
    const overlaps = overlapsModules || overlapsWalls || overlapsWorktops;
    const movedNeighborInvalid =
      shouldValidateLayout &&
      propagated.movedIds.some((id) => {
        const other = ctx.findInstance(id);
        return !!other &&
          (!ctx.instanceFitsLayoutBounds(other) ||
            ctx.anyOverlap(other, null) ||
            ctx.moduleOverlapsWalls(other) ||
            ctx.moduleOverlapsKitchenWorktops(other));
      });
    ctx.lastRebuildDebug = {
      ok: inRoom && !overlaps && !movedNeighborInvalid,
      stage: inRoom && !overlaps && !movedNeighborInvalid ? "success" : "layoutValidation",
      keepRootPositionStable,
      resizeAnchorSide,
      prevWorldBox: {
        min: { x: prevWorldBox.min.x, y: prevWorldBox.min.y, z: prevWorldBox.min.z },
        max: { x: prevWorldBox.max.x, y: prevWorldBox.max.y, z: prevWorldBox.max.z }
      },
      nextWorldBox: (() => {
        const nextWorldBox = ctx.instanceWorldBox(inst);
        return {
          min: { x: nextWorldBox.min.x, y: nextWorldBox.min.y, z: nextWorldBox.min.z },
          max: { x: nextWorldBox.max.x, y: nextWorldBox.max.y, z: nextWorldBox.max.z }
        };
      })(),
      inRoom,
      overlapsModules,
      overlapsWalls,
      overlapsWorktops,
      movedNeighborInvalid,
      propagatedMovedIds: [...propagated.movedIds]
    };
    if (!inRoom || overlaps || movedNeighborInvalid) {
      // Revert (layout must never allow overlaps)
      inst.params = previousParams;
      inst.root.remove(inst.module);
      ctx.disposeObject3D(inst.module);
      inst.module = prevModule;
      ctx.tagModuleGeometry(inst.module, inst.id);
      inst.localBox = prevBox;
      inst.root.position.copy(prevPos);
      inst.kitchenPlacement = prevKitchenPlacement ? structuredClone(prevKitchenPlacement) : null;
      inst.root.add(inst.module);
      for (const other of ctx.instances) {
        if (other.id === inst.id) continue;
        const prev = prevNeighborPositions.get(other.id);
        if (prev) other.root.position.copy(prev);
      }
      ctx.ensurePickAndOutline(inst);
      ctx.renderErrors(ctx.args.errorsEl, [
        !inRoom
          ? "Module doesn't fit inside the room bounds in layout mode."
          : overlaps || movedNeighborInvalid
            ? "Module overlaps wall/another module in layout mode."
            : "Module invalid in layout mode."
      ]);
      return false;
    }

    ctx.disposeObject3D(prevModule);
    refreshModuleKitchenPlacement({
      instance: inst,
      kitchenGroups: ctx.S.kitchenGroups,
      defaultWorktopBackOffsetMm: ctx.S.kitchenCtx.worktopBackOffsetMm,
      inferKitchenPlacementBinding: ctx.inferKitchenPlacementBinding
    });
    for (const neighborId of propagated.movedIds) {
      const neighbor = ctx.findInstance(neighborId);
      if (!neighbor) continue;
      refreshModuleKitchenPlacement({
        instance: neighbor,
        kitchenGroups: ctx.S.kitchenGroups,
        defaultWorktopBackOffsetMm: ctx.S.kitchenCtx.worktopBackOffsetMm,
        inferKitchenPlacementBinding: ctx.inferKitchenPlacementBinding
      });
    }
    const affectedKitchenGroups = new Set<string>();
    if (inst.kitchenGroupId) affectedKitchenGroups.add(inst.kitchenGroupId);
    for (const neighborId of propagated.movedIds) {
      const neighbor = ctx.findInstance(neighborId);
      if (neighbor?.kitchenGroupId) affectedKitchenGroups.add(neighbor.kitchenGroupId);
    }
    for (const groupId of affectedKitchenGroups) ctx.syncKitchenRunEndClosures?.(groupId);
    for (const groupId of affectedKitchenGroups) {
      if (!ctx.rebuildKitchenGroupWorktops || rebuildingKitchenWorktops.has(groupId)) continue;
      rebuildingKitchenWorktops.add(groupId);
      try {
        const kitchenCtx = ctx.S.kitchenGroups.find((group) => group.id === groupId)?.ctx ?? ctx.S.kitchenCtx;
        ctx.rebuildKitchenGroupWorktops(groupId, kitchenCtx);
      } finally {
        rebuildingKitchenWorktops.delete(groupId);
      }
    }
    if (!opts?.skipLayoutPanelUpdate) ctx.updateLayoutPanel();
    return true;
  }

  return { rebuildInstance };
}
