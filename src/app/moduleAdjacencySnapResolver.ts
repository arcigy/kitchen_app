import * as THREE from "three";
import type { KitchenPlacementBinding, LayoutInstance } from "./localTypes";

export function createModuleAdjacencySnapResolver(ctx: any) {
  function resolveModuleAdjacencySnap(
    moving: LayoutInstance,
    desired: THREE.Vector3,
    opts?: { stickyNeighborId?: string | null; preferredKitchenPlacement?: KitchenPlacementBinding | null }
  ) {
    if (ctx.isCornerKitchenModule(moving)) return null;
    const prevGroupId = moving.kitchenGroupId;
    if (!moving.kitchenGroupId && ctx.S.kitchenEditMode && ctx.S.activeKitchenGroupId) moving.kitchenGroupId = ctx.S.activeKitchenGroupId;
    const effectiveGroupId = moving.kitchenGroupId ?? (ctx.S.kitchenEditMode ? ctx.S.activeKitchenGroupId : null);
    const result = ctx.snapPositionDetailed(moving, desired, {
      stickyNeighborId: opts?.stickyNeighborId ?? null,
      snapDistanceM: effectiveGroupId ? 2.4 : undefined,
      enforceWallConstraints: !effectiveGroupId,
      enforceWallOverlap: !effectiveGroupId
    });
    moving.kitchenGroupId = prevGroupId;
    let kitchenPlacement: KitchenPlacementBinding | null = null;
    let snappedPosition = result.position.clone();
    let snappedRotationY = moving.root.rotation.y;
    if (effectiveGroupId) {
      const group = ctx.S.kitchenGroups.find((item: { id: string }) => item.id === effectiveGroupId) ?? null;
      const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
      const prevPos = moving.root.position.clone();
      const prevRot = moving.root.rotation.y;
      const prevKitchenPlacement = moving.kitchenPlacement ? structuredClone(moving.kitchenPlacement) : null;
      const projectedBinding = opts?.preferredKitchenPlacement ?? null;
      if (projectedBinding) {
        moving.kitchenPlacement = structuredClone(projectedBinding);
        if (ctx.applyKitchenPlacementBinding(moving, projectedBinding, backOffsetMm)) {
          const desiredBackCenter = ctx.getModuleLocalBackCenter(moving).clone().applyMatrix4(
            new THREE.Matrix4().makeRotationY(moving.root.rotation.y).setPosition(result.position)
          );
          const worktop = ctx.kitchenWorktops.find((item: { id: string }) => item.id === projectedBinding.worktopId) ?? null;
          const segmentInfo =
            worktop && (projectedBinding.kind ?? "segment") !== "corner"
              ? ctx.getKitchenGuideSegmentInfo(worktop, projectedBinding.segmentIndex, backOffsetMm)
              : null;
          if (segmentInfo) {
            const halfModuleWidthM = Math.max(0.001, (moving.localBox.max.x - moving.localBox.min.x) * 0.5);
            const projected = desiredBackCenter.clone().sub(segmentInfo.start).dot(segmentInfo.dir);
            const usableLength = segmentInfo.length - halfModuleWidthM * 2;
            const clampedAlong =
              usableLength >= 0
                ? ctx.clampNumber(projected, halfModuleWidthM, segmentInfo.length - halfModuleWidthM)
                : segmentInfo.length * 0.5;
            kitchenPlacement = {
              worktopId: projectedBinding.worktopId,
              segmentIndex: projectedBinding.segmentIndex,
              offsetAlongM: clampedAlong
            };
            if (ctx.applyKitchenPlacementBinding(moving, kitchenPlacement, backOffsetMm)) {
              snappedPosition = moving.root.position.clone();
              snappedRotationY = moving.root.rotation.y;
            }
          } else {
            kitchenPlacement = moving.kitchenPlacement ? structuredClone(moving.kitchenPlacement) : null;
            snappedPosition = moving.root.position.clone();
            snappedRotationY = moving.root.rotation.y;
          }
        }
      }
      if (!kitchenPlacement) {
        moving.root.position.copy(result.position);
        moving.root.rotation.y = prevRot;
        moving.root.updateMatrixWorld(true);
        kitchenPlacement = ctx.inferKitchenPlacementBinding(moving, effectiveGroupId, backOffsetMm);
        if (kitchenPlacement && ctx.applyKitchenPlacementBinding(moving, kitchenPlacement, backOffsetMm)) {
          snappedPosition = moving.root.position.clone();
          snappedRotationY = moving.root.rotation.y;
        }
      }
      moving.root.position.copy(prevPos);
      moving.root.rotation.y = prevRot;
      moving.kitchenPlacement = prevKitchenPlacement;
      moving.root.updateMatrixWorld(true);
    }
    return {
      position: snappedPosition,
      rotationY: snappedRotationY,
      link: result.link,
      kitchenPlacement
    };
  }

  return { resolveModuleAdjacencySnap };
}
