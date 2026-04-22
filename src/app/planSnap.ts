import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";
import type {
  FloorInstance,
  KitchenWorktopInstance,
  KitchenWorktopParams,
  LayoutInstance,
  WallInstance
} from "./localTypes";

export type PlanSnapKind = "none" | "corner" | "midpoint" | "perpendicular" | "edge" | "endpoint" | "axis";
export type PlanSnapOwner = "wall" | "module" | "worktop" | "floor";

type PlanSnapCandidate = {
  p: THREE.Vector3;
  kind: Exclude<PlanSnapKind, "none">;
  a?: THREE.Vector3 | null;
  b?: THREE.Vector3 | null;
  owner?: PlanSnapOwner;
};

export type PlanSnapResult = {
  point: THREE.Vector3;
  kind: PlanSnapKind;
  a?: THREE.Vector3 | null;
  b?: THREE.Vector3 | null;
  owner?: PlanSnapOwner;
};

type CreatePlanSnapperArgs = {
  getWalls: () => WallInstance[];
  getInstances: () => LayoutInstance[];
  getFloors: () => FloorInstance[];
  getKitchenWorktops: () => KitchenWorktopInstance[];
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
  getWallSolvedJoinPolys: () => Array<Array<{ x: number; z: number }>>;
  getWallUnionPolys: () => any | null;
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
};

const DEFAULT_KIND_ORDER = ["corner", "endpoint", "midpoint", "perpendicular", "edge", "axis"] satisfies Array<
  Exclude<PlanSnapKind, "none">
>;

const KIND_RADIUS_MULTIPLIER: Record<Exclude<PlanSnapKind, "none">, number> = {
  corner: 2.1,
  endpoint: 1.8,
  midpoint: 1.2,
  perpendicular: 1.15,
  edge: 1,
  axis: 0.95
};

const KIND_SCORE_MULTIPLIER: Record<Exclude<PlanSnapKind, "none">, number> = {
  corner: 0.42,
  endpoint: 0.58,
  midpoint: 0.82,
  perpendicular: 0.88,
  edge: 1,
  axis: 1.08
};

function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function addClosestEdgeCandidate(
  candidates: PlanSnapCandidate[],
  raw: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  owner: PlanSnapOwner,
  options?: PlanSnapOptions
) {
  const ab = b.clone().sub(a);
  const denom = ab.lengthSq();
  if (denom < 1e-12) return;
  const t = Math.max(0, Math.min(1, raw.clone().sub(a).dot(ab) / denom));
  const closest = a.clone().addScaledVector(ab, t);
  candidates.push({ p: closest, kind: "edge", a: a.clone(), b: b.clone(), owner });
  candidates.push({ p: a.clone().lerp(b, 0.5), kind: "midpoint", a: a.clone(), b: b.clone(), owner });

  const perpendicularFrom = options?.perpendicularFrom ?? null;
  if (perpendicularFrom) {
    const perpT = perpendicularFrom.clone().sub(a).dot(ab) / denom;
    if (perpT >= 0 && perpT <= 1) {
      const perpendicular = a.clone().addScaledVector(ab, perpT);
      candidates.push({ p: perpendicular, kind: "perpendicular", a: a.clone(), b: b.clone(), owner });
    }
  }
}

export function getModulePlanLocalRect(
  inst: LayoutInstance,
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3
) {
  const widthMm = Number((inst.params as any)?.width);
  const depthMm = Number((inst.params as any)?.depth);
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

export function getModulePlanPolygon(
  inst: LayoutInstance,
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3
) {
  inst.root.updateMatrixWorld(true);
  return getModulePlanLocalRect(inst, getModuleLocalBackCenter).map((point) =>
    point.clone().applyMatrix4(inst.root.matrixWorld).setY(0)
  );
}

function appendSnapCandidatesFromLoop(
  candidates: PlanSnapCandidate[],
  raw: THREE.Vector3,
  points: THREE.Vector3[],
  owner: PlanSnapOwner,
  closed = true,
  options?: PlanSnapOptions
) {
  if (points.length < 2) return;
  for (const point of points) {
    candidates.push({ p: point.clone(), kind: "corner", owner });
  }
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    addClosestEdgeCandidate(candidates, raw, a, b, owner, options);
  }
}

export function createPlanSnapper(args: CreatePlanSnapperArgs) {
  return function snapPoint2D(
    raw: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
    maxPx = 14,
    options?: PlanSnapOptions
  ): PlanSnapResult {
    const candidates: PlanSnapCandidate[] = [];

    for (const w of args.getWalls()) {
      const a = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const b = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      candidates.push({ p: a, kind: "endpoint", owner: "wall" });
      candidates.push({ p: b, kind: "endpoint", owner: "wall" });
      addClosestEdgeCandidate(candidates, raw, a, b, "wall", options);

      const ab = b.clone().sub(a);
      const t = ab.lengthSq() > 1e-12 ? raw.clone().sub(a).dot(ab) / ab.lengthSq() : 0;
      const tt = Math.max(0, Math.min(1, t));
      const closest = a.clone().add(ab.multiplyScalar(tt));
      candidates.push({ p: closest, kind: "axis", a: a.clone(), b: b.clone(), owner: "wall" });
    }

    for (const poly of args.getWallSolvedOutlines().values()) {
      appendSnapCandidatesFromLoop(
        candidates,
        raw,
        poly.map((point) => new THREE.Vector3(point.x, 0, point.z)),
        "wall",
        true,
        options
      );
    }

    for (const poly of args.getWallSolvedJoinPolys()) {
      appendSnapCandidatesFromLoop(
        candidates,
        raw,
        poly.map((point) => new THREE.Vector3(point.x, 0, point.z)),
        "wall",
        true,
        options
      );
    }

    const wallUnionPolys = args.getWallUnionPolys();
    if (wallUnionPolys) {
      for (const poly of wallUnionPolys as any[]) {
        for (const ring of poly as any[]) {
          const pts = (ring as Array<[number, number]>).slice(0, -1).map(([x, z]) => new THREE.Vector3(x, 0, z));
          appendSnapCandidatesFromLoop(candidates, raw, pts, "wall", true, options);
        }
      }
    }

    for (const inst of args.getInstances()) {
      appendSnapCandidatesFromLoop(candidates, raw, getModulePlanPolygon(inst, args.getModuleLocalBackCenter), "module", true, options);
    }

    for (const worktop of args.getKitchenWorktops()) {
      appendSnapCandidatesFromLoop(
        candidates,
        raw,
        args.getKitchenWorktopPolygon(worktop.params).map((point) => point.clone().setY(0)),
        "worktop",
        true,
        options
      );
    }

    for (const floor of args.getFloors()) {
      appendSnapCandidatesFromLoop(
        candidates,
        raw,
        floor.params.boundary.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000)),
        "floor",
        true,
        options
      );
    }

    if (args.getLayoutTool() === "wall") {
      const chainStart = args.getWallChainStart();
      if (chainStart) candidates.push({ p: chainStart.clone(), kind: "endpoint", owner: "wall" });
    }

    const rawScreen = worldToScreen(raw, camera, rect);
    const bestByKind = new Map<Exclude<PlanSnapKind, "none">, { candidate: PlanSnapCandidate; d2: number }>();
    for (const candidate of candidates) {
      const screen = worldToScreen(candidate.p, camera, rect);
      const d2 = dist2(rawScreen, screen);
      const prev = bestByKind.get(candidate.kind);
      if (!prev || d2 < prev.d2) bestByKind.set(candidate.kind, { candidate, d2 });
    }

    const maxD2 = maxPx * maxPx;
    const pick = (kind: Exclude<PlanSnapKind, "none">) => {
      const value = bestByKind.get(kind);
      if (!value) return null;
      const limit = maxPx * (KIND_RADIUS_MULTIPLIER[kind] ?? 1);
      if (value.d2 > limit * limit) return null;
      return {
        point: value.candidate.p.clone(),
        kind,
        a: value.candidate.a?.clone() ?? null,
        b: value.candidate.b?.clone() ?? null,
        owner: value.candidate.owner
      };
    };

    const order =
      options?.kindPriority ?? DEFAULT_KIND_ORDER;

    const sticky = options?.sticky ?? null;
    const stickyThresholdPx = options?.stickyThresholdPx ?? Math.max(16, maxPx + 6);
    if (sticky && sticky.kind !== "none") {
      const stickyScreen = worldToScreen(sticky.point, camera, rect);
      if (dist2(rawScreen, stickyScreen) <= stickyThresholdPx * stickyThresholdPx) {
        return {
          point: sticky.point.clone(),
          kind: sticky.kind,
          a: sticky.a?.clone() ?? null,
          b: sticky.b?.clone() ?? null,
          owner: sticky.owner
        };
      }
    }

    if (options?.preferNearest) {
      let best: (PlanSnapResult & { d2: number; rank: number; score: number }) | null = null;
      for (let rank = 0; rank < order.length; rank += 1) {
        const kind = order[rank]!;
        const value = bestByKind.get(kind);
        if (!value) continue;
        const limit = maxPx * (KIND_RADIUS_MULTIPLIER[kind] ?? 1);
        if (value.d2 > limit * limit) continue;
        const hit = {
          point: value.candidate.p.clone(),
          kind,
          a: value.candidate.a?.clone() ?? null,
          b: value.candidate.b?.clone() ?? null,
          owner: value.candidate.owner,
          d2: value.d2,
          rank,
          score: value.d2 * (KIND_SCORE_MULTIPLIER[kind] ?? 1)
        };
        if (
          !best ||
          hit.score < best.score - 1e-6 ||
          (Math.abs(hit.score - best.score) <= 1e-6 && hit.rank < best.rank)
        ) {
          best = hit;
        }
      }
      if (best) {
        return {
          point: best.point,
          kind: best.kind,
          a: best.a ?? null,
          b: best.b ?? null,
          owner: best.owner
        };
      }
    }

    for (const kind of order) {
      const hit = pick(kind);
      if (hit) return hit;
    }
    return { point: raw, kind: "none" };
  };
}
