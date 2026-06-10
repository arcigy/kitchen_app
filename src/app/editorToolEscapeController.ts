export type EditorToolStopContext = {
  setUnderlayStatus: (message: string) => void;
  stopTool: () => void;
};

export type EditorEscapeEvent = {
  target: EventTarget | null;
  preventDefault: () => void;
};

export type EditorLayoutEscapeContext = {
  alignHasReference: () => boolean;
  cancelColumnPlacement: () => void;
  clearActiveAlignReference: () => void;
  clearActiveSectionLine: () => void;
  clearActiveTrimTarget: () => void;
  dimensionEscape: () => void;
  isColumnPlacementActive: () => boolean;
  isTypingTarget: (target: EventTarget | null) => boolean;
  layoutTool: string;
  mode: string;
  sectionHasActiveLine: () => boolean;
  stopMeasureTool: () => void;
  stopSelectTool: () => void;
  stopSectionTool: () => void;
  stopWallTool: () => void;
  trimHasActiveTarget: () => boolean;
};

export function stopEditorToolFromEscape(ctx: EditorToolStopContext, status: string) {
  ctx.stopTool();
  ctx.setUnderlayStatus(status);
}

export function finishEditorEscape(ev: EditorEscapeEvent) {
  ev.preventDefault();
  return true;
}

export function handleEditorLayoutEscape(ctx: EditorLayoutEscapeContext, ev: EditorEscapeEvent) {
  if (ctx.mode !== "layout") return false;
  if (ctx.isTypingTarget(ev.target)) return false;

  if (ctx.isColumnPlacementActive()) {
    ctx.cancelColumnPlacement();
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "align") {
    if (ctx.alignHasReference()) {
      ctx.clearActiveAlignReference();
    } else {
      ctx.stopSelectTool();
    }
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "trim") {
    if (ctx.trimHasActiveTarget()) {
      ctx.clearActiveTrimTarget();
    } else {
      ctx.stopSelectTool();
    }
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "measure") {
    ctx.stopMeasureTool();
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "dimension") {
    ctx.dimensionEscape();
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "section") {
    if (ctx.sectionHasActiveLine()) {
      ctx.clearActiveSectionLine();
    } else {
      ctx.stopSectionTool();
    }
    return finishEditorEscape(ev);
  }

  if (ctx.layoutTool === "wall") {
    ctx.stopWallTool();
    return finishEditorEscape(ev);
  }

  return false;
}
