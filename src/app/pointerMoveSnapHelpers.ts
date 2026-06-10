import * as THREE from "three";
import type { PlanSnapBinding, PlanSnapResult } from "./planSnap";

export function snapBindingWallId(binding: PlanSnapBinding | null | undefined): string | null {
  if (!binding) return null;
  if (binding.type === "wallEndpoint" || binding.type === "wallCenterline") return binding.wallId;
  return null;
}

export function openingSmartSnapRevealMm(params: { widthMm: number; frameWidthMm?: number }): number {
  const frameMm = Number(params.frameWidthMm);
  if (Number.isFinite(frameMm) && frameMm > 0) return Math.max(50, Math.min(140, Math.round(frameMm)));
  return Math.max(50, Math.min(140, Math.round(params.widthMm * 0.06)));
}

export function moveObjectSnapKey(snap: PlanSnapResult): string {
  return [
    snap.kind,
    Math.round(snap.point.x * 1000),
    Math.round(snap.point.z * 1000),
    snap.owner ?? "",
    JSON.stringify(snap.binding ?? null)
  ].join("|");
}

export function collectMoveObjectSnapResults(snapAtCycleIndex: (cycleIndex?: number) => PlanSnapResult): PlanSnapResult[] {
  const first = snapAtCycleIndex();
  if (first.kind === "none") return [];

  const results: PlanSnapResult[] = [];
  const seen = new Set<string>();
  const add = (snap: PlanSnapResult) => {
    if (snap.kind === "none") return;
    const key = moveObjectSnapKey(snap);
    if (seen.has(key)) return;
    seen.add(key);
    results.push(snap);
  };

  add(first);
  const cycleCount = Math.min(Math.max(first.cycleCount ?? 1, 1), 16);
  for (let index = 0; index < cycleCount; index += 1) {
    add(snapAtCycleIndex(index));
  }
  return results;
}

export function roundMoveDeltaToMillimeters(delta: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(Math.round(delta.x * 1000) / 1000, delta.y, Math.round(delta.z * 1000) / 1000);
}

export function prepareMoveDeltaForSnapMode(delta: THREE.Vector3, moveSnapDisabled: boolean): THREE.Vector3 {
  return moveSnapDisabled ? roundMoveDeltaToMillimeters(delta) : delta;
}

export type MoveConstrainWall = {
  aMm: { x: number; z: number };
  bMm: { x: number; z: number };
};

export type MoveWallLike = {
  id: string;
  params: MoveConstrainWall;
};

export type MoveSnapKeyPoint = {
  point: THREE.Vector3;
  label: string;
  axis?: THREE.Vector3 | null;
  hostWallId?: string | null;
};

export function worldPointFromMm(point: { x: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
}

export function moveWallAxisInfo(wall: MoveWallLike): { a: THREE.Vector3; b: THREE.Vector3; dir: THREE.Vector3; lengthM: number; lengthMm: number } | null {
  const a = worldPointFromMm(wall.params.aMm);
  const b = worldPointFromMm(wall.params.bMm);
  const dir = b.clone().sub(a).setY(0);
  if (dir.lengthSq() < 1e-10) return null;
  const lengthM = dir.length();
  dir.normalize();
  return { a, b, dir, lengthM, lengthMm: lengthM * 1000 };
}

export function pointOnMoveWallCenterline(wall: MoveWallLike, distanceM: number): { point: THREE.Vector3; dir: THREE.Vector3 } | null {
  const axis = moveWallAxisInfo(wall);
  if (!axis) return null;
  return { point: axis.a.clone().addScaledVector(axis.dir, distanceM), dir: axis.dir.clone() };
}

export function openingMoveBoundsForWall(
  params: { wallId?: string | null; centerMm: number; widthMm: number; frameWidthMm?: number },
  delta: THREE.Vector3,
  wall: MoveWallLike | null | undefined
): { centerMm: number; leftMm: number; rightMm: number; lengthMm: number; revealMm: number } | null {
  if (!params.wallId || !wall) return null;
  const axis = moveWallAxisInfo(wall);
  if (!axis) return null;
  const alongMm = Math.round(delta.dot(axis.dir) * 1000);
  const centerMm = params.centerMm + alongMm;
  const halfWidthMm = params.widthMm / 2;
  return {
    centerMm,
    leftMm: centerMm - halfWidthMm,
    rightMm: centerMm + halfWidthMm,
    lengthMm: axis.lengthMm,
    revealMm: openingSmartSnapRevealMm(params)
  };
}

export type OpeningMoveBounds = NonNullable<ReturnType<typeof openingMoveBoundsForWall>>;

export function isOpeningMoveWithinSmartSnapBounds(params: { widthMm: number }, bounds: OpeningMoveBounds): boolean {
  if (params.widthMm >= bounds.lengthMm) return false;
  const availableRevealMm = Math.max(0, (bounds.lengthMm - params.widthMm) / 2);
  const revealMm = Math.min(bounds.revealMm, availableRevealMm);
  return bounds.leftMm >= revealMm - 1 && bounds.rightMm <= bounds.lengthMm - revealMm + 1;
}

export function collectOpeningMoveKeypointsForWall(
  params: { wallId?: string | null; centerMm: number; widthMm: number },
  delta: THREE.Vector3,
  label: string,
  wall: MoveWallLike | null | undefined
): MoveSnapKeyPoint[] {
  if (!params.wallId || !wall) return [];
  const axis = moveWallAxisInfo(wall);
  if (!axis) return [];
  const dir = axis.dir;
  const centerM = params.centerMm / 1000 + delta.dot(dir);
  const halfWidthM = params.widthMm / 2000;
  const left = pointOnMoveWallCenterline(wall, centerM - halfWidthM);
  const center = pointOnMoveWallCenterline(wall, centerM);
  const right = pointOnMoveWallCenterline(wall, centerM + halfWidthM);
  const keypoints: MoveSnapKeyPoint[] = [];
  if (left) keypoints.push({ point: left.point, axis: dir.clone(), hostWallId: params.wallId, label: `${label} left end` });
  if (center) keypoints.push({ point: center.point, axis: dir.clone(), hostWallId: params.wallId, label: `${label} center` });
  if (right) keypoints.push({ point: right.point, axis: dir.clone(), hostWallId: params.wallId, label: `${label} right end` });
  return keypoints;
}

export function collectLineMoveKeypoints(
  line: { aMm: { x: number; z: number }; bMm: { x: number; z: number } },
  delta: THREE.Vector3,
  label: string
): MoveSnapKeyPoint[] {
  const a = worldPointFromMm(line.aMm).add(delta);
  const b = worldPointFromMm(line.bMm).add(delta);
  return [
    { point: a, label: `${label} start` },
    { point: b, label: `${label} end` },
    { point: a.clone().lerp(b, 0.5), label: `${label} middle` }
  ];
}

export function collectModuleMoveKeypoints(
  box: THREE.Box3,
  start: { pos: THREE.Vector3; rotY: number },
  delta: THREE.Vector3,
  label: string
): MoveSnapKeyPoint[] {
  const center = box.getCenter(new THREE.Vector3());
  const localPoints = [
    new THREE.Vector3(box.min.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.max.z),
    new THREE.Vector3(box.min.x, 0, box.max.z),
    new THREE.Vector3(center.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, center.z),
    new THREE.Vector3(center.x, 0, box.max.z),
    new THREE.Vector3(box.min.x, 0, center.z),
    new THREE.Vector3(center.x, 0, center.z)
  ];

  return localPoints.map((localPoint, index) => {
    const point = localPoint.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), start.rotY).add(start.pos).add(delta);
    point.y = 0;
    return { point, label: `${label} point ${index + 1}` };
  });
}

export function constrainMoveDeltaToAxis(delta: THREE.Vector3, firstWall: MoveConstrainWall | null | undefined): THREE.Vector3 {
  if (delta.lengthSq() < 1e-10) return delta.clone();
  if (firstWall) {
    const wallDir = new THREE.Vector3(firstWall.bMm.x - firstWall.aMm.x, 0, firstWall.bMm.z - firstWall.aMm.z);
    if (wallDir.lengthSq() > 1e-10) {
      wallDir.normalize();
      const wallPerp = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
      const along = delta.dot(wallDir);
      const across = delta.dot(wallPerp);
      return Math.abs(along) >= Math.abs(across) ? wallDir.multiplyScalar(along) : wallPerp.multiplyScalar(across);
    }
  }
  return Math.abs(delta.x) >= Math.abs(delta.z) ? new THREE.Vector3(delta.x, 0, 0) : new THREE.Vector3(0, 0, delta.z);
}
