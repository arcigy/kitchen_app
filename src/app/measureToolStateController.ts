import * as THREE from "three";
import type { PlanSnapResult } from "./planSnap";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { EditorLayoutTool } from "./editorToolEntryController";

export type MeasureState = {
  enabled: boolean;
  measures: unknown[];
  firstPoint: THREE.Vector3 | null;
  firstBinding: unknown | null;
  hoverPoint: THREE.Vector3 | null;
  hoverSnap: string;
};

export type MeasureDraftStateContext = {
  measureState: MeasureState;
};

export type MeasureToolDeactivationContext = MeasureDraftStateContext & {
  clearAllMeasurements: () => void;
  clearPreview: () => void;
  clearToolHud: () => void;
  hideHoverCursor: () => void;
  measurePlanSnap: PlanSnapResult | null;
  resetMeasureSnapCycle: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
};

export type MeasureToolEscapeStopContext = MeasureDraftStateContext & {
  clearPreview: () => void;
  clearToolHud: () => void;
  hideHoverCursor: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setUnderlayStatus: (message: string) => void;
  stopMeasureTool: () => void;
};

export type MeasureToolActivationContext = MeasureDraftStateContext & {
  S: AppState;
  args: {
    measureBtn: { textContent: string | null };
    measureReadoutEl: { textContent: string | null };
  };
  cancelKitchenWorktopDraw: (opts?: { silent?: boolean }) => void;
  cancelPlacement: (S: AppState, helpers: PlacementHelpers) => void;
  cancelSectionDraw: (opts?: { silent?: boolean }) => void;
  clearPreview: () => void;
  clearSelectionForDrawingTool: () => void;
  clearToolHud: () => void;
  clearWallDrawState: () => void;
  ensureLayoutMode: () => void;
  hideHoverCursor: () => void;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  resetMeasureSnapCycle: () => void;
  resetDimensionDraft: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setLayoutTool: (tool: EditorLayoutTool) => void;
  setUnderlayStatus: (message: string) => void;
  syncSelectionState: () => void;
  updateSelectionHighlights: () => void;
  mountProps: () => void;
};

export type MeasureGlobalClearEvent = {
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type MeasureGlobalClearContext<TEvent extends MeasureGlobalClearEvent = MeasureGlobalClearEvent> = MeasureDraftStateContext & {
  args: {
    measureReadoutEl: { textContent: string | null };
  };
  clearAllMeasurements: () => void;
  clearPreview: () => void;
  clearToolHud: () => void;
  hideHoverCursor: () => void;
  isEscapeKey: (ev: TEvent) => boolean;
  measurePlanSnap: PlanSnapResult | null;
  resetMeasureSnapCycle: () => void;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setUnderlayStatus: (message: string) => void;
};

export function clearMeasureDraft(ctx: MeasureDraftStateContext) {
  ctx.measureState.firstPoint = null;
  ctx.measureState.firstBinding = null;
  ctx.measureState.hoverPoint = null;
  ctx.measureState.hoverSnap = "none";
}

export function deactivateMeasureToolState(ctx: MeasureToolDeactivationContext, opts?: { clearSaved?: boolean }) {
  ctx.measureState.enabled = false;
  clearMeasureDraft(ctx);
  ctx.clearPreview();
  ctx.clearToolHud();
  ctx.measurePlanSnap = null;
  ctx.resetMeasureSnapCycle();
  ctx.hideHoverCursor();
  ctx.setFirstPointMarker(null);
  if (opts?.clearSaved) ctx.clearAllMeasurements();
}

export function stopMeasureToolFromEscape(ctx: MeasureToolEscapeStopContext) {
  ctx.measureState.enabled = false;
  clearMeasureDraft(ctx);
  ctx.clearPreview();
  ctx.clearToolHud();
  ctx.hideHoverCursor();
  ctx.setFirstPointMarker(null);
  ctx.stopMeasureTool();
  ctx.setUnderlayStatus("Measure: stopped.");
}

export function activateMeasureToolState(ctx: MeasureToolActivationContext) {
  ctx.ensureLayoutMode();
  if (ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
  ctx.setLayoutTool("measure");
  ctx.measureState.enabled = true;
  ctx.resetDimensionDraft();
  clearMeasureDraft(ctx);
  ctx.clearPreview();
  ctx.clearToolHud();
  ctx.hideHoverCursor();
  ctx.resetMeasureSnapCycle();
  ctx.setFirstPointMarker(null);
  ctx.clearWallDrawState();
  ctx.cancelSectionDraw({ silent: true });
  ctx.cancelKitchenWorktopDraw({ silent: true });
  ctx.clearSelectionForDrawingTool();
  ctx.syncSelectionState();
  ctx.updateSelectionHighlights();
  ctx.args.measureBtn.textContent = "Measure: On";
  ctx.args.measureReadoutEl.textContent = "Measure: klikni prvy bod.";
  ctx.setUnderlayStatus("Measure: klikni prvy roh alebo hranu.");
  ctx.mountProps();
}

export function handleGlobalMeasurementClearState<TEvent extends MeasureGlobalClearEvent>(ctx: MeasureGlobalClearContext<TEvent>, ev: TEvent) {
  if (!ev.shiftKey || !ctx.isEscapeKey(ev)) return false;
  if (ctx.measureState.measures.length === 0 && !ctx.measureState.firstPoint && !ctx.measureState.hoverPoint) return false;
  ctx.clearAllMeasurements();
  clearMeasureDraft(ctx);
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
}
