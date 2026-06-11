import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { getModulePlanPolygon } from "./planSnap";
import { buildModuleSnapCandidates, detectModuleAdjacencyInfo, type ModuleAdjacencyInfo, type ModuleAdjacencyLink } from "./moduleAdjacency";
import { getKitchenWorktopPolygon } from "../layout/worktopGeometry";
import type { KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";
import type { ModuleParams } from "../model/cabinetTypes";
import type { AppState } from "../layout/appState";
import { findKitchenPlacementGroup, resolveKitchenPlacementBackOffset } from "./moduleKitchenPlacement";

type PolygonPoint = [number, number];
type PolygonRing = PolygonPoint[];
type Polygon = PolygonRing[];
type MultiPolygon = Polygon[];
type ResizeAnchorSide = "left" | "right" | "front" | "back";

type PolygonClipper = {
  intersection: (...polygons: MultiPolygon[]) => MultiPolygon;
};

const polygonClipper = polygonClipping as PolygonClipper;

export type ModulePlacementSnapOptions = {
  stickyNeighborId?: string | null;
  ignoreIds?: Set<string>;
  snapDistanceM?: number;
  enforceWallConstraints?: boolean;
  enforceWallOverlap?: boolean;
};

export type AdjacentModuleInfo = ModuleAdjacencyInfo & { other: LayoutInstance };

export type ModulePlacementHelpersContext = {
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  walls: WallInstance[];
  S: Pick<AppState, "kitchenCtx" | "kitchenGroups">;
  roomBounds: { halfW: number; halfD: number };
  wallSolvedOutlines: Map<string, Array<{ x: number; z: number }>>;
  moduleAdjacencyGroup: THREE.Group;
  placementAdjacencyPreview: THREE.Line;
  instanceLayoutWorldBox: (inst: LayoutInstance) => THREE.Box3;
  instanceWorldBox: (inst: LayoutInstance) => THREE.Box3;
  instanceFitsRoom: (inst: LayoutInstance) => boolean;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  moduleStaysOutsideKitchenWorktop: (inst: LayoutInstance | ModuleParams) => boolean;
  isCornerKitchenModule: (instOrParams: LayoutInstance | ModuleParams) => boolean;
  applyKitchenPlacementBinding: (inst: LayoutInstance, binding: NonNullable<LayoutInstance["kitchenPlacement"]>, backOffsetMm: number) => boolean;
  getKitchenCornerArmBindingInfo: (
    inst: LayoutInstance,
    backOffsetMm: number
  ) => { worktopId: string; xSegmentIndex: number | null; zSegmentIndex: number | null } | null;
  getKitchenGuideSegmentInfo: (
    worktop: KitchenWorktopInstance,
    segmentIndex: number,
    backOffsetMm: number
  ) => { start: THREE.Vector3; dir: THREE.Vector3; length: number } | null;
  getKitchenWorktopBackGuidePath: (params: KitchenWorktopInstance["params"], backOffsetMm?: number) => THREE.Vector3[];
  findInstance: (id: string) => LayoutInstance | null;
  getWallUnionPolys: () => MultiPolygon | null;
  getWallSolvedJoinPolys: () => Array<Array<{ x: number; z: number }>>;
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
};

export function createModulePlacementHelpers(ctx: ModulePlacementHelpersContext) {
  const {
    instances,
    kitchenWorktops,
    walls,
    S,
    roomBounds,
    wallSolvedOutlines,
    moduleAdjacencyGroup,
    placementAdjacencyPreview,
    instanceLayoutWorldBox,
    instanceWorldBox,
    instanceFitsRoom,
    getModuleLocalBackCenter,
    moduleStaysOutsideKitchenWorktop,
    isCornerKitchenModule,
    applyKitchenPlacementBinding,
    getKitchenCornerArmBindingInfo,
    getKitchenGuideSegmentInfo,
    getKitchenWorktopBackGuidePath,
    findInstance
  } = ctx;

function placeWithoutOverlap(inst: LayoutInstance) {
  const step = 0.25;
  const maxR = 40;
  const origin = applyWallConstraints(inst, inst.root.position.clone());
  for (let r = 0; r < maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const desired = new THREE.Vector3(origin.x + dx * step, origin.y, origin.z + dz * step);
        const clamped = applyWallConstraints(inst, desired);
        inst.root.position.copy(clamped);
        if (!instanceFitsRoom(inst)) continue;
        if (!anyOverlap(inst, null) && !moduleOverlapsWalls(inst) && !moduleOverlapsKitchenWorktops(inst)) return;
      }
    }
  }
}

function aabbOverlapXZ(a: THREE.Box3, b: THREE.Box3, eps = 0.0005) {
  const ax0 = a.min.x;
  const ax1 = a.max.x;
  const az0 = a.min.z;
  const az1 = a.max.z;
  const bx0 = b.min.x;
  const bx1 = b.max.x;
  const bz0 = b.min.z;
  const bz1 = b.max.z;
  return ax0 < bx1 - eps && ax1 > bx0 + eps && az0 < bz1 - eps && az1 > bz0 + eps;
}

function aabbOverlapY(a: THREE.Box3, b: THREE.Box3, eps = 0.0005) {
  return a.min.y < b.max.y - eps && a.max.y > b.min.y + eps;
}

function anyOverlap(moving: LayoutInstance, ignoreId: string | null) {
  const a = instanceLayoutWorldBox(moving);
  const movingRing = moduleWorldRing(moving);
  const movingMp = movingRing.length >= 4 ? [[movingRing]] : null;
  for (const other of instances) {
    if (other.id === moving.id) continue;
    if (ignoreId && other.id === ignoreId) continue;
    const b = instanceLayoutWorldBox(other);
    if (!aabbOverlapXZ(a, b)) continue;
    if (!aabbOverlapY(a, b)) continue;
    const otherRing = moduleWorldRing(other);
    if (!movingMp || otherRing.length < 4) return true;
    try {
      const inter = polygonClipper.intersection(movingMp, [[otherRing]]);
      if (multiPolyArea(inter) > 1e-6) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function anyOverlapIgnoring(moving: LayoutInstance, ignoreIds: Set<string>) {
  const a = instanceLayoutWorldBox(moving);
  const movingRing = moduleWorldRing(moving);
  const movingMp = movingRing.length >= 4 ? [[movingRing]] : null;
  for (const other of instances) {
    if (other.id === moving.id) continue;
    if (ignoreIds.has(other.id)) continue;
    const b = instanceLayoutWorldBox(other);
    if (!aabbOverlapXZ(a, b)) continue;
    if (!aabbOverlapY(a, b)) continue;
    const otherRing = moduleWorldRing(other);
    if (!movingMp || otherRing.length < 4) return true;
    try {
      const inter = polygonClipper.intersection(movingMp, [[otherRing]]);
      if (multiPolyArea(inter) > 1e-6) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function polyArea(ring: Array<[number, number]>) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function multiPolyArea(mp: MultiPolygon | null | undefined) {
  if (!mp || !Array.isArray(mp)) return 0;
  let sum = 0;
  for (const poly of mp) {
    if (!poly || poly.length === 0) continue;
    const rings = poly;
    const outer = rings[0] as Array<[number, number]>;
    if (!outer || outer.length < 4) continue;
    let a = Math.abs(polyArea(outer));
    for (let i = 1; i < rings.length; i++) {
      const hole = rings[i] as Array<[number, number]>;
      if (!hole || hole.length < 4) continue;
      a -= Math.abs(polyArea(hole));
    }
    sum += Math.max(0, a);
  }
  return sum;
}

function moduleWorldRing(inst: LayoutInstance) {
  const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
  const ring: Array<[number, number]> = polygon.map((point) => [point.x, point.z]);
  if (ring.length > 0) ring.push(ring[0]);
  return ring;
}

function worktopWorldRing(worktop: KitchenWorktopInstance) {
  const polygon = getKitchenWorktopPolygon(worktop.params);
  const ring: Array<[number, number]> = polygon.map((point) => [point.x, point.z]);
  if (ring.length > 0) ring.push(ring[0]);
  return ring;
}

function moduleOverlapsKitchenWorktops(inst: LayoutInstance) {
  if (!moduleStaysOutsideKitchenWorktop(inst)) return false;
  if (!inst.kitchenGroupId) return false;
    const relatedWorktops = kitchenWorktops.filter((worktop: KitchenWorktopInstance) => worktop.kitchenGroupId === inst.kitchenGroupId);
  if (relatedWorktops.length === 0) return false;

  const moduleMp = [[moduleWorldRing(inst)]];
  for (const worktop of relatedWorktops) {
    const ring = worktopWorldRing(worktop);
    if (ring.length < 4) continue;
    try {
      const inter = polygonClipper.intersection([[ring]], moduleMp);
      if (multiPolyArea(inter) > 1e-6) return true;
    } catch {
      // ignore broken clipping input and keep fallback-free behavior
    }
  }
  return false;
}

function moduleOverlapsWalls(inst: LayoutInstance) {
  if (walls.length === 0) return false;
  const ring = moduleWorldRing(inst);
  const moduleMp = [[ring]];

  const wallMp = ctx.getWallUnionPolys();
  if (wallMp) {
    try {
      const inter = polygonClipper.intersection(wallMp, moduleMp);
      const area = multiPolyArea(inter);
      return area > 1e-6; // ~1mm^2 in m^2
    } catch {
      // fall through
    }
  }

  // Fallback: test against individual outlines + join polys (less robust but still blocks wall embedding).
  const toRing = (poly: Array<{ x: number; z: number }>) => {
    const r: Array<[number, number]> = poly.map((p) => [p.x, p.z]);
    if (r.length > 0) r.push(r[0]);
    return r;
  };
  const polys: MultiPolygon[] = [];
  for (const poly of wallSolvedOutlines.values()) if (poly.length >= 3) polys.push([[toRing(poly)]]);
  for (const poly of ctx.getWallSolvedJoinPolys()) if (poly.length >= 3) polys.push([[toRing(poly)]]);
  for (const wmp of polys) {
    try {
      const inter = polygonClipper.intersection(wmp, moduleMp);
      const area = multiPolyArea(inter);
      if (area > 1e-6) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function snapPositionDetailed(moving: LayoutInstance, desired: THREE.Vector3, opts?: ModulePlacementSnapOptions) {
  if (isCornerKitchenModule(moving)) {
    return { position: desired.clone(), link: null };
  }
  const currentPos = moving.root.position.clone();
  moving.root.position.copy(desired);
  const a = instanceWorldBox(moving);
  moving.root.position.copy(currentPos);
  const others = instances
      .filter((other: LayoutInstance) => other.id !== moving.id && !(opts?.ignoreIds?.has(other.id)))
      .filter((other: LayoutInstance) => !moving.kitchenGroupId || other.kitchenGroupId === moving.kitchenGroupId)
      .map((other: LayoutInstance) => ({ id: other.id, box: instanceWorldBox(other) }));
  const adjacencyCandidates = buildModuleSnapCandidates({
    movingId: moving.id,
    movingBox: a,
    desired,
    others,
    stickyNeighborId: opts?.stickyNeighborId ?? null,
    snapDistanceM: opts?.snapDistanceM
  });

  const candidates: Array<{ pos: THREE.Vector3; score: number; link: ModuleAdjacencyLink | null }> = [];
  candidates.push({ pos: desired.clone(), score: 0, link: null });
  for (const candidate of adjacencyCandidates) candidates.push(candidate);

  let best = desired.clone();
  let bestScore = Infinity;
  let bestLink: ModuleAdjacencyLink | null = null;
  const enforceWallConstraints = opts?.enforceWallConstraints ?? true;
  const enforceWallOverlap = opts?.enforceWallOverlap ?? true;
  for (const c of candidates) {
    const clamped = enforceWallConstraints ? applyWallConstraints(moving, c.pos) : c.pos.clone();
    const prev = moving.root.position.clone();
    moving.root.position.copy(clamped);
    const overlaps =
      (opts?.ignoreIds ? anyOverlapIgnoring(moving, opts.ignoreIds) : anyOverlap(moving, null)) ||
      (enforceWallOverlap ? moduleOverlapsWalls(moving) : false);
    moving.root.position.copy(prev);
    if (overlaps) continue;
    if (c.score < bestScore) {
      bestScore = c.score;
      best = clamped;
      bestLink = c.link ?? null;
    }
  }

  return { position: best, link: bestLink };
}

function collectPinnedPushChain(startId: string, side: ResizeAnchorSide) {
  const queue = [startId];
  const visited = new Set<string>([startId]);
  const result: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = findInstance(currentId);
    if (!current) continue;
    const currentBox = instanceWorldBox(current);

    for (const other of instances) {
      if (other.id === currentId || visited.has(other.id)) continue;
      if (current.kitchenGroupId && other.kitchenGroupId !== current.kitchenGroupId) continue;
      const info = detectModuleAdjacencyInfo(currentBox, instanceWorldBox(other), other.id);
      if (!info || info.side !== side) continue;
      visited.add(other.id);
      result.push(other.id);
      queue.push(other.id);
    }
  }

  return result;
}

function collectPinnedPushChainFromBoxes(
  startId: string,
  side: ResizeAnchorSide,
  boxesById: Map<string, THREE.Box3>,
  kitchenGroupId: string | null
) {
  const queue = [startId];
  const visited = new Set<string>([startId]);
  const result: string[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentBox = boxesById.get(currentId);
    if (!currentBox) continue;

    for (const other of instances) {
      if (other.id === currentId || visited.has(other.id)) continue;
      if (kitchenGroupId && other.kitchenGroupId !== kitchenGroupId) continue;
      const otherBox = boxesById.get(other.id);
      if (!otherBox) continue;
      const info = detectModuleAdjacencyInfo(currentBox, otherBox, other.id);
      if (!info || info.side !== side) continue;
      visited.add(other.id);
      result.push(other.id);
      queue.push(other.id);
    }
  }

  return result;
}

function collectAdjacentModuleInfos(inst: LayoutInstance, referenceBox = instanceWorldBox(inst)) {
  const infos: AdjacentModuleInfo[] = [];
  for (const other of instances) {
    if (other.id === inst.id) continue;
    if (inst.kitchenGroupId && other.kitchenGroupId !== inst.kitchenGroupId) continue;
    const info = detectModuleAdjacencyInfo(referenceBox, instanceWorldBox(other), other.id);
    if (!info) continue;
    infos.push({ ...info, other });
  }
  return infos;
}

function chooseResizeAnchorSide(_inst: LayoutInstance, infos: AdjacentModuleInfo[]) {
  if (infos.length === 0) return null;

  const bySide = new Map<ResizeAnchorSide, Array<(typeof infos)[number]>>();
  for (const info of infos) {
    const list = bySide.get(info.side) ?? [];
    list.push(info);
    bySide.set(info.side, list);
  }

  const choosePreferredCornerSide = (
    primary: ResizeAnchorSide,
    secondary: ResizeAnchorSide
  ) => {
    const primaryInfos = bySide.get(primary) ?? [];
    const secondaryInfos = bySide.get(secondary) ?? [];
    if (primaryInfos.length === 0 && secondaryInfos.length === 0) return null;
    const primaryHasCorner = primaryInfos.some((item) => item.other.params.type === "corner_shelf_lower");
    const secondaryHasCorner = secondaryInfos.some((item) => item.other.params.type === "corner_shelf_lower");
    if (primaryHasCorner && secondaryInfos.length === 0) return primary;
    if (secondaryHasCorner && primaryInfos.length === 0) return secondary;
    if (primaryHasCorner !== secondaryHasCorner) return primaryHasCorner ? primary : secondary;
    if (primaryInfos.length > 0 && secondaryInfos.length === 0) return primary;
    if (secondaryInfos.length > 0 && primaryInfos.length === 0) return secondary;
    return null;
  };

  return choosePreferredCornerSide("left", "right") ?? choosePreferredCornerSide("back", "front");
}

function worldDirectionToBoxSide(dir: THREE.Vector3) {
  if (Math.abs(dir.x) >= Math.abs(dir.z)) return dir.x >= 0 ? "right" : "left";
  return dir.z >= 0 ? "front" : "back";
}

function inferTallResizeAnchorSide(inst: LayoutInstance) {
  if (!inst.kitchenGroupId || !moduleStaysOutsideKitchenWorktop(inst)) return null;
    const relatedWorktops = kitchenWorktops.filter((worktop: KitchenWorktopInstance) => worktop.kitchenGroupId === inst.kitchenGroupId);
  if (relatedWorktops.length === 0) return null;

  const widthMm = Number((inst.params as Record<string, unknown>).width);
  const halfModuleWidthM =
    Number.isFinite(widthMm) && widthMm > 0 ? widthMm / 2000 : Math.max(0.001, (inst.localBox.max.x - inst.localBox.min.x) * 0.5);
  const backCenterWorld = getModuleLocalBackCenter(inst).clone().applyMatrix4(inst.root.matrixWorld);
  const backOffsetMm = resolveKitchenPlacementBackOffset({
    kitchenGroupId: inst.kitchenGroupId,
    kitchenGroups: S.kitchenGroups,
    defaultWorktopBackOffsetMm: S.kitchenCtx.worktopBackOffsetMm
  });

  let best:
    | {
        distanceSq: number;
        anchorSide: ResizeAnchorSide;
      }
    | null = null;

  for (const worktop of relatedWorktops) {
    const firstInfo = getKitchenGuideSegmentInfo(worktop, 0, backOffsetMm);
    const guidePath = getKitchenWorktopBackGuidePath(worktop.params, backOffsetMm);
    const lastInfo = guidePath.length >= 2 ? getKitchenGuideSegmentInfo(worktop, guidePath.length - 2, backOffsetMm) : null;
    const candidates = [
      firstInfo
        ? {
            point: firstInfo.start.clone().addScaledVector(firstInfo.dir, -halfModuleWidthM),
            anchorSide: worldDirectionToBoxSide(firstInfo.dir)
          }
        : null,
      lastInfo
        ? {
            point: lastInfo.start.clone().addScaledVector(lastInfo.dir, lastInfo.length + halfModuleWidthM),
            anchorSide: worldDirectionToBoxSide(lastInfo.dir.clone().multiplyScalar(-1))
          }
        : null
    ].filter((candidate): candidate is { point: THREE.Vector3; anchorSide: ResizeAnchorSide } => candidate != null);

    for (const candidate of candidates) {
      const distanceSq = candidate.point.distanceToSquared(backCenterWorld);
      if (!best || distanceSq < best.distanceSq) {
        best = { distanceSq, anchorSide: candidate.anchorSide };
      }
    }
  }

  return best?.anchorSide ?? null;
}

function preserveAnchoredResizeSide(
  inst: LayoutInstance,
  prevWorldBox: THREE.Box3,
  anchorSide: ResizeAnchorSide | null
) {
  if (!anchorSide) return;
  const nextWorldBox = instanceWorldBox(inst);
  switch (anchorSide) {
    case "left":
      inst.root.position.x += prevWorldBox.min.x - nextWorldBox.min.x;
      break;
    case "right":
      inst.root.position.x += prevWorldBox.max.x - nextWorldBox.max.x;
      break;
    case "back":
      inst.root.position.z += prevWorldBox.min.z - nextWorldBox.min.z;
      break;
    case "front":
      inst.root.position.z += prevWorldBox.max.z - nextWorldBox.max.z;
      break;
  }
  inst.root.updateMatrixWorld(true);
}

function nudgePinnedModuleChain(inst: LayoutInstance, delta: THREE.Vector3) {
  const moved: Array<{ id: string; prev: THREE.Vector3 }> = [];
  if (!inst.kitchenGroupId) return moved;
  const absX = Math.abs(delta.x);
  const absZ = Math.abs(delta.z);
  if (absX < 1e-9 && absZ < 1e-9) return moved;
  const side =
    absX >= absZ
      ? delta.x >= 0
        ? "right"
        : "left"
      : delta.z >= 0
        ? "front"
        : "back";
  const chain = collectPinnedPushChain(inst.id, side);
  for (const neighborId of chain) {
    const neighbor = findInstance(neighborId);
    if (!neighbor) continue;
    moved.push({ id: neighbor.id, prev: neighbor.root.position.clone() });
    neighbor.root.position.add(delta);
    neighbor.root.updateMatrixWorld(true);
  }
  return moved;
}

function propagateCornerResizeToPinnedNeighbors(inst: LayoutInstance, previousParams: ModuleParams) {
  if (!inst.kitchenGroupId || !isCornerKitchenModule(inst)) return { ok: true, movedIds: [] as string[] };
  const group = findKitchenPlacementGroup({ kitchenGroupId: inst.kitchenGroupId, kitchenGroups: S.kitchenGroups });
  if (!group) return { ok: true, movedIds: [] as string[] };
  const backOffsetMm = group.ctx.worktopBackOffsetMm;
  void previousParams;

  const armInfo = getKitchenCornerArmBindingInfo(inst, backOffsetMm);
  if (!armInfo) return { ok: true, movedIds: [] as string[] };
  const touchedSegments = new Set([armInfo.xSegmentIndex, armInfo.zSegmentIndex].filter((value): value is number => value != null));
  if (touchedSegments.size === 0) return { ok: true, movedIds: [] as string[] };

  const movedIds = new Set<string>();
  for (const other of instances) {
    if (other.id === inst.id || other.kitchenGroupId !== inst.kitchenGroupId) continue;
    const otherBinding = other.kitchenPlacement;
    if (!otherBinding || otherBinding.worktopId !== armInfo.worktopId) continue;
    if ((otherBinding.kind ?? "segment") === "corner") continue;
    if (!touchedSegments.has(otherBinding.segmentIndex)) continue;
    const before = other.root.position.clone();
    if (!applyKitchenPlacementBinding(other, structuredClone(otherBinding), backOffsetMm)) continue;
    if (before.distanceToSquared(other.root.position) > 1e-10) movedIds.add(other.id);
  }

  return { ok: true, movedIds: Array.from(movedIds) };
}

function propagateModuleResizeToPinnedNeighbors(
  inst: LayoutInstance,
  prevWorldBox: THREE.Box3,
  prevBoxesById?: Map<string, THREE.Box3>
) {
  if (!inst.kitchenGroupId) return { ok: true, movedIds: [] as string[] };

  const nextWorldBox = instanceWorldBox(inst);
  const moves: Array<{ side: ResizeAnchorSide; delta: THREE.Vector3 }> = [];
  const rightDelta = nextWorldBox.max.x - prevWorldBox.max.x;
  const leftDelta = nextWorldBox.min.x - prevWorldBox.min.x;
  const frontDelta = nextWorldBox.max.z - prevWorldBox.max.z;
  const backDelta = nextWorldBox.min.z - prevWorldBox.min.z;

  if (Math.abs(rightDelta) > 1e-6) moves.push({ side: "right", delta: new THREE.Vector3(rightDelta, 0, 0) });
  if (Math.abs(leftDelta) > 1e-6) moves.push({ side: "left", delta: new THREE.Vector3(leftDelta, 0, 0) });
  if (Math.abs(frontDelta) > 1e-6) moves.push({ side: "front", delta: new THREE.Vector3(0, 0, frontDelta) });
  if (Math.abs(backDelta) > 1e-6) moves.push({ side: "back", delta: new THREE.Vector3(0, 0, backDelta) });

  const movedIds = new Set<string>();
  for (const move of moves) {
    const chain = prevBoxesById
      ? collectPinnedPushChainFromBoxes(inst.id, move.side, prevBoxesById, inst.kitchenGroupId)
      : collectPinnedPushChain(inst.id, move.side);
    for (const neighborId of chain) {
      const neighbor = findInstance(neighborId);
      if (!neighbor) continue;
      neighbor.root.position.add(move.delta);
      neighbor.root.updateMatrixWorld(true);
      movedIds.add(neighborId);
    }
  }

  return { ok: true, movedIds: Array.from(movedIds) };
}

function snapPosition(moving: LayoutInstance, desired: THREE.Vector3) {
  return snapPositionDetailed(moving, desired).position;
}

function setPlacementAdjacencyPreview(link: ModuleAdjacencyLink | null) {
  if (!link) {
    placementAdjacencyPreview.visible = false;
    return;
  }
  placementAdjacencyPreview.geometry.dispose();
  placementAdjacencyPreview.geometry = new THREE.BufferGeometry().setFromPoints([link.lineStart, link.lineEnd]);
  placementAdjacencyPreview.visible = true;
}

function updateModuleAdjacencyVisuals() {
  for (const child of [...moduleAdjacencyGroup.children]) {
    if (child === placementAdjacencyPreview) continue;
    moduleAdjacencyGroup.remove(child);
    const line = child as THREE.Line;
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }

  if (ctx.getViewMode() !== "2d" || ctx.getActiveViewerTab() !== "floorplan") {
    moduleAdjacencyGroup.visible = placementAdjacencyPreview.visible;
    return;
  }

  const done = new Set<string>();
  for (const inst of instances) {
    const box = instanceWorldBox(inst);
    for (const other of instances) {
      if (other.id === inst.id) continue;
      const key = [inst.id, other.id].sort().join("|");
      if (done.has(key)) continue;
      done.add(key);
      const info = detectModuleAdjacencyInfo(box, instanceWorldBox(other), other.id);
      if (!info) continue;
      const linePoints =
        info.axis === "x"
          ? [
              new THREE.Vector3(info.seam, 0.014, info.overlapMin),
              new THREE.Vector3(info.seam, 0.014, info.overlapMax)
            ]
          : [
              new THREE.Vector3(info.overlapMin, 0.014, info.seam),
              new THREE.Vector3(info.overlapMax, 0.014, info.seam)
            ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(linePoints),
        new THREE.LineBasicMaterial({ color: 0x384253, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false })
      );
      line.renderOrder = 59;
      moduleAdjacencyGroup.add(line);
    }
  }

  moduleAdjacencyGroup.visible = moduleAdjacencyGroup.children.length > 0;
}

function applyWallConstraints(moving: LayoutInstance, desired: THREE.Vector3) {
  const snapDist = 0.03; // 30mm

  const currentPos = moving.root.position.clone();
  moving.root.position.copy(desired);
  const a = instanceLayoutWorldBox(moving);
  moving.root.position.copy(currentPos);

  const next = desired.clone();

  // Hard clamp inside room bounds.
  if (a.min.x < -roomBounds.halfW) next.x += -roomBounds.halfW - a.min.x;
  if (a.max.x > roomBounds.halfW) next.x -= a.max.x - roomBounds.halfW;
  if (a.min.z < -roomBounds.halfD) next.z += -roomBounds.halfD - a.min.z;
  if (a.max.z > roomBounds.halfD) next.z -= a.max.z - roomBounds.halfD;

  // Soft snap to walls when close.
  const trySnap = (delta: THREE.Vector3) => {
    const prev = moving.root.position.clone();
    moving.root.position.copy(next.clone().add(delta));
    const ok = !anyOverlap(moving, null) && !moduleOverlapsWalls(moving);
    moving.root.position.copy(prev);
    if (ok) next.add(delta);
  };

  const currentPos2 = moving.root.position.clone();
  moving.root.position.copy(next);
  const b = instanceLayoutWorldBox(moving);
  moving.root.position.copy(currentPos2);

  const dxL = -roomBounds.halfW - b.min.x;
  const dxR = roomBounds.halfW - b.max.x;
  const dzB = -roomBounds.halfD - b.min.z; // back wall (-Z)
  const dzF = roomBounds.halfD - b.max.z; // front wall (+Z)

  if (Math.abs(dxL) <= snapDist) trySnap(new THREE.Vector3(dxL, 0, 0));
  if (Math.abs(dxR) <= snapDist) trySnap(new THREE.Vector3(dxR, 0, 0));
  if (Math.abs(dzB) <= snapDist) trySnap(new THREE.Vector3(0, 0, dzB));
  if (Math.abs(dzF) <= snapDist) trySnap(new THREE.Vector3(0, 0, dzF));

  return next;
}

function autoOrientModuleToRoomWallIfSnapped(inst: LayoutInstance, ignoreIds?: Set<string>) {
  const snapDist = 0.03; // 30mm
  const box = instanceLayoutWorldBox(inst);
  const dxL = -roomBounds.halfW - box.min.x;
  const dxR = roomBounds.halfW - box.max.x;
  const dzB = -roomBounds.halfD - box.min.z; // back (-Z)
  const dzF = roomBounds.halfD - box.max.z; // front (+Z)

  const candidates: Array<{ dist: number; rotY: number }> = [];
  if (Math.abs(dxL) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dxL), rotY: Math.PI / 2 }); // back = -X
  if (Math.abs(dxR) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dxR), rotY: -Math.PI / 2 }); // back = +X
  if (Math.abs(dzB) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dzB), rotY: 0 }); // back = -Z
  if (Math.abs(dzF) <= snapDist + 1e-6) candidates.push({ dist: Math.abs(dzF), rotY: Math.PI }); // back = +Z
  if (candidates.length === 0) return;

  candidates.sort((a, b) => a.dist - b.dist);
  const targetRot = candidates[0].rotY;

  const prevPos = inst.root.position.clone();
  const prevRot = inst.root.rotation.y;

  inst.root.rotation.y = targetRot;
  inst.root.position.copy(applyWallConstraints(inst, inst.root.position.clone()));
  const inRoom = instanceFitsRoom(inst);
  const overlaps = ignoreIds ? anyOverlapIgnoring(inst, ignoreIds) : anyOverlap(inst, null);
  if (!inRoom || overlaps || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst)) {
    inst.root.rotation.y = prevRot;
    inst.root.position.copy(prevPos);
    inst.root.updateMatrixWorld(true);
    return;
  }
  inst.root.updateMatrixWorld(true);
}

  return {
    placeWithoutOverlap,
    aabbOverlapXZ,
    aabbOverlapY,
    anyOverlap,
    anyOverlapIgnoring,
    polyArea,
    multiPolyArea,
    moduleWorldRing,
    worktopWorldRing,
    moduleOverlapsKitchenWorktops,
    moduleOverlapsWalls,
    snapPositionDetailed,
    collectPinnedPushChain,
    collectPinnedPushChainFromBoxes,
    collectAdjacentModuleInfos,
    chooseResizeAnchorSide,
    worldDirectionToBoxSide,
    inferTallResizeAnchorSide,
    preserveAnchoredResizeSide,
    nudgePinnedModuleChain,
    propagateCornerResizeToPinnedNeighbors,
    propagateModuleResizeToPinnedNeighbors,
    snapPosition,
    setPlacementAdjacencyPreview,
    updateModuleAdjacencyVisuals,
    applyWallConstraints,
    autoOrientModuleToRoomWallIfSnapped
  };
}
