import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { TransformClearOptions, TransformState } from "./transformStateTypes";

export type EditorLayoutTool = "select" | "wall" | "led" | "align" | "trim" | "measure" | "section" | "dimension";

export type EditorToolEntryContext = {
  S: AppState;
  cancelColumnPlacement?: (opts?: { silent?: boolean }) => boolean;
  cancelKitchenWorktopDraw: (opts?: { silent?: boolean }) => void;
  cancelPlacement: (S: AppState, helpers: PlacementHelpers) => void;
  cancelSectionDraw: (opts?: { silent?: boolean }) => void;
  clearTransform: (opts?: TransformClearOptions) => void;
  clearWallDrawState: () => void;
  deactivateMeasureTool: () => void;
  ensureLayoutMode: () => void;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  resetDimensionDraft: () => void;
  setLayoutTool: (tool: EditorLayoutTool) => void;
  transformState: Pick<TransformState, "kind"> & { step: TransformState["step"] | string | null };
};

export type SelectToolActivationContext = {
  enterSelectTool: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export type ToggleEditorToolActivationContext = {
  activateSelectTool: () => void;
  activateTool: () => void;
  currentTool: EditorLayoutTool;
  tool: EditorLayoutTool;
};

export type EditorToolPromptActivationContext = {
  ensureFloorplanViewerTab: () => void;
  enterTool: () => void;
  mountProps: () => void;
  resetToolState: () => void;
  setUnderlayStatus: (message: string) => void;
  status: string;
};

export type EditorToolPromptEscapeContext = {
  clearToolHud: () => void;
  mountProps: () => void;
  resetToolState: () => void;
  setUnderlayStatus: (message: string) => void;
  status: string;
};

export type EditorToolEntryStatusContext = {
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export function enterEditorTool(ctx: EditorToolEntryContext, tool: EditorLayoutTool) {
  ctx.ensureLayoutMode();
  if (ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
  ctx.cancelColumnPlacement?.({ silent: true });
  ctx.clearTransform({
    restore: !!ctx.transformState.kind && (ctx.transformState.step === "pickTarget" || ctx.transformState.step === "rotating"),
    status: null
  });
  ctx.setLayoutTool(tool);
  ctx.deactivateMeasureTool();
  ctx.resetDimensionDraft();
  ctx.clearWallDrawState();
  ctx.cancelSectionDraw({ silent: true });
  ctx.cancelKitchenWorktopDraw({ silent: true });
}

export function activateSelectToolState(ctx: SelectToolActivationContext) {
  ctx.enterSelectTool();
  reportEditorToolEntryStatus(ctx, "");
}

export function activateEditorToolPromptState(ctx: EditorToolPromptActivationContext) {
  ctx.enterTool();
  ctx.resetToolState();
  ctx.ensureFloorplanViewerTab();
  reportEditorToolEntryStatus(ctx, ctx.status);
}

export function resetEditorToolPromptFromEscape(ctx: EditorToolPromptEscapeContext) {
  ctx.resetToolState();
  ctx.clearToolHud();
  reportEditorToolEntryStatus(ctx, ctx.status);
}

export function reportEditorToolEntryStatus(ctx: EditorToolEntryStatusContext, status: string) {
  ctx.setUnderlayStatus(status);
  ctx.mountProps();
}

export function activateToggleEditorToolState(ctx: ToggleEditorToolActivationContext) {
  if (ctx.currentTool === ctx.tool) {
    ctx.activateSelectTool();
    return;
  }

  ctx.activateTool();
}
