import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { getModulePlanPolygon } from "./planSnap";
import { buildModuleAlignCandidates, buildWallAlignCandidates, buildWorktopAlignCandidates, pickBestAlignLine } from "./alignTool";
import { distPointToSegment2 } from "./screenGeometry";
import { worldToScreen } from "./sharedUtils";
import type { AlignPickedLine, DoorInstance, KitchenWorktopInstance, LayoutInstance, PickedLine2D, WallInstance, WallParams, WindowInstance } from "./localTypes";
import { disposeObject3D } from "../core/dispose";
import { sanitizeKitchenWorktopPath, kitchenWorktopPointToWorld } from "../layout/worktopGeometry";
import { commitHistory } from "../layout/historyManager";
import { DEFAULT_WALL_MITER_LIMIT, solveWallNetwork } from "../walls2d/solver";
import type { AppState } from "../layout/appState";
import type { WallJustification } from "../walls2d/model";
import {
  fromMmPoint,
  joinExtensionM as computeJoinExtensionM,
  mmDist,
  pointOnWallAxisMm,
  toMmPoint,
  wallDirOutFromNode as wallDirOutFromNodeBase,
  wallEndpointWhich,
  wallExteriorSign
} from "./wallGeometryHelpers";

type WallPlanPoint = { x: number; z: number };
type PolygonRing = Array<[number, number]>;
type WallPlanPolygon = PolygonRing[];
export type WallPlanMultiPolygon = WallPlanPolygon[];

type PolygonClipper = {
  union: (...polygons: WallPlanMultiPolygon[]) => WallPlanMultiPolygon;
  difference: (subject: WallPlanMultiPolygon, ...clips: WallPlanMultiPolygon[]) => WallPlanMultiPolygon;
};
type WallMeshCutout = {
  centerLocalX: number;
  widthM: number;
  sillM: number;
  heightM: number;
};

const polygonClipper = polygonClipping as PolygonClipper;
export const WALL_PLAN_FILL_ROTATION_X = Math.PI / 2;
const WALL_CUTOUT_REVEAL_NAME = "wallWindowCutoutReveal";

type WallCutoutBounds = {
  holeX0: number;
  holeX1: number;
  holeY0: number;
  holeY1: number;
};

export type WallControllerContext = {
  walls: WallInstance[];
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  layoutRoot: THREE.Group;
  wallPlanGroup: THREE.Group;
  wallPlanMeshes: Map<string, THREE.Line>;
  wallJoinMeshes: THREE.Mesh[];
  wallDebugGroup: THREE.Group;
  wallSolvedOutlines: Map<string, WallPlanPoint[]>;
  wallDefault: {
    thicknessMm: number;
    heightMm: number;
    materialId: string;
    justification: WallJustification;
    exteriorSign: 1 | -1;
  };
  wallJoinTolMm: number;
  pinnedWallIds: Set<string>;
  S: AppState;
  cam: () => THREE.Camera;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
  getKitchenWorktopGuidePathForAlign: (
    params: KitchenWorktopInstance["params"],
    guide: "center" | "back" | "front"
  ) => THREE.Vector3[];
  moduleOverlapsWalls: (inst: LayoutInstance) => boolean;
  setUnderlayStatus: (text: string) => void;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  getViewMode: () => "2d" | "3d";
  getSelectedKind: () => string | null;
  getSelectedWallId: () => string | null;
  setSelectedWallId: (next: string | null) => void;
  getWallDebugEnabled: () => boolean;
  setWallSolvedJoinPolys: (next: WallPlanPoint[][]) => void;
  setWallUnionPolys: (next: WallPlanMultiPolygon | null) => void;
  getWindowInst?: () => WindowInstance | null;
  getWindowInsts?: () => WindowInstance[];
  getDoorInst?: () => DoorInstance | null;
  getDoorInsts?: () => DoorInstance[];
  nextWallId: () => string;
};

export function createWallController(ctx: WallControllerContext) {
  const walls = ctx.walls;
  const instances = ctx.instances;
  const kitchenWorktops = ctx.kitchenWorktops;
  const layoutRoot = ctx.layoutRoot;
  const wallPlanGroup = ctx.wallPlanGroup;
  const wallPlanMeshes = ctx.wallPlanMeshes;
  const wallJoinMeshes = ctx.wallJoinMeshes;
  const wallDebugGroup = ctx.wallDebugGroup;
  const wallSolvedOutlines = ctx.wallSolvedOutlines;
  const wallDefault = ctx.wallDefault;
  const wallJoinTolMm = ctx.wallJoinTolMm;
  const pinnedWallIds = ctx.pinnedWallIds;
  const S = ctx.S;
  const cam = ctx.cam;
  const getModuleLocalBackCenter = ctx.getModuleLocalBackCenter;
  const getKitchenWorktopGuidePathForAlign = ctx.getKitchenWorktopGuidePathForAlign;
  const moduleOverlapsWalls = ctx.moduleOverlapsWalls;
  const setUnderlayStatus = ctx.setUnderlayStatus;
  const showWallSnapMarkersFor = ctx.showWallSnapMarkersFor;
  const getWindowInsts = () => ctx.getWindowInsts?.() ?? (ctx.getWindowInst?.() ? [ctx.getWindowInst()!] : []);
  const getDoorInsts = () => ctx.getDoorInsts?.() ?? (ctx.getDoorInst?.() ? [ctx.getDoorInst()!] : []);

  const makeWallSolverInput = () =>
    walls.map((w) => ({
      id: w.id,
      a: { x: w.params.aMm.x / 1000, z: w.params.aMm.z / 1000 },
      b: { x: w.params.bMm.x / 1000, z: w.params.bMm.z / 1000 },
      thicknessM: Math.max(0.001, w.params.thicknessMm / 1000),
      justification: w.params.justification ?? "center",
      exteriorSign: ((w.params.exteriorSign ?? 1) as 1 | -1) ?? 1
    }));

  const solveWallsForRendering = () =>
    solveWallNetwork(makeWallSolverInput(), { nodeTolM: wallJoinTolMm / 1000, miterLimit: DEFAULT_WALL_MITER_LIMIT });

  const pickAlignLineAt = (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => {
    const candidates: AlignPickedLine[] = [];

    for (const w of walls) {
      const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      const just = w.params.justification ?? "center";
      const s = (w.params.exteriorSign ?? 1) as 1 | -1;
      const center = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
      const d = center.b.clone().sub(center.a);
      if (d.lengthSq() < 1e-10) continue;
      d.normalize();
      const n = new THREE.Vector3(-d.z, 0, d.x);
      const half = Math.max(10, w.params.thicknessMm) / 2000;
      const exteriorA = center.a.clone().addScaledVector(n, s * half);
      const exteriorB = center.b.clone().addScaledVector(n, s * half);
      const interiorA = center.a.clone().addScaledVector(n, -s * half);
      const interiorB = center.b.clone().addScaledVector(n, -s * half);
      candidates.push(
        ...buildWallAlignCandidates({
          wall: w,
          centerA: center.a,
          centerB: center.b,
          exteriorA,
          exteriorB,
          interiorA,
          interiorB
        })
      );
    }

    for (const inst of instances) {
      const polygon = getModulePlanPolygon(inst, getModuleLocalBackCenter);
      candidates.push(...buildModuleAlignCandidates(inst, polygon));
    }

    for (const worktop of kitchenWorktops) {
      const path = sanitizeKitchenWorktopPath(worktop.params.path);
      if (path.length < 2) continue;
      const rawPath = path.map(kitchenWorktopPointToWorld);
      const centerPath = getKitchenWorktopGuidePathForAlign(worktop.params, "center");
      const backPath = getKitchenWorktopGuidePathForAlign(worktop.params, "back");
      const frontPath = getKitchenWorktopGuidePathForAlign(worktop.params, "front");
      candidates.push(
        ...buildWorktopAlignCandidates({
          worktop,
          rawPath,
          centerPath,
          backPath,
          frontPath
        })
      );
    }

    return pickBestAlignLine(mousePx, rect, cam(), candidates, 12);
  };

  const lineLineIntersectionXZ = (p1: THREE.Vector3, d1: THREE.Vector3, p2: THREE.Vector3, d2: THREE.Vector3) => {
    const a1x = d1.x;
    const a1z = d1.z;
    const a2x = d2.x;
    const a2z = d2.z;
    const denom = a1x * a2z - a1z * a2x;
    if (Math.abs(denom) < 1e-9) return null as THREE.Vector3 | null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const t = (dx * a2z - dz * a2x) / denom;
    return new THREE.Vector3(p1.x + a1x * t, 0, p1.z + a1z * t);
  };

  const translateWallAndConnected = (w: WallInstance, dxMm: number, dzMm: number) => {
    const prev = new Map<string, WallParams>();
    for (const ww of walls) prev.set(ww.id, JSON.parse(JSON.stringify(ww.params)) as WallParams);

    const oldA = { x: w.params.aMm.x, z: w.params.aMm.z };
    const oldB = { x: w.params.bMm.x, z: w.params.bMm.z };

    w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
    w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };

    const touched = new Set<string>();
    touched.add(w.id);

    for (const other of walls) {
      if (other.id === w.id) continue;
      if (pinnedWallIds.has(other.id)) continue;
      const wa = wallEndpointWhich(other, oldA, wallJoinTolMm);
      if (wa) {
        if (wa === "a") other.params.aMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        else other.params.bMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        touched.add(other.id);
      }
      const wb = wallEndpointWhich(other, oldB, wallJoinTolMm);
      if (wb) {
        if (wb === "a") other.params.aMm = { x: oldB.x + dxMm, z: oldB.z + dzMm };
        else other.params.bMm = { x: oldB.x + dxMm, z: oldB.z + dzMm };
        touched.add(other.id);
      }
    }

    for (const id of touched) {
      const ww = walls.find((x) => x.id === id) ?? null;
      if (ww) rebuildWall(ww);
    }
    rebuildWallPlanMesh();

    if (instances.some((i) => moduleOverlapsWalls(i))) {
      for (const ww of walls) {
        const p = prev.get(ww.id);
        if (p) ww.params = JSON.parse(JSON.stringify(p)) as WallParams;
        rebuildWall(ww);
      }
      rebuildWallPlanMesh();
      setUnderlayStatus("Move blocked: wall would overlap a module.");
    }
  };

  const moveWallEndpointAndConnected = (w: WallInstance, which: "a" | "b", dxMm: number, dzMm: number) => {
    const prev = new Map<string, WallParams>();
    for (const ww of walls) prev.set(ww.id, JSON.parse(JSON.stringify(ww.params)) as WallParams);

    const oldP = which === "a" ? { x: w.params.aMm.x, z: w.params.aMm.z } : { x: w.params.bMm.x, z: w.params.bMm.z };
    const nextP = { x: oldP.x + dxMm, z: oldP.z + dzMm };

    const touched = new Set<string>();
    touched.add(w.id);
    if (which === "a") w.params.aMm = nextP;
    else w.params.bMm = nextP;

    for (const other of walls) {
      if (other.id === w.id) continue;
      if (pinnedWallIds.has(other.id)) continue;
      const ww = wallEndpointWhich(other, oldP, wallJoinTolMm);
      if (ww) {
        if (ww === "a") other.params.aMm = nextP;
        else other.params.bMm = nextP;
        touched.add(other.id);
      }
    }

    for (const id of touched) {
      const ww = walls.find((x) => x.id === id) ?? null;
      if (ww) rebuildWall(ww);
    }
    rebuildWallPlanMesh();

    if (instances.some((i) => moduleOverlapsWalls(i))) {
      for (const ww of walls) {
        const p = prev.get(ww.id);
        if (p) ww.params = JSON.parse(JSON.stringify(p)) as WallParams;
        rebuildWall(ww);
      }
      rebuildWallPlanMesh();
      setUnderlayStatus("Move blocked: wall would overlap a module.");
    }
  };

  function setWallEndpointMm(w: WallInstance, which: "a" | "b", p: { x: number; z: number }) {
    if (which === "a") w.params.aMm = { x: p.x, z: p.z };
    else w.params.bMm = { x: p.x, z: p.z };
    rebuildWall(w);
  }

  function wallDirOutFromNode(w: WallInstance, node: { x: number; z: number }) {
    return wallDirOutFromNodeBase(w, node, wallJoinTolMm);
  }

  function joinExtensionM(w: WallInstance, node: { x: number; z: number }) {
    return computeJoinExtensionM(w, node, walls, wallJoinTolMm);
  }

  function disposeMaterialValue(material: THREE.Material | THREE.Material[]) {
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material.dispose();
    }
  }

  function removeWall(w: WallInstance) {
    layoutRoot.remove(w.root);
    w.outline.geometry.dispose();
    (w.outline.material as THREE.Material).dispose();
    w.mesh.geometry.dispose();
    disposeMaterialValue(w.mesh.material as THREE.Material | THREE.Material[]);
    const idx = walls.indexOf(w);
    if (idx >= 0) walls.splice(idx, 1);
    if (ctx.getSelectedWallId() === w.id) ctx.setSelectedWallId(null);
    rebuildWallPlanMesh();
  }

  function splitWallAtMm(w: WallInstance, p: { x: number; z: number }) {
    const which = wallEndpointWhich(w, p, wallJoinTolMm);
    if (which) {
      setWallEndpointMm(w, which, p);
      return;
    }

    const { t, distMm } = pointOnWallAxisMm(w, p);
    if (distMm > wallJoinTolMm) return;
    if (t <= 0.001 || t >= 0.999) return;

    const a = fromMmPoint(w.params.aMm);
    const b = fromMmPoint(w.params.bMm);
    const mid = fromMmPoint(p);
    const thickness = w.params.thicknessMm;
    const materialId = w.params.materialId;

    removeWall(w);
    const w1 = addWall(a, mid, thickness);
    const w2 = addWall(mid, b, thickness);
    if (!w1 || !w2) {
      // rollback best-effort to keep the original wall
      if (w1) removeWall(w1);
      if (w2) removeWall(w2);
      const w0 = addWall(a, b, thickness);
      if (w0) w0.params.materialId = materialId;
      rebuildWallPlanMesh();
      return;
    }
    if (w1) w1.params.materialId = materialId;
    if (w2) w2.params.materialId = materialId;
    rebuildWallPlanMesh();
  }

  function autoJoinAtMmPoint(p: { x: number; z: number }) {
    // Snap endpoints and split any wall that crosses the point (T-joins).
    for (const w of [...walls]) {
      const which = wallEndpointWhich(w, p, wallJoinTolMm);
      if (which) setWallEndpointMm(w, which, p);
      else splitWallAtMm(w, p);
    }
    // Rebuild after edits so joins update.
    for (const w of walls) rebuildWall(w);
    rebuildWallPlanMesh();
  }

  function pickWallLine2D(raw: THREE.Vector3, rect: DOMRect, camera: THREE.Camera, maxPx = 14): PickedLine2D | null {
    const rawS = worldToScreen(raw, camera, rect);
    let best: { pick: PickedLine2D; d2: number } | null = null;

    const consider = (p: PickedLine2D) => {
      const aS = worldToScreen(p.a, camera, rect);
      const bS = worldToScreen(p.b, camera, rect);
      const { d2, t } = distPointToSegment2(rawS, aS, bS);
      if (d2 > maxPx * maxPx) return;
      if (!best || d2 < best.d2) {
        const dir = p.b.clone().sub(p.a);
        if (dir.lengthSq() < 1e-10) return;
        dir.normalize();
        // closest point on the actual world segment (linear in XZ)
        const closest = p.a.clone().lerp(p.b, t);
        best = { pick: { ...p, p: closest, dir }, d2 };
      }
    };

    for (const w of walls) {
      // centerline (derived)
      const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
      const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
      const just = w.params.justification ?? "center";
      const s = (w.params.exteriorSign ?? 1) as 1 | -1;
      const c = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
      consider({
        wallId: w.id,
        kind: "center",
        a: c.a,
        b: c.b,
        p: c.a,
        dir: new THREE.Vector3(1, 0, 0),
        label: "Centerline"
      });

      // solved outline edges (faces + ends)
      const poly = wallSolvedOutlines.get(w.id) ?? null;
      if (!poly || poly.length < 4) continue;
      const pts = poly.map((p) => new THREE.Vector3(p.x, 0, p.z));
      const edges: Array<{ a: THREE.Vector3; b: THREE.Vector3; kind: "face" | "end"; label: string }> = [
        { a: pts[0], b: pts[1], kind: "end", label: "End" },
        { a: pts[1], b: pts[2], kind: "face", label: "Face" },
        { a: pts[2], b: pts[3], kind: "end", label: "End" },
        { a: pts[3], b: pts[0], kind: "face", label: "Face" }
      ];
      for (const e of edges) {
        consider({
          wallId: w.id,
          kind: e.kind,
          a: e.a,
          b: e.b,
          p: e.a,
          dir: new THREE.Vector3(1, 0, 0),
          label: e.label
        });
      }
    }

    return (best as { pick: PickedLine2D; d2: number } | null)?.pick ?? null;
  }

  function cross2XZ(a: THREE.Vector3, b: THREE.Vector3) {
    return a.x * b.z - a.z * b.x;
  }

  function intersectLinesXZ(
    p: THREE.Vector3,
    r: THREE.Vector3,
    q: THREE.Vector3,
    s: THREE.Vector3
  ): THREE.Vector3 | null {
    const rxs = cross2XZ(r, s);
    if (Math.abs(rxs) < 1e-8) return null;
    const qp = q.clone().sub(p);
    const t = cross2XZ(qp, s) / rxs;
    return new THREE.Vector3(p.x + r.x * t, 0, p.z + r.z * t);
  }

  function bestNeighborAtNode(w: WallInstance, node: { x: number; z: number }) {
    let best: { n: WallInstance; u: THREE.Vector3; theta: number } | null = null;
    const v0 = wallDirOutFromNode(w, node);
    if (v0.lengthSq() < 1e-8) return null;
    v0.normalize();

    for (const other of walls) {
      if (other.id === w.id) continue;
      const isAt =
        mmDist(other.params.aMm, node) <= wallJoinTolMm || mmDist(other.params.bMm, node) <= wallJoinTolMm;
      if (!isAt) continue;
      const u = wallDirOutFromNode(other, node);
      if (u.lengthSq() < 1e-8) continue;
      u.normalize();
      const dot = Math.max(-1, Math.min(1, v0.dot(u)));
      const theta = Math.acos(dot);
      if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
      if (!best || theta < best.theta) best = { n: other, u, theta };
    }

    return best;
  }

  function miterEndCorners(
    w: WallInstance,
    which: "a" | "b"
  ): { outer: THREE.Vector3; inner: THREE.Vector3 } {
    const nodeMm = which === "a" ? w.params.aMm : w.params.bMm;
    const otherMm = which === "a" ? w.params.bMm : w.params.aMm;
    const p = fromMmPoint(nodeMm);
    const q = fromMmPoint(otherMm);

    const v = q.clone().sub(p);
    if (v.lengthSq() < 1e-8) {
      const n0 = new THREE.Vector3(0, 0, 1);
      const h0 = Math.max(1, w.params.thicknessMm / 2) / 1000;
      const s0 = wallExteriorSign(w);
      return {
        outer: p.clone().addScaledVector(n0, s0 * h0),
        inner: p.clone().addScaledVector(n0, -s0 * h0)
      };
    }
    v.normalize();
    const n0 = new THREE.Vector3(-v.z, 0, v.x).normalize();
    const h0 = Math.max(1, w.params.thicknessMm / 2) / 1000;
    const s0 = wallExteriorSign(w);

    const nb = bestNeighborAtNode(w, nodeMm);
    if (!nb) {
      return {
        outer: p.clone().addScaledVector(n0, s0 * h0),
        inner: p.clone().addScaledVector(n0, -s0 * h0)
      };
    }

    const u = nb.u.clone().normalize();
    const n1 = new THREE.Vector3(-u.z, 0, u.x).normalize();
    const h1 = Math.max(1, nb.n.params.thicknessMm / 2) / 1000;
    const s1 = wallExteriorSign(nb.n);

    // Miter corners are intersections of corresponding faces (outer-outer, inner-inner).
    const outer0 = p.clone().addScaledVector(n0, s0 * h0);
    const inner0 = p.clone().addScaledVector(n0, -s0 * h0);
    const outer1 = p.clone().addScaledVector(n1, s1 * h1);
    const inner1 = p.clone().addScaledVector(n1, -s1 * h1);

    const out = intersectLinesXZ(outer0, v, outer1, u) ?? outer0;
    const inn = intersectLinesXZ(inner0, v, inner1, u) ?? inner0;
    return { outer: out, inner: inn };
  }

  function configureWallBodyMaterial(material: THREE.MeshBasicMaterial) {
    material.color.setHex(0xb8c0cb);
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
  }

  function configureWallRevealMaterial(material: THREE.MeshBasicMaterial) {
    material.color.setHex(0xffffff);
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
  }

  function createWallBodyMaterial() {
    const material = new THREE.MeshBasicMaterial();
    configureWallBodyMaterial(material);
    return material;
  }

  function createWallRevealMaterial() {
    const material = new THREE.MeshBasicMaterial();
    configureWallRevealMaterial(material);
    return material;
  }

  function syncWallMeshMaterials(mesh: THREE.Mesh, hasCutoutReveal: boolean) {
    const current = mesh.material as THREE.Material | THREE.Material[];
    if (hasCutoutReveal) {
      if (Array.isArray(current)) {
        const body = current[0] instanceof THREE.MeshBasicMaterial ? current[0] : createWallBodyMaterial();
        const reveal = current[1] instanceof THREE.MeshBasicMaterial ? current[1] : createWallRevealMaterial();
        if (current[0] && current[0] !== body) current[0].dispose();
        if (current[1] && current[1] !== reveal) current[1].dispose();
        for (const extra of current.slice(2)) extra.dispose();
        configureWallBodyMaterial(body);
        configureWallRevealMaterial(reveal);
        mesh.material = [body, reveal];
      } else {
        const body = current instanceof THREE.MeshBasicMaterial ? current : createWallBodyMaterial();
        if (current !== body) current.dispose();
        configureWallBodyMaterial(body);
        mesh.material = [body, createWallRevealMaterial()];
      }
      return;
    }

    if (Array.isArray(current)) {
      const body = current[0] instanceof THREE.MeshBasicMaterial ? current[0] : createWallBodyMaterial();
      if (current[0] && current[0] !== body) current[0].dispose();
      for (const extra of current.slice(1)) extra.dispose();
      configureWallBodyMaterial(body);
      mesh.material = body;
      return;
    }

    if (current instanceof THREE.MeshBasicMaterial) {
      configureWallBodyMaterial(current);
      return;
    }

    current.dispose();
    mesh.material = createWallBodyMaterial();
  }

  function getWallCutoutBounds(len: number, h: number, cutout: WallMeshCutout): WallCutoutBounds | null {
    const xMin = -len / 2;
    const xMax = len / 2;
    const yMin = -h / 2;
    const yMax = h / 2;
    const eps = 0.001;

    const holeX0 = Math.max(xMin + eps, cutout.centerLocalX - cutout.widthM / 2);
    const holeX1 = Math.min(xMax - eps, cutout.centerLocalX + cutout.widthM / 2);
    const holeY0 = Math.max(yMin + eps, cutout.sillM - h / 2);
    const holeY1 = Math.min(yMax - eps, cutout.sillM + cutout.heightM - h / 2);
    if (holeX1 - holeX0 <= eps || holeY1 - holeY0 <= eps) {
      return null;
    }

    return { holeX0, holeX1, holeY0, holeY1 };
  }

  function getWallCutoutBoundsList(len: number, h: number, cutouts: WallMeshCutout[] = []) {
    return cutouts
      .map((cutout) => getWallCutoutBounds(len, h, cutout))
      .filter((bounds): bounds is WallCutoutBounds => !!bounds);
  }

  function isCutoutOutlinePoint(point: THREE.Vector3, bounds: WallCutoutBounds, eps = 0.003) {
    const near = (value: number, target: number) => Math.abs(value - target) <= eps;
    const within = (value: number, min: number, max: number) => value >= min - eps && value <= max + eps;
    return (
      ((near(point.x, bounds.holeX0) || near(point.x, bounds.holeX1)) && within(point.y, bounds.holeY0, bounds.holeY1)) ||
      ((near(point.y, bounds.holeY0) || near(point.y, bounds.holeY1)) && within(point.x, bounds.holeX0, bounds.holeX1))
    );
  }

  function makeWallEdgeGeometry(geometry: THREE.BufferGeometry, boundsList: WallCutoutBounds[]) {
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
    if (boundsList.length === 0) return edgeGeometry;

    const position = edgeGeometry.getAttribute("position");
    const points: THREE.Vector3[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let index = 0; index + 1 < position.count; index += 2) {
      a.fromBufferAttribute(position, index);
      b.fromBufferAttribute(position, index + 1);
      const isCutoutEdge = boundsList.some((bounds) => isCutoutOutlinePoint(a, bounds) && isCutoutOutlinePoint(b, bounds));
      if (isCutoutEdge) continue;
      points.push(a.clone(), b.clone());
    }
    edgeGeometry.dispose();
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  function applyCutoutRevealMaterialGroups(geometry: THREE.BufferGeometry, boundsList: WallCutoutBounds[]) {
    const position = geometry.getAttribute("position");
    if (!position || boundsList.length === 0) return;

    const index = geometry.getIndex();
    const triCount = Math.floor((index ? index.count : position.count) / 3);
    if (triCount <= 0) return;

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const eps = 0.0025;
    const within = (value: number, min: number, max: number) => value >= min - eps && value <= max + eps;
    const near = (value: number, target: number) => Math.abs(value - target) <= eps;

    const setVertex = (target: THREE.Vector3, vertexIndex: number) => {
      const srcIndex = index ? index.getX(vertexIndex) : vertexIndex;
      target.set(position.getX(srcIndex), position.getY(srcIndex), position.getZ(srcIndex));
    };

    const isRevealTriangle = (bounds: WallCutoutBounds) => {
      const onVerticalReveal =
        (near(centroid.x, bounds.holeX0) || near(centroid.x, bounds.holeX1)) &&
        within(centroid.y, bounds.holeY0, bounds.holeY1);
      const onHorizontalReveal =
        (near(centroid.y, bounds.holeY0) || near(centroid.y, bounds.holeY1)) &&
        within(centroid.x, bounds.holeX0, bounds.holeX1);
      return onVerticalReveal || onHorizontalReveal;
    };

    const materialIndexForTriangle = (triIndex: number) => {
      setVertex(a, triIndex * 3);
      setVertex(b, triIndex * 3 + 1);
      setVertex(c, triIndex * 3 + 2);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      normal.crossVectors(ab, ac).normalize();
      if (Math.abs(normal.z) > 0.35) return 0;

      centroid.set((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
      return boundsList.some(isRevealTriangle) ? 1 : 0;
    };

    geometry.clearGroups();
    let groupStart = 0;
    let groupMaterial = materialIndexForTriangle(0);
    for (let tri = 1; tri < triCount; tri += 1) {
      const materialIndex = materialIndexForTriangle(tri);
      if (materialIndex === groupMaterial) continue;
      geometry.addGroup(groupStart * 3, (tri - groupStart) * 3, groupMaterial);
      groupStart = tri;
      groupMaterial = materialIndex;
    }
    geometry.addGroup(groupStart * 3, (triCount - groupStart) * 3, groupMaterial);
  }

  function makeWallBoxGeometry(len: number, h: number, thickM: number, cutouts: WallMeshCutout[] = []) {
    const boundsList = getWallCutoutBoundsList(len, h, cutouts);
    if (boundsList.length === 0) {
      return new THREE.BoxGeometry(len, h, thickM);
    }

    const xMin = -len / 2;
    const xMax = len / 2;
    const yMin = -h / 2;
    const yMax = h / 2;

    const shape = new THREE.Shape();
    shape.moveTo(xMin, yMin);
    shape.lineTo(xMax, yMin);
    shape.lineTo(xMax, yMax);
    shape.lineTo(xMin, yMax);
    shape.lineTo(xMin, yMin);

    for (const { holeX0, holeX1, holeY0, holeY1 } of boundsList) {
      const hole = new THREE.Path();
      hole.moveTo(holeX0, holeY0);
      hole.lineTo(holeX0, holeY1);
      hole.lineTo(holeX1, holeY1);
      hole.lineTo(holeX1, holeY0);
      hole.lineTo(holeX0, holeY0);
      shape.holes.push(hole);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickM,
      bevelEnabled: false,
      steps: 1
    });
    geometry.translate(0, 0, -thickM / 2);
    applyCutoutRevealMaterialGroups(geometry, boundsList);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function makeWallPrismGeometryFromOutline(
    outline: Array<{ x: number; z: number }>,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    heightM: number
  ) {
    const d = dir.clone();
    if (d.lengthSq() < 1e-8 || outline.length < 3) return null;
    d.normalize();
    const left = new THREE.Vector3(-d.z, 0, d.x);
    const contour = outline.map((point) => {
      const dx = point.x - origin.x;
      const dz = point.z - origin.z;
      return new THREE.Vector2(dx * d.x + dz * d.z, dx * left.x + dz * left.z);
    });

    const filtered: THREE.Vector2[] = [];
    for (const point of contour) {
      const prev = filtered[filtered.length - 1];
      if (prev && prev.distanceToSquared(point) < 1e-10) continue;
      filtered.push(point);
    }
    if (filtered.length > 2 && filtered[0].distanceToSquared(filtered[filtered.length - 1]) < 1e-10) filtered.pop();
    if (filtered.length < 3) return null;

    let area = 0;
    for (let i = 0; i < filtered.length; i += 1) {
      const a = filtered[i];
      const b = filtered[(i + 1) % filtered.length];
      area += a.x * b.y - b.x * a.y;
    }
    if (area < 0) filtered.reverse();

    const triangles = THREE.ShapeUtils.triangulateShape(filtered, []);
    if (triangles.length === 0) return null;

    const halfH = Math.max(0.001, heightM) / 2;
    const vertices: number[] = [];
    for (const point of filtered) vertices.push(point.x, -halfH, point.y);
    for (const point of filtered) vertices.push(point.x, halfH, point.y);

    const n = filtered.length;
    const indices: number[] = [];
    for (const tri of triangles) {
      const [a, b, c] = tri;
      indices.push(a, b, c);
      indices.push(n + c, n + b, n + a);
    }
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      indices.push(i, j, n + j, i, n + j, n + i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function removeWallCutoutReveal(mesh: THREE.Mesh) {
    for (const child of [...mesh.children]) {
      if (child.name !== WALL_CUTOUT_REVEAL_NAME) continue;
      mesh.remove(child);
      child.traverse((object) => {
        if ("geometry" in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
        if ("material" in object) {
          const material = object.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) for (const item of material) item.dispose();
          else material?.dispose();
        }
      });
    }
  }

  function updateWallMesh(
    mesh: THREE.Mesh,
    a: THREE.Vector3 | null,
    b: THREE.Vector3 | null,
    thicknessMm: number,
    heightMm = wallDefault.heightMm,
    cutouts: WallMeshCutout | WallMeshCutout[] = [],
    syncMaterials = false
  ) {
    const aa = a ?? new THREE.Vector3(0, 0, 0);
    const bb = b ?? aa.clone();
    const dx = bb.x - aa.x;
    const dz = bb.z - aa.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const midX = (aa.x + bb.x) / 2;
    const midZ = (aa.z + bb.z) / 2;
    const rotY = -Math.atan2(dz, dx);

    const thickM = Math.max(0.01, thicknessMm / 1000);
    const h = Math.max(1, heightMm) / 1000;
    const cutoutList = Array.isArray(cutouts) ? cutouts : [cutouts];
    const cutoutBounds = getWallCutoutBoundsList(len, h, cutoutList);

    removeWallCutoutReveal(mesh);
    if (syncMaterials) syncWallMeshMaterials(mesh, cutoutBounds.length > 0);
    mesh.geometry.dispose();
    mesh.geometry = makeWallBoxGeometry(len, h, thickM, cutoutList);
    mesh.position.set(midX, h / 2, midZ);
    mesh.rotation.set(0, rotY, 0);
    mesh.userData.viewDisplaySkipEdges = ctx.getViewMode() === "2d";
    mesh.userData.wallCutoutBounds = cutoutBounds.map((bounds) => ({ ...bounds }));
  }

  function updateWallMeshFromSolvedOutline(
    mesh: THREE.Mesh,
    outline: Array<{ x: number; z: number }>,
    a: THREE.Vector3,
    b: THREE.Vector3,
    heightMm = wallDefault.heightMm,
    syncMaterials = false
  ) {
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) {
      updateWallMesh(mesh, a, b, wallDefault.thicknessMm, heightMm, [], syncMaterials);
      return false;
    }

    const h = Math.max(1, heightMm) / 1000;
    const origin = a.clone().add(b).multiplyScalar(0.5);
    const geometry = makeWallPrismGeometryFromOutline(outline, origin, d, h);
    if (!geometry) return false;

    removeWallCutoutReveal(mesh);
    if (syncMaterials) syncWallMeshMaterials(mesh, false);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    mesh.position.set(origin.x, h / 2, origin.z);
    mesh.rotation.set(0, -Math.atan2(d.z, d.x), 0);
    mesh.userData.viewDisplaySkipEdges = ctx.getViewMode() === "2d";
    mesh.userData.wallCutoutBounds = [];
    return true;
  }

  function rebuildWallPlanMesh() {
    for (const [, line] of wallPlanMeshes) {
      wallPlanGroup.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    wallPlanMeshes.clear();
    for (const m of wallJoinMeshes.splice(0, wallJoinMeshes.length)) {
      wallPlanGroup.remove(m);
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        for (const material of m.material) material.dispose();
      } else {
        m.material.dispose();
      }
    }

    if (walls.length === 0) return;

    const solved = solveWallsForRendering();
    wallSolvedOutlines.clear();
    ctx.setWallSolvedJoinPolys(solved.joinPolys.map((poly) => poly.map((point) => ({ x: point.x, z: point.z }))));
    ctx.setWallUnionPolys(null);

    // Always keep per-wall solved outlines for hit-testing/export/debug.
    for (const w of solved.walls) wallSolvedOutlines.set(w.id, w.outline);
    if (ctx.getSelectedKind() === "wall" && ctx.getSelectedWallId()) showWallSnapMarkersFor(ctx.getSelectedWallId());

    // Render as a single union polygon to automatically trim overlaps/spikes at joins (CAD-like).
    const toRing = (poly: Array<{ x: number; z: number }>) => {
      const ring: Array<[number, number]> = poly.map((p) => [p.x, p.z]);
      if (ring.length > 0) ring.push(ring[0]);
      // Ensure CCW winding
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        area += x0 * y1 - x1 * y0;
      }
      if (area < 0) ring.reverse();
      return ring;
    };

    const makeWallOpeningClips = () => {
      const clips: Array<{
        kind: "window" | "door";
        center: THREE.Vector3;
        dir: THREE.Vector3;
        normal: THREE.Vector3;
        halfW: number;
        halfT: number;
        faceHalfT: number;
        corners: Array<{ x: number; z: number }>;
      }> = [];

      const addClip = (kind: "window" | "door", wallId: string | null, centerMm: number, widthMm: number) => {
        if (!wallId) return;
        const wall = walls.find((item) => item.id === wallId) ?? null;
        if (!wall) return;

        const refA = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
        const refB = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
        const dir = refB.clone().sub(refA);
        const lengthM = dir.length();
        if (lengthM < 0.001) return;
        dir.multiplyScalar(1 / lengthM);

        const leftNormal = new THREE.Vector3(-dir.z, 0, dir.x);
        const exteriorSign = (wall.params.exteriorSign ?? 1) as 1 | -1;
        const thicknessM = Math.max(0.01, wall.params.thicknessMm / 1000);
        const half = thicknessM / 2;
        const justification = wall.params.justification ?? "center";
        const centerOffset =
          justification === "center"
            ? 0
            : justification === "exterior"
              ? -exteriorSign * half
              : exteriorSign * half;

        const center = refA
          .clone()
          .addScaledVector(leftNormal, centerOffset)
          .addScaledVector(dir, centerMm / 1000);
        const halfW = Math.max(0.001, widthMm / 2000);
        const halfT = half + 0.006;
        const corners = [
          center.clone().addScaledVector(dir, -halfW).addScaledVector(leftNormal, -halfT),
          center.clone().addScaledVector(dir, halfW).addScaledVector(leftNormal, -halfT),
          center.clone().addScaledVector(dir, halfW).addScaledVector(leftNormal, halfT),
          center.clone().addScaledVector(dir, -halfW).addScaledVector(leftNormal, halfT)
        ].map((point) => ({ x: point.x, z: point.z }));

        clips.push({ kind, center, dir, normal: leftNormal, halfW, halfT, faceHalfT: half, corners });
      };

      for (const windowInst of getWindowInsts()) {
        addClip("window", windowInst.params.wallId ?? null, windowInst.params.centerMm, windowInst.params.widthMm);
      }
      for (const doorInst of getDoorInsts()) {
        addClip("door", doorInst.params.wallId ?? null, doorInst.params.centerMm, doorInst.params.widthMm);
      }

      return clips;
    };

    const polys: WallPlanMultiPolygon[] = [];
    for (const w of solved.walls) {
      if (w.outline.length < 3) continue;
      polys.push([[toRing(w.outline)]]);
    }
    for (const p of solved.joinPolys) {
      if (p.length < 3) continue;
      polys.push([[toRing(p)]]);
    }

    let merged: WallPlanMultiPolygon | null = null;
    try {
      merged = polygonClipper.union(...polys);
    } catch {
      merged = null;
    }

    const fallbackFillSource: WallPlanPolygon[] = [
      ...solved.walls.filter((w) => w.outline.length >= 3).map((w) => [toRing(w.outline)]),
      ...solved.joinPolys.filter((p) => p.length >= 3).map((p) => [toRing(p)])
    ];
    let fillSource = merged && merged.length > 0 ? merged : fallbackFillSource;
    const windowOpeningClips = makeWallOpeningClips();
    const windowOpeningPolys: WallPlanMultiPolygon[] = windowOpeningClips.map((clip) => [[toRing(clip.corners)]]);
    if (windowOpeningPolys.length > 0) {
      try {
        fillSource = polygonClipper.difference(fillSource, ...windowOpeningPolys);
      } catch {
        fillSource = merged && merged.length > 0 ? merged : fallbackFillSource;
      }
    }

    if (fillSource.length > 0) ctx.setWallUnionPolys(fillSource);

    const isWindowOpeningOutlineSegment = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const isSegmentForClip = (clip: (typeof windowOpeningClips)[number]) => {
        const toLocal = (point: { x: number; z: number }) => {
          const dx = point.x - clip.center.x;
          const dz = point.z - clip.center.z;
          return {
            along: dx * clip.dir.x + dz * clip.dir.z,
            across: dx * clip.normal.x + dz * clip.normal.z
          };
        };
        const la = toLocal(a);
        const lb = toLocal(b);
        const mid = { along: (la.along + lb.along) / 2, across: (la.across + lb.across) / 2 };
        const eps = 0.018;
        const insideAlong = mid.along >= -clip.halfW - eps && mid.along <= clip.halfW + eps;
        const insideAcross = mid.across >= -clip.halfT - eps && mid.across <= clip.halfT + eps;
        if (!insideAlong || !insideAcross) return false;
        const onLongOpeningEdge = Math.abs(Math.abs(mid.across) - clip.halfT) <= eps;
        const onEndOpeningEdge = Math.abs(Math.abs(mid.along) - clip.halfW) <= eps;
        return onLongOpeningEdge || onEndOpeningEdge;
      };
      return windowOpeningClips.some(isSegmentForClip);
    };

    const makePlanPolyline = (pts: Array<{ x: number; z: number }>, color: number, y = 0.02) => {
      if (pts.length < 2) return null;
      const linePts: THREE.Vector3[] = [];
      const count = pts.length >= 3 ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b || isWindowOpeningOutlineSegment(a, b)) continue;
        linePts.push(new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z));
      }
      if (linePts.length < 2) return null;
      const geom = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
      );
    };

    const makePlanFillMesh = (rings: Array<Array<[number, number]>>, y = 0.01) => {
      if (!rings || rings.length === 0) return null;

      const toVec2Ring = (ring: Array<[number, number]>) => {
        const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
        return pts.map(([x, z]) => new THREE.Vector2(x, z));
      };

      const outer = toVec2Ring(rings[0]);
      if (outer.length < 3) return null;

      const shape = new THREE.Shape(outer);
      for (const holeRing of rings.slice(1)) {
        const hole = toVec2Ring(holeRing);
        if (hole.length < 3) continue;
        shape.holes.push(new THREE.Path(hole));
      }

      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({
          color: 0xb8c0cb,
          transparent: false,
          opacity: 1,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.rotation.x = WALL_PLAN_FILL_ROTATION_X;
      mesh.position.y = y;
      mesh.renderOrder = 6;
      return mesh;
    };

    for (const rings of fillSource) {
      const mesh = makePlanFillMesh(rings);
      if (!mesh) continue;
      mesh.name = "wallPlanFill";
      mesh.userData.viewDisplaySkipEdges = true;
      wallJoinMeshes.push(mesh);
      wallPlanGroup.add(mesh);
    }

    let unionLineIndex = 0;
    for (const rings of fillSource) {
      for (const ring of rings) {
        const pts = (ring.length > 1 ? ring.slice(0, -1) : ring).map(([x, z]) => ({ x, z }));
        const line = makePlanPolyline(pts, 0x4f4f4f);
        if (!line) continue;
        line.name = `wallPlan_union_${unionLineIndex}`;
        line.userData.kind = "wallPlanUnion";
        line.renderOrder = 20;
        wallPlanMeshes.set(line.name, line);
        wallPlanGroup.add(line);
        unionLineIndex += 1;
      }
    }

    for (let index = 0; index < windowOpeningClips.length; index += 1) {
      const windowOpeningClip = windowOpeningClips[index];
      if (windowOpeningClip.kind !== "window") continue;
      const faceHalfT = windowOpeningClip.faceHalfT;
      const startInner = windowOpeningClip.center
        .clone()
        .addScaledVector(windowOpeningClip.dir, -windowOpeningClip.halfW)
        .addScaledVector(windowOpeningClip.normal, -faceHalfT);
      const endInner = windowOpeningClip.center
        .clone()
        .addScaledVector(windowOpeningClip.dir, windowOpeningClip.halfW)
        .addScaledVector(windowOpeningClip.normal, -faceHalfT);
      const startOuter = windowOpeningClip.center
        .clone()
        .addScaledVector(windowOpeningClip.dir, -windowOpeningClip.halfW)
        .addScaledVector(windowOpeningClip.normal, faceHalfT);
      const endOuter = windowOpeningClip.center
        .clone()
        .addScaledVector(windowOpeningClip.dir, windowOpeningClip.halfW)
        .addScaledVector(windowOpeningClip.normal, faceHalfT);
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(startInner.x, 0.023, startInner.z),
        new THREE.Vector3(endInner.x, 0.023, endInner.z),
        new THREE.Vector3(startOuter.x, 0.023, startOuter.z),
        new THREE.Vector3(endOuter.x, 0.023, endOuter.z)
      ]);
      const line = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({
          color: 0x4f4f4f,
          transparent: true,
          opacity: 0.98,
          depthTest: false,
          depthWrite: false
        })
      );
      line.name = index === 0 ? "wallPlan_window_parapet" : `wallPlan_window_parapet_${index}`;
      line.userData.kind = "wallPlanWindowParapet";
      line.userData.viewDisplaySkipEdges = true;
      line.renderOrder = 24;
      wallPlanMeshes.set(line.name, line);
      wallPlanGroup.add(line);
    }

    // Debug overlays
    wallDebugGroup.visible = ctx.getWallDebugEnabled();
    if (ctx.getWallDebugEnabled()) {
      while (wallDebugGroup.children.length > 0) {
        const c = wallDebugGroup.children.pop()!;
        wallDebugGroup.remove(c);
        if ("geometry" in c && c.geometry instanceof THREE.BufferGeometry) c.geometry.dispose();
        if ("material" in c) {
          const material = c.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) for (const mat of material) mat.dispose();
          else material?.dispose();
        }
      }

      const mkLine = (pts: Array<{ x: number; z: number }>, color: number, y = 0.031) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, p.z)));
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
        const l = new THREE.Line(g, m);
        wallDebugGroup.add(l);
      };

      // centerlines + outlines
      for (const w of makeWallSolverInput()) {
        mkLine([w.a, w.b], 0xffd166, 0.031);
        const poly = wallSolvedOutlines.get(w.id);
        if (poly && poly.length >= 3) {
          mkLine([...poly, poly[0]], 0x5c8cff, 0.032);
        }
      }

      // node markers
      for (const n of solved.debug.nodes) {
        const g = new THREE.PlaneGeometry(0.04, 0.04);
        const m = new THREE.MeshBasicMaterial({ color: 0xff4dff, depthWrite: false });
        const p = new THREE.Mesh(g, m);
        p.rotation.x = -Math.PI / 2;
        p.position.set(n.p.x, 0.033, n.p.z);
        wallDebugGroup.add(p);
      }
    }
  }

  function createWallMesh(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number, heightMm = wallDefault.heightMm) {
    const mat = createWallBodyMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, Math.max(1, heightMm) / 1000, thicknessMm / 1000), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    updateWallMeshWithJustification(
      mesh,
      a,
      b,
      thicknessMm,
      wallDefault.justification,
      wallDefault.exteriorSign,
      heightMm
    );
    return mesh;
  }

  function createWallOutline(geometry: THREE.BufferGeometry, wallId?: string, cutoutBounds: WallCutoutBounds[] = []) {
    const outline = new THREE.LineSegments(
      makeWallEdgeGeometry(geometry, cutoutBounds),
      new THREE.LineBasicMaterial({
        color: 0x4f5663,
        transparent: true,
        opacity: 0.78,
        depthTest: true,
        depthWrite: false
      })
    );
    outline.renderOrder = 12;
    if (wallId) {
      outline.name = `wallOutline_${wallId}`;
      outline.userData.kind = "wallOutline";
      outline.userData.wallId = wallId;
    }
    return outline;
  }

  function syncWallOutline(w: WallInstance) {
    const cutoutBounds = Array.isArray(w.mesh.userData.wallCutoutBounds) ? w.mesh.userData.wallCutoutBounds : [];
    if (!w.outline || !w.outline.parent) {
      w.outline = createWallOutline(w.mesh.geometry as THREE.BufferGeometry, w.id, cutoutBounds);
      w.mesh.add(w.outline);
    }
    const nextGeometry = makeWallEdgeGeometry(w.mesh.geometry as THREE.BufferGeometry, cutoutBounds);
    w.outline.geometry.dispose();
    w.outline.geometry = nextGeometry;
    w.outline.visible = ctx.getViewMode() === "3d";

    const outlineMaterial = w.outline.material as THREE.LineBasicMaterial;
    outlineMaterial.opacity = ctx.getViewMode() === "3d" ? 0.78 : 0;
  }

  function wallRefLineToCenterLine(
    refA: THREE.Vector3,
    refB: THREE.Vector3,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1
  ) {
    if (justification === "center") return { a: refA.clone(), b: refB.clone() };
    const d = refB.clone().sub(refA);
    const len = d.length();
    if (len < 1e-8) return { a: refA.clone(), b: refB.clone() };
    d.multiplyScalar(1 / len);
    const n = new THREE.Vector3(-d.z, 0, d.x);
    const half = Math.max(10, thicknessMm) / 2000; // meters
    const s = exteriorSign;
    const offset =
      justification === "exterior"
        ? n.clone().multiplyScalar(-s * half)
        : n.clone().multiplyScalar(s * half); // interior
    return { a: refA.clone().add(offset), b: refB.clone().add(offset) };
  }

  function updateWallMeshWithJustification(
    mesh: THREE.Mesh,
    refA: THREE.Vector3 | null,
    refB: THREE.Vector3 | null,
    thicknessMm: number,
    justification: "center" | "interior" | "exterior",
    exteriorSign: 1 | -1,
    heightMm = wallDefault.heightMm
  ) {
    const a = refA ?? new THREE.Vector3(0, 0, 0);
    const b = refB ?? a.clone();
    const center = wallRefLineToCenterLine(a, b, thicknessMm, justification, exteriorSign);
    updateWallMesh(mesh, center.a, center.b, thicknessMm, heightMm);
  }

  function makeWallPreviewMesh(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) {
    const mesh = createWallMesh(a, b, thicknessMm);
    const m = mesh.material as THREE.MeshBasicMaterial;
    m.transparent = true;
    m.opacity = 0.5;
    return mesh;
  }

  function rebuildWall(w: WallInstance) {
    w.params.heightMm = Math.max(1, Math.round(w.params.heightMm ?? w.heightMm ?? wallDefault.heightMm));
    w.heightMm = w.params.heightMm;

    const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
    const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
    const just = w.params.justification ?? "center";
    const s = (w.params.exteriorSign ?? 1) as 1 | -1;
    const { a, b } = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
    const solvedOutline = solveWallsForRendering().walls.find((wall) => wall.id === w.id)?.outline ?? null;
    if (solvedOutline) wallSolvedOutlines.set(w.id, solvedOutline);
    // Revit-like join rendering in 3D: use the solved wall footprint for clean corner joins.
    // This does not change stored axis endpoints (aMm/bMm); only the rendered mesh.
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) {
      updateWallMesh(w.mesh, a, b, w.params.thicknessMm, w.params.heightMm, [], true);
      syncWallOutline(w);
      return;
    }
    d.normalize();

    const aMmC = toMmPoint(a);
    const bMmC = toMmPoint(b);

    const dirOutCenter = (at: "a" | "b", aa: { x: number; z: number }, bb: { x: number; z: number }) =>
      at === "a" ? new THREE.Vector3(bb.x - aa.x, 0, bb.z - aa.z) : new THREE.Vector3(aa.x - bb.x, 0, aa.z - bb.z);

    const joinExtAt = (node: { x: number; z: number }, at: "a" | "b") => {
      const neighbors: Array<{ v: THREE.Vector3 }> = [];
      for (const other of walls) {
        if (other.id === w.id) continue;
        const oRefA = new THREE.Vector3(other.params.aMm.x / 1000, 0, other.params.aMm.z / 1000);
        const oRefB = new THREE.Vector3(other.params.bMm.x / 1000, 0, other.params.bMm.z / 1000);
        const oJust = other.params.justification ?? "center";
        const oS = (other.params.exteriorSign ?? 1) as 1 | -1;
        const oC = wallRefLineToCenterLine(oRefA, oRefB, other.params.thicknessMm, oJust, oS);
        const oa = toMmPoint(oC.a);
        const ob = toMmPoint(oC.b);
        const isA = mmDist(oa, node) <= wallJoinTolMm;
        const isB = mmDist(ob, node) <= wallJoinTolMm;
        if (!isA && !isB) continue;
        const v = dirOutCenter(isA && !isB ? "a" : "b", oa, ob);
        if (v.lengthSq() > 1e-6) neighbors.push({ v });
      }

      if (neighbors.length === 0) return 0;

      const v0 = dirOutCenter(at, aMmC, bMmC);
      if (v0.lengthSq() < 1e-6) return 0;
      v0.normalize();

      let bestTheta = Infinity;
      for (const n of neighbors) {
        const v1 = n.v.clone().normalize();
        const dot = Math.max(-1, Math.min(1, v0.dot(v1)));
        const theta = Math.acos(dot);
        if (theta < 0.2 || Math.abs(Math.PI - theta) < 0.2) continue;
        if (theta < bestTheta) bestTheta = theta;
      }
      if (!isFinite(bestTheta) || bestTheta === Infinity) return 0;

      const thickM = Math.max(0.01, w.params.thicknessMm / 1000);
      const tanHalf = Math.tan(bestTheta / 2);
      if (tanHalf < 1e-4) return 0;
      const ext = (thickM / 2) / tanHalf;
      return Math.min(1.2, Math.max(0, ext));
    };

    const renderSegmentFromSolvedOutline = () => {
      if (!solvedOutline || solvedOutline.length < 3) return null;
      const origin = a.clone().add(b).multiplyScalar(0.5);
      const projected = solvedOutline.map((point) => {
        const dx = point.x - origin.x;
        const dz = point.z - origin.z;
        return dx * d.x + dz * d.z;
      });
      const minX = Math.min(...projected);
      const maxX = Math.max(...projected);
      if (!isFinite(minX) || !isFinite(maxX) || maxX - minX < 0.001) return null;
      return {
        a: origin.clone().addScaledVector(d, minX),
        b: origin.clone().addScaledVector(d, maxX)
      };
    };

    const solvedRenderSegment = renderSegmentFromSolvedOutline();
    const extA = solvedRenderSegment ? 0 : joinExtAt(aMmC, "a");
    const extB = solvedRenderSegment ? 0 : joinExtAt(bMmC, "b");
    const aExt = solvedRenderSegment?.a ?? a.clone().addScaledVector(d, -extA);
    const bExt = solvedRenderSegment?.b ?? b.clone().addScaledVector(d, extB);
    const renderMid = aExt.clone().add(bExt).multiplyScalar(0.5);
    const wallWindows = getWindowInsts().filter((windowInst) => windowInst.params.wallId === w.id);
    const wallDoors = getDoorInsts().filter((doorInst) => doorInst.params.wallId === w.id);
    const cutouts: WallMeshCutout[] = [];
    for (const windowInst of wallWindows) {
      const widthM = Math.max(0.05, windowInst.params.widthMm / 1000);
      const heightM = Math.max(0.05, windowInst.params.heightMm / 1000);
      const sillM = Math.max(0, windowInst.params.sillHeightMm / 1000);
      const centerWorld = a.clone().addScaledVector(d, windowInst.params.centerMm / 1000);
      cutouts.push({
        centerLocalX: centerWorld.sub(renderMid).dot(d),
        widthM,
        sillM,
        heightM
      });
    }
    for (const doorInst of wallDoors) {
      const widthM = Math.max(0.05, doorInst.params.widthMm / 1000);
      const heightM = Math.max(0.05, doorInst.params.heightMm / 1000);
      const centerWorld = a.clone().addScaledVector(d, doorInst.params.centerMm / 1000);
      cutouts.push({
        centerLocalX: centerWorld.sub(renderMid).dot(d),
        widthM,
        sillM: 0,
        heightM
      });
    }

    if (cutouts.length === 0 && solvedOutline && updateWallMeshFromSolvedOutline(w.mesh, solvedOutline, a, b, w.params.heightMm, true)) {
      syncWallOutline(w);
      return;
    }

    updateWallMesh(w.mesh, aExt, bExt, w.params.thicknessMm, w.params.heightMm, cutouts, true);
    syncWallOutline(w);
  }

  function addWall(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number): WallInstance | null {
    const id = ctx.nextWallId();
    const root = new THREE.Group();
    root.name = `wall_${id}`;

    const mesh = createWallMesh(a, b, thicknessMm);
    mesh.name = `wallMesh_${id}`;
    mesh.userData.kind = "wall";
    mesh.userData.wallId = id;
    root.add(mesh);

    const outline = createWallOutline(mesh.geometry as THREE.BufferGeometry, id);
    mesh.add(outline);

    const aMm = toMmPoint(a);
    const bMm = toMmPoint(b);
    const params: WallParams = {
      thicknessMm: Math.max(10, Math.round(thicknessMm)),
      heightMm: wallDefault.heightMm,
      materialId: wallDefault.materialId,
      justification: wallDefault.justification,
      exteriorSign: wallDefault.exteriorSign,
      aMm,
      bMm
    };

    const inst: WallInstance = { id, params, heightMm: params.heightMm, root, mesh, outline };
    layoutRoot.add(root);
    walls.push(inst);
    rebuildWall(inst);
    rebuildWallPlanMesh();

    // Disallow walls intersecting any module (prevents module-wall overlap states).
    if (instances.some((i) => moduleOverlapsWalls(i))) {
      // rollback
      layoutRoot.remove(root);
      disposeObject3D(root);
      const idx = walls.findIndex((w) => w.id === id);
      if (idx >= 0) walls.splice(idx, 1);
      rebuildWallPlanMesh();
      setUnderlayStatus("Wall blocked: would overlap a module.");
      return null;
    }

    commitHistory(S);
    return inst;
  }

  return {
    pickAlignLineAt,
    lineLineIntersectionXZ,
    translateWallAndConnected,
    moveWallEndpointAndConnected,
    setWallEndpointMm,
    wallDirOutFromNode,
    joinExtensionM,
    removeWall,
    splitWallAtMm,
    autoJoinAtMmPoint,
    pickWallLine2D,
    cross2XZ,
    intersectLinesXZ,
    bestNeighborAtNode,
    miterEndCorners,
    updateWallMesh,
    rebuildWallPlanMesh,
    createWallMesh,
    createWallOutline,
    syncWallOutline,
    wallRefLineToCenterLine,
    updateWallMeshWithJustification,
    makeWallPreviewMesh,
    rebuildWall,
    addWall
  };
}
