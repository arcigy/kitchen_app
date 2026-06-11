import type { LayoutInstance } from "./localTypes";

export type KitchenPlacementGroupContext = {
  id: string;
  ctx: { worktopBackOffsetMm: number };
};

export function resolveKitchenPlacementBackOffset(args: {
  kitchenGroupId: string;
  kitchenGroups: KitchenPlacementGroupContext[];
  defaultWorktopBackOffsetMm: number;
}) {
  const group = args.kitchenGroups.find((item) => item.id === args.kitchenGroupId) ?? null;
  return group?.ctx.worktopBackOffsetMm ?? args.defaultWorktopBackOffsetMm;
}

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
  const backOffsetMm = resolveKitchenPlacementBackOffset({
    kitchenGroupId: args.instance.kitchenGroupId,
    kitchenGroups: args.kitchenGroups,
    defaultWorktopBackOffsetMm: args.defaultWorktopBackOffsetMm
  });
  args.instance.kitchenPlacement = args.inferKitchenPlacementBinding(args.instance, args.instance.kitchenGroupId, backOffsetMm);
  return true;
}
