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
      args.setStatus("Move: click target point, or move mouse and type distance. Shift = constrain, N = free movement.");
      return true;
    }

    if (transformState.step === "pickTarget" && transformState.base) {
      const rawDelta = args.pickedPoint.clone().sub(transformState.base);
      const constrainedDelta = args.shiftKey ? args.constrainMoveDelta(rawDelta) : rawDelta;
      const delta = args.resolveMoveDelta(constrainedDelta);
      const continueMove = !!transformState.stickyMove;
      args.applyMoveDelta(delta);
      args.commitHistory();
      args.clearMoveHud();
      args.clearTransform({
        continueMove,
        status: continueMove ? "Move: done. Select next element, or click Move again to exit." : "Move: done."
      });
      args.mountProps();
      return true;
    }
  }

  if (transformState.kind === "rotate") {
    if (transformState.step === "pickPivot") {
      transformState.pivot = args.pickedPoint.clone();
      transformState.step = "rotating";
      transformState.typed = "";
      transformState.lastValidAngle = 0;
      transformState.startPointerAngle = Math.atan2(args.hitPoint.z - args.pickedPoint.z, args.hitPoint.x - args.pickedPoint.x);
      args.setStatus("Rotate: move mouse to rotate (type degrees + Enter). Click to finish.");
      return true;
    }

    if (transformState.step === "rotating") {
      args.commitHistory();
      args.clearTransform({ status: "Rotate: done." });
      args.mountProps();
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
