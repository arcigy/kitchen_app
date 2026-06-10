import { describe, expect, it, vi } from "vitest";
import { finishPointerDragState, type ModulePointerDragFinishState, type OpeningPointerDragFinishState } from "./pointerDragFinish";

function openingState(overrides: Partial<OpeningPointerDragFinishState> = {}): OpeningPointerDragFinishState {
  return {
    active: false,
    pointerId: 11,
    wall: "wall-a",
    ...overrides
  };
}

function moduleState(overrides: Partial<ModulePointerDragFinishState> = {}): ModulePointerDragFinishState {
  return {
    active: false,
    id: "module-a",
    ...overrides
  };
}

describe("pointer drag finish", () => {
  it("finishes window drag before door and module drag", () => {
    const releasePointerCapture = vi.fn();
    const windowDragState = openingState({ active: true, pointerId: 1, wall: "window-wall" });
    const doorDragState = openingState({ active: true, pointerId: 2, wall: "door-wall" });
    const moduleDragState = moduleState({ active: true, id: "module-a" });

    const handled = finishPointerDragState({
      doorDragState,
      moduleDragState,
      pointerId: 9,
      releasePointerCapture,
      windowDragState
    });

    expect(handled).toBe(true);
    expect(windowDragState).toEqual({ active: false, pointerId: 1, wall: null });
    expect(doorDragState).toEqual({ active: true, pointerId: 2, wall: "door-wall" });
    expect(moduleDragState).toEqual({ active: true, id: "module-a" });
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(9);
  });

  it("finishes door drag before module drag when window drag is inactive", () => {
    const releasePointerCapture = vi.fn();
    const windowDragState = openingState({ active: false, pointerId: 1, wall: "window-wall" });
    const doorDragState = openingState({ active: true, pointerId: 2, wall: "door-wall" });
    const moduleDragState = moduleState({ active: true, id: "module-a" });

    const handled = finishPointerDragState({
      doorDragState,
      moduleDragState,
      pointerId: 8,
      releasePointerCapture,
      windowDragState
    });

    expect(handled).toBe(true);
    expect(windowDragState).toEqual({ active: false, pointerId: 1, wall: "window-wall" });
    expect(doorDragState).toEqual({ active: false, pointerId: 2, wall: null });
    expect(moduleDragState).toEqual({ active: true, id: "module-a" });
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(8);
  });

  it("finishes module drag when opening drags are inactive", () => {
    const releasePointerCapture = vi.fn();
    const windowDragState = openingState({ active: false, wall: null });
    const doorDragState = openingState({ active: false, wall: null });
    const moduleDragState = moduleState({ active: true, id: "module-a" });

    const handled = finishPointerDragState({
      doorDragState,
      moduleDragState,
      pointerId: 7,
      releasePointerCapture,
      windowDragState
    });

    expect(handled).toBe(true);
    expect(moduleDragState).toEqual({ active: false, id: null });
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("returns false without releasing pointer capture when no drag is active", () => {
    const releasePointerCapture = vi.fn();
    const windowDragState = openingState({ active: false, wall: null });
    const doorDragState = openingState({ active: false, wall: null });
    const moduleDragState = moduleState({ active: false, id: "module-a" });

    const handled = finishPointerDragState({
      doorDragState,
      moduleDragState,
      pointerId: 6,
      releasePointerCapture,
      windowDragState
    });

    expect(handled).toBe(false);
    expect(moduleDragState).toEqual({ active: false, id: "module-a" });
    expect(releasePointerCapture).not.toHaveBeenCalled();
  });
});
