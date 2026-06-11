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
};

export function updateModuleDragFromGroundHit(params: UpdateModuleDragFromGroundHitParams): boolean {
  const instanceId = params.dragState.id;
  if (!instanceId || !params.hitPoint) return false;

  const inst = params.findInstance(instanceId);
  if (!inst) return false;

  const desired = new THREE.Vector3(
    params.hitPoint.x - params.dragState.offset.x,
    inst.root.position.y,
    params.hitPoint.z - params.dragState.offset.z
  );
  const desiredInRoom = params.applyWallConstraints(inst, desired);
  const snapped = params.snapPosition(inst, desiredInRoom);
  const finalPos = params.applyWallConstraints(inst, snapped);

  const prevPos = inst.root.position.clone();
  inst.root.position.copy(finalPos);
  params.autoOrientModuleToRoomWallIfSnapped(inst);
  const pushed = params.nudgePinnedModuleChain(inst, inst.root.position.clone().sub(prevPos));
  if (params.anyOverlap(inst, null) || params.moduleOverlapsWalls(inst) || params.moduleOverlapsKitchenWorktops(inst)) {
    inst.root.position.copy(params.dragState.lastValid);
    for (const item of pushed) {
      const neighbor = params.findInstance(item.id);
      if (!neighbor) continue;
      neighbor.root.position.copy(item.prev);
    }
    return true;
  }

  refreshModuleKitchenPlacement({
    instance: inst,
    kitchenGroups: params.kitchenGroups,
    defaultWorktopBackOffsetMm: params.defaultWorktopBackOffsetMm,
    inferKitchenPlacementBinding: params.inferKitchenPlacementBinding
  });
  for (const item of pushed) {
    const neighbor = params.findInstance(item.id);
    if (!neighbor) continue;
    refreshModuleKitchenPlacement({
      instance: neighbor,
      kitchenGroups: params.kitchenGroups,
      defaultWorktopBackOffsetMm: params.defaultWorktopBackOffsetMm,
      inferKitchenPlacementBinding: params.inferKitchenPlacementBinding
    });
  }
  params.dragState.lastValid.copy(inst.root.position);
  params.updateLayoutPanel();
  return true;
}
