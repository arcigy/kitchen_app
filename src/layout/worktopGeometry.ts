import * as THREE from "three";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./appState";

function lineIntersectionXZPoints(
  a1: THREE.Vector3,
  a2: THREE.Vector3,
  b1: THREE.Vector3,
  b2: THREE.Vector3
) {
  const x1 = a1.x;
  const z1 = a1.z;
  const x2 = a2.x;
  const z2 = a2.z;
  const x3 = b1.x;
  const z3 = b1.z;
  const x4 = b2.x;
  const z4 = b2.z;
  const det = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(det) < 1e-8) return null;
  const aDet = x1 * z2 - z1 * x2;
  const bDet = x3 * z4 - z3 * x4;
  const x = (aDet * (x3 - x4) - (x1 - x2) * bDet) / det;
  const z = (aDet * (z3 - z4) - (z1 - z2) * bDet) / det;
  return new THREE.Vector3(x, 0, z);
}

export function sanitizeKitchenWorktopPath(points: FloorBoundaryPoint[]) {
  const roundedPoints: FloorBoundaryPoint[] = [];
  for (const point of points) {
    const rounded = { x: Math.round(point.x), z: Math.round(point.z) };
    const prev = roundedPoints[roundedPoints.length - 1];
    if (prev && Math.hypot(rounded.x - prev.x, rounded.z - prev.z) < 1) continue;
    roundedPoints.push(rounded);
  }

  if (roundedPoints.length <= 2) return roundedPoints;

  const simplified: FloorBoundaryPoint[] = [roundedPoints[0]!];
  for (let index = 1; index < roundedPoints.length - 1; index += 1) {
    const a = simplified[simplified.length - 1]!;
    const b = roundedPoints[index]!;
    const c = roundedPoints[index + 1]!;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    const cross = abx * bcz - abz * bcx;
    if (Math.abs(cross) < 1) continue;
    simplified.push(b);
  }
  simplified.push(roundedPoints[roundedPoints.length - 1]!);
  return simplified;
}

export function kitchenWorktopPointToWorld(point: FloorBoundaryPoint) {
  return new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
}

export function offsetKitchenWorktopPath(path: THREE.Vector3[], signedOffsetM: number) {
  if (path.length <= 1 || Math.abs(signedOffsetM) < 1e-8) return path.map((point) => point.clone());

  const segments = path
    .slice(0, -1)
    .map((point, index) => {
      const next = path[index + 1]!;
      const dir = next.clone().sub(point);
      dir.y = 0;
      if (dir.lengthSq() < 1e-10) return null;
      dir.normalize();
      return {
        a: point.clone(),
        b: next.clone(),
        normal: new THREE.Vector3(-dir.z, 0, dir.x)
      };
    })
    .filter((segment): segment is { a: THREE.Vector3; b: THREE.Vector3; normal: THREE.Vector3 } => !!segment);

  if (segments.length === 0) return path.map((point) => point.clone());

  const pts: THREE.Vector3[] = [];
  pts.push(segments[0]!.a.clone().addScaledVector(segments[0]!.normal, signedOffsetM));

  for (let index = 1; index < path.length - 1; index += 1) {
    const prev = segments[index - 1]!;
    const next = segments[index]!;
    const prevA = prev.a.clone().addScaledVector(prev.normal, signedOffsetM);
    const prevB = prev.b.clone().addScaledVector(prev.normal, signedOffsetM);
    const nextA = next.a.clone().addScaledVector(next.normal, signedOffsetM);
    const nextB = next.b.clone().addScaledVector(next.normal, signedOffsetM);
    const intersection = lineIntersectionXZPoints(prevA, prevB, nextA, nextB);
    if (intersection) {
      pts.push(intersection);
      continue;
    }
    const averagedNormal = prev.normal.clone().add(next.normal);
    if (averagedNormal.lengthSq() < 1e-10) averagedNormal.copy(prev.normal);
    else averagedNormal.normalize();
    pts.push(path[index]!.clone().addScaledVector(averagedNormal, signedOffsetM));
  }

  const last = segments[segments.length - 1]!;
  pts.push(last.b.clone().addScaledVector(last.normal, signedOffsetM));
  return pts;
}

export function getKitchenWorktopPolygon(params: KitchenWorktopParams) {
  const path = sanitizeKitchenWorktopPath(params.path);
  if (path.length < 2) return [] as THREE.Vector3[];

  const depthM = Math.max(1, params.depthMm) / 1000;
  const pathWorld = path.map(kitchenWorktopPointToWorld);
  if (pathWorld.length < 2) return [] as THREE.Vector3[];

  let leftDepthM = depthM / 2;
  let rightDepthM = depthM / 2;
  if (params.justification === "back") {
    leftDepthM = depthM;
    rightDepthM = 0;
  } else if (params.justification === "front") {
    leftDepthM = 0;
    rightDepthM = depthM;
  }
  if (params.mirrored) {
    const nextLeftDepthM = rightDepthM;
    rightDepthM = leftDepthM;
    leftDepthM = nextLeftDepthM;
  }

  const left = offsetKitchenWorktopPath(pathWorld, leftDepthM);
  const right = offsetKitchenWorktopPath(pathWorld, -rightDepthM);
  const polygon = [...left, ...right.reverse()];
  if (polygon.length < 4) return [] as THREE.Vector3[];

  if (getSignedPolygonAreaM2(polygon) < 0) polygon.reverse();
  return polygon;
}

export function getSignedPolygonAreaM2(points: THREE.Vector3[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

export function getKitchenWorktopAreaM2(params: KitchenWorktopParams) {
  return Math.abs(getSignedPolygonAreaM2(getKitchenWorktopPolygon(params)));
}

export function getKitchenWorktopBoundsMm(params: KitchenWorktopParams) {
  const polygon = getKitchenWorktopPolygon(params);
  if (polygon.length === 0) {
    return {
      widthMm: 0,
      depthMm: 0
    };
  }

  let minX = polygon[0]!.x;
  let maxX = polygon[0]!.x;
  let minZ = polygon[0]!.z;
  let maxZ = polygon[0]!.z;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    widthMm: Math.round((maxX - minX) * 1000),
    depthMm: Math.round((maxZ - minZ) * 1000)
  };
}
