export type FloorplanSelectionAction =
  | { kind: "window" }
  | { kind: "door" }
  | { kind: "section"; id: string }
  | { kind: "column"; id: string }
  | { kind: "module-transform"; id: string }
  | { kind: "module-select"; id: string }
  | { kind: "worktop-select"; id: string }
  | { kind: "floor"; id: string }
  | { kind: "wall"; id: string };

export type ResolveFloorplanSelectionActionsArgs = {
  pickedDoor: boolean;
  pickedWindow: boolean;
  sectionId: string | null;
  columnId: string | null;
  selectableModuleId: string | null;
  fallbackModuleId: string | null;
  fallbackModulePickable: boolean;
  worktopId: string | null;
  floorId: string | null;
  polygonWallId: string | null;
  axisWallId: string | null;
  transformSelectElements: boolean;
};

export type ResolveFloorplanModulePickCandidatesArgs = {
  directModuleId: string | null;
  fallbackModuleId: string | null;
  filterSelectableModuleId?: (id: string | null) => string | null;
  isFallbackModulePickable: (id: string) => boolean;
};

export function resolveFloorplanModulePickCandidates(args: ResolveFloorplanModulePickCandidatesArgs) {
  const selectableModuleId = args.directModuleId && args.filterSelectableModuleId ? args.filterSelectableModuleId(args.directModuleId) : args.directModuleId;
  const fallbackModulePickable = !!args.fallbackModuleId && args.isFallbackModulePickable(args.fallbackModuleId);

  return {
    selectableModuleId,
    fallbackModuleId: args.fallbackModuleId,
    fallbackModulePickable
  };
}

export function resolveFloorplanSelectionActions(args: ResolveFloorplanSelectionActionsArgs): FloorplanSelectionAction[] {
  const actions: FloorplanSelectionAction[] = [];
  if (args.pickedWindow) actions.push({ kind: "window" });
  if (args.pickedDoor) actions.push({ kind: "door" });
  if (args.sectionId) actions.push({ kind: "section", id: args.sectionId });
  if (args.columnId) actions.push({ kind: "column", id: args.columnId });
  if (args.selectableModuleId) {
    if (args.transformSelectElements) actions.push({ kind: "module-transform", id: args.selectableModuleId });
    actions.push({ kind: "module-select", id: args.selectableModuleId });
  }
  if (args.fallbackModuleId && args.fallbackModulePickable) {
    if (args.transformSelectElements) actions.push({ kind: "module-transform", id: args.fallbackModuleId });
    actions.push({ kind: "module-select", id: args.fallbackModuleId });
  }
  if (args.worktopId) actions.push({ kind: "worktop-select", id: args.worktopId });
  if (args.floorId) actions.push({ kind: "floor", id: args.floorId });
  if (args.polygonWallId) actions.push({ kind: "wall", id: args.polygonWallId });
  if (args.axisWallId) actions.push({ kind: "wall", id: args.axisWallId });
  return actions;
}

export type ExecuteFloorplanSelectionActionsArgs<WindowPick, DoorPick, MovePoint> = {
  actions: FloorplanSelectionAction[];
  beginModuleSelection: (id: string) => boolean;
  beginWorktopSelection: (id: string) => boolean;
  cancelPendingMarquee: () => void;
  continueMoveAfterSelection: (point: MovePoint) => boolean;
  hitPoint: MovePoint;
  pickedDoor: DoorPick | null;
  pickedWindow: WindowPick | null;
  selectColumn: (id: string) => void;
  selectDoor: (door: DoorPick) => void;
  selectFloor: (id: string) => void;
  selectModule: (id: string) => void;
  selectSection: (id: string) => void;
  selectWall: (id: string) => void;
  selectWindow: (window: WindowPick) => void;
};

export type HandleFloorplanSelectionArgs<WindowPick, DoorPick, MovePoint> = {
  execution: Omit<ExecuteFloorplanSelectionActionsArgs<WindowPick, DoorPick, MovePoint>, "actions">;
  selection: ResolveFloorplanSelectionActionsArgs;
};

export function executeFloorplanSelectionActions<WindowPick, DoorPick, MovePoint>(args: ExecuteFloorplanSelectionActionsArgs<WindowPick, DoorPick, MovePoint>) {
  for (const action of args.actions) {
    if (action.kind === "window") {
      if (!args.pickedWindow) continue;
      args.cancelPendingMarquee();
      args.selectWindow(args.pickedWindow);
      if (args.continueMoveAfterSelection(args.hitPoint)) return true;
      return true;
    }
    if (action.kind === "door") {
      if (!args.pickedDoor) continue;
      args.cancelPendingMarquee();
      args.selectDoor(args.pickedDoor);
      if (args.continueMoveAfterSelection(args.hitPoint)) return true;
      return true;
    }
    if (action.kind === "section") {
      args.cancelPendingMarquee();
      args.selectSection(action.id);
      return true;
    }
    if (action.kind === "column") {
      args.cancelPendingMarquee();
      args.selectColumn(action.id);
      return true;
    }
    if (action.kind === "module-transform") {
      args.cancelPendingMarquee();
      args.selectModule(action.id);
      if (args.continueMoveAfterSelection(args.hitPoint)) return true;
      continue;
    }
    if (action.kind === "module-select") {
      if (args.beginModuleSelection(action.id)) return true;
      continue;
    }
    if (action.kind === "worktop-select") {
      if (args.beginWorktopSelection(action.id)) return true;
      continue;
    }
    if (action.kind === "floor") {
      args.cancelPendingMarquee();
      args.selectFloor(action.id);
      return true;
    }
    if (action.kind === "wall") {
      args.cancelPendingMarquee();
      args.selectWall(action.id);
      if (args.continueMoveAfterSelection(args.hitPoint)) return true;
      return true;
    }
  }

  return false;
}

export function handleFloorplanSelection<WindowPick, DoorPick, MovePoint>(args: HandleFloorplanSelectionArgs<WindowPick, DoorPick, MovePoint>) {
  const actions = resolveFloorplanSelectionActions(args.selection);
  return executeFloorplanSelectionActions({ ...args.execution, actions });
}

export function executeFallbackPickSelection<MovePoint>(args: {
  activeViewerTab: string;
  beginModuleSelection: (id: string) => boolean;
  beginWorktopSelection: (id: string) => boolean;
  cancelPendingMarquee: () => void;
  clearNonFloorplanFloorSelection: () => void;
  clearWindowLightIfMissing: () => void;
  columnId: string | null;
  continueMoveAfterSelection: (point: MovePoint) => boolean;
  filterSelectableId: (id: string) => string | null;
  firstHitPoint: MovePoint;
  floorId: string | null;
  id: string | null;
  kind: string;
  setDoorInstNull: () => void;
  selectColumn: (id: string | null) => void;
  selectFloor: (id: string | null) => void;
  selectModule: (id: string | null) => void;
  selectWall: (id: string | null) => void;
  transformSelectElements: boolean;
  viewMode: string;
  wallId: string | null;
  worktopId: string | null;
}) {
  if (!args.id && args.worktopId && args.beginWorktopSelection(args.worktopId)) return true;

  if (args.kind === "column" || args.columnId) {
    if (!args.columnId) {
      args.selectColumn(null);
      return true;
    }
    args.cancelPendingMarquee();
    args.selectColumn(args.columnId);
    return true;
  }

  if (args.kind === "floor") {
    if (args.viewMode === "2d" && args.activeViewerTab !== "floorplan") {
      args.clearNonFloorplanFloorSelection();
      return true;
    }
    if (!args.floorId) {
      args.selectFloor(null);
      return true;
    }
    args.cancelPendingMarquee();
    args.selectFloor(args.floorId);
    return true;
  }

  if (args.kind === "wall") {
    if (!args.wallId) {
      args.selectWall(null);
      return true;
    }
    args.cancelPendingMarquee();
    args.selectWall(args.wallId);
    if (args.continueMoveAfterSelection(args.firstHitPoint)) return true;
    return true;
  }

  if (!args.id) return false;

  const selectableId = args.filterSelectableId(args.id);
  if (!selectableId) {
    if (args.worktopId && args.beginWorktopSelection(args.worktopId)) return true;
    args.selectModule(null);
    args.setDoorInstNull();
    args.clearWindowLightIfMissing();
    return true;
  }

  if (args.transformSelectElements) {
    args.selectModule(selectableId);
    if (args.continueMoveAfterSelection(args.firstHitPoint)) return true;
  }

  args.beginModuleSelection(selectableId);
  return true;
}

export function handleEmptyFallbackPickSelection<MovePoint>(args: {
  clearWindowLightIfMissing: () => void;
  cloneMovePoint: (point: MovePoint) => MovePoint;
  continueMoveWithCurrentSelection: (point: MovePoint) => boolean;
  getCurrentMoveHitPoint: () => MovePoint | null;
  hasPendingMarqueeForPointer: boolean;
  setDoorInstNull: () => void;
  selectFloor: (id: string | null) => void;
  selectModule: (id: string | null) => void;
  selectWall: (id: string | null) => void;
}) {
  if (args.hasPendingMarqueeForPointer) return true;

  const currentMoveHitPoint = args.getCurrentMoveHitPoint();
  if (currentMoveHitPoint && args.continueMoveWithCurrentSelection(args.cloneMovePoint(currentMoveHitPoint))) return true;

  args.selectFloor(null);
  args.selectWall(null);
  args.selectModule(null);
  args.setDoorInstNull();
  args.clearWindowLightIfMissing();
  return true;
}
