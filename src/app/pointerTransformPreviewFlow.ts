import * as THREE from "three";
import type { PointerTransformClickState } from "./pointerTransformClickFlow";
import type { PointerTransformState } from "./transformStateTypes";

export type PointerTransformPreviewState = PointerTransformClickState & Pick<PointerTransformState, "lastPointerPx">;

export function normalizeAngleRadians(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

export function formatMovePreviewStatus(args: { delta: THREE.Vector3; moveSnapDisabled: boolean; hasObjectSnap: boolean }): string {
  return `Move${args.moveSnapDisabled ? " free 1 mm" : ""}${args.hasObjectSnap ? " smart snap" : ""}: ${Math.round(args.delta.x * 1000)} x ${Math.round(
    args.delta.z * 1000
  )} mm (click or type distance, N = ${args.moveSnapDisabled ? "snapping" : "free movement"})`;
}

export function resolveRotatePreviewAngle(args: { hitPoint: THREE.Vector3; pivot: THREE.Vector3; startPointerAngle: number }): number {
  const pointerAngle = Math.atan2(args.hitPoint.z - args.pivot.z, args.hitPoint.x - args.pivot.x);
  return normalizeAngleRadians(pointerAngle - args.startPointerAngle);
}

export function formatRotatePreviewStatus(angleRad: number): string {
  return `Rotate: ${Math.round((angleRad * 180) / Math.PI)} deg (click to finish)`;
}

export function routeTransformPreviewSnapFeedback<PlanSnap extends { kind: string; point: THREE.Vector3 }>(args: {
  transformKind: PointerTransformClickState["kind"];
  moveSnap: PlanSnap | null;
  snapped: PlanSnap;
  pickedPoint: THREE.Vector3;
  rect: DOMRect;
  updateHoverCursor: (point: THREE.Vector3, kind: PlanSnap["kind"], rect: DOMRect) => void;
  updateMoveSnapFeedback: (snap: PlanSnap | null, point: THREE.Vector3, rect: DOMRect) => void;
  hideHoverCursor: () => void;
}): void {
  if (args.transformKind === "move") {
    args.updateMoveSnapFeedback(args.moveSnap, args.pickedPoint, args.rect);
  } else if (args.snapped.kind !== "none") {
    args.updateHoverCursor(args.pickedPoint, args.snapped.kind, args.rect);
  } else {
    args.hideHoverCursor();
  }
}

export function resolveTransformPreviewSnap<PlanSnap extends { kind: string; point: THREE.Vector3 }>(args: {
  hitPoint: THREE.Vector3;
  makeNoSnapResult: (point: THREE.Vector3) => PlanSnap;
  rect: DOMRect;
  resolveMoveSnap: (hitPoint: THREE.Vector3, rect: DOMRect, perpendicularFrom: THREE.Vector3 | null) => PlanSnap | null;
  resolveRotateSnap: (hitPoint: THREE.Vector3, rect: DOMRect) => PlanSnap;
  transformState: PointerTransformPreviewState;
}): { moveSnap: PlanSnap | null; snapped: PlanSnap } {
  const moveSnap =
    args.transformState.kind === "move"
      ? args.resolveMoveSnap(args.hitPoint, args.rect, args.transformState.step === "pickTarget" ? args.transformState.base : null)
      : null;
  const snapped =
    args.transformState.kind === "move" ? (moveSnap ?? args.makeNoSnapResult(args.hitPoint)) : args.resolveRotateSnap(args.hitPoint, args.rect);
  return { moveSnap, snapped };
}

export function updateMoveTransformPreview<Snap>(args: {
  applyMoveDelta: (delta: THREE.Vector3) => void;
  base: THREE.Vector3;
  constrainMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  moveSnapDisabled: boolean;
  pickedPoint: THREE.Vector3;
  resolveMoveDelta: (delta: THREE.Vector3) => { delta: THREE.Vector3; objectSnap: { snap: Snap; target: THREE.Vector3 } | null };
  setStatus: (status: string) => void;
  shiftKey: boolean;
  updateObjectSnapFeedback: (snap: Snap, target: THREE.Vector3) => void;
}): void {
  const rawDelta = args.pickedPoint.clone().sub(args.base);
  const constrainedDelta = args.shiftKey ? args.constrainMoveDelta(rawDelta) : rawDelta;
  const { delta, objectSnap } = args.resolveMoveDelta(constrainedDelta);
  args.applyMoveDelta(delta);
  if (objectSnap) args.updateObjectSnapFeedback(objectSnap.snap, objectSnap.target);
  args.setStatus(formatMovePreviewStatus({ delta, moveSnapDisabled: args.moveSnapDisabled, hasObjectSnap: Boolean(objectSnap) }));
}

export function handleTransformPreviewPointerMove<Snap>(args: {
  applyMoveDelta: (delta: THREE.Vector3) => void;
  applyRotateAngle: (angleRad: number) => void;
  constrainMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  hitPoint: THREE.Vector3;
  pickedPoint: THREE.Vector3;
  resolveMoveDelta: (delta: THREE.Vector3) => { delta: THREE.Vector3; objectSnap: { snap: Snap; target: THREE.Vector3 } | null };
  setStatus: (status: string) => void;
  shiftKey: boolean;
  transformState: PointerTransformClickState;
  updateObjectSnapFeedback: (snap: Snap, target: THREE.Vector3) => void;
}) {
  const { transformState } = args;

  if (transformState.kind === "move" && transformState.step === "pickTarget" && transformState.base) {
    updateMoveTransformPreview({
      applyMoveDelta: args.applyMoveDelta,
      base: transformState.base,
      constrainMoveDelta: args.constrainMoveDelta,
      moveSnapDisabled: transformState.moveSnapDisabled,
      pickedPoint: args.pickedPoint,
      resolveMoveDelta: args.resolveMoveDelta,
      setStatus: args.setStatus,
      shiftKey: args.shiftKey,
      updateObjectSnapFeedback: args.updateObjectSnapFeedback
    });
    return true;
  }

  if (transformState.kind === "rotate" && transformState.step === "rotating" && transformState.pivot) {
    const deltaAngle = resolveRotatePreviewAngle({
      hitPoint: args.hitPoint,
      pivot: transformState.pivot,
      startPointerAngle: transformState.startPointerAngle
    });
    transformState.lastAngleSign = deltaAngle < 0 ? -1 : 1;
    args.applyRotateAngle(deltaAngle);
    args.setStatus(formatRotatePreviewStatus(deltaAngle));
    return true;
  }

  return false;
}

export function handleTransformPointerMovePreview<PlanSnap extends { kind: string; point: THREE.Vector3 }, ObjectSnap>(args: {
  applyMoveDelta: (delta: THREE.Vector3) => void;
  applyRotateAngle: (angleRad: number) => void;
  constrainMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  hitPoint: THREE.Vector3 | null;
  makeNoSnapResult: (point: THREE.Vector3) => PlanSnap;
  pointerPoint: { x: number; y: number };
  rect: DOMRect;
  resolveMoveDelta: (delta: THREE.Vector3) => { delta: THREE.Vector3; objectSnap: { snap: ObjectSnap; target: THREE.Vector3 } | null };
  resolveMoveSnap: (hitPoint: THREE.Vector3, rect: DOMRect, perpendicularFrom: THREE.Vector3 | null) => PlanSnap | null;
  resolveRotateSnap: (hitPoint: THREE.Vector3, rect: DOMRect) => PlanSnap;
  setSelectPlanSnap: (snap: PlanSnap | null) => void;
  setStatus: (status: string) => void;
  shiftKey: boolean;
  transformState: PointerTransformPreviewState;
  updateHoverCursor: (point: THREE.Vector3, kind: PlanSnap["kind"], rect: DOMRect) => void;
  updateMoveSnapFeedback: (snap: PlanSnap | null, point: THREE.Vector3, rect: DOMRect) => void;
  updateObjectSnapFeedback: (snap: ObjectSnap, target: THREE.Vector3) => void;
  hideHoverCursor: () => void;
}) {
  args.transformState.lastPointerPx.x = args.pointerPoint.x;
  args.transformState.lastPointerPx.y = args.pointerPoint.y;
  if (!args.hitPoint) return true;

  const { moveSnap, snapped } = resolveTransformPreviewSnap({
    hitPoint: args.hitPoint,
    makeNoSnapResult: args.makeNoSnapResult,
    rect: args.rect,
    resolveMoveSnap: args.resolveMoveSnap,
    resolveRotateSnap: args.resolveRotateSnap,
    transformState: args.transformState
  });
  if (args.transformState.kind !== "move") args.setSelectPlanSnap(snapped.kind !== "none" ? snapped : null);

  const pickedPoint = snapped.kind !== "none" ? snapped.point : args.hitPoint;
  routeTransformPreviewSnapFeedback({
    transformKind: args.transformState.kind,
    moveSnap,
    snapped,
    pickedPoint,
    rect: args.rect,
    updateHoverCursor: args.updateHoverCursor,
    updateMoveSnapFeedback: args.updateMoveSnapFeedback,
    hideHoverCursor: args.hideHoverCursor
  });

  return handleTransformPreviewPointerMove({
    applyMoveDelta: args.applyMoveDelta,
    applyRotateAngle: args.applyRotateAngle,
    constrainMoveDelta: args.constrainMoveDelta,
    hitPoint: args.hitPoint,
    pickedPoint,
    resolveMoveDelta: args.resolveMoveDelta,
    setStatus: args.setStatus,
    shiftKey: args.shiftKey,
    transformState: args.transformState,
    updateObjectSnapFeedback: args.updateObjectSnapFeedback
  });
}
