import type { SelectedKind } from "./localTypes";

type LayoutActionsControllerContext = {
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
  deleteWall: (id: string, opts?: { skipHistory?: boolean }) => void;
  deleteSectionInstance: (id: string) => void;
  deleteFloor: (id: string) => void;
  deleteColumn: (id: string) => boolean;
  deleteKitchenGroup: (id: string) => boolean;
  deleteWindow: () => boolean;
  deleteDoor: () => boolean;
  deleteUnderlay: () => boolean;
  deleteWardrobeSelection: () => boolean;
  commitHistory: () => void;
  setView2d: (checked: boolean) => void;
};

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
    ctx.ensureLayoutMode();
    const selectedKind = ctx.getSelectedKind();
    if (selectedKind === "module") {
      const selectedInstanceId = ctx.getSelectedInstanceId();
      if (!selectedInstanceId) return;
      ctx.duplicateInstance(selectedInstanceId);
      ctx.commitHistory();
      return;
    }

    const selectedWallIds = ctx.getSelectedWallIds();
    const wallIds =
      selectedWallIds.size > 0
        ? Array.from(selectedWallIds)
        : selectedKind === "wall" && ctx.getSelectedWallId()
          ? [ctx.getSelectedWallId()!]
          : [];
    if (wallIds.length === 0) return;

    const createdIds: string[] = [];
    for (const id of [...new Set(wallIds)]) {
      const duplicate = ctx.duplicateWall(id);
      if (duplicate) createdIds.push(duplicate.id);
    }
    if (createdIds.length === 0) return;

    ctx.setSelectedWall(createdIds[0]);
    selectedWallIds.clear();
    for (const id of createdIds) selectedWallIds.add(id);
    ctx.commitHistory();
    ctx.mountProps();
  };

  const deleteSelected = () => {
    ctx.ensureLayoutMode();
    ctx.cancelPlacementIfActive();

    if (ctx.deleteWardrobeSelection()) {
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }

    const selectedKind = ctx.getSelectedKind();
    if (selectedKind === "kitchenGroup") {
      const selectedKitchenGroupId = ctx.getSelectedKitchenGroupId();
      if (!selectedKitchenGroupId) return false;
      if (!ctx.deleteKitchenGroup(selectedKitchenGroupId)) return false;
      ctx.setSelectedKind(null);
      ctx.setSelectedModule(null);
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "section") {
      const selectedSectionId = ctx.getSelectedSectionId();
      if (!selectedSectionId) return false;
      ctx.deleteSectionInstance(selectedSectionId);
      ctx.setSelectedSection(null);
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "floor") {
      const selectedFloorId = ctx.getSelectedFloorId();
      if (!selectedFloorId) return false;
      ctx.deleteFloor(selectedFloorId);
      ctx.setSelectedFloor(null);
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "column") {
      const selectedColumnId = ctx.getSelectedColumnId();
      if (!selectedColumnId) return false;
      if (!ctx.deleteColumn(selectedColumnId)) return false;
      ctx.setSelectedColumn(null);
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "window") {
      if (!ctx.deleteWindow()) return false;
      ctx.setSelectedKind(null);
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "door") {
      if (!ctx.deleteDoor()) return false;
      ctx.setSelectedKind(null);
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    if (selectedKind === "underlay") {
      if (!ctx.deleteUnderlay()) return false;
      ctx.setSelectedKind(null);
      ctx.setSelectedModule(null);
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    const selectedInstanceIds = ctx.getSelectedInstanceIds();
    const instanceIds =
      selectedInstanceIds.size > 0
        ? Array.from(selectedInstanceIds)
        : selectedKind === "module" && ctx.getSelectedInstanceId()
          ? [ctx.getSelectedInstanceId()!]
          : [];
    if (instanceIds.length > 0) {
      const ids = [...new Set(instanceIds)];
      for (const id of ids) ctx.deleteInstance(id);
      ctx.setSelectedModule(null);
      selectedInstanceIds.clear();
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    const selectedWallIds = ctx.getSelectedWallIds();
    const wallIds =
      selectedWallIds.size > 0
        ? Array.from(selectedWallIds)
        : selectedKind === "wall" && ctx.getSelectedWallId()
          ? [ctx.getSelectedWallId()!]
          : [];
    if (wallIds.length > 0) {
      const ids = [...new Set(wallIds)];
      for (const id of ids) ctx.deleteWall(id, { skipHistory: true });
      ctx.setSelectedWall(null);
      selectedWallIds.clear();
      ctx.commitHistory();
      ctx.mountProps();
      return true;
    }
    return false;
  };

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
