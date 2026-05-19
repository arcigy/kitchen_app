import * as THREE from "three";
import type { PlanSnapResult } from "./planSnap";
import type { AppArgs } from "./bootstrap";
import type { FloorBoundaryPoint, SelectedKind } from "./localTypes";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";

type LayoutTool = "select" | "wall" | "align" | "trim" | "measure" | "section" | "dimension";

type ToolModeArgs = AppArgs & {
  measureBtn: HTMLButtonElement;
  measureReadoutEl: HTMLElement;
};

type MeasureState = {
  enabled: boolean;
  measures: unknown[];
  firstPoint: THREE.Vector3 | null;
  firstBinding: unknown | null;
  hoverPoint: THREE.Vector3 | null;
  hoverSnap: string;
};

type AlignState = {
  ref: unknown | null;
  hover: unknown | null;
  lastA: unknown | null;
  lastB: unknown | null;
  lastUntilMs: number;
};

type TrimState = {
  step: "pickTarget" | string;
  targetWallId: string | null;
  targetPick: unknown | null;
  targetClick: unknown | null;
  hover: unknown | null;
  lastTarget: unknown | null;
  lastCutter: unknown | null;
  lastUntilMs: number;
};

type SectionDrawState = {
  active: boolean;
  a: FloorBoundaryPoint | null;
  hoverPoint: FloorBoundaryPoint | null;
};

type WallDrawState = {
  active: boolean;
  a: FloorBoundaryPoint | null;
  chainStart: FloorBoundaryPoint | null;
  segments: number;
  hoverB: FloorBoundaryPoint | null;
  typedMm: string;
  preview: THREE.Mesh | null;
};

type ToolModeControllerContext = {
  S: AppState;
  alignState: AlignState;
  args: ToolModeArgs;
  cancelKitchenWorktopDraw: (opts?: { silent?: boolean }) => void;
  cancelColumnPlacement?: (opts?: { silent?: boolean }) => boolean;
  cancelPlacement: (S: AppState, helpers: PlacementHelpers) => void;
  cancelSectionDraw: (opts?: { silent?: boolean }) => void;
  clearAllMeasurements: () => void;
  clearPreview: () => void;
  clearToolHud: () => void;
  dimensionState: { picked: unknown[] };
  drawSnapOverlay: { hide: () => void };
  ensureFloorplanViewerTab: () => void;
  ensureLayoutMode: () => void;
  hideHoverCursor: () => void;
  isEscapeKey: (ev: KeyboardEvent) => boolean;
  isColumnPlacementActive?: () => boolean;
  isTypingTarget: (target: EventTarget | null) => boolean;
  layoutRoot: THREE.Object3D;
  layoutTool: LayoutTool;
  measurePlanSnap: PlanSnapResult | null;
  measureState: MeasureState;
  mode: "build" | "layout";
  mountProps: () => void;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  resetMeasureSnapCycle: () => void;
  scene: THREE.Scene;
  sectionDraw: SectionDrawState;
  selectedFloorId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedKitchenGroupId: string | null;
  selectedSectionId: string | null;
  selectedUnderlayBox: THREE.BoxHelper | null;
  selectedWallBox: THREE.BoxHelper | null;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setInstanceSelected: (id: string | null) => void;
  setUnderlayStatus: (message: string) => void;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  syncSelectionState: () => void;
  technicalDimensions: { resetDraft: () => void };
  trimState: TrimState;
  updateAllSectionVisuals: () => void;
  updateSectionDrawPreview: () => void;
  updateSelectionHighlights: () => void;
  wallDraw: WallDrawState;
  wallDrawSnap: PlanSnapResult | null;
  wallTypedHud: HTMLElement;
};

export function createToolModeController(ctx: ToolModeControllerContext) {
  const clearMeasureDraft = () => {
    ctx.measureState.firstPoint = null;
    ctx.measureState.firstBinding = null;
    ctx.measureState.hoverPoint = null;
    ctx.measureState.hoverSnap = "none";
  };

  const handleGlobalMeasurementClear = (ev: KeyboardEvent) => {
    if (!ev.shiftKey || !ctx.isEscapeKey(ev)) return false;
    if (ctx.measureState.measures.length === 0 && !ctx.measureState.firstPoint && !ctx.measureState.hoverPoint) return false;
    ctx.clearAllMeasurements();
    clearMeasureDraft();
    ctx.clearPreview();
    ctx.clearToolHud();
    ctx.measurePlanSnap = null;
    ctx.resetMeasureSnapCycle();
    ctx.hideHoverCursor();
    ctx.setFirstPointMarker(null);
    ctx.args.measureReadoutEl.textContent = ctx.measureState.enabled ? "Measure: klikni prvy bod." : "";
    ctx.setUnderlayStatus("Measurements cleared.");
    ev.preventDefault();
    ev.stopPropagation();
    return true;
  };

  const handleLayoutEscape = (ev: KeyboardEvent) => {
    if (ctx.mode !== "layout") return false;
    if (ctx.isTypingTarget(ev.target)) return false;

    if (ctx.isColumnPlacementActive?.()) {
      ctx.cancelColumnPlacement?.();
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "align") {
      if (ctx.alignState.ref) {
        ctx.alignState.ref = null;
        ctx.setUnderlayStatus("Align: canceled. Click reference line...");
      } else {
        setToolSelect();
      }
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "trim") {
      if (ctx.trimState.step !== "pickTarget") {
        resetTrimState();
        ctx.clearToolHud();
        ctx.setUnderlayStatus("Trim: click target wall...");
        ctx.mountProps();
      } else {
        setToolSelect();
      }
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "measure") {
      ctx.measureState.enabled = false;
      clearMeasureDraft();
      ctx.clearPreview();
      ctx.clearToolHud();
      ctx.hideHoverCursor();
      ctx.setFirstPointMarker(null);
      setToolSelect();
      ctx.setUnderlayStatus("Measure: stopped.");
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "dimension") {
      if (ctx.dimensionState.picked.length > 0) {
        ctx.technicalDimensions.resetDraft();
        ctx.setUnderlayStatus("Dimension: selection cleared. Pick the first line.");
      } else {
        setToolSelect();
        ctx.setUnderlayStatus("Dimension: stopped.");
      }
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "section") {
      if (ctx.sectionDraw.a) {
        ctx.sectionDraw.a = null;
        ctx.sectionDraw.hoverPoint = null;
        ctx.updateSectionDrawPreview();
        ctx.hideHoverCursor();
        ctx.drawSnapOverlay.hide();
        ctx.setUnderlayStatus("Section: current line canceled. Click first point.");
        ctx.mountProps();
      } else {
        setToolSelect();
        ctx.setUnderlayStatus("Section: stopped.");
      }
      ev.preventDefault();
      return true;
    }

    if (ctx.layoutTool === "wall") {
      setToolSelect();
      ctx.setUnderlayStatus("Wall: stopped.");
      ev.preventDefault();
      return true;
    }

    return false;
  };

  const clearWallDrawState = () => {
    ctx.wallDraw.active = false;
    ctx.wallDraw.a = null;
    ctx.wallDraw.chainStart = null;
    ctx.wallDraw.segments = 0;
    ctx.wallDraw.hoverB = null;
    ctx.wallDraw.typedMm = "";
    ctx.wallTypedHud.textContent = "";
    if (ctx.wallDraw.preview) {
      ctx.layoutRoot.remove(ctx.wallDraw.preview);
      ctx.wallDraw.preview.geometry.dispose();
      (ctx.wallDraw.preview.material as THREE.Material).dispose();
      ctx.wallDraw.preview = null;
    }
    ctx.wallDrawSnap = null;
    ctx.hideHoverCursor();
    ctx.showWallSnapMarkersFor(ctx.selectedKind === "wall" ? ctx.selectedWallId : null);
    ctx.wallTypedHud.style.display = "none";
  };

  const deactivateMeasureTool = (opts?: { clearSaved?: boolean }) => {
    ctx.measureState.enabled = false;
    clearMeasureDraft();
    ctx.clearPreview();
    ctx.clearToolHud();
    ctx.measurePlanSnap = null;
    ctx.resetMeasureSnapCycle();
    ctx.hideHoverCursor();
    ctx.setFirstPointMarker(null);
    if (opts?.clearSaved) ctx.clearAllMeasurements();
  };

  const enterTool = (tool: LayoutTool) => {
    ctx.ensureLayoutMode();
    if (ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
    ctx.cancelColumnPlacement?.({ silent: true });
    ctx.layoutTool = tool;
    deactivateMeasureTool();
    ctx.technicalDimensions.resetDraft();
    clearWallDrawState();
    ctx.cancelSectionDraw({ silent: true });
    ctx.cancelKitchenWorktopDraw({ silent: true });
  };

  const clearSelectionForDrawingTool = () => {
    ctx.selectedKind = null;
    ctx.selectedWallId = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceIds.clear();
    ctx.setInstanceSelected(null);
  };

  const clearSelectionBoxes = () => {
    if (ctx.selectedWallBox) {
      ctx.scene.remove(ctx.selectedWallBox);
      ctx.selectedWallBox.geometry.dispose();
      (ctx.selectedWallBox.material as THREE.Material).dispose();
      ctx.selectedWallBox = null;
    }
    if (ctx.selectedUnderlayBox) {
      ctx.scene.remove(ctx.selectedUnderlayBox);
      ctx.selectedUnderlayBox.geometry.dispose();
      (ctx.selectedUnderlayBox.material as THREE.Material).dispose();
      ctx.selectedUnderlayBox = null;
    }
  };

  const resetTrimState = () => {
    ctx.trimState.step = "pickTarget";
    ctx.trimState.targetWallId = null;
    ctx.trimState.targetPick = null;
    ctx.trimState.targetClick = null;
    ctx.trimState.hover = null;
    ctx.trimState.lastTarget = null;
    ctx.trimState.lastCutter = null;
    ctx.trimState.lastUntilMs = 0;
  };

  const setToolSelect = () => {
    enterTool("select");
    ctx.setUnderlayStatus("");
    ctx.mountProps();
  };

  const setToolWall = () => {
    if (ctx.S.kitchenEditMode) {
      ctx.setUnderlayStatus("Wall: v kitchen edit mode sa steny nekreslia.");
      ctx.mountProps();
      return;
    }
    enterTool("wall");
    ctx.ensureFloorplanViewerTab();
    ctx.selectedKind = null;
    ctx.selectedWallId = null;
    ctx.setInstanceSelected(null);
    clearSelectionBoxes();
    ctx.mountProps();
  };

  const setToolAlign = () => {
    enterTool("align");
    ctx.alignState.ref = null;
    ctx.alignState.hover = null;
    ctx.alignState.lastA = null;
    ctx.alignState.lastB = null;
    ctx.alignState.lastUntilMs = 0;
    ctx.ensureFloorplanViewerTab();
    ctx.setUnderlayStatus("Align: click reference line...");
    ctx.mountProps();
  };

  const setToolTrim = () => {
    enterTool("trim");
    resetTrimState();
    ctx.ensureFloorplanViewerTab();
    ctx.setUnderlayStatus("Trim: click target wall...");
    ctx.mountProps();
  };

  const setToolSection = () => {
    enterTool("section");
    ctx.ensureFloorplanViewerTab();
    clearSelectionForDrawingTool();
    ctx.selectedSectionId = null;
    ctx.selectedKitchenGroupId = null;
    clearSelectionBoxes();
    ctx.sectionDraw.active = true;
    ctx.syncSelectionState();
    ctx.updateAllSectionVisuals();
    ctx.updateSelectionHighlights();
    ctx.setUnderlayStatus("Section: click first point, then second point. Space mirrors direction.");
    ctx.mountProps();
  };

  const setToolMeasure = () => {
    if (ctx.layoutTool === "measure") {
      setToolSelect();
      return;
    }
    ctx.ensureLayoutMode();
    if (ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
    ctx.layoutTool = "measure";
    ctx.measureState.enabled = true;
    ctx.technicalDimensions.resetDraft();
    clearMeasureDraft();
    ctx.clearPreview();
    ctx.clearToolHud();
    ctx.hideHoverCursor();
    ctx.resetMeasureSnapCycle();
    ctx.setFirstPointMarker(null);
    clearWallDrawState();
    ctx.cancelSectionDraw({ silent: true });
    ctx.cancelKitchenWorktopDraw({ silent: true });
    clearSelectionForDrawingTool();
    ctx.syncSelectionState();
    ctx.updateSelectionHighlights();
    ctx.args.measureBtn.textContent = "Measure: On";
    ctx.args.measureReadoutEl.textContent = "Measure: klikni prvy bod.";
    ctx.setUnderlayStatus("Measure: klikni prvy roh alebo hranu.");
    ctx.mountProps();
  };

  const setToolDimension = () => {
    if (ctx.layoutTool === "dimension") {
      setToolSelect();
      return;
    }
    enterTool("dimension");
    ctx.ensureFloorplanViewerTab();
    clearSelectionForDrawingTool();
    ctx.syncSelectionState();
    ctx.updateSelectionHighlights();
    ctx.setUnderlayStatus("Dimension: pick the first line, then another parallel line. Click empty space to place dimension.");
    ctx.mountProps();
  };

  return {
    clearWallDrawState,
    deactivateMeasureTool,
    handleGlobalMeasurementClear,
    handleLayoutEscape,
    setToolAlign,
    setToolDimension,
    setToolMeasure,
    setToolSection,
    setToolSelect,
    setToolTrim,
    setToolWall
  };
}
