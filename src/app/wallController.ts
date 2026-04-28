import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { getModulePlanPolygon } from "./planSnap";
import { buildModuleAlignCandidates, buildWallAlignCandidates, buildWorktopAlignCandidates, pickBestAlignLine } from "./alignTool";
import { distPointToSegment2 } from "./screenGeometry";
import { worldToScreen } from "./sharedUtils";
import type { AlignPickedLine, KitchenWorktopInstance, LayoutInstance, PickedLine2D, WallInstance, WallParams } from "./localTypes";
import { disposeObject3D } from "../core/dispose";
import { sanitizeKitchenWorktopPath, kitchenWorktopPointToWorld } from "../layout/worktopGeometry";
import { commitHistory } from "../layout/historyManager";
import { solveWallNetwork } from "../walls2d/solver";
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

export type WallControllerContext = Record<string, any>;

export function createWallController(ctx: WallControllerContext) {
  const walls = ctx.walls as WallInstance[];
  const instances = ctx.instances as LayoutInstance[];
  const kitchenWorktops = ctx.kitchenWorktops as KitchenWorktopInstance[];
  const layoutRoot = ctx.layoutRoot as THREE.Group;
  const wallPlanGroup = ctx.wallPlanGroup as THREE.Group;
  const wallPlanMeshes = ctx.wallPlanMeshes as Map<string, THREE.Line>;
  const wallJoinMeshes = ctx.wallJoinMeshes as THREE.Mesh[];
  const wallDebugGroup = ctx.wallDebugGroup as THREE.Group;
  const wallSolvedOutlines = ctx.wallSolvedOutlines as Map<string, Array<{ x: number; z: number }>>;
  const wallDefault = ctx.wallDefault as {
    thicknessMm: number;
    heightMm: number;
    materialId: string;
    justification: "center" | "interior" | "exterior";
    exteriorSign: 1 | -1;
  };
  const wallJoinTolMm = ctx.wallJoinTolMm as number;
  const pinnedWallIds = ctx.pinnedWallIds as Set<string>;
  const S = ctx.S;
  const cam = ctx.cam as () => THREE.Camera;
  const getModuleLocalBackCenter = ctx.getModuleLocalBackCenter as (inst: LayoutInstance) => THREE.Vector3;
  const getKitchenWorktopGuidePathForAlign = ctx.getKitchenWorktopGuidePathForAlign as (
    params: KitchenWorktopInstance["params"],
    guide: "center" | "back" | "front"
  ) => THREE.Vector3[];
  const moduleOverlapsWalls = ctx.moduleOverlapsWalls as (inst: LayoutInstance) => boolean;
  const setUnderlayStatus = ctx.setUnderlayStatus as (text: string) => void;
  const showWallSnapMarkersFor = ctx.showWallSnapMarkersFor as (wallId: string | null) => void;

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

  function removeWall(w: WallInstance) {
    layoutRoot.remove(w.root);
    w.outline.geometry.dispose();
    (w.outline.material as THREE.Material).dispose();
    w.mesh.geometry.dispose();
    (w.mesh.material as THREE.Material).dispose();
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

  function updateWallMesh(
    mesh: THREE.Mesh,
    a: THREE.Vector3 | null,
    b: THREE.Vector3 | null,
    thicknessMm: number,
    heightMm = wallDefault.heightMm
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

    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(len, h, thickM);
    mesh.position.set(midX, h / 2, midZ);
    mesh.rotation.set(0, rotY, 0);
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

    const modelWalls = walls.map((w) => ({
      id: w.id,
      a: { x: w.params.aMm.x / 1000, z: w.params.aMm.z / 1000 },
      b: { x: w.params.bMm.x / 1000, z: w.params.bMm.z / 1000 },
      thicknessM: Math.max(0.001, w.params.thicknessMm / 1000),
      justification: ((w.params as any).justification ?? "center") as any,
      exteriorSign: ((w.params.exteriorSign ?? 1) as 1 | -1) ?? 1
    }));

    const solved = solveWallNetwork(modelWalls, { nodeTolM: wallJoinTolMm / 1000, miterLimit: 8 });
    wallSolvedOutlines.clear();
    ctx.setWallSolvedJoinPolys(solved.joinPolys.map((p: any) => p.map((q: any) => ({ x: q.x, z: q.z }))));
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

    const polys: any[] = [];
    for (const w of solved.walls) {
      if (w.outline.length < 3) continue;
      polys.push([[[toRing(w.outline)]]]);
    }
    for (const p of solved.joinPolys) {
      if (p.length < 3) continue;
      polys.push([[[toRing(p)]]]);
    }

    let merged: any = null;
    try {
      merged = (polygonClipping as any).union(...polys);
    } catch {
      merged = null;
    }

    if (merged && merged.length > 0) ctx.setWallUnionPolys(merged);

    const makePlanPolyline = (pts: Array<{ x: number; z: number }>, color: number, y = 0.02) => {
      if (pts.length < 2) return null;
      const linePts = pts.map((p) => new THREE.Vector3(p.x, y, p.z));
      if (pts.length >= 3) linePts.push(new THREE.Vector3(pts[0].x, y, pts[0].z));
      const geom = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.Line(
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
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.renderOrder = 6;
      return mesh;
    };

    const fallbackFillSource = [
      ...solved.walls.filter((w) => w.outline.length >= 3).map((w) => [toRing(w.outline)]),
      ...solved.joinPolys.filter((p) => p.length >= 3).map((p) => [toRing(p)])
    ];
    const fillSource = merged && merged.length > 0 ? (merged as Array<Array<Array<[number, number]>>>) : fallbackFillSource;
    for (const rings of fillSource) {
      const mesh = makePlanFillMesh(rings);
      if (!mesh) continue;
      mesh.name = "wallPlanFill";
      wallJoinMeshes.push(mesh);
      wallPlanGroup.add(mesh);
    }

    for (const solvedWall of solved.walls) {
      const line = makePlanPolyline(solvedWall.outline, 0x4f4f4f);
      if (!line) continue;
      line.name = `wallPlan_${solvedWall.id}`;
      line.userData.kind = "wallPlan";
      line.userData.wallId = solvedWall.id;
      line.renderOrder = 20;
      wallPlanMeshes.set(solvedWall.id, line);
      wallPlanGroup.add(line);
    }

    // Debug overlays
    wallDebugGroup.visible = ctx.getWallDebugEnabled();
    if (ctx.getWallDebugEnabled()) {
      while (wallDebugGroup.children.length > 0) {
        const c = wallDebugGroup.children.pop()!;
        wallDebugGroup.remove(c);
        const any = c as any;
        if (any.geometry?.dispose) any.geometry.dispose();
        if (any.material?.dispose) any.material.dispose();
      }

      const mkLine = (pts: Array<{ x: number; z: number }>, color: number, y = 0.031) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, p.z)));
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
        const l = new THREE.Line(g, m);
        wallDebugGroup.add(l);
      };

      // centerlines + outlines
      for (const w of modelWalls) {
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
    const mat = new THREE.MeshBasicMaterial({
      color: 0xb8c0cb,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      side: THREE.DoubleSide
    });
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

  function createWallOutline(geometry: THREE.BufferGeometry, wallId?: string) {
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
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
    if (!w.outline || !w.outline.parent) {
      w.outline = createWallOutline(w.mesh.geometry as THREE.BufferGeometry, w.id);
      w.mesh.add(w.outline);
    }
    const nextGeometry = new THREE.EdgesGeometry(w.mesh.geometry as THREE.BufferGeometry, 1);
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
    const meshMaterial = w.mesh.material as THREE.MeshBasicMaterial;
    meshMaterial.color.setHex(0xb8c0cb);
    meshMaterial.transparent = false;
    meshMaterial.opacity = 1;
    meshMaterial.depthWrite = true;
    meshMaterial.side = THREE.DoubleSide;

    const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
    const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
    const just = w.params.justification ?? "center";
    const s = (w.params.exteriorSign ?? 1) as 1 | -1;
    const { a, b } = wallRefLineToCenterLine(refA, refB, w.params.thicknessMm, just, s);
    // Revit-like join rendering in 3D: extend ends to form miter-like corner joins.
    // This does not change stored axis endpoints (aMm/bMm); only the rendered mesh.
    const d = b.clone().sub(a);
    if (d.lengthSq() < 1e-8) {
      updateWallMesh(w.mesh, a, b, w.params.thicknessMm, w.params.heightMm);
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

    const extA = joinExtAt(aMmC, "a");
    const extB = joinExtAt(bMmC, "b");

    const aExt = a.clone().addScaledVector(d, -extA);
    const bExt = b.clone().addScaledVector(d, extB);
    updateWallMesh(w.mesh, aExt, bExt, w.params.thicknessMm, w.params.heightMm);
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
