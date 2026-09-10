import * as THREE from "three";
import type { AppState, LayoutInstance } from "../layout/appState";
import { refreshModuleKitchenPlacement, type KitchenPlacementGroupContext } from "./moduleKitchenPlacement";
import { POINTER_DRAG_THRESHOLD_PX } from "./snapToolProfiles";
import type { ModuleAdjacencyLink } from "./moduleAdjacency";

export type ModuleDragTransform = {
  position: THREE.Vector3;
  rotationY: number;
  kitchenPlacement: LayoutInstance["kitchenPlacement"];
  kitchenGroupId: LayoutInstance["kitchenGroupId"];
};

export type PointerModuleDragGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  plane: THREE.Plane;
  original: ModuleDragTransform;
  lastValid: ModuleDragTransform;
  valid: boolean;
  snap: ModuleAdjacencyLink | null;
};

export type PointerModuleDragState = {
  active: boolean;
  id: string | null;
  offset: THREE.Vector3;
  lastValid: THREE.Vector3;
  gesture?: PointerModuleDragGesture;
};

export function createPointerModuleDragState(): PointerModuleDragState {
  return { active: false, id: null, offset: new THREE.Vector3(), lastValid: new THREE.Vector3() };
}

export function captureModuleDragTransform(instance: LayoutInstance): ModuleDragTransform {
  return {
    position: instance.root.position.clone(),
    rotationY: instance.root.rotation.y,
    kitchenPlacement: instance.kitchenPlacement ? structuredClone(instance.kitchenPlacement) : instance.kitchenPlacement,
    kitchenGroupId: instance.kitchenGroupId,
  };
}

export function restoreModuleDragTransform(instance: LayoutInstance, snapshot: ModuleDragTransform) {
  instance.root.position.copy(snapshot.position);
  instance.root.rotation.y = snapshot.rotationY;
  instance.kitchenPlacement = snapshot.kitchenPlacement ? structuredClone(snapshot.kitchenPlacement) : snapshot.kitchenPlacement;
  instance.kitchenGroupId = snapshot.kitchenGroupId;
  instance.root.updateMatrixWorld(true);
}

export function beginPointerModuleDrag(args: {
  state: PointerModuleDragState;
  instance: LayoutInstance;
  ray: THREE.Ray;
  pointerId: number;
  clientX: number;
  clientY: number;
  grabHeight: number;
}) {
  if (args.state.gesture || args.state.active) return false;
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -args.grabHeight);
  const hit = args.ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return false;
  const original = captureModuleDragTransform(args.instance);
  args.state.id = args.instance.id;
  args.state.offset.copy(hit).sub(original.position);
  args.state.lastValid.copy(original.position);
  args.state.gesture = {
    pointerId: args.pointerId, startX: args.clientX, startY: args.clientY,
    plane, original, lastValid: captureModuleDragTransform(args.instance), valid: true, snap: null,
  };
  return true;
}

export function activatePointerModuleDrag(state: PointerModuleDragState, event: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">) {
  const gesture = state.gesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return false;
  if (!state.active && Math.abs(event.clientX - gesture.startX) < POINTER_DRAG_THRESHOLD_PX
      && Math.abs(event.clientY - gesture.startY) < POINTER_DRAG_THRESHOLD_PX) return false;
  state.active = true;
  return true;
}

export function finishModuleDragGesture(state: PointerModuleDragState, instance: LayoutInstance | null, cancel = false) {
  const gesture = state.gesture;
  if (!gesture) return { handled: false, changed: false };
  const changed = !!instance && state.active && !cancel && gesture.valid
    && (instance.root.position.distanceToSquared(gesture.original.position) > 1e-12
      || Math.abs(instance.root.rotation.y - gesture.original.rotationY) > 1e-8);
  if (instance && !changed) restoreModuleDragTransform(instance, gesture.original);
  state.active = false;
  state.id = null;
  delete state.gesture;
  return { handled: true, changed };
}

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

  const previousRotation = inst.root.rotation.y;
  const previousBinding = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;

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
  const pushed = params.dragState.gesture ? [] : params.nudgePinnedModuleChain(inst, inst.root.position.clone().sub(prevPos));
  if (params.anyOverlap(inst, null) || params.moduleOverlapsWalls(inst) || params.moduleOverlapsKitchenWorktops(inst)) {
    rollbackPointerModuleDragOverlap({
      instance: inst,
      lastValid: params.dragState.lastValid,
      pushed,
      findInstance: params.findInstance
    });
    inst.root.rotation.y = previousRotation;
    inst.kitchenPlacement = previousBinding;
    if (params.dragState.gesture) {
      restoreModuleDragTransform(inst, params.dragState.gesture.lastValid);
      params.dragState.gesture.valid = false;
      params.dragState.gesture.snap = null;
    }
    inst.root.updateMatrixWorld(true);
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
  if (params.dragState.gesture) {
    params.dragState.gesture.lastValid = captureModuleDragTransform(inst);
    params.dragState.gesture.valid = true;
  }
  params.updateLayoutPanel();
  return true;
}
