import { refreshSelectionVisualState } from "./selectionController";

export type DimensionToolEscapeContext = {
  dimensionState: { picked: unknown[] };
  setUnderlayStatus: (message: string) => void;
  stopDimensionTool: () => void;
  technicalDimensions: { resetDraft: () => void };
};

export type DimensionToolActivationContext = {
  clearSelectionForDrawingTool: () => void;
  ensureFloorplanViewerTab: () => void;
  enterDimensionTool: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
  syncSelectionState: () => void;
  updateSelectionHighlights: () => void;
};

export function handleDimensionEscape(ctx: DimensionToolEscapeContext) {
  if (ctx.dimensionState.picked.length > 0) {
    ctx.technicalDimensions.resetDraft();
    ctx.setUnderlayStatus("Dimension: selection cleared. Pick the first line.");
    return "draft-cleared" as const;
  }

  ctx.stopDimensionTool();
  ctx.setUnderlayStatus("Dimension: stopped.");
  return "stopped" as const;
}

export function activateDimensionToolState(ctx: DimensionToolActivationContext) {
  ctx.enterDimensionTool();
  ctx.ensureFloorplanViewerTab();
  ctx.clearSelectionForDrawingTool();
  refreshSelectionVisualState(ctx);
  ctx.setUnderlayStatus("Dimension: pick the first line, then another parallel line. Click empty space to place dimension.");
  ctx.mountProps();
}
