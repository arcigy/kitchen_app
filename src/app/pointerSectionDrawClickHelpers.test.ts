import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  handleSectionDrawHover,
  handleSectionDrawPointClick,
  sectionDrawPointToMm,
  updateSectionDrawPointerMoveHover
} from "./pointerSectionDrawClickHelpers";

describe("pointer section draw click helpers", () => {
  it("rounds section draw points to the current millimeter point format", () => {
    expect(sectionDrawPointToMm(new THREE.Vector3(1.2344, 9, -0.5556))).toEqual({ x: 1234, z: -556 });
  });

  it("stores the first section point, hover point, axis lock, status, and props", () => {
    const sectionDraw = { a: null as unknown, axisLocked: false, hoverPoint: null as unknown };
    const updateSectionDrawPreview = vi.fn();
    const setStatus = vi.fn();
    const mountProps = vi.fn();
    const commitSectionDraw = vi.fn();

    const result = handleSectionDrawPointClick({
      resolved: { point: new THREE.Vector3(1.2, 0, 3.4), axisLocked: true },
      sectionDraw,
      updateSectionDrawPreview,
      setStatus,
      mountProps,
      commitSectionDraw
    });

    expect(result).toEqual({ preventDefault: false });
    expect(sectionDraw.axisLocked).toBe(true);
    expect(sectionDraw.a).toEqual({ x: 1200, z: 3400 });
    expect(sectionDraw.hoverPoint).toBe(sectionDraw.a);
    expect(updateSectionDrawPreview).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith("Section: click second point. Ortho = straight, Shift = no axis snap, Space = mirror direction.");
    expect(mountProps).toHaveBeenCalledTimes(1);
    expect(commitSectionDraw).not.toHaveBeenCalled();
  });

  it("commits the second section point and asks caller to prevent defaults when commit succeeds", () => {
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: false, hoverPoint: null as unknown };
    const commitSectionDraw = vi.fn(() => true);

    const result = handleSectionDrawPointClick({
      resolved: { point: new THREE.Vector3(2, 0, 4), axisLocked: true },
      sectionDraw,
      updateSectionDrawPreview: vi.fn(),
      setStatus: vi.fn(),
      mountProps: vi.fn(),
      commitSectionDraw
    });

    expect(result).toEqual({ preventDefault: true });
    expect(sectionDraw.axisLocked).toBe(true);
    expect(commitSectionDraw).toHaveBeenCalledWith({ x: 2000, z: 4000 });
  });

  it("does not ask caller to prevent defaults when section commit returns false", () => {
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: true, hoverPoint: null as unknown };

    const result = handleSectionDrawPointClick({
      resolved: { point: new THREE.Vector3(2, 0, 4), axisLocked: false },
      sectionDraw,
      updateSectionDrawPreview: vi.fn(),
      setStatus: vi.fn(),
      mountProps: vi.fn(),
      commitSectionDraw: vi.fn(() => false)
    });

    expect(result).toEqual({ preventDefault: false });
    expect(sectionDraw.axisLocked).toBe(false);
  });

  it("updates section hover state and snap UI when snap is active", () => {
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: false, hoverPoint: null as unknown };
    const showSnapHover = vi.fn();
    const hideHoverCursor = vi.fn();
    const updateSectionDrawPreview = vi.fn();
    const point = new THREE.Vector3(1.2344, 0, -0.5556);

    handleSectionDrawHover({
      resolved: { point, axisLocked: true, kind: "endpoint" },
      sectionDraw,
      showSnapHover,
      hideHoverCursor,
      updateSectionDrawPreview
    });

    expect(sectionDraw.axisLocked).toBe(true);
    expect(showSnapHover).toHaveBeenCalledWith(point, "endpoint");
    expect(hideHoverCursor).not.toHaveBeenCalled();
    expect(sectionDraw.hoverPoint).toEqual({ x: 1234, z: -556 });
    expect(updateSectionDrawPreview).toHaveBeenCalledTimes(1);
  });

  it("updates section hover state and hides snap UI when snap is none", () => {
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: true, hoverPoint: null as unknown };
    const showSnapHover = vi.fn();
    const hideHoverCursor = vi.fn();

    handleSectionDrawHover({
      resolved: { point: new THREE.Vector3(2, 0, 4), axisLocked: false, kind: "none" },
      sectionDraw,
      showSnapHover,
      hideHoverCursor,
      updateSectionDrawPreview: vi.fn()
    });

    expect(sectionDraw.axisLocked).toBe(false);
    expect(showSnapHover).not.toHaveBeenCalled();
    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(sectionDraw.hoverPoint).toEqual({ x: 2000, z: 4000 });
  });

  it("hides section pointermove hover when there is no ground hit", () => {
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: true, hoverPoint: { x: 1, z: 2 } as unknown };
    const hideHoverCursor = vi.fn();
    const resolveSectionDrawPoint = vi.fn();

    updateSectionDrawPointerMoveHover({
      hitPoint: null,
      rect: {} as DOMRect,
      allowAxisSnap: true,
      sectionDraw,
      resolveSectionDrawPoint,
      showSnapHover: vi.fn(),
      hideHoverCursor,
      updateSectionDrawPreview: vi.fn()
    });

    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(resolveSectionDrawPoint).not.toHaveBeenCalled();
    expect(sectionDraw.hoverPoint).toEqual({ x: 1, z: 2 });
  });

  it("resolves section pointermove hit and delegates to section hover update", () => {
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const rect = {} as DOMRect;
    const sectionDraw = { a: { x: 0, z: 0 } as unknown, axisLocked: false, hoverPoint: null as unknown };
    const showSnapHover = vi.fn();
    const hideHoverCursor = vi.fn();
    const updateSectionDrawPreview = vi.fn();
    const resolved = { point: new THREE.Vector3(1.5, 0, 2.5), axisLocked: true, kind: "midpoint" as const };
    const resolveSectionDrawPoint = vi.fn(() => resolved);

    updateSectionDrawPointerMoveHover({
      hitPoint,
      rect,
      allowAxisSnap: false,
      sectionDraw,
      resolveSectionDrawPoint,
      showSnapHover,
      hideHoverCursor,
      updateSectionDrawPreview
    });

    expect(resolveSectionDrawPoint).toHaveBeenCalledWith(hitPoint, rect, false);
    expect(sectionDraw.axisLocked).toBe(true);
    expect(sectionDraw.hoverPoint).toEqual({ x: 1500, z: 2500 });
    expect(showSnapHover).toHaveBeenCalledWith(resolved.point, "midpoint");
    expect(hideHoverCursor).not.toHaveBeenCalled();
    expect(updateSectionDrawPreview).toHaveBeenCalledTimes(1);
  });
});
