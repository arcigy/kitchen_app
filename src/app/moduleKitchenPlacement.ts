import type { LayoutInstance } from "./localTypes";

export type KitchenPlacementGroupContext = {
  id: string;
  ctx: { worktopBackOffsetMm: number };
};

export function findKitchenPlacementGroup<TGroup extends KitchenPlacementGroupContext>(args: {
  kitchenGroupId: string | null | undefined;
  kitchenGroups: TGroup[];
}) {
  if (!args.kitchenGroupId) return null;
  return args.kitchenGroups.find((item) => item.id === args.kitchenGroupId) ?? null;
}

export function resolveKitchenPlacementBackOffset(args: {
  kitchenGroupId: string;
  kitchenGroups: KitchenPlacementGroupContext[];
  defaultWorktopBackOffsetMm: number;
}) {
  const group = findKitchenPlacementGroup({
    kitchenGroupId: args.kitchenGroupId,
    kitchenGroups: args.kitchenGroups
  });
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
