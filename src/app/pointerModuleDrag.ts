import * as THREE from "three";
import type { AppState, LayoutInstance } from "../layout/appState";
import { refreshModuleKitchenPlacement, type KitchenPlacementGroupContext } from "./moduleKitchenPlacement";

export type PointerModuleDragState = {
  active: boolean;
  id: string | null;
  offset: THREE.Vector3;
  lastValid: THREE.Vector3;
};

type PushedModuleSnapshot = {
  id: string;
  prev: THREE.Vector3;
};

type UpdateModuleDragFromGroundHitParams = {
  dragState: PointerModuleDragState;
  hitPoint: THREE.Vector3 | null;
  findInstance: (id: string) => LayoutInstance | null;
  applyWallConstraints: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  snapPosition: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  autoOrientModuleToRoomWallIfSnapped: (instance: LayoutInstance) => void;
  nudgePinnedModuleChain: (instance: LayoutInstance, delta: THREE.Vector3) => PushedModuleSnapshot[];
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (instance: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (instance: LayoutInstance) => boolean;
  kitchenGroups: KitchenPlacementGroupContext[];
  defaultWorktopBackOffsetMm: number;
  inferKitchenPlacementBinding: (instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
  updateLayoutPanel: () => void;
  isModuleAlignLocked?: (id: string) => boolean;
};

type ResolvePointerModuleDragFinalPositionParams = {
  dragState: Pick<PointerModuleDragState, "offset">;
  hitPoint: THREE.Vector3;
  instance: LayoutInstance;
  applyWallConstraints: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  snapPosition: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
};

type RollbackPointerModuleDragOverlapParams = {
  instance: LayoutInstance;
  lastValid: THREE.Vector3;
  pushed: PushedModuleSnapshot[];
  findInstance: (id: string) => LayoutInstance | null;
};

type RefreshPointerModuleDragKitchenPlacementParams = {
  instance: LayoutInstance;
  pushed: PushedModuleSnapshot[];
  findInstance: (id: string) => LayoutInstance | null;
  kitchenGroups: KitchenPlacementGroupContext[];
  defaultWorktopBackOffsetMm: number;
  inferKitchenPlacementBinding: (instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => LayoutInstance["kitchenPlacement"];
};

export function resolvePointerModuleDragFinalPosition(params: ResolvePointerModuleDragFinalPositionParams): THREE.Vector3 {
  const desired = new THREE.Vector3(
    params.hitPoint.x - params.dragState.offset.x,
    params.instance.root.position.y,
    params.hitPoint.z - params.dragState.offset.z
  );
  const desiredInRoom = params.applyWallConstraints(params.instance, desired);
  const snapped = params.snapPosition(params.instance, desiredInRoom);
  return params.applyWallConstraints(params.instance, snapped);
}

export function rollbackPointerModuleDragOverlap(params: RollbackPointerModuleDragOverlapParams): void {
  params.instance.root.position.copy(params.lastValid);
  for (const item of params.pushed) {
    const neighbor = params.findInstance(item.id);
    if (!neighbor) continue;
    neighbor.root.position.copy(item.prev);
  }
}

export function refreshPointerModuleDragKitchenPlacement(params: RefreshPointerModuleDragKitchenPlacementParams): void {
  if (params.instance.kitchenPlacement) {
    refreshModuleKitchenPlacement({
      instance: params.instance,
      kitchenGroups: params.kitchenGroups,
      defaultWorktopBackOffsetMm: params.defaultWorktopBackOffsetMm,
      inferKitchenPlacementBinding: params.inferKitchenPlacementBinding
    });
  }
  for (const item of params.pushed) {
    const neighbor = params.findInstance(item.id);
    if (!neighbor) continue;
    if (!neighbor.kitchenPlacement) continue;
    refreshModuleKitchenPlacement({
      instance: neighbor,
      kitchenGroups: params.kitchenGroups,
      defaultWorktopBackOffsetMm: params.defaultWorktopBackOffsetMm,
      inferKitchenPlacementBinding: params.inferKitchenPlacementBinding
    });
  }
}

export function updateModuleDragFromGroundHit(params: UpdateModuleDragFromGroundHitParams): boolean {
  const instanceId = params.dragState.id;
  if (!instanceId || !params.hitPoint) return false;

  const inst = params.findInstance(instanceId);
  if (!inst) return false;
  if (params.isModuleAlignLocked?.(instanceId)) return true;

  const finalPos = resolvePointerModuleDragFinalPosition({
    dragState: params.dragState,
    hitPoint: params.hitPoint,
    instance: inst,
    applyWallConstraints: params.applyWallConstraints,
    snapPosition: params.snapPosition
  });

  const prevPos = inst.root.position.clone();
  inst.root.position.copy(finalPos);
  params.autoOrientModuleToRoomWallIfSnapped(inst);
  const pushed = params.nudgePinnedModuleChain(inst, inst.root.position.clone().sub(prevPos));
  if (params.anyOverlap(inst, null) || params.moduleOverlapsWalls(inst) || params.moduleOverlapsKitchenWorktops(inst)) {
    rollbackPointerModuleDragOverlap({
      instance: inst,
      lastValid: params.dragState.lastValid,
      pushed,
      findInstance: params.findInstance
    });
    return true;
  }

  refreshPointerModuleDragKitchenPlacement({
    instance: inst,
    pushed,
    findInstance: params.findInstance,
    kitchenGroups: params.kitchenGroups,
    defaultWorktopBackOffsetMm: params.defaultWorktopBackOffsetMm,
    inferKitchenPlacementBinding: params.inferKitchenPlacementBinding
  });
  params.dragState.lastValid.copy(inst.root.position);
  params.updateLayoutPanel();
  return true;
}
