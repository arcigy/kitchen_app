import * as THREE from "three";
import type { PlanSnapResult } from "./planSnap";
import type { AppArgs } from "./bootstrap";
import type { SelectedKind } from "./localTypes";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import { activateAlignToolState, clearAlignReferenceFromEscape, type AlignState } from "./alignToolStateController";
import { activateDimensionToolState, handleDimensionEscape } from "./dimensionToolStateController";
import { handleEditorLayoutEscape, stopEditorToolFromEscape } from "./editorToolEscapeController";
import { activateSelectToolState, activateToggleEditorToolState, enterEditorTool, type EditorLayoutTool } from "./editorToolEntryController";
import {
  activateMeasureToolState,
  deactivateMeasureToolState,
  handleGlobalMeasurementClearState,
  stopMeasureToolFromEscape,
  type MeasureState
} from "./measureToolStateController";
import { activateSectionToolState, clearActiveSectionDrawLine, type SectionDrawState } from "./sectionDrawStateController";
import { clearDrawingToolSelection, clearSectionToolSelection, clearWallAndUnderlaySelectionBoxes } from "./selectionController";
import type { DrawingToolSelectionState } from "./selectionController";
import { activateTrimToolState, resetTrimTargetFromEscape, type TrimState } from "./trimToolStateController";
import { activateWallToolState, resetWallDrawState, type WallDrawState } from "./wallDrawStateController";

export { clearDrawingToolSelection, type DrawingToolSelectionState } from "./selectionController";

type LayoutTool = EditorLayoutTool;

type ToolModeArgs = AppArgs & {
  measureBtn: HTMLButtonElement;
  measureReadoutEl: HTMLElement;
};

export type ToolModeControllerContext = {
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
  clearTransform: (opts?: { restore?: boolean; status?: string | null; continueMove?: boolean }) => void;
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
  transformState: { kind: null | "move" | "rotate"; step: null | string };
  trimState: TrimState;
  updateAllSectionVisuals: () => void;
  updateSectionDrawPreview: () => void;
  updateSelectionHighlights: () => void;
  wallDraw: WallDrawState;
  wallDrawSnap: PlanSnapResult | null;
  wallTypedHud: HTMLElement;
};

export function createToolModeController(ctx: ToolModeControllerContext) {
  const handleGlobalMeasurementClear = (ev: KeyboardEvent) => {
    return handleGlobalMeasurementClearState(ctx, ev);
  };

  const handleLayoutEscape = (ev: KeyboardEvent) => {
    return handleEditorLayoutEscape(
      {
        alignHasReference: () => !!ctx.alignState.ref,
        cancelColumnPlacement: () => ctx.cancelColumnPlacement?.(),
        clearActiveAlignReference: () => clearAlignReferenceFromEscape(ctx),
        clearActiveSectionLine: () => clearActiveSectionDrawLine(ctx),
        clearActiveTrimTarget: () => resetTrimTargetFromEscape(ctx),
        dimensionEscape: () => handleDimensionEscape({ ...ctx, stopDimensionTool: setToolSelect }),
        isColumnPlacementActive: () => !!ctx.isColumnPlacementActive?.(),
        isTypingTarget: ctx.isTypingTarget,
        layoutTool: ctx.layoutTool,
        mode: ctx.mode,
        sectionHasActiveLine: () => !!ctx.sectionDraw.a,
        stopMeasureTool: () =>
          stopMeasureToolFromEscape({
            clearPreview: ctx.clearPreview,
            clearToolHud: ctx.clearToolHud,
            hideHoverCursor: ctx.hideHoverCursor,
            measureState: ctx.measureState,
            setFirstPointMarker: ctx.setFirstPointMarker,
            setUnderlayStatus: ctx.setUnderlayStatus,
            stopMeasureTool: setToolSelect
          }),
        stopSelectTool: setToolSelect,
        stopSectionTool: () => stopEditorToolFromEscape({ setUnderlayStatus: ctx.setUnderlayStatus, stopTool: setToolSelect }, "Section: stopped."),
        stopWallTool: () => stopEditorToolFromEscape({ setUnderlayStatus: ctx.setUnderlayStatus, stopTool: setToolSelect }, "Wall: stopped."),
        trimHasActiveTarget: () => ctx.trimState.step !== "pickTarget"
      },
      ev
    );
  };

  const clearWallDrawState = () => {
    resetWallDrawState(ctx);
  };

  const deactivateMeasureTool = (opts?: { clearSaved?: boolean }) => {
    deactivateMeasureToolState(ctx, opts);
  };

  const enterTool = (tool: LayoutTool) => {
    enterEditorTool(
      {
        ...ctx,
        clearWallDrawState,
        deactivateMeasureTool,
        resetDimensionDraft: ctx.technicalDimensions.resetDraft,
        setLayoutTool: (nextTool) => {
          ctx.layoutTool = nextTool;
        }
      },
      tool
    );
  };

  const clearSelectionForDrawingTool = () => {
    clearDrawingToolSelection(ctx);
  };

  const clearSelectionBoxes = () => {
    clearWallAndUnderlaySelectionBoxes(ctx);
  };

  const setToolSelect = () => {
    activateSelectToolState({
      enterSelectTool: () => enterTool("select"),
      mountProps: ctx.mountProps,
      setUnderlayStatus: ctx.setUnderlayStatus
    });
  };

  const setToolWall = () => {
    activateWallToolState({
      S: ctx.S,
      clearSelectionBoxes,
      clearSelectionForDrawingTool,
      ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
      enterWallTool: () => enterTool("wall"),
      mountProps: ctx.mountProps,
      setUnderlayStatus: ctx.setUnderlayStatus
    });
  };

  const setToolAlign = () => {
    activateAlignToolState({
      alignState: ctx.alignState,
      ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
      enterAlignTool: () => enterTool("align"),
      mountProps: ctx.mountProps,
      setUnderlayStatus: ctx.setUnderlayStatus
    });
  };

  const setToolTrim = () => {
    activateTrimToolState({
      ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
      enterTrimTool: () => enterTool("trim"),
      mountProps: ctx.mountProps,
      setUnderlayStatus: ctx.setUnderlayStatus,
      trimState: ctx.trimState
    });
  };

  const setToolSection = () => {
    activateSectionToolState({
      clearSectionSelection: () => clearSectionToolSelection(ctx),
      clearSelectionBoxes,
      ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
      enterSectionTool: () => enterTool("section"),
      mountProps: ctx.mountProps,
      sectionDraw: ctx.sectionDraw,
      setUnderlayStatus: ctx.setUnderlayStatus,
      syncSelectionState: ctx.syncSelectionState,
      updateAllSectionVisuals: ctx.updateAllSectionVisuals,
      updateSelectionHighlights: ctx.updateSelectionHighlights
    });
  };

  const setToolMeasure = () => {
    activateToggleEditorToolState({
      activateSelectTool: setToolSelect,
      activateTool: () =>
        activateMeasureToolState({
          ...ctx,
          clearSelectionForDrawingTool,
          clearWallDrawState,
          resetDimensionDraft: ctx.technicalDimensions.resetDraft,
          setLayoutTool: (nextTool) => {
            ctx.layoutTool = nextTool;
          }
        }),
      currentTool: ctx.layoutTool,
      tool: "measure"
    });
  };

  const setToolDimension = () => {
    activateToggleEditorToolState({
      activateSelectTool: setToolSelect,
      activateTool: () =>
        activateDimensionToolState({
          clearSelectionForDrawingTool,
          ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
          enterDimensionTool: () => enterTool("dimension"),
          mountProps: ctx.mountProps,
          setUnderlayStatus: ctx.setUnderlayStatus,
          syncSelectionState: ctx.syncSelectionState,
          updateSelectionHighlights: ctx.updateSelectionHighlights
        }),
      currentTool: ctx.layoutTool,
      tool: "dimension"
    });
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
