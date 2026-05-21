import * as THREE from "three";
import type { WallInstance } from "./localTypes";

export type MmPoint = { x: number; z: number };

export function snapAxisXZ(a: THREE.Vector3, b: THREE.Vector3, enabled: boolean) {
  if (!enabled) return b;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) >= Math.abs(dz)) return new THREE.Vector3(b.x, b.y, a.z);
  return new THREE.Vector3(a.x, b.y, b.z);
}

export function toMmPoint(v: THREE.Vector3): MmPoint {
  return { x: Math.round(v.x * 1000), z: Math.round(v.z * 1000) };
}

export function fromMmPoint(point: MmPoint) {
  return new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
}

export function mmDist(a: MmPoint, b: MmPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function wallEndpointWhich(wall: WallInstance, point: MmPoint, tolMm: number): "a" | "b" | null {
  if (mmDist(wall.params.aMm, point) <= tolMm) return "a";
  if (mmDist(wall.params.bMm, point) <= tolMm) return "b";
  return null;
}

export function pointOnWallAxisMm(wall: WallInstance, point: MmPoint) {
  const ax = wall.params.aMm.x;
  const az = wall.params.aMm.z;
  const bx = wall.params.bMm.x;
  const bz = wall.params.bMm.z;
  const abx = bx - ax;
  const abz = bz - az;
  const apx = point.x - ax;
  const apz = point.z - az;
  const denom = abx * abx + abz * abz;
  if (denom < 1e-6) return { t: 0, closest: { x: ax, z: az }, distMm: Infinity };

  const t = (apx * abx + apz * abz) / denom;
  const tt = Math.max(0, Math.min(1, t));
  const cx = ax + abx * tt;
  const cz = az + abz * tt;
  const distMm = Math.hypot(point.x - cx, point.z - cz);
  return { t: tt, closest: { x: Math.round(cx), z: Math.round(cz) }, distMm };
}

export function wallEndpointToTrimForKeepClick(wall: WallInstance, keepClick: THREE.Vector3, intersection: THREE.Vector3): "a" | "b" {
  const a = fromMmPoint(wall.params.aMm);
  const b = fromMmPoint(wall.params.bMm);
  const axis = b.clone().sub(a).setY(0);
  const lengthM = axis.length();
  if (lengthM < 1e-9) return "a";

  const dir = axis.multiplyScalar(1 / lengthM);
  const tIntersection = intersection.clone().sub(a).setY(0).dot(dir);
  if (tIntersection <= 0) return "a";
  if (tIntersection >= lengthM) return "b";

  const tKeep = keepClick.clone().sub(a).setY(0).dot(dir);
  if (Math.abs(tKeep - tIntersection) < 1e-6) {
    return keepClick.distanceTo(a) <= keepClick.distanceTo(b) ? "b" : "a";
  }

  return tKeep < tIntersection ? "b" : "a";
}

export function wallDirOutFromNode(wall: WallInstance, node: MmPoint, tolMm: number) {
  const a = wall.params.aMm;
  const b = wall.params.bMm;
  const isA = mmDist(a, node) <= tolMm;
  const isB = mmDist(b, node) <= tolMm;
  if (isA && !isB) return new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (isB && !isA) return new THREE.Vector3(a.x - b.x, 0, a.z - b.z);
  return new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
}

export function wallExteriorSign(wall: WallInstance) {
  return (wall.params.exteriorSign ?? 1) as 1 | -1;
}

export function joinExtensionM(wall: WallInstance, node: MmPoint, walls: WallInstance[], tolMm: number) {
  const neighbors = walls.filter(
    (candidate) =>
      candidate.id !== wall.id &&
      (mmDist(candidate.params.aMm, node) <= tolMm || mmDist(candidate.params.bMm, node) <= tolMm)
  );
  if (neighbors.length === 0) return 0;

  const v0 = wallDirOutFromNode(wall, node, tolMm);
  if (v0.lengthSq() < 1e-6) return 0;
  v0.normalize();

  let bestTheta = Infinity;
  for (const neighbor of neighbors) {
    const v1 = wallDirOutFromNode(neighbor, node, tolMm);
    if (v1.lengthSq() < 1e-6) continue;
    v1.normalize();
    const dot = Math.max(-1, Math.min(1, v0.dot(v1)));
    const theta = Math.acos(dot);
    if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
    if (theta < bestTheta) bestTheta = theta;
  }

  if (!isFinite(bestTheta) || bestTheta === Infinity) return 0;

  const thickM = Math.max(0.01, wall.params.thicknessMm / 1000);
  const tanHalf = Math.tan(bestTheta / 2);
  if (tanHalf < 1e-4) return 0;
  const extension = (thickM / 2) / tanHalf;
  return Math.min(1.2, Math.max(0, extension));
}
