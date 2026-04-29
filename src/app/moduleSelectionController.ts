import * as THREE from "three";
import { pointInPolygonXZ, worldToScreen } from "./sharedUtils";
import { getModulePlanPolygon } from "./planSnap";
import type { LayoutInstance } from "./localTypes";

type KitchenGroupLookup = {
  id: string;
};

type KitchenModeSelectionApi = {
  filterSelectableInstanceId: (id: string) => string | null;
  findKitchenGroup: (id: string) => KitchenGroupLookup | null;
};

type ModuleDragState = {
  active: boolean;
  id: string | null;
  offset: THREE.Vector3;
  lastValid: THREE.Vector3;
};

type MarqueeState = {
  active: boolean;
  pending: boolean;
  pointerId: number | null;
  hitSomething: boolean;
};

type ModuleSelectionControllerContext = {
  instances: LayoutInstance[];
  pinnedInstanceIds: Set<string>;
  raycaster: THREE.Raycaster;
  groundPlane: THREE.Plane;
  renderer: THREE.WebGLRenderer;
  dragState: ModuleDragState;
  marquee: MarqueeState;
  marqueeEl: HTMLElement;
  findInstance: (id: string) => LayoutInstance | null;
  getCamera: () => THREE.Camera;
  getMode: () => string;
  getViewMode: () => string;
  getKitchenEditMode: () => boolean;
  getKitchenMode: () => KitchenModeSelectionApi | null;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  setSelectedKitchenGroup: (groupId: string | null) => void;
  setSelectedModule: (id: string | null) => void;
};

export function createModuleSelectionController(ctx: ModuleSelectionControllerContext) {
  const cancelPendingMarqueeHit = (pointerId: number) => {
    if (!ctx.marquee.pending || ctx.marquee.pointerId !== pointerId) return;
    ctx.marquee.hitSomething = true;
    ctx.marquee.pending = false;
    ctx.marquee.active = false;
    ctx.marqueeEl.style.display = "none";
  };

  const selectOwningKitchenGroup = (groupId: string | undefined | null) => {
    if (!groupId || ctx.getKitchenEditMode()) return false;
    const group = ctx.getKitchenMode()?.findKitchenGroup(groupId) ?? null;
    if (!group) return false;
    ctx.setSelectedKitchenGroup(group.id);
    return true;
  };

  const beginModuleSelection = (selectableId: string, ev: PointerEvent) => {
    const inst = ctx.findInstance(selectableId);
    if (!inst) return false;
    cancelPendingMarqueeHit(ev.pointerId);

    if (selectOwningKitchenGroup(inst.kitchenGroupId)) return true;
    ctx.setSelectedModule(selectableId);

    if (ctx.getViewMode() !== "2d") return true;
    if (ctx.pinnedInstanceIds.has(selectableId)) return true;

    const hitPoint = new THREE.Vector3();
    if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return true;
    ctx.dragState.active = true;
    ctx.dragState.id = selectableId;
    ctx.dragState.offset.set(hitPoint.x - inst.root.position.x, 0, hitPoint.z - inst.root.position.z);
    ctx.dragState.lastValid.copy(inst.root.position);
    ctx.renderer.domElement.setPointerCapture(ev.pointerId);
    return true;
  };

  const findSelectableFloorplanModuleAtPoint = (
    pointMm: { x: number; z: number },
    mousePx: { x: number; y: number },
    rect: DOMRect
  ) => {
    const pointWorld = { x: pointMm.x / 1000, z: pointMm.z / 1000 };
    let best: { id: string; score: number } | null = null;

    for (const inst of ctx.instances) {
      const selectableId = ctx.getKitchenMode()?.filterSelectableInstanceId(inst.id) ?? inst.id;
      if (!selectableId) continue;
      const poly = getModulePlanPolygon(inst, ctx.getModuleLocalBackCenter).map((p) => ({ x: p.x, z: p.z }));
      if (poly.length < 3) continue;
      if (!pointInPolygonXZ(pointWorld, poly)) continue;
      const center = worldToScreen(inst.root.position.clone(), ctx.getCamera(), rect);
      const score = Math.hypot(center.x - mousePx.x, center.y - mousePx.y);
      if (!best || score < best.score) best = { id: selectableId, score };
    }

    return best?.id ?? null;
  };

  const selectInstanceById = (id: string) => {
    if (ctx.getMode() !== "layout") return;
    const inst = ctx.findInstance(id);
    if (!inst) return;
    if (selectOwningKitchenGroup(inst.kitchenGroupId)) return;
    ctx.setSelectedModule(id);
  };

  return {
    beginModuleSelection,
    findSelectableFloorplanModuleAtPoint,
    selectInstanceById
  };
}
