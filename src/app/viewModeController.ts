import * as THREE from "three";
import type { AppMode, AppState, LayoutTool } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  KitchenWorktopInstance,
  KitchenWorktopParams,
  LayoutInstance,
  SelectedKind,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { AppArgs } from "./bootstrap";
import type { MeasureState } from "./measureTools";
import type { SnapOverlayController } from "./snapOverlay";
import { refreshSelectionHighlights } from "./selectionController";

type ViewerTabKey = "3d" | "floorplan" | string;

type ViewModeControllerContext = {
  S: AppState;
  activeDetailClipPlanes: THREE.Plane[];
  activeViewerTab: ViewerTabKey;
  args: AppArgs & {
    measureBtn: HTMLButtonElement;
    measureReadoutEl: HTMLElement;
    propertiesEl: HTMLElement;
  };
  buildUi: HTMLElement;
  cabinetGroup: THREE.Group | null;
  cancelPlacement: (S: AppState, helpers: PlacementHelpers) => void;
  clearAllMeasurements: () => void;
  clearOverlapHighlight: () => void;
  clearWallDrawState: () => void;
  columns: ColumnInstance[];
  doors: DoorInstance[];
  drawOrthoToggleEl: HTMLButtonElement | null;
  drawSnapOverlay: SnapOverlayController;
  ensurePickAndOutline: (inst: LayoutInstance, planMode: boolean) => void;
  floors: FloorInstance[];
  handleKitchenWorktopEscape: () => boolean;
  hideHoverCursor: () => void;
  instanceEditorHost: HTMLElement;
  instances: LayoutInstance[];
  kitchenWorktopDraw: { active: boolean };
  kitchenWorktops: KitchenWorktopInstance[];
  layoutRoot: THREE.Group;
  layoutTool: LayoutTool;
  layoutUi: HTMLElement;
  makeKitchenWorktopOutlineGeometry: (params: KitchenWorktopParams, planMode: boolean) => THREE.BufferGeometry;
  measureState: MeasureState;
  mode: AppMode;
  mountControls: () => void;
  mountProps: () => void;
  partsBuildHost: HTMLElement;
  partsLayoutHost: HTMLElement;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  rebuild: () => void;
  rebuildWallPlanMesh: () => void;
  selectMesh: (mesh: THREE.Mesh | null) => void;
  selectedFloorId: string | null;
  selectedColumnId: string | null;
  selectedInstanceId: string | null;
  selectedKind: SelectedKind;
  selectedSectionId: string | null;
  selectedWallId: string | null;
  setInstanceSelected: (id: string | null) => void;
  setPlanPresentation: (enabled: boolean) => void;
  setSelectedFloor: (id: string | null) => void;
  setSelectedColumn: (id: string | null) => void;
  setSelectedDoor: () => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedSection: (id: string | null) => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedWindow: () => void;
  setViewMode: (mode: "2d" | "3d") => void;
  showNoProps: () => void;
  syncDetailClippingAndMaterials: () => void;
  syncColumnPresentation: () => void;
  syncDoorSelectionVisuals: () => void;
  syncViewerTabs: (activeKey: string) => void;
  syncWindowSelectionVisuals: () => void;
  updateAllSectionVisuals: () => void;
  updateDetailSliceOverlay: () => void;
  updateLayoutPanel: () => void;
  updateSelectionHighlights: () => void;
  view2d: HTMLInputElement;
  viewMode: "2d" | "3d";
  viewNavigation: { syncControls: () => void };
  wallPlanGroup: THREE.Group;
  wallSnapMarkers: THREE.Object3D;
  walls: WallInstance[];
  windowEditorHost: HTMLElement;
  windows: WindowInstance[];
  windowInst: WindowInstance | null;
  doorInst: DoorInstance | null;
};

export function createViewModeController(ctx: ViewModeControllerContext) {
  function setView2d(enabled: boolean) {
    if (!enabled && ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) {
      ctx.handleKitchenWorktopEscape();
    }
    ctx.viewMode = enabled ? "2d" : "3d";
    ctx.S.viewMode = ctx.viewMode;
    ctx.setViewMode(ctx.viewMode);
    if (!enabled) ctx.activeViewerTab = "3d";
    if (enabled && ctx.activeViewerTab === "3d") ctx.activeViewerTab = "floorplan";
    ctx.syncViewerTabs(ctx.activeViewerTab);
    const isFloorplanView = enabled && ctx.activeViewerTab === "floorplan";
    const isDetailOrthoView = enabled && ctx.activeViewerTab !== "floorplan";
    ctx.setPlanPresentation(isFloorplanView);
    ctx.viewNavigation.syncControls();
    if (!isDetailOrthoView) {
      ctx.activeDetailClipPlanes = [];
    }

    for (const inst of ctx.instances) {
      ctx.ensurePickAndOutline(inst, isFloorplanView);
      inst.module.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = inst.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.95 : 0.98;
      outlineMaterial.depthTest = !enabled;
      inst.outline.visible = enabled && (isFloorplanView || isDetailOrthoView);
    }

    for (const windowInst of ctx.windows) {
      windowInst.outline.visible = false;
      windowInst.plan.visible = isFloorplanView;
      windowInst.frame.visible = !enabled || isDetailOrthoView;
    }
    ctx.syncWindowSelectionVisuals();

    for (const doorInst of ctx.doors) {
      doorInst.outline.visible = false;
      doorInst.plan.visible = isFloorplanView;
      doorInst.frame.visible = !enabled || isDetailOrthoView;
    }
    ctx.syncDoorSelectionVisuals();

    for (const floor of ctx.floors) {
      floor.mesh.visible = !enabled || isFloorplanView;
      (floor.outline.material as THREE.LineBasicMaterial).depthTest = !enabled;
      floor.outline.visible = enabled ? isFloorplanView || isDetailOrthoView : true;
    }
    ctx.syncColumnPresentation();

    for (const worktop of ctx.kitchenWorktops) {
      worktop.outline.geometry.dispose();
      worktop.outline.geometry = ctx.makeKitchenWorktopOutlineGeometry(worktop.params, isFloorplanView);
      worktop.outline.position.set(0, worktop.params.heightMm / 1000 + (isFloorplanView ? 0.0015 : 0), 0);
      worktop.mesh.visible = !enabled || isFloorplanView || isDetailOrthoView;
      worktop.outline.visible = isFloorplanView || isDetailOrthoView;
      const outlineMaterial = worktop.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0.98 : 0.94;
    }

    ctx.wallSnapMarkers.visible = isFloorplanView && !!ctx.selectedWallId;
    if (!isFloorplanView) {
      ctx.drawSnapOverlay.hide();
      ctx.hideHoverCursor();
    }
    refreshSelectionHighlights(ctx);
    ctx.updateAllSectionVisuals();
    ctx.updateDetailSliceOverlay();

    ctx.wallPlanGroup.visible = isFloorplanView;
    ctx.rebuildWallPlanMesh();
    for (const w of ctx.walls) {
      w.mesh.userData.viewDisplaySkipEdges = isFloorplanView;
      w.mesh.visible = !enabled || isDetailOrthoView;
      w.outline.visible = !enabled || isDetailOrthoView;
      const outlineMaterial = w.outline.material as THREE.LineBasicMaterial;
      outlineMaterial.opacity = isFloorplanView ? 0 : 0.94;
      outlineMaterial.depthTest = !(isFloorplanView || isDetailOrthoView);
    }
    ctx.syncDetailClippingAndMaterials();
  }

  function setMode(next: AppMode) {
    if (next !== "layout") return;
    ctx.mode = next;
    ctx.S.mode = ctx.mode;

    const isLayout = ctx.mode === "layout";
    if (!isLayout && ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
    ctx.buildUi.style.display = isLayout ? "none" : "";
    ctx.layoutUi.style.display = isLayout ? "" : "none";
    ctx.partsBuildHost.style.display = isLayout ? "none" : "";
    ctx.partsLayoutHost.style.display = isLayout ? "" : "none";

    ctx.args.propertiesEl.hidden = !isLayout;
    if (ctx.drawOrthoToggleEl) ctx.drawOrthoToggleEl.style.display = isLayout ? "" : "none";
    if (!isLayout) {
      ctx.layoutTool = "select";
      ctx.clearWallDrawState();
    }

    if (!isLayout) {
      ctx.measureState.enabled = false;
      ctx.args.measureBtn.textContent = "Measure: Off";
      ctx.clearAllMeasurements();
      ctx.hideHoverCursor();
      ctx.args.measureReadoutEl.textContent = "";
    }

    ctx.layoutRoot.visible = isLayout;

    if (ctx.cabinetGroup) ctx.cabinetGroup.visible = !isLayout;
    ctx.clearOverlapHighlight();
    ctx.selectMesh(null);

    if (isLayout) {
      setView2d(ctx.view2d.checked);
      ctx.updateLayoutPanel();
      if (ctx.selectedKind === "window") ctx.setSelectedWindow();
      else if (ctx.selectedKind === "door") ctx.setSelectedDoor();
      else if (ctx.selectedKind === "section") ctx.setSelectedSection(ctx.selectedSectionId);
      else if (ctx.selectedKind === "column") ctx.setSelectedColumn(ctx.selectedColumnId);
      else if (ctx.selectedKind === "wall") ctx.setSelectedWall(ctx.selectedWallId);
      else if (ctx.selectedKind === "floor") ctx.setSelectedFloor(ctx.selectedFloorId);
      else ctx.setSelectedModule(ctx.selectedInstanceId);

      // Hide selection editors in right panel (use properties panel on the left).
      ctx.windowEditorHost.style.display = "none";
      ctx.instanceEditorHost.style.display = "none";
      ctx.mountProps();
    } else {
      setView2d(false);
      ctx.selectedKind = null;
      ctx.selectedWallId = null;
      ctx.windowEditorHost.style.display = "none";
      ctx.instanceEditorHost.style.display = "";
      ctx.setInstanceSelected(null);
      ctx.mountControls();
      ctx.rebuild();
      ctx.showNoProps();
    }
  }

  return { setView2d, setMode };
}
