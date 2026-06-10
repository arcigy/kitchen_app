import * as THREE from "three";
import type { ScreenBounds, ScreenPoint, ScreenRect } from "./pointerMarqueeSelection";
import { boundsContainedInRect, boundsFromPoints, boundsOverlapsRect, polygonTouchesRect } from "./pointerMarqueeSelection";

type WallPoint = { x: number; z: number };

type MarqueeWallLike = {
  id: string;
  params: {
    aMm: WallPoint;
    bMm: WallPoint;
    thicknessMm: number;
  };
};

type WallScreenPolygonArgs<Wall extends MarqueeWallLike> = {
  fromMmPoint: (point: WallPoint) => THREE.Vector3;
  solvedOutline: WallPoint[] | null;
  wall: Wall;
  worldToScreen: (point: THREE.Vector3) => ScreenPoint;
};

export function buildWallMarqueeScreenPolygon<Wall extends MarqueeWallLike>(args: WallScreenPolygonArgs<Wall>): ScreenPoint[] {
  if (args.solvedOutline && args.solvedOutline.length >= 3) {
    return args.solvedOutline.map((point) => args.worldToScreen(new THREE.Vector3(point.x, 0, point.z)));
  }

  const a = args.fromMmPoint(args.wall.params.aMm);
  const b = args.fromMmPoint(args.wall.params.bMm);
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-8) return [args.worldToScreen(a)];

  d.multiplyScalar(1 / len);
  const n = new THREE.Vector3(-d.z, 0, d.x);
  const halfThickness = Math.max(1, args.wall.params.thicknessMm / 2) / 1000;
  return [
    a.clone().addScaledVector(n, halfThickness),
    a.clone().addScaledVector(n, -halfThickness),
    b.clone().addScaledVector(n, -halfThickness),
    b.clone().addScaledVector(n, halfThickness)
  ].map((point) => args.worldToScreen(point));
}

export function buildModuleMarqueeScreenBounds(args: {
  meshes: THREE.Object3D[];
  worldToScreen: (point: THREE.Vector3) => ScreenPoint;
}): ScreenBounds | null {
  if (args.meshes.length === 0) return null;

  const box = new THREE.Box3();
  for (const mesh of args.meshes) box.expandByObject(mesh);
  const points = [
    new THREE.Vector3(box.min.x, 0, box.min.z),
    new THREE.Vector3(box.min.x, 0, box.max.z),
    new THREE.Vector3(box.max.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.max.z)
  ];
  return boundsFromPoints(points.map((point) => args.worldToScreen(point)));
}

export function collectMarqueeHitIds<Wall extends { id: string }, Module extends { id: string }>(args: {
  getModuleBounds: (module: Module) => ScreenBounds | null;
  getWallPolygon: (wall: Wall) => ScreenPoint[];
  isModuleSelectable: (module: Module) => boolean;
  isWallPickable: (wall: Wall) => boolean;
  marqueeMode: "contain" | "touch";
  modules: Module[];
  pinnedInstanceIds: Set<string>;
  pinnedWallIds: Set<string>;
  selectionRect: ScreenRect;
  walls: Wall[];
}) {
  const hitWallIds: string[] = [];
  for (const wall of args.walls) {
    if (args.pinnedWallIds.has(wall.id)) continue;
    if (!args.isWallPickable(wall)) continue;
    const polygon = args.getWallPolygon(wall);
    if (polygon.length === 0) continue;
    const bounds = boundsFromPoints(polygon);
    const ok = bounds && boundsOverlapsRect(bounds, args.selectionRect) && polygonTouchesRect(polygon, args.selectionRect);
    if (ok) hitWallIds.push(wall.id);
  }

  const hitInstanceIds: string[] = [];
  for (const module of args.modules) {
    if (args.pinnedInstanceIds.has(module.id)) continue;
    if (!args.isModuleSelectable(module)) continue;
    const bounds = args.getModuleBounds(module);
    if (!bounds) continue;
    const ok = args.marqueeMode === "contain" ? boundsContainedInRect(bounds, args.selectionRect) : boundsOverlapsRect(bounds, args.selectionRect);
    if (ok) hitInstanceIds.push(module.id);
  }

  return { hitInstanceIds, hitWallIds };
}
