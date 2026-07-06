import * as THREE from "three";
import type { TransformClearOptions, TransformState } from "./transformStateTypes";

export type PointerTransformClickState = Pick<
  TransformState,
  | "base"
  | "kind"
  | "lastAngleSign"
  | "lastValidAngle"
  | "lastValidDelta"
  | "moveSnapDisabled"
  | "pivot"
  | "startPointerAngle"
  | "step"
  | "stickyMove"
  | "typed"
>;

export function handleTransformClickPointerDown(args: {
  applyMoveDelta: (delta: THREE.Vector3) => void;
  clearMoveHud: () => void;
  clearTransform: (options?: TransformClearOptions) => void;
  commitHistory: () => void;
  constrainMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  hitPoint: THREE.Vector3;
  mountProps: () => void;
  pickedPoint: THREE.Vector3;
  resolveMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  setStatus: (status: string) => void;
  shiftKey: boolean;
  transformState: PointerTransformClickState;
}) {
  const { transformState } = args;

  if (transformState.kind === "move") {
    if (transformState.step === "pickBase") {
      setMoveTransformBase({
        transformState,
        pickedPoint: args.pickedPoint
      });
      args.setStatus("Move: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm. Shift = os, N = volny pohyb.");
      return true;
    }

    if (transformState.step === "pickTarget" && transformState.base) {
      finishMoveTransformTarget({
        applyMoveDelta: args.applyMoveDelta,
        base: transformState.base,
        clearMoveHud: args.clearMoveHud,
        clearTransform: args.clearTransform,
        commitHistory: args.commitHistory,
        constrainMoveDelta: args.constrainMoveDelta,
        mountProps: args.mountProps,
        pickedPoint: args.pickedPoint,
        resolveMoveDelta: args.resolveMoveDelta,
        shiftKey: args.shiftKey,
        stickyMove: transformState.stickyMove
      });
      return true;
    }
  }

  if (transformState.kind === "rotate") {
    if (transformState.step === "pickPivot") {
      setRotateTransformPivot({
        hitPoint: args.hitPoint,
        pickedPoint: args.pickedPoint,
        transformState
      });
      args.setStatus("Rotate: move mouse to rotate (type degrees + Enter). Click to finish.");
      return true;
    }

    if (transformState.step === "rotating") {
      finishRotateTransform({
        clearTransform: args.clearTransform,
        commitHistory: args.commitHistory,
        mountProps: args.mountProps
      });
      return true;
    }
  }

  return false;
}

export function setMoveTransformBase(args: {
  transformState: Pick<PointerTransformClickState, "base" | "lastValidDelta" | "step" | "typed">;
  pickedPoint: THREE.Vector3;
}): void {
  args.transformState.base = args.pickedPoint.clone();
  args.transformState.step = "pickTarget";
  args.transformState.typed = "";
  args.transformState.lastValidDelta.set(0, 0, 0);
}

export function setRotateTransformPivot(args: {
  hitPoint: THREE.Vector3;
  pickedPoint: THREE.Vector3;
  transformState: Pick<PointerTransformClickState, "lastValidAngle" | "pivot" | "startPointerAngle" | "step" | "typed">;
}): void {
  args.transformState.pivot = args.pickedPoint.clone();
  args.transformState.step = "rotating";
  args.transformState.typed = "";
  args.transformState.lastValidAngle = 0;
  args.transformState.startPointerAngle = Math.atan2(args.hitPoint.z - args.pickedPoint.z, args.hitPoint.x - args.pickedPoint.x);
}

export function finishMoveTransformTarget(args: {
  applyMoveDelta: (delta: THREE.Vector3) => void;
  base: THREE.Vector3;
  clearMoveHud: () => void;
  clearTransform: (options?: TransformClearOptions) => void;
  commitHistory: () => void;
  constrainMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  mountProps: () => void;
  pickedPoint: THREE.Vector3;
  resolveMoveDelta: (delta: THREE.Vector3) => THREE.Vector3;
  shiftKey: boolean;
  stickyMove: boolean;
}): void {
  const rawDelta = args.pickedPoint.clone().sub(args.base);
  const constrainedDelta = args.shiftKey ? args.constrainMoveDelta(rawDelta) : rawDelta;
  const delta = args.resolveMoveDelta(constrainedDelta);
  const continueMove = !!args.stickyMove;
  args.applyMoveDelta(delta);
  args.commitHistory();
  args.clearMoveHud();
  args.clearTransform({
    continueMove,
    status: continueMove ? "Move: done. Select next element, or click Move again to exit." : "Move: done."
  });
  args.mountProps();
}

export function finishRotateTransform(args: {
  clearTransform: (options?: TransformClearOptions) => void;
  commitHistory: () => void;
  mountProps: () => void;
}): void {
  args.commitHistory();
  args.clearTransform({ status: "Rotate: done." });
  args.mountProps();
}
