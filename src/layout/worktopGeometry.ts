import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./appState";

type PolygonPoint = [number, number];
type PolygonRing = PolygonPoint[];
type Polygon = PolygonRing[];
type MultiPolygon = Polygon[];
type PolygonClipper = {
  union: (...polygons: MultiPolygon[]) => MultiPolygon;
};

const polygonClipper = polygonClipping as PolygonClipper;

export type KitchenWorktopCoveragePolygon = THREE.Vector3[];

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
    const dot = abx * bcx + abz * bcz;
    if (Math.abs(cross) < 1 && dot >= 0) continue;
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
  // Temporary island workflow: opposite collinear segments share one center seam.
  if (isCollinearReversingPath(path)) return path.map((point) => point.clone());

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

export function offsetClosedKitchenWorktopPolygon(points: THREE.Vector3[], outwardOffsetM: number) {
  if (points.length < 3 || Math.abs(outwardOffsetM) < 1e-8) return points.map((point) => point.clone());

  const signedArea = getSignedPolygonAreaM2(points);
  if (Math.abs(signedArea) < 1e-8) return points.map((point) => point.clone());

  const edges = points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const dir = next.clone().sub(point).setY(0);
    if (dir.lengthSq() < 1e-10) return null;
    dir.normalize();
    const outwardNormal = signedArea >= 0
      ? new THREE.Vector3(dir.z, 0, -dir.x)
      : new THREE.Vector3(-dir.z, 0, dir.x);
    return {
      a: point.clone().addScaledVector(outwardNormal, outwardOffsetM),
      b: next.clone().addScaledVector(outwardNormal, outwardOffsetM)
    };
  });

  const offset: THREE.Vector3[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const prev = edges[(index - 1 + edges.length) % edges.length];
    const current = edges[index];
    if (!prev || !current) {
      offset.push(points[index]!.clone());
      continue;
    }
    offset.push(lineIntersectionXZPoints(prev.a, prev.b, current.a, current.b) ?? current.a.clone());
  }
  if (getSignedPolygonAreaM2(offset) < 0) offset.reverse();
  return offset;
}

function isCollinearReversingPath(path: THREE.Vector3[]) {
  let axis: THREE.Vector3 | null = null;
  let previousDirection: THREE.Vector3 | null = null;
  let reverses = false;

  for (let index = 0; index < path.length - 1; index += 1) {
    const direction = path[index + 1]!.clone().sub(path[index]!).setY(0);
    if (direction.lengthSq() < 1e-10) continue;
    direction.normalize();
    axis ??= direction.clone();
    if (Math.abs(axis.x * direction.z - axis.z * direction.x) > 1e-6) return false;
    if (previousDirection && previousDirection.dot(direction) < -0.999) reverses = true;
    previousDirection = direction;
  }

  return reverses;
}

function getCollinearReversingWorktopPolygon(path: THREE.Vector3[], leftDepthM: number, rightDepthM: number) {
  const segmentPolygons = path
    .slice(0, -1)
    .map((point, index) => {
      const next = path[index + 1]!;
      const direction = next.clone().sub(point).setY(0);
      if (direction.lengthSq() < 1e-10) return null;
      direction.normalize();
      const normal = new THREE.Vector3(-direction.z, 0, direction.x);
      return toClipperPolygon([
        point.clone().addScaledVector(normal, leftDepthM),
        next.clone().addScaledVector(normal, leftDepthM),
        next.clone().addScaledVector(normal, -rightDepthM),
        point.clone().addScaledVector(normal, -rightDepthM)
      ]);
    })
    .filter((polygon): polygon is MultiPolygon => !!polygon);

  if (segmentPolygons.length === 0) return [] as THREE.Vector3[];
  try {
    return getLargestOuterRingPolygon(polygonClipper.union(...segmentPolygons));
  } catch {
    return [] as THREE.Vector3[];
  }
}

function getKitchenWorktopDepthSides(params: KitchenWorktopParams, depthM: number) {
  let leftDepthM = depthM / 2;
  let rightDepthM = depthM / 2;
  if (params.justification === "back") {
    leftDepthM = depthM;
    rightDepthM = 0;
  } else if (params.justification === "front") {
    leftDepthM = 0;
    rightDepthM = depthM;
  }
  if (params.mirrored) [leftDepthM, rightDepthM] = [rightDepthM, leftDepthM];
  return { leftDepthM, rightDepthM };
}

export function getKitchenWorktopSegmentDepthMm(params: KitchenWorktopParams, segmentIndex: number) {
  return Math.max(1, params.segmentDepthsMm?.[segmentIndex] ?? params.depthMm);
}

export function getKitchenWorktopSegmentPolygon(params: KitchenWorktopParams, segmentIndex: number) {
  const path = sanitizeKitchenWorktopPath(params.path).map(kitchenWorktopPointToWorld);
  const start = path[segmentIndex];
  const end = path[segmentIndex + 1];
  if (!start || !end) return [] as THREE.Vector3[];
  const direction = end.clone().sub(start).setY(0);
  if (direction.lengthSq() < 1e-10) return [] as THREE.Vector3[];
  direction.normalize();
  const normal = new THREE.Vector3(-direction.z, 0, direction.x);
  const { leftDepthM, rightDepthM } = getKitchenWorktopDepthSides(
    params,
    getKitchenWorktopSegmentDepthMm(params, segmentIndex) / 1000
  );
  const polygon = [
    start.clone().addScaledVector(normal, leftDepthM),
    end.clone().addScaledVector(normal, leftDepthM),
    end.clone().addScaledVector(normal, -rightDepthM),
    start.clone().addScaledVector(normal, -rightDepthM)
  ];
  if (getSignedPolygonAreaM2(polygon) < 0) polygon.reverse();
  return polygon;
}

export function getKitchenWorktopPolygon(params: KitchenWorktopParams) {
  const path = sanitizeKitchenWorktopPath(params.path);
  if (path.length < 2) return [] as THREE.Vector3[];

  const depthM = Math.max(1, params.depthMm) / 1000;
  const pathWorld = path.map(kitchenWorktopPointToWorld);
  if (pathWorld.length < 2) return [] as THREE.Vector3[];

  if (params.segmentDepthsMm?.length) {
    const segmentPolygons = pathWorld
      .slice(0, -1)
      .map((_, segmentIndex) => toClipperPolygon(getKitchenWorktopSegmentPolygon(params, segmentIndex)))
      .filter((polygon): polygon is MultiPolygon => !!polygon);
    if (segmentPolygons.length > 0) {
      try {
        const union = getLargestOuterRingPolygon(polygonClipper.union(...segmentPolygons));
        if (union.length >= 3) return union;
      } catch {
        // Fall through to the uniform-depth geometry.
      }
    }
  }
  const { leftDepthM, rightDepthM } = getKitchenWorktopDepthSides(params, depthM);

  if (isCollinearReversingPath(pathWorld)) {
    const islandPolygon = getCollinearReversingWorktopPolygon(pathWorld, leftDepthM, rightDepthM);
    if (islandPolygon.length >= 3) return islandPolygon;
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

function getSignedRingAreaM2(ring: PolygonRing) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function toClipperPolygon(points: THREE.Vector3[]): MultiPolygon | null {
  const clean: PolygonRing = [];
  for (const point of points) {
    const next: PolygonPoint = [point.x, point.z];
    const prev = clean[clean.length - 1];
    if (prev && Math.hypot(prev[0] - next[0], prev[1] - next[1]) < 1e-7) continue;
    clean.push(next);
  }
  if (clean.length < 3) return null;
  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) >= 1e-7) {
    clean.push([first[0], first[1]]);
  }
  if (Math.abs(getSignedRingAreaM2(clean)) < 1e-8) return null;
  return [[clean]];
}

function getLargestOuterRingPolygon(result: MultiPolygon) {
  let best: PolygonRing | null = null;
  let bestArea = 0;
  for (const polygon of result) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const area = Math.abs(getSignedRingAreaM2(outer));
    if (area > bestArea) {
      bestArea = area;
      best = outer;
    }
  }
  if (!best) return [] as THREE.Vector3[];
  const points = best.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (points.length > 1 && first.distanceToSquared(last) < 1e-12) points.pop();
  if (getSignedPolygonAreaM2(points) < 0) points.reverse();
  return points;
}

export function getKitchenWorktopCoveredPolygon(
  params: KitchenWorktopParams,
  coveragePolygons: KitchenWorktopCoveragePolygon[] = []
) {
  const basePolygon = getKitchenWorktopPolygon(params);
  if (basePolygon.length < 3 || coveragePolygons.length === 0) return basePolygon;

  const clippingInputs = [
    toClipperPolygon(basePolygon),
    ...coveragePolygons.map((polygon) => toClipperPolygon(polygon))
  ].filter((polygon): polygon is MultiPolygon => !!polygon);
  if (clippingInputs.length <= 1) return basePolygon;

  try {
    const union = polygonClipper.union(...clippingInputs);
    const covered = getLargestOuterRingPolygon(union);
    return covered.length >= 3 ? covered : basePolygon;
  } catch {
    return basePolygon;
  }
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
