import * as THREE from "three";
import type { AlignPickedLine, FloorBoundaryPoint } from "./localTypes";

export type TrimWallLike = {
  id: string;
  params: {
    aMm: FloorBoundaryPoint;
    bMm: FloorBoundaryPoint;
  };
};

export type TrimEndpoint = "a" | "b";
export type TrimEndpointEdit<TWall extends TrimWallLike> = { wall: TWall; which: TrimEndpoint; next: FloorBoundaryPoint };

export type TrimCornerResolution<TWall extends TrimWallLike> =
  | { kind: "parallel" }
  | { kind: "noChange" }
  | { kind: "edit"; edits: [TrimEndpointEdit<TWall>, TrimEndpointEdit<TWall>] };

export type TrimSingleWallResolution<TWall extends TrimWallLike> =
  | { kind: "tooSmall" }
  | { kind: "parallel" }
  | { kind: "noChange" }
  | { kind: "edit"; edit: TrimEndpointEdit<TWall> };

type TrimGeometryContext = {
  lineLineIntersectionXZ: (p1: THREE.Vector3, d1: THREE.Vector3, p2: THREE.Vector3, d2: THREE.Vector3) => THREE.Vector3 | null;
  toMmPoint: (point: THREE.Vector3) => FloorBoundaryPoint;
};

export function trimWallEndpointWorldPoint(wall: TrimWallLike, which: TrimEndpoint): THREE.Vector3 {
  const point = which === "a" ? wall.params.aMm : wall.params.bMm;
  return new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
}

export function chooseTrimWallEndpoint(wall: TrimWallLike, click: THREE.Vector3): TrimEndpoint {
  const a = trimWallEndpointWorldPoint(wall, "a");
  const b = trimWallEndpointWorldPoint(wall, "b");
  return click.distanceTo(a) <= click.distanceTo(b) ? "a" : "b";
}

export function resolveTrimCornerEdit<TWall extends TrimWallLike>(params: {
  targetWall: TWall;
  cutterWall: TWall;
  targetPick: AlignPickedLine;
  cutterPick: AlignPickedLine;
  targetClick: THREE.Vector3;
  cutterClick: THREE.Vector3;
  geometry: TrimGeometryContext;
}): TrimCornerResolution<TWall> {
  const intersection = params.geometry.lineLineIntersectionXZ(params.targetPick.p, params.targetPick.dir, params.cutterPick.p, params.cutterPick.dir);
  if (!intersection) return { kind: "parallel" };

  const next = params.geometry.toMmPoint(intersection);
  const targetEndpoint = chooseTrimWallEndpoint(params.targetWall, params.targetClick);
  const cutterEndpoint = chooseTrimWallEndpoint(params.cutterWall, params.cutterClick);
  const oldTarget = targetEndpoint === "a" ? params.targetWall.params.aMm : params.targetWall.params.bMm;
  const oldCutter = cutterEndpoint === "a" ? params.cutterWall.params.aMm : params.cutterWall.params.bMm;

  if (next.x - oldTarget.x === 0 && next.z - oldTarget.z === 0 && next.x - oldCutter.x === 0 && next.z - oldCutter.z === 0) {
    return { kind: "noChange" };
  }

  return {
    kind: "edit",
    edits: [
      { wall: params.targetWall, which: targetEndpoint, next },
      { wall: params.cutterWall, which: cutterEndpoint, next }
    ]
  };
}

export function resolveTrimSingleWallEdit<TWall extends TrimWallLike>(params: {
  wall: TWall;
  picked: AlignPickedLine;
  hitPoint: THREE.Vector3;
  cutterClick: THREE.Vector3;
  geometry: TrimGeometryContext;
}): TrimSingleWallResolution<TWall> {
  const aW = trimWallEndpointWorldPoint(params.wall, "a");
  const bW = trimWallEndpointWorldPoint(params.wall, "b");
  const ab = bW.clone().sub(aW);
  const len2 = ab.lengthSq();
  if (len2 < 1e-10) return { kind: "tooSmall" };

  const dW = ab.clone().normalize();
  const dC = params.picked.dir.clone().normalize();
  const intersection = params.geometry.lineLineIntersectionXZ(aW, dW, params.picked.p, dC);
  if (!intersection) return { kind: "parallel" };

  const nC = new THREE.Vector3(-dC.z, 0, dC.x);
  const sign = (v: number) => (v > 1e-7 ? 1 : v < -1e-7 ? -1 : 0);
  let sClick = sign(nC.dot(params.hitPoint.clone().sub(params.picked.p)));
  const sA = sign(nC.dot(aW.clone().sub(params.picked.p)));
  const sB = sign(nC.dot(bW.clone().sub(params.picked.p)));
  if (sClick === 0) sClick = sA !== 0 ? sA : sB;

  let moveWhich: TrimEndpoint = "a";
  if (sClick !== 0) {
    if (sA === sClick && sB !== sClick) moveWhich = "a";
    else if (sB === sClick && sA !== sClick) moveWhich = "b";
    else {
      moveWhich = params.cutterClick.distanceTo(aW) <= params.cutterClick.distanceTo(bW) ? "a" : "b";
    }
  } else {
    moveWhich = params.cutterClick.distanceTo(aW) <= params.cutterClick.distanceTo(bW) ? "a" : "b";
  }

  const next = params.geometry.toMmPoint(intersection);
  const old = moveWhich === "a" ? params.wall.params.aMm : params.wall.params.bMm;
  if (next.x - old.x === 0 && next.z - old.z === 0) return { kind: "noChange" };

  return { kind: "edit", edit: { wall: params.wall, which: moveWhich, next } };
}
