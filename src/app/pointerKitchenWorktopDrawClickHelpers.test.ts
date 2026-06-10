import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  handleKitchenWorktopDrawHover,
  handleKitchenWorktopDrawPointClick,
  resolveKitchenWorktopDrawClickPoint,
  resolveKitchenWorktopTypedPoint,
  updateKitchenWorktopDrawPointerMoveHover
} from "./pointerKitchenWorktopDrawClickHelpers";

describe("pointer kitchen worktop draw click helpers", () => {
  it("rounds the raw hit point to millimeters when no snap is active", () => {
    const point = resolveKitchenWorktopDrawClickPoint({
      hitPoint: new THREE.Vector3(1.2344, 0, -0.5556),
      activeSnap: null,
      points: [],
      floorOrthoPoint: vi.fn()
    });

    expect(point).toEqual({ x: 1234, z: -556 });
  });

  it("uses the active snap point instead of the raw hit point", () => {
    const point = resolveKitchenWorktopDrawClickPoint({
      hitPoint: new THREE.Vector3(1, 0, 1),
      activeSnap: { point: new THREE.Vector3(2.4, 0, 3.6) },
      points: [],
      floorOrthoPoint: vi.fn()
    });

    expect(point).toEqual({ x: 2400, z: 3600 });
  });

  it("applies floor ortho from the last worktop point when a base point exists", () => {
    const floorOrthoPoint = vi.fn(() => ({ x: 1000, z: 4000 }));

    const point = resolveKitchenWorktopDrawClickPoint({
      hitPoint: new THREE.Vector3(1.2, 0, 3.6),
      activeSnap: null,
      points: [
        { x: 0, z: 0 },
        { x: 1000, z: 1000 }
      ],
      floorOrthoPoint
    });

    expect(floorOrthoPoint).toHaveBeenCalledWith({ x: 1000, z: 1000 }, { x: 1200, z: 3600 });
    expect(point).toEqual({ x: 1000, z: 4000 });
  });

  it("resolves typed worktop point from current hover direction", () => {
    const floorOrthoPoint = vi.fn((_: unknown, raw: { x: number; z: number }) => raw);

    const point = resolveKitchenWorktopTypedPoint({
      start: { x: 1000, z: 1000 },
      hoverPoint: { x: 1000, z: 3000 },
      typedMm: "1250",
      floorOrthoPoint
    });

    expect(point).toEqual({ x: 1000, z: 2250 });
    expect(floorOrthoPoint).toHaveBeenCalledWith({ x: 1000, z: 1000 }, { x: 1000, z: 2250 });
  });

  it("resolves typed worktop point using x axis fallback when hover is missing or zero length", () => {
    const floorOrthoPoint = vi.fn((_: unknown, raw: { x: number; z: number }) => raw);

    expect(
      resolveKitchenWorktopTypedPoint({
        start: { x: 1000, z: 1000 },
        hoverPoint: null,
        typedMm: "500",
        floorOrthoPoint
      })
    ).toEqual({ x: 1500, z: 1000 });

    expect(
      resolveKitchenWorktopTypedPoint({
        start: { x: 1000, z: 1000 },
        hoverPoint: { x: 1000, z: 1000 },
        typedMm: "500",
        floorOrthoPoint
      })
    ).toEqual({ x: 1500, z: 1000 });
  });

  it("returns null for non numeric typed worktop length", () => {
    expect(
      resolveKitchenWorktopTypedPoint({
        start: { x: 1000, z: 1000 },
        hoverPoint: null,
        typedMm: "abc",
        floorOrthoPoint: vi.fn()
      })
    ).toBeNull();
  });

  it("applies floor ortho to typed worktop point", () => {
    const floorOrthoPoint = vi.fn(() => ({ x: 1000, z: 2500 }));

    const point = resolveKitchenWorktopTypedPoint({
      start: { x: 1000, z: 1000 },
      hoverPoint: { x: 1200, z: 1800 },
      typedMm: "1500",
      floorOrthoPoint
    });

    expect(point).toEqual({ x: 1000, z: 2500 });
    expect(floorOrthoPoint).toHaveBeenCalled();
  });

  it("appends the resolved worktop point", () => {
    const appendKitchenWorktopPoint = vi.fn();

    handleKitchenWorktopDrawPointClick({
      hitPoint: new THREE.Vector3(1.2, 0, 3.6),
      activeSnap: null,
      kitchenWorktopDraw: { points: [] },
      floorOrthoPoint: vi.fn(),
      appendKitchenWorktopPoint
    });

    expect(appendKitchenWorktopPoint).toHaveBeenCalledWith({ x: 1200, z: 3600 });
  });

  it("updates worktop hover state from active snap and schedules preview when points exist", () => {
    const state = {
      points: [{ x: 1000, z: 1000 }],
      hoverPoint: null,
      lastPointerPx: { x: 0, y: 0 },
      typedMm: "450"
    };
    const showSnapHover = vi.fn();
    const updateTypedHud = vi.fn();
    const schedulePreviewUpdate = vi.fn();

    handleKitchenWorktopDrawHover({
      pointerPoint: { x: 12, y: 34 },
      hitPoint: new THREE.Vector3(1, 0, 1),
      activeSnap: { point: new THREE.Vector3(2.4, 0, 3.6), kind: "endpoint" },
      kitchenWorktopDraw: state,
      floorOrthoPoint: vi.fn(() => ({ x: 1000, z: 3600 })),
      showSnapHover,
      hideHoverCursor: vi.fn(),
      updateTypedHud,
      schedulePreviewUpdate
    });

    expect(state.lastPointerPx).toEqual({ x: 12, y: 34 });
    expect(showSnapHover).toHaveBeenCalledWith(new THREE.Vector3(2.4, 0, 3.6), "endpoint");
    expect(state.hoverPoint).toEqual({ x: 1000, z: 3600 });
    expect(updateTypedHud).toHaveBeenCalledWith("450", { x: 12, y: 34 });
    expect(schedulePreviewUpdate).toHaveBeenCalledTimes(1);
  });

  it("hides hover cursor and skips preview scheduling when no snap or points exist", () => {
    const state = {
      points: [],
      hoverPoint: null,
      lastPointerPx: { x: 0, y: 0 },
      typedMm: ""
    };
    const hideHoverCursor = vi.fn();
    const schedulePreviewUpdate = vi.fn();

    handleKitchenWorktopDrawHover({
      pointerPoint: { x: 12, y: 34 },
      hitPoint: new THREE.Vector3(1.2, 0, 3.6),
      activeSnap: null,
      kitchenWorktopDraw: state,
      floorOrthoPoint: vi.fn(),
      showSnapHover: vi.fn(),
      hideHoverCursor,
      updateTypedHud: vi.fn(),
      schedulePreviewUpdate
    });

    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(state.hoverPoint).toEqual({ x: 1200, z: 3600 });
    expect(schedulePreviewUpdate).not.toHaveBeenCalled();
  });

  it("updates worktop pointer position and returns when pointermove has no ground hit", () => {
    const state = {
      points: [{ x: 1000, z: 1000 }],
      hoverPoint: { x: 1, z: 2 },
      lastPointerPx: { x: 0, y: 0 },
      typedMm: "450"
    };
    const resolveKitchenWorktopDrawSnap = vi.fn();

    updateKitchenWorktopDrawPointerMoveHover({
      pointerPoint: { x: 42, y: 84 },
      hitPoint: null,
      rect: {} as DOMRect,
      kitchenWorktopDraw: state,
      resolveKitchenWorktopDrawSnap,
      floorOrthoPoint: vi.fn(),
      showSnapHover: vi.fn(),
      hideHoverCursor: vi.fn(),
      updateTypedHud: vi.fn(),
      schedulePreviewUpdate: vi.fn()
    });

    expect(state.lastPointerPx).toEqual({ x: 42, y: 84 });
    expect(state.hoverPoint).toEqual({ x: 1, z: 2 });
    expect(resolveKitchenWorktopDrawSnap).not.toHaveBeenCalled();
  });

  it("resolves worktop pointermove snap and delegates to hover update on ground hit", () => {
    const hitPoint = new THREE.Vector3(1.2, 0, 3.6);
    const rect = {} as DOMRect;
    const state = {
      points: [{ x: 1000, z: 1000 }],
      hoverPoint: null,
      lastPointerPx: { x: 0, y: 0 },
      typedMm: "450"
    };
    const snap = { point: new THREE.Vector3(2, 0, 4), kind: "corner" as const };
    const resolveKitchenWorktopDrawSnap = vi.fn(() => snap);
    const floorOrthoPoint = vi.fn(() => ({ x: 1000, z: 4000 }));
    const showSnapHover = vi.fn();
    const updateTypedHud = vi.fn();
    const schedulePreviewUpdate = vi.fn();

    updateKitchenWorktopDrawPointerMoveHover({
      pointerPoint: { x: 12, y: 34 },
      hitPoint,
      rect,
      kitchenWorktopDraw: state,
      resolveKitchenWorktopDrawSnap,
      floorOrthoPoint,
      showSnapHover,
      hideHoverCursor: vi.fn(),
      updateTypedHud,
      schedulePreviewUpdate
    });

    expect(resolveKitchenWorktopDrawSnap).toHaveBeenCalledWith(hitPoint, rect);
    expect(state.lastPointerPx).toEqual({ x: 12, y: 34 });
    expect(showSnapHover).toHaveBeenCalledWith(snap.point, "corner");
    expect(state.hoverPoint).toEqual({ x: 1000, z: 4000 });
    expect(updateTypedHud).toHaveBeenCalledWith("450", { x: 12, y: 34 });
    expect(schedulePreviewUpdate).toHaveBeenCalledTimes(1);
  });
});
