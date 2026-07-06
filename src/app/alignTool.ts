import * as THREE from "three";
import type { AlignPickedLine, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";
import { worldToScreen } from "./sharedUtils";
import { SNAP_DISTANCE_PX } from "./snapToolProfiles";

function distPxPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  if (denom < 1e-9) return Math.hypot(apx, apy);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export function pickBestAlignLine(
  mousePx: { x: number; y: number },
  rect: DOMRect,
  camera: THREE.Camera,
  candidates: AlignPickedLine[],
  maxPx: number = SNAP_DISTANCE_PX.alignPick
) {
  let best: { line: AlignPickedLine; px: number } | null = null;
  for (const candidate of candidates) {
    const sa = worldToScreen(candidate.segA, camera, rect);
    const sb = worldToScreen(candidate.segB, camera, rect);
    const px = distPxPointToSeg(mousePx.x, mousePx.y, sa.x, sa.y, sb.x, sb.y);
    if (!best || px < best.px) best = { line: candidate, px };
  }
  if (!best || best.px > maxPx) return null;
  return best.line;
}

function sameVector3(a: THREE.Vector3, b: THREE.Vector3) {
  return a.distanceToSquared(b) < 1e-10;
}

export function isSameAlignReference(a: AlignPickedLine, b: AlignPickedLine) {
  const sameTarget =
    a.targetKind === b.targetKind &&
    (a.wallId ?? "") === (b.wallId ?? "") &&
    (a.instanceId ?? "") === (b.instanceId ?? "") &&
    (a.worktopId ?? "") === (b.worktopId ?? "") &&
    a.lineRole === b.lineRole &&
    (a.segmentIndex ?? -1) === (b.segmentIndex ?? -1);
  return sameTarget && sameVector3(a.segA, b.segA) && sameVector3(a.segB, b.segB);
}

export function pickBestCompatibleAlignLine(
  mousePx: { x: number; y: number },
  rect: DOMRect,
  camera: THREE.Camera,
  candidates: AlignPickedLine[],
  reference: AlignPickedLine,
  maxPx: number = SNAP_DISTANCE_PX.alignPick
) {
  return pickBestAlignLine(
    mousePx,
    rect,
    camera,
    candidates.filter((candidate) => areAlignLinesParallel(reference, candidate) && !isSameAlignReference(reference, candidate)),
    maxPx
  );
}

export function buildWallAlignCandidates(args: {
  wall: WallInstance;
  centerA: THREE.Vector3;
  centerB: THREE.Vector3;
  exteriorA: THREE.Vector3;
  exteriorB: THREE.Vector3;
  interiorA: THREE.Vector3;
  interiorB: THREE.Vector3;
}): AlignPickedLine[] {
  const d = args.centerB.clone().sub(args.centerA);
  if (d.lengthSq() < 1e-10) return [] as AlignPickedLine[];
  d.normalize();
  const n = new THREE.Vector3(-d.z, 0, d.x);
  const endLen = Math.max(0.5, args.wall.params.thicknessMm / 1000 + 0.25);
  const endA1 = args.centerA.clone().addScaledVector(n, -endLen / 2);
  const endA2 = args.centerA.clone().addScaledVector(n, endLen / 2);
  const endB1 = args.centerB.clone().addScaledVector(n, -endLen / 2);
  const endB2 = args.centerB.clone().addScaledVector(n, endLen / 2);
  return [
    {
      p: args.centerA.clone(),
      dir: d.clone(),
      segA: args.centerA.clone(),
      segB: args.centerB.clone(),
      label: `Wall ${args.wall.id}: centerline`,
      targetKind: "wall",
      lineRole: "center",
      wallId: args.wall.id
    },
    {
      p: args.exteriorA.clone(),
      dir: d.clone(),
      segA: args.exteriorA.clone(),
      segB: args.exteriorB.clone(),
      label: `Wall ${args.wall.id}: exterior face`,
      targetKind: "wall",
      lineRole: "exterior",
      wallId: args.wall.id
    },
    {
      p: args.interiorA.clone(),
      dir: d.clone(),
      segA: args.interiorA.clone(),
      segB: args.interiorB.clone(),
      label: `Wall ${args.wall.id}: interior face`,
      targetKind: "wall",
      lineRole: "interior",
      wallId: args.wall.id
    },
    {
      p: args.centerA.clone(),
      dir: n.clone().normalize(),
      segA: endA1,
      segB: endA2,
      label: `Wall ${args.wall.id}: end A`,
      targetKind: "wall",
      lineRole: "endA",
      wallId: args.wall.id
    },
    {
      p: args.centerB.clone(),
      dir: n.clone().normalize(),
      segA: endB1,
      segB: endB2,
      label: `Wall ${args.wall.id}: end B`,
      targetKind: "wall",
      lineRole: "endB",
      wallId: args.wall.id
    }
  ];
}

export function buildModuleAlignCandidates(inst: LayoutInstance, polygon: THREE.Vector3[]) {
  if (polygon.length < 2) return [] as AlignPickedLine[];
  const candidates: AlignPickedLine[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const dir = b.clone().sub(a).setY(0);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    candidates.push({
      p: a.clone(),
      dir,
      segA: a.clone(),
      segB: b.clone(),
      label: `Module ${inst.id}: edge ${index + 1}`,
      targetKind: "module",
      lineRole: "edge",
      instanceId: inst.id
    });
  }
  return candidates;
}

export function buildWorktopAlignCandidates(args: {
  worktop: KitchenWorktopInstance;
  rawPath: THREE.Vector3[];
  centerPath: THREE.Vector3[];
  backPath: THREE.Vector3[];
  frontPath: THREE.Vector3[];
}) {
  const segmentCount = Math.min(args.rawPath.length, args.centerPath.length, args.backPath.length, args.frontPath.length) - 1;
  if (segmentCount <= 0) return [] as AlignPickedLine[];
  const candidates: AlignPickedLine[] = [];
  const endLen = Math.max(0.4, args.worktop.params.depthMm / 1000 + 0.2);
  for (let index = 0; index < segmentCount; index += 1) {
    const centerA = args.centerPath[index]!;
    const centerB = args.centerPath[index + 1]!;
    const dir = centerB.clone().sub(centerA).setY(0);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    const n = new THREE.Vector3(-dir.z, 0, dir.x);
    const backA = args.backPath[index]!;
    const backB = args.backPath[index + 1]!;
    const frontA = args.frontPath[index]!;
    const frontB = args.frontPath[index + 1]!;
    const rawA = args.rawPath[index]!;
    const rawB = args.rawPath[index + 1]!;
    candidates.push(
      {
        p: centerA.clone(),
        dir: dir.clone(),
        segA: centerA.clone(),
        segB: centerB.clone(),
        label: `Worktop ${args.worktop.id}: center ${index + 1}`,
        targetKind: "worktop",
        lineRole: "center",
        worktopId: args.worktop.id,
        segmentIndex: index
      },
      {
        p: backA.clone(),
        dir: dir.clone(),
        segA: backA.clone(),
        segB: backB.clone(),
        label: `Worktop ${args.worktop.id}: back ${index + 1}`,
        targetKind: "worktop",
        lineRole: "back",
        worktopId: args.worktop.id,
        segmentIndex: index
      },
      {
        p: frontA.clone(),
        dir: dir.clone(),
        segA: frontA.clone(),
        segB: frontB.clone(),
        label: `Worktop ${args.worktop.id}: front ${index + 1}`,
        targetKind: "worktop",
        lineRole: "front",
        worktopId: args.worktop.id,
        segmentIndex: index
      },
      {
        p: rawA.clone(),
        dir: n.clone().normalize(),
        segA: rawA.clone().addScaledVector(n, -endLen / 2),
        segB: rawA.clone().addScaledVector(n, endLen / 2),
        label: `Worktop ${args.worktop.id}: end A ${index + 1}`,
        targetKind: "worktop",
        lineRole: "endA",
        worktopId: args.worktop.id,
        segmentIndex: index
      },
      {
        p: rawB.clone(),
        dir: n.clone().normalize(),
        segA: rawB.clone().addScaledVector(n, -endLen / 2),
        segB: rawB.clone().addScaledVector(n, endLen / 2),
        label: `Worktop ${args.worktop.id}: end B ${index + 1}`,
        targetKind: "worktop",
        lineRole: "endB",
        worktopId: args.worktop.id,
        segmentIndex: index
      }
    );
  }
  return candidates;
}

export function shiftPolylinePoint(path: Array<{ x: number; z: number }>, pointIndex: number, dxMm: number, dzMm: number) {
  return path.map((point, index) =>
    index === pointIndex ? { x: point.x + dxMm, z: point.z + dzMm } : { x: point.x, z: point.z }
  );
}

export function shiftPolylineSegment(path: Array<{ x: number; z: number }>, segmentIndex: number, dxMm: number, dzMm: number) {
  return path.map((point, index) =>
    index === segmentIndex || index === segmentIndex + 1 ? { x: point.x + dxMm, z: point.z + dzMm } : { x: point.x, z: point.z }
  );
}

export function areAlignLinesParallel(a: AlignPickedLine, b: AlignPickedLine) {
  const dot = Math.abs(a.dir.clone().normalize().dot(b.dir.clone().normalize()));
  return dot >= 0.999;
}

export function getAlignShiftVector(ref: AlignPickedLine, moving: AlignPickedLine) {
  const dir = ref.dir.clone().normalize();
  const n = new THREE.Vector3(-dir.z, 0, dir.x);
  const off = n.dot(moving.p.clone().sub(ref.p));
  return n.multiplyScalar(-off);
}
