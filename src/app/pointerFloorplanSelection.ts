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
    appendModuleSelectionActions(actions, args.selectableModuleId, args.transformSelectElements);
  }
  if (args.fallbackModuleId && args.fallbackModulePickable) {
    appendModuleSelectionActions(actions, args.fallbackModuleId, args.transformSelectElements);
  }
  if (args.worktopId) actions.push({ kind: "worktop-select", id: args.worktopId });
  if (args.floorId) actions.push({ kind: "floor", id: args.floorId });
  if (args.polygonWallId) actions.push({ kind: "wall", id: args.polygonWallId });
  if (args.axisWallId) actions.push({ kind: "wall", id: args.axisWallId });
  return actions;
}

function appendModuleSelectionActions(actions: FloorplanSelectionAction[], id: string, transformSelectElements: boolean) {
  if (transformSelectElements) actions.push({ kind: "module-transform", id });
  actions.push({ kind: "module-select", id });
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
      runCancelableFloorplanMoveSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        continueMoveAfterSelection: args.continueMoveAfterSelection,
        hitPoint: args.hitPoint,
        select: args.selectWindow,
        value: args.pickedWindow
      });
      return true;
    }
    if (action.kind === "door") {
      if (!args.pickedDoor) continue;
      runCancelableFloorplanMoveSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        continueMoveAfterSelection: args.continueMoveAfterSelection,
        hitPoint: args.hitPoint,
        select: args.selectDoor,
        value: args.pickedDoor
      });
      return true;
    }
    if (action.kind === "section") {
      return runCancelableFloorplanSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        select: args.selectSection,
        value: action.id
      });
    }
    if (action.kind === "column") {
      return runCancelableFloorplanSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        select: args.selectColumn,
        value: action.id
      });
    }
    if (action.kind === "module-transform") {
      if (
        runCancelableFloorplanMoveSelection({
          cancelPendingMarquee: args.cancelPendingMarquee,
          continueMoveAfterSelection: args.continueMoveAfterSelection,
          hitPoint: args.hitPoint,
          select: args.selectModule,
          value: action.id
        })
      ) {
        return true;
      }
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
      return runCancelableFloorplanSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        select: args.selectFloor,
        value: action.id
      });
    }
    if (action.kind === "wall") {
      runCancelableFloorplanMoveSelection({
        cancelPendingMarquee: args.cancelPendingMarquee,
        continueMoveAfterSelection: args.continueMoveAfterSelection,
        hitPoint: args.hitPoint,
        select: args.selectWall,
        value: action.id
      });
      return true;
    }
  }

  return false;
}

function runCancelableFloorplanSelection<Value>(args: {
  cancelPendingMarquee: () => void;
  select: (value: Value) => void;
  value: Value;
}) {
  args.cancelPendingMarquee();
  args.select(args.value);
  return true;
}

function runCancelableFloorplanMoveSelection<Value, MovePoint>(args: {
  cancelPendingMarquee: () => void;
  continueMoveAfterSelection: (point: MovePoint) => boolean;
  hitPoint: MovePoint;
  select: (value: Value) => void;
  value: Value;
}) {
  args.cancelPendingMarquee();
  args.select(args.value);
  return args.continueMoveAfterSelection(args.hitPoint);
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
    return runCancelableFloorplanSelection({
      cancelPendingMarquee: args.cancelPendingMarquee,
      select: args.selectColumn,
      value: args.columnId
    });
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
    return runCancelableFloorplanSelection({
      cancelPendingMarquee: args.cancelPendingMarquee,
      select: args.selectFloor,
      value: args.floorId
    });
  }

  if (args.kind === "wall") {
    if (!args.wallId) {
      args.selectWall(null);
      return true;
    }
    runCancelableFloorplanMoveSelection({
      cancelPendingMarquee: args.cancelPendingMarquee,
      continueMoveAfterSelection: args.continueMoveAfterSelection,
      hitPoint: args.firstHitPoint,
      select: args.selectWall,
      value: args.wallId
    });
    return true;
  }

  if (!args.id) return false;

  const selectableId = args.filterSelectableId(args.id);
  if (!selectableId) {
    if (args.worktopId && args.beginWorktopSelection(args.worktopId)) return true;
    clearModuleAndOpeningSelection({
      clearWindowLightIfMissing: args.clearWindowLightIfMissing,
      selectModule: args.selectModule,
      setDoorInstNull: args.setDoorInstNull
    });
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
  clearModuleAndOpeningSelection({
    clearWindowLightIfMissing: args.clearWindowLightIfMissing,
    selectModule: args.selectModule,
    setDoorInstNull: args.setDoorInstNull
  });
  return true;
}

function clearModuleAndOpeningSelection(args: {
  clearWindowLightIfMissing: () => void;
  selectModule: (id: string | null) => void;
  setDoorInstNull: () => void;
}) {
  args.selectModule(null);
  args.setDoorInstNull();
  args.clearWindowLightIfMissing();
}
