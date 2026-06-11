import type { LayoutInstance } from "./localTypes";

export type KitchenPlacementGroupContext = {
  id: string;
  ctx: { worktopBackOffsetMm: number };
};

export function refreshModuleKitchenPlacement(args: {
  instance: LayoutInstance;
  kitchenGroups: KitchenPlacementGroupContext[];
  defaultWorktopBackOffsetMm: number;
  inferKitchenPlacementBinding: (
    instance: LayoutInstance,
    kitchenGroupId: string,
    backOffsetMm: number
  ) => LayoutInstance["kitchenPlacement"];
}) {
  if (!args.instance.kitchenGroupId) return false;
  const group = args.kitchenGroups.find((item) => item.id === args.instance.kitchenGroupId) ?? null;
  const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? args.defaultWorktopBackOffsetMm;
  args.instance.kitchenPlacement = args.inferKitchenPlacementBinding(args.instance, args.instance.kitchenGroupId, backOffsetMm);
  return true;
}
