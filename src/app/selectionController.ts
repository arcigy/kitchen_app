import * as THREE from "three";
import type { LayoutInstance, SelectedKind, WallInstance } from "./localTypes";

type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";

type SelectionControllerContext = {
  instances: LayoutInstance[];
  kitchenMode: { filterSelectableInstanceId: (id: string | null) => string | null } | null;
  layoutPanel: { setSelected: (id: string | null) => void };
  layoutTool: LayoutTool;
  mountProps: () => void;
  pinnedInstanceIds: Set<string>;
  pinnedWallIds: Set<string>;
  scene: THREE.Scene;
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
  syncSelectionState: () => void;
  underlayMesh: THREE.Object3D & { visible: boolean };
  underlayState: { pinned: boolean };
  updateAllSectionVisuals: () => void;
  updateSelectionHighlights: () => void;
  walls: WallInstance[];
};

export function createSelectionController(ctx: SelectionControllerContext) {
  const disposeBox = (box: THREE.BoxHelper | null) => {
    if (!box) return;
    ctx.scene.remove(box);
    box.geometry.dispose();
    (box.material as THREE.Material).dispose();
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

  const afterSelectionChanged = (opts?: { highlights?: boolean; wallSnapId?: string | null }) => {
    if (opts?.wallSnapId !== undefined) ctx.showWallSnapMarkersFor(opts.wallSnapId);
    ctx.syncSelectionState();
    if (opts?.highlights !== false) ctx.updateSelectionHighlights();
    ctx.updateAllSectionVisuals();
    ctx.mountProps();
  };

  function setInstanceSelected(id: string | null) {
    ctx.selectedInstanceId = id;
    ctx.layoutPanel.setSelected(id);
    clearInstanceBox();
  }

  function setSelectedKitchenGroup(groupId: string | null) {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    ctx.selectedKind = groupId ? "kitchenGroup" : null;
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = groupId;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceIds.clear();
    if (groupId) {
    for (const inst of ctx.instances) {
        if (inst.kitchenGroupId === groupId) ctx.selectedInstanceIds.add(inst.id);
      }
    }
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
    afterSelectionChanged({ wallSnapId: null });
  }

  function setSelectedModule(id: string | null) {
    if (ctx.kitchenMode) id = ctx.kitchenMode.filterSelectableInstanceId(id);
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    if (id && ctx.pinnedInstanceIds.has(id)) id = null;
    ctx.selectedKind = id ? "module" : null;
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedInstanceId = id;
    ctx.selectedInstanceIds.clear();
    if (id) ctx.selectedInstanceIds.add(id);
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    setInstanceSelected(id);
    clearUnderlayBox();
    afterSelectionChanged();
  }

  function setSelectedWindow() {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    ctx.selectedKind = "window";
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    setInstanceSelected(null);
    clearUnderlayBox();
    afterSelectionChanged({ highlights: false });
  }

  function setSelectedUnderlay() {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    if (!ctx.underlayMesh.visible || ctx.underlayState.pinned) return;
    ctx.selectedKind = "underlay";
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceId = null;
    ctx.selectedInstanceIds.clear();
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
    ctx.selectedUnderlayBox = new THREE.BoxHelper(ctx.underlayMesh, 0x5c8cff);
    ctx.selectedUnderlayBox.name = "underlaySelectionBox";
    ctx.scene.add(ctx.selectedUnderlayBox);
    afterSelectionChanged({ highlights: false });
  }

  function setSelectedSection(id: string | null) {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    ctx.selectedKind = id ? "section" : null;
    ctx.selectedSectionId = id;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceId = null;
    ctx.selectedInstanceIds.clear();
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
    afterSelectionChanged({ wallSnapId: null });
  }

  function setSelectedWall(id: string | null) {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    if (id && ctx.pinnedWallIds.has(id)) id = null;
    ctx.selectedKind = id ? "wall" : null;
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = id;
    ctx.selectedWallIds.clear();
    if (id) ctx.selectedWallIds.add(id);
    setInstanceSelected(null);
    ctx.selectedInstanceIds.clear();
    clearUnderlayBox();
    clearWallBox();

    const wall = id ? ctx.walls.find((item) => item.id === id) ?? null : null;
    if (!wall) {
      afterSelectionChanged({ wallSnapId: null });
      return;
    }

    ctx.selectedWallBox = new THREE.BoxHelper(wall.root, 0x3ddc97);
    ctx.selectedWallBox.name = "wallSelectionBox";
    ctx.scene.add(ctx.selectedWallBox);
    afterSelectionChanged({ wallSnapId: id });
  }

  function setSelectedFloor(id: string | null) {
    if (ctx.layoutTool !== "wall") ctx.layoutTool = "select";
    ctx.selectedKind = id ? "floor" : null;
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    ctx.selectedFloorId = id;
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceId = null;
    ctx.selectedInstanceIds.clear();
    setInstanceSelected(null);
    clearWallBox();
    clearUnderlayBox();
    afterSelectionChanged({ wallSnapId: null });
  }

  return {
    setInstanceSelected,
    setSelectedFloor,
    setSelectedKitchenGroup,
    setSelectedModule,
    setSelectedSection,
    setSelectedUnderlay,
    setSelectedWall,
    setSelectedWindow
  };
}
