import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  KitchenWorktopInstance,
  KitchenWorktopParams,
  LayoutInstance,
  SectionInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import { SNAP_DISTANCE_PX, SNAP_PRIORITY_DEFAULT } from "./snapToolProfiles";

export type PlanSnapKind = "none" | "corner" | "midpoint" | "perpendicular" | "edge" | "endpoint" | "axis";
export type PlanSnapOwner =
  | "wall"
  | "module"
  | "worktop"
  | "floor"
  | "column"
  | "section"
  | "window"
  | "door"
  | "customFurniture"
  | "measureGuide";

export type PlanSnapBinding =
  | { type: "free"; pointMm: { x: number; y: number; z: number } }
  | { type: "wallEndpoint"; wallId: string; endpoint: "a" | "b"; normalOffsetMm?: number }
  | { type: "wallCenterline"; wallId: string; t: number; normalOffsetMm?: number }
  | { type: "moduleVertex"; instanceId: string; vertexIndex: number }
  | { type: "moduleEdge"; instanceId: string; segmentIndex: number; t: number }
  | { type: "worktopVertex"; worktopId: string; vertexIndex: number }
  | { type: "worktopEdge"; worktopId: string; segmentIndex: number; t: number }
  | { type: "floorVertex"; floorId: string; vertexIndex: number }
  | { type: "floorEdge"; floorId: string; segmentIndex: number; t: number }
  | { type: "columnCenter"; columnId: string }
  | { type: "columnVertex"; columnId: string; vertexIndex: number }
  | { type: "columnEdge"; columnId: string; segmentIndex: number; t: number }
  | { type: "sectionEndpoint"; sectionId: string; endpoint: "a" | "b" }
  | { type: "sectionLine"; sectionId: string; t: number }
  | { type: "openingCenter"; openingKind: "window" | "door"; openingId: string }
  | { type: "openingEndpoint"; openingKind: "window" | "door"; openingId: string; endpoint: "left" | "right" }
  | { type: "customFurnitureVertex"; furnitureId: string; vertexIndex: number }
  | { type: "customFurnitureEdge"; furnitureId: string; segmentIndex: number; t: number }
  | { type: "guideAnchor"; guideId: string }
  | { type: "guideLine"; guideId: string; offsetM: number };

export type PlanSnapGuide = {
  id: string;
  anchor: THREE.Vector3;
  direction: THREE.Vector3;
  spanM: number;
};

type PlanSnapCandidate = {
  p: THREE.Vector3;
  kind: Exclude<PlanSnapKind, "none">;
  a?: THREE.Vector3 | null;
  b?: THREE.Vector3 | null;
  owner?: PlanSnapOwner;
  binding?: PlanSnapBinding | null;
  snapRole?: "wallAxisIntersection";
  snapPriority?: number;
};

type PlanSnapSegment = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  owner: PlanSnapOwner;
  source?: "wallAxis" | "outline" | "other";
  wallId?: string;
  bindingAt: (t: number, point: THREE.Vector3) => PlanSnapBinding | null;
};

type WallUnionRing = Array<[number, number]>;
type WallUnionPolygon = WallUnionRing[];
type WallUnionMultiPolygon = WallUnionPolygon[];

export type PlanSnapResult = {
  point: THREE.Vector3;
  kind: PlanSnapKind;
  a?: THREE.Vector3 | null;
  b?: THREE.Vector3 | null;
  owner?: PlanSnapOwner;
  binding?: PlanSnapBinding | null;
  cycleCount?: number;
};

const KITCHEN_CORNER_ANCHOR_NAME = "__kitchen_corner_anchor";
const KITCHEN_CORNER_X_ANCHOR_NAME = "__kitchen_corner_x_anchor";
const KITCHEN_CORNER_Z_ANCHOR_NAME = "__kitchen_corner_z_anchor";
const FWM_CHAMFERED_CORNER_PLAN_BOARDS = ["top_panel", "bottom_panel"] as const;

type CreatePlanSnapperArgs = {
  getWalls: () => WallInstance[];
  getInstances: () => LayoutInstance[];
  getFloors: () => FloorInstance[];
  getColumns?: () => ColumnInstance[];
  getSections?: () => SectionInstance[];
  getWindows?: () => WindowInstance[];
  getDoors?: () => DoorInstance[];
  getCustomFurniture?: () => CustomFurnitureInstance[];
  getKitchenWorktops: () => KitchenWorktopInstance[];
  getMeasureGuides?: () => PlanSnapGuide[];
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
  getWallSolvedJoinPolys: () => Array<Array<{ x: number; z: number }>>;
  getWallUnionPolys: () => WallUnionMultiPolygon | null;
  getLayoutTool: () => string;
  getWallChainStart: () => THREE.Vector3 | null;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  getKitchenWorktopPolygon: (params: KitchenWorktopParams) => THREE.Vector3[];
};

type PlanSnapOptions = {
  perpendicularFrom?: THREE.Vector3 | null;
  kindPriority?: Array<Exclude<PlanSnapKind, "none">>;
  sticky?: PlanSnapResult | null;
  stickyThresholdPx?: number;
  preferNearest?: boolean;
  cycleIndex?: number;
  ignoreBinding?: (binding: PlanSnapBinding | null | undefined, owner?: PlanSnapOwner) => boolean;
};

type LoopBindingFactory = {
  vertexBinding?: (vertexIndex: number, point: THREE.Vector3) => PlanSnapBinding | null;
  edgeBinding?: (segmentIndex: number, t: number, point: THREE.Vector3) => PlanSnapBinding | null;
};

const DEFAULT_KIND_ORDER = SNAP_PRIORITY_DEFAULT;

const KIND_RADIUS_MULTIPLIER: Record<Exclude<PlanSnapKind, "none">, number> = {
  corner: 0.8,
  endpoint: 0.78,
  midpoint: 0.9,
  perpendicular: 0.95,
  edge: 1,
  axis: 0.85
};

const KIND_SCORE_MULTIPLIER: Record<Exclude<PlanSnapKind, "none">, number> = {
  corner: 0.12,
  endpoint: 0.16,
  midpoint: 0.38,
  perpendicular: 0.45,
  edge: 1,
  axis: 1.08
};

function candidateRadiusMultiplier(candidate: PlanSnapCandidate) {
  if (candidate.snapRole === "wallAxisIntersection") return 1.15;
  return KIND_RADIUS_MULTIPLIER[candidate.kind] ?? 1;
}

function candidateScoreMultiplier(candidate: PlanSnapCandidate) {
  return KIND_SCORE_MULTIPLIER[candidate.kind] ?? 1;
}

function candidatePriority(candidate: PlanSnapCandidate) {
  return candidate.snapPriority ?? 0;
}

function isExactPointSnapKind(kind: PlanSnapKind) {
  return kind === "corner" || kind === "endpoint" || kind === "midpoint" || kind === "perpendicular";
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function toFreeBinding(point: THREE.Vector3): PlanSnapBinding {
  return {
    type: "free",
    pointMm: {
      x: Math.round(point.x * 1000),
      y: Math.round(point.y * 1000),
      z: Math.round(point.z * 1000)
    }
  };
}

function pushSegment(
  segments: PlanSnapSegment[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  owner: PlanSnapOwner,
  bindingAt: (t: number, point: THREE.Vector3) => PlanSnapBinding | null,
  meta?: { source?: PlanSnapSegment["source"]; wallId?: string }
) {
  if (a.distanceToSquared(b) < 1e-12) return;
  segments.push({ a: a.clone(), b: b.clone(), owner, bindingAt, source: meta?.source ?? "other", wallId: meta?.wallId });
}

function addClosestEdgeCandidate(
  candidates: PlanSnapCandidate[],
  segments: PlanSnapSegment[],
  raw: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  owner: PlanSnapOwner,
  options?: PlanSnapOptions,
  bindingAt?: (t: number, point: THREE.Vector3) => PlanSnapBinding | null,
  meta?: { source?: PlanSnapSegment["source"]; wallId?: string }
) {
  const ab = b.clone().sub(a);
  const denom = ab.lengthSq();
  if (denom < 1e-12) return;
  const t = Math.max(0, Math.min(1, raw.clone().sub(a).dot(ab) / denom));
  const closest = a.clone().addScaledVector(ab, t);
  candidates.push({
    p: closest,
    kind: "edge",
    a: a.clone(),
    b: b.clone(),
    owner,
    binding: bindingAt?.(t, closest) ?? null
  });
  const midpoint = a.clone().lerp(b, 0.5);
  candidates.push({
    p: midpoint,
    kind: "midpoint",
    a: a.clone(),
    b: b.clone(),
    owner,
    binding: bindingAt?.(0.5, midpoint) ?? null
  });

  const perpendicularFrom = options?.perpendicularFrom ?? null;
  if (perpendicularFrom) {
    const perpT = perpendicularFrom.clone().sub(a).dot(ab) / denom;
    if (perpT >= 0 && perpT <= 1) {
      const perpendicular = a.clone().addScaledVector(ab, perpT);
      candidates.push({
        p: perpendicular,
        kind: "perpendicular",
        a: a.clone(),
        b: b.clone(),
        owner,
        binding: bindingAt?.(perpT, perpendicular) ?? null
      });
    }
  }

  pushSegment(segments, a, b, owner, bindingAt ?? (() => null), meta);
}

function getModuleLocalAnchor(inst: LayoutInstance, anchorName: string) {
  inst.root.updateMatrixWorld(true);
  const anchor = inst.module.getObjectByName(anchorName);
  if (!anchor) return null;
  const world = new THREE.Vector3();
  anchor.getWorldPosition(world);
  return inst.root.worldToLocal(world);
}

function convexHullXZ(points: THREE.Vector3[]) {
  const unique = new Map<string, THREE.Vector3>();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    const key = `${Math.round(point.x * 1000000)},${Math.round(point.z * 1000000)}`;
    if (!unique.has(key)) unique.set(key, point.clone().setY(0));
  }
  const sorted = [...unique.values()].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  if (sorted.length < 3) return [];

  const cross = (o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lower: THREE.Vector3[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 1e-9) lower.pop();
    lower.push(point);
  }
  const upper: THREE.Vector3[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 1e-9) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function isFwmChamferedCornerPlan(inst: LayoutInstance) {
  const moduleParams = inst.params as Record<string, unknown>;
  const type = String(moduleParams.type ?? "");
  const variant = String(moduleParams.variant ?? "");
  if (type === "fwm_catalog_wall_cabinet" && variant.startsWith("corner_")) return true;
  return (
    moduleParams.type === "fwm_catalog_base_corner" &&
    (variant.includes("chamfered") || moduleParams.cornerShape === "chamfered")
  );
}

function isAnchoredLCornerPlan(inst: LayoutInstance) {
  const moduleParams = inst.params as Record<string, unknown>;
  const type = String(moduleParams.type ?? "");
  const variant = String(moduleParams.variant ?? "");
  if (moduleParams.type === "corner_shelf_lower") return true;
  return (
    (type === "fwm_catalog_base_corner" || type === "fwm_catalog_wall_cabinet") &&
    (variant === "corner_90" || variant === "corner_90_1p")
  );
}

function findPlanBoardMesh(inst: LayoutInstance) {
  let best: THREE.Mesh | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  inst.module.traverse((object) => {
    if (bestRank === 0) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
    const boardName = String(mesh.userData?.boardName ?? "");
    const rank = FWM_CHAMFERED_CORNER_PLAN_BOARDS.indexOf(boardName as (typeof FWM_CHAMFERED_CORNER_PLAN_BOARDS)[number]);
    if (rank >= 0 && rank < bestRank) {
      best = mesh;
      bestRank = rank;
    }
  });
  return best;
}

function getProjectedPlanPolygonFromMesh(inst: LayoutInstance, mesh: THREE.Mesh) {
  inst.root.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const profileMm = mesh.userData.revitPlanProfileMm as Array<{ x?: number; z?: number }> | undefined;
  if (Array.isArray(profileMm) && profileMm.length >= 3) {
    const rootInverse = new THREE.Matrix4().copy(inst.root.matrixWorld).invert();
    return profileMm
      .map((point) => new THREE.Vector3(Number(point.x) / 1000, 0, Number(point.z) / 1000))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
      .map((point) => point.applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInverse).setY(0));
  }
  const position = mesh.geometry.getAttribute("position");
  if (!position) return [];
  const rootInverse = new THREE.Matrix4().copy(inst.root.matrixWorld).invert();
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    points.push(
      new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index))
        .applyMatrix4(mesh.matrixWorld)
        .applyMatrix4(rootInverse)
        .setY(0)
    );
  }
  return convexHullXZ(points);
}

function getRealModulePlanLocalPolygon(inst: LayoutInstance) {
  if (!isFwmChamferedCornerPlan(inst)) return [];
  const planBoard = findPlanBoardMesh(inst);
  return planBoard ? getProjectedPlanPolygonFromMesh(inst, planBoard) : [];
}

export function getModulePlanLocalPolygon(
  inst: LayoutInstance,
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3
) {
  const moduleParams = inst.params as Record<string, unknown>;
  const realPlanPolygon = getRealModulePlanLocalPolygon(inst);
  if (realPlanPolygon.length >= 3) return realPlanPolygon;

  if (isAnchoredLCornerPlan(inst)) {
    const corner = getModuleLocalAnchor(inst, KITCHEN_CORNER_ANCHOR_NAME);
    const xAnchor = getModuleLocalAnchor(inst, KITCHEN_CORNER_X_ANCHOR_NAME);
    const zAnchor = getModuleLocalAnchor(inst, KITCHEN_CORNER_Z_ANCHOR_NAME);
    if (corner && xAnchor && zAnchor) {
      const lengthX = Number(moduleParams.lengthX ?? moduleParams.width);
      const lengthZ = Number(moduleParams.lengthZ ?? moduleParams.cornerLengthZMm ?? moduleParams.width);
      const xDir = xAnchor.clone().sub(corner).setY(0);
      const zDir = zAnchor.clone().sub(corner).setY(0);
      if (
        xDir.lengthSq() > 1e-8 &&
        zDir.lengthSq() > 1e-8 &&
        Number.isFinite(lengthX) &&
        lengthX > 0 &&
        Number.isFinite(lengthZ) &&
        lengthZ > 0
      ) {
        const depthMm = Number(moduleParams.depth);
        const armDepthM = (Number.isFinite(depthMm) && depthMm > 0 ? depthMm : Math.min(lengthX, lengthZ)) / 1000;
        const xUnit = xDir.clone().normalize();
        const zUnit = zDir.clone().normalize();
        const xArm = xUnit.clone().multiplyScalar(lengthX / 1000);
        const zArm = zUnit.clone().multiplyScalar(lengthZ / 1000);
        const xInset = xUnit.clone().multiplyScalar(Math.min(lengthX / 1000, armDepthM));
        const zInset = zUnit.clone().multiplyScalar(Math.min(lengthZ / 1000, armDepthM));
        return [
          corner.clone(),
          corner.clone().add(xArm),
          corner.clone().add(xArm).add(zInset),
          corner.clone().add(xInset).add(zInset),
          corner.clone().add(xInset).add(zArm),
          corner.clone().add(zArm)
        ];
      }
      const far = xAnchor.clone().add(zAnchor).sub(corner);
      return [corner, xAnchor, far, zAnchor];
    }
  }

  const widthMm = Number(moduleParams.width);
  const depthMm = Number(moduleParams.depth);
  const backCenter = getModuleLocalBackCenter(inst);
  if (Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(depthMm) && depthMm > 0) {
    const halfWidthM = widthMm / 2000;
    const backZ = backCenter.z;
    const frontZ = backZ + depthMm / 1000;
    return [
      new THREE.Vector3(backCenter.x - halfWidthM, 0, backZ),
      new THREE.Vector3(backCenter.x + halfWidthM, 0, backZ),
      new THREE.Vector3(backCenter.x + halfWidthM, 0, frontZ),
      new THREE.Vector3(backCenter.x - halfWidthM, 0, frontZ)
    ];
  }

  const box = inst.localBox;
  return [
    new THREE.Vector3(box.min.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.min.z),
    new THREE.Vector3(box.max.x, 0, box.max.z),
    new THREE.Vector3(box.min.x, 0, box.max.z)
  ];
}

export function getModulePlanLocalRect(
  inst: LayoutInstance,
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3
) {
  const polygon = getModulePlanLocalPolygon(inst, getModuleLocalBackCenter);
  const xs = polygon.map((point) => point.x);
  const zs = polygon.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return [
    new THREE.Vector3(minX, 0, minZ),
    new THREE.Vector3(maxX, 0, minZ),
    new THREE.Vector3(maxX, 0, maxZ),
    new THREE.Vector3(minX, 0, maxZ)
  ];
}

export function getModulePlanPolygon(
  inst: LayoutInstance,
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3
) {
  inst.root.updateMatrixWorld(true);
  return getModulePlanLocalPolygon(inst, getModuleLocalBackCenter).map((point) =>
    point.clone().applyMatrix4(inst.root.matrixWorld).setY(0)
  );
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

function getColumnPlanPolygon(column: ColumnInstance) {
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

function getSectionLinePoints(section: SectionInstance) {
  return [
    new THREE.Vector3(section.params.aMm.x / 1000, 0, section.params.aMm.z / 1000),
    new THREE.Vector3(section.params.bMm.x / 1000, 0, section.params.bMm.z / 1000)
  ] as const;
}

function getOpeningAxisPoints(
  opening: WindowInstance | DoorInstance,
  openingKind: "window" | "door",
  walls: WallInstance[]
) {
  const wallId = opening.params.wallId ?? null;
  if (!wallId) return null;
  const wall = walls.find((item) => item.id === wallId) ?? null;
  if (!wall) return null;
  const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
  const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
  const dir = b.clone().sub(a).setY(0);
  if (dir.lengthSq() < 1e-10) return null;
  dir.normalize();
  const center = a.clone().addScaledVector(dir, opening.params.centerMm / 1000);
  const halfWidthM = opening.params.widthMm / 2000;
  return {
    openingKind,
    id: opening.id,
    left: center.clone().addScaledVector(dir, -halfWidthM),
    center,
    right: center.clone().addScaledVector(dir, halfWidthM)
  };
}

function appendSnapCandidatesFromLoop(
  candidates: PlanSnapCandidate[],
  segments: PlanSnapSegment[],
  raw: THREE.Vector3,
  points: THREE.Vector3[],
  owner: PlanSnapOwner,
  closed = true,
  options?: PlanSnapOptions,
  bindingFactory?: LoopBindingFactory | null
) {
  if (points.length < 2) return;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    candidates.push({
      p: point.clone(),
      kind: "corner",
      owner,
      binding: bindingFactory?.vertexBinding?.(index, point) ?? null
    });
  }
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    addClosestEdgeCandidate(
      candidates,
      segments,
      raw,
      a,
      b,
      owner,
      options,
      bindingFactory?.edgeBinding ? (t, point) => bindingFactory.edgeBinding!(index, t, point) : undefined
    );
  }
}

function intersectLinesXZ(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3) {
  const ax = a1.x - a0.x;
  const az = a1.z - a0.z;
  const bx = b1.x - b0.x;
  const bz = b1.z - b0.z;
  const denom = ax * bz - az * bx;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = b0.x - a0.x;
  const dz = b0.z - a0.z;
  const ta = (dx * bz - dz * bx) / denom;
  const tb = (dx * az - dz * ax) / denom;
  return {
    ta,
    tb,
    point: new THREE.Vector3(a0.x + ax * ta, 0, a0.z + az * ta)
  };
}

function addGuideIntersections(candidates: PlanSnapCandidate[], guides: PlanSnapGuide[], segments: PlanSnapSegment[]) {
  for (const guide of guides) {
    const dir = guide.direction.clone().setY(0);
    if (dir.lengthSq() < 1e-10) continue;
    dir.normalize();
    const halfSpan = Math.max(0.25, guide.spanM / 2);
    const g0 = guide.anchor.clone().addScaledVector(dir, -halfSpan);
    const g1 = guide.anchor.clone().addScaledVector(dir, halfSpan);
    for (const segment of segments) {
      if (segment.owner === "measureGuide") continue;
      const hit = intersectLinesXZ(g0, g1, segment.a, segment.b);
      if (!hit) continue;
      if (hit.ta < -1e-6 || hit.ta > 1 + 1e-6 || hit.tb < -1e-6 || hit.tb > 1 + 1e-6) continue;
      const point = hit.point;
      const guideOffset = point.clone().sub(guide.anchor).dot(dir);
      candidates.push({
        p: point,
        kind: "corner",
        a: segment.a.clone(),
        b: segment.b.clone(),
        owner: segment.owner,
        binding: segment.bindingAt(Math.max(0, Math.min(1, hit.tb)), point)
      });
      candidates.push({
        p: point.clone(),
        kind: "endpoint",
        a: g0.clone(),
        b: g1.clone(),
        owner: "measureGuide",
        binding: { type: "guideLine", guideId: guide.id, offsetM: guideOffset }
      });
    }
  }
}

function addWallAxisIntersections(candidates: PlanSnapCandidate[], walls: WallInstance[], segments: PlanSnapSegment[]) {
  const wallAxes = segments.filter((segment) => segment.owner === "wall" && segment.source === "wallAxis" && segment.wallId);
  const seen = new Set<string>();
  for (let i = 0; i < wallAxes.length; i += 1) {
    for (let j = i + 1; j < wallAxes.length; j += 1) {
      const a = wallAxes[i]!;
      const b = wallAxes[j]!;
      if (a.wallId === b.wallId) continue;
      const hit = intersectLinesXZ(a.a, a.b, b.a, b.b);
      if (!hit) continue;
      if (hit.ta < -1e-6 || hit.ta > 1 + 1e-6 || hit.tb < -1e-6 || hit.tb > 1 + 1e-6) continue;
      const key = `${Math.round(hit.point.x * 1000)},${Math.round(hit.point.z * 1000)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const binding = getNearestWallBindingAtPoint(walls, hit.point, 0.02) ?? a.bindingAt(Math.max(0, Math.min(1, hit.ta)), hit.point);
      candidates.push({
        p: hit.point,
        kind: "corner",
        a: a.a.clone(),
        b: b.a.clone(),
        owner: "wall",
        binding,
        snapRole: "wallAxisIntersection",
        snapPriority: -10
      });
    }
  }
}

function getWallProjectionBinding(wall: WallInstance, point: THREE.Vector3, endpointTolT = 0.06): PlanSnapBinding {
  const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
  const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
  const ab = b.clone().sub(a);
  const denom = ab.lengthSq();
  if (denom < 1e-12) return { type: "wallEndpoint", wallId: wall.id, endpoint: "a" };
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / denom));
  const closest = a.clone().addScaledVector(ab, t);
  const dir = ab.normalize();
  const normal = new THREE.Vector3(-dir.z, 0, dir.x);
  const normalOffsetMm = Math.round(point.clone().sub(closest).dot(normal) * 1000);
  const bindingOffset = Math.abs(normalOffsetMm) > 1 ? { normalOffsetMm } : {};
  if (t <= endpointTolT) return { type: "wallEndpoint", wallId: wall.id, endpoint: "a", ...bindingOffset };
  if (t >= 1 - endpointTolT) return { type: "wallEndpoint", wallId: wall.id, endpoint: "b", ...bindingOffset };
  return { type: "wallCenterline", wallId: wall.id, t, ...bindingOffset };
}

function getNearestWallBindingAtPoint(walls: WallInstance[], point: THREE.Vector3, maxDistanceM = 0.35): PlanSnapBinding | null {
  let best: { wall: WallInstance; distSq: number } | null = null;
  for (const wall of walls) {
    const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
    const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
    const ab = b.clone().sub(a);
    const denom = ab.lengthSq();
    if (denom < 1e-12) continue;
    const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / denom));
    const closest = a.clone().addScaledVector(ab, t);
    const distSq = closest.distanceToSquared(point);
    if (!best || distSq < best.distSq) best = { wall, distSq };
  }
  if (!best || best.distSq > maxDistanceM * maxDistanceM) return null;
  return getWallProjectionBinding(best.wall, point);
}

export function resolveWallSnapBindingPoint(
  walls: WallInstance[],
  snap: PlanSnapResult | null | undefined,
  fallback: THREE.Vector3
) {
  const binding = snap?.binding;
  if (!binding || (binding.type !== "wallEndpoint" && binding.type !== "wallCenterline")) {
    return snap?.kind && snap.kind !== "none" ? snap.point.clone() : fallback.clone();
  }

  const wall = walls.find((item) => item.id === binding.wallId) ?? null;
  if (!wall) return snap?.point.clone() ?? fallback.clone();

  const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
  const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
  if (binding.type === "wallEndpoint") return (binding.endpoint === "a" ? a : b).clone();

  const t = Math.max(0, Math.min(1, binding.t));
  return a.lerp(b, t);
}

export function createPlanSnapper(args: CreatePlanSnapperArgs) {
  return function snapPoint2D(
    raw: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    maxPx: number = SNAP_DISTANCE_PX.planDefault,
    options?: PlanSnapOptions
  ): PlanSnapResult {
    const candidates: PlanSnapCandidate[] = [];
    const segments: PlanSnapSegment[] = [];

    for (const w of args.getWalls()) {
      const a = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const b = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      candidates.push({ p: a.clone(), kind: "endpoint", owner: "wall", binding: { type: "wallEndpoint", wallId: w.id, endpoint: "a" } });
      candidates.push({ p: b.clone(), kind: "endpoint", owner: "wall", binding: { type: "wallEndpoint", wallId: w.id, endpoint: "b" } });
      pushSegment(segments, a, b, "wall", (t) => ({ type: "wallCenterline", wallId: w.id, t }), { source: "wallAxis", wallId: w.id });

      const ab = b.clone().sub(a);
      const t = ab.lengthSq() > 1e-12 ? raw.clone().sub(a).dot(ab) / ab.lengthSq() : 0;
      const tt = Math.max(0, Math.min(1, t));
      const closest = a.clone().add(ab.multiplyScalar(tt));
      candidates.push({
        p: closest,
        kind: "axis",
        a: a.clone(),
        b: b.clone(),
        owner: "wall",
        binding: { type: "wallCenterline", wallId: w.id, t: tt }
      });
    }
    addWallAxisIntersections(candidates, args.getWalls(), segments);

    for (const [wallId, poly] of args.getWallSolvedOutlines().entries()) {
      const wall = args.getWalls().find((item) => item.id === wallId) ?? null;
      if (!wall) continue;
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        poly.map((point) => new THREE.Vector3(point.x, 0, point.z)),
        "wall",
        true,
        options,
        {
          vertexBinding: (_vertexIndex, point) => getWallProjectionBinding(wall, point),
          edgeBinding: (_segmentIndex, _t, point) => getWallProjectionBinding(wall, point)
        }
      );
    }

    for (const poly of args.getWallSolvedJoinPolys()) {
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        poly.map((point) => new THREE.Vector3(point.x, 0, point.z)),
        "wall",
        true,
        options,
        {
          vertexBinding: (_vertexIndex, point) => getNearestWallBindingAtPoint(args.getWalls(), point),
          edgeBinding: (_segmentIndex, _t, point) => getNearestWallBindingAtPoint(args.getWalls(), point)
        }
      );
    }

    const wallUnionPolys = args.getWallUnionPolys();
    if (wallUnionPolys) {
      for (const poly of wallUnionPolys) {
        for (const ring of poly) {
          const pts = ring.slice(0, -1).map(([x, z]) => new THREE.Vector3(x, 0, z));
          appendSnapCandidatesFromLoop(candidates, segments, raw, pts, "wall", true, options, {
            vertexBinding: (_vertexIndex, point) => getNearestWallBindingAtPoint(args.getWalls(), point),
            edgeBinding: (_segmentIndex, _t, point) => getNearestWallBindingAtPoint(args.getWalls(), point)
          });
        }
      }
    }

    for (const inst of args.getInstances()) {
      const polygon = getModulePlanPolygon(inst, args.getModuleLocalBackCenter);
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        polygon,
        "module",
        true,
        options,
        {
          vertexBinding: (vertexIndex) => ({ type: "moduleVertex", instanceId: inst.id, vertexIndex }),
          edgeBinding: (segmentIndex, t) => ({ type: "moduleEdge", instanceId: inst.id, segmentIndex, t })
        }
      );
    }

    for (const worktop of args.getKitchenWorktops()) {
      const polygon = args
        .getKitchenWorktopPolygon(worktop.params)
        .map((point) => point.clone().setY(0));
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        polygon,
        "worktop",
        true,
        options,
        {
          vertexBinding: (vertexIndex) => ({ type: "worktopVertex", worktopId: worktop.id, vertexIndex }),
          edgeBinding: (segmentIndex, t) => ({ type: "worktopEdge", worktopId: worktop.id, segmentIndex, t })
        }
      );
    }

    for (const floor of args.getFloors()) {
      const polygon = floor.params.boundary.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000));
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        polygon,
        "floor",
        true,
        options,
        {
          vertexBinding: (vertexIndex) => ({ type: "floorVertex", floorId: floor.id, vertexIndex }),
          edgeBinding: (segmentIndex, t) => ({ type: "floorEdge", floorId: floor.id, segmentIndex, t })
        }
      );
    }

    for (const column of args.getColumns?.() ?? []) {
      const polygon = getColumnPlanPolygon(column);
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        polygon,
        "column",
        true,
        options,
        {
          vertexBinding: (vertexIndex) => ({ type: "columnVertex", columnId: column.id, vertexIndex }),
          edgeBinding: (segmentIndex, t) => ({ type: "columnEdge", columnId: column.id, segmentIndex, t })
        }
      );
      const centerMm = getColumnCenterMm(column);
      candidates.push({
        p: new THREE.Vector3(centerMm.x / 1000, 0, centerMm.z / 1000),
        kind: "midpoint",
        owner: "column",
        binding: { type: "columnCenter", columnId: column.id }
      });
    }

    for (const furniture of args.getCustomFurniture?.() ?? []) {
      const polygon = furniture.params.boundary.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000));
      appendSnapCandidatesFromLoop(
        candidates,
        segments,
        raw,
        polygon,
        "customFurniture",
        true,
        options,
        {
          vertexBinding: (vertexIndex) => ({ type: "customFurnitureVertex", furnitureId: furniture.id, vertexIndex }),
          edgeBinding: (segmentIndex, t) => ({ type: "customFurnitureEdge", furnitureId: furniture.id, segmentIndex, t })
        }
      );
    }

    for (const section of args.getSections?.() ?? []) {
      const [a, b] = getSectionLinePoints(section);
      candidates.push({ p: a.clone(), kind: "endpoint", owner: "section", binding: { type: "sectionEndpoint", sectionId: section.id, endpoint: "a" } });
      candidates.push({ p: b.clone(), kind: "endpoint", owner: "section", binding: { type: "sectionEndpoint", sectionId: section.id, endpoint: "b" } });
      addClosestEdgeCandidate(
        candidates,
        segments,
        raw,
        a,
        b,
        "section",
        options,
        (t) => ({ type: "sectionLine", sectionId: section.id, t })
      );
    }

    const addOpeningCandidates = (opening: WindowInstance | DoorInstance, openingKind: "window" | "door") => {
      const points = getOpeningAxisPoints(opening, openingKind, args.getWalls());
      if (!points) return;
      const owner = openingKind;
      candidates.push({
        p: points.left,
        kind: "endpoint",
        owner,
        binding: { type: "openingEndpoint", openingKind, openingId: opening.id, endpoint: "left" }
      });
      candidates.push({
        p: points.center,
        kind: "midpoint",
        owner,
        binding: { type: "openingCenter", openingKind, openingId: opening.id }
      });
      candidates.push({
        p: points.right,
        kind: "endpoint",
        owner,
        binding: { type: "openingEndpoint", openingKind, openingId: opening.id, endpoint: "right" }
      });
      addClosestEdgeCandidate(
        candidates,
        segments,
        raw,
        points.left,
        points.right,
        owner,
        options,
        (t) => ({
          type: t <= 0.08 || t >= 0.92 ? "openingEndpoint" : "openingCenter",
          openingKind,
          openingId: opening.id,
          ...(t <= 0.08 || t >= 0.92 ? { endpoint: t <= 0.5 ? "left" : "right" } : {})
        } as PlanSnapBinding)
      );
    };
    for (const windowInst of args.getWindows?.() ?? []) addOpeningCandidates(windowInst, "window");
    for (const doorInst of args.getDoors?.() ?? []) addOpeningCandidates(doorInst, "door");

    if (args.getLayoutTool() === "wall") {
      const chainStart = args.getWallChainStart();
      if (chainStart) candidates.push({ p: chainStart.clone(), kind: "endpoint", owner: "wall", binding: toFreeBinding(chainStart) });
    }

    const guides = args.getMeasureGuides?.() ?? [];
    for (const guide of guides) {
      const dir = guide.direction.clone().setY(0);
      if (dir.lengthSq() < 1e-10) continue;
      dir.normalize();
      const halfSpan = Math.max(0.25, guide.spanM / 2);
      const a = guide.anchor.clone().addScaledVector(dir, -halfSpan);
      const b = guide.anchor.clone().addScaledVector(dir, halfSpan);
      candidates.push({
        p: guide.anchor.clone(),
        kind: "endpoint",
        owner: "measureGuide",
        binding: { type: "guideAnchor", guideId: guide.id }
      });
      addClosestEdgeCandidate(
        candidates,
        segments,
        raw,
        a,
        b,
        "measureGuide",
        options,
        (_t, point) => ({ type: "guideLine", guideId: guide.id, offsetM: point.clone().sub(guide.anchor).dot(dir) })
      );
    }
    addGuideIntersections(candidates, guides, segments);

    const rawScreen = worldToScreen(raw, camera, rect);
    const isIgnored = (candidate: PlanSnapCandidate) => !!options?.ignoreBinding?.(candidate.binding ?? null, candidate.owner);
    const order = options?.kindPriority ?? DEFAULT_KIND_ORDER;

    const hasWallAxisIntersectionNear = candidates.some((candidate) => {
      if (candidate.snapRole !== "wallAxisIntersection" || isIgnored(candidate)) return false;
      const screen = worldToScreen(candidate.p, camera, rect);
      const d2 = dist2(rawScreen, screen);
      const limit = maxPx * candidateRadiusMultiplier(candidate);
      return d2 <= limit * limit;
    });

    const validHits = candidates
      .map((candidate) => {
        if (isIgnored(candidate)) return null;
        const kind = candidate.kind;
        const rank = order.indexOf(kind);
        if (rank < 0) return null;
        const screen = worldToScreen(candidate.p, camera, rect);
        const d2 = dist2(rawScreen, screen);
        const limit = maxPx * candidateRadiusMultiplier(candidate);
        if (d2 > limit * limit) return null;
        const priority = candidatePriority(candidate);
        return {
          point: candidate.p.clone(),
          kind,
          a: candidate.a?.clone() ?? null,
          b: candidate.b?.clone() ?? null,
          owner: candidate.owner,
          binding: candidate.binding ?? null,
          d2,
          rank,
          priority,
          tier: priority < 0 ? -2 : isExactPointSnapKind(kind) && d2 <= Math.min(5, maxPx * 0.42) ** 2 ? -1 : 0,
          score: d2 * candidateScoreMultiplier(candidate)
        };
      })
      .filter((hit): hit is NonNullable<typeof hit> => !!hit)
      .sort((a, b) =>
        a.tier !== b.tier
          ? a.tier - b.tier
          : a.priority !== b.priority
          ? a.priority - b.priority
          : Math.abs(a.score - b.score) > 1e-6
            ? a.score - b.score
            : a.rank - b.rank
      );

    const sticky = options?.sticky ?? null;
    const stickyThresholdPx = options?.stickyThresholdPx ?? Math.max(16, maxPx + 6);
    const canUseSticky = sticky && sticky.kind !== "none" && sticky.kind !== "edge";
    if (!hasWallAxisIntersectionNear && canUseSticky && !options?.ignoreBinding?.(sticky.binding ?? null, sticky.owner)) {
      const stickyScreen = worldToScreen(sticky.point, camera, rect);
      if (dist2(rawScreen, stickyScreen) <= stickyThresholdPx * stickyThresholdPx) {
        return {
          point: sticky.point.clone(),
          kind: sticky.kind,
          a: sticky.a?.clone() ?? null,
          b: sticky.b?.clone() ?? null,
          owner: sticky.owner,
          binding: sticky.binding ?? null
        };
      }
    }

    const dedupedHits: typeof validHits = [];
    const seen = new Set<string>();
    for (const hit of validHits) {
      const key = [
        hit.kind,
        Math.round(hit.point.x * 1000),
        Math.round(hit.point.z * 1000),
        hit.owner ?? "",
        JSON.stringify(hit.binding ?? null)
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedHits.push(hit);
    }

    if (dedupedHits.length > 0 && options?.cycleIndex != null) {
      const chosen = dedupedHits[((options.cycleIndex % dedupedHits.length) + dedupedHits.length) % dedupedHits.length]!;
      return {
        point: chosen.point,
        kind: chosen.kind,
        a: chosen.a ?? null,
        b: chosen.b ?? null,
        owner: chosen.owner,
        binding: chosen.binding ?? null,
        cycleCount: dedupedHits.length
      };
    }

    if (options?.preferNearest && dedupedHits.length > 0) {
      const best = dedupedHits[0]!;
      return {
        point: best.point,
        kind: best.kind,
        a: best.a ?? null,
        b: best.b ?? null,
        owner: best.owner,
        binding: best.binding ?? null,
        cycleCount: dedupedHits.length
      };
    }

    if (dedupedHits.length > 0) {
      const best = dedupedHits[0]!;
      return {
        point: best.point,
        kind: best.kind,
        a: best.a ?? null,
        b: best.b ?? null,
        owner: best.owner,
        binding: best.binding ?? null,
        cycleCount: dedupedHits.length
      };
    }
    return { point: raw, kind: "none", binding: toFreeBinding(raw), cycleCount: dedupedHits.length };
  };
}
