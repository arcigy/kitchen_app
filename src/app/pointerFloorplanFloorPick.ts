import * as THREE from "three";
import type { FloorBoundaryPoint, FloorInstance } from "./localTypes";

export type FloorplanFloorPickContext = {
  cam: THREE.Camera;
  distPxPointToSeg: (px: number, py: number, ax: number, ay: number, bx: number, by: number) => number;
  floors: FloorInstance[];
  floorPointToWorld: (point: FloorBoundaryPoint) => THREE.Vector3;
  isFloorPickable: (floorId: string) => boolean;
  mouse: { x: number; y: number };
  rect: DOMRect;
  snapPx: number;
  worldToScreen: (point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) => { x: number; y: number };
};

export function pickFloorplanFloorBoundary(ctx: FloorplanFloorPickContext) {
  let bestFloor: { id: string; px: number } | null = null;

  for (const floor of ctx.floors) {
    if (!ctx.isFloorPickable(floor.id)) continue;

    const boundary = floor.params.boundary;
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % boundary.length];
      const screenA = ctx.worldToScreen(ctx.floorPointToWorld(a), ctx.cam, ctx.rect);
      const screenB = ctx.worldToScreen(ctx.floorPointToWorld(b), ctx.cam, ctx.rect);
      const edgePx = ctx.distPxPointToSeg(ctx.mouse.x, ctx.mouse.y, screenA.x, screenA.y, screenB.x, screenB.y);
      const cornerPx = Math.min(Math.hypot(ctx.mouse.x - screenA.x, ctx.mouse.y - screenA.y), Math.hypot(ctx.mouse.x - screenB.x, ctx.mouse.y - screenB.y));
      const px = Math.min(edgePx, cornerPx);
      if (px <= ctx.snapPx && (!bestFloor || px < bestFloor.px)) bestFloor = { id: floor.id, px };
    }
  }

  return bestFloor?.id ?? null;
}
