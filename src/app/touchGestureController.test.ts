import { describe, expect, it, vi } from "vitest";
import { createTouchGestureController, resolveTouchNavigationDelta } from "./touchGestureController";

const touch = (pointerId: number, clientX: number, clientY: number) => ({ pointerId, pointerType: "touch", clientX, clientY });

describe("touch gesture controller", () => {
  it("calculates centroid pan and pinch scale", () => {
    expect(resolveTouchNavigationDelta(
      [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }],
      [{ id: 1, x: 2, y: 4 }, { id: 2, x: 22, y: 4 }]
    )).toEqual({ centroidX: 12, centroidY: 4, deltaX: 7, deltaY: 4, distance: 20, scale: 2 });
  });

  it("starts only after the second touch and suppresses both releases", () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const controller = createTouchGestureController({ onMultiTouchStart: onStart, onMultiTouchMove: onMove, onMultiTouchEnd: onEnd });

    expect(controller.pointerDown(touch(1, 0, 0))).toBe(false);
    expect(controller.pointerDown(touch(2, 20, 0))).toBe(true);
    expect(onStart).toHaveBeenCalledWith([1, 2]);
    expect(controller.pointerMove(touch(2, 30, 10))).toBe(true);
    expect(onMove).toHaveBeenCalledOnce();
    expect(controller.pointerEnd(touch(2, 30, 10))).toBe(true);
    expect(controller.pointerEnd(touch(1, 0, 0))).toBe(true);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("ignores mouse and pen pointers", () => {
    const controller = createTouchGestureController({ onMultiTouchMove: vi.fn() });
    expect(controller.pointerDown({ ...touch(1, 0, 0), pointerType: "mouse" })).toBe(false);
    expect(controller.pointerDown({ ...touch(2, 0, 0), pointerType: "pen" })).toBe(false);
  });

  it("cancels an active gesture safely", () => {
    const onEnd = vi.fn();
    const controller = createTouchGestureController({ onMultiTouchMove: vi.fn(), onMultiTouchEnd: onEnd });
    controller.pointerDown(touch(1, 0, 0));
    controller.pointerDown(touch(2, 10, 0));
    controller.cancel();
    expect(controller.isMultiTouchActive()).toBe(false);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("interrupts navigation when a third finger joins and suppresses every release", () => {
    const onEnd = vi.fn();
    const onMove = vi.fn();
    const controller = createTouchGestureController({ onMultiTouchMove: onMove, onMultiTouchEnd: onEnd });

    controller.pointerDown(touch(1, 0, 0));
    controller.pointerDown(touch(2, 20, 0));
    expect(controller.pointerDown(touch(3, 10, 20))).toBe(true);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(controller.pointerMove(touch(1, 5, 0))).toBe(true);
    expect(onMove).not.toHaveBeenCalled();
    expect(controller.pointerEnd(touch(3, 10, 20))).toBe(true);
    expect(controller.pointerEnd(touch(2, 20, 0))).toBe(true);
    expect(controller.pointerEnd(touch(1, 5, 0))).toBe(true);
  });
});
