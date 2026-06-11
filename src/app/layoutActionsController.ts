import type { SelectedKind } from "./localTypes";
import { clearSelectionIdSet, replaceSelectionIdSet } from "./selectionController";

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

export function resolveSelectedEntityIds(args: {
  selectedKind: SelectedKind;
  singleKind: Exclude<SelectedKind, null>;
  singleId: string | null;
  multiIds: Iterable<string>;
}): string[] {
  const multiIds = Array.from(args.multiIds);
  if (multiIds.length > 0) return [...new Set(multiIds)];
  return args.selectedKind === args.singleKind && args.singleId ? [args.singleId] : [];
}

export function createLayoutActionsController(ctx: LayoutActionsControllerContext) {
  const openUnderlayPanel = () => {
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
  };

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

type DuplicateSelectionBranchResult = "handled" | "blocked" | "not-applicable";

function runSelectedModuleDuplicateBranch(
  ctx: LayoutActionsControllerContext,
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
  ctx.commitHistory();
  return "handled";
}

function runSelectedWallDuplicateBranch(ctx: LayoutActionsControllerContext, selectedKind: SelectedKind) {
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
  ctx.commitHistory();
  ctx.mountProps();
  return true;
}

export function runDuplicateSelectionCommand(ctx: LayoutActionsControllerContext) {
  ctx.ensureLayoutMode();
  const selectedKind = ctx.getSelectedKind();
  const moduleDuplicate = runSelectedModuleDuplicateBranch(ctx, selectedKind);
  if (moduleDuplicate !== "not-applicable") return moduleDuplicate === "handled";
  return runSelectedWallDuplicateBranch(ctx, selectedKind);
}

type DeleteSelectionBranchResult = "handled" | "blocked" | "not-applicable";

function finishDeleteSelectionBranch(
  ctx: LayoutActionsControllerContext,
  opts: { commitHistory?: boolean; mountProps?: boolean } = {}
) {
  if (opts.commitHistory) ctx.commitHistory();
  if (opts.mountProps) ctx.mountProps();
  return "handled" as const;
}

function runDelegatedDeleteSelection(ctx: LayoutActionsControllerContext): boolean {
  if (ctx.deleteWardrobeSelection()) {
    ctx.commitHistory();
    ctx.mountProps();
    return true;
  }
  if (ctx.deleteCustomFurnitureSelection?.({ skipHistory: true })) {
    ctx.commitHistory();
    ctx.mountProps();
    return true;
  }
  return false;
}

function runSelectedKindDeleteBranch(
  ctx: LayoutActionsControllerContext,
  selectedKind: SelectedKind
): DeleteSelectionBranchResult {
  if (selectedKind === "kitchenGroup") {
    const selectedKitchenGroupId = ctx.getSelectedKitchenGroupId();
    if (!selectedKitchenGroupId) return "blocked";
    if (!ctx.deleteKitchenGroup(selectedKitchenGroupId)) return "blocked";
    ctx.setSelectedKind(null);
    ctx.setSelectedModule(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  if (selectedKind === "section") {
    const selectedSectionId = ctx.getSelectedSectionId();
    if (!selectedSectionId) return "blocked";
    ctx.deleteSectionInstance(selectedSectionId, { skipHistory: true });
    ctx.setSelectedSection(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  if (selectedKind === "floor") {
    const selectedFloorId = ctx.getSelectedFloorId();
    if (!selectedFloorId) return "blocked";
    ctx.deleteFloor(selectedFloorId, { skipHistory: true });
    ctx.setSelectedFloor(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true });
  }
  if (selectedKind === "column") {
    const selectedColumnId = ctx.getSelectedColumnId();
    if (!selectedColumnId) return "blocked";
    if (!ctx.deleteColumn(selectedColumnId, { skipHistory: true })) return "blocked";
    ctx.setSelectedColumn(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  if (selectedKind === "window") {
    if (!ctx.deleteWindow()) return "blocked";
    ctx.setSelectedKind(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  if (selectedKind === "door") {
    if (!ctx.deleteDoor()) return "blocked";
    ctx.setSelectedKind(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  if (selectedKind === "underlay") {
    if (!ctx.deleteUnderlay()) return "blocked";
    ctx.setSelectedKind(null);
    ctx.setSelectedModule(null);
    return finishDeleteSelectionBranch(ctx, { commitHistory: true, mountProps: true });
  }
  return "not-applicable";
}

function deleteSelectedEntityIds(
  ctx: LayoutActionsControllerContext,
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
  if (args.commitHistory) ctx.commitHistory();
  if (args.mountProps) ctx.mountProps();
  return true;
}

export function runDeleteSelectionCommand(ctx: LayoutActionsControllerContext) {
  ctx.ensureLayoutMode();
  ctx.cancelPlacementIfActive();

  if (runDelegatedDeleteSelection(ctx)) return true;

  const selectedKind = ctx.getSelectedKind();
  const selectedKindDelete = runSelectedKindDeleteBranch(ctx, selectedKind);
  if (selectedKindDelete !== "not-applicable") return selectedKindDelete === "handled";

  const selectedInstanceIds = ctx.getSelectedInstanceIds();
  const instanceIds = resolveSelectedEntityIds({
    selectedKind,
    singleKind: "module",
    singleId: ctx.getSelectedInstanceId(),
    multiIds: selectedInstanceIds
  });
  if (
    deleteSelectedEntityIds(ctx, {
      ids: instanceIds,
      selectedIds: selectedInstanceIds,
      deleteEntity: ctx.deleteInstance,
      clearSelection: () => ctx.setSelectedModule(null),
      commitHistory: true
    })
  ) return true;

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
