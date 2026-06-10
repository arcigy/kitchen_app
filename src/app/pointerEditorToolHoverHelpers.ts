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
  if (params.dimensionState.hover) {
    params.updateHudLine(params.hudHoverLine, params.dimensionState.hover.segA, params.dimensionState.hover.segB, params.hudLineThickness);
  } else {
    params.hudHoverLine.visible = false;
  }

  if (params.dimensionState.picked[0]) {
    params.updateHudLine(params.hudPickLine1, params.dimensionState.picked[0].segA, params.dimensionState.picked[0].segB, params.hudLineThickness);
  } else {
    params.hudPickLine1.visible = false;
  }

  const lastPicked = params.dimensionState.picked.length > 1 ? params.dimensionState.picked[params.dimensionState.picked.length - 1] : null;
  if (lastPicked) {
    params.updateHudLine(params.hudPickLine2, lastPicked.segA, lastPicked.segB, params.hudLineThickness);
  } else {
    params.hudPickLine2.visible = false;
  }

  params.dimensionState.preview =
    !picked && params.dimensionState.picked.length >= 2
      ? params.buildPreviewDimensions(params.dimensionState.picked, params.hitPoint)
      : [];
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
    params.dimensionState.hover = null;
    params.dimensionState.preview = [];
    params.clearToolHud();
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
  if (params.picked) params.updateHudLine(params.hudHoverLine, params.picked.segA, params.picked.segB, params.hudLineThickness);
  else params.hudHoverLine.visible = false;

  if (params.alignState.ref) {
    params.updateHudLine(params.hudPickLine1, params.alignState.ref.segA, params.alignState.ref.segB, params.hudLineThickness);
    params.hudPickLine2.visible = false;
  } else if (params.alignState.lastA && params.alignState.lastB && params.alignState.lastUntilMs > params.now) {
    params.updateHudLine(params.hudPickLine1, params.alignState.lastA.segA, params.alignState.lastA.segB, params.hudLineThickness);
    params.updateHudLine(params.hudPickLine2, params.alignState.lastB.segA, params.alignState.lastB.segB, params.hudLineThickness);
  } else {
    params.alignState.lastA = null;
    params.alignState.lastB = null;
    params.alignState.lastUntilMs = 0;
    params.hudPickLine1.visible = false;
    params.hudPickLine2.visible = false;
  }
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
  if (params.picked) params.updateHudLine(params.hudHoverLine, params.picked.segA, params.picked.segB, params.hudLineThickness);
  else params.hudHoverLine.visible = false;

  if (params.trimState.targetPick) params.updateHudLine(params.hudPickLine1, params.trimState.targetPick.segA, params.trimState.targetPick.segB, params.hudLineThickness);
  else params.hudPickLine1.visible = false;

  if (params.trimState.lastTarget && params.trimState.lastCutter && params.trimState.lastUntilMs > params.now) {
    params.updateHudLine(params.hudPickLine1, params.trimState.lastTarget.segA, params.trimState.lastTarget.segB, params.hudLineThickness);
    params.updateHudLine(params.hudPickLine2, params.trimState.lastCutter.segA, params.trimState.lastCutter.segB, params.hudLineThickness);
  } else if (params.trimState.step === "pickCutter" && params.trimState.targetPick) {
    params.hudPickLine2.visible = false;
  } else if (params.trimState.lastUntilMs <= params.now) {
    params.trimState.lastTarget = null;
    params.trimState.lastCutter = null;
    params.trimState.lastUntilMs = 0;
    if (!params.trimState.targetPick) {
      params.hudPickLine1.visible = false;
      params.hudPickLine2.visible = false;
    }
  }
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
    params.clearToolHud();
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
