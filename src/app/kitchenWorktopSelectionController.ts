import type { KitchenWorktopInstance } from "./localTypes";
import type { KitchenModeGroupSelectionApi, SelectionMarqueeState } from "./selectionControllerTypes";

type KitchenWorktopSelectionControllerContext = {
  marquee: SelectionMarqueeState;
  marqueeEl: HTMLElement;
  findKitchenWorktop: (id: string) => KitchenWorktopInstance | null;
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

  return { beginKitchenWorktopSelection };
}
