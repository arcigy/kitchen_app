import * as THREE from "three";
import { pointInPolygonXZ, worldToScreen } from "./sharedUtils";
import { getModulePlanPolygon } from "./planSnap";
import type { LayoutInstance } from "./localTypes";
import type { KitchenModeGroupSelectionApi, SelectionMarqueeState } from "./selectionControllerTypes";
import { beginPointerModuleDrag, type PointerModuleDragState } from "./pointerModuleDrag";

type KitchenModeSelectionApi = KitchenModeGroupSelectionApi & {
  filterSelectableInstanceId: (id: string) => string | null;
};

type ModuleSelectionControllerContext = {
  instances: LayoutInstance[];
  pinnedInstanceIds: Set<string>;
  raycaster: THREE.Raycaster;
  groundPlane: THREE.Plane;
  renderer: THREE.WebGLRenderer;
  dragState: PointerModuleDragState;
  marquee: SelectionMarqueeState;
  marqueeEl: HTMLElement;
  findInstance: (id: string) => LayoutInstance | null;
  getCamera: () => THREE.Camera;
  getMode: () => string;
  getViewMode: () => string;
  getKitchenEditMode: () => boolean;
  getKitchenMode: () => KitchenModeSelectionApi | null;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  isModuleAlignLocked?: (id: string) => boolean;
  isModuleSelected?: (id: string) => boolean;
  canBeginDirectDrag?: () => boolean;
  isMobileAdditiveSelection?: () => boolean;
  consumeMobileAdditiveSelection?: () => void;
  setSelectedKitchenGroup: (groupId: string | null) => void;
  setSelectedModule: (id: string | null, options?: { additive?: boolean }) => void;
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
    const keyboardAdditive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    const mobileAdditive = ctx.isMobileAdditiveSelection?.() ?? false;
    const directDrag = ctx.isModuleSelected?.(selectableId) && ctx.canBeginDirectDrag?.()
      && ev.button === 0 && ev.pointerType !== "touch" && !keyboardAdditive && !mobileAdditive
      && !ctx.pinnedInstanceIds.has(selectableId) && !ctx.isModuleAlignLocked?.(selectableId);
    ctx.setSelectedModule(selectableId, { additive: keyboardAdditive || mobileAdditive || undefined });
    if (directDrag) {
      inst.root.updateMatrixWorld(true);
      const hit = ctx.raycaster.intersectObject(inst.module, true).find(item => item.object instanceof THREE.Mesh);
      if (beginPointerModuleDrag({ state: ctx.dragState, instance: inst, ray: ctx.raycaster.ray,
        pointerId: ev.pointerId, clientX: ev.clientX, clientY: ev.clientY, grabHeight: hit?.point.y ?? inst.root.position.y })) {
        ctx.renderer.domElement.setPointerCapture(ev.pointerId);
      }
    }
    if (mobileAdditive && !keyboardAdditive) ctx.consumeMobileAdditiveSelection?.();
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
      const kitchenMode = ctx.getKitchenMode();
      const selectableId = kitchenMode ? kitchenMode.filterSelectableInstanceId(inst.id) : inst.id;
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
