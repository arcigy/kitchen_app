import * as THREE from "three";
import type { MeasureState } from "./measureTools";
import type { PlanSnapBinding } from "./planSnap";
import { resolveNormalGuideSegment } from "./measureGeometryHelpers";

export type PointerMeasureViewMode = "2d" | "3d";

export function updateMeasure2DPointerMoveHover(params: {
  hitPoint: THREE.Vector3 | null;
  rect: DOMRect;
  normalMode: boolean;
  hideHoverCursor: () => void;
  clearToolHud: () => void;
  clearPreview: () => void;
  updateMeasureHoverFromPlanPoint: (hitPoint: THREE.Vector3, rect: DOMRect, normalMode: boolean) => void;
}): void {
  if (!params.hitPoint) {
    params.hideHoverCursor();
    params.clearToolHud();
    params.clearPreview();
    return;
  }

  params.updateMeasureHoverFromPlanPoint(params.hitPoint, params.rect, params.normalMode);
}

export function clearMeasure3DPointerMoveHover(params: {
  measureState: Pick<MeasureState, "firstPoint" | "hoverPoint" | "hoverSnap">;
  hideHoverCursor: () => void;
  clearToolHud: () => void;
  clearPreview: () => void;
  setReadout: (message: string) => void;
}): void {
  params.measureState.hoverPoint = null;
  params.measureState.hoverSnap = "none";
  params.hideHoverCursor();
  params.clearToolHud();
  params.clearPreview();
  params.setReadout(params.measureState.firstPoint ? "Measure 3D: pick second point." : "Measure 3D: click first point.");
}

export function updateMeasure3DPointerMoveHover(params: {
  hit: { point: THREE.Vector3; object: THREE.Object3D } | null;
  rect: DOMRect;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint" | "hoverPoint" | "hoverSnap">;
  cam: () => THREE.Camera;
  getMeasure3DSnapTargetObject: (object: THREE.Object3D | null | undefined) => THREE.Object3D | null;
  snapPoint3D: (
    point: THREE.Vector3,
    object: THREE.Object3D,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx: number
  ) => { point: THREE.Vector3; kind: "free" | "edge" | "corner" };
  applyMeasureAxisAssist3D: (
    firstPoint: THREE.Vector3 | null,
    point: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx: number
  ) => { point: THREE.Vector3; distancePx: number } | null;
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  updateHoverCursor: (point: THREE.Vector2, kind: MeasureState["hoverSnap"]) => void;
  hideHoverCursor: () => void;
  clearToolHud: () => void;
  clearPreview: () => void;
  setReadout: (message: string) => void;
  hudHoverLine: THREE.Mesh;
  hudLineThickness: number;
  updateHudLine: (hud: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thickness: number) => void;
  updatePreview: (a: THREE.Vector3, b: THREE.Vector3, rect: DOMRect, distanceMm: number) => void;
  distance3dMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  axisLockPoint3D: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
}): void {
  if (!params.hit) {
    clearMeasure3DPointerMoveHover({
      measureState: params.measureState,
      hideHoverCursor: params.hideHoverCursor,
      clearToolHud: params.clearToolHud,
      clearPreview: params.clearPreview,
      setReadout: params.setReadout
    });
    return;
  }

  const snapTarget = params.getMeasure3DSnapTargetObject(params.hit.object);
  const snapped = params.snapPoint3D(params.hit.point, snapTarget ?? params.hit.object, params.cam(), params.rect, 32);
  let kind: MeasureState["hoverSnap"] = snapped.kind;
  let point = snapped.point.clone();
  if (!params.measureState.axisLock && snapped.kind === "free") {
    const axisAssist = params.applyMeasureAxisAssist3D(params.measureState.firstPoint, point, params.cam(), params.rect, 12);
    if (axisAssist) {
      point = axisAssist.point;
      kind = "axis";
    }
  }

  params.measureState.hoverPoint = point.clone();
  params.measureState.hoverSnap = kind;
  params.updateHoverCursor(params.worldToScreen(point, params.cam(), params.rect), kind);

  if (kind === "axis" && params.measureState.firstPoint) {
    params.updateHudLine(params.hudHoverLine, params.measureState.firstPoint, point, params.hudLineThickness * 1.75);
  } else {
    params.hudHoverLine.visible = false;
  }

  if (params.measureState.firstPoint) {
    const a = params.measureState.firstPoint.clone();
    let b = point.clone();
    if (params.measureState.axisLock) b = params.axisLockPoint3D(a, b);
    params.updatePreview(a, b, params.rect, params.distance3dMm(a, b));
    params.setReadout(`Measure 3D (${kind}): ${Math.round(params.distance3dMm(a, b))} mm`);
  } else {
    params.clearPreview();
    params.setReadout(`Measure 3D hover (${kind}): ${Math.round(point.x * 1000)}, ${Math.round(point.y * 1000)}, ${Math.round(point.z * 1000)}`);
  }
  params.setFirstPointMarker(params.measureState.firstPoint);
}

export function updateLegacySurfaceMeasurePointerMoveHover(params: {
  hit: { point: THREE.Vector3; object: THREE.Mesh } | null;
  rect: DOMRect;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint" | "hoverPoint" | "hoverSnap">;
  snapPointXZ: (point: THREE.Vector3, object: THREE.Mesh) => { point: THREE.Vector3; kind: MeasureState["hoverSnap"] };
  cam: () => THREE.Camera;
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  updateHoverCursor: (point: THREE.Vector2, kind: MeasureState["hoverSnap"]) => void;
  hideHoverCursor: () => void;
  setReadout: (message: string) => void;
  clearPreview: () => void;
  updatePreview: (a: THREE.Vector3, b: THREE.Vector3, rect: DOMRect) => void;
  axisLockXZ: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  planarDistanceMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  formatMm: (point: THREE.Vector3) => string;
}): void {
  if (!params.hit) {
    params.measureState.hoverPoint = null;
    params.measureState.hoverSnap = "none";
    params.hideHoverCursor();
    params.setReadout(params.measureState.firstPoint ? "Pick second point... (no surface)" : "Click 2 points to measure (planar X/Z).");
    params.clearPreview();
    return;
  }

  const snapped = params.snapPointXZ(params.hit.point, params.hit.object);
  params.measureState.hoverPoint = snapped.point;
  params.measureState.hoverSnap = snapped.kind;
  params.updateHoverCursor(params.worldToScreen(snapped.point, params.cam(), params.rect), snapped.kind);

  if (params.measureState.firstPoint) {
    const a = params.measureState.firstPoint;
    let b = snapped.point;
    if (params.measureState.axisLock) b = params.axisLockXZ(a, b);
    params.updatePreview(a, b, params.rect);
    params.setReadout(`Measuring (${snapped.kind}) -> ${Math.round(params.planarDistanceMm(a, b))} mm`);
  } else {
    params.setReadout(`Hover (${snapped.kind}): ${params.formatMm(snapped.point)} -> click first point`);
    params.clearPreview();
  }
}

export function handleMeasurePointClick(params: {
  point: THREE.Vector3;
  kind: string;
  binding: PlanSnapBinding | null;
  normalMode: boolean;
  viewMode: PointerMeasureViewMode;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint" | "firstBinding">;
  formatMm: (point: THREE.Vector3) => string;
  toFreePlanBinding: (point: THREE.Vector3) => PlanSnapBinding;
  axisLockXZ: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  axisLockPoint3D: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  planarDistanceMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  distance3dMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  addMeasurement: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    aBinding: PlanSnapBinding,
    bBinding: PlanSnapBinding,
    options?: { kind?: "distance" | "normalGuide"; distanceMm?: number }
  ) => unknown;
  setFirstPointMarker: (point: THREE.Vector3 | null) => void;
  setReadout: (message: string) => void;
  setStatus: (message: string) => void;
  clearPreview: () => void;
  clearToolHud: () => void;
  mountProps: () => void;
}): void {
  if (!params.measureState.firstPoint) {
    params.measureState.firstPoint = params.point.clone();
    params.measureState.firstBinding = params.binding ?? params.toFreePlanBinding(params.point);
    params.setFirstPointMarker(params.measureState.firstPoint);
    params.setReadout(
      params.normalMode
        ? `Normal (${params.kind}): ${params.formatMm(params.point)} -> click second guide point.`
        : `First point (${params.kind}): ${params.formatMm(params.point)} -> click second point.`
    );
    params.setStatus(params.normalMode ? "Measure: click second guide point for normal." : "Measure: click second point.");
    params.mountProps();
    return;
  }

  const a = params.measureState.firstPoint.clone();
  let b = params.point.clone();
  if (params.measureState.axisLock) b = params.viewMode === "2d" ? params.axisLockXZ(a, b) : params.axisLockPoint3D(a, b);
  const aBinding = params.measureState.firstBinding ?? params.toFreePlanBinding(a);
  const bBinding = params.binding ?? params.toFreePlanBinding(b);

  if (params.normalMode) {
    const normalGuide = resolveNormalGuideSegment(a, b);
    if (normalGuide) {
      params.addMeasurement(normalGuide.a, normalGuide.b, aBinding, bBinding, { kind: "normalGuide" });
    }
  } else {
    params.addMeasurement(a, b, aBinding, bBinding, {
      kind: "distance",
      distanceMm: params.viewMode === "2d" ? params.planarDistanceMm(a, b) : params.distance3dMm(a, b)
    });
  }

  params.measureState.firstPoint = null;
  params.measureState.firstBinding = null;
  params.setFirstPointMarker(null);
  params.clearPreview();
  params.clearToolHud();
}

export function handleLegacySurfaceMeasurePointClick(params: {
  point: THREE.Vector3;
  kind: string;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint" | "firstBinding">;
  formatMm: (point: THREE.Vector3) => string;
  toFreePlanBinding: (point: THREE.Vector3) => PlanSnapBinding;
  axisLockXZ: (a: THREE.Vector3, b: THREE.Vector3) => THREE.Vector3;
  planarDistanceMm: (a: THREE.Vector3, b: THREE.Vector3) => number;
  addMeasurement: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    aBinding: PlanSnapBinding,
    bBinding: PlanSnapBinding,
    options?: { kind?: "distance"; distanceMm?: number }
  ) => unknown;
  setReadout: (message: string) => void;
  clearPreview: () => void;
}): void {
  if (!params.measureState.firstPoint) {
    params.measureState.firstPoint = params.point;
    params.measureState.firstBinding = params.toFreePlanBinding(params.point);
    params.setReadout(`First point (${params.kind}): ${params.formatMm(params.point)} -> pick second point...`);
    return;
  }

  const a = params.measureState.firstPoint;
  let b = params.point;
  if (params.measureState.axisLock) b = params.axisLockXZ(a, b);

  params.addMeasurement(a, b, params.measureState.firstBinding ?? params.toFreePlanBinding(a), params.toFreePlanBinding(b), {
    kind: "distance",
    distanceMm: params.planarDistanceMm(a, b)
  });
  params.measureState.firstPoint = null;
  params.measureState.firstBinding = null;
  params.clearPreview();
}
