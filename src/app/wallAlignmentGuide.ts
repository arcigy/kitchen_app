import * as THREE from "three";

type WallGuidePoint = { x: number; z: number };

export type WallAlignmentGuideWall = {
  id: string;
  params: {
    aMm: WallGuidePoint;
    bMm: WallGuidePoint;
  };
};

export type WallEndAlignmentGuide = {
  wallId: string;
  endpoint: "a" | "b";
  refPoint: THREE.Vector3;
  snapPoint: THREE.Vector3;
  score: number;
};

const xzDistance = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

const worldFromMm = (point: WallGuidePoint) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000);

const xzDot = (a: THREE.Vector3, b: THREE.Vector3) => a.x * b.x + a.z * b.z;

function normalizedDirection(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = b.clone().sub(a).setY(0);
  const len = Math.hypot(dir.x, dir.z);
  if (len < 1e-6) return null;
  dir.multiplyScalar(1 / len);
  return dir;
}

function projectedPointOnAxis(start: THREE.Vector3, dir: THREE.Vector3, point: THREE.Vector3) {
  const t = xzDot(point.clone().sub(start), dir);
  return { t, point: start.clone().addScaledVector(dir, t) };
}

export function findParallelWallEndAlignmentGuide(args: {
  walls: readonly WallAlignmentGuideWall[];
  start: THREE.Vector3;
  cursor: THREE.Vector3;
  snapDistanceM: number;
  excludeWallIds?: ReadonlySet<string>;
  minDrawLengthM?: number;
  minGuideLengthM?: number;
}): WallEndAlignmentGuide | null {
  const snapDistanceM = Math.max(0.005, args.snapDistanceM);
  const minDrawLengthM = args.minDrawLengthM ?? 0.12;
  const minGuideLengthM = args.minGuideLengthM ?? 0.08;
  let best: WallEndAlignmentGuide | null = null;

  for (const wall of args.walls) {
    if (args.excludeWallIds?.has(wall.id)) continue;
    const wallA = worldFromMm(wall.params.aMm);
    const wallB = worldFromMm(wall.params.bMm);
    const wallDir = normalizedDirection(wallA, wallB);
    if (!wallDir) continue;

    for (const dir of [wallDir, wallDir.clone().multiplyScalar(-1)]) {
      const cursorOnAxis = projectedPointOnAxis(args.start, dir, args.cursor);
      if (cursorOnAxis.t < minDrawLengthM) continue;
      const cursorLineDistance = xzDistance(args.cursor, cursorOnAxis.point);
      if (cursorLineDistance > snapDistanceM * 0.65) continue;

      for (const endpoint of ["a", "b"] as const) {
        const refPoint = endpoint === "a" ? wallA : wallB;
        const projected = projectedPointOnAxis(args.start, dir, refPoint);
        if (projected.t < minDrawLengthM) continue;

        const snapDistance = xzDistance(args.cursor, projected.point);
        if (snapDistance > snapDistanceM) continue;

        const guideLength = xzDistance(refPoint, projected.point);
        if (guideLength < minGuideLengthM) continue;

        const score = snapDistance + cursorLineDistance * 0.35 + guideLength * 0.002;
        if (!best || score < best.score) {
          best = {
            wallId: wall.id,
            endpoint,
            refPoint: refPoint.clone(),
            snapPoint: projected.point,
            score
          };
        }
      }
    }
  }

  return best;
}
