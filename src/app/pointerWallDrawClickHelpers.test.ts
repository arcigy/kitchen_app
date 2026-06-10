import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  finishWallDrawAfterAddedWall,
  handleWallDrawEndClick,
  handleWallDrawStartClick,
  resolveWallDrawActiveSnap,
  resolveWallDrawEndPoint,
  resolveWallDrawHoverPoint,
  resolveWallDrawStartPoint,
  resolveWallDrawTypedEndPoint,
  updateActiveWallDrawPointerMoveHover,
  updateWallToolPointerMoveHover,
  type PointerWallDrawHoverState,
  type PointerWallDrawState
} from "./pointerWallDrawClickHelpers";

function wallDraw(overrides: Partial<PointerWallDrawState> = {}): PointerWallDrawState {
  return {
    active: false,
    segments: 0,
    a: null,
    chainStart: null,
    hoverB: null,
    typedMm: "123",
    preview: null,
    ...overrides
  };
}

function wallDrawHover(overrides: Partial<PointerWallDrawHoverState> = {}): PointerWallDrawHoverState {
  return {
    ...wallDraw(),
    lastPointerPx: { x: 0, y: 0 },
    ...overrides
  };
}

function makeMesh() {
  return new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
}

function makeWall(id = "wall_1", bMm = { x: 2000, z: 0 }) {
  return {
    id,
    params: {
      aMm: { x: 0, z: 0 },
      bMm
    }
  };
}

describe("pointer wall draw click helpers", () => {
  it("resolves wall start point from snapped point with millimeter rounding", () => {
    const result = resolveWallDrawStartPoint({
      hitPoint: new THREE.Vector3(9, 0, 9),
      snapped: { kind: "endpoint", point: new THREE.Vector3(1.2344, 0, -0.5556) }
    });

    expect(result).toEqual(new THREE.Vector3(1.234, 0, -0.556));
  });

  it("resolves wall start point from cloned hit point when snap is none", () => {
    const hitPoint = new THREE.Vector3(1.2344, 0, -0.5556);
    const result = resolveWallDrawStartPoint({
      hitPoint,
      snapped: { kind: "none", point: new THREE.Vector3(9, 0, 9) }
    });

    expect(result).toEqual(new THREE.Vector3(1.234, 0, -0.556));
    expect(result).not.toBe(hitPoint);
  });

  it("resolves wall end point from raw hit point with millimeter rounding", () => {
    const snapAxisXZ = vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone());
    const result = resolveWallDrawEndPoint({
      a: new THREE.Vector3(0, 0, 0),
      hitPoint: new THREE.Vector3(1.2344, 0, -0.5556),
      snapped: { kind: "none", point: new THREE.Vector3(9, 0, 9) },
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1,
      shouldAxisSnap: false,
      snapAxisXZ
    });

    expect(result).toEqual({ end: new THREE.Vector3(1.234, 0, -0.556), closes: false });
    expect(snapAxisXZ).not.toHaveBeenCalled();
  });

  it("resolves wall end point from snapped point before raw hit point", () => {
    const result = resolveWallDrawEndPoint({
      a: new THREE.Vector3(0, 0, 0),
      hitPoint: new THREE.Vector3(9, 0, 9),
      snapped: { kind: "endpoint", point: new THREE.Vector3(2.1114, 0, 3.2226) },
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1,
      shouldAxisSnap: false,
      snapAxisXZ: vi.fn()
    });

    expect(result).toEqual({ end: new THREE.Vector3(2.111, 0, 3.223), closes: false });
  });

  it("axis snaps wall end point only when enabled and not raw-closing", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const snapAxisXZ = vi.fn(() => new THREE.Vector3(2.9996, 0, 0));

    const result = resolveWallDrawEndPoint({
      a,
      hitPoint: new THREE.Vector3(2.4, 0, 0.7),
      snapped: { kind: "none", point: new THREE.Vector3() },
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1,
      shouldAxisSnap: true,
      snapAxisXZ
    });

    expect(result).toEqual({ end: new THREE.Vector3(3, 0, 0), closes: false });
    expect(snapAxisXZ).toHaveBeenCalledWith(a, new THREE.Vector3(2.4, 0, 0.7), true);
  });

  it("closes wall chain from raw point before axis snapping", () => {
    const chainStart = new THREE.Vector3(1, 0, 1);
    const snapAxisXZ = vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone());

    const result = resolveWallDrawEndPoint({
      a: new THREE.Vector3(2, 0, 1),
      hitPoint: new THREE.Vector3(1.03, 0, 1.02),
      snapped: { kind: "none", point: new THREE.Vector3() },
      chainStart,
      segments: 2,
      closeToleranceM: 0.1,
      shouldAxisSnap: true,
      snapAxisXZ
    });

    expect(result.closes).toBe(true);
    expect(result.end).toEqual(chainStart);
    expect(result.end).not.toBe(chainStart);
    expect(snapAxisXZ).not.toHaveBeenCalled();
  });

  it("resolves wall hover point from active snap without axis snapping", () => {
    const snapPoint = new THREE.Vector3(2, 0, 3);
    const snapAxisXZ = vi.fn();

    const result = resolveWallDrawHoverPoint({
      a: new THREE.Vector3(0, 0, 0),
      hitPoint: new THREE.Vector3(9, 0, 9),
      snapPoint,
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1,
      allowAxisSnap: true,
      snapAxisXZ
    });

    expect(result).toBe(snapPoint);
    expect(snapAxisXZ).not.toHaveBeenCalled();
  });

  it("axis snaps wall hover point when there is no active snap", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const hitPoint = new THREE.Vector3(2.3, 0, 0.7);
    const snappedPoint = new THREE.Vector3(2.3, 0, 0);
    const snapAxisXZ = vi.fn(() => snappedPoint);

    const result = resolveWallDrawHoverPoint({
      a,
      hitPoint,
      snapPoint: null,
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1,
      allowAxisSnap: true,
      snapAxisXZ
    });

    expect(result).toBe(snappedPoint);
    expect(snapAxisXZ).toHaveBeenCalledWith(a, hitPoint, true);
  });

  it("resolves wall hover point to chain start before axis snapping", () => {
    const chainStart = new THREE.Vector3(1, 0, 1);
    const snapAxisXZ = vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone());

    const result = resolveWallDrawHoverPoint({
      a: new THREE.Vector3(2, 0, 1),
      hitPoint: new THREE.Vector3(1.04, 0, 1.01),
      snapPoint: null,
      chainStart,
      segments: 2,
      closeToleranceM: 0.1,
      allowAxisSnap: true,
      snapAxisXZ
    });

    expect(result).toBe(chainStart);
    expect(snapAxisXZ).not.toHaveBeenCalled();
  });

  it("uses direct wall draw snap before sticky snap fallback", () => {
    const snap = { kind: "endpoint" as const, point: new THREE.Vector3(1, 0, 2) };
    const keepStickyPlanSnap = vi.fn();

    const result = resolveWallDrawActiveSnap({
      hitPoint: new THREE.Vector3(9, 0, 9),
      rect: {} as DOMRect,
      camera: new THREE.PerspectiveCamera(),
      sticky: null,
      snapPoint2D: vi.fn(() => snap),
      keepStickyPlanSnap
    });

    expect(result).toBe(snap);
    expect(keepStickyPlanSnap).not.toHaveBeenCalled();
  });

  it("falls back to sticky wall draw snap when direct snap is none", () => {
    const sticky = { kind: "corner" as const, point: new THREE.Vector3(1, 0, 2) };
    const hitPoint = new THREE.Vector3(9, 0, 9);
    const rect = {} as DOMRect;
    const camera = new THREE.PerspectiveCamera();
    const keepStickyPlanSnap = vi.fn(() => sticky);

    const result = resolveWallDrawActiveSnap({
      hitPoint,
      rect,
      camera,
      sticky,
      snapPoint2D: vi.fn(() => ({ kind: "none" as const, point: new THREE.Vector3() })),
      keepStickyPlanSnap
    });

    expect(result).toBe(sticky);
    expect(keepStickyPlanSnap).toHaveBeenCalledWith(hitPoint, sticky, camera, rect, 18);
  });

  it("updates active wall draw preview hover and returns the active snap", () => {
    const preview = makeMesh();
    const state = wallDrawHover({
      active: true,
      a: new THREE.Vector3(0, 0, 0),
      chainStart: null,
      segments: 0,
      preview,
      typedMm: "1200"
    });
    const snap = { kind: "endpoint" as const, point: new THREE.Vector3(2, 0, 0) };
    const updateHoverCursor = vi.fn();
    const updateWallMeshWithJustification = vi.fn();
    const updateTypedHud = vi.fn();

    const result = updateActiveWallDrawPointerMoveHover({
      pointerPoint: { x: 10, y: 20 },
      hitPoint: new THREE.Vector3(1, 0, 0),
      rect: {} as DOMRect,
      wallDraw: state,
      wallDefault: { thicknessMm: 120, justification: "exterior", exteriorSign: -1 },
      currentSnap: null,
      camera: new THREE.PerspectiveCamera(),
      snapPoint2D: vi.fn(() => snap),
      keepStickyPlanSnap: vi.fn(),
      worldToScreen: vi.fn(() => new THREE.Vector2(5, 6)),
      updateHoverCursor,
      hideHoverCursor: vi.fn(),
      allowAxisSnap: true,
      snapAxisXZ: vi.fn(),
      updateWallMeshWithJustification,
      updateTypedHud
    });

    expect(result).toBe(snap);
    expect(state.lastPointerPx).toEqual({ x: 10, y: 20 });
    expect(state.hoverB).toEqual(snap.point);
    expect(state.hoverB).not.toBe(snap.point);
    expect(updateHoverCursor).toHaveBeenCalledWith(new THREE.Vector2(5, 6), "endpoint");
    expect(updateWallMeshWithJustification).toHaveBeenCalledWith(preview, state.a, snap.point, 120, "exterior", -1);
    expect(updateTypedHud).toHaveBeenCalledWith("1200", { x: 10, y: 20 });
  });

  it("updates active wall draw pointer position only when pointermove has no hit", () => {
    const currentSnap = { kind: "midpoint" as const, point: new THREE.Vector3(1, 0, 1) };
    const state = wallDrawHover({
      active: true,
      a: new THREE.Vector3(0, 0, 0),
      preview: makeMesh(),
      hoverB: new THREE.Vector3(3, 0, 3)
    });
    const snapPoint2D = vi.fn();

    const result = updateActiveWallDrawPointerMoveHover({
      pointerPoint: { x: 11, y: 22 },
      hitPoint: null,
      rect: {} as DOMRect,
      wallDraw: state,
      wallDefault: { thicknessMm: 100 },
      currentSnap,
      camera: new THREE.PerspectiveCamera(),
      snapPoint2D,
      keepStickyPlanSnap: vi.fn(),
      worldToScreen: vi.fn(),
      updateHoverCursor: vi.fn(),
      hideHoverCursor: vi.fn(),
      allowAxisSnap: true,
      snapAxisXZ: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      updateTypedHud: vi.fn()
    });

    expect(result).toBe(currentSnap);
    expect(state.lastPointerPx).toEqual({ x: 11, y: 22 });
    expect(state.hoverB).toEqual(new THREE.Vector3(3, 0, 3));
    expect(snapPoint2D).not.toHaveBeenCalled();
  });

  it("updates passive wall tool snap hover without changing preview state", () => {
    const state = wallDrawHover();
    const snap = { kind: "corner" as const, point: new THREE.Vector3(2, 0, 2) };
    const updateHoverCursor = vi.fn();

    const result = updateWallToolPointerMoveHover({
      pointerPoint: { x: 7, y: 8 },
      hitPoint: new THREE.Vector3(1, 0, 1),
      rect: {} as DOMRect,
      wallDraw: state,
      currentSnap: null,
      camera: new THREE.PerspectiveCamera(),
      snapPoint2D: vi.fn(() => snap),
      keepStickyPlanSnap: vi.fn(),
      worldToScreen: vi.fn(() => new THREE.Vector2(3, 4)),
      updateHoverCursor,
      hideHoverCursor: vi.fn()
    });

    expect(result).toBe(snap);
    expect(state.lastPointerPx).toEqual({ x: 7, y: 8 });
    expect(updateHoverCursor).toHaveBeenCalledWith(new THREE.Vector2(3, 4), "corner");
  });

  it("resolves typed wall end point from current hover direction", () => {
    const a = new THREE.Vector3(1, 0, 1);
    const result = resolveWallDrawTypedEndPoint({
      a,
      hoverB: new THREE.Vector3(1, 0, 3),
      typedMm: "1250",
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1
    });

    expect(result).toEqual({ a: new THREE.Vector3(1, 0, 1), end: new THREE.Vector3(1, 0, 2.25), closes: false });
    expect(result?.a).not.toBe(a);
  });

  it("resolves typed wall end point using x axis fallback for zero hover direction", () => {
    const result = resolveWallDrawTypedEndPoint({
      a: new THREE.Vector3(1, 0, 1),
      hoverB: new THREE.Vector3(1, 0, 1),
      typedMm: "500",
      chainStart: null,
      segments: 0,
      closeToleranceM: 0.1
    });

    expect(result).toEqual({ a: new THREE.Vector3(1, 0, 1), end: new THREE.Vector3(1.5, 0, 1), closes: false });
  });

  it("returns null for non numeric typed wall length", () => {
    expect(
      resolveWallDrawTypedEndPoint({
        a: new THREE.Vector3(1, 0, 1),
        hoverB: null,
        typedMm: "abc",
        chainStart: null,
        segments: 0,
        closeToleranceM: 0.1
      })
    ).toBeNull();
  });

  it("closes typed wall end point to chain start after millimeter rounding", () => {
    const chainStart = new THREE.Vector3(2, 0, 1);
    const result = resolveWallDrawTypedEndPoint({
      a: new THREE.Vector3(1, 0, 1),
      hoverB: new THREE.Vector3(2, 0, 1),
      typedMm: "990",
      chainStart,
      segments: 2,
      closeToleranceM: 0.1
    });

    expect(result?.closes).toBe(true);
    expect(result?.end).toEqual(chainStart);
    expect(result?.end).not.toBe(chainStart);
  });

  it("starts wall draw state, creates preview, updates mesh, and sets status", () => {
    const state = wallDraw();
    const preview = makeMesh();
    const makeWallPreviewMesh = vi.fn(() => preview);
    const addPreviewToLayout = vi.fn();
    const updateWallMeshWithJustification = vi.fn();
    const setStatus = vi.fn();
    const wallTypedHud = { style: { display: "block" } };

    const result = handleWallDrawStartClick({
      hitPoint: new THREE.Vector3(1.2, 0, 3.4),
      snapped: { kind: "none", point: new THREE.Vector3() },
      wallDraw: state,
      wallDefault: { thicknessMm: 120, justification: "exterior", exteriorSign: -1 },
      wallTypedHud,
      makeWallPreviewMesh,
      addPreviewToLayout,
      updateWallMeshWithJustification,
      setStatus
    });

    expect(result).toBe(true);
    expect(state.active).toBe(true);
    expect(state.segments).toBe(0);
    expect(state.a).toEqual(new THREE.Vector3(1.2, 0, 3.4));
    expect(state.chainStart).toEqual(state.a);
    expect(state.chainStart).not.toBe(state.a);
    expect(state.hoverB).toEqual(state.a);
    expect(state.hoverB).not.toBe(state.a);
    expect(state.typedMm).toBe("");
    expect(wallTypedHud.style.display).toBe("none");
    expect(makeWallPreviewMesh).toHaveBeenCalledWith(state.a, state.a, 120);
    expect(preview.name).toBe("wallPreview");
    expect(addPreviewToLayout).toHaveBeenCalledWith(preview);
    expect(state.preview).toBe(preview);
    expect(updateWallMeshWithJustification).toHaveBeenCalledWith(preview, state.a, state.a, 120, "exterior", -1);
    expect(setStatus).toHaveBeenCalledWith("Wall: second point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
  });

  it("reuses existing preview and chain start", () => {
    const existingPreview = makeMesh();
    const existingChainStart = new THREE.Vector3(9, 0, 9);
    const state = wallDraw({ preview: existingPreview, chainStart: existingChainStart, segments: 2 });
    const makeWallPreviewMesh = vi.fn(() => makeMesh());
    const addPreviewToLayout = vi.fn();

    handleWallDrawStartClick({
      hitPoint: new THREE.Vector3(1, 0, 2),
      snapped: { kind: "none", point: new THREE.Vector3() },
      wallDraw: state,
      wallDefault: { thicknessMm: 100 },
      wallTypedHud: { style: { display: "block" } },
      makeWallPreviewMesh,
      addPreviewToLayout,
      updateWallMeshWithJustification: vi.fn(),
      setStatus: vi.fn()
    });

    expect(state.segments).toBe(2);
    expect(state.chainStart).toBe(existingChainStart);
    expect(state.preview).toBe(existingPreview);
    expect(makeWallPreviewMesh).not.toHaveBeenCalled();
    expect(addPreviewToLayout).not.toHaveBeenCalled();
  });

  it("does not end wall draw when start point is missing", () => {
    const addWall = vi.fn();

    const result = handleWallDrawEndClick({
      hitPoint: new THREE.Vector3(1, 0, 0),
      snapped: { kind: "none", point: new THREE.Vector3() },
      shouldAxisSnap: false,
      wallDraw: wallDraw({ active: true, a: null }),
      wallDefault: { thicknessMm: 100 },
      wallTypedHud: { style: { display: "block" } },
      snapAxisXZ: vi.fn(),
      addWall,
      autoJoinAtMmPoint: vi.fn(),
      clearWallDrawState: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      setStatus: vi.fn(),
      selectWall: vi.fn()
    });

    expect(result).toBe(false);
    expect(addWall).not.toHaveBeenCalled();
  });

  it("returns false without mutating continuation state when addWall fails", () => {
    const state = wallDraw({ active: true, a: new THREE.Vector3(0, 0, 0), preview: makeMesh() });
    const updateWallMeshWithJustification = vi.fn();

    const result = handleWallDrawEndClick({
      hitPoint: new THREE.Vector3(1, 0, 0),
      snapped: { kind: "none", point: new THREE.Vector3() },
      shouldAxisSnap: false,
      wallDraw: state,
      wallDefault: { thicknessMm: 100 },
      wallTypedHud: { style: { display: "block" } },
      snapAxisXZ: vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone()),
      addWall: vi.fn(() => null),
      autoJoinAtMmPoint: vi.fn(),
      clearWallDrawState: vi.fn(),
      updateWallMeshWithJustification,
      setStatus: vi.fn(),
      selectWall: vi.fn()
    });

    expect(result).toBe(false);
    expect(state.segments).toBe(0);
    expect(updateWallMeshWithJustification).not.toHaveBeenCalled();
  });

  it("ends wall draw segment, continues chain, updates preview, and selects wall", () => {
    const preview = makeMesh();
    const state = wallDraw({ active: true, a: new THREE.Vector3(0, 0, 0), preview, typedMm: "500" });
    const wallTypedHud = { style: { display: "block" } };
    const wall = makeWall("wall_2", { x: 2000, z: 0 });
    const autoJoinAtMmPoint = vi.fn();
    const updateWallMeshWithJustification = vi.fn();
    const setStatus = vi.fn();
    const selectWall = vi.fn();

    const result = handleWallDrawEndClick({
      hitPoint: new THREE.Vector3(2, 0, 0),
      snapped: { kind: "none", point: new THREE.Vector3() },
      shouldAxisSnap: false,
      wallDraw: state,
      wallDefault: { thicknessMm: 120, justification: "interior", exteriorSign: -1 },
      wallTypedHud,
      snapAxisXZ: vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone()),
      addWall: vi.fn(() => wall),
      autoJoinAtMmPoint,
      clearWallDrawState: vi.fn(),
      updateWallMeshWithJustification,
      setStatus,
      selectWall
    });

    expect(result).toBe(true);
    expect(autoJoinAtMmPoint).toHaveBeenNthCalledWith(1, wall.params.aMm);
    expect(autoJoinAtMmPoint).toHaveBeenNthCalledWith(2, wall.params.bMm);
    expect(state.segments).toBe(1);
    expect(state.active).toBe(true);
    expect(state.a).toEqual(new THREE.Vector3(2, 0, 0));
    expect(state.hoverB).toEqual(state.a);
    expect(state.hoverB).not.toBe(state.a);
    expect(state.typedMm).toBe("");
    expect(wallTypedHud.style.display).toBe("none");
    expect(updateWallMeshWithJustification).toHaveBeenCalledWith(preview, state.a, state.a, 120, "interior", -1);
    expect(setStatus).toHaveBeenCalledWith("Wall: next point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
    expect(selectWall).toHaveBeenCalledWith("wall_2");
  });

  it("closes wall draw chain after adding closing wall without selecting it", () => {
    const chainStart = new THREE.Vector3(0, 0, 0);
    const state = wallDraw({
      active: true,
      a: new THREE.Vector3(2, 0, 0),
      chainStart,
      segments: 2,
      preview: makeMesh(),
      typedMm: "900"
    });
    const wallTypedHud = { style: { display: "block" } };
    const clearWallDrawState = vi.fn();
    const setStatus = vi.fn();
    const selectWall = vi.fn();

    const result = handleWallDrawEndClick({
      hitPoint: new THREE.Vector3(0.04, 0, 0.02),
      snapped: { kind: "none", point: new THREE.Vector3() },
      shouldAxisSnap: true,
      wallDraw: state,
      wallDefault: { thicknessMm: 100 },
      wallTypedHud,
      snapAxisXZ: vi.fn((_: THREE.Vector3, b: THREE.Vector3) => b.clone()),
      addWall: vi.fn(() => makeWall("wall_close", { x: 0, z: 0 })),
      autoJoinAtMmPoint: vi.fn(),
      clearWallDrawState,
      updateWallMeshWithJustification: vi.fn(),
      setStatus,
      selectWall
    });

    expect(result).toBe(true);
    expect(state.segments).toBe(3);
    expect(state.typedMm).toBe("900");
    expect(wallTypedHud.style.display).toBe("block");
    expect(clearWallDrawState).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledWith("Wall: chain closed.");
    expect(selectWall).not.toHaveBeenCalled();
  });

  it("finishes added wall with keyboard-style typed HUD clearing before close", () => {
    const state = wallDraw({
      active: true,
      a: new THREE.Vector3(2, 0, 0),
      chainStart: new THREE.Vector3(0, 0, 0),
      segments: 2,
      preview: makeMesh(),
      typedMm: "900"
    });
    const wallTypedHud = { style: { display: "block" } };
    const clearWallDrawState = vi.fn();

    const result = finishWallDrawAfterAddedWall({
      wall: makeWall("wall_close", { x: 0, z: 0 }),
      closes: true,
      wallDraw: state,
      wallDefault: { thicknessMm: 100 },
      wallTypedHud,
      clearTypedBeforeClose: true,
      autoJoinAtMmPoint: vi.fn(),
      clearWallDrawState,
      updateWallMeshWithJustification: vi.fn(),
      setStatus: vi.fn(),
      selectWall: vi.fn()
    });

    expect(result).toBe(true);
    expect(state.segments).toBe(3);
    expect(state.typedMm).toBe("");
    expect(wallTypedHud.style.display).toBe("none");
    expect(clearWallDrawState).toHaveBeenCalledOnce();
  });
});
