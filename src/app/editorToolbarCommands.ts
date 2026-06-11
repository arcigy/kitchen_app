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
