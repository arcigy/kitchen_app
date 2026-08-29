import type { SelectedKind } from "./localTypes";
import type { ContextMenuAction, ContextMenuController, ContextMenuItem, ContextMenuRequest } from "../ui/contextMenu";

export type CanvasContextTarget = {
  kind: Exclude<SelectedKind, null>;
  id: string | null;
};

export type ActiveContextCommand = {
  id: string;
  label: string;
  finish?: () => void;
  back?: () => void;
  restart?: () => void;
  cancel: () => void;
  snap?: { enabled: boolean; toggle: () => void };
  ortho?: { enabled: boolean; toggle: () => void };
};

export type EditorContextMenuState = {
  mode: "build" | "layout";
  viewMode: "2d" | "3d";
  layoutTool: string;
  selectionKind: SelectedKind;
  selectionCount: number;
  hasHiddenObjects: boolean;
  selectedHasHidden: boolean;
  activeCommand: ActiveContextCommand | null;
};

export type EditorContextMenuControllerContext = {
  canvas: HTMLCanvasElement;
  menu: ContextMenuController;
  getState: () => EditorContextMenuState;
  resolveCanvasTarget: (event: MouseEvent | KeyboardEvent) => CanvasContextTarget | null;
  openProperties: () => void;
  openViewProperties: () => void;
  moveSelection: () => void;
  rotateSelection: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  editFloorBoundary: () => void;
  openUnderlayProperties: () => void;
  hideSelection: () => void;
  unhideSelection: () => void;
  isolateSelection: () => void;
  unhideAll: () => void;
  undo: () => void;
  redo: () => void;
  resetView: () => void;
  saveProject?: () => void | Promise<void>;
  selectAll?: () => void;
};

export type ResolveActiveContextCommandArgs = {
  layoutTool: string;
  transformKind: "move" | "rotate" | null;
  transformMoveSnapDisabled: boolean;
  floorBoundaryActive: boolean;
  placementActive: boolean;
  columnPlacementActive: boolean;
  windowPlacementActive: boolean;
  doorPlacementActive: boolean;
  kitchenWorktopActive: boolean;
  orthoEnabled: boolean;
  cancelTransform: () => void;
  cancelFloorBoundary: () => void;
  finishFloorBoundary: () => void;
  cancelPlacement: () => void;
  cancelColumnPlacement: () => void;
  cancelWindowPlacement: () => void;
  cancelDoorPlacement: () => void;
  cancelKitchenWorktop: () => void;
  cancelLayoutTool: () => void;
  toggleMoveSnap: () => void;
  toggleOrtho: () => void;
};

const separator = (id: string): ContextMenuItem => ({ type: "separator", id });

export function createEditorContextMenuController(ctx: EditorContextMenuControllerContext) {
  const resolveItems = (request: ContextMenuRequest): ContextMenuItem[] => {
    const stateBeforePick = ctx.getState();
    if (stateBeforePick.activeCommand) return buildCommandItems(stateBeforePick.activeCommand);

    const target = request.sourceEvent instanceof MouseEvent
      ? ctx.resolveCanvasTarget(request.sourceEvent)
      : null;
    const state = ctx.getState();
    const useSelection = request.sourceEvent instanceof KeyboardEvent
      ? state.selectionKind && state.selectionCount > 0
      : !!target && state.selectionKind && state.selectionCount > 0;
    return useSelection ? buildSelectionItems(state) : buildBlankItems(state);
  };

  const buildCommandItems = (command: ActiveContextCommand): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (command.finish) items.push(action("finish-command", `Finish ${command.label}`, command.finish, { iconId: "done" }));
    if (command.back) items.push(action("back-command", "Back / undo last step", command.back, { shortcut: "Backspace" }));
    if (command.ortho) items.push(action("toggle-ortho", "Ortho", command.ortho.toggle, { checked: command.ortho.enabled }));
    if (command.snap) items.push(action("toggle-snap", "Snapping", command.snap.toggle, { checked: command.snap.enabled }));
    if (command.restart) items.push(separator("command-restart-separator"), action("restart-command", `Restart ${command.label}`, command.restart));
    items.push(separator("command-cancel-separator"), action("cancel-command", `Cancel ${command.label}`, command.cancel, { iconId: "cancel", shortcut: "Esc" }));
    return items;
  };

  const buildSelectionItems = (state: EditorContextMenuState): ContextMenuItem[] => {
    const kind = state.selectionKind;
    if (!kind) return buildBlankItems(state);
    const items: ContextMenuItem[] = [action("properties", "Properties", ctx.openProperties, { shortcut: "Alt+Enter" })];
    const canTransform = state.mode === "layout" && state.viewMode === "2d" && state.layoutTool === "select";

    if (canTransform && canMove(kind)) items.push(action("move", "Move", ctx.moveSelection, { iconId: "move", shortcut: "M" }));
    if (canTransform && canRotate(kind)) items.push(action("rotate", "Rotate", ctx.rotateSelection, { iconId: "rotate", shortcut: "R" }));
    if (canDuplicate(kind)) items.push(action("duplicate", "Duplicate", ctx.duplicateSelection, { iconId: "duplicate", shortcut: "Ctrl+D" }));

    if (kind === "floor") items.push(action("edit-floor-boundary", "Edit boundary", ctx.editFloorBoundary, { iconId: "floor" }));
    if (kind === "underlay") items.push(action("underlay-properties", "Underlay settings", ctx.openUnderlayProperties, { iconId: "underlay" }));

    items.push(separator("selection-visibility-separator"));
    items.push(
      state.selectedHasHidden
        ? action("unhide-selection", "Unhide", ctx.unhideSelection, { iconId: "unhide" })
        : action("hide-selection", "Hide", ctx.hideSelection, { iconId: "hide" }),
      action("isolate-selection", "Isolate", ctx.isolateSelection, { iconId: "isolate" })
    );
    if (state.hasHiddenObjects) items.push(action("unhide-all", "Unhide all", ctx.unhideAll, { iconId: "unhideAll" }));

    items.push(separator("selection-delete-separator"));
    items.push(action("delete", state.selectionCount > 1 ? `Delete ${state.selectionCount} objects` : "Delete", ctx.deleteSelection, { danger: true, iconId: "delete", shortcut: "Del" }));
    return items;
  };

  const buildBlankItems = (state: EditorContextMenuState): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      action("undo", "Undo", ctx.undo, { iconId: "undo", shortcut: "Ctrl+Z" }),
      action("redo", "Redo", ctx.redo, { iconId: "redo", shortcut: "Ctrl+Y" })
    ];
    if (ctx.selectAll && state.mode === "layout") items.push(separator("blank-selection-separator"), action("select-all", "Select all", ctx.selectAll, { shortcut: "Ctrl+A" }));
    if (state.hasHiddenObjects) items.push(action("unhide-all", "Unhide all", ctx.unhideAll, { iconId: "unhideAll" }));
    items.push(separator("blank-view-separator"), action("reset-view", "Reset view", ctx.resetView, { iconId: "resetView" }), action("view-properties", "View properties", ctx.openViewProperties));
    if (ctx.saveProject) items.push(separator("blank-project-separator"), action("save-project", "Save project", ctx.saveProject, { iconId: "save", shortcut: "Ctrl+S" }));
    return items;
  };

  const unregister = ctx.menu.register(ctx.canvas, resolveItems);
  return { destroy: unregister, resolveGlobalItems: () => buildBlankItems(ctx.getState()), resolveItems };
}

export function resolveActiveContextCommand(args: ResolveActiveContextCommandArgs): ActiveContextCommand | null {
  if (args.floorBoundaryActive) {
    return {
      id: "floor-boundary",
      label: "floor boundary",
      finish: args.finishFloorBoundary,
      cancel: args.cancelFloorBoundary,
      ortho: { enabled: args.orthoEnabled, toggle: args.toggleOrtho }
    };
  }
  if (args.transformKind) {
    return {
      id: args.transformKind,
      label: args.transformKind === "move" ? "Move" : "Rotate",
      cancel: args.cancelTransform,
      snap: args.transformKind === "move"
        ? { enabled: !args.transformMoveSnapDisabled, toggle: args.toggleMoveSnap }
        : undefined
    };
  }
  if (args.placementActive) return { id: "placement", label: "module placement", cancel: args.cancelPlacement };
  if (args.columnPlacementActive) return { id: "column-placement", label: "column placement", cancel: args.cancelColumnPlacement };
  if (args.windowPlacementActive) return { id: "window-placement", label: "window placement", cancel: args.cancelWindowPlacement };
  if (args.doorPlacementActive) return { id: "door-placement", label: "door placement", cancel: args.cancelDoorPlacement };
  if (args.kitchenWorktopActive) return { id: "worktop", label: "worktop drawing", cancel: args.cancelKitchenWorktop };
  if (args.layoutTool !== "select") {
    const orthoTool = args.layoutTool === "wall" || args.layoutTool === "section";
    return {
      id: args.layoutTool,
      label: toolLabel(args.layoutTool),
      cancel: args.cancelLayoutTool,
      ortho: orthoTool ? { enabled: args.orthoEnabled, toggle: args.toggleOrtho } : undefined
    };
  }
  return null;
}

function action(
  id: string,
  label: string,
  execute: () => void | Promise<void>,
  options: Pick<ContextMenuAction, "checked" | "danger" | "iconId" | "shortcut"> = {}
): ContextMenuAction {
  return { id, label, execute, ...options };
}

function canMove(kind: Exclude<SelectedKind, null>): boolean {
  return kind === "module" || kind === "kitchenGroup" || kind === "wall" || kind === "section" || kind === "window" || kind === "door";
}

function canRotate(kind: Exclude<SelectedKind, null>): boolean {
  return kind === "module" || kind === "kitchenGroup" || kind === "wall" || kind === "section";
}

function canDuplicate(kind: Exclude<SelectedKind, null>): boolean {
  return kind === "module" || kind === "wall";
}

function toolLabel(tool: string): string {
  return tool.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
}
