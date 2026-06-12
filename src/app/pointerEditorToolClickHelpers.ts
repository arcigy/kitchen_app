import * as THREE from "three";
import type { AlignPickedLine } from "./localTypes";
import { refreshSelectionHighlights } from "./selectionController";

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
    addDimensionPickedLine({
      dimensionState: params.dimensionState,
      picked: params.picked
    });
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

  const insertedCount = commitDimensionDraft({
    picked: params.dimensionState.picked,
    hitPoint: params.hitPoint,
    buildDimensions: params.buildDimensions,
    commitDimensions: params.commitDimensions,
    resetDraft: params.resetDraft
  });
  params.setStatus(insertedCount > 0 ? `Dimension: inserted ${insertedCount}. Select the next first line.` : "Dimension: insert failed.");
  params.mountProps();
}

export function addDimensionPickedLine(params: {
  dimensionState: PointerDimensionClickState;
  picked: AlignPickedLine;
}): void {
  params.dimensionState.picked.push(params.picked);
  params.dimensionState.preview = [];
}

export function commitDimensionDraft<TDimension>(params: {
  picked: AlignPickedLine[];
  hitPoint: THREE.Vector3;
  buildDimensions: (picked: AlignPickedLine[], hitPoint: THREE.Vector3) => TDimension[];
  commitDimensions: (dimensions: TDimension[]) => void;
  resetDraft: () => void;
}): number {
  const dimensions = params.buildDimensions(params.picked, params.hitPoint);
  params.commitDimensions(dimensions);
  params.resetDraft();
  return dimensions.length;
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
    setAlignReferencePick({
      alignState: params.alignState,
      picked: params.picked
    });
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

  refreshSelectionHighlights(params);
  params.commitHistory();
  setAlignRecentFeedback({
    alignState: params.alignState,
    lastA: ref,
    lastB: params.picked,
    now: params.now
  });
  params.setStatus(result.reason);
  params.mountProps();
}

export function setAlignReferencePick(params: {
  alignState: PointerAlignClickState;
  picked: AlignPickedLine;
}): void {
  params.alignState.ref = params.picked;
  params.alignState.lastA = null;
  params.alignState.lastB = null;
  params.alignState.lastUntilMs = 0;
}

export function setAlignRecentFeedback(params: {
  alignState: Pick<PointerAlignClickState, "lastA" | "lastB" | "lastUntilMs">;
  lastA: AlignPickedLine;
  lastB: AlignPickedLine;
  now: number;
}): void {
  applyLinePairRecentFeedback({
    lastA: params.lastA,
    lastB: params.lastB,
    now: params.now,
    setLastA: (line) => {
      params.alignState.lastA = line;
    },
    setLastB: (line) => {
      params.alignState.lastB = line;
    },
    setLastUntilMs: (untilMs) => {
      params.alignState.lastUntilMs = untilMs;
    }
  });
}

export function applyLinePairRecentFeedback(params: {
  lastA: AlignPickedLine;
  lastB: AlignPickedLine;
  now: number;
  setLastA: (line: AlignPickedLine) => void;
  setLastB: (line: AlignPickedLine) => void;
  setLastUntilMs: (untilMs: number) => void;
}): void {
  params.setLastA(params.lastA);
  params.setLastB(params.lastB);
  params.setLastUntilMs(params.now + 2500);
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

  setTrimTargetPick({
    trimState: params.trimState,
    picked: params.picked,
    hitPoint: params.hitPoint
  });
  params.setStatus("Trim: click cutter line...");
  params.mountProps();
  return true;
}

export function setTrimTargetPick(params: {
  trimState: PointerTrimClickState;
  picked: AlignPickedLine & { wallId?: string | null };
  hitPoint: THREE.Vector3;
}): void {
  params.trimState.targetWallId = params.picked.wallId ?? null;
  params.trimState.targetPick = params.picked;
  params.trimState.targetClick = params.hitPoint.clone();
  params.trimState.step = "pickCutter";
  params.trimState.lastTarget = null;
  params.trimState.lastCutter = null;
  params.trimState.lastUntilMs = 0;
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
  setTrimRecentFeedback({
    trimState: params.trimState,
    lastTarget: params.lastTarget,
    lastCutter: params.lastCutter,
    now: params.now
  });
  resetTrimTarget({ trimState: params.trimState, clearClick: true });
  params.setStatus(params.status);
  params.mountProps();
}

export function setTrimRecentFeedback(params: {
  trimState: Pick<PointerTrimClickState, "lastTarget" | "lastCutter" | "lastUntilMs">;
  lastTarget: AlignPickedLine;
  lastCutter: AlignPickedLine;
  now: number;
}): void {
  applyLinePairRecentFeedback({
    lastA: params.lastTarget,
    lastB: params.lastCutter,
    now: params.now,
    setLastA: (line) => {
      params.trimState.lastTarget = line;
    },
    setLastB: (line) => {
      params.trimState.lastCutter = line;
    },
    setLastUntilMs: (untilMs) => {
      params.trimState.lastUntilMs = untilMs;
    }
  });
}
