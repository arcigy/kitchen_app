import * as THREE from "three";
import type { LayoutInstance, SelectedKind, WallInstance } from "./localTypes";

type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";

type SelectionSideEffects = { highlights?: boolean; wallSnapId?: string | null };

export type SelectionApplyCommandArgs = {
  kind: SelectedKind;
  assignIds?: () => void;
  cleanupVisuals?: () => void;
  sideEffectKind?: SelectedKind;
  sideEffectId?: string | null;
};

export type SelectionApplyCommand = (args: SelectionApplyCommandArgs) => void;

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
  state.selectedWallIds.clear();
  state.selectedInstanceIds.clear();
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
  ctx.selectedWallIds.clear();
  ctx.selectedInstanceId = null;
  ctx.selectedInstanceIds.clear();
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
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceId = null;
    ctx.selectedInstanceIds.clear();
  };

  const clearObjectSelectionVisuals = () => {
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
  };

  const applySelection: SelectionApplyCommand = (args) => {
    ensureSelectableTool();
    ctx.selectedKind = args.kind;
    clearSelectedEntityIds();
    args.assignIds?.();
    (args.cleanupVisuals ?? clearObjectSelectionVisuals)();
    afterSelectionChanged(getSelectionSideEffects(args.sideEffectKind ?? args.kind, args.sideEffectId));
  };

  function setSelectedKitchenGroup(groupId: string | null) {
    applySelection({
      kind: groupId ? "kitchenGroup" : null,
      sideEffectKind: "kitchenGroup",
      assignIds: () => {
        ctx.selectedKitchenGroupId = groupId;
        if (!groupId) return;
        for (const inst of ctx.instances) {
          if (inst.kitchenGroupId === groupId) ctx.selectedInstanceIds.add(inst.id);
        }
      }
    });
  }

  function setSelectedModule(id: string | null) {
    if (ctx.kitchenMode) id = ctx.kitchenMode.filterSelectableInstanceId(id);
    if (id && ctx.pinnedInstanceIds.has(id)) id = null;
    const selectedId = id;
    applySelection({
      kind: selectedId ? "module" : null,
      assignIds: () => {
        if (selectedId) ctx.selectedInstanceIds.add(selectedId);
      },
      cleanupVisuals: () => {
        setInstanceSelected(selectedId);
        clearUnderlayBox();
      }
    });
  }

  function setSelectedOpening(kind: "window" | "door") {
    applySelection({
      kind,
      cleanupVisuals: () => {
        setInstanceSelected(null);
        clearUnderlayBox();
      }
    });
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
    ctx.selectedKind = "underlay";
    clearSelectedEntityIds();
    clearObjectSelectionVisuals();
    ctx.selectedUnderlayBox = new THREE.BoxHelper(ctx.underlayMesh, 0x5c8cff);
    ctx.selectedUnderlayBox.name = "underlaySelectionBox";
    ctx.scene.add(ctx.selectedUnderlayBox);
    afterSelectionChanged(getSelectionSideEffects("underlay"));
  }

  function setSelectedSection(id: string | null) {
    applySelection({
      kind: id ? "section" : null,
      sideEffectKind: "section",
      assignIds: () => {
        ctx.selectedSectionId = id;
      }
    });
  }

  function setSelectedWall(id: string | null) {
    if (id && ctx.pinnedWallIds.has(id)) id = null;
    const selectedId = id;
    const wall = selectedId ? ctx.walls.find((item) => item.id === selectedId) ?? null : null;
    applySelection({
      kind: selectedId ? "wall" : null,
      sideEffectKind: "wall",
      sideEffectId: wall ? selectedId : null,
      assignIds: () => {
        ctx.selectedWallId = selectedId;
        if (selectedId) ctx.selectedWallIds.add(selectedId);
      }
    });
  }

  function setSelectedFloor(id: string | null) {
    applySelection({
      kind: id ? "floor" : null,
      sideEffectKind: "floor",
      assignIds: () => {
        ctx.selectedFloorId = id;
      }
    });
  }

  function setSelectedColumn(id: string | null) {
    applySelection({
      kind: id ? "column" : null,
      sideEffectKind: "column",
      assignIds: () => {
        ctx.selectedColumnId = id;
      }
    });
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
