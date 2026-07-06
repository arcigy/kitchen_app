import type { KitchenWorktopInstance } from "./localTypes";
import { getKitchenWorktopPolygon } from "../layout/worktopGeometry";
import { pointInPolygonXZ } from "./sharedUtils";
import type { KitchenModeGroupSelectionApi, SelectionMarqueeState } from "./selectionControllerTypes";

type KitchenWorktopSelectionControllerContext = {
  kitchenWorktops: KitchenWorktopInstance[];
  marquee: SelectionMarqueeState;
  marqueeEl: HTMLElement;
  findKitchenWorktop: (id: string) => KitchenWorktopInstance | null;
  getActiveKitchenGroupId: () => string | null;
  getKitchenEditMode: () => boolean;
  getKitchenMode: () => KitchenModeGroupSelectionApi | null;
  setSelectedKitchenGroup: (groupId: string | null) => void;
};

export function createKitchenWorktopSelectionController(ctx: KitchenWorktopSelectionControllerContext) {
  const cancelPendingMarqueeHit = (pointerId: number) => {
    if (!ctx.marquee.pending || ctx.marquee.pointerId !== pointerId) return;
    ctx.marquee.hitSomething = true;
    ctx.marquee.pending = false;
    ctx.marquee.active = false;
    ctx.marqueeEl.style.display = "none";
  };

  const beginKitchenWorktopSelection = (worktopId: string, ev: PointerEvent) => {
    const worktop = ctx.findKitchenWorktop(worktopId);
    if (!worktop) return false;
    cancelPendingMarqueeHit(ev.pointerId);

    if (ctx.getKitchenEditMode() && worktop.kitchenGroupId !== ctx.getActiveKitchenGroupId()) return false;

    if (!ctx.getKitchenEditMode() && worktop.kitchenGroupId) {
      const group = ctx.getKitchenMode()?.findKitchenGroup(worktop.kitchenGroupId) ?? null;
      if (group) {
        ctx.setSelectedKitchenGroup(group.id);
        return true;
      }
    }
    if (worktop.kitchenGroupId) {
      ctx.setSelectedKitchenGroup(worktop.kitchenGroupId);
      return true;
    }
    return false;
  };

  const findSelectableFloorplanWorktopAtPoint = (pointMm: { x: number; z: number }) => {
    const pointWorld = { x: pointMm.x / 1000, z: pointMm.z / 1000 };
    let best: { id: string; areaM2: number } | null = null;

    for (const worktop of ctx.kitchenWorktops) {
      const polygon = getKitchenWorktopPolygon(worktop.params).map((point) => ({ x: point.x, z: point.z }));
      if (polygon.length < 3) continue;
      if (!pointInPolygonXZ(pointWorld, polygon)) continue;
      const areaM2 = Math.abs(
        polygon.reduce((sum, point, index) => {
          const next = polygon[(index + 1) % polygon.length]!;
          return sum + point.x * next.z - next.x * point.z;
        }, 0) / 2
      );
      if (!best || areaM2 < best.areaM2) best = { id: worktop.id, areaM2 };
    }

    return best?.id ?? null;
  };

  return { beginKitchenWorktopSelection, findSelectableFloorplanWorktopAtPoint };
}
