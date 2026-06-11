import type { StartTransformOptions, TransformKind } from "./transformStateTypes";

export type ToolbarTransformCommandContext = {
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => void;
};

export type ToolbarMeasureToggleCommandContext = {
  layoutTool: string;
  setToolMeasure: () => void;
  setToolSelect: () => void;
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
