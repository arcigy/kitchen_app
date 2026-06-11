import * as THREE from "three";
import type { AlignPickedLine } from "./localTypes";

type HudLine = THREE.Mesh;
type MousePoint = { x: number; y: number };
type UpdateHudLine = (hud: HudLine, a: THREE.Vector3, b: THREE.Vector3, thickness: number) => void;

export type PointerDimensionHoverState = {
  hover: AlignPickedLine | null;
  picked: AlignPickedLine[];
  preview: unknown[];
};

export type PointerAlignHoverState = {
  ref: AlignPickedLine | null;
  hover: AlignPickedLine | null;
  lastA: AlignPickedLine | null;
  lastB: AlignPickedLine | null;
  lastUntilMs: number;
};

export type PointerTrimHoverState = {
  hover: AlignPickedLine | null;
  lastCutter: AlignPickedLine | null;
  lastTarget: AlignPickedLine | null;
  lastUntilMs: number;
  step: string;
  targetPick: AlignPickedLine | null;
};

export function updatePickedHudLine(params: {
  picked: AlignPickedLine | null | undefined;
  hudLine: HudLine;
  hudLineThickness: number;
  updateHudLine: UpdateHudLine;
}): void {
  if (params.picked) {
    params.updateHudLine(params.hudLine, params.picked.segA, params.picked.segB, params.hudLineThickness);
  } else {
    params.hudLine.visible = false;
  }
}

export function updateDimensionToolHover(params: {
  hitPoint: THREE.Vector3;
  mouse: MousePoint;
  rect: DOMRect;
  dimensionState: PointerDimensionHoverState;
  pickDimensionLineAt?: (hitPoint: THREE.Vector3, mouse: MousePoint, rect: DOMRect) => AlignPickedLine | null;
  pickAlignLineAt: (hitPoint: THREE.Vector3, mouse: MousePoint, rect: DOMRect) => AlignPickedLine | null;
  areAlignLinesParallel: (a: AlignPickedLine, b: AlignPickedLine) => boolean;
  buildPreviewDimensions: (picked: AlignPickedLine[], hitPoint: THREE.Vector3) => unknown[];
  hudHoverLine: HudLine;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
  hudLineThickness: number;
  updateHudLine: UpdateHudLine;
}): void {
  const picked = params.pickDimensionLineAt?.(params.hitPoint, params.mouse, params.rect) ?? params.pickAlignLineAt(params.hitPoint, params.mouse, params.rect);
  const canPick = !picked || params.dimensionState.picked.length === 0 || params.areAlignLinesParallel(params.dimensionState.picked[0]!, picked);
  params.dimensionState.hover = canPick ? picked : null;
  updatePickedHudLine({
    picked: params.dimensionState.hover,
    hudLine: params.hudHoverLine,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  updatePickedHudLine({
    picked: params.dimensionState.picked[0],
    hudLine: params.hudPickLine1,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  const lastPicked = params.dimensionState.picked.length > 1 ? params.dimensionState.picked[params.dimensionState.picked.length - 1] : null;
  updatePickedHudLine({
    picked: lastPicked,
    hudLine: params.hudPickLine2,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  params.dimensionState.preview =
    !picked && params.dimensionState.picked.length >= 2
      ? params.buildPreviewDimensions(params.dimensionState.picked, params.hitPoint)
      : [];
}

export function resetDimensionPointerMoveHover(params: {
  dimensionState: Pick<PointerDimensionHoverState, "hover" | "preview">;
  clearToolHud: () => void;
}): void {
  params.dimensionState.hover = null;
  params.dimensionState.preview = [];
  params.clearToolHud();
}

export function updateDimensionToolPointerMoveHover(params: {
  hitPoint: THREE.Vector3 | null;
  mouse: MousePoint | null;
  rect: DOMRect;
  dimensionState: PointerDimensionHoverState;
  pickDimensionLineAt?: (hitPoint: THREE.Vector3, mouse: MousePoint, rect: DOMRect) => AlignPickedLine | null;
  pickAlignLineAt: (hitPoint: THREE.Vector3, mouse: MousePoint, rect: DOMRect) => AlignPickedLine | null;
  areAlignLinesParallel: (a: AlignPickedLine, b: AlignPickedLine) => boolean;
  buildPreviewDimensions: (picked: AlignPickedLine[], hitPoint: THREE.Vector3) => unknown[];
  hudHoverLine: HudLine;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
  hudLineThickness: number;
  updateHudLine: UpdateHudLine;
  clearToolHud: () => void;
}): void {
  if (!params.hitPoint) {
    resetDimensionPointerMoveHover({
      dimensionState: params.dimensionState,
      clearToolHud: params.clearToolHud
    });
    return;
  }

  if (!params.mouse) return;
  updateDimensionToolHover({
    hitPoint: params.hitPoint,
    mouse: params.mouse,
    rect: params.rect,
    dimensionState: params.dimensionState,
    pickDimensionLineAt: params.pickDimensionLineAt,
    pickAlignLineAt: params.pickAlignLineAt,
    areAlignLinesParallel: params.areAlignLinesParallel,
    buildPreviewDimensions: params.buildPreviewDimensions,
    hudHoverLine: params.hudHoverLine,
    hudPickLine1: params.hudPickLine1,
    hudPickLine2: params.hudPickLine2,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });
}

export function updateAlignToolHover(params: {
  picked: AlignPickedLine | null;
  alignState: PointerAlignHoverState;
  hudHoverLine: HudLine;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
  hudLineThickness: number;
  now: number;
  updateHudLine: UpdateHudLine;
}): void {
  params.alignState.hover = params.picked;
  updatePickedHudLine({
    picked: params.picked,
    hudLine: params.hudHoverLine,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  if (params.alignState.ref) {
    updatePickedHudLine({
      picked: params.alignState.ref,
      hudLine: params.hudPickLine1,
      hudLineThickness: params.hudLineThickness,
      updateHudLine: params.updateHudLine
    });
    params.hudPickLine2.visible = false;
  } else if (params.alignState.lastA && params.alignState.lastB && params.alignState.lastUntilMs > params.now) {
    updatePickedHudLine({
      picked: params.alignState.lastA,
      hudLine: params.hudPickLine1,
      hudLineThickness: params.hudLineThickness,
      updateHudLine: params.updateHudLine
    });
    updatePickedHudLine({
      picked: params.alignState.lastB,
      hudLine: params.hudPickLine2,
      hudLineThickness: params.hudLineThickness,
      updateHudLine: params.updateHudLine
    });
  } else {
    resetAlignRecentFeedback({
      alignState: params.alignState,
      hudPickLine1: params.hudPickLine1,
      hudPickLine2: params.hudPickLine2
    });
  }
}

export function resetAlignRecentFeedback(params: {
  alignState: Pick<PointerAlignHoverState, "lastA" | "lastB" | "lastUntilMs">;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
}): void {
  params.alignState.lastA = null;
  params.alignState.lastB = null;
  params.alignState.lastUntilMs = 0;
  params.hudPickLine1.visible = false;
  params.hudPickLine2.visible = false;
}

export function updateTrimToolHover(params: {
  picked: AlignPickedLine | null;
  trimState: PointerTrimHoverState;
  hudHoverLine: HudLine;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
  hudLineThickness: number;
  now: number;
  updateHudLine: UpdateHudLine;
}): void {
  params.trimState.hover = params.picked;
  updatePickedHudLine({
    picked: params.picked,
    hudLine: params.hudHoverLine,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  updatePickedHudLine({
    picked: params.trimState.targetPick,
    hudLine: params.hudPickLine1,
    hudLineThickness: params.hudLineThickness,
    updateHudLine: params.updateHudLine
  });

  if (params.trimState.lastTarget && params.trimState.lastCutter && params.trimState.lastUntilMs > params.now) {
    updatePickedHudLine({
      picked: params.trimState.lastTarget,
      hudLine: params.hudPickLine1,
      hudLineThickness: params.hudLineThickness,
      updateHudLine: params.updateHudLine
    });
    updatePickedHudLine({
      picked: params.trimState.lastCutter,
      hudLine: params.hudPickLine2,
      hudLineThickness: params.hudLineThickness,
      updateHudLine: params.updateHudLine
    });
  } else if (params.trimState.step === "pickCutter" && params.trimState.targetPick) {
    params.hudPickLine2.visible = false;
  } else if (params.trimState.lastUntilMs <= params.now) {
    resetTrimRecentFeedback({
      trimState: params.trimState,
      hudPickLine1: params.hudPickLine1,
      hudPickLine2: params.hudPickLine2
    });
  }
}

export function resetTrimRecentFeedback(params: {
  trimState: Pick<PointerTrimHoverState, "lastTarget" | "lastCutter" | "lastUntilMs" | "targetPick">;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
}): void {
  params.trimState.lastTarget = null;
  params.trimState.lastCutter = null;
  params.trimState.lastUntilMs = 0;
  if (!params.trimState.targetPick) {
    params.hudPickLine1.visible = false;
    params.hudPickLine2.visible = false;
  }
}

export function resetAlignTrimPointerMoveHover(params: {
  clearToolHud: () => void;
}): void {
  params.clearToolHud();
}

export function updateAlignTrimToolPointerMoveHover(params: {
  tool: "align" | "trim";
  hitPoint: THREE.Vector3 | null;
  mouse: MousePoint | null;
  rect: DOMRect;
  alignState: PointerAlignHoverState;
  trimState: PointerTrimHoverState;
  pickAlignLineAt: (hitPoint: THREE.Vector3, mouse: MousePoint, rect: DOMRect) => AlignPickedLine | null;
  hudHoverLine: HudLine;
  hudPickLine1: HudLine;
  hudPickLine2: HudLine;
  hudLineThickness: number;
  now: number;
  updateHudLine: UpdateHudLine;
  clearToolHud: () => void;
}): void {
  if (!params.hitPoint) {
    resetAlignTrimPointerMoveHover({
      clearToolHud: params.clearToolHud
    });
    return;
  }

  if (!params.mouse) return;
  const picked = params.pickAlignLineAt(params.hitPoint, params.mouse, params.rect);
  if (params.tool === "align") {
    updateAlignToolHover({
      picked,
      alignState: params.alignState,
      hudHoverLine: params.hudHoverLine,
      hudPickLine1: params.hudPickLine1,
      hudPickLine2: params.hudPickLine2,
      hudLineThickness: params.hudLineThickness,
      now: params.now,
      updateHudLine: params.updateHudLine
    });
    return;
  }

  updateTrimToolHover({
    picked,
    trimState: params.trimState,
    hudHoverLine: params.hudHoverLine,
    hudPickLine1: params.hudPickLine1,
    hudPickLine2: params.hudPickLine2,
    hudLineThickness: params.hudLineThickness,
    now: params.now,
    updateHudLine: params.updateHudLine
  });
}
