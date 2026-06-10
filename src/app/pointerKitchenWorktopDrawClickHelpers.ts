import * as THREE from "three";
import type { FloorBoundaryPoint } from "./localTypes";
import type { PlanSnapResult } from "./planSnap";

export type PointerKitchenWorktopSnap = {
  point: THREE.Vector3;
  kind?: PlanSnapResult["kind"];
} | null;

export type PointerKitchenWorktopDrawState = {
  points: FloorBoundaryPoint[];
};

export type PointerKitchenWorktopDrawHoverState = PointerKitchenWorktopDrawState & {
  hoverPoint: FloorBoundaryPoint | null;
  lastPointerPx: { x: number; y: number };
  typedMm: string;
};

export function resolveKitchenWorktopDrawClickPoint(params: {
  hitPoint: THREE.Vector3;
  activeSnap: PointerKitchenWorktopSnap;
  points: FloorBoundaryPoint[];
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
}): FloorBoundaryPoint {
  const source = params.activeSnap ? params.activeSnap.point : params.hitPoint.clone();
  const rawPoint = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
  const basePoint = params.points[params.points.length - 1] ?? null;
  return basePoint ? params.floorOrthoPoint(basePoint, rawPoint) : rawPoint;
}

export function resolveKitchenWorktopTypedPoint(params: {
  start: FloorBoundaryPoint;
  hoverPoint: FloorBoundaryPoint | null;
  typedMm: string;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
}): FloorBoundaryPoint | null {
  const mm = Math.max(1, Math.round(Number(params.typedMm)));
  if (!Number.isFinite(mm)) return null;

  const hover = params.hoverPoint ?? { x: params.start.x + 1000, z: params.start.z };
  let dx = hover.x - params.start.x;
  let dz = hover.z - params.start.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-8) {
    dx = 1;
    dz = 0;
  } else {
    dx /= length;
    dz /= length;
  }

  const rawPoint = {
    x: Math.round(params.start.x + dx * mm),
    z: Math.round(params.start.z + dz * mm)
  };
  return params.floorOrthoPoint(params.start, rawPoint);
}

export function handleKitchenWorktopDrawPointClick(params: {
  hitPoint: THREE.Vector3;
  activeSnap: PointerKitchenWorktopSnap;
  kitchenWorktopDraw: PointerKitchenWorktopDrawState;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  appendKitchenWorktopPoint: (point: FloorBoundaryPoint) => unknown;
}): void {
  const point = resolveKitchenWorktopDrawClickPoint({
    hitPoint: params.hitPoint,
    activeSnap: params.activeSnap,
    points: params.kitchenWorktopDraw.points,
    floorOrthoPoint: params.floorOrthoPoint
  });
  params.appendKitchenWorktopPoint(point);
}

export function handleKitchenWorktopDrawHover(params: {
  pointerPoint: { x: number; y: number };
  hitPoint: THREE.Vector3;
  activeSnap: PointerKitchenWorktopSnap;
  kitchenWorktopDraw: PointerKitchenWorktopDrawHoverState;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  showSnapHover: (point: THREE.Vector3, kind: PlanSnapResult["kind"]) => void;
  hideHoverCursor: () => void;
  updateTypedHud: (typedMm: string, point: { x: number; y: number }) => void;
  schedulePreviewUpdate: () => void;
}): void {
  params.kitchenWorktopDraw.lastPointerPx.x = params.pointerPoint.x;
  params.kitchenWorktopDraw.lastPointerPx.y = params.pointerPoint.y;

  if (params.activeSnap) {
    params.showSnapHover(params.activeSnap.point, params.activeSnap.kind ?? "none");
  } else {
    params.hideHoverCursor();
  }

  params.kitchenWorktopDraw.hoverPoint = resolveKitchenWorktopDrawClickPoint({
    hitPoint: params.hitPoint,
    activeSnap: params.activeSnap,
    points: params.kitchenWorktopDraw.points,
    floorOrthoPoint: params.floorOrthoPoint
  });
  params.updateTypedHud(params.kitchenWorktopDraw.typedMm, params.pointerPoint);
  if (params.kitchenWorktopDraw.points.length > 0) params.schedulePreviewUpdate();
}

export function updateKitchenWorktopDrawPointerMoveHover(params: {
  pointerPoint: { x: number; y: number };
  hitPoint: THREE.Vector3 | null;
  rect: DOMRect;
  kitchenWorktopDraw: PointerKitchenWorktopDrawHoverState;
  resolveKitchenWorktopDrawSnap: (hitPoint: THREE.Vector3, rect: DOMRect) => PointerKitchenWorktopSnap;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  showSnapHover: (point: THREE.Vector3, kind: PlanSnapResult["kind"]) => void;
  hideHoverCursor: () => void;
  updateTypedHud: (typedMm: string, point: { x: number; y: number }) => void;
  schedulePreviewUpdate: () => void;
}): void {
  params.kitchenWorktopDraw.lastPointerPx.x = params.pointerPoint.x;
  params.kitchenWorktopDraw.lastPointerPx.y = params.pointerPoint.y;
  if (!params.hitPoint) return;

  handleKitchenWorktopDrawHover({
    pointerPoint: params.pointerPoint,
    hitPoint: params.hitPoint,
    activeSnap: params.resolveKitchenWorktopDrawSnap(params.hitPoint, params.rect),
    kitchenWorktopDraw: params.kitchenWorktopDraw,
    floorOrthoPoint: params.floorOrthoPoint,
    showSnapHover: params.showSnapHover,
    hideHoverCursor: params.hideHoverCursor,
    updateTypedHud: params.updateTypedHud,
    schedulePreviewUpdate: params.schedulePreviewUpdate
  });
}
