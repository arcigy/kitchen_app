import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import {
  addDimensionPickedLine,
  applyLinePairRecentFeedback,
  commitDimensionDraft,
  finishTrimNoChange,
  finishTrimSuccess,
  handleAlignToolClick,
  handleDimensionToolClick,
  handleMissingTrimTarget,
  handlePinnedTrimTarget,
  handleTrimNoPick,
  handleTrimTargetPick,
  reportEditorToolStatus,
  resetTrimTargetAndReport,
  setAlignReferencePick,
  setAlignRecentFeedback,
  setTrimTargetPick,
  setTrimRecentFeedback,
  type PointerTrimClickState
} from "./pointerEditorToolClickHelpers";

function line(label: string): AlignPickedLine {
  return {
    p: new THREE.Vector3(),
    dir: new THREE.Vector3(1, 0, 0),
    segA: new THREE.Vector3(0, 0, 0),
    segB: new THREE.Vector3(1, 0, 0),
    label,
    targetKind: "wall",
    lineRole: "center"
  };
}

function trimState(overrides: Partial<PointerTrimClickState> = {}): PointerTrimClickState {
  return {
    step: "pickTarget",
    targetWallId: null,
    targetPick: null,
    targetClick: null,
    lastTarget: null,
    lastCutter: null,
    lastUntilMs: 0,
    ...overrides
  };
}

describe("pointer editor tool click helpers", () => {
  it("adds dimension picked line and clears existing preview", () => {
    const first = line("first");
    const picked = line("picked");
    const state = { picked: [first], preview: ["old"] as unknown[] };

    addDimensionPickedLine({
      dimensionState: state,
      picked
    });

    expect(state.picked).toEqual([first, picked]);
    expect(state.preview).toEqual([]);
  });

  it("adds a valid dimension picked line and clears preview", () => {
    const picked = line("picked");
    const state = { picked: [] as AlignPickedLine[], preview: ["old"] as unknown[] };
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    handleDimensionToolClick({
      picked,
      hitPoint: new THREE.Vector3(),
      dimensionState: state,
      areAlignLinesParallel: () => true,
      isLinePicked: () => false,
      buildDimensions: () => [],
      commitDimensions: vi.fn(),
      resetDraft: vi.fn(),
      setStatus,
      mountProps
    });

    expect(state.picked).toEqual([picked]);
    expect(state.preview).toEqual([]);
    expect(setStatus).toHaveBeenCalledWith("Dimension: select another parallel line.");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("blocks non-parallel dimension picked lines without mutating selection", () => {
    const first = line("first");
    const picked = line("picked");
    const state = { picked: [first], preview: ["old"] as unknown[] };
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    handleDimensionToolClick({
      picked,
      hitPoint: new THREE.Vector3(),
      dimensionState: state,
      areAlignLinesParallel: () => false,
      isLinePicked: () => false,
      buildDimensions: () => [],
      commitDimensions: vi.fn(),
      resetDraft: vi.fn(),
      setStatus,
      mountProps
    });

    expect(state.picked).toEqual([first]);
    expect(state.preview).toEqual(["old"]);
    expect(setStatus).toHaveBeenCalledWith("Dimension: next line must be parallel with the first one.");
    expect(mountProps).not.toHaveBeenCalled();
  });

  it("commits dimensions when clicking empty space after two picked lines", () => {
    const first = line("first");
    const second = line("second");
    const state = { picked: [first, second], preview: [] as unknown[] };
    const dimensions = [{ id: "dim-1" }, { id: "dim-2" }];
    const commitDimensions = vi.fn();
    const resetDraft = vi.fn();
    const setStatus = vi.fn();

    handleDimensionToolClick({
      picked: null,
      hitPoint: new THREE.Vector3(5, 0, 0),
      dimensionState: state,
      areAlignLinesParallel: () => true,
      isLinePicked: () => false,
      buildDimensions: (picked, hitPoint) => [{ id: "dim-1", count: picked.length, x: hitPoint.x }, dimensions[1]],
      commitDimensions,
      resetDraft,
      setStatus,
      mountProps: vi.fn()
    });

    expect(commitDimensions).toHaveBeenCalledWith([{ id: "dim-1", count: 2, x: 5 }, { id: "dim-2" }]);
    expect(resetDraft).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith("Dimension: inserted 2. Select the next first line.");
  });

  it("commits dimension draft and returns inserted count", () => {
    const first = line("first");
    const second = line("second");
    const picked = [first, second];
    const hitPoint = new THREE.Vector3(5, 0, 0);
    const dimensions = [{ id: "dim-1" }, { id: "dim-2" }];
    const buildDimensions = vi.fn(() => dimensions);
    const commitDimensions = vi.fn();
    const resetDraft = vi.fn();

    const insertedCount = commitDimensionDraft({
      picked,
      hitPoint,
      buildDimensions,
      commitDimensions,
      resetDraft
    });

    expect(insertedCount).toBe(2);
    expect(buildDimensions).toHaveBeenCalledWith(picked, hitPoint);
    expect(commitDimensions).toHaveBeenCalledWith(dimensions);
    expect(resetDraft).toHaveBeenCalledOnce();
  });

  it("reports editor tool status and remounts props", () => {
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    reportEditorToolStatus({
      status: "Tool: ready.",
      setStatus,
      mountProps
    });

    expect(setStatus).toHaveBeenCalledExactlyOnceWith("Tool: ready.");
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("sets the first align reference without committing history", () => {
    const picked = line("picked");
    const state = { ref: null, lastA: line("old-a"), lastB: line("old-b"), lastUntilMs: 5 };
    const commitHistory = vi.fn();
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    handleAlignToolClick({
      picked,
      alignState: state,
      applyAlignBetweenPickedLines: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      commitHistory,
      setStatus,
      mountProps,
      now: 100
    });

    expect(state.ref).toBe(picked);
    expect(state.lastA).toBeNull();
    expect(state.lastB).toBeNull();
    expect(state.lastUntilMs).toBe(0);
    expect(commitHistory).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith("Align: click one or more parallel lines to align. Esc = new reference.");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("sets align reference pick and clears previous recent feedback", () => {
    const picked = line("picked");
    const state = { ref: null, lastA: line("old-a"), lastB: line("old-b"), lastUntilMs: 5 };

    setAlignReferencePick({
      alignState: state,
      picked
    });

    expect(state.ref).toBe(picked);
    expect(state.lastA).toBeNull();
    expect(state.lastB).toBeNull();
    expect(state.lastUntilMs).toBe(0);
  });

  it("commits successful align and stores recent feedback lines", () => {
    const ref = line("ref");
    const picked = line("picked");
    const state = { ref, lastA: null, lastB: null, lastUntilMs: 0 };
    const commitHistory = vi.fn();
    const updateSelectionHighlights = vi.fn();
    const setStatus = vi.fn();

    handleAlignToolClick({
      picked,
      alignState: state,
      applyAlignBetweenPickedLines: () => ({ ok: true, reason: "Aligned." }),
      updateSelectionHighlights,
      commitHistory,
      setStatus,
      mountProps: vi.fn(),
      now: 100
    });

    expect(updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(commitHistory).toHaveBeenCalledTimes(1);
    expect(state.lastA).toBe(ref);
    expect(state.lastB).toBe(picked);
    expect(state.lastUntilMs).toBe(2600);
    expect(setStatus).toHaveBeenCalledWith("Aligned.");
  });

  it("finishes the align tool after one successful align when requested", () => {
    const ref = line("ref");
    const picked = line("picked");
    const state = { ref, lastA: null, lastB: null, lastUntilMs: 0 };
    const finishAlignTool = vi.fn();

    handleAlignToolClick({
      picked,
      alignState: state,
      applyAlignBetweenPickedLines: () => ({ ok: true, reason: "Aligned." }),
      updateSelectionHighlights: vi.fn(),
      commitHistory: vi.fn(),
      setStatus: vi.fn(),
      mountProps: vi.fn(),
      finishAlignTool,
      now: 100
    });

    expect(finishAlignTool).toHaveBeenCalledOnce();
  });

  it("stores align recent feedback lines for the current feedback window", () => {
    const ref = line("ref");
    const picked = line("picked");
    const state = { lastA: null as AlignPickedLine | null, lastB: null as AlignPickedLine | null, lastUntilMs: 0 };

    setAlignRecentFeedback({
      alignState: state,
      lastA: ref,
      lastB: picked,
      now: 100
    });

    expect(state.lastA).toBe(ref);
    expect(state.lastB).toBe(picked);
    expect(state.lastUntilMs).toBe(2600);
  });

  it("applies line pair recent feedback through explicit setters", () => {
    const first = line("first");
    const second = line("second");
    const state = { first: null as AlignPickedLine | null, second: null as AlignPickedLine | null, untilMs: 0 };

    applyLinePairRecentFeedback({
      lastA: first,
      lastB: second,
      now: 100,
      setLastA: (picked) => {
        state.first = picked;
      },
      setLastB: (picked) => {
        state.second = picked;
      },
      setLastUntilMs: (untilMs) => {
        state.untilMs = untilMs;
      }
    });

    expect(state).toEqual({ first, second, untilMs: 2600 });
  });

  it("reports the current trim prompt when no line is picked", () => {
    const setStatus = vi.fn();

    handleTrimNoPick({ trimState: { step: "pickTarget" }, setStatus });
    handleTrimNoPick({ trimState: { step: "pickCutter" }, setStatus });

    expect(setStatus).toHaveBeenNthCalledWith(1, "Trim: click target wall line.");
    expect(setStatus).toHaveBeenNthCalledWith(2, "Trim: click cutter line.");
  });

  it("stores trim target pick and moves to cutter step", () => {
    const picked = { ...line("target"), wallId: "wall-1" };
    const state = trimState({ lastTarget: line("old-target"), lastCutter: line("old-cutter"), lastUntilMs: 5 });
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    expect(handleTrimTargetPick({ picked, hitPoint, trimState: state, setStatus, mountProps })).toBe(true);

    expect(state.targetWallId).toBe("wall-1");
    expect(state.targetPick).toBe(picked);
    expect(state.targetClick).toEqual(hitPoint);
    expect(state.targetClick).not.toBe(hitPoint);
    expect(state.step).toBe("pickCutter");
    expect(state.lastTarget).toBeNull();
    expect(state.lastCutter).toBeNull();
    expect(state.lastUntilMs).toBe(0);
    expect(setStatus).toHaveBeenCalledWith("Trim: click cutter line...");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("sets trim target pick state and clears previous recent feedback", () => {
    const picked = { ...line("target"), wallId: "wall-1" };
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const state = trimState({ lastTarget: line("old-target"), lastCutter: line("old-cutter"), lastUntilMs: 5 });

    setTrimTargetPick({
      trimState: state,
      picked,
      hitPoint
    });

    expect(state.targetWallId).toBe("wall-1");
    expect(state.targetPick).toBe(picked);
    expect(state.targetClick).toEqual(hitPoint);
    expect(state.targetClick).not.toBe(hitPoint);
    expect(state.step).toBe("pickCutter");
    expect(state.lastTarget).toBeNull();
    expect(state.lastCutter).toBeNull();
    expect(state.lastUntilMs).toBe(0);
  });

  it("resets missing trim target without clearing the current target click", () => {
    const click = new THREE.Vector3(1, 0, 2);
    const state = trimState({ step: "pickCutter", targetWallId: "missing", targetPick: line("target"), targetClick: click });
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    handleMissingTrimTarget({ trimState: state, setStatus, mountProps });

    expect(state.step).toBe("pickTarget");
    expect(state.targetWallId).toBeNull();
    expect(state.targetPick).toBeNull();
    expect(state.targetClick).toBe(click);
    expect(setStatus).toHaveBeenCalledWith("Trim: target missing. Click target wall...");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("resets trim target and reports status without clearing target click when requested", () => {
    const click = new THREE.Vector3(1, 0, 2);
    const state = trimState({ step: "pickCutter", targetWallId: "missing", targetPick: line("target"), targetClick: click });
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    resetTrimTargetAndReport({
      trimState: state,
      clearClick: false,
      status: "Trim: target missing. Click target wall...",
      setStatus,
      mountProps
    });

    expect(state.step).toBe("pickTarget");
    expect(state.targetWallId).toBeNull();
    expect(state.targetPick).toBeNull();
    expect(state.targetClick).toBe(click);
    expect(setStatus).toHaveBeenCalledExactlyOnceWith("Trim: target missing. Click target wall...");
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("resets pinned trim target and clears target click", () => {
    const state = trimState({ step: "pickCutter", targetWallId: "wall-1", targetPick: line("target"), targetClick: new THREE.Vector3(1, 0, 2) });
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    handlePinnedTrimTarget({ trimState: state, setStatus, mountProps });

    expect(state.step).toBe("pickTarget");
    expect(state.targetWallId).toBeNull();
    expect(state.targetPick).toBeNull();
    expect(state.targetClick).toBeNull();
    expect(setStatus).toHaveBeenCalledWith("Trim: target is pinned.");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("finishes trim no-change by clearing the active target", () => {
    const state = trimState({ step: "pickCutter", targetWallId: "wall-1", targetPick: line("target"), targetClick: new THREE.Vector3(1, 0, 2) });
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    finishTrimNoChange({ trimState: state, setStatus, mountProps });

    expect(state.step).toBe("pickTarget");
    expect(state.targetWallId).toBeNull();
    expect(state.targetPick).toBeNull();
    expect(state.targetClick).toBeNull();
    expect(setStatus).toHaveBeenCalledWith("Trim: no change.");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("finishes successful trim with recent feedback and active target cleared", () => {
    const target = line("target");
    const cutter = line("cutter");
    const state = trimState({ step: "pickCutter", targetWallId: "wall-1", targetPick: target, targetClick: new THREE.Vector3(1, 0, 2) });
    const setStatus = vi.fn();
    const mountProps = vi.fn();

    finishTrimSuccess({
      trimState: state,
      lastTarget: target,
      lastCutter: cutter,
      now: 100,
      status: "Trim: done. Click target wall...",
      setStatus,
      mountProps
    });

    expect(state.lastTarget).toBe(target);
    expect(state.lastCutter).toBe(cutter);
    expect(state.lastUntilMs).toBe(2600);
    expect(state.step).toBe("pickTarget");
    expect(state.targetWallId).toBeNull();
    expect(state.targetPick).toBeNull();
    expect(state.targetClick).toBeNull();
    expect(setStatus).toHaveBeenCalledWith("Trim: done. Click target wall...");
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("stores trim recent feedback lines for the current feedback window", () => {
    const target = line("target");
    const cutter = line("cutter");
    const state = { lastTarget: null as AlignPickedLine | null, lastCutter: null as AlignPickedLine | null, lastUntilMs: 0 };

    setTrimRecentFeedback({
      trimState: state,
      lastTarget: target,
      lastCutter: cutter,
      now: 100
    });

    expect(state.lastTarget).toBe(target);
    expect(state.lastCutter).toBe(cutter);
    expect(state.lastUntilMs).toBe(2600);
  });
});
