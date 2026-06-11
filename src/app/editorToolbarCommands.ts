import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import type { StartTransformOptions, TransformKind } from "./transformStateTypes";

export type ToolbarTransformCommandContext = {
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => void;
};

export type ToolbarMeasureToggleCommandContext = {
  layoutTool: string;
  setToolMeasure: () => void;
  setToolSelect: () => void;
};

export type ToolbarToolCommandContext = {
  setToolAlign: () => void;
  setToolDimension: () => void;
  setToolSection: () => void;
  setToolSelect: () => void;
  setToolTrim: () => void;
  setToolWall: () => void;
};

export type ToolbarHistoryCommandContext = {
  S: AppState;
  helpers: HistoryHelpers;
  redo: (S: AppState, helpers: HistoryHelpers) => void;
  undo: (S: AppState, helpers: HistoryHelpers) => void;
};

export type ToolbarSelectionEditCommandContext = {
  deleteSelected: () => void;
  duplicateSelected: () => void;
};

export function runToolbarMoveCommand(ctx: ToolbarTransformCommandContext) {
  ctx.startTransformFromSelection("move", { sticky: true, toggle: true });
}

export function runToolbarRotateCommand(ctx: ToolbarTransformCommandContext) {
  ctx.startTransformFromSelection("rotate");
}

export function runToolbarMeasureToggleCommand(ctx: ToolbarMeasureToggleCommandContext) {
  if (ctx.layoutTool === "measure") ctx.setToolSelect();
  else ctx.setToolMeasure();
}

export function runToolbarSelectCommand(ctx: Pick<ToolbarToolCommandContext, "setToolSelect">) {
  ctx.setToolSelect();
}

export function runToolbarWallCommand(ctx: Pick<ToolbarToolCommandContext, "setToolWall">) {
  ctx.setToolWall();
}

export function runToolbarAlignCommand(ctx: Pick<ToolbarToolCommandContext, "setToolAlign">) {
  ctx.setToolAlign();
}

export function runToolbarTrimCommand(ctx: Pick<ToolbarToolCommandContext, "setToolTrim">) {
  ctx.setToolTrim();
}

export function runToolbarDimensionCommand(ctx: Pick<ToolbarToolCommandContext, "setToolDimension">) {
  ctx.setToolDimension();
}

export function runToolbarSectionCommand(ctx: Pick<ToolbarToolCommandContext, "setToolSection">) {
  ctx.setToolSection();
}

export function runToolbarUndoCommand(ctx: ToolbarHistoryCommandContext) {
  ctx.undo(ctx.S, ctx.helpers);
}

export function runToolbarRedoCommand(ctx: ToolbarHistoryCommandContext) {
  ctx.redo(ctx.S, ctx.helpers);
}

export function runToolbarDuplicateCommand(ctx: Pick<ToolbarSelectionEditCommandContext, "duplicateSelected">) {
  ctx.duplicateSelected();
}

export function runToolbarDeleteCommand(ctx: Pick<ToolbarSelectionEditCommandContext, "deleteSelected">) {
  ctx.deleteSelected();
}
