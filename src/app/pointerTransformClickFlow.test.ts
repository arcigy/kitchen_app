import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  finishMoveTransformTarget,
  finishRotateTransform,
  handleTransformClickPointerDown,
  setMoveTransformBase,
  setRotateTransformPivot,
  type PointerTransformClickState
} from "./pointerTransformClickFlow";

function transformState(overrides: Partial<PointerTransformClickState> = {}): PointerTransformClickState {
  return {
    base: null,
    kind: "move",
    lastAngleSign: 1,
    lastValidAngle: 0,
    lastValidDelta: new Vector3(1, 0, 1),
    moveSnapDisabled: false,
    pivot: null,
    startPointerAngle: 0,
    step: "pickBase",
    stickyMove: false,
    typed: "123",
    ...overrides
  };
}

function clickArgs(overrides: Partial<Parameters<typeof handleTransformClickPointerDown>[0]> = {}) {
  return {
    applyMoveDelta: vi.fn(),
    clearMoveHud: vi.fn(),
    clearTransform: vi.fn(),
    commitHistory: vi.fn(),
    constrainMoveDelta: vi.fn((delta: Vector3) => new Vector3(delta.x, 0, 0)),
    hitPoint: new Vector3(3, 0, 4),
    mountProps: vi.fn(),
    pickedPoint: new Vector3(1, 0, 2),
    resolveMoveDelta: vi.fn((delta: Vector3) => delta),
    setStatus: vi.fn(),
    shiftKey: false,
    transformState: transformState(),
    ...overrides
  };
}

describe("pointerTransformClickFlow", () => {
  it("sets move transform base and clears typed delta state", () => {
    const state = transformState({ kind: "move", step: "pickBase", typed: "500", lastValidDelta: new Vector3(9, 0, 9) });
    const pickedPoint = new Vector3(1, 0, 2);

    setMoveTransformBase({
      transformState: state,
      pickedPoint
    });

    expect(state.base?.toArray()).toEqual([1, 0, 2]);
    expect(state.base).not.toBe(pickedPoint);
    expect(state.step).toBe("pickTarget");
    expect(state.typed).toBe("");
    expect(state.lastValidDelta.toArray()).toEqual([0, 0, 0]);
  });

  it("keeps current move pickBase click behavior", () => {
    const state = transformState({ kind: "move", step: "pickBase", typed: "500", lastValidDelta: new Vector3(9, 0, 9) });
    const args = clickArgs({ transformState: state });

    expect(handleTransformClickPointerDown(args)).toBe(true);

    expect(state.base?.toArray()).toEqual([1, 0, 2]);
    expect(state.base).not.toBe(args.pickedPoint);
    expect(state.step).toBe("pickTarget");
    expect(state.typed).toBe("");
    expect(state.lastValidDelta.toArray()).toEqual([0, 0, 0]);
    expect(args.setStatus).toHaveBeenCalledExactlyOnceWith("Move: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm. Shift = os, N = volny pohyb.");
    expect(args.commitHistory).not.toHaveBeenCalled();
  });

  it("keeps current move pickTarget click behavior", () => {
    const state = transformState({
      base: new Vector3(1, 0, 1),
      kind: "move",
      step: "pickTarget",
      stickyMove: true
    });
    const resolvedDelta = new Vector3(10, 0, 0);
    const args = clickArgs({
      resolveMoveDelta: vi.fn(() => resolvedDelta),
      shiftKey: true,
      transformState: state
    });

    expect(handleTransformClickPointerDown(args)).toBe(true);

    expect(args.constrainMoveDelta).toHaveBeenCalledOnce();
    expect(args.resolveMoveDelta).toHaveBeenCalledOnce();
    expect(args.applyMoveDelta).toHaveBeenCalledExactlyOnceWith(resolvedDelta);
    expect(args.commitHistory).toHaveBeenCalledOnce();
    expect(args.clearMoveHud).toHaveBeenCalledOnce();
    expect(args.clearTransform).toHaveBeenCalledExactlyOnceWith({
      continueMove: true,
      status: "Move: done. Select next element, or click Move again to exit."
    });
    expect(args.mountProps).toHaveBeenCalledOnce();
  });

  it("finishes move transform target with resolved delta and sticky status", () => {
    const base = new Vector3(1, 0, 1);
    const pickedPoint = new Vector3(4, 0, 5);
    const constrainedDelta = new Vector3(3, 0, 0);
    const resolvedDelta = new Vector3(10, 0, 0);
    const applyMoveDelta = vi.fn();
    const clearMoveHud = vi.fn();
    const clearTransform = vi.fn();
    const commitHistory = vi.fn();
    const constrainMoveDelta = vi.fn(() => constrainedDelta);
    const mountProps = vi.fn();
    const resolveMoveDelta = vi.fn(() => resolvedDelta);

    finishMoveTransformTarget({
      applyMoveDelta,
      base,
      clearMoveHud,
      clearTransform,
      commitHistory,
      constrainMoveDelta,
      mountProps,
      pickedPoint,
      resolveMoveDelta,
      shiftKey: true,
      stickyMove: true
    });

    expect(constrainMoveDelta).toHaveBeenCalledWith(new Vector3(3, 0, 4));
    expect(resolveMoveDelta).toHaveBeenCalledWith(constrainedDelta);
    expect(applyMoveDelta).toHaveBeenCalledWith(resolvedDelta);
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(clearMoveHud).toHaveBeenCalledOnce();
    expect(clearTransform).toHaveBeenCalledWith({
      continueMove: true,
      status: "Move: done. Select next element, or click Move again to exit."
    });
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("keeps current rotate pickPivot click behavior", () => {
    const state = transformState({ kind: "rotate", step: "pickPivot", typed: "45", lastValidAngle: 12 });
    const args = clickArgs({
      hitPoint: new Vector3(4, 0, 6),
      pickedPoint: new Vector3(1, 0, 2),
      transformState: state
    });

    expect(handleTransformClickPointerDown(args)).toBe(true);

    expect(state.pivot?.toArray()).toEqual([1, 0, 2]);
    expect(state.step).toBe("rotating");
    expect(state.typed).toBe("");
    expect(state.lastValidAngle).toBe(0);
    expect(state.startPointerAngle).toBe(Math.atan2(4, 3));
    expect(args.setStatus).toHaveBeenCalledExactlyOnceWith("Rotate: move mouse to rotate (type degrees + Enter). Click to finish.");
    expect(args.commitHistory).not.toHaveBeenCalled();
  });

  it("sets rotate transform pivot and start pointer angle", () => {
    const state = transformState({ kind: "rotate", step: "pickPivot", typed: "45", lastValidAngle: 12 });
    const hitPoint = new Vector3(4, 0, 6);
    const pickedPoint = new Vector3(1, 0, 2);

    setRotateTransformPivot({
      hitPoint,
      pickedPoint,
      transformState: state
    });

    expect(state.pivot?.toArray()).toEqual([1, 0, 2]);
    expect(state.pivot).not.toBe(pickedPoint);
    expect(state.step).toBe("rotating");
    expect(state.typed).toBe("");
    expect(state.lastValidAngle).toBe(0);
    expect(state.startPointerAngle).toBe(Math.atan2(4, 3));
  });

  it("keeps current rotate finish click behavior", () => {
    const state = transformState({ kind: "rotate", step: "rotating" });
    const args = clickArgs({ transformState: state });

    expect(handleTransformClickPointerDown(args)).toBe(true);

    expect(args.commitHistory).toHaveBeenCalledOnce();
    expect(args.clearTransform).toHaveBeenCalledExactlyOnceWith({ status: "Rotate: done." });
    expect(args.mountProps).toHaveBeenCalledOnce();
  });

  it("finishes rotate transform with history and done status", () => {
    const clearTransform = vi.fn();
    const commitHistory = vi.fn();
    const mountProps = vi.fn();

    finishRotateTransform({
      clearTransform,
      commitHistory,
      mountProps
    });

    expect(commitHistory).toHaveBeenCalledOnce();
    expect(clearTransform).toHaveBeenCalledWith({ status: "Rotate: done." });
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("ignores unsupported transform click states", () => {
    const args = clickArgs({ transformState: transformState({ kind: "move", step: "selectElements" }) });

    expect(handleTransformClickPointerDown(args)).toBe(false);

    expect(args.commitHistory).not.toHaveBeenCalled();
    expect(args.clearTransform).not.toHaveBeenCalled();
  });
});
