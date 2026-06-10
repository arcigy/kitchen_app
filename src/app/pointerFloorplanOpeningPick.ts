import * as THREE from "three";
import type { FloorBoundaryPoint, WallInstance } from "./localTypes";

type FloorplanOpeningPickInstance = {
  id: string;
  params: {
    centerMm: number;
    wallId?: string | null;
    widthMm: number;
  };
};

type FloorplanOpeningWallAxisPoint = {
  t: number;
  distMm: number;
};

export type FloorplanOpeningPickContext<T extends FloorplanOpeningPickInstance> = {
  cam: THREE.Camera;
  distPxPointToSeg: (px: number, py: number, ax: number, ay: number, bx: number, by: number) => number;
  instances: T[];
  isPickable: (instanceId: string) => boolean;
  mouse: { x: number; y: number };
  pMm: FloorBoundaryPoint;
  pointOnWallAxisMm: (wall: WallInstance, point: FloorBoundaryPoint) => FloorplanOpeningWallAxisPoint;
  rect: DOMRect;
  selectionSnapPx: number;
  walls: WallInstance[];
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => { x: number; y: number };
};

export function pickFloorplanOpening<T extends FloorplanOpeningPickInstance>(ctx: FloorplanOpeningPickContext<T>) {
  let best: { inst: T; px: number } | null = null;

  for (const inst of ctx.instances) {
    const wallId = inst.params.wallId ?? null;
    if (!wallId || !ctx.isPickable(inst.id)) continue;

    const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
    if (!wall) continue;

    const closest = ctx.pointOnWallAxisMm(wall, ctx.pMm);
    if (!Number.isFinite(closest.distMm)) continue;

    const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
    const alongMm = closest.t * lengthMm;
    const alongPadMm = Math.max(130, inst.params.widthMm * 0.08);
    const lateralPadMm = Math.max(180, wall.params.thicknessMm * 1.4);
    const aMm = Math.max(0, inst.params.centerMm - inst.params.widthMm / 2);
    const bMm = Math.min(lengthMm, inst.params.centerMm + inst.params.widthMm / 2);
    const ax = wall.params.aMm.x;
    const az = wall.params.aMm.z;
    const bx = wall.params.bMm.x;
    const bz = wall.params.bMm.z;
    const dirX = (bx - ax) / Math.max(1, lengthMm);
    const dirZ = (bz - az) / Math.max(1, lengthMm);
    const screenA = ctx.worldToScreen(new THREE.Vector3((ax + dirX * aMm) / 1000, 0, (az + dirZ * aMm) / 1000), ctx.cam, ctx.rect);
    const screenB = ctx.worldToScreen(new THREE.Vector3((ax + dirX * bMm) / 1000, 0, (az + dirZ * bMm) / 1000), ctx.cam, ctx.rect);
    const px = ctx.distPxPointToSeg(ctx.mouse.x, ctx.mouse.y, screenA.x, screenA.y, screenB.x, screenB.y);
    const hit =
      px <= ctx.selectionSnapPx ||
      (alongMm >= inst.params.centerMm - inst.params.widthMm / 2 - alongPadMm &&
        alongMm <= inst.params.centerMm + inst.params.widthMm / 2 + alongPadMm &&
        closest.distMm <= lateralPadMm);

    if (hit && (!best || px < best.px)) best = { inst, px };
  }

  return best?.inst ?? null;
}
