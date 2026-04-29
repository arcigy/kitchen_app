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
  getSelectedSectionId: () => string | null;
  getSelectedFloorId: () => string | null;
  getSelectedInstanceIds: () => Set<string>;
  getSelectedWallIds: () => Set<string>;
  setSelectedUnderlay: () => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedSection: (id: string | null) => void;
  setSelectedFloor: (id: string | null) => void;
  mountProps: () => void;
  duplicateInstance: (id: string) => void;
  deleteInstance: (id: string) => void;
  deleteWall: (id: string) => void;
  deleteSectionInstance: (id: string) => void;
  deleteFloor: (id: string) => void;
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
    if (ctx.getSelectedKind() !== "module") return;
    const selectedInstanceId = ctx.getSelectedInstanceId();
    if (!selectedInstanceId) return;
    ctx.duplicateInstance(selectedInstanceId);
    ctx.commitHistory();
  };

  const deleteSelected = () => {
    ctx.ensureLayoutMode();
    const selectedKind = ctx.getSelectedKind();
    if (selectedKind === "kitchenGroup") return;
    if (selectedKind === "section") {
      const selectedSectionId = ctx.getSelectedSectionId();
      if (!selectedSectionId) return;
      ctx.deleteSectionInstance(selectedSectionId);
      ctx.setSelectedSection(null);
      ctx.mountProps();
      return;
    }
    if (selectedKind === "floor") {
      const selectedFloorId = ctx.getSelectedFloorId();
      if (!selectedFloorId) return;
      ctx.deleteFloor(selectedFloorId);
      ctx.setSelectedFloor(null);
      return;
    }
    if (selectedKind === "module" && ctx.getSelectedInstanceIds().size > 0) {
      const selectedInstanceIds = ctx.getSelectedInstanceIds();
      const ids = Array.from(selectedInstanceIds);
      for (const id of ids) ctx.deleteInstance(id);
      ctx.setSelectedModule(null);
      selectedInstanceIds.clear();
      ctx.commitHistory();
      return;
    }
    if (selectedKind === "wall" && ctx.getSelectedWallIds().size > 0) {
      const selectedWallIds = ctx.getSelectedWallIds();
      const ids = Array.from(selectedWallIds);
      for (const id of ids) ctx.deleteWall(id);
      ctx.setSelectedWall(null);
      selectedWallIds.clear();
    }
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
