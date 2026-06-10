import * as THREE from "three";
import type { AlignPickedLine } from "./localTypes";

export type PointerDimensionClickState = {
  picked: AlignPickedLine[];
  preview: unknown[];
};

export type PointerAlignClickState = {
  ref: AlignPickedLine | null;
  lastA: AlignPickedLine | null;
  lastB: AlignPickedLine | null;
  lastUntilMs: number;
};

export type PointerTrimClickState = {
  step: string;
  targetWallId: string | null;
  targetPick: AlignPickedLine | null;
  targetClick: THREE.Vector3 | null;
  lastTarget: AlignPickedLine | null;
  lastCutter: AlignPickedLine | null;
  lastUntilMs: number;
};

export function handleDimensionToolClick<TDimension>(params: {
  picked: AlignPickedLine | null;
  hitPoint: THREE.Vector3;
  dimensionState: PointerDimensionClickState;
  areAlignLinesParallel: (a: AlignPickedLine, b: AlignPickedLine) => boolean;
  isLinePicked: (line: AlignPickedLine) => boolean;
  buildDimensions: (picked: AlignPickedLine[], hitPoint: THREE.Vector3) => TDimension[];
  commitDimensions: (dimensions: TDimension[]) => void;
  resetDraft: () => void;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): void {
  if (params.picked) {
    if (params.dimensionState.picked.length > 0 && !params.areAlignLinesParallel(params.dimensionState.picked[0]!, params.picked)) {
      params.setStatus("Dimension: next line must be parallel with the first one.");
      return;
    }
    if (params.isLinePicked(params.picked)) {
      params.setStatus("Dimension: this line is already selected.");
      return;
    }
    params.dimensionState.picked.push(params.picked);
    params.dimensionState.preview = [];
    params.setStatus(
      params.dimensionState.picked.length === 1
        ? "Dimension: select another parallel line."
        : `Dimension: selected ${params.dimensionState.picked.length} lines. Add another one or click empty space.`
    );
    params.mountProps();
    return;
  }

  if (params.dimensionState.picked.length < 2) {
    params.setStatus("Dimension: select at least two parallel lines first.");
    return;
  }

  const dimensions = params.buildDimensions(params.dimensionState.picked, params.hitPoint);
  params.commitDimensions(dimensions);
  params.resetDraft();
  params.setStatus(dimensions.length > 0 ? `Dimension: inserted ${dimensions.length}. Select the next first line.` : "Dimension: insert failed.");
  params.mountProps();
}

export function handleAlignToolClick(params: {
  picked: AlignPickedLine | null;
  alignState: PointerAlignClickState;
  applyAlignBetweenPickedLines: (ref: AlignPickedLine, picked: AlignPickedLine) => { ok: boolean; reason: string };
  updateSelectionHighlights: () => void;
  commitHistory: () => void;
  setStatus: (message: string) => void;
  mountProps: () => void;
  now: number;
}): void {
  if (!params.picked) {
    params.setStatus(params.alignState.ref ? "Align: click a parallel line to align, or Esc for a new reference." : "Align: click reference line.");
    return;
  }

  if (!params.alignState.ref) {
    params.alignState.ref = params.picked;
    params.alignState.lastA = null;
    params.alignState.lastB = null;
    params.alignState.lastUntilMs = 0;
    params.setStatus("Align: click one or more parallel lines to align. Esc = new reference.");
    params.mountProps();
    return;
  }

  const ref = params.alignState.ref;
  const result = params.applyAlignBetweenPickedLines(ref, params.picked);
  if (!result.ok) {
    params.setStatus(result.reason);
    params.mountProps();
    return;
  }

  params.updateSelectionHighlights();
  params.commitHistory();
  params.alignState.lastA = ref;
  params.alignState.lastB = params.picked;
  params.alignState.lastUntilMs = params.now + 2500;
  params.setStatus(result.reason);
  params.mountProps();
}

export function handleTrimNoPick(params: {
  trimState: Pick<PointerTrimClickState, "step">;
  setStatus: (message: string) => void;
}): void {
  params.setStatus(params.trimState.step === "pickTarget" ? "Trim: click target wall line." : "Trim: click cutter line.");
}

export function handleTrimTargetPick(params: {
  picked: AlignPickedLine;
  hitPoint: THREE.Vector3;
  trimState: PointerTrimClickState;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): boolean {
  if (params.trimState.step !== "pickTarget") return false;
  if (!params.picked.wallId) return true;

  params.trimState.targetWallId = params.picked.wallId;
  params.trimState.targetPick = params.picked;
  params.trimState.targetClick = params.hitPoint.clone();
  params.trimState.step = "pickCutter";
  params.trimState.lastTarget = null;
  params.trimState.lastCutter = null;
  params.trimState.lastUntilMs = 0;
  params.setStatus("Trim: click cutter line...");
  params.mountProps();
  return true;
}

export function resetTrimTarget(params: {
  trimState: PointerTrimClickState;
  clearClick: boolean;
}): void {
  params.trimState.step = "pickTarget";
  params.trimState.targetWallId = null;
  params.trimState.targetPick = null;
  if (params.clearClick) params.trimState.targetClick = null;
}

export function handleMissingTrimTarget(params: {
  trimState: PointerTrimClickState;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): void {
  resetTrimTarget({ trimState: params.trimState, clearClick: false });
  params.setStatus("Trim: target missing. Click target wall...");
  params.mountProps();
}

export function handlePinnedTrimTarget(params: {
  trimState: PointerTrimClickState;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): void {
  resetTrimTarget({ trimState: params.trimState, clearClick: true });
  params.setStatus("Trim: target is pinned.");
  params.mountProps();
}

export function finishTrimNoChange(params: {
  trimState: PointerTrimClickState;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): void {
  params.setStatus("Trim: no change.");
  resetTrimTarget({ trimState: params.trimState, clearClick: true });
  params.mountProps();
}

export function finishTrimSuccess(params: {
  trimState: PointerTrimClickState;
  lastTarget: AlignPickedLine;
  lastCutter: AlignPickedLine;
  now: number;
  status: string;
  setStatus: (message: string) => void;
  mountProps: () => void;
}): void {
  params.trimState.lastTarget = params.lastTarget;
  params.trimState.lastCutter = params.lastCutter;
  params.trimState.lastUntilMs = params.now + 2500;
  resetTrimTarget({ trimState: params.trimState, clearClick: true });
  params.setStatus(params.status);
  params.mountProps();
}
