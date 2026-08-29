import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  beginUnderlayDragPointerDown,
  finishUnderlayDragPointerUp,
  updateUnderlayDragPointerMove,
  type PointerUnderlayDragState
} from "./pointerUnderlayDrag";

function dragState(overrides: Partial<PointerUnderlayDragState> = {}): PointerUnderlayDragState {
  return {
    active: false,
    pointerId: null,
    startOffsetMm: { x: 0, z: 0 },
    startWorld: new Vector3(),
    ...overrides
  };
}

describe("pointerUnderlayDrag", () => {
  it("ignores pointerdown when underlay drag is not eligible", () => {
    const hasUnderlayHit = vi.fn(() => true);

    expect(
      beginUnderlayDragPointerDown({
        button: 0,
        cancelPendingMarquee: vi.fn(),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 1)),
        hasUnderlayHit,
        isEligible: false,
        pointerId: 5,
        setPointerCapture: vi.fn(),
        setSelectedUnderlay: vi.fn(),
        setUnderlayStatus: vi.fn(),
        underlayDragState: dragState(),
        underlayOffsetMm: { x: 0, z: 0 }
      })
    ).toBe(false);

    expect(hasUnderlayHit).not.toHaveBeenCalled();
  });

  it("selects underlay on hit and consumes the click even when ground hit is missing", () => {
    const state = dragState();
    const cancelPendingMarquee = vi.fn();
    const setSelectedUnderlay = vi.fn();
    const getGroundHitPoint = vi.fn(() => null);

    expect(
      beginUnderlayDragPointerDown({
        button: 0,
        cancelPendingMarquee,
        getGroundHitPoint,
        hasUnderlayHit: vi.fn(() => true),
        isEligible: true,
        pointerId: 5,
        setPointerCapture: vi.fn(),
        setSelectedUnderlay,
        setUnderlayStatus: vi.fn(),
        underlayDragState: state,
        underlayOffsetMm: { x: 10, z: 20 }
      })
    ).toBe(true);

    expect(cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(setSelectedUnderlay).toHaveBeenCalledOnce();
    expect(getGroundHitPoint).toHaveBeenCalledOnce();
    expect(state.active).toBe(false);
  });

  it("starts the current underlay drag flow on a valid underlay hit", () => {
    const state = dragState();
    const setPointerCapture = vi.fn();
    const setUnderlayStatus = vi.fn();

    expect(
      beginUnderlayDragPointerDown({
        button: 0,
        cancelPendingMarquee: vi.fn(),
        getGroundHitPoint: vi.fn(() => new Vector3(2, 0, 3)),
        hasUnderlayHit: vi.fn(() => true),
        isEligible: true,
        pointerId: 7,
        setPointerCapture,
        setSelectedUnderlay: vi.fn(),
        setUnderlayStatus,
        underlayDragState: state,
        underlayOffsetMm: { x: 100, z: 200 }
      })
    ).toBe(true);

    expect(state.active).toBe(true);
    expect(state.pointerId).toBe(7);
    expect(state.startWorld.toArray()).toEqual([2, 0, 3]);
    expect(state.startOffsetMm).toEqual({ x: 100, z: 200 });
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Drag underlay... (Pin when ready)");
  });

  it("updates underlay offset inputs and selection box while dragging", () => {
    const state = dragState({
      active: true,
      pointerId: 3,
      startOffsetMm: { x: 100, z: 200 },
      startWorld: new Vector3(1, 0, 2)
    });
    const offset = { x: 100, z: 200 };
    const setOffsetInputs = vi.fn();
    const updateUnderlayTransform = vi.fn();
    const selectedUnderlayBox = { update: vi.fn() };

    expect(
      updateUnderlayDragPointerMove({
        hitPoint: new Vector3(1.25, 0, 1.5),
        pointerId: 3,
        selectedUnderlayBox,
        setOffsetInputs,
        underlayDragState: state,
        underlayOffsetMm: offset,
        updateUnderlayTransform
      })
    ).toBe(true);

    expect(offset).toEqual({ x: 350, z: -300 });
    expect(updateUnderlayTransform).toHaveBeenCalledOnce();
    expect(setOffsetInputs).toHaveBeenCalledExactlyOnceWith("350", "-300");
    expect(selectedUnderlayBox.update).toHaveBeenCalledOnce();
  });

  it("consumes active drag move without mutation when ground hit is missing", () => {
    const state = dragState({ active: true, pointerId: 3 });
    const offset = { x: 1, z: 2 };
    const updateUnderlayTransform = vi.fn();

    expect(
      updateUnderlayDragPointerMove({
        hitPoint: null,
        pointerId: 3,
        selectedUnderlayBox: null,
        setOffsetInputs: vi.fn(),
        underlayDragState: state,
        underlayOffsetMm: offset,
        updateUnderlayTransform
      })
    ).toBe(true);

    expect(offset).toEqual({ x: 1, z: 2 });
    expect(updateUnderlayTransform).not.toHaveBeenCalled();
  });

  it("finishes underlay drag and commits history once", () => {
    const state = dragState({ active: true, pointerId: 9 });
    const commitHistory = vi.fn();
    const releasePointerCapture = vi.fn();
    const setUnderlayStatus = vi.fn();

    expect(
      finishUnderlayDragPointerUp({
        commitHistory,
        pointerId: 9,
        releasePointerCapture,
        setUnderlayStatus,
        underlayDragState: state
      })
    ).toBe(true);

    expect(state.active).toBe(false);
    expect(state.pointerId).toBeNull();
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Underlay moved.");
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(9);
  });
});
