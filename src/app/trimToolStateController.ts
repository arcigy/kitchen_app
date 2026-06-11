import { activateEditorToolPromptState } from "./editorToolEntryController";

export type TrimState = {
  step: "pickTarget" | string;
  targetWallId: string | null;
  targetPick: unknown | null;
  targetClick: unknown | null;
  hover: unknown | null;
  lastTarget: unknown | null;
  lastCutter: unknown | null;
  lastUntilMs: number;
};

export type TrimToolStateContext = {
  trimState: TrimState;
};

export type TrimToolActivationContext = TrimToolStateContext & {
  ensureFloorplanViewerTab: () => void;
  enterTrimTool: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export type TrimTargetEscapeContext = TrimToolStateContext & {
  clearToolHud: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export function resetTrimState(ctx: TrimToolStateContext) {
  ctx.trimState.step = "pickTarget";
  ctx.trimState.targetWallId = null;
  ctx.trimState.targetPick = null;
  ctx.trimState.targetClick = null;
  ctx.trimState.hover = null;
  ctx.trimState.lastTarget = null;
  ctx.trimState.lastCutter = null;
  ctx.trimState.lastUntilMs = 0;
}

export function activateTrimToolState(ctx: TrimToolActivationContext) {
  activateEditorToolPromptState({
    ensureFloorplanViewerTab: ctx.ensureFloorplanViewerTab,
    enterTool: ctx.enterTrimTool,
    mountProps: ctx.mountProps,
    resetToolState: () => resetTrimState(ctx),
    setUnderlayStatus: ctx.setUnderlayStatus,
    status: "Trim: click target wall..."
  });
}

export function resetTrimTargetFromEscape(ctx: TrimTargetEscapeContext) {
  resetTrimState(ctx);
  ctx.clearToolHud();
  ctx.setUnderlayStatus("Trim: click target wall...");
  ctx.mountProps();
}
