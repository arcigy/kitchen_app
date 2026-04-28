import * as THREE from "three";
import type { LayoutInstance } from "./localTypes";
import type { ModuleParams } from "../model/cabinetTypes";

export function createInstanceRebuilder(ctx: any) {
  function rebuildInstance(
    inst: LayoutInstance,
    opts?: { skipLayoutValidation?: boolean; preserveBackAnchor?: boolean; previousParams?: ModuleParams; sourceKey?: string }
  ) {
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
    const prevWorldBox = ctx.instanceWorldBox(inst);
    const prevAdjacencyInfos = ctx.collectAdjacentModuleInfos(inst, prevWorldBox);
    const resizeAnchorSide = ctx.chooseResizeAnchorSide(inst, prevAdjacencyInfos) ?? ctx.inferTallResizeAnchorSide(inst);
    const prevPos = inst.root.position.clone();
    const prevKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
    const prevLocalAnchor = ctx.getModuleLocalKitchenAnchor(inst).clone();
    const prevWorldAnchor = prevLocalAnchor.clone().applyMatrix4(inst.root.matrixWorld);
    const prevModule = inst.module;
    const prevBox = inst.localBox.clone();
    const prevNeighborPositions = new Map<string, THREE.Vector3>();
    const prevWorldBoxesById = new Map<string, THREE.Box3>();
    for (const other of ctx.instances) {
      if (other.id === inst.id) continue;
      prevNeighborPositions.set(other.id, other.root.position.clone());
      prevWorldBoxesById.set(other.id, ctx.instanceWorldBox(other).clone());
    }
    prevWorldBoxesById.set(inst.id, prevWorldBox.clone());

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
    const keepRootPositionStable = ctx.footprintExtentsMatchXZ(prevWorldBox, ctx.instanceWorldBox(inst));
    if (!opts?.skipLayoutValidation && !keepRootPositionStable) ctx.preserveAnchoredResizeSide(inst, prevWorldBox, resizeAnchorSide);
    if (opts?.preserveBackAnchor) {
      ctx.preserveWorldKitchenAnchor(inst, prevWorldAnchor);
    } else if (keepRootPositionStable) {
      inst.root.position.copy(prevPos);
      inst.root.updateMatrixWorld(true);
    }

    if (!opts?.skipLayoutValidation && !opts?.preserveBackAnchor) {
      const clamped = ctx.applyWallConstraints(inst, inst.root.position.clone());
      inst.root.position.copy(clamped);
    }
    const propagated = opts?.skipLayoutValidation
      ? { ok: true, movedIds: [] as string[] }
      : ctx.isCornerKitchenModule(inst)
        ? ctx.propagateCornerResizeToPinnedNeighbors(inst, previousParams)
        : ctx.propagateModuleResizeToPinnedNeighbors(inst, prevWorldBox, prevWorldBoxesById);

    const inRoom = opts?.skipLayoutValidation ? true : ctx.instanceFitsLayoutBounds(inst);
    const overlapsModules = opts?.skipLayoutValidation ? false : ctx.anyOverlap(inst, null);
    const overlapsWalls = opts?.skipLayoutValidation ? false : ctx.moduleOverlapsWalls(inst);
    const overlapsWorktops = opts?.skipLayoutValidation ? false : ctx.moduleOverlapsKitchenWorktops(inst);
    const overlaps = overlapsModules || overlapsWalls || overlapsWorktops;
    const movedNeighborInvalid =
      !opts?.skipLayoutValidation &&
      propagated.movedIds.some((id: string) => {
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
    if (inst.kitchenGroupId) {
      const group = ctx.S.kitchenGroups.find((item: { id: string; ctx: any }) => item.id === inst.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
      inst.kitchenPlacement = ctx.inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
    }
    for (const neighborId of propagated.movedIds) {
      const neighbor = ctx.findInstance(neighborId);
      if (!neighbor?.kitchenGroupId) continue;
      const group = ctx.S.kitchenGroups.find((item: { id: string; ctx: any }) => item.id === neighbor.kitchenGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
      neighbor.kitchenPlacement = ctx.inferKitchenPlacementBinding(neighbor, neighbor.kitchenGroupId, backOffsetMm);
    }
    ctx.updateLayoutPanel();
    return true;
  }

  return { rebuildInstance };
}
