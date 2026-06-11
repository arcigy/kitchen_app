import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  formatMovePreviewStatus,
  formatRotatePreviewStatus,
  handleTransformPointerMovePreview,
  handleTransformPreviewPointerMove,
  normalizeAngleRadians,
  resolveRotatePreviewAngle,
  routeTransformPreviewSnapFeedback,
  type PointerTransformPreviewState
} from "./pointerTransformPreviewFlow";
import type { PointerTransformClickState } from "./pointerTransformClickFlow";

function transformState(overrides: Partial<PointerTransformClickState> = {}): PointerTransformClickState {
  return {
    base: new Vector3(1, 0, 1),
    kind: "move",
    lastAngleSign: 1,
    lastValidAngle: 0,
    lastValidDelta: new Vector3(),
    moveSnapDisabled: false,
    pivot: null,
    startPointerAngle: 0,
    step: "pickTarget",
    stickyMove: false,
    typed: "",
    ...overrides
  };
}

function previewArgs(overrides: Partial<Parameters<typeof handleTransformPreviewPointerMove<string>>[0]> = {}) {
  return {
    applyMoveDelta: vi.fn(),
    applyRotateAngle: vi.fn(),
    constrainMoveDelta: vi.fn((delta: Vector3) => new Vector3(delta.x, 0, 0)),
    hitPoint: new Vector3(4, 0, 5),
    pickedPoint: new Vector3(2, 0, 3),
    resolveMoveDelta: vi.fn((delta: Vector3) => ({ delta, objectSnap: null })),
    setStatus: vi.fn(),
    shiftKey: false,
    transformState: transformState(),
    updateObjectSnapFeedback: vi.fn(),
    ...overrides
  };
}

type TestPlanSnap = { kind: "none" | "corner" | "edge"; point: Vector3 };

function transformPointerState(overrides: Partial<PointerTransformPreviewState> = {}) {
  return {
    ...transformState(),
    lastPointerPx: { x: 0, y: 0 },
    ...overrides
  };
}

describe("pointerTransformPreviewFlow", () => {
  it("normalizes angles into the current signed range", () => {
    expect(normalizeAngleRadians(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1);
    expect(normalizeAngleRadians(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1);
  });

  it("formats move preview status for snap mode and free mode", () => {
    expect(formatMovePreviewStatus({ delta: new Vector3(1, 0, 2), moveSnapDisabled: false, hasObjectSnap: false })).toBe(
      "Move: 1000 x 2000 mm (click or type distance, N = free movement)"
    );
    expect(formatMovePreviewStatus({ delta: new Vector3(1.234, 0, -2.345), moveSnapDisabled: true, hasObjectSnap: true })).toBe(
      "Move free 1 mm smart snap: 1234 x -2345 mm (click or type distance, N = snapping)"
    );
  });

  it("resolves rotate preview angle and formats rotate preview status", () => {
    const angle = resolveRotatePreviewAngle({
      hitPoint: new Vector3(1, 0, 0),
      pivot: new Vector3(0, 0, 0),
      startPointerAngle: Math.PI * 0.75
    });

    expect(angle).toBeCloseTo(-Math.PI * 0.75);
    expect(formatRotatePreviewStatus(angle)).toBe("Rotate: -135 deg (click to finish)");
  });

  it("routes preview snap feedback for move, rotate snap, and rotate no-snap", () => {
    const rect = {} as DOMRect;
    const pickedPoint = new Vector3(2, 0, 3);
    const moveSnap = { kind: "corner" as const, point: new Vector3(4, 0, 5) };
    const noneSnap = { kind: "none" as const, point: pickedPoint };
    const updateMoveSnapFeedback = vi.fn();
    const updateHoverCursor = vi.fn();
    const hideHoverCursor = vi.fn();

    routeTransformPreviewSnapFeedback<TestPlanSnap>({
      transformKind: "move",
      moveSnap,
      snapped: moveSnap,
      pickedPoint,
      rect,
      updateHoverCursor,
      updateMoveSnapFeedback,
      hideHoverCursor
    });
    routeTransformPreviewSnapFeedback<TestPlanSnap>({
      transformKind: "rotate",
      moveSnap: null,
      snapped: moveSnap,
      pickedPoint,
      rect,
      updateHoverCursor,
      updateMoveSnapFeedback,
      hideHoverCursor
    });
    routeTransformPreviewSnapFeedback<TestPlanSnap>({
      transformKind: "rotate",
      moveSnap: null,
      snapped: noneSnap,
      pickedPoint,
      rect,
      updateHoverCursor,
      updateMoveSnapFeedback,
      hideHoverCursor
    });

    expect(updateMoveSnapFeedback).toHaveBeenCalledExactlyOnceWith(moveSnap, pickedPoint, rect);
    expect(updateHoverCursor).toHaveBeenCalledExactlyOnceWith(pickedPoint, "corner", rect);
    expect(hideHoverCursor).toHaveBeenCalledOnce();
  });

  it("keeps current move preview behavior without object snap", () => {
    const resolvedDelta = new Vector3(1, 0, 2);
    const args = previewArgs({
      resolveMoveDelta: vi.fn(() => ({ delta: resolvedDelta, objectSnap: null }))
    });

    expect(handleTransformPreviewPointerMove(args)).toBe(true);

    expect(args.resolveMoveDelta).toHaveBeenCalledOnce();
    expect(args.applyMoveDelta).toHaveBeenCalledExactlyOnceWith(resolvedDelta);
    expect(args.updateObjectSnapFeedback).not.toHaveBeenCalled();
    expect(args.setStatus).toHaveBeenCalledExactlyOnceWith("Move: 1000 x 2000 mm (click or type distance, N = free movement)");
  });

  it("keeps current move preview behavior with shift, free mode, and smart snap", () => {
    const resolvedDelta = new Vector3(1.234, 0, -2.345);
    const target = new Vector3(9, 0, 9);
    const args = previewArgs({
      resolveMoveDelta: vi.fn(() => ({ delta: resolvedDelta, objectSnap: { snap: "snap-a", target } })),
      shiftKey: true,
      transformState: transformState({ moveSnapDisabled: true })
    });

    expect(handleTransformPreviewPointerMove(args)).toBe(true);

    expect(args.constrainMoveDelta).toHaveBeenCalledOnce();
    expect(args.applyMoveDelta).toHaveBeenCalledExactlyOnceWith(resolvedDelta);
    expect(args.updateObjectSnapFeedback).toHaveBeenCalledExactlyOnceWith("snap-a", target);
    expect(args.setStatus).toHaveBeenCalledExactlyOnceWith("Move free 1 mm smart snap: 1234 x -2345 mm (click or type distance, N = snapping)");
  });

  it("keeps current rotate preview behavior and angle sign", () => {
    const state = transformState({
      kind: "rotate",
      pivot: new Vector3(0, 0, 0),
      startPointerAngle: Math.PI * 0.75,
      step: "rotating"
    });
    const args = previewArgs({
      hitPoint: new Vector3(1, 0, 0),
      transformState: state
    });

    expect(handleTransformPreviewPointerMove(args)).toBe(true);

    expect(state.lastAngleSign).toBe(-1);
    expect(args.applyRotateAngle).toHaveBeenCalledOnce();
    const angle = vi.mocked(args.applyRotateAngle).mock.calls[0][0];
    expect(angle).toBeCloseTo(-Math.PI * 0.75);
    expect(args.setStatus).toHaveBeenCalledExactlyOnceWith("Rotate: -135 deg (click to finish)");
  });

  it("ignores unsupported preview states", () => {
    const args = previewArgs({ transformState: transformState({ kind: "move", step: "pickBase" }) });

    expect(handleTransformPreviewPointerMove(args)).toBe(false);

    expect(args.applyMoveDelta).not.toHaveBeenCalled();
    expect(args.applyRotateAngle).not.toHaveBeenCalled();
  });

  it("updates transform pointer position and consumes preview move when ground hit is missing", () => {
    const state = transformPointerState();
    const resolveMoveSnap = vi.fn();

    expect(
      handleTransformPointerMovePreview<TestPlanSnap, string>({
        applyMoveDelta: vi.fn(),
        applyRotateAngle: vi.fn(),
        constrainMoveDelta: vi.fn(),
        hitPoint: null,
        makeNoSnapResult: vi.fn(),
        pointerPoint: { x: 12, y: 34 },
        rect: {} as DOMRect,
        resolveMoveDelta: vi.fn(),
        resolveMoveSnap,
        resolveRotateSnap: vi.fn(),
        setSelectPlanSnap: vi.fn(),
        setStatus: vi.fn(),
        shiftKey: false,
        transformState: state,
        updateHoverCursor: vi.fn(),
        updateMoveSnapFeedback: vi.fn(),
        updateObjectSnapFeedback: vi.fn(),
        hideHoverCursor: vi.fn()
      })
    ).toBe(true);

    expect(state.lastPointerPx).toEqual({ x: 12, y: 34 });
    expect(resolveMoveSnap).not.toHaveBeenCalled();
  });

  it("routes transform move pointermove through move snap feedback and preview update", () => {
    const base = new Vector3(1, 0, 1);
    const hitPoint = new Vector3(3, 0, 4);
    const snap = { kind: "corner" as const, point: new Vector3(4, 0, 6) };
    const state = transformPointerState({ base, kind: "move", step: "pickTarget" });
    const resolvedDelta = new Vector3(2, 0, 5);
    const resolveMoveSnap = vi.fn(() => snap);
    const updateMoveSnapFeedback = vi.fn();
    const applyMoveDelta = vi.fn();

    expect(
      handleTransformPointerMovePreview<TestPlanSnap, string>({
        applyMoveDelta,
        applyRotateAngle: vi.fn(),
        constrainMoveDelta: vi.fn((delta: Vector3) => delta),
        hitPoint,
        makeNoSnapResult: (point) => ({ kind: "none", point }),
        pointerPoint: { x: 1, y: 2 },
        rect: {} as DOMRect,
        resolveMoveDelta: vi.fn(() => ({ delta: resolvedDelta, objectSnap: null })),
        resolveMoveSnap,
        resolveRotateSnap: vi.fn(),
        setSelectPlanSnap: vi.fn(),
        setStatus: vi.fn(),
        shiftKey: false,
        transformState: state,
        updateHoverCursor: vi.fn(),
        updateMoveSnapFeedback,
        updateObjectSnapFeedback: vi.fn(),
        hideHoverCursor: vi.fn()
      })
    ).toBe(true);

    expect(resolveMoveSnap).toHaveBeenCalledWith(hitPoint, expect.anything(), base);
    expect(updateMoveSnapFeedback).toHaveBeenCalledWith(snap, snap.point, expect.anything());
    expect(applyMoveDelta).toHaveBeenCalledWith(resolvedDelta);
  });

  it("routes transform rotate pointermove through rotate snap hover and preview update", () => {
    const hitPoint = new Vector3(0, 0, 1);
    const snap = { kind: "edge" as const, point: new Vector3(1, 0, 0) };
    const state = transformPointerState({
      kind: "rotate",
      pivot: new Vector3(0, 0, 0),
      startPointerAngle: 0,
      step: "rotating"
    });
    const setSelectPlanSnap = vi.fn();
    const updateHoverCursor = vi.fn();
    const applyRotateAngle = vi.fn();

    expect(
      handleTransformPointerMovePreview<TestPlanSnap, string>({
        applyMoveDelta: vi.fn(),
        applyRotateAngle,
        constrainMoveDelta: vi.fn(),
        hitPoint,
        makeNoSnapResult: vi.fn(),
        pointerPoint: { x: 5, y: 6 },
        rect: {} as DOMRect,
        resolveMoveDelta: vi.fn(),
        resolveMoveSnap: vi.fn(),
        resolveRotateSnap: vi.fn(() => snap),
        setSelectPlanSnap,
        setStatus: vi.fn(),
        shiftKey: false,
        transformState: state,
        updateHoverCursor,
        updateMoveSnapFeedback: vi.fn(),
        updateObjectSnapFeedback: vi.fn(),
        hideHoverCursor: vi.fn()
      })
    ).toBe(true);

    expect(setSelectPlanSnap).toHaveBeenCalledWith(snap);
    expect(updateHoverCursor).toHaveBeenCalledWith(snap.point, "edge", expect.anything());
    expect(applyRotateAngle).toHaveBeenCalledOnce();
  });
});
