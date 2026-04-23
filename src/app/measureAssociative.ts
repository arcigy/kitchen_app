import * as THREE from "three";
import { getModulePlanPolygon } from "./planSnap";
import type { PlanSnapBinding, PlanSnapGuide } from "./planSnap";
import type { FloorInstance, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";

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
      return fromMmPoint(binding.endpoint === "a" ? wall.params.aMm : wall.params.bMm);
    }
    case "wallCenterline": {
      const wall = ctx.walls.find((item) => item.id === binding.wallId) ?? null;
      if (!wall) return null;
      return lerpSegment(fromMmPoint(wall.params.aMm), fromMmPoint(wall.params.bMm), binding.t);
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
