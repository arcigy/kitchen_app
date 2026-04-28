import * as THREE from "three";
import type { FloorBoundaryPoint, FloorBoundarySegment } from "./localTypes";

export function floorPointDistMm(a: FloorBoundaryPoint, b: FloorBoundaryPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function floorPointEq(a: FloorBoundaryPoint, b: FloorBoundaryPoint, tolMm = 3) {
  return floorPointDistMm(a, b) <= tolMm;
}

export function worldToFloorPoint(point: THREE.Vector3): FloorBoundaryPoint {
  return { x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) };
}

export function floorPointToWorld(point: FloorBoundaryPoint, y = 0.055) {
  return new THREE.Vector3(point.x / 1000, y, point.z / 1000);
}

export function cloneFloorSegments(segments: FloorBoundarySegment[]) {
  return segments.map((segment) => ({ a: { ...segment.a }, b: { ...segment.b } }));
}

export function floorOrthoPoint(start: FloorBoundaryPoint, raw: FloorBoundaryPoint, enabled: boolean) {
  if (!enabled) return raw;
  const dx = raw.x - start.x;
  const dz = raw.z - start.z;
  return Math.abs(dx) >= Math.abs(dz) ? { x: raw.x, z: start.z } : { x: start.x, z: raw.z };
}

export function moveFloorEditVertex(
  startSegments: FloorBoundarySegment[],
  startPoint: FloorBoundaryPoint,
  nextPoint: FloorBoundaryPoint
) {
  return startSegments.map((segment) => ({
    a: floorPointEq(segment.a, startPoint) ? { ...nextPoint } : { ...segment.a },
    b: floorPointEq(segment.b, startPoint) ? { ...nextPoint } : { ...segment.b }
  }));
}

export function moveFloorEditSegment(
  startSegments: FloorBoundarySegment[],
  segmentIndex: number,
  startWorld: FloorBoundaryPoint,
  nextWorld: FloorBoundaryPoint
) {
  const segment = startSegments[segmentIndex];
  if (!segment) return cloneFloorSegments(startSegments);

  const dx = nextWorld.x - startWorld.x;
  const dz = nextWorld.z - startWorld.z;
  const nextA = { x: segment.a.x + dx, z: segment.a.z + dz };
  const nextB = { x: segment.b.x + dx, z: segment.b.z + dz };

  return startSegments.map((item) => ({
    a: floorPointEq(item.a, segment.a) ? { ...nextA } : floorPointEq(item.a, segment.b) ? { ...nextB } : { ...item.a },
    b: floorPointEq(item.b, segment.a) ? { ...nextA } : floorPointEq(item.b, segment.b) ? { ...nextB } : { ...item.b }
  }));
}

export function floorBoundaryToSegments(boundary: FloorBoundaryPoint[]) {
  const segments: FloorBoundarySegment[] = [];
  for (let index = 0; index < boundary.length; index += 1) {
    const a = boundary[index];
    const b = boundary[(index + 1) % boundary.length];
    segments.push({ a: { ...a }, b: { ...b } });
  }
  return segments;
}

export function floorSegmentsToBoundary(segments: FloorBoundarySegment[]) {
  if (segments.length < 3) return null as FloorBoundaryPoint[] | null;

  const remaining = cloneFloorSegments(segments);
  const first = remaining.shift()!;
  const boundary: FloorBoundaryPoint[] = [{ ...first.a }, { ...first.b }];
  let closed = false;

  while (remaining.length > 0) {
    const current = boundary[boundary.length - 1];
    const index = remaining.findIndex((segment) => floorPointEq(segment.a, current) || floorPointEq(segment.b, current));
    if (index < 0) break;

    const [next] = remaining.splice(index, 1);
    boundary.push(floorPointEq(next.a, current) ? { ...next.b } : { ...next.a });
    if (boundary.length >= 4 && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
      boundary.pop();
      closed = true;
      break;
    }
  }

  if (!closed && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
    boundary.pop();
    closed = true;
  }
  if (boundary.length < 3) return null;
  if (!closed) return null;
  if (remaining.length > 0) return null;
  return boundary;
}

export function makeFloorCirclePoints(center: FloorBoundaryPoint, edge: FloorBoundaryPoint, segments = 48) {
  const radius = Math.max(1, floorPointDistMm(center, edge));
  const points: FloorBoundaryPoint[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push({
      x: Math.round(center.x + Math.cos(angle) * radius),
      z: Math.round(center.z + Math.sin(angle) * radius)
    });
  }
  return points;
}
