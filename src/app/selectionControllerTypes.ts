export type KitchenGroupLookup = {
  id: string;
};

export type KitchenModeGroupSelectionApi = {
  findKitchenGroup: (id: string) => KitchenGroupLookup | null;
  selectWorktopSegment?: (worktopId: string, segmentIndex: number) => boolean;
  clearWorktopSegmentSelection?: () => void;
};

export type SelectionMarqueeState = {
  active: boolean;
  pending: boolean;
  pointerId: number | null;
  hitSomething: boolean;
};
