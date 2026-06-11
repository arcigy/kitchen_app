import * as THREE from "three";
import type { LayoutInstance, SelectedKind, WallInstance } from "./localTypes";

type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";

export type SelectionSideEffects = { highlights?: boolean; wallSnapId?: string | null };

export type SelectionApplyCommandArgs = {
  kind: SelectedKind;
  assignIds?: () => void;
  cleanupVisuals?: () => void;
  sideEffectKind?: SelectedKind;
  sideEffectId?: string | null;
};

export type SelectionApplyCommand = (args: SelectionApplyCommandArgs) => void;

export type ApplySelectionCommandContext = {
  afterSelectionChanged: (opts?: SelectionSideEffects) => void;
  clearObjectSelectionVisuals: () => void;
  clearSelectedEntityIds: () => void;
  ensureSelectableTool: () => void;
  setSelectedKind: (kind: SelectedKind) => void;
};

export type SelectModuleCommandContext = {
  applySelection: SelectionApplyCommand;
  clearUnderlayBox: () => void;
  kitchenMode: { filterSelectableInstanceId: (id: string | null) => string | null } | null;
  pinnedInstanceIds: Set<string>;
  selectedInstanceIds: Set<string>;
  setInstanceSelected: (id: string | null) => void;
};

export type SelectWallCommandContext = {
  applySelection: SelectionApplyCommand;
  pinnedWallIds: Set<string>;
  selectedWallIds: Set<string>;
  setSelectedWallId: (id: string | null) => void;
  walls: WallInstance[];
};

export type SelectKitchenGroupCommandContext = {
  applySelection: SelectionApplyCommand;
  instances: LayoutInstance[];
  selectedInstanceIds: Set<string>;
  setSelectedKitchenGroupId: (id: string | null) => void;
};

export type SelectOpeningCommandContext = {
  applySelection: SelectionApplyCommand;
  clearUnderlayBox: () => void;
  setInstanceSelected: (id: string | null) => void;
};

export type SelectSectionCommandContext = {
  applySelection: SelectionApplyCommand;
  setSelectedSectionId: (id: string | null) => void;
};

export type SelectFloorCommandContext = {
  applySelection: SelectionApplyCommand;
  setSelectedFloorId: (id: string | null) => void;
};

export type SelectColumnCommandContext = {
  applySelection: SelectionApplyCommand;
  setSelectedColumnId: (id: string | null) => void;
};

export type SelectionControllerContext = {
  instances: LayoutInstance[];
  kitchenMode: { filterSelectableInstanceId: (id: string | null) => string | null } | null;
  layoutPanel: { setSelected: (id: string | null) => void };
  layoutTool: LayoutTool;
  mountProps: () => void;
  pinnedInstanceIds: Set<string>;
  pinnedWallIds: Set<string>;
  rebuildWallPlanMesh: () => void;
  scene: THREE.Scene;
  selectedColumnId: string | null;
  selectedFloorId: string | null;
  selectedInstanceBox: THREE.BoxHelper | null;
  selectedInstanceId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  selectedSectionId: string | null;
  selectedUnderlayBox: THREE.BoxHelper | null;
  selectedWallBox: THREE.BoxHelper | null;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  syncColumnSelectionVisuals: () => void;
  syncDoorSelectionVisuals: (selected?: boolean) => void;
  syncWindowSelectionVisuals: (selected?: boolean) => void;
  syncSelectionState: () => void;
  hasUnderlaySource: () => boolean;
  underlayMesh: THREE.Object3D & { visible: boolean };
  underlayState: { pinned: boolean };
  updateAllSectionVisuals: () => void;
  updateSelectionHighlights: () => void;
  walls: WallInstance[];
};

export function getSelectionSideEffects(kind: SelectedKind, selectedId?: string | null): SelectionSideEffects {
  if (kind === "window" || kind === "door" || kind === "underlay") return { highlights: false };
  if (kind === "wall") return { wallSnapId: selectedId ?? null };
  if (kind === "kitchenGroup" || kind === "section" || kind === "floor" || kind === "column") return { wallSnapId: null };
  return {};
}

export type NonFloorplanFloorSelectionCleanupContext = {
  mountProps: () => void;
  selectedColumnId: string | null;
  selectedFloorId: string | null;
  selectedInstanceId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  selectedSectionId: string | null;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  setInstanceSelected: (id: string | null) => void;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  syncSelectionState: () => void;
  updateAllSectionVisuals: () => void;
  updateSelectionHighlights: () => void;
};

export type DrawingToolSelectionState = {
  selectedFloorId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  setInstanceSelected: (id: string | null) => void;
};

export type SectionToolSelectionState = DrawingToolSelectionState & {
  selectedKitchenGroupId: string | null;
  selectedSectionId: string | null;
};

export type SelectionBoxCleanupState = {
  scene: THREE.Scene;
  selectedUnderlayBox: THREE.BoxHelper | null;
  selectedWallBox: THREE.BoxHelper | null;
};

function disposeSelectionBox(scene: THREE.Scene, box: THREE.BoxHelper | null) {
  if (!box) return;
  scene.remove(box);
  box.geometry.dispose();
  (box.material as THREE.Material).dispose();
}

export function runClearDrawingToolSelectionCommand(state: DrawingToolSelectionState) {
  state.selectedKind = null;
  state.selectedWallId = null;
  state.selectedFloorId = null;
  clearSelectionIdSet(state.selectedWallIds);
  clearSelectionIdSet(state.selectedInstanceIds);
  state.setInstanceSelected(null);
}

export function clearDrawingToolSelection(state: DrawingToolSelectionState) {
  runClearDrawingToolSelectionCommand(state);
}

export function runClearSectionToolSelectionCommand(state: SectionToolSelectionState) {
  clearDrawingToolSelection(state);
  state.selectedSectionId = null;
  state.selectedKitchenGroupId = null;
}

export function clearSectionToolSelection(state: SectionToolSelectionState) {
  runClearSectionToolSelectionCommand(state);
}

export function runClearSelectionCommand(applySelection: SelectionApplyCommand) {
  applySelection({ kind: null });
}

export function runApplySelectionCommand(ctx: ApplySelectionCommandContext, args: SelectionApplyCommandArgs) {
  ctx.ensureSelectableTool();
  ctx.setSelectedKind(args.kind);
  ctx.clearSelectedEntityIds();
  args.assignIds?.();
  (args.cleanupVisuals ?? ctx.clearObjectSelectionVisuals)();
  ctx.afterSelectionChanged(getSelectionSideEffects(args.sideEffectKind ?? args.kind, args.sideEffectId));
}

export function runSelectModuleCommand(ctx: SelectModuleCommandContext, id: string | null) {
  let selectedId = ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(id) : id;
  if (selectedId && ctx.pinnedInstanceIds.has(selectedId)) selectedId = null;
  ctx.applySelection({
    kind: selectedId ? "module" : null,
    assignIds: () => {
      if (selectedId) replaceSelectionIdSet(ctx.selectedInstanceIds, [selectedId]);
    },
    cleanupVisuals: () => {
      ctx.setInstanceSelected(selectedId);
      ctx.clearUnderlayBox();
    }
  });
}

export function runSelectWallCommand(ctx: SelectWallCommandContext, id: string | null) {
  const selectedId = id && ctx.pinnedWallIds.has(id) ? null : id;
  const wall = selectedId ? ctx.walls.find((item) => item.id === selectedId) ?? null : null;
  ctx.applySelection({
    kind: selectedId ? "wall" : null,
    sideEffectKind: "wall",
    sideEffectId: wall ? selectedId : null,
    assignIds: () => {
      ctx.setSelectedWallId(selectedId);
      if (selectedId) replaceSelectionIdSet(ctx.selectedWallIds, [selectedId]);
    }
  });
}

export function runSelectKitchenGroupCommand(ctx: SelectKitchenGroupCommandContext, groupId: string | null) {
  ctx.applySelection({
    kind: groupId ? "kitchenGroup" : null,
    sideEffectKind: "kitchenGroup",
    assignIds: () => {
      ctx.setSelectedKitchenGroupId(groupId);
      if (!groupId) return;
      replaceSelectionIdSet(
        ctx.selectedInstanceIds,
        ctx.instances.filter((inst) => inst.kitchenGroupId === groupId).map((inst) => inst.id)
      );
    }
  });
}

export function runSelectOpeningCommand(ctx: SelectOpeningCommandContext, kind: "window" | "door") {
  ctx.applySelection({
    kind,
    cleanupVisuals: () => {
      ctx.setInstanceSelected(null);
      ctx.clearUnderlayBox();
    }
  });
}

export function runSelectSectionCommand(ctx: SelectSectionCommandContext, id: string | null) {
  ctx.applySelection({
    kind: id ? "section" : null,
    sideEffectKind: "section",
    assignIds: () => {
      ctx.setSelectedSectionId(id);
    }
  });
}

export function runSelectFloorCommand(ctx: SelectFloorCommandContext, id: string | null) {
  ctx.applySelection({
    kind: id ? "floor" : null,
    sideEffectKind: "floor",
    assignIds: () => {
      ctx.setSelectedFloorId(id);
    }
  });
}

export function runSelectColumnCommand(ctx: SelectColumnCommandContext, id: string | null) {
  ctx.applySelection({
    kind: id ? "column" : null,
    sideEffectKind: "column",
    assignIds: () => {
      ctx.setSelectedColumnId(id);
    }
  });
}

export function replaceSelectionIdSet(target: Set<string>, ids: Iterable<string>) {
  target.clear();
  for (const id of ids) target.add(id);
}

export function clearSelectionIdSet(target: Set<string>) {
  target.clear();
}

export function clearWallAndUnderlaySelectionBoxes(state: SelectionBoxCleanupState) {
  if (state.selectedWallBox) {
    disposeSelectionBox(state.scene, state.selectedWallBox);
    state.selectedWallBox = null;
  }
  if (state.selectedUnderlayBox) {
    disposeSelectionBox(state.scene, state.selectedUnderlayBox);
    state.selectedUnderlayBox = null;
  }
}

export function clearNonFloorplanFloorSelection(ctx: NonFloorplanFloorSelectionCleanupContext) {
  ctx.selectedKind = null;
  ctx.selectedColumnId = null;
  ctx.selectedSectionId = null;
  ctx.selectedKitchenGroupId = null;
  ctx.selectedFloorId = null;
  ctx.selectedWallId = null;
  clearSelectionIdSet(ctx.selectedWallIds);
  ctx.selectedInstanceId = null;
  clearSelectionIdSet(ctx.selectedInstanceIds);
  ctx.setInstanceSelected(null);
  ctx.showWallSnapMarkersFor(null);
  ctx.syncSelectionState();
  ctx.updateSelectionHighlights();
  ctx.updateAllSectionVisuals();
  ctx.mountProps();
}

export function createSelectionController(ctx: SelectionControllerContext) {
  const disposeBox = (box: THREE.BoxHelper | null) => {
    disposeSelectionBox(ctx.scene, box);
  };

  const clearWallBox = () => {
    disposeBox(ctx.selectedWallBox);
    ctx.selectedWallBox = null;
  };

  const clearUnderlayBox = () => {
    disposeBox(ctx.selectedUnderlayBox);
    ctx.selectedUnderlayBox = null;
  };

  const clearInstanceBox = () => {
    disposeBox(ctx.selectedInstanceBox);
    ctx.selectedInstanceBox = null;
  };

  const afterSelectionChanged = (opts?: SelectionSideEffects) => {
    if (opts?.wallSnapId !== undefined) ctx.showWallSnapMarkersFor(opts.wallSnapId);
    ctx.syncWindowSelectionVisuals(ctx.selectedKind === "window");
    ctx.syncDoorSelectionVisuals(ctx.selectedKind === "door");
    ctx.syncColumnSelectionVisuals();
    ctx.syncSelectionState();
    ctx.rebuildWallPlanMesh();
    if (opts?.highlights !== false) ctx.updateSelectionHighlights();
    ctx.updateAllSectionVisuals();
    ctx.mountProps();
  };

  const ensureSelectableTool = () => {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
  };

  function setInstanceSelected(id: string | null) {
    ctx.selectedInstanceId = id;
    ctx.layoutPanel.setSelected(id);
    clearInstanceBox();
  }

  const clearSelectedEntityIds = () => {
    ctx.selectedColumnId = null;
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    clearSelectionIdSet(ctx.selectedWallIds);
    ctx.selectedInstanceId = null;
    clearSelectionIdSet(ctx.selectedInstanceIds);
  };

  const clearObjectSelectionVisuals = () => {
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
  };

  const applySelectionCommandContext: ApplySelectionCommandContext = {
    afterSelectionChanged,
    clearObjectSelectionVisuals,
    clearSelectedEntityIds,
    ensureSelectableTool,
    setSelectedKind: (kind) => {
      ctx.selectedKind = kind;
    }
  };

  const applySelection: SelectionApplyCommand = (args) => {
    runApplySelectionCommand(applySelectionCommandContext, args);
  };

  function setSelectedKitchenGroup(groupId: string | null) {
    runSelectKitchenGroupCommand({
      applySelection,
      instances: ctx.instances,
      selectedInstanceIds: ctx.selectedInstanceIds,
      setSelectedKitchenGroupId: (selectedKitchenGroupId) => {
        ctx.selectedKitchenGroupId = selectedKitchenGroupId;
      }
    }, groupId);
  }

  function setSelectedModule(id: string | null) {
    runSelectModuleCommand({
      applySelection,
      clearUnderlayBox,
      kitchenMode: ctx.kitchenMode,
      pinnedInstanceIds: ctx.pinnedInstanceIds,
      selectedInstanceIds: ctx.selectedInstanceIds,
      setInstanceSelected
    }, id);
  }

  function setSelectedOpening(kind: "window" | "door") {
    runSelectOpeningCommand({ applySelection, clearUnderlayBox, setInstanceSelected }, kind);
  }

  function setSelectedWindow() {
    setSelectedOpening("window");
  }

  function setSelectedDoor() {
    setSelectedOpening("door");
  }

  function setSelectedUnderlay() {
    ensureSelectableTool();
    if (!ctx.underlayMesh.visible || !ctx.hasUnderlaySource() || ctx.underlayState.pinned) return;
    runApplySelectionCommand(
      { ...applySelectionCommandContext, ensureSelectableTool: () => {} },
      {
        kind: "underlay",
        cleanupVisuals: () => {
          clearObjectSelectionVisuals();
          ctx.selectedUnderlayBox = new THREE.BoxHelper(ctx.underlayMesh, 0x5c8cff);
          ctx.selectedUnderlayBox.name = "underlaySelectionBox";
          ctx.scene.add(ctx.selectedUnderlayBox);
        }
      }
    );
  }

  function setSelectedSection(id: string | null) {
    runSelectSectionCommand({
      applySelection,
      setSelectedSectionId: (selectedSectionId) => {
        ctx.selectedSectionId = selectedSectionId;
      }
    }, id);
  }

  function setSelectedWall(id: string | null) {
    runSelectWallCommand({
      applySelection,
      pinnedWallIds: ctx.pinnedWallIds,
      selectedWallIds: ctx.selectedWallIds,
      setSelectedWallId: (selectedWallId) => {
        ctx.selectedWallId = selectedWallId;
      },
      walls: ctx.walls
    }, id);
  }

  function setSelectedFloor(id: string | null) {
    runSelectFloorCommand({
      applySelection,
      setSelectedFloorId: (selectedFloorId) => {
        ctx.selectedFloorId = selectedFloorId;
      }
    }, id);
  }

  function setSelectedColumn(id: string | null) {
    runSelectColumnCommand({
      applySelection,
      setSelectedColumnId: (selectedColumnId) => {
        ctx.selectedColumnId = selectedColumnId;
      }
    }, id);
  }

  function clearSelection() {
    runClearSelectionCommand(applySelection);
  }

  return {
    clearSelection,
    setInstanceSelected,
    setSelectedColumn,
    setSelectedDoor,
    setSelectedFloor,
    setSelectedKitchenGroup,
    setSelectedModule,
    setSelectedSection,
    setSelectedUnderlay,
    setSelectedWall,
    setSelectedWindow
  };
}
