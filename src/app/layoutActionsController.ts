import type { SelectedKind } from "./localTypes";
import { clearSelectionIdSet, replaceSelectionIdSet, resolveSelectedIds } from "./selectionController";

export type LayoutActionsControllerContext = {
  view2d: HTMLInputElement;
  ensureLayoutMode: () => void;
  cancelPlacementIfActive: () => void;
  setToolSelect: () => void;
  isVisibleUnpinnedUnderlay: () => boolean;
  getSelectedKind: () => SelectedKind;
  setSelectedKind: (kind: SelectedKind) => void;
  getSelectedInstanceId: () => string | null;
  getSelectedKitchenGroupId: () => string | null;
  getSelectedSectionId: () => string | null;
  getSelectedFloorId: () => string | null;
  getSelectedColumnId: () => string | null;
  getSelectedWallId: () => string | null;
  getSelectedInstanceIds: () => Set<string>;
  getSelectedWallIds: () => Set<string>;
  setSelectedUnderlay: () => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedSection: (id: string | null) => void;
  setSelectedFloor: (id: string | null) => void;
  setSelectedColumn: (id: string | null) => void;
  mountProps: () => void;
  duplicateInstance: (id: string) => void;
  duplicateWall: (id: string) => { id: string } | null;
  deleteInstance: (id: string) => void;
  deleteWall: (id: string, opts?: { skipHistory?: boolean; skipMountProps?: boolean }) => void;
  deleteSectionInstance: (id: string, opts?: { skipHistory?: boolean }) => void;
  deleteFloor: (id: string, opts?: { skipHistory?: boolean }) => void;
  deleteColumn: (id: string, opts?: { skipHistory?: boolean }) => boolean;
  deleteKitchenGroup: (id: string) => boolean;
  deleteWindow: () => boolean;
  deleteDoor: () => boolean;
  deleteUnderlay: () => boolean;
  deleteWardrobeSelection: () => boolean;
  deleteCustomFurnitureSelection?: (opts?: { skipHistory?: boolean }) => boolean;
  commitHistory: () => void;
  setView2d: (checked: boolean) => void;
};

export type DeleteSelectionCommandContext = Pick<
  LayoutActionsControllerContext,
  | "ensureLayoutMode"
  | "cancelPlacementIfActive"
  | "getSelectedKind"
  | "setSelectedKind"
  | "getSelectedInstanceId"
  | "getSelectedKitchenGroupId"
  | "getSelectedSectionId"
  | "getSelectedFloorId"
  | "getSelectedColumnId"
  | "getSelectedWallId"
  | "getSelectedInstanceIds"
  | "getSelectedWallIds"
  | "setSelectedWall"
  | "setSelectedModule"
  | "setSelectedSection"
  | "setSelectedFloor"
  | "setSelectedColumn"
  | "mountProps"
  | "deleteInstance"
  | "deleteWall"
  | "deleteSectionInstance"
  | "deleteFloor"
  | "deleteColumn"
  | "deleteKitchenGroup"
  | "deleteWindow"
  | "deleteDoor"
  | "deleteUnderlay"
  | "deleteWardrobeSelection"
  | "deleteCustomFurnitureSelection"
  | "commitHistory"
>;

export type DuplicateSelectionCommandContext = Pick<
  LayoutActionsControllerContext,
  | "ensureLayoutMode"
  | "getSelectedKind"
  | "getSelectedInstanceId"
  | "getSelectedWallId"
  | "getSelectedInstanceIds"
  | "getSelectedWallIds"
  | "setSelectedWall"
  | "mountProps"
  | "duplicateInstance"
  | "duplicateWall"
  | "commitHistory"
>;

export type OpenUnderlayPanelCommandContext = Pick<
  LayoutActionsControllerContext,
  | "ensureLayoutMode"
  | "cancelPlacementIfActive"
  | "setToolSelect"
  | "isVisibleUnpinnedUnderlay"
  | "setSelectedUnderlay"
  | "setSelectedWall"
  | "setSelectedModule"
  | "setSelectedKind"
  | "mountProps"
>;

export function resolveSelectedEntityIds(args: {
  selectedKind: SelectedKind;
  singleKind: Exclude<SelectedKind, null>;
  singleId: string | null;
  multiIds: Iterable<string>;
}): string[] {
  return resolveSelectedIds({
    selectedIds: new Set(args.multiIds),
    selectedKind: args.selectedKind,
    selectedId: args.singleId,
    singleKind: args.singleKind
  });
}

export function createLayoutActionsController(ctx: LayoutActionsControllerContext) {
  const openUnderlayPanel = () => runOpenUnderlayPanelCommand(ctx);

  const duplicateSelected = () => {
    runDuplicateSelectionCommand(ctx);
  };

  const deleteSelected = () => runDeleteSelectionCommand(ctx);

  const toggle2dView = () => {
    ctx.ensureLayoutMode();
    ctx.view2d.checked = !ctx.view2d.checked;
    ctx.setView2d(ctx.view2d.checked);
  };

  return {
    openUnderlayPanel,
    duplicateSelected,
    deleteSelected,
    toggle2dView
  };
}

export function runOpenUnderlayPanelCommand(ctx: OpenUnderlayPanelCommandContext) {
  ctx.ensureLayoutMode();
  ctx.cancelPlacementIfActive();
  ctx.setToolSelect();
  if (ctx.isVisibleUnpinnedUnderlay()) {
    ctx.setSelectedUnderlay();
    return;
  }
  ctx.setSelectedWall(null);
  ctx.setSelectedModule(null);
  ctx.setSelectedKind("underlay");
  ctx.mountProps();
}

type DuplicateSelectionBranchResult = "handled" | "blocked" | "not-applicable";

function finishDuplicateSelectionBranch(
  ctx: DuplicateSelectionCommandContext,
  opts: { mountProps?: boolean } = {}
) {
  ctx.commitHistory();
  if (opts.mountProps) ctx.mountProps();
}

function runSelectedModuleDuplicateBranch(
  ctx: DuplicateSelectionCommandContext,
  selectedKind: SelectedKind
): DuplicateSelectionBranchResult {
  if (selectedKind !== "module") return "not-applicable";
  const instanceIds = resolveSelectedEntityIds({
    selectedKind,
    singleKind: "module",
    singleId: ctx.getSelectedInstanceId(),
    multiIds: ctx.getSelectedInstanceIds()
  });
  if (instanceIds.length === 0) return "blocked";
  for (const id of instanceIds) ctx.duplicateInstance(id);
  finishDuplicateSelectionBranch(ctx);
  return "handled";
}

function runSelectedWallDuplicateBranch(ctx: DuplicateSelectionCommandContext, selectedKind: SelectedKind) {
  const selectedWallIds = ctx.getSelectedWallIds();
  const wallIds = resolveSelectedEntityIds({
    selectedKind,
    singleKind: "wall",
    singleId: ctx.getSelectedWallId(),
    multiIds: selectedWallIds
  });
  if (wallIds.length === 0) return false;

  const createdIds: string[] = [];
  for (const id of wallIds) {
    const duplicate = ctx.duplicateWall(id);
    if (duplicate) createdIds.push(duplicate.id);
  }
  if (createdIds.length === 0) return false;

  ctx.setSelectedWall(createdIds[0]);
  replaceSelectionIdSet(selectedWallIds, createdIds);
  finishDuplicateSelectionBranch(ctx, { mountProps: true });
  return true;
}

export function runDuplicateSelectionCommand(ctx: DuplicateSelectionCommandContext) {
  ctx.ensureLayoutMode();
  const selectedKind = ctx.getSelectedKind();
  const moduleDuplicate = runSelectedModuleDuplicateBranch(ctx, selectedKind);
  if (moduleDuplicate !== "not-applicable") return moduleDuplicate === "handled";
  return runSelectedWallDuplicateBranch(ctx, selectedKind);
}

type DeleteSelectionBranchResult = "handled" | "blocked" | "not-applicable";

function finishDeleteSelectionBranch(
  ctx: DeleteSelectionCommandContext,
  opts: { commitHistory?: boolean; mountProps?: boolean } = {}
) {
  if (opts.commitHistory) ctx.commitHistory();
  if (opts.mountProps) ctx.mountProps();
  return "handled" as const;
}

function finishDelegatedDeleteSelection(ctx: DeleteSelectionCommandContext): true {
  finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  return true;
}

function runDelegatedDeleteSelection(ctx: DeleteSelectionCommandContext): boolean {
  if (ctx.deleteWardrobeSelection()) {
    return finishDelegatedDeleteSelection(ctx);
  }
  if (ctx.deleteCustomFurnitureSelection?.({ skipHistory: true })) {
    return finishDelegatedDeleteSelection(ctx);
  }
  return false;
}

function runKitchenGroupDeleteBranch(ctx: DeleteSelectionCommandContext): DeleteSelectionBranchResult {
  const selectedKitchenGroupId = ctx.getSelectedKitchenGroupId();
  if (!selectedKitchenGroupId) return "blocked";
  if (!ctx.deleteKitchenGroup(selectedKitchenGroupId)) return "blocked";
  ctx.setSelectedKind(null);
  ctx.setSelectedModule(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
}

function runSectionDeleteBranch(ctx: DeleteSelectionCommandContext): DeleteSelectionBranchResult {
  const selectedSectionId = ctx.getSelectedSectionId();
  if (!selectedSectionId) return "blocked";
  ctx.deleteSectionInstance(selectedSectionId, { skipHistory: true });
  ctx.setSelectedSection(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
}

function runFloorDeleteBranch(ctx: DeleteSelectionCommandContext): DeleteSelectionBranchResult {
  const selectedFloorId = ctx.getSelectedFloorId();
  if (!selectedFloorId) return "blocked";
  ctx.deleteFloor(selectedFloorId, { skipHistory: true });
  ctx.setSelectedFloor(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true });
}

function runColumnDeleteBranch(ctx: DeleteSelectionCommandContext): DeleteSelectionBranchResult {
  const selectedColumnId = ctx.getSelectedColumnId();
  if (!selectedColumnId) return "blocked";
  if (!ctx.deleteColumn(selectedColumnId, { skipHistory: true })) return "blocked";
  ctx.setSelectedColumn(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
}

function runOpeningDeleteBranch(
  ctx: DeleteSelectionCommandContext,
  kind: "window" | "door"
): DeleteSelectionBranchResult {
  if (kind === "window" && !ctx.deleteWindow()) return "blocked";
  if (kind === "door" && !ctx.deleteDoor()) return "blocked";
  ctx.setSelectedKind(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
}

function runUnderlayDeleteBranch(ctx: DeleteSelectionCommandContext): DeleteSelectionBranchResult {
  if (!ctx.deleteUnderlay()) return "blocked";
  ctx.setSelectedKind(null);
  ctx.setSelectedModule(null);
  return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
}

function runSelectedKindDeleteBranch(
  ctx: DeleteSelectionCommandContext,
  selectedKind: SelectedKind
): DeleteSelectionBranchResult {
  if (selectedKind === "kitchenGroup") return runKitchenGroupDeleteBranch(ctx);
  if (selectedKind === "section") return runSectionDeleteBranch(ctx);
  if (selectedKind === "floor") return runFloorDeleteBranch(ctx);
  if (selectedKind === "column") return runColumnDeleteBranch(ctx);
  if (selectedKind === "window") return runOpeningDeleteBranch(ctx, "window");
  if (selectedKind === "door") return runOpeningDeleteBranch(ctx, "door");
  if (selectedKind === "underlay") return runUnderlayDeleteBranch(ctx);
  return "not-applicable";
}

function deleteSelectedEntityIds(
  ctx: DeleteSelectionCommandContext,
  args: {
    ids: string[];
    selectedIds: Set<string>;
    deleteEntity: (id: string) => void;
    clearSelection: () => void;
    commitHistory?: boolean;
    mountProps?: boolean;
  }
) {
  if (args.ids.length === 0) return false;
  for (const id of args.ids) args.deleteEntity(id);
  args.clearSelection();
  clearSelectionIdSet(args.selectedIds);
  finishDeleteSelectionBranch(ctx, { commitHistory: args.commitHistory, mountProps: args.mountProps });
  return true;
}

function runModuleDeleteFallbackBranch(ctx: DeleteSelectionCommandContext, selectedKind: SelectedKind) {
  const selectedInstanceIds = ctx.getSelectedInstanceIds();
  const instanceIds = resolveSelectedEntityIds({
    selectedKind,
    singleKind: "module",
    singleId: ctx.getSelectedInstanceId(),
    multiIds: selectedInstanceIds
  });
  return deleteSelectedEntityIds(ctx, {
    ids: instanceIds,
    selectedIds: selectedInstanceIds,
    deleteEntity: ctx.deleteInstance,
    clearSelection: () => ctx.setSelectedModule(null),
    commitHistory: true
  });
}

function runWallDeleteFallbackBranch(ctx: DeleteSelectionCommandContext, selectedKind: SelectedKind) {
  const selectedWallIds = ctx.getSelectedWallIds();
  const wallIds = resolveSelectedEntityIds({
    selectedKind,
    singleKind: "wall",
    singleId: ctx.getSelectedWallId(),
    multiIds: selectedWallIds
  });
  return deleteSelectedEntityIds(ctx, {
    ids: wallIds,
    selectedIds: selectedWallIds,
    deleteEntity: (id) => ctx.deleteWall(id, { skipHistory: true, skipMountProps: true }),
    clearSelection: () => ctx.setSelectedWall(null),
    commitHistory: true,
    mountProps: true
  });
}

export function runDeleteSelectionCommand(ctx: DeleteSelectionCommandContext) {
  ctx.ensureLayoutMode();
  ctx.cancelPlacementIfActive();

  if (runDelegatedDeleteSelection(ctx)) return true;

  const selectedKind = ctx.getSelectedKind();
  const selectedKindDelete = runSelectedKindDeleteBranch(ctx, selectedKind);
  if (selectedKindDelete !== "not-applicable") return selectedKindDelete === "handled";

  if (runModuleDeleteFallbackBranch(ctx, selectedKind)) return true;
  return runWallDeleteFallbackBranch(ctx, selectedKind);
}
