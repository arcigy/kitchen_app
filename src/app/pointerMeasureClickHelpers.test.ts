import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { PlanSnapBinding } from "./planSnap";
import { SNAP_DISTANCE_PX } from "./snapToolProfiles";
import {
  clearMeasure2DPointerMoveHover,
  clearMeasure3DPointerMoveHover,
  handleLegacySurfaceMeasurePointClick,
  handleMeasurePointClick,
  updateLegacySurfaceMeasurePointerMoveHover,
  updateMeasure2DPointerMoveHover,
  updateMeasure3DPointerMoveHover
} from "./pointerMeasureClickHelpers";

function freeBinding(point: THREE.Vector3): PlanSnapBinding {
  return {
    type: "free",
    pointMm: {
      x: Math.round(point.x * 1000),
      y: Math.round(point.y * 1000),
      z: Math.round(point.z * 1000)
    }
  };
}

function makeDeps(overrides: Partial<Parameters<typeof handleMeasurePointClick>[0]> = {}) {
  const measureState = {
    axisLock: false,
    firstPoint: null as THREE.Vector3 | null,
    firstBinding: null as PlanSnapBinding | null
  };
  return {
    point: new THREE.Vector3(1, 0, 2),
    kind: "free",
    binding: null,
    normalMode: false,
    viewMode: "2d" as const,
    measureState,
    formatMm: (point: THREE.Vector3) => `${Math.round(point.x * 1000)},${Math.round(point.z * 1000)}`,
    toFreePlanBinding: freeBinding,
    axisLockXZ: vi.fn((a: THREE.Vector3, b: THREE.Vector3) => new THREE.Vector3(b.x, a.y, a.z)),
    axisLockPoint3D: vi.fn((a: THREE.Vector3, b: THREE.Vector3) => new THREE.Vector3(a.x, b.y, b.z)),
    planarDistanceMm: vi.fn(() => 1234),
    distance3dMm: vi.fn(() => 5678),
    addMeasurement: vi.fn(),
    setFirstPointMarker: vi.fn(),
    setReadout: vi.fn(),
    setStatus: vi.fn(),
    clearPreview: vi.fn(),
    clearToolHud: vi.fn(),
    mountProps: vi.fn(),
    ...overrides
  };
}

describe("pointer measure click helpers", () => {
  it("clears 2d measure hover UI through the reset helper", () => {
    const hideHoverCursor = vi.fn();
    const clearToolHud = vi.fn();
    const clearPreview = vi.fn();

    clearMeasure2DPointerMoveHover({
      hideHoverCursor,
      clearToolHud,
      clearPreview
    });

    expect(hideHoverCursor).toHaveBeenCalledOnce();
    expect(clearToolHud).toHaveBeenCalledOnce();
    expect(clearPreview).toHaveBeenCalledOnce();
  });

  it("clears 2d measure hover UI when pointermove has no ground hit", () => {
    const hideHoverCursor = vi.fn();
    const clearToolHud = vi.fn();
    const clearPreview = vi.fn();
    const updateMeasureHoverFromPlanPoint = vi.fn();

    updateMeasure2DPointerMoveHover({
      hitPoint: null,
      rect: {} as DOMRect,
      normalMode: false,
      hideHoverCursor,
      clearToolHud,
      clearPreview,
      updateMeasureHoverFromPlanPoint
    });

    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(clearToolHud).toHaveBeenCalledTimes(1);
    expect(clearPreview).toHaveBeenCalledTimes(1);
    expect(updateMeasureHoverFromPlanPoint).not.toHaveBeenCalled();
  });

  it("updates 2d measure hover from plan point when pointermove hits the ground", () => {
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const rect = {} as DOMRect;
    const hideHoverCursor = vi.fn();
    const clearToolHud = vi.fn();
    const clearPreview = vi.fn();
    const updateMeasureHoverFromPlanPoint = vi.fn();

    updateMeasure2DPointerMoveHover({
      hitPoint,
      rect,
      normalMode: true,
      hideHoverCursor,
      clearToolHud,
      clearPreview,
      updateMeasureHoverFromPlanPoint
    });

    expect(updateMeasureHoverFromPlanPoint).toHaveBeenCalledWith(hitPoint, rect, true);
    expect(hideHoverCursor).not.toHaveBeenCalled();
    expect(clearToolHud).not.toHaveBeenCalled();
    expect(clearPreview).not.toHaveBeenCalled();
  });

  it("clears 3d measure hover state and readout when pointermove has no surface hit", () => {
    const measureState = {
      axisLock: false,
      firstPoint: null as THREE.Vector3 | null,
      hoverPoint: new THREE.Vector3(1, 2, 3) as THREE.Vector3 | null,
      hoverSnap: "edge" as const
    };
    const hideHoverCursor = vi.fn();
    const clearToolHud = vi.fn();
    const clearPreview = vi.fn();
    const setReadout = vi.fn();

    updateMeasure3DPointerMoveHover({
      hit: null,
      rect: {} as DOMRect,
      measureState,
      cam: () => new THREE.PerspectiveCamera(),
      getMeasure3DSnapTargetObject: vi.fn(),
      snapPoint3D: vi.fn(),
      applyMeasureAxisAssist3D: vi.fn(),
      worldToScreen: vi.fn(),
      updateHoverCursor: vi.fn(),
      hideHoverCursor,
      clearToolHud,
      clearPreview,
      setReadout,
      hudHoverLine: new THREE.Mesh(),
      hudLineThickness: 2,
      updateHudLine: vi.fn(),
      updatePreview: vi.fn(),
      distance3dMm: vi.fn(),
      axisLockPoint3D: vi.fn(),
      setFirstPointMarker: vi.fn()
    });

    expect(measureState.hoverPoint).toBeNull();
    expect(measureState.hoverSnap).toBe("none");
    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(clearToolHud).toHaveBeenCalledTimes(1);
    expect(clearPreview).toHaveBeenCalledTimes(1);
    expect(setReadout).toHaveBeenCalledWith("Measure 3D: click first point.");
  });

  it("clears 3d measure hover state with the second point readout when first point exists", () => {
    const firstPoint = new THREE.Vector3(0, 0, 0);
    const measureState = {
      firstPoint,
      hoverPoint: new THREE.Vector3(1, 2, 3) as THREE.Vector3 | null,
      hoverSnap: "corner" as const
    };
    const hideHoverCursor = vi.fn();
    const clearToolHud = vi.fn();
    const clearPreview = vi.fn();
    const setReadout = vi.fn();

    clearMeasure3DPointerMoveHover({
      measureState,
      hideHoverCursor,
      clearToolHud,
      clearPreview,
      setReadout
    });

    expect(measureState.hoverPoint).toBeNull();
    expect(measureState.hoverSnap).toBe("none");
    expect(hideHoverCursor).toHaveBeenCalledOnce();
    expect(clearToolHud).toHaveBeenCalledOnce();
    expect(clearPreview).toHaveBeenCalledOnce();
    expect(setReadout).toHaveBeenCalledWith("Measure 3D: pick second point.");
  });

  it("updates 3d measure hover preview with current axis assist behavior", () => {
    const firstPoint = new THREE.Vector3(0, 0, 0);
    const assistedPoint = new THREE.Vector3(2, 0, 0);
    const measureState = {
      axisLock: false,
      firstPoint,
      hoverPoint: null as THREE.Vector3 | null,
      hoverSnap: "none" as const
    };
    const object = new THREE.Mesh();
    const camera = new THREE.PerspectiveCamera();
    const rect = {} as DOMRect;
    const hudHoverLine = new THREE.Mesh();
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });
    const updatePreview = vi.fn();
    const distance3dMm = vi.fn(() => 2000);
    const setReadout = vi.fn();
    const setFirstPointMarker = vi.fn();
    const snapPoint3D = vi.fn(() => ({ point: new THREE.Vector3(1, 0, 0), kind: "free" as const }));
    const applyMeasureAxisAssist3D = vi.fn(() => ({ point: assistedPoint, distancePx: 4 }));

    updateMeasure3DPointerMoveHover({
      hit: { point: new THREE.Vector3(1, 0, 0), object },
      rect,
      measureState,
      cam: () => camera,
      getMeasure3DSnapTargetObject: () => null,
      snapPoint3D,
      applyMeasureAxisAssist3D,
      worldToScreen: vi.fn(() => new THREE.Vector2(10, 20)),
      updateHoverCursor: vi.fn(),
      hideHoverCursor: vi.fn(),
      clearToolHud: vi.fn(),
      clearPreview: vi.fn(),
      setReadout,
      hudHoverLine,
      hudLineThickness: 2,
      updateHudLine,
      updatePreview,
      distance3dMm,
      axisLockPoint3D: vi.fn(),
      setFirstPointMarker
    });

    expect(measureState.hoverPoint).toEqual(assistedPoint);
    expect(snapPoint3D).toHaveBeenCalledWith(new THREE.Vector3(1, 0, 0), object, camera, rect, SNAP_DISTANCE_PX.measure3d);
    expect(applyMeasureAxisAssist3D).toHaveBeenCalledWith(firstPoint, new THREE.Vector3(1, 0, 0), camera, rect, SNAP_DISTANCE_PX.measure3dAxis);
    expect(measureState.hoverPoint).not.toBe(assistedPoint);
    expect(measureState.hoverSnap).toBe("axis");
    expect(updateHudLine).toHaveBeenCalledWith(hudHoverLine, firstPoint, assistedPoint, 3.5);
    expect(updatePreview).toHaveBeenCalledWith(firstPoint, assistedPoint, rect, 2000);
    expect(distance3dMm).toHaveBeenCalledTimes(2);
    expect(setReadout).toHaveBeenCalledWith("Measure 3D (axis): 2000 mm");
    expect(setFirstPointMarker).toHaveBeenCalledWith(firstPoint);
  });

  it("clears legacy surface measure hover when pointermove has no surface hit", () => {
    const measureState = {
      axisLock: false,
      firstPoint: null as THREE.Vector3 | null,
      hoverPoint: new THREE.Vector3(1, 0, 2) as THREE.Vector3 | null,
      hoverSnap: "edge" as const
    };
    const hideHoverCursor = vi.fn();
    const setReadout = vi.fn();
    const clearPreview = vi.fn();

    updateLegacySurfaceMeasurePointerMoveHover({
      hit: null,
      rect: {} as DOMRect,
      measureState,
      snapPointXZ: vi.fn(),
      cam: () => new THREE.PerspectiveCamera(),
      worldToScreen: vi.fn(),
      updateHoverCursor: vi.fn(),
      hideHoverCursor,
      setReadout,
      clearPreview,
      updatePreview: vi.fn(),
      axisLockXZ: vi.fn(),
      planarDistanceMm: vi.fn(),
      formatMm: vi.fn()
    });

    expect(measureState.hoverPoint).toBeNull();
    expect(measureState.hoverSnap).toBe("none");
    expect(hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(setReadout).toHaveBeenCalledWith("Click 2 points to measure (planar X/Z).");
    expect(clearPreview).toHaveBeenCalledTimes(1);
  });

  it("updates legacy surface measure hover by reference before first point", () => {
    const object = new THREE.Mesh();
    const snappedPoint = new THREE.Vector3(1, 0, 2);
    const measureState = {
      axisLock: false,
      firstPoint: null as THREE.Vector3 | null,
      hoverPoint: null as THREE.Vector3 | null,
      hoverSnap: "none" as const
    };
    const clearPreview = vi.fn();
    const setReadout = vi.fn();

    updateLegacySurfaceMeasurePointerMoveHover({
      hit: { point: new THREE.Vector3(9, 0, 9), object },
      rect: {} as DOMRect,
      measureState,
      snapPointXZ: vi.fn(() => ({ point: snappedPoint, kind: "corner" as const })),
      cam: () => new THREE.PerspectiveCamera(),
      worldToScreen: vi.fn(() => new THREE.Vector2(1, 2)),
      updateHoverCursor: vi.fn(),
      hideHoverCursor: vi.fn(),
      setReadout,
      clearPreview,
      updatePreview: vi.fn(),
      axisLockXZ: vi.fn(),
      planarDistanceMm: vi.fn(),
      formatMm: () => "1000,2000"
    });

    expect(measureState.hoverPoint).toBe(snappedPoint);
    expect(measureState.hoverSnap).toBe("corner");
    expect(setReadout).toHaveBeenCalledWith("Hover (corner): 1000,2000 -> click first point");
    expect(clearPreview).toHaveBeenCalledTimes(1);
  });

  it("updates legacy surface measure preview from first point with axis lock", () => {
    const object = new THREE.Mesh();
    const firstPoint = new THREE.Vector3(0, 0, 5);
    const snappedPoint = new THREE.Vector3(2, 0, 9);
    const lockedPoint = new THREE.Vector3(2, 0, 5);
    const measureState = {
      axisLock: true,
      firstPoint,
      hoverPoint: null as THREE.Vector3 | null,
      hoverSnap: "none" as const
    };
    const updatePreview = vi.fn();
    const setReadout = vi.fn();

    updateLegacySurfaceMeasurePointerMoveHover({
      hit: { point: new THREE.Vector3(9, 0, 9), object },
      rect: {} as DOMRect,
      measureState,
      snapPointXZ: vi.fn(() => ({ point: snappedPoint, kind: "edge" as const })),
      cam: () => new THREE.PerspectiveCamera(),
      worldToScreen: vi.fn(() => new THREE.Vector2(1, 2)),
      updateHoverCursor: vi.fn(),
      hideHoverCursor: vi.fn(),
      setReadout,
      clearPreview: vi.fn(),
      updatePreview,
      axisLockXZ: vi.fn(() => lockedPoint),
      planarDistanceMm: vi.fn(() => 2222),
      formatMm: vi.fn()
    });

    expect(measureState.hoverPoint).toBe(snappedPoint);
    expect(updatePreview).toHaveBeenCalledWith(firstPoint, lockedPoint, expect.anything());
    expect(setReadout).toHaveBeenCalledWith("Measuring (edge) -> 2222 mm");
  });

  it("stores the first measure point and updates marker, readout, status, and props", () => {
    const deps = makeDeps({ point: new THREE.Vector3(1, 0, 2), kind: "corner" });

    handleMeasurePointClick(deps);

    expect(deps.measureState.firstPoint).toEqual(new THREE.Vector3(1, 0, 2));
    expect(deps.measureState.firstPoint).not.toBe(deps.point);
    expect(deps.measureState.firstBinding).toEqual({ type: "free", pointMm: { x: 1000, y: 0, z: 2000 } });
    expect(deps.setFirstPointMarker).toHaveBeenCalledWith(deps.measureState.firstPoint);
    expect(deps.setReadout).toHaveBeenCalledWith("First point (corner): 1000,2000 -> click second point.");
    expect(deps.setStatus).toHaveBeenCalledWith("Measure: click second point.");
    expect(deps.mountProps).toHaveBeenCalledTimes(1);
  });

  it("uses the current normal mode first point readout and status", () => {
    const deps = makeDeps({ normalMode: true, kind: "axis" });

    handleMeasurePointClick(deps);

    expect(deps.setReadout).toHaveBeenCalledWith("Normal (axis): 1000,2000 -> click second guide point.");
    expect(deps.setStatus).toHaveBeenCalledWith("Measure: click second guide point for normal.");
  });

  it("commits a 2d distance measure and clears active measure state", () => {
    const firstBinding = freeBinding(new THREE.Vector3(0, 0, 0));
    const deps = makeDeps({
      point: new THREE.Vector3(2, 0, 0),
      measureState: { axisLock: false, firstPoint: new THREE.Vector3(0, 0, 0), firstBinding },
      binding: freeBinding(new THREE.Vector3(2, 0, 0))
    });

    handleMeasurePointClick(deps);

    expect(deps.addMeasurement).toHaveBeenCalledWith(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      firstBinding,
      { type: "free", pointMm: { x: 2000, y: 0, z: 0 } },
      { kind: "distance", distanceMm: 1234 }
    );
    expect(deps.measureState.firstPoint).toBeNull();
    expect(deps.measureState.firstBinding).toBeNull();
    expect(deps.setFirstPointMarker).toHaveBeenCalledWith(null);
    expect(deps.clearPreview).toHaveBeenCalledTimes(1);
    expect(deps.clearToolHud).toHaveBeenCalledTimes(1);
  });

  it("commits a 3d distance measure using the 3d distance function", () => {
    const deps = makeDeps({
      viewMode: "3d",
      point: new THREE.Vector3(1, 2, 3),
      measureState: { axisLock: false, firstPoint: new THREE.Vector3(0, 0, 0), firstBinding: null }
    });

    handleMeasurePointClick(deps);

    expect(deps.distance3dMm).toHaveBeenCalledTimes(1);
    expect(deps.planarDistanceMm).not.toHaveBeenCalled();
    expect(deps.addMeasurement).toHaveBeenCalledWith(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 2, 3),
      { type: "free", pointMm: { x: 0, y: 0, z: 0 } },
      { type: "free", pointMm: { x: 1000, y: 2000, z: 3000 } },
      { kind: "distance", distanceMm: 5678 }
    );
  });

  it("applies the current 2d axis lock before committing distance", () => {
    const deps = makeDeps({
      measureState: { axisLock: true, firstPoint: new THREE.Vector3(0, 0, 5), firstBinding: null },
      point: new THREE.Vector3(2, 0, 9)
    });

    handleMeasurePointClick(deps);

    expect(deps.axisLockXZ).toHaveBeenCalledTimes(1);
    expect(deps.addMeasurement).toHaveBeenCalledWith(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(2, 0, 5),
      { type: "free", pointMm: { x: 0, y: 0, z: 5000 } },
      { type: "free", pointMm: { x: 2000, y: 0, z: 5000 } },
      { kind: "distance", distanceMm: 1234 }
    );
  });

  it("commits a normal guide segment and clears active measure state", () => {
    const deps = makeDeps({
      normalMode: true,
      measureState: { axisLock: false, firstPoint: new THREE.Vector3(0, 0, 0), firstBinding: null },
      point: new THREE.Vector3(1, 0, 0)
    });

    handleMeasurePointClick(deps);

    expect(deps.addMeasurement).toHaveBeenCalledWith(
      new THREE.Vector3(0, 0, -3),
      new THREE.Vector3(0, 0, 3),
      { type: "free", pointMm: { x: 0, y: 0, z: 0 } },
      { type: "free", pointMm: { x: 1000, y: 0, z: 0 } },
      { kind: "normalGuide" }
    );
    expect(deps.measureState.firstPoint).toBeNull();
    expect(deps.measureState.firstBinding).toBeNull();
    expect(deps.clearPreview).toHaveBeenCalledTimes(1);
    expect(deps.clearToolHud).toHaveBeenCalledTimes(1);
  });

  it("clears active state even when a degenerate normal guide creates no measurement", () => {
    const deps = makeDeps({
      normalMode: true,
      measureState: { axisLock: false, firstPoint: new THREE.Vector3(1, 0, 1), firstBinding: null },
      point: new THREE.Vector3(1, 0, 1)
    });

    handleMeasurePointClick(deps);

    expect(deps.addMeasurement).not.toHaveBeenCalled();
    expect(deps.measureState.firstPoint).toBeNull();
    expect(deps.measureState.firstBinding).toBeNull();
    expect(deps.setFirstPointMarker).toHaveBeenCalledWith(null);
    expect(deps.clearPreview).toHaveBeenCalledTimes(1);
    expect(deps.clearToolHud).toHaveBeenCalledTimes(1);
  });

  it("stores the legacy surface first point by reference with the current readout", () => {
    const point = new THREE.Vector3(1, 0, 2);
    const measureState = { axisLock: false, firstPoint: null as THREE.Vector3 | null, firstBinding: null as PlanSnapBinding | null };
    const setReadout = vi.fn();

    handleLegacySurfaceMeasurePointClick({
      point,
      kind: "edge",
      measureState,
      formatMm: (value) => `${value.x},${value.z}`,
      toFreePlanBinding: freeBinding,
      axisLockXZ: vi.fn(),
      planarDistanceMm: vi.fn(),
      addMeasurement: vi.fn(),
      setReadout,
      clearPreview: vi.fn()
    });

    expect(measureState.firstPoint).toBe(point);
    expect(measureState.firstBinding).toEqual({ type: "free", pointMm: { x: 1000, y: 0, z: 2000 } });
    expect(setReadout).toHaveBeenCalledWith("First point (edge): 1,2 -> pick second point...");
  });

  it("commits the legacy surface distance measure and only clears preview/state", () => {
    const first = new THREE.Vector3(0, 0, 0);
    const measureState = { axisLock: false, firstPoint: first as THREE.Vector3 | null, firstBinding: null as PlanSnapBinding | null };
    const addMeasurement = vi.fn();
    const clearPreview = vi.fn();

    handleLegacySurfaceMeasurePointClick({
      point: new THREE.Vector3(2, 0, 0),
      kind: "free",
      measureState,
      formatMm: vi.fn(),
      toFreePlanBinding: freeBinding,
      axisLockXZ: vi.fn(),
      planarDistanceMm: vi.fn(() => 2222),
      addMeasurement,
      setReadout: vi.fn(),
      clearPreview
    });

    expect(addMeasurement).toHaveBeenCalledWith(
      first,
      new THREE.Vector3(2, 0, 0),
      { type: "free", pointMm: { x: 0, y: 0, z: 0 } },
      { type: "free", pointMm: { x: 2000, y: 0, z: 0 } },
      { kind: "distance", distanceMm: 2222 }
    );
    expect(measureState.firstPoint).toBeNull();
    expect(measureState.firstBinding).toBeNull();
    expect(clearPreview).toHaveBeenCalledTimes(1);
  });

  it("applies legacy surface axis lock before distance and binding fallback", () => {
    const first = new THREE.Vector3(0, 0, 5);
    const measureState = { axisLock: true, firstPoint: first as THREE.Vector3 | null, firstBinding: null as PlanSnapBinding | null };
    const axisLockXZ = vi.fn(() => new THREE.Vector3(2, 0, 5));
    const addMeasurement = vi.fn();

    handleLegacySurfaceMeasurePointClick({
      point: new THREE.Vector3(2, 0, 9),
      kind: "free",
      measureState,
      formatMm: vi.fn(),
      toFreePlanBinding: freeBinding,
      axisLockXZ,
      planarDistanceMm: vi.fn(() => 2222),
      addMeasurement,
      setReadout: vi.fn(),
      clearPreview: vi.fn()
    });

    expect(axisLockXZ).toHaveBeenCalledWith(first, new THREE.Vector3(2, 0, 9));
    expect(addMeasurement).toHaveBeenCalledWith(
      first,
      new THREE.Vector3(2, 0, 5),
      { type: "free", pointMm: { x: 0, y: 0, z: 5000 } },
      { type: "free", pointMm: { x: 2000, y: 0, z: 5000 } },
      { kind: "distance", distanceMm: 2222 }
    );
  });
});
