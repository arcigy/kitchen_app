export type KitchenGroupLookup = {
  id: string;
};

export type KitchenModeGroupSelectionApi = {
  findKitchenGroup: (id: string) => KitchenGroupLookup | null;
};

export type SelectionMarqueeState = {
  active: boolean;
  pending: boolean;
  pointerId: number | null;
  hitSomething: boolean;
};
