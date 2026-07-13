import * as THREE from "three";
import type { KitchenPlacementBinding } from "./localTypes";

export type KitchenRunEndClosureState = {
  left: boolean;
  right: boolean;
  backGapMm: number;
};

const noKitchenRunEndClosure = (): KitchenRunEndClosureState => ({
  left: false,
  right: false,
  backGapMm: 0
});

function horizontalDirection(start: THREE.Vector3, end: THREE.Vector3) {
  const direction = end.clone().sub(start).setY(0);
  const length = direction.length();
  return length > 1e-9 ? direction.multiplyScalar(1 / length) : null;
}

function isReversingJoint(guidePath: THREE.Vector3[], pointIndex: number) {
  const previous = guidePath[pointIndex - 1];
  const joint = guidePath[pointIndex];
  const next = guidePath[pointIndex + 1];
  if (!previous || !joint || !next) return false;
  const incoming = horizontalDirection(previous, joint);
  const outgoing = horizontalDirection(joint, next);
  return !!incoming && !!outgoing && incoming.dot(outgoing) <= -0.999;
}

function isTerminalSegmentEndpoint(
  guidePath: THREE.Vector3[],
  segmentIndex: number,
  endpoint: "start" | "end"
) {
  if (endpoint === "start") {
    return segmentIndex === 0 || isReversingJoint(guidePath, segmentIndex);
  }
  return segmentIndex === guidePath.length - 2 || isReversingJoint(guidePath, segmentIndex + 1);
}

export function deriveKitchenRunEndClosure(args: {
  enabled: boolean;
  binding: KitchenPlacementBinding | null | undefined;
  guidePath: THREE.Vector3[];
  moduleWidthM: number;
  moduleRotationY: number;
  backGapMm: number;
  endpointToleranceM?: number;
}): KitchenRunEndClosureState {
  const binding = args.binding;
  if (!args.enabled || !binding || (binding.kind ?? "segment") === "corner") return noKitchenRunEndClosure();
  if (!Number.isInteger(binding.segmentIndex) || binding.segmentIndex < 0 || binding.segmentIndex >= args.guidePath.length - 1) {
    return noKitchenRunEndClosure();
  }

  const start = args.guidePath[binding.segmentIndex];
  const end = args.guidePath[binding.segmentIndex + 1];
  if (!start || !end) return noKitchenRunEndClosure();
  const segmentDirection = horizontalDirection(start, end);
  if (!segmentDirection) return noKitchenRunEndClosure();

  const segmentLength = start.distanceTo(end);
  const halfWidthM = Math.max(0.001, args.moduleWidthM * 0.5);
  const offsetAlongM = binding.offsetAlongM;
  if (!Number.isFinite(offsetAlongM) || segmentLength + 1e-9 < halfWidthM * 2) return noKitchenRunEndClosure();

  const toleranceM = Math.max(1e-6, args.endpointToleranceM ?? 0.002);
  const touchesStart =
    isTerminalSegmentEndpoint(args.guidePath, binding.segmentIndex, "start") &&
    Math.abs(offsetAlongM - halfWidthM) <= toleranceM;
  const touchesEnd =
    isTerminalSegmentEndpoint(args.guidePath, binding.segmentIndex, "end") &&
    Math.abs(offsetAlongM - (segmentLength - halfWidthM)) <= toleranceM;
  if (!touchesStart && !touchesEnd) return noKitchenRunEndClosure();

  const localPositiveX = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, args.moduleRotationY, 0));
  const localPositiveXFollowsSegment = localPositiveX.dot(segmentDirection) >= 0;
  const startIsLeft = localPositiveXFollowsSegment;
  return {
    left: (touchesStart && startIsLeft) || (touchesEnd && !startIsLeft),
    right: (touchesStart && !startIsLeft) || (touchesEnd && startIsLeft),
    backGapMm: Math.max(0, args.backGapMm)
  };
}
