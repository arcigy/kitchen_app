import * as THREE from "three";
import type { FloorBoundaryPoint } from "./localTypes";
import type { PlanSnapResult } from "./planSnap";

export type PointerSectionDrawPoint = {
  point: THREE.Vector3;
  axisLocked: boolean;
};

export type PointerSectionDrawHoverPoint = PointerSectionDrawPoint & {
  kind: PlanSnapResult["kind"];
};

export type PointerSectionDrawState = {
  a: unknown;
  axisLocked: boolean;
  hoverPoint: unknown;
};

export function sectionDrawPointToMm(point: THREE.Vector3): FloorBoundaryPoint {
  return { x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) };
}

export function handleSectionDrawPointClick(params: {
  resolved: PointerSectionDrawPoint;
  sectionDraw: PointerSectionDrawState;
  updateSectionDrawPreview: () => void;
  setStatus: (message: string) => void;
  mountProps: () => void;
  commitSectionDraw: (point: FloorBoundaryPoint) => boolean;
}): { preventDefault: boolean } {
  params.sectionDraw.axisLocked = params.resolved.axisLocked;
  const point = sectionDrawPointToMm(params.resolved.point);

  if (!params.sectionDraw.a) {
    params.sectionDraw.a = point;
    params.sectionDraw.hoverPoint = point;
    params.updateSectionDrawPreview();
    params.setStatus("Section: click second point. Ortho = straight, Shift = no axis snap, Space = mirror direction.");
    params.mountProps();
    return { preventDefault: false };
  }

  return { preventDefault: params.commitSectionDraw(point) };
}

export function handleSectionDrawHover(params: {
  resolved: PointerSectionDrawHoverPoint;
  sectionDraw: PointerSectionDrawState;
  showSnapHover: (point: THREE.Vector3, kind: Exclude<PlanSnapResult["kind"], "none">) => void;
  hideHoverCursor: () => void;
  updateSectionDrawPreview: () => void;
}): void {
  params.sectionDraw.axisLocked = params.resolved.axisLocked;
  if (params.resolved.kind !== "none") {
    params.showSnapHover(params.resolved.point, params.resolved.kind);
  } else {
    params.hideHoverCursor();
  }
  params.sectionDraw.hoverPoint = sectionDrawPointToMm(params.resolved.point);
  params.updateSectionDrawPreview();
}

export function updateSectionDrawPointerMoveHover(params: {
  hitPoint: THREE.Vector3 | null;
  rect: DOMRect;
  allowAxisSnap: boolean;
  sectionDraw: PointerSectionDrawState;
  resolveSectionDrawPoint: (hitPoint: THREE.Vector3, rect: DOMRect, allowAxisSnap: boolean) => PointerSectionDrawHoverPoint;
  showSnapHover: (point: THREE.Vector3, kind: Exclude<PlanSnapResult["kind"], "none">) => void;
  hideHoverCursor: () => void;
  updateSectionDrawPreview: () => void;
}): void {
  if (!params.hitPoint) {
    params.hideHoverCursor();
    return;
  }

  handleSectionDrawHover({
    resolved: params.resolveSectionDrawPoint(params.hitPoint, params.rect, params.allowAxisSnap),
    sectionDraw: params.sectionDraw,
    showSnapHover: params.showSnapHover,
    hideHoverCursor: params.hideHoverCursor,
    updateSectionDrawPreview: params.updateSectionDrawPreview
  });
}
