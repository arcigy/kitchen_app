import * as THREE from "three";
import type { PlanSnapResult } from "./planSnap";
import { findParallelWallEndAlignmentGuide, type WallEndAlignmentGuide, type WallAlignmentGuideWall } from "./wallAlignmentGuide";
import { SNAP_DISTANCE_M, SNAP_DISTANCE_PX } from "./snapToolProfiles";

export type PointerWallDrawState = {
  active: boolean;
  segments: number;
  a: THREE.Vector3 | null;
  chainStart: THREE.Vector3 | null;
  hoverB: THREE.Vector3 | null;
  typedMm: string;
  preview: THREE.Mesh | null;
};

export type PointerWallDrawHoverState = PointerWallDrawState & {
  lastPointerPx: { x: number; y: number };
};

export type PointerWallDefault = {
  thicknessMm: number;
  justification?: "center" | "interior" | "exterior";
  exteriorSign?: 1 | -1;
};

export type PointerWallDrawWall = {
  id: string;
  params: {
    aMm: { x: number; z: number };
    bMm: { x: number; z: number };
  };
};

function wallDrawAlignmentSnapDistanceM(rect: DOMRect, camera: THREE.Camera) {
  if (camera instanceof THREE.OrthographicCamera) {
    const visibleWidthM = Math.abs(camera.right - camera.left) / Math.max(1e-6, camera.zoom);
    const worldPerPx = visibleWidthM / Math.max(1, rect.width);
    return Math.min(
      SNAP_DISTANCE_M.wallDrawAlignmentMax,
      Math.max(SNAP_DISTANCE_M.wallDrawAlignmentMin, worldPerPx * SNAP_DISTANCE_PX.wallDrawAlignmentPx)
    );
  }
  return SNAP_DISTANCE_M.wallDrawAlignmentPerspective;
}

function shouldUseWallAlignmentSnap(params: {
  guide: WallEndAlignmentGuide | null;
  cursor: THREE.Vector3;
  rect: DOMRect;
  camera: THREE.Camera;
  precisionMm: boolean;
}) {
  if (!params.guide) return false;
  const distance = Math.hypot(params.cursor.x - params.guide.snapPoint.x, params.cursor.z - params.guide.snapPoint.z);
  const limit = params.precisionMm ? SNAP_DISTANCE_M.wallDrawAlignmentPrecision : wallDrawAlignmentSnapDistanceM(params.rect, params.camera);
  return distance <= limit;
}

function resolveWallDrawAlignmentSnap(params: {
  enabled: boolean;
  walls: readonly WallAlignmentGuideWall[];
  start: THREE.Vector3;
  cursor: THREE.Vector3;
  rect: DOMRect;
  camera: THREE.Camera;
  precisionMm: boolean;
  show: boolean;
  hudWallEndAlignmentGuide?: THREE.Line | null;
  updateHudDashedLine?: ((line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => void) | null;
}) {
  const hideGuide = () => {
    if (params.hudWallEndAlignmentGuide) params.hudWallEndAlignmentGuide.visible = false;
  };
  if (!params.enabled) {
    if (params.show) hideGuide();
    return null;
  }

  const guide = findParallelWallEndAlignmentGuide({
    walls: params.walls,
    start: params.start,
    cursor: params.cursor,
    snapDistanceM: wallDrawAlignmentSnapDistanceM(params.rect, params.camera)
  });
  if (!shouldUseWallAlignmentSnap({ guide, cursor: params.cursor, rect: params.rect, camera: params.camera, precisionMm: params.precisionMm })) {
    if (params.show) hideGuide();
    return null;
  }

  if (params.show && params.hudWallEndAlignmentGuide && params.updateHudDashedLine) {
    params.updateHudDashedLine(params.hudWallEndAlignmentGuide, guide!.refPoint, guide!.snapPoint);
  }
  return guide!.snapPoint.clone();
}

export function resolveWallDrawStartPoint(params: {
  hitPoint: THREE.Vector3;
  snapped: Pick<PlanSnapResult, "kind" | "point">;
}): THREE.Vector3 {
  const start = params.snapped.kind !== "none" ? params.snapped.point : params.hitPoint.clone();
  const startMm = { x: Math.round(start.x * 1000), z: Math.round(start.z * 1000) };
  return new THREE.Vector3(startMm.x / 1000, 0, startMm.z / 1000);
}

export function resolveWallDrawEndPoint(params: {
  a: THREE.Vector3;
  hitPoint: THREE.Vector3;
  snapped: Pick<PlanSnapResult, "kind" | "point">;
  chainStart: THREE.Vector3 | null;
  segments: number;
  closeToleranceM: number;
  shouldAxisSnap: boolean;
  alignmentSnapPoint?: THREE.Vector3 | null;
  snapAxisXZ: (a: THREE.Vector3, b: THREE.Vector3, allowDiagonal: boolean) => THREE.Vector3;
}): { end: THREE.Vector3; closes: boolean } {
  const rawB = params.snapped.kind !== "none" ? params.snapped.point : params.hitPoint.clone();
  const closesRaw =
    !!params.chainStart &&
    params.segments >= 2 &&
    Math.hypot(rawB.x - params.chainStart.x, rawB.z - params.chainStart.z) <= params.closeToleranceM;
  const b0 = closesRaw && params.chainStart ? params.chainStart.clone() : rawB;
  const b = params.alignmentSnapPoint ?? (params.shouldAxisSnap && !closesRaw ? params.snapAxisXZ(params.a, b0, true) : b0);
  const bMm = { x: Math.round(b.x * 1000), z: Math.round(b.z * 1000) };
  const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);

  const closes =
    closesRaw ||
    (!!params.chainStart &&
      params.segments >= 2 &&
      Math.hypot(bExact.x - params.chainStart.x, bExact.z - params.chainStart.z) <= params.closeToleranceM);
  const end = closes && params.chainStart ? params.chainStart.clone() : bExact;
  return { end, closes };
}

export function resolveWallDrawHoverPoint(params: {
  a: THREE.Vector3;
  hitPoint: THREE.Vector3;
  snapPoint: THREE.Vector3 | null;
  chainStart: THREE.Vector3 | null;
  segments: number;
  closeToleranceM: number;
  allowAxisSnap: boolean;
  alignmentSnapPoint?: THREE.Vector3 | null;
  snapAxisXZ: (a: THREE.Vector3, b: THREE.Vector3, allowDiagonal: boolean) => THREE.Vector3;
}): THREE.Vector3 {
  const rawB = params.snapPoint ?? params.hitPoint;
  const closesRaw =
    !!params.chainStart &&
    params.segments >= 2 &&
    Math.hypot(rawB.x - params.chainStart.x, rawB.z - params.chainStart.z) <= params.closeToleranceM;
  const shouldAxisSnap = params.allowAxisSnap && !params.snapPoint && !closesRaw;
  const b0 = closesRaw && params.chainStart ? params.chainStart : rawB;
  return params.alignmentSnapPoint ?? (shouldAxisSnap ? params.snapAxisXZ(params.a, b0, true) : b0);
}

export function resolveWallDrawActiveSnap(params: {
  hitPoint: THREE.Vector3;
  rect: DOMRect;
  camera: THREE.Camera;
  sticky: PlanSnapResult | null;
  snapPoint2D: (
    hitPoint: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    thresholdPx: number,
    options: { sticky: PlanSnapResult | null }
  ) => PlanSnapResult;
  keepStickyPlanSnap: (
    hitPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx: number
  ) => PlanSnapResult | null;
}): PlanSnapResult | null {
  const snapped = params.snapPoint2D(params.hitPoint, params.rect, params.camera, SNAP_DISTANCE_PX.wallDraw, {
    sticky: params.sticky
  });
  return snapped.kind !== "none"
    ? snapped
    : params.keepStickyPlanSnap(params.hitPoint, params.sticky, params.camera, params.rect, SNAP_DISTANCE_PX.wallDrawSticky);
}

export function updateActiveWallDrawPointerMoveHover(params: {
  pointerPoint: { x: number; y: number };
  hitPoint: THREE.Vector3 | null;
  rect: DOMRect;
  wallDraw: PointerWallDrawHoverState;
  wallDefault: PointerWallDefault;
  currentSnap: PlanSnapResult | null;
  camera: THREE.Camera;
  snapPoint2D: (
    hitPoint: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    thresholdPx: number,
    options: { sticky: PlanSnapResult | null }
  ) => PlanSnapResult;
  keepStickyPlanSnap: (
    hitPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx: number
  ) => PlanSnapResult | null;
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  updateHoverCursor: (point: THREE.Vector2, kind: PlanSnapResult["kind"]) => void;
  hideHoverCursor: () => void;
  allowAxisSnap: boolean;
  precisionMm?: boolean;
  walls?: readonly WallAlignmentGuideWall[];
  hudWallEndAlignmentGuide?: THREE.Line | null;
  updateHudDashedLine?: ((line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => void) | null;
  snapAxisXZ: (a: THREE.Vector3, b: THREE.Vector3, allowDiagonal: boolean) => THREE.Vector3;
  updateWallMeshWithJustification: (
    preview: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) => void;
  updateTypedHud: (typedMm: string, point: { x: number; y: number }) => void;
}): PlanSnapResult | null {
  params.wallDraw.lastPointerPx.x = params.pointerPoint.x;
  params.wallDraw.lastPointerPx.y = params.pointerPoint.y;
  if (!params.hitPoint || !params.wallDraw.a || !params.wallDraw.preview) return params.currentSnap;

  const activeSnap = resolveWallDrawActiveSnap({
    hitPoint: params.hitPoint,
    rect: params.rect,
    camera: params.camera,
    sticky: params.currentSnap,
    snapPoint2D: params.snapPoint2D,
    keepStickyPlanSnap: params.keepStickyPlanSnap
  });
  if (activeSnap) {
    params.updateHoverCursor(params.worldToScreen(activeSnap.point, params.camera, params.rect), activeSnap.kind);
  } else {
    params.hideHoverCursor();
  }

  const closeToleranceM = Math.max(0.03, Math.min(0.15, params.wallDefault.thicknessMm / 1000));
  const alignmentSnapPoint = resolveWallDrawAlignmentSnap({
    enabled: !activeSnap && !!params.walls,
    walls: params.walls ?? [],
    start: params.wallDraw.a,
    cursor: params.hitPoint,
    rect: params.rect,
    camera: params.camera,
    precisionMm: !!params.precisionMm,
    show: true,
    hudWallEndAlignmentGuide: params.hudWallEndAlignmentGuide,
    updateHudDashedLine: params.updateHudDashedLine
  });
  const b = resolveWallDrawHoverPoint({
    a: params.wallDraw.a,
    hitPoint: params.hitPoint,
    snapPoint: activeSnap ? activeSnap.point : null,
    chainStart: params.wallDraw.chainStart,
    segments: params.wallDraw.segments,
    closeToleranceM,
    allowAxisSnap: params.allowAxisSnap,
    alignmentSnapPoint,
    snapAxisXZ: params.snapAxisXZ
  });
  params.wallDraw.hoverB = b.clone();
  params.updateWallMeshWithJustification(
    params.wallDraw.preview,
    params.wallDraw.a,
    b,
    params.wallDefault.thicknessMm,
    params.wallDefault.justification ?? "center",
    params.wallDefault.exteriorSign ?? 1
  );
  params.updateTypedHud(params.wallDraw.typedMm, params.pointerPoint);
  return activeSnap;
}

export function updateWallToolPointerMoveHover(params: {
  pointerPoint: { x: number; y: number };
  hitPoint: THREE.Vector3 | null;
  rect: DOMRect;
  wallDraw: PointerWallDrawHoverState;
  currentSnap: PlanSnapResult | null;
  camera: THREE.Camera;
  snapPoint2D: (
    hitPoint: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    thresholdPx: number,
    options: { sticky: PlanSnapResult | null }
  ) => PlanSnapResult;
  keepStickyPlanSnap: (
    hitPoint: THREE.Vector3,
    sticky: PlanSnapResult | null,
    camera: THREE.Camera,
    rect: DOMRect,
    thresholdPx: number
  ) => PlanSnapResult | null;
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => THREE.Vector2;
  updateHoverCursor: (point: THREE.Vector2, kind: PlanSnapResult["kind"]) => void;
  hideHoverCursor: () => void;
}): PlanSnapResult | null {
  params.wallDraw.lastPointerPx.x = params.pointerPoint.x;
  params.wallDraw.lastPointerPx.y = params.pointerPoint.y;
  if (!params.hitPoint) return params.currentSnap;

  const activeSnap = resolveWallDrawActiveSnap({
    hitPoint: params.hitPoint,
    rect: params.rect,
    camera: params.camera,
    sticky: params.currentSnap,
    snapPoint2D: params.snapPoint2D,
    keepStickyPlanSnap: params.keepStickyPlanSnap
  });
  if (activeSnap) {
    params.updateHoverCursor(params.worldToScreen(activeSnap.point, params.camera, params.rect), activeSnap.kind);
  } else {
    params.hideHoverCursor();
  }
  return activeSnap;
}

export function resolveWallDrawTypedEndPoint(params: {
  a: THREE.Vector3;
  hoverB: THREE.Vector3 | null;
  typedMm: string;
  chainStart: THREE.Vector3 | null;
  segments: number;
  closeToleranceM: number;
}): { a: THREE.Vector3; end: THREE.Vector3; closes: boolean } | null {
  const mm = Math.max(1, Math.round(Number(params.typedMm)));
  if (!Number.isFinite(mm)) return null;

  const a = params.a.clone();
  const hoverB = params.hoverB ? params.hoverB.clone() : a.clone().add(new THREE.Vector3(1, 0, 0));
  const dir = hoverB.clone().sub(a);
  if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
  dir.normalize();
  const end = a.clone().addScaledVector(dir, mm / 1000);

  const bMm = { x: Math.round(end.x * 1000), z: Math.round(end.z * 1000) };
  const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);
  const closes =
    !!params.chainStart &&
    params.segments >= 2 &&
    Math.hypot(bExact.x - params.chainStart.x, bExact.z - params.chainStart.z) <= params.closeToleranceM;
  const finalEnd = closes && params.chainStart ? params.chainStart.clone() : bExact;
  return { a, end: finalEnd, closes };
}

export function handleWallDrawStartClick(params: {
  hitPoint: THREE.Vector3;
  snapped: Pick<PlanSnapResult, "kind" | "point">;
  wallDraw: PointerWallDrawState;
  wallDefault: PointerWallDefault;
  wallTypedHud: { style: { display: string } };
  makeWallPreviewMesh: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => THREE.Mesh;
  addPreviewToLayout: (preview: THREE.Mesh) => void;
  updateWallMeshWithJustification: (
    preview: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) => void;
  setStatus: (message: string) => void;
}): boolean {
  params.wallDraw.active = true;
  params.wallDraw.segments = params.wallDraw.segments || 0;
  params.wallDraw.a = resolveWallDrawStartPoint({ hitPoint: params.hitPoint, snapped: params.snapped });
  if (!params.wallDraw.chainStart) params.wallDraw.chainStart = params.wallDraw.a.clone();
  params.wallDraw.hoverB = params.wallDraw.a.clone();
  params.wallDraw.typedMm = "";
  params.wallTypedHud.style.display = "none";

  if (!params.wallDraw.preview) {
    const nextPreview = params.makeWallPreviewMesh(params.wallDraw.a, params.wallDraw.a, params.wallDefault.thicknessMm);
    nextPreview.name = "wallPreview";
    params.addPreviewToLayout(nextPreview);
    params.wallDraw.preview = nextPreview;
  }

  const preview = params.wallDraw.preview;
  if (!preview) return false;
  params.updateWallMeshWithJustification(
    preview,
    params.wallDraw.a,
    params.wallDraw.a,
    params.wallDefault.thicknessMm,
    params.wallDefault.justification ?? "center",
    params.wallDefault.exteriorSign ?? 1
  );
  params.setStatus("Wall: second point... (type mm + Enter, Shift = no axis snap, N = precision 1 mm, Esc = stop)");
  return true;
}

export function finishWallDrawAfterAddedWall(params: {
  wall: PointerWallDrawWall;
  closes: boolean;
  wallDraw: PointerWallDrawState;
  wallDefault: PointerWallDefault;
  wallTypedHud: { style: { display: string } };
  clearTypedBeforeClose?: boolean;
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  clearWallDrawState: () => void;
  updateWallMeshWithJustification: (
    preview: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) => void;
  setStatus: (message: string) => void;
  selectWall: (id: string) => void;
}): boolean {
  params.autoJoinAtMmPoint(params.wall.params.aMm);
  params.autoJoinAtMmPoint(params.wall.params.bMm);
  params.wallDraw.segments += 1;

  if (params.clearTypedBeforeClose) {
    params.wallDraw.typedMm = "";
    params.wallTypedHud.style.display = "none";
  }

  if (params.closes) {
    params.clearWallDrawState();
    params.setStatus("Wall: chain closed.");
    return true;
  }

  params.wallDraw.active = true;
  params.wallDraw.a = new THREE.Vector3(params.wall.params.bMm.x / 1000, 0, params.wall.params.bMm.z / 1000);
  params.wallDraw.hoverB = params.wallDraw.a.clone();
  params.wallDraw.typedMm = "";
  params.wallTypedHud.style.display = "none";
  params.updateWallMeshWithJustification(
    params.wallDraw.preview!,
    params.wallDraw.a,
    params.wallDraw.a,
    params.wallDefault.thicknessMm,
    params.wallDefault.justification ?? "center",
    params.wallDefault.exteriorSign ?? 1
  );
  params.setStatus("Wall: next point... (type mm + Enter, Shift = no axis snap, N = precision 1 mm, Esc = stop)");
  params.selectWall(params.wall.id);
  return true;
}

export function handleWallDrawEndClick(params: {
  hitPoint: THREE.Vector3;
  snapped: Pick<PlanSnapResult, "kind" | "point">;
  shouldAxisSnap: boolean;
  rect?: DOMRect;
  camera?: THREE.Camera;
  precisionMm?: boolean;
  walls?: readonly WallAlignmentGuideWall[];
  hudWallEndAlignmentGuide?: THREE.Line | null;
  updateHudDashedLine?: ((line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => void) | null;
  wallDraw: PointerWallDrawState;
  wallDefault: PointerWallDefault;
  wallTypedHud: { style: { display: string } };
  snapAxisXZ: (a: THREE.Vector3, b: THREE.Vector3, allowDiagonal: boolean) => THREE.Vector3;
  addWall: (a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) => PointerWallDrawWall | null;
  autoJoinAtMmPoint: (point: { x: number; z: number }) => void;
  clearWallDrawState: () => void;
  updateWallMeshWithJustification: (
    preview: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) => void;
  setStatus: (message: string) => void;
  selectWall: (id: string) => void;
}): boolean {
  const a = params.wallDraw.a;
  if (!a) return false;

  const closeToleranceM = Math.max(0.03, Math.min(0.15, params.wallDefault.thicknessMm / 1000));
  const alignmentSnapPoint =
    params.rect && params.camera
      ? resolveWallDrawAlignmentSnap({
          enabled: params.snapped.kind === "none" && !!params.walls,
          walls: params.walls ?? [],
          start: a,
          cursor: params.hitPoint,
          rect: params.rect,
          camera: params.camera,
          precisionMm: !!params.precisionMm,
          show: false,
          hudWallEndAlignmentGuide: params.hudWallEndAlignmentGuide,
          updateHudDashedLine: params.updateHudDashedLine
        })
      : null;
  const { end, closes } = resolveWallDrawEndPoint({
    a,
    hitPoint: params.hitPoint,
    snapped: params.snapped,
    chainStart: params.wallDraw.chainStart,
    segments: params.wallDraw.segments,
    closeToleranceM,
    shouldAxisSnap: params.shouldAxisSnap,
    alignmentSnapPoint,
    snapAxisXZ: params.snapAxisXZ
  });

  const wall = params.addWall(a, end, params.wallDefault.thicknessMm);
  if (!wall) return false;
  return finishWallDrawAfterAddedWall({
    wall,
    closes,
    wallDraw: params.wallDraw,
    wallDefault: params.wallDefault,
    wallTypedHud: params.wallTypedHud,
    autoJoinAtMmPoint: params.autoJoinAtMmPoint,
    clearWallDrawState: params.clearWallDrawState,
    updateWallMeshWithJustification: params.updateWallMeshWithJustification,
    setStatus: params.setStatus,
    selectWall: params.selectWall
  });
}
