import * as THREE from "three";
import { SNAP_DISTANCE_M } from "./snapToolProfiles";

type BoxLike = { min: { x: number; z: number }; max: { x: number; z: number } };
type FootprintPoint = { x: number; z: number };

export type ModuleAdjacencyLink = {
  axis: "x" | "z";
  otherId: string;
  lineStart: THREE.Vector3;
  lineEnd: THREE.Vector3;
};

export type ModuleAdjacencyInfo = ModuleAdjacencyLink & {
  side: "left" | "right" | "front" | "back";
  seam: number;
  overlapMin: number;
  overlapMax: number;
  gap: number;
};

export type ModuleSnapCandidate = {
  pos: THREE.Vector3;
  score: number;
  link: ModuleAdjacencyLink;
};

const DEFAULT_SNAP_DIST_M = SNAP_DISTANCE_M.moduleAdjacency;
const DEFAULT_MIN_OVERLAP_M = SNAP_DISTANCE_M.moduleAdjacencyMinOverlap;
const DEFAULT_VISUAL_TOL_M = SNAP_DISTANCE_M.moduleAdjacencyVisualTolerance;

function makeLink(axis: "x" | "z", seam: number, overlapMin: number, overlapMax: number, otherId: string) {
  const mid = (overlapMin + overlapMax) * 0.5;
  const halfLen = 0.03;
  if (axis === "x") {
    return {
      axis,
      otherId,
      lineStart: new THREE.Vector3(seam - halfLen, 0.018, mid),
      lineEnd: new THREE.Vector3(seam + halfLen, 0.018, mid)
    } satisfies ModuleAdjacencyLink;
  }
  return {
    axis,
    otherId,
    lineStart: new THREE.Vector3(mid, 0.018, seam - halfLen),
    lineEnd: new THREE.Vector3(mid, 0.018, seam + halfLen)
  } satisfies ModuleAdjacencyLink;
}

function makeInfo(
  axis: "x" | "z",
  side: "left" | "right" | "front" | "back",
  seam: number,
  overlapMin: number,
  overlapMax: number,
  gap: number,
  otherId: string
) {
  return {
    ...makeLink(axis, seam, overlapMin, overlapMax, otherId),
    side,
    seam,
    overlapMin,
    overlapMax,
    gap
  } satisfies ModuleAdjacencyInfo;
}

export function detectModuleAdjacencyInfo(boxA: BoxLike, boxB: BoxLike, otherId: string, toleranceM = DEFAULT_VISUAL_TOL_M) {
  const overlapX = Math.max(0, Math.min(boxA.max.x, boxB.max.x) - Math.max(boxA.min.x, boxB.min.x));
  const overlapZ = Math.max(0, Math.min(boxA.max.z, boxB.max.z) - Math.max(boxA.min.z, boxB.min.z));

  const rightGap = Math.abs(boxB.min.x - boxA.max.x);
  if (overlapZ >= DEFAULT_MIN_OVERLAP_M && rightGap <= toleranceM) {
    return makeInfo(
      "x",
      "right",
      (boxA.max.x + boxB.min.x) * 0.5,
      Math.max(boxA.min.z, boxB.min.z),
      Math.min(boxA.max.z, boxB.max.z),
      boxB.min.x - boxA.max.x,
      otherId
    );
  }
  const leftGap = Math.abs(boxB.max.x - boxA.min.x);
  if (overlapZ >= DEFAULT_MIN_OVERLAP_M && leftGap <= toleranceM) {
    return makeInfo(
      "x",
      "left",
      (boxA.min.x + boxB.max.x) * 0.5,
      Math.max(boxA.min.z, boxB.min.z),
      Math.min(boxA.max.z, boxB.max.z),
      boxA.min.x - boxB.max.x,
      otherId
    );
  }

  const frontGap = Math.abs(boxB.min.z - boxA.max.z);
  if (overlapX >= DEFAULT_MIN_OVERLAP_M && frontGap <= toleranceM) {
    return makeInfo(
      "z",
      "front",
      (boxA.max.z + boxB.min.z) * 0.5,
      Math.max(boxA.min.x, boxB.min.x),
      Math.min(boxA.max.x, boxB.max.x),
      boxB.min.z - boxA.max.z,
      otherId
    );
  }
  const backGap = Math.abs(boxB.max.z - boxA.min.z);
  if (overlapX >= DEFAULT_MIN_OVERLAP_M && backGap <= toleranceM) {
    return makeInfo(
      "z",
      "back",
      (boxA.min.z + boxB.max.z) * 0.5,
      Math.max(boxA.min.x, boxB.min.x),
      Math.min(boxA.max.x, boxB.max.x),
      boxA.min.z - boxB.max.z,
      otherId
    );
  }

  return null;
}

export function detectModuleAdjacency(boxA: BoxLike, boxB: BoxLike, otherId: string, toleranceM = DEFAULT_VISUAL_TOL_M) {
  return detectModuleAdjacencyInfo(boxA, boxB, otherId, toleranceM);
}

export function buildModuleSnapCandidates(args: {
  movingId: string;
  movingBox: BoxLike;
  desired: THREE.Vector3;
  movingPolygon?: readonly FootprintPoint[];
  others: Array<{ id: string; box: BoxLike; polygon?: readonly FootprintPoint[] }>;
  stickyNeighborId?: string | null;
  detachDistanceM?: number;
  snapDistanceM?: number;
}) {
  const stickyNeighborId = args.stickyNeighborId ?? null;
  const detachDistanceM = args.detachDistanceM ?? SNAP_DISTANCE_M.moduleAdjacencyDetach;
  const candidates: ModuleSnapCandidate[] = [];

  for (const other of args.others) {
    if (other.id === args.movingId) continue;
    const b = other.box;
    const a = args.movingBox;
    const overlapX = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
    const overlapZ = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
    const snapDist = other.id === stickyNeighborId ? detachDistanceM : (args.snapDistanceM ?? DEFAULT_SNAP_DIST_M);

    if (args.movingPolygon && other.polygon) {
      candidates.push(...buildFootprintSnapCandidates(args.movingPolygon, other.polygon, args.desired, other.id, snapDist));
      continue;
    }

    if (overlapZ >= DEFAULT_MIN_OVERLAP_M) {
      const d1 = b.min.x - a.max.x;
      const d2 = b.max.x - a.min.x;
      if (Math.abs(d1) <= snapDist) {
        const pos = args.desired.clone().add(new THREE.Vector3(d1, 0, 0));
        candidates.push({
          pos,
          score: Math.abs(d1),
          link: makeLink("x", b.min.x, Math.max(a.min.z, b.min.z), Math.min(a.max.z, b.max.z), other.id)
        });
      }
      if (Math.abs(d2) <= snapDist) {
        const pos = args.desired.clone().add(new THREE.Vector3(d2, 0, 0));
        candidates.push({
          pos,
          score: Math.abs(d2),
          link: makeLink("x", b.max.x, Math.max(a.min.z, b.min.z), Math.min(a.max.z, b.max.z), other.id)
        });
      }
    }

    if (overlapX >= DEFAULT_MIN_OVERLAP_M) {
      const d1 = b.min.z - a.max.z;
      const d2 = b.max.z - a.min.z;
      if (Math.abs(d1) <= snapDist) {
        const pos = args.desired.clone().add(new THREE.Vector3(0, 0, d1));
        candidates.push({
          pos,
          score: Math.abs(d1),
          link: makeLink("z", b.min.z, Math.max(a.min.x, b.min.x), Math.min(a.max.x, b.max.x), other.id)
        });
      }
      if (Math.abs(d2) <= snapDist) {
        const pos = args.desired.clone().add(new THREE.Vector3(0, 0, d2));
        candidates.push({
          pos,
          score: Math.abs(d2),
          link: makeLink("z", b.max.z, Math.max(a.min.x, b.min.x), Math.min(a.max.x, b.max.x), other.id)
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

function footprintEdges(polygon: readonly FootprintPoint[]) {
  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  if (Math.abs(area) < 1e-9) return [];
  return polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const tangent = new THREE.Vector3(next.x - point.x, 0, next.z - point.z);
    const length = tangent.length();
    if (length < 1e-6) return [];
    tangent.divideScalar(length);
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(Math.sign(area));
    return [{ start: new THREE.Vector3(point.x, 0, point.z), tangent, normal, length }];
  });
}

// Match facing edges of the actual footprints. This includes rotated runs and
// the recessed edges of an L-shaped cabinet, which an enclosing box cannot represent.
function buildFootprintSnapCandidates(
  moving: readonly FootprintPoint[],
  other: readonly FootprintPoint[],
  desired: THREE.Vector3,
  otherId: string,
  distance: number,
): ModuleSnapCandidate[] {
  const result: ModuleSnapCandidate[] = [];
  const targetEdges = footprintEdges(other);
  for (const edge of footprintEdges(moving)) {
    for (const target of targetEdges) {
      if (edge.normal.dot(target.normal) > -0.99999) continue;
      const separation = target.start.clone().sub(edge.start).dot(edge.normal);
      if (Math.abs(separation) > distance) continue;
      const targetStart = target.start.clone().sub(edge.start).dot(edge.tangent);
      const targetEnd = target.start.clone().addScaledVector(target.tangent, target.length).sub(edge.start).dot(edge.tangent);
      const overlapMin = Math.max(0, Math.min(targetStart, targetEnd));
      const overlapMax = Math.min(edge.length, Math.max(targetStart, targetEnd));
      if (overlapMax - overlapMin < DEFAULT_MIN_OVERLAP_M) continue;
      const seamStart = edge.start.clone().addScaledVector(edge.normal, separation);
      const lineStart = seamStart.clone().addScaledVector(edge.tangent, overlapMin);
      const lineEnd = seamStart.clone().addScaledVector(edge.tangent, overlapMax);
      lineStart.y = lineEnd.y = desired.y + 0.018;
      result.push({
        pos: desired.clone().addScaledVector(edge.normal, separation),
        score: Math.abs(separation),
        link: { axis: Math.abs(edge.normal.x) >= Math.abs(edge.normal.z) ? "x" : "z", otherId, lineStart, lineEnd },
      });
    }
  }
  return result;
}
