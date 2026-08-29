import type { StartTransformOptions, TransformKind, TransformStep } from "./transformStateTypes";

type MoveSelectionContinuationState = {
  kind: TransformKind | null;
  step: TransformStep | null;
};

type MoveSelectionContinuationContext = {
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => boolean;
  transformState: MoveSelectionContinuationState;
};

export function continueMoveAfterObjectSelection(ctx: MoveSelectionContinuationContext) {
  if (ctx.transformState.kind !== "move" || ctx.transformState.step !== "selectElements") return false;
  ctx.startTransformFromSelection("move", { sticky: true });
  return true;
}
