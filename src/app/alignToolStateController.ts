export type AlignState = {
  ref: unknown | null;
  hover: unknown | null;
  lastA: unknown | null;
  lastB: unknown | null;
  lastUntilMs: number;
};

export type AlignToolStateContext = {
  alignState: AlignState;
};

export type AlignToolActivationContext = AlignToolStateContext & {
  ensureFloorplanViewerTab: () => void;
  enterAlignTool: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export type AlignReferenceEscapeContext = AlignToolStateContext & {
  clearToolHud: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export function clearAlignReference(ctx: AlignToolStateContext) {
  ctx.alignState.ref = null;
}

export function resetAlignState(ctx: AlignToolStateContext) {
  ctx.alignState.ref = null;
  ctx.alignState.hover = null;
  ctx.alignState.lastA = null;
  ctx.alignState.lastB = null;
  ctx.alignState.lastUntilMs = 0;
}

export function activateAlignToolState(ctx: AlignToolActivationContext) {
  ctx.enterAlignTool();
  resetAlignState(ctx);
  ctx.ensureFloorplanViewerTab();
  ctx.setUnderlayStatus("Align: click reference line...");
  ctx.mountProps();
}

export function clearAlignReferenceFromEscape(ctx: AlignReferenceEscapeContext) {
  clearAlignReference(ctx);
  ctx.clearToolHud();
  ctx.setUnderlayStatus("Align: click reference line...");
  ctx.mountProps();
}
