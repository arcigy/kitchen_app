import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";

export type Measure3DSnapKind = "free" | "edge" | "corner";

function closestPointOnSegment3D(point: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const denom = ab.lengthSq();
  if (denom < 1e-12) return a.clone();
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / denom));
  return a.clone().addScaledVector(ab, t);
}

export function snapPoint3D(
  point: THREE.Vector3,
  target: THREE.Object3D,
  camera: THREE.Camera,
  rect: DOMRect,
  thresholdPx = 32
): {
  point: THREE.Vector3;
  kind: Measure3DSnapKind;
} {
  const box = new THREE.Box3().setFromObject(target);
  const { min, max } = box;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
  const edgeIndexes: Array<[number, number]> = [
    [0, 1], [0, 2], [0, 4],
    [1, 3], [1, 5],
    [2, 3], [2, 6],
    [3, 7],
    [4, 5], [4, 6],
    [5, 7],
    [6, 7]
  ];

  const rawScreen = worldToScreen(point, camera, rect);

  let bestCorner = corners[0]!.clone();
  let bestCornerD = Infinity;
  for (const corner of corners) {
    const s = worldToScreen(corner, camera, rect);
    const distance = Math.hypot(s.x - rawScreen.x, s.y - rawScreen.y);
    if (distance < bestCornerD) {
      bestCornerD = distance;
      bestCorner = corner.clone();
    }
  }
  if (bestCornerD <= thresholdPx) return { point: bestCorner, kind: "corner" };

  let bestEdge = point.clone();
  let bestEdgeD = Infinity;
  for (const [ia, ib] of edgeIndexes) {
    const candidate = closestPointOnSegment3D(point, corners[ia]!, corners[ib]!);
    const s = worldToScreen(candidate, camera, rect);
    const distance = Math.hypot(s.x - rawScreen.x, s.y - rawScreen.y);
    if (distance < bestEdgeD) {
      bestEdgeD = distance;
      bestEdge = candidate;
    }
  }
  if (bestEdgeD <= thresholdPx) return { point: bestEdge, kind: "edge" };

  return { point: point.clone(), kind: "free" };
}

export function axisLockPoint3D(a: THREE.Vector3, b: THREE.Vector3) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const dz = Math.abs(b.z - a.z);
  if (dx >= dy && dx >= dz) return new THREE.Vector3(b.x, a.y, a.z);
  if (dy >= dx && dy >= dz) return new THREE.Vector3(a.x, b.y, a.z);
  return new THREE.Vector3(a.x, a.y, b.z);
}

export function applyMeasureAxisAssist3D(
  firstPoint: THREE.Vector3 | null,
  point: THREE.Vector3,
  camera: THREE.Camera,
  rect: DOMRect,
  thresholdPx = 12
) {
  if (!firstPoint) return null;
  const candidates = [
    { axis: "x" as const, point: new THREE.Vector3(point.x, firstPoint.y, firstPoint.z) },
    { axis: "y" as const, point: new THREE.Vector3(firstPoint.x, point.y, firstPoint.z) },
    { axis: "z" as const, point: new THREE.Vector3(firstPoint.x, firstPoint.y, point.z) }
  ];

  const rawScreen = worldToScreen(point, camera, rect);
  let best: { axis: "x" | "y" | "z"; point: THREE.Vector3; distancePx: number } | null = null;
  for (const candidate of candidates) {
    const screen = worldToScreen(candidate.point, camera, rect);
    const distancePx = Math.hypot(rawScreen.x - screen.x, rawScreen.y - screen.y);
    if (!best || distancePx < best.distancePx) {
      best = { axis: candidate.axis, point: candidate.point, distancePx };
    }
  }

  if (!best || best.distancePx > thresholdPx) return null;
  return best;
}

export function distance3dMm(a: THREE.Vector3, b: THREE.Vector3) {
  return a.distanceTo(b) * 1000;
}
