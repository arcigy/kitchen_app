import type { FloorBoundaryPoint } from "./localTypes";

export type SectionDrawState = {
  active: boolean;
  a: FloorBoundaryPoint | null;
  hoverPoint: FloorBoundaryPoint | null;
};

export type SectionDrawLineCleanupContext = {
  drawSnapOverlay: { hide: () => void };
  hideHoverCursor: () => void;
  mountProps: () => void;
  sectionDraw: SectionDrawState;
  setUnderlayStatus: (message: string) => void;
  updateSectionDrawPreview: () => void;
};

export type SectionToolActivationContext = {
  clearSectionSelection: () => void;
  clearSelectionBoxes: () => void;
  ensureFloorplanViewerTab: () => void;
  enterSectionTool: () => void;
  mountProps: () => void;
  sectionDraw: SectionDrawState;
  setUnderlayStatus: (message: string) => void;
  syncSelectionState: () => void;
  updateAllSectionVisuals: () => void;
  updateSelectionHighlights: () => void;
};

export function clearActiveSectionDrawLine(ctx: SectionDrawLineCleanupContext) {
  ctx.sectionDraw.a = null;
  ctx.sectionDraw.hoverPoint = null;
  ctx.updateSectionDrawPreview();
  ctx.hideHoverCursor();
  ctx.drawSnapOverlay.hide();
  ctx.setUnderlayStatus("Section: current line canceled. Click first point.");
  ctx.mountProps();
}

export function activateSectionToolState(ctx: SectionToolActivationContext) {
  ctx.enterSectionTool();
  ctx.ensureFloorplanViewerTab();
  ctx.clearSectionSelection();
  ctx.clearSelectionBoxes();
  ctx.sectionDraw.active = true;
  ctx.syncSelectionState();
  ctx.updateAllSectionVisuals();
  ctx.updateSelectionHighlights();
  ctx.setUnderlayStatus("Section: click first point, then second point. Space mirrors direction.");
  ctx.mountProps();
}
