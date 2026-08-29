import * as THREE from "three";
import type { FloorBoundaryPoint, WallInstance } from "./localTypes";

type FloorplanWallAxisPoint = {
  closest: FloorBoundaryPoint;
  distMm: number;
};

export type FloorplanWallPickContext = {
  axisSnapPx: number;
  cam: THREE.Camera;
  isWallPickable: (wallId: string) => boolean;
  mouse: { x: number; y: number };
  pMm: FloorBoundaryPoint;
  pointInPolygonXZ: (point: { x: number; z: number }, polygon: Array<{ x: number; z: number }>) => boolean;
  pointOnWallAxisMm: (wall: WallInstance, point: FloorBoundaryPoint) => FloorplanWallAxisPoint;
  rect: DOMRect;
  wallSolvedOutlines: Map<string, Array<{ x: number; z: number }>>;
  walls: WallInstance[];
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => { x: number; y: number };
};

export function resolveFloorplanWallPick(ctx: FloorplanWallPickContext) {
  let bestPoly: { id: string; px: number } | null = null;
  const pW = { x: ctx.pMm.x / 1000, z: ctx.pMm.z / 1000 };

  for (const [id, poly] of ctx.wallSolvedOutlines) {
    if (!ctx.isWallPickable(id)) continue;
    if (poly.length < 3) continue;
    if (!ctx.pointInPolygonXZ(pW, poly)) continue;

    const wall = ctx.walls.find((item) => item.id === id) ?? null;
    const mid = wall
      ? new THREE.Vector3((wall.params.aMm.x + wall.params.bMm.x) / 2000, 0, (wall.params.aMm.z + wall.params.bMm.z) / 2000)
      : new THREE.Vector3(pW.x, 0, pW.z);
    const screen = ctx.worldToScreen(mid, ctx.cam, ctx.rect);
    const px = Math.hypot(screen.x - ctx.mouse.x, screen.y - ctx.mouse.y);
    if (!bestPoly || px < bestPoly.px) bestPoly = { id, px };
  }

  let bestAxis: { id: string; px: number } | null = null;
  for (const wall of ctx.walls) {
    if (!ctx.isWallPickable(wall.id)) continue;

    const closest = ctx.pointOnWallAxisMm(wall, ctx.pMm);
    if (!Number.isFinite(closest.distMm)) continue;

    const closestWorld = new THREE.Vector3(closest.closest.x / 1000, 0, closest.closest.z / 1000);
    const screen = ctx.worldToScreen(closestWorld, ctx.cam, ctx.rect);
    const px = Math.hypot(screen.x - ctx.mouse.x, screen.y - ctx.mouse.y);
    if (!bestAxis || px < bestAxis.px) bestAxis = { id: wall.id, px };
  }

  return {
    axisWallId: bestAxis && bestAxis.px <= ctx.axisSnapPx ? bestAxis.id : null,
    polygonWallId: bestPoly?.id ?? null
  };
}

export function pickFloorplanWallId(ctx: FloorplanWallPickContext) {
  const pick = resolveFloorplanWallPick(ctx);
  return pick.polygonWallId ?? pick.axisWallId;
}
