import * as THREE from "three";
import type { FloorBoundaryPoint } from "./localTypes";
import type { PlanSnapResult } from "./planSnap";
import { worldToScreen } from "./sharedUtils";

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

type KitchenWorktopSnapPoint2D = (
  rawPoint: THREE.Vector3,
  rect: DOMRect,
  camera: THREE.Camera,
  maxPx: number,
  options: {
    kindPriority: Array<Exclude<PlanSnapResult["kind"], "none">>;
    sticky: PlanSnapResult | null;
    preferNearest: boolean;
  }
) => PlanSnapResult;

type KeepStickyKitchenWorktopSnap = (
  rawPoint: THREE.Vector3,
  sticky: PlanSnapResult | null,
  camera: THREE.Camera,
  rect: DOMRect,
  thresholdPx: number
) => PlanSnapResult | null;

export function resolveKitchenWorktopStartPointSnap(params: {
  rawPoint: THREE.Vector3;
  points: FloorBoundaryPoint[];
  camera: THREE.Camera;
  rect: DOMRect;
  maxPx?: number;
}): PlanSnapResult | null {
  const firstPoint = params.points.length >= 2 ? params.points[0] : null;
  if (!firstPoint) return null;

  const startWorld = new THREE.Vector3(firstPoint.x / 1000, 0, firstPoint.z / 1000);
  const rawScreen = worldToScreen(params.rawPoint, params.camera, params.rect);
  const startScreen = worldToScreen(startWorld, params.camera, params.rect);
  if (rawScreen.distanceTo(startScreen) > (params.maxPx ?? 32)) return null;

  return {
    point: startWorld,
    kind: "endpoint",
    owner: "worktop",
    binding: {
      type: "free",
      pointMm: { x: firstPoint.x, y: 0, z: firstPoint.z }
    }
  };
}

export function createKitchenWorktopDrawSnapResolver(ctx: {
  getPoints: () => FloorBoundaryPoint[];
  getCamera: () => THREE.Camera;
  getSticky: () => PlanSnapResult | null;
  setSticky: (next: PlanSnapResult | null) => void;
  snapPoint2D: KitchenWorktopSnapPoint2D;
  keepStickyPlanSnap: KeepStickyKitchenWorktopSnap;
  maxPx?: number;
}) {
  return (rawPoint: THREE.Vector3, rect: DOMRect) => {
    const maxPx = ctx.maxPx ?? 32;
    const camera = ctx.getCamera();
    const sticky = ctx.getSticky();
    const startPointSnap = resolveKitchenWorktopStartPointSnap({
      rawPoint,
      points: ctx.getPoints(),
      camera,
      rect,
      maxPx
    });
    const snapped = startPointSnap ?? ctx.snapPoint2D(rawPoint, rect, camera, maxPx, {
      kindPriority: ["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"],
      sticky,
      preferNearest: true
    });
    const activeSnap = snapped.kind !== "none"
      ? snapped
      : ctx.keepStickyPlanSnap(rawPoint, sticky, camera, rect, maxPx);
    ctx.setSticky(activeSnap);
    return activeSnap;
  };
}

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
