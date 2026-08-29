import type { FloorBoundaryPoint, KitchenWorktopParams } from "./appState";
import { getKitchenWorktopSegmentDepthMm, sanitizeKitchenWorktopPath } from "./worktopGeometry";

export type KitchenWorktopSegmentRef = { worktopId: string; segmentIndex: number };

const cloneParams = (params: KitchenWorktopParams): KitchenWorktopParams => ({
  ...params,
  path: params.path.map((point) => ({ ...point })),
  segmentDepthsMm: params.segmentDepthsMm?.map((value) => value)
});

export function setKitchenWorktopSegmentDepth(
  params: KitchenWorktopParams,
  segmentIndex: number,
  depthMm: number
) {
  const next = cloneParams(params);
  const segmentCount = Math.max(0, sanitizeKitchenWorktopPath(next.path).length - 1);
  if (segmentIndex < 0 || segmentIndex >= segmentCount || !Number.isFinite(depthMm)) return null;
  next.segmentDepthsMm = Array.from(
    { length: segmentCount },
    (_, index) => index === segmentIndex
      ? Math.max(1, Math.round(depthMm))
      : getKitchenWorktopSegmentDepthMm(params, index)
  );
  return next;
}

export function resizeKitchenWorktopSegment(
  params: KitchenWorktopParams,
  segmentIndex: number,
  lengthMm: number
) {
  const next = cloneParams(params);
  next.path = sanitizeKitchenWorktopPath(next.path);
  const start = next.path[segmentIndex];
  const end = next.path[segmentIndex + 1];
  if (!start || !end || !Number.isFinite(lengthMm) || lengthMm < 100) return null;
  const currentLength = Math.hypot(end.x - start.x, end.z - start.z);
  if (currentLength < 1) return null;
  if (segmentIndex === 0) {
    const dx = (start.x - end.x) / currentLength;
    const dz = (start.z - end.z) / currentLength;
    next.path[0] = { x: Math.round(end.x + dx * lengthMm), z: Math.round(end.z + dz * lengthMm) };
  } else {
    const dx = (end.x - start.x) / currentLength;
    const dz = (end.z - start.z) / currentLength;
    next.path[segmentIndex + 1] = { x: Math.round(start.x + dx * lengthMm), z: Math.round(start.z + dz * lengthMm) };
  }
  next.path = sanitizeKitchenWorktopPath(next.path);
  return next.path.length > segmentIndex + 1 ? next : null;
}

export function moveKitchenWorktopSegmentByAdjacentLength(
  params: KitchenWorktopParams,
  selectedSegmentIndex: number,
  adjacentSegmentIndex: number,
  lengthMm: number
) {
  const next = cloneParams(params);
  next.path = sanitizeKitchenWorktopPath(next.path);
  if (
    !Number.isFinite(lengthMm) ||
    lengthMm < 100 ||
    Math.abs(selectedSegmentIndex - adjacentSegmentIndex) !== 1
  ) return null;

  const selectedStart = next.path[selectedSegmentIndex];
  const selectedEnd = next.path[selectedSegmentIndex + 1];
  const adjacentStart = next.path[adjacentSegmentIndex];
  const adjacentEnd = next.path[adjacentSegmentIndex + 1];
  if (!selectedStart || !selectedEnd || !adjacentStart || !adjacentEnd) return null;

  const movableJoint = adjacentSegmentIndex < selectedSegmentIndex ? adjacentEnd : adjacentStart;
  const fixedEnd = adjacentSegmentIndex < selectedSegmentIndex ? adjacentStart : adjacentEnd;
  const dx = movableJoint.x - fixedEnd.x;
  const dz = movableJoint.z - fixedEnd.z;
  const currentLength = Math.hypot(dx, dz);
  if (currentLength < 1) return null;

  const movedJoint = {
    x: Math.round(fixedEnd.x + dx / currentLength * lengthMm),
    z: Math.round(fixedEnd.z + dz / currentLength * lengthMm)
  };
  const delta = { x: movedJoint.x - movableJoint.x, z: movedJoint.z - movableJoint.z };
  next.path[selectedSegmentIndex] = {
    x: selectedStart.x + delta.x,
    z: selectedStart.z + delta.z
  };
  next.path[selectedSegmentIndex + 1] = {
    x: selectedEnd.x + delta.x,
    z: selectedEnd.z + delta.z
  };
  next.path = sanitizeKitchenWorktopPath(next.path);
  return next.path.length > Math.max(selectedSegmentIndex, adjacentSegmentIndex) + 1 ? next : null;
}

function distanceToSegmentMm(point: FloorBoundaryPoint, start: FloorBoundaryPoint, end: FloorBoundaryPoint) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1) return Number.POSITIVE_INFINITY;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq));
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

export function findKitchenWorktopSegmentAtPoint(params: KitchenWorktopParams, pointMm: FloorBoundaryPoint) {
  const path = sanitizeKitchenWorktopPath(params.path);
  let best: { segmentIndex: number; distanceMm: number } | null = null;
  for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
    const distanceMm = distanceToSegmentMm(pointMm, path[segmentIndex]!, path[segmentIndex + 1]!);
    const hitDistanceMm = getKitchenWorktopSegmentDepthMm(params, segmentIndex) + 40;
    if (distanceMm > hitDistanceMm || best && best.distanceMm <= distanceMm) continue;
    best = { segmentIndex, distanceMm };
  }
  return best?.segmentIndex ?? null;
}
