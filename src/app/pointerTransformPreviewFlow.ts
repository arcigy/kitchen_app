import * as THREE from "three";
import type { PointerTransformClickState } from "./pointerTransformClickFlow";
import type { PointerTransformState } from "./transformStateTypes";

export function normalizeAngleRadians(angle: number) {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
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
    const rawDelta = args.pickedPoint.clone().sub(transformState.base);
    const constrainedDelta = args.shiftKey ? args.constrainMoveDelta(rawDelta) : rawDelta;
    const { delta, objectSnap } = args.resolveMoveDelta(constrainedDelta);
    args.applyMoveDelta(delta);
    if (objectSnap) args.updateObjectSnapFeedback(objectSnap.snap, objectSnap.target);
    args.setStatus(
      `Move${transformState.moveSnapDisabled ? " free 1 mm" : ""}${objectSnap ? " smart snap" : ""}: ${Math.round(delta.x * 1000)} x ${Math.round(delta.z * 1000)} mm (click or type distance, N = ${
        transformState.moveSnapDisabled ? "snapping" : "free movement"
      })`
    );
    return true;
  }

  if (transformState.kind === "rotate" && transformState.step === "rotating" && transformState.pivot) {
    const pivot = transformState.pivot;
    const a1 = Math.atan2(args.hitPoint.z - pivot.z, args.hitPoint.x - pivot.x);
    const deltaAngle = normalizeAngleRadians(a1 - transformState.startPointerAngle);
    transformState.lastAngleSign = deltaAngle < 0 ? -1 : 1;
    args.applyRotateAngle(deltaAngle);
    args.setStatus(`Rotate: ${Math.round((deltaAngle * 180) / Math.PI)} deg (click to finish)`);
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
  transformState: PointerTransformClickState & Pick<PointerTransformState, "lastPointerPx">;
  updateHoverCursor: (point: THREE.Vector3, kind: PlanSnap["kind"], rect: DOMRect) => void;
  updateMoveSnapFeedback: (snap: PlanSnap | null, point: THREE.Vector3, rect: DOMRect) => void;
  updateObjectSnapFeedback: (snap: ObjectSnap, target: THREE.Vector3) => void;
  hideHoverCursor: () => void;
}) {
  args.transformState.lastPointerPx.x = args.pointerPoint.x;
  args.transformState.lastPointerPx.y = args.pointerPoint.y;
  if (!args.hitPoint) return true;

  const moveSnap =
    args.transformState.kind === "move"
      ? args.resolveMoveSnap(args.hitPoint, args.rect, args.transformState.step === "pickTarget" ? args.transformState.base : null)
      : null;
  const snapped =
    args.transformState.kind === "move"
      ? (moveSnap ?? args.makeNoSnapResult(args.hitPoint))
      : args.resolveRotateSnap(args.hitPoint, args.rect);
  if (args.transformState.kind !== "move") args.setSelectPlanSnap(snapped.kind !== "none" ? snapped : null);

  const pickedPoint = snapped.kind !== "none" ? snapped.point : args.hitPoint;
  if (args.transformState.kind === "move") {
    args.updateMoveSnapFeedback(moveSnap, pickedPoint, args.rect);
  } else if (snapped.kind !== "none") {
    args.updateHoverCursor(pickedPoint, snapped.kind, args.rect);
  } else {
    args.hideHoverCursor();
  }

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
