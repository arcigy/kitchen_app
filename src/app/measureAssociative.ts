import * as THREE from "three";
import { getModulePlanPolygon } from "./planSnap";
import type { PlanSnapBinding, PlanSnapGuide } from "./planSnap";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  KitchenWorktopInstance,
  LayoutInstance,
  SectionInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";

export type AssociativeMeasureKind = "distance" | "normalGuide";

export type AssociativeMeasureRecord = {
  id: string;
  kind: AssociativeMeasureKind;
  aBinding: PlanSnapBinding;
  bBinding: PlanSnapBinding;
};

export type AssociativeMeasureContext = {
  walls: WallInstance[];
  instances: LayoutInstance[];
  floors: FloorInstance[];
  columns?: ColumnInstance[];
  sections?: SectionInstance[];
  windows?: WindowInstance[];
  doors?: DoorInstance[];
  customFurniture?: CustomFurnitureInstance[];
  worktops: KitchenWorktopInstance[];
  measures: AssociativeMeasureRecord[];
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  getKitchenWorktopPolygon: (params: KitchenWorktopInstance["params"]) => THREE.Vector3[];
};

export function toFreePlanBinding(point: THREE.Vector3): PlanSnapBinding {
  return {
    type: "free",
    pointMm: {
      x: Math.round(point.x * 1000),
      y: Math.round(point.y * 1000),
      z: Math.round(point.z * 1000)
    }
  };
}

function fromMmPoint(pointMm: { x: number; y?: number; z: number }) {
  return new THREE.Vector3(pointMm.x / 1000, (pointMm.y ?? 0) / 1000, pointMm.z / 1000);
}

function lerpSegment(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  return a.clone().lerp(b, Math.max(0, Math.min(1, t)));
}

function applyWallNormalOffset(a: THREE.Vector3, b: THREE.Vector3, point: THREE.Vector3, normalOffsetMm?: number) {
  if (!normalOffsetMm) return point;
  const dir = b.clone().sub(a).setY(0);
  if (dir.lengthSq() < 1e-10) return point;
  dir.normalize();
  const normal = new THREE.Vector3(-dir.z, 0, dir.x);
  return point.clone().addScaledVector(normal, normalOffsetMm / 1000);
}

function getModulePolygon(ctx: AssociativeMeasureContext, instanceId: string) {
  const inst = ctx.instances.find((item) => item.id === instanceId) ?? null;
  if (!inst) return null;
  return getModulePlanPolygon(inst, ctx.getModuleLocalBackCenter);
}

function getWorktopPolygon(ctx: AssociativeMeasureContext, worktopId: string) {
  const worktop = ctx.worktops.find((item) => item.id === worktopId) ?? null;
  if (!worktop) return null;
  return ctx.getKitchenWorktopPolygon(worktop.params).map((point) => point.clone().setY(0));
}

function getFloorPolygon(ctx: AssociativeMeasureContext, floorId: string) {
  const floor = ctx.floors.find((item) => item.id === floorId) ?? null;
  if (!floor) return null;
  return floor.params.boundary.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000));
}

function getCustomFurniturePolygon(ctx: AssociativeMeasureContext, furnitureId: string) {
  const furniture = ctx.customFurniture?.find((item) => item.id === furnitureId) ?? null;
  if (!furniture) return null;
  return furniture.params.boundary.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000));
}

function getColumnFootprintMm(column: ColumnInstance) {
  const params = column.params;
  if (params.shape === "round") return { widthMm: params.diameterMm, depthMm: params.diameterMm };
  if (params.shape === "square") return { widthMm: params.widthMm, depthMm: params.widthMm };
  return { widthMm: params.widthMm, depthMm: params.depthMm };
}

function getColumnCenterMm(column: ColumnInstance) {
  const params = column.params;
  const footprint = getColumnFootprintMm(column);
  const offsetX = params.justifyX === "left" ? footprint.widthMm / 2 : params.justifyX === "right" ? -footprint.widthMm / 2 : 0;
  const offsetZ = params.justifyY === "up" ? footprint.depthMm / 2 : params.justifyY === "down" ? -footprint.depthMm / 2 : 0;
  return { x: params.xMm + offsetX, z: params.zMm + offsetZ };
}

function getColumnPolygon(ctx: AssociativeMeasureContext, columnId: string) {
  const column = ctx.columns?.find((item) => item.id === columnId) ?? null;
  if (!column) return null;
  const { widthMm, depthMm } = getColumnFootprintMm(column);
  const center = getColumnCenterMm(column);
  const halfW = widthMm / 2000;
  const halfD = depthMm / 2000;
  const x = center.x / 1000;
  const z = center.z / 1000;
  return [
    new THREE.Vector3(x - halfW, 0, z - halfD),
    new THREE.Vector3(x + halfW, 0, z - halfD),
    new THREE.Vector3(x + halfW, 0, z + halfD),
    new THREE.Vector3(x - halfW, 0, z + halfD)
  ];
}

function getOpeningAxisPoints(ctx: AssociativeMeasureContext, openingKind: "window" | "door", openingId: string) {
  const opening =
    openingKind === "window"
      ? (ctx.windows?.find((item) => item.id === openingId) ?? null)
      : (ctx.doors?.find((item) => item.id === openingId) ?? null);
  if (!opening?.params.wallId) return null;
  const wall = ctx.walls.find((item) => item.id === opening.params.wallId) ?? null;
  if (!wall) return null;
  const a = fromMmPoint(wall.params.aMm);
  const b = fromMmPoint(wall.params.bMm);
  const dir = b.clone().sub(a).setY(0);
  if (dir.lengthSq() < 1e-10) return null;
  dir.normalize();
  const center = a.clone().addScaledVector(dir, opening.params.centerMm / 1000);
  const halfWidthM = opening.params.widthMm / 2000;
  return {
    left: center.clone().addScaledVector(dir, -halfWidthM),
    center,
    right: center.clone().addScaledVector(dir, halfWidthM)
  };
}

function resolveGuideLineCore(
  guide: AssociativeMeasureRecord,
  ctx: AssociativeMeasureContext
): { anchor: THREE.Vector3; direction: THREE.Vector3; spanM: number } | null {
  if (guide.kind !== "normalGuide") return null;
  const anchor = resolvePlanBinding(guide.aBinding, ctx);
  const baseRef = resolvePlanBinding(guide.bBinding, ctx);
  if (!anchor || !baseRef) return null;
  const baseDir = baseRef.clone().sub(anchor).setY(0);
  if (baseDir.lengthSq() < 1e-10) return null;
  baseDir.normalize();
  const direction = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
  const spanM = Math.max(4, Math.min(30, anchor.distanceTo(baseRef) * 6));
  return { anchor, direction, spanM };
}

export function buildMeasureGuides(ctx: AssociativeMeasureContext): PlanSnapGuide[] {
  const guides: PlanSnapGuide[] = [];
  for (const measure of ctx.measures) {
    if (measure.kind !== "normalGuide") continue;
    const line = resolveGuideLineCore(measure, ctx);
    if (!line) continue;
    guides.push({
      id: measure.id,
      anchor: line.anchor,
      direction: line.direction,
      spanM: line.spanM
    });
  }
  return guides;
}

export function resolvePlanBinding(binding: PlanSnapBinding, ctx: AssociativeMeasureContext): THREE.Vector3 | null {
  switch (binding.type) {
    case "free":
      return fromMmPoint(binding.pointMm);
    case "wallEndpoint": {
      const wall = ctx.walls.find((item) => item.id === binding.wallId) ?? null;
      if (!wall) return null;
      const a = fromMmPoint(wall.params.aMm);
      const b = fromMmPoint(wall.params.bMm);
      const endpoint = binding.endpoint === "a" ? a : b;
      return applyWallNormalOffset(a, b, endpoint, binding.normalOffsetMm);
    }
    case "wallCenterline": {
      const wall = ctx.walls.find((item) => item.id === binding.wallId) ?? null;
      if (!wall) return null;
      const a = fromMmPoint(wall.params.aMm);
      const b = fromMmPoint(wall.params.bMm);
      const point = lerpSegment(a, b, binding.t);
      return applyWallNormalOffset(a, b, point, binding.normalOffsetMm);
    }
    case "moduleVertex": {
      const polygon = getModulePolygon(ctx, binding.instanceId);
      if (!polygon || polygon.length === 0) return null;
      return polygon[((binding.vertexIndex % polygon.length) + polygon.length) % polygon.length]!.clone();
    }
    case "moduleEdge": {
      const polygon = getModulePolygon(ctx, binding.instanceId);
      if (!polygon || polygon.length < 2) return null;
      const a = polygon[((binding.segmentIndex % polygon.length) + polygon.length) % polygon.length]!;
      const b = polygon[(binding.segmentIndex + 1 + polygon.length) % polygon.length]!;
      return lerpSegment(a, b, binding.t);
    }
    case "worktopVertex": {
      const polygon = getWorktopPolygon(ctx, binding.worktopId);
      if (!polygon || polygon.length === 0) return null;
      return polygon[((binding.vertexIndex % polygon.length) + polygon.length) % polygon.length]!.clone();
    }
    case "worktopEdge": {
      const polygon = getWorktopPolygon(ctx, binding.worktopId);
      if (!polygon || polygon.length < 2) return null;
      const a = polygon[((binding.segmentIndex % polygon.length) + polygon.length) % polygon.length]!;
      const b = polygon[(binding.segmentIndex + 1 + polygon.length) % polygon.length]!;
      return lerpSegment(a, b, binding.t);
    }
    case "floorVertex": {
      const polygon = getFloorPolygon(ctx, binding.floorId);
      if (!polygon || polygon.length === 0) return null;
      return polygon[((binding.vertexIndex % polygon.length) + polygon.length) % polygon.length]!.clone();
    }
    case "floorEdge": {
      const polygon = getFloorPolygon(ctx, binding.floorId);
      if (!polygon || polygon.length < 2) return null;
      const a = polygon[((binding.segmentIndex % polygon.length) + polygon.length) % polygon.length]!;
      const b = polygon[(binding.segmentIndex + 1 + polygon.length) % polygon.length]!;
      return lerpSegment(a, b, binding.t);
    }
    case "columnCenter": {
      const column = ctx.columns?.find((item) => item.id === binding.columnId) ?? null;
      if (!column) return null;
      const center = getColumnCenterMm(column);
      return new THREE.Vector3(center.x / 1000, 0, center.z / 1000);
    }
    case "columnVertex": {
      const polygon = getColumnPolygon(ctx, binding.columnId);
      if (!polygon || polygon.length === 0) return null;
      return polygon[((binding.vertexIndex % polygon.length) + polygon.length) % polygon.length]!.clone();
    }
    case "columnEdge": {
      const polygon = getColumnPolygon(ctx, binding.columnId);
      if (!polygon || polygon.length < 2) return null;
      const a = polygon[((binding.segmentIndex % polygon.length) + polygon.length) % polygon.length]!;
      const b = polygon[(binding.segmentIndex + 1 + polygon.length) % polygon.length]!;
      return lerpSegment(a, b, binding.t);
    }
    case "sectionEndpoint": {
      const section = ctx.sections?.find((item) => item.id === binding.sectionId) ?? null;
      if (!section) return null;
      return fromMmPoint(binding.endpoint === "a" ? section.params.aMm : section.params.bMm);
    }
    case "sectionLine": {
      const section = ctx.sections?.find((item) => item.id === binding.sectionId) ?? null;
      if (!section) return null;
      return lerpSegment(fromMmPoint(section.params.aMm), fromMmPoint(section.params.bMm), binding.t);
    }
    case "openingCenter": {
      return getOpeningAxisPoints(ctx, binding.openingKind, binding.openingId)?.center ?? null;
    }
    case "openingEndpoint": {
      const points = getOpeningAxisPoints(ctx, binding.openingKind, binding.openingId);
      if (!points) return null;
      return binding.endpoint === "left" ? points.left : points.right;
    }
    case "customFurnitureVertex": {
      const polygon = getCustomFurniturePolygon(ctx, binding.furnitureId);
      if (!polygon || polygon.length === 0) return null;
      return polygon[((binding.vertexIndex % polygon.length) + polygon.length) % polygon.length]!.clone();
    }
    case "customFurnitureEdge": {
      const polygon = getCustomFurniturePolygon(ctx, binding.furnitureId);
      if (!polygon || polygon.length < 2) return null;
      const a = polygon[((binding.segmentIndex % polygon.length) + polygon.length) % polygon.length]!;
      const b = polygon[(binding.segmentIndex + 1 + polygon.length) % polygon.length]!;
      return lerpSegment(a, b, binding.t);
    }
    case "guideAnchor": {
      const guide = ctx.measures.find((item) => item.id === binding.guideId) ?? null;
      if (!guide) return null;
      const line = resolveGuideLineCore(guide, ctx);
      return line?.anchor.clone() ?? null;
    }
    case "guideLine": {
      const guide = ctx.measures.find((item) => item.id === binding.guideId) ?? null;
      if (!guide) return null;
      const line = resolveGuideLineCore(guide, ctx);
      if (!line) return null;
      return line.anchor.clone().addScaledVector(line.direction, binding.offsetM);
    }
    default:
      return null;
  }
}

export function resolveAssociativeMeasureWorld(
  measure: AssociativeMeasureRecord,
  ctx: AssociativeMeasureContext
): { a: THREE.Vector3; b: THREE.Vector3 } | null {
  if (measure.kind === "normalGuide") {
    const line = resolveGuideLineCore(measure, ctx);
    if (!line) return null;
    const half = line.spanM / 2;
    return {
      a: line.anchor.clone().addScaledVector(line.direction, -half),
      b: line.anchor.clone().addScaledVector(line.direction, half)
    };
  }
  const a = resolvePlanBinding(measure.aBinding, ctx);
  const b = resolvePlanBinding(measure.bBinding, ctx);
  if (!a || !b) return null;
  return { a, b };
}

export function isBindingAttachedToWall(binding: PlanSnapBinding, wallId: string) {
  return (
    (binding.type === "wallEndpoint" && binding.wallId === wallId) ||
    (binding.type === "wallCenterline" && binding.wallId === wallId)
  );
}
