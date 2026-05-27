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
import { type WallJustification } from "../walls2d/model";
import { getWallTypeName, getWallTypePreset, resolveWallTypeId } from "./wallTypes";
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

type WallOpeningClip = {
  kind: "window" | "door";
  wallId: string;
  center: THREE.Vector3;
  dir: THREE.Vector3;
  normal: THREE.Vector3;
  halfW: number;
  halfT: number;
  faceHalfT: number;
  corners: Array<{ x: number; z: number }>;
};

export type WallDebugLayer =
  | "centerlines"
  | "perWallOutlines"
  | "offsetEdges"
  | "capEdges"
  | "finalFootprint"
  | "boundaryEdges"
  | "joinNodes"
  | "intersectionPoints";

const DEFAULT_WALL_DEBUG_LAYERS: Record<WallDebugLayer, boolean> = {
  centerlines: true,
  perWallOutlines: true,
  offsetEdges: true,
  capEdges: true,
  finalFootprint: true,
  boundaryEdges: true,
  joinNodes: true,
  intersectionPoints: true
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
    typeId?: string | null;
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
  getSelectedWallIds?: () => Set<string>;
  getShowAllWallSolvedOutlines?: () => boolean;
  setSelectedWallId: (next: string | null) => void;
  getWallDebugEnabled: () => boolean;
  getWallDebugLayers?: () => Partial<Record<WallDebugLayer, boolean>>;
  setWallSolvedJoinPolys: (next: WallPlanPoint[][]) => void;
  setWallUnionPolys: (next: WallPlanMultiPolygon | null) => void;
  updateSelectionHighlights?: () => void;
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
  const linkedEndpointTolMm = () => Math.min(wallJoinTolMm, 2);

  const syncWallIfcMetadata = (w: WallInstance) => {
    const typeId = resolveWallTypeId(w.params);
    const preset = getWallTypePreset(typeId);
    w.mesh.userData.kind = "wall";
    w.mesh.userData.wallId = w.id;
    w.mesh.userData.ifc = {
      className: "IfcWall",
      predefinedType: preset?.ifcPredefinedType ?? "STANDARD",
      elementId: w.id,
      objectType: preset?.name ?? getWallTypeName(typeId),
      name: preset?.name ?? getWallTypeName(typeId)
    };
    const existingTags = Array.isArray(w.mesh.userData.tags)
      ? w.mesh.userData.tags.filter((tag): tag is string => typeof tag === "string" && !tag.startsWith("wallType:"))
      : [];
    w.mesh.userData.tags = Array.from(new Set([...existingTags, "wall", "ifc", "IfcWall", `wallType:${typeId}`]));
  };

  const makeWallSolverInput = () =>
    walls.map((w) => ({
      id: w.id,
      a: { x: w.params.aMm.x / 1000, z: w.params.aMm.z / 1000 },
      b: { x: w.params.bMm.x / 1000, z: w.params.bMm.z / 1000 },
      thicknessM: Math.max(0.001, w.params.thicknessMm / 1000),
      justification: w.params.justification ?? "center",
      exteriorSign: ((w.params.exteriorSign ?? 1) as 1 | -1) ?? 1,
      joinEnds: w.params.joinEnds
    }));

  const solveWallsForRendering = () =>
    solveWallNetwork(makeWallSolverInput(), { nodeTolM: wallJoinTolMm / 1000, miterLimit: DEFAULT_WALL_MITER_LIMIT });

  const makeWallOpeningClips = () => {
    const clips: WallOpeningClip[] = [];

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

      clips.push({ kind, wallId, center, dir, normal: leftNormal, halfW, halfT, faceHalfT: half, corners });
    };

    for (const windowInst of getWindowInsts()) {
      addClip("window", windowInst.params.wallId ?? null, windowInst.params.centerMm, windowInst.params.widthMm);
    }
    for (const doorInst of getDoorInsts()) {
      addClip("door", doorInst.params.wallId ?? null, doorInst.params.centerMm, doorInst.params.widthMm);
    }

    return clips;
  };

  const buildAlignLineCandidates = () => {
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

    return candidates;
  };

  const buildSolvedWallOutlineCandidates = (wall: WallInstance, outline: WallPlanPoint[]) => {
    const candidates: AlignPickedLine[] = [];
    const first = outline[0];
    const last = outline[outline.length - 1];
    const closed =
      !!first &&
      !!last &&
      outline.length > 1 &&
      Math.hypot(first.x - last.x, first.z - last.z) < 1e-6;
    const pts = closed ? outline.slice(0, -1) : outline;
    if (pts.length < 2) return candidates;

    for (let index = 0; index < pts.length; index += 1) {
      const a = pts[index]!;
      const b = pts[(index + 1) % pts.length]!;
      const segA = new THREE.Vector3(a.x, 0, a.z);
      const segB = new THREE.Vector3(b.x, 0, b.z);
      const dir = segB.clone().sub(segA).setY(0);
      if (dir.lengthSq() < 1e-8) continue;
      dir.normalize();
      candidates.push({
        p: segA.clone(),
        dir,
        segA,
        segB,
        label: `Wall ${wall.id}: outline edge ${index + 1}`,
        targetKind: "wall",
        lineRole: "edge",
        wallId: wall.id,
        segmentIndex: index
      });
    }

    return candidates;
  };

  const makeDimensionLineCandidate = (args: {
    a: THREE.Vector3;
    b: THREE.Vector3;
    label: string;
    lineRole?: AlignPickedLine["lineRole"];
    wallId?: string | null;
    segmentIndex: number;
  }): AlignPickedLine | null => {
    const dir = args.b.clone().sub(args.a).setY(0);
    if (dir.lengthSq() < 1e-8) return null;
    dir.normalize();
    return {
      p: args.a.clone(),
      dir,
      segA: args.a.clone(),
      segB: args.b.clone(),
      label: args.label,
      targetKind: "wall" as const,
      lineRole: args.lineRole ?? "edge",
      wallId: args.wallId ?? undefined,
      segmentIndex: args.segmentIndex
    } satisfies AlignPickedLine;
  };

  const buildEndpointReferenceCandidates = (edge: AlignPickedLine, baseIndex: number) => {
    const segment = edge.segB.clone().sub(edge.segA).setY(0);
    const segmentLen = segment.length();
    if (segmentLen < 1e-6) return [] as AlignPickedLine[];
    const dir = segment.multiplyScalar(1 / segmentLen);
    const normal = new THREE.Vector3(-dir.z, 0, dir.x);
    const half = Math.max(0.18, Math.min(0.85, segmentLen * 0.35));
    const make = (point: THREE.Vector3, role: "endA" | "endB", index: number) =>
      makeDimensionLineCandidate({
        a: point.clone().addScaledVector(normal, -half),
        b: point.clone().addScaledVector(normal, half),
        label: `${edge.label}: ${role === "endA" ? "start reference" : "end reference"}`,
        lineRole: role,
        wallId: edge.wallId ?? null,
        segmentIndex: baseIndex + index
      });
    return [make(edge.segA, "endA", 0), make(edge.segB, "endB", 1)].filter(
      (candidate): candidate is AlignPickedLine => !!candidate
    );
  };

  const buildWallPlanVisibleDimensionCandidates = () => {
    const candidates: AlignPickedLine[] = [];
    const edges: AlignPickedLine[] = [];
    let segmentIndex = 200000;

    for (const line of wallPlanMeshes.values()) {
      const kind = line.userData?.kind;
      if (kind !== "wallPlanUnion" && kind !== "wallPlanWindowParapet" && kind !== "wallPlanWallFaces") continue;
      if (line.visible === false) continue;
      const position = line.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!position || position.count < 2) continue;
      line.updateMatrixWorld(true);

      for (let i = 0; i + 1 < position.count; i += 2) {
        const a = line.localToWorld(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
        const b = line.localToWorld(new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)));
        const edge = makeDimensionLineCandidate({
          a,
          b,
          label: `${line.name || "Wall plan"}: segment ${i / 2 + 1}`,
          wallId: typeof line.userData?.wallId === "string" ? line.userData.wallId : null,
          segmentIndex: segmentIndex++
        });
        if (!edge) continue;
        edges.push(edge);
        candidates.push(...buildEndpointReferenceCandidates(edge, segmentIndex));
        segmentIndex += 2;
      }
    }

    candidates.push(...edges);
    return candidates;
  };

  const buildOpeningDimensionCandidates = () => {
    const candidates: AlignPickedLine[] = [];
    let segmentIndex = 300000;
    const add = (clip: WallOpeningClip, a: THREE.Vector3, b: THREE.Vector3, label: string) => {
      const candidate = makeDimensionLineCandidate({
        a,
        b,
        label,
        wallId: clip.wallId,
        segmentIndex: segmentIndex++
      });
      if (candidate) candidates.push(candidate);
    };

    for (const clip of makeWallOpeningClips()) {
      const faceHalfT = clip.faceHalfT;
      const startInner = clip.center.clone().addScaledVector(clip.dir, -clip.halfW).addScaledVector(clip.normal, -faceHalfT);
      const endInner = clip.center.clone().addScaledVector(clip.dir, clip.halfW).addScaledVector(clip.normal, -faceHalfT);
      const startOuter = clip.center.clone().addScaledVector(clip.dir, -clip.halfW).addScaledVector(clip.normal, faceHalfT);
      const endOuter = clip.center.clone().addScaledVector(clip.dir, clip.halfW).addScaledVector(clip.normal, faceHalfT);
      const label = clip.kind === "door" ? "Door opening" : "Window opening";

      add(clip, startInner, startOuter, `${label}: left jamb`);
      add(clip, endInner, endOuter, `${label}: right jamb`);
      add(clip, startInner, endInner, `${label}: inner edge`);
      add(clip, startOuter, endOuter, `${label}: outer edge`);
    }

    return candidates;
  };

  const pickAlignLineAt = (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => {
    void hitPoint;
    return pickBestAlignLine(mousePx, rect, cam(), buildAlignLineCandidates(), 12);
  };

  const pickDimensionLineAt = (hitPoint: THREE.Vector3, mousePx: { x: number; y: number }, rect: DOMRect) => {
    void hitPoint;
    const candidates = [
      ...buildWallPlanVisibleDimensionCandidates(),
      ...buildOpeningDimensionCandidates(),
      ...buildAlignLineCandidates()
    ];
    for (const w of walls) {
      const outline = wallSolvedOutlines.get(w.id) ?? null;
      if (outline && outline.length >= 3) candidates.push(...buildSolvedWallOutlineCandidates(w, outline));
    }
    return pickBestAlignLine(mousePx, rect, cam(), candidates, 24);
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
      const wa = wallEndpointWhich(other, oldA, linkedEndpointTolMm());
      if (wa) {
        if (wa === "a") other.params.aMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        else other.params.bMm = { x: oldA.x + dxMm, z: oldA.z + dzMm };
        touched.add(other.id);
      }
      const wb = wallEndpointWhich(other, oldB, linkedEndpointTolMm());
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

  const setWallEndpointsAndConnectedMm = (
    edits: Array<{ wall: WallInstance; which: "a" | "b"; next: { x: number; z: number } }>
  ) => {
    if (edits.length === 0) return false;
    const prev = new Map<string, WallParams>();
    for (const ww of walls) prev.set(ww.id, JSON.parse(JSON.stringify(ww.params)) as WallParams);

    const normalized = edits.map((edit) => {
      const old = edit.which === "a" ? edit.wall.params.aMm : edit.wall.params.bMm;
      return {
        wall: edit.wall,
        which: edit.which,
        old: { x: old.x, z: old.z },
        next: { x: Math.round(edit.next.x), z: Math.round(edit.next.z) }
      };
    });

    const touched = new Set<string>();
    for (const other of walls) {
      if (pinnedWallIds.has(other.id) && !normalized.some((edit) => edit.wall.id === other.id)) continue;
      for (const end of ["a", "b"] as const) {
        const current = end === "a" ? other.params.aMm : other.params.bMm;
        const match = normalized.find((edit) => mmDist(current, edit.old) <= linkedEndpointTolMm());
        if (!match) continue;
        if (end === "a") other.params.aMm = { ...match.next };
        else other.params.bMm = { ...match.next };
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
      return false;
    }
    return true;
  };

  const setWallEndpointAndConnectedMm = (w: WallInstance, which: "a" | "b", nextP: { x: number; z: number }) =>
    setWallEndpointsAndConnectedMm([{ wall: w, which, next: nextP }]);

  const moveWallEndpointAndConnected = (w: WallInstance, which: "a" | "b", dxMm: number, dzMm: number) => {
    const oldP = which === "a" ? w.params.aMm : w.params.bMm;
    return setWallEndpointAndConnectedMm(w, which, { x: oldP.x + dxMm, z: oldP.z + dzMm });
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

  function cleanupWallTopology() {
    const attachedWallIds = new Set<string>();
    for (const windowInst of getWindowInsts()) if (windowInst.params.wallId) attachedWallIds.add(windowInst.params.wallId);
    for (const doorInst of getDoorInsts()) if (doorInst.params.wallId) attachedWallIds.add(doorInst.params.wallId);

    const selectedWallIds = ctx.getSelectedWallIds?.();
    const endpoint = (wall: WallInstance, which: "a" | "b") => (which === "a" ? wall.params.aMm : wall.params.bMm);
    const topologyConnectionIds = (wall: WallInstance, point: { x: number; z: number }) => {
      const ids = new Set<string>();
      for (const other of walls) {
        if (other.id === wall.id) continue;
        if (wallEndpointWhich(other, point, wallJoinTolMm)) {
          ids.add(other.id);
          continue;
        }
        const hit = pointOnWallAxisMm(other, point);
        if (hit.distMm <= wallJoinTolMm && hit.t > 0.001 && hit.t < 0.999) ids.add(other.id);
      }
      return ids;
    };
    const hasTopologyConnection = (wall: WallInstance, point: { x: number; z: number }) =>
      topologyConnectionIds(wall, point).size > 0;
    const removeTopologyWall = (wall: WallInstance) => {
      layoutRoot.remove(wall.root);
      disposeObject3D(wall.root);
      const idx = walls.indexOf(wall);
      if (idx >= 0) walls.splice(idx, 1);
      selectedWallIds?.delete(wall.id);
      if (ctx.getSelectedWallId() === wall.id) ctx.setSelectedWallId(null);
      wallSolvedOutlines.delete(wall.id);
    };

    for (const wall of [...walls]) {
      if (pinnedWallIds.has(wall.id) || attachedWallIds.has(wall.id)) continue;
      const lenMm = mmDist(wall.params.aMm, wall.params.bMm);
      const microLimitMm = Math.max(wallJoinTolMm, Math.max(1, wall.params.thicknessMm));
      if (lenMm > microLimitMm) continue;
      const connectedIds = new Set<string>([
        ...topologyConnectionIds(wall, wall.params.aMm),
        ...topologyConnectionIds(wall, wall.params.bMm)
      ]);
      if (connectedIds.size < 2) removeTopologyWall(wall);
    }

    for (const wall of walls) {
      const joinEnds = wall.params.joinEnds;
      if (!joinEnds) continue;
      for (const end of ["a", "b"] as const) {
        if (hasTopologyConnection(wall, endpoint(wall, end))) continue;
        delete joinEnds[end];
      }
      if (!joinEnds.a && !joinEnds.b) wall.params.joinEnds = undefined;
    }
  }

  function mergeCollinearWallFragments() {
    const maxPasses = Math.max(1, walls.length);
    const attachedWallIds = new Set<string>();
    for (const windowInst of getWindowInsts()) if (windowInst.params.wallId) attachedWallIds.add(windowInst.params.wallId);
    for (const doorInst of getDoorInsts()) if (doorInst.params.wallId) attachedWallIds.add(doorInst.params.wallId);

    const endpoint = (wall: WallInstance, which: "a" | "b") => (which === "a" ? wall.params.aMm : wall.params.bMm);
    const otherEndpoint = (wall: WallInstance, which: "a" | "b") => (which === "a" ? wall.params.bMm : wall.params.aMm);
    const normalize = (v: { x: number; z: number }) => {
      const len = Math.hypot(v.x, v.z);
      return len > 1e-6 ? { x: v.x / len, z: v.z / len } : null;
    };
    const cross2 = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.z - a.z * b.x;
    const dot2 = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.x + a.z * b.z;
    const exteriorNormal = (wall: WallInstance) => {
      const dir = normalize({ x: wall.params.bMm.x - wall.params.aMm.x, z: wall.params.bMm.z - wall.params.aMm.z });
      if (!dir) return null;
      const sign = (wall.params.exteriorSign ?? 1) as 1 | -1;
      return { x: -dir.z * sign, z: dir.x * sign };
    };
    const sameStyle = (a: WallInstance, b: WallInstance) =>
      resolveWallTypeId(a.params) === resolveWallTypeId(b.params) &&
      a.params.thicknessMm === b.params.thicknessMm &&
      a.params.heightMm === b.params.heightMm &&
      a.params.materialId === b.params.materialId &&
      (a.params.justification ?? "center") === (b.params.justification ?? "center");
    const incidentIdsAt = (point: { x: number; z: number }) => {
      const ids = new Set<string>();
      for (const wall of walls) {
        if (wallEndpointWhich(wall, point, wallJoinTolMm)) {
          ids.add(wall.id);
          continue;
        }
        const hit = pointOnWallAxisMm(wall, point);
        if (hit.distMm <= wallJoinTolMm && hit.t > 0.001 && hit.t < 0.999) ids.add(wall.id);
      }
      return ids;
    };
    const removeMergedWall = (wall: WallInstance) => {
      layoutRoot.remove(wall.root);
      disposeObject3D(wall.root);
      const idx = walls.indexOf(wall);
      if (idx >= 0) walls.splice(idx, 1);
    };

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let merged = false;
      outer: for (let i = 0; i < walls.length; i += 1) {
        for (let j = i + 1; j < walls.length; j += 1) {
          const keep = walls[i];
          const remove = walls[j];
          if (!keep || !remove) continue;
          if (pinnedWallIds.has(keep.id) || pinnedWallIds.has(remove.id)) continue;
          if (attachedWallIds.has(keep.id) || attachedWallIds.has(remove.id)) continue;
          if (!sameStyle(keep, remove)) continue;
          const keepNormal = exteriorNormal(keep);
          const removeNormal = exteriorNormal(remove);
          if (!keepNormal || !removeNormal || dot2(keepNormal, removeNormal) < 0.999) continue;

          for (const keepEnd of ["a", "b"] as const) {
            for (const removeEnd of ["a", "b"] as const) {
              const sharedA = endpoint(keep, keepEnd);
              const sharedB = endpoint(remove, removeEnd);
              if (mmDist(sharedA, sharedB) > wallJoinTolMm) continue;
              const shared = { x: (sharedA.x + sharedB.x) / 2, z: (sharedA.z + sharedB.z) / 2 };
              const incidents = incidentIdsAt(shared);
              if (incidents.size !== 2 || !incidents.has(keep.id) || !incidents.has(remove.id)) continue;
              const keepOther = otherEndpoint(keep, keepEnd);
              const removeOther = otherEndpoint(remove, removeEnd);
              const keepAway = normalize({ x: keepOther.x - shared.x, z: keepOther.z - shared.z });
              const removeAway = normalize({ x: removeOther.x - shared.x, z: removeOther.z - shared.z });
              if (!keepAway || !removeAway) continue;
              if (Math.abs(cross2(keepAway, removeAway)) > 0.001 || dot2(keepAway, removeAway) > -0.999) continue;

              const keepJoinEnds = keep.params.joinEnds ? JSON.parse(JSON.stringify(keep.params.joinEnds)) : {};
              const removeJoinEnds = remove.params.joinEnds ? JSON.parse(JSON.stringify(remove.params.joinEnds)) : {};
              keep.params.aMm = keepEnd === "b" ? { ...keep.params.aMm } : { ...removeOther };
              keep.params.bMm = keepEnd === "b" ? { ...removeOther } : { ...keep.params.bMm };
              keep.params.joinEnds = {
                a: keepEnd === "b" ? keepJoinEnds.a : removeJoinEnds[removeEnd === "a" ? "b" : "a"],
                b: keepEnd === "b" ? removeJoinEnds[removeEnd === "a" ? "b" : "a"] : keepJoinEnds.b
              };
              if (ctx.getSelectedWallId() === remove.id) ctx.setSelectedWallId(keep.id);
              const selectedWallIds = ctx.getSelectedWallIds?.();
              if (selectedWallIds?.delete(remove.id)) selectedWallIds.add(keep.id);
              removeMergedWall(remove);
              rebuildWall(keep);
              merged = true;
              break outer;
            }
          }
        }
      }
      if (!merged) break;
    }
  }

  function freezeRemainingWallEndsAtDeletedJoin(deleted: WallInstance) {
    const solvedByWallId = new Map(solveWallsForRendering().walls.map((wall) => [wall.id, wall]));
    const touchesDeletedWall = (point: { x: number; z: number }) => {
      if (wallEndpointWhich(deleted, point, wallJoinTolMm)) return true;
      const hit = pointOnWallAxisMm(deleted, point);
      return hit.distMm <= wallJoinTolMm && hit.t >= -0.001 && hit.t <= 1.001;
    };
    const hasSurvivingConnection = (wall: WallInstance, point: { x: number; z: number }) => {
      for (const other of walls) {
        if (other.id === wall.id || other.id === deleted.id) continue;
        const endpointTolMm = Math.max(wallJoinTolMm, Math.min(wall.params.thicknessMm, other.params.thicknessMm) * 0.75);
        if (mmDist(other.params.aMm, point) <= endpointTolMm || mmDist(other.params.bMm, point) <= endpointTolMm) return true;
        const axisHit = pointOnWallAxisMm(other, point);
        const axisTolMm = Math.max(wallJoinTolMm, Math.min(wall.params.thicknessMm, other.params.thicknessMm) * 0.5);
        if (axisHit.distMm <= axisTolMm && axisHit.t > 0.001 && axisHit.t < 0.999) return true;
      }
      return false;
    };

    for (const wall of walls) {
      if (wall.id === deleted.id || pinnedWallIds.has(wall.id)) continue;
      const solved = solvedByWallId.get(wall.id);
      if (!solved) continue;
      for (const end of ["a", "b"] as const) {
        const current = end === "a" ? wall.params.aMm : wall.params.bMm;
        if (!touchesDeletedWall(current)) continue;
        if (hasSurvivingConnection(wall, current)) continue;
        const solvedEnd = solved[end];
        const next = {
          x: Math.round(((solvedEnd.left.x + solvedEnd.right.x) / 2) * 1000),
          z: Math.round(((solvedEnd.left.z + solvedEnd.right.z) / 2) * 1000)
        };
        const other = end === "a" ? wall.params.bMm : wall.params.aMm;
        const dir = { x: other.x - current.x, z: other.z - current.z };
        const len = Math.hypot(dir.x, dir.z);
        if (len < 1e-6) continue;
        const inwardProjectionMm = ((next.x - current.x) * dir.x + (next.z - current.z) * dir.z) / len;
        if (inwardProjectionMm <= 1) continue;
        if (end === "a") wall.params.aMm = next;
        else wall.params.bMm = next;
      }
    }
  }

  function removeWall(w: WallInstance) {
    freezeRemainingWallEndsAtDeletedJoin(w);
    layoutRoot.remove(w.root);
    w.outline.geometry.dispose();
    (w.outline.material as THREE.Material).dispose();
    w.mesh.geometry.dispose();
    disposeMaterialValue(w.mesh.material as THREE.Material | THREE.Material[]);
    const idx = walls.indexOf(w);
    if (idx >= 0) walls.splice(idx, 1);
    if (ctx.getSelectedWallId() === w.id) ctx.setSelectedWallId(null);
    cleanupWallTopology();
    wallSolvedOutlines.clear();
    ctx.setWallSolvedJoinPolys([]);
    ctx.setWallUnionPolys(null);
    rebuildWallPlanMesh();
    for (const wall of walls) rebuildWall(wall);
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
    const originalParams = JSON.parse(JSON.stringify(w.params)) as WallParams;
    const thickness = originalParams.thicknessMm;

    removeWall(w);
    const w1 = addWall(a, mid, thickness);
    const w2 = addWall(mid, b, thickness);
    if (!w1 || !w2) {
      // rollback best-effort to keep the original wall
      if (w1) removeWall(w1);
      if (w2) removeWall(w2);
      const w0 = addWall(a, b, thickness);
      if (w0) w0.params = JSON.parse(JSON.stringify(originalParams)) as WallParams;
      if (w0) rebuildWall(w0);
      rebuildWallPlanMesh();
      return;
    }
    w1.params = {
      ...JSON.parse(JSON.stringify(originalParams)),
      aMm: { ...originalParams.aMm },
      bMm: toMmPoint(mid),
      joinEnds: { a: originalParams.joinEnds?.a }
    };
    w2.params = {
      ...JSON.parse(JSON.stringify(originalParams)),
      aMm: toMmPoint(mid),
      bMm: { ...originalParams.bMm },
      joinEnds: { b: originalParams.joinEnds?.b }
    };
    rebuildWall(w1);
    rebuildWall(w2);
    rebuildWallPlanMesh();
  }

  function autoJoinAtMmPoint(p: { x: number; z: number }) {
    // Snap endpoints only. T-joins into a wall middle are solved without splitting
    // the continuous wall into separate user-visible fragments.
    const tolMm = linkedEndpointTolMm();
    for (const w of [...walls]) {
      const which = wallEndpointWhich(w, p, tolMm);
      if (which) setWallEndpointMm(w, which, p);
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
    return makeVerticalPrismGeometryFromContour(contour, heightM);
  }

  function makeVerticalPrismGeometryFromContour(contour: THREE.Vector2[], heightM: number) {
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

  function makeWallJoinPrismFromOutline(outline: Array<{ x: number; z: number }>, heightM: number) {
    if (outline.length < 3) return null;
    const origin = new THREE.Vector3();
    for (const point of outline) origin.add(new THREE.Vector3(point.x, 0, point.z));
    origin.multiplyScalar(1 / outline.length);
    const contour = outline.map((point) => new THREE.Vector2(point.x - origin.x, point.z - origin.z));
    const geometry = makeVerticalPrismGeometryFromContour(contour, heightM);
    if (!geometry) return null;
    return { geometry, origin };
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
      m.parent?.remove(m);
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        for (const material of m.material) material.dispose();
      } else {
        m.material.dispose();
      }
    }

    if (walls.length === 0) return;
    cleanupWallTopology();
    if (walls.length === 0) return;
    mergeCollinearWallFragments();
    const solved = solveWallsForRendering();
    const solverInputs = makeWallSolverInput();
    wallSolvedOutlines.clear();
    ctx.setWallSolvedJoinPolys(solved.joinPolys.map((poly) => poly.map((point) => ({ x: point.x, z: point.z }))));
    ctx.setWallUnionPolys(null);

    // Always keep per-wall solved outlines for hit-testing/export/debug.
    for (const w of solved.walls) wallSolvedOutlines.set(w.id, w.outline);
    if (ctx.getSelectedKind() === "wall" && ctx.getSelectedWallId()) showWallSnapMarkersFor(ctx.getSelectedWallId());

    const joinHeightM = Math.max(0.001, ...walls.map((wall) => Math.max(1, wall.params.heightMm ?? wallDefault.heightMm) / 1000));
    solved.joinPolys.forEach((poly, index) => {
      const prism = makeWallJoinPrismFromOutline(poly, joinHeightM);
      if (!prism) return;
      const mesh = new THREE.Mesh(prism.geometry, createWallBodyMaterial());
      mesh.name = index === 0 ? "wallJoin3d" : `wallJoin3d_${index}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(prism.origin.x, joinHeightM / 2, prism.origin.z);
      mesh.visible = ctx.getViewMode() === "3d";
      mesh.userData.kind = "wallJoin";
      mesh.userData.viewDisplaySkipEdges = ctx.getViewMode() === "2d";
      wallJoinMeshes.push(mesh);
      layoutRoot.add(mesh);
    });

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

    let merged: WallPlanMultiPolygon | null = null;
    const footprint = solved.footprint && solved.footprint.length > 0 ? solved.footprint : null;
    if (footprint && solved.joinPolys.length === 0) {
      merged = footprint;
    } else {
      const polys: WallPlanMultiPolygon[] = [];
      if (footprint) polys.push(footprint);
      for (const p of solved.joinPolys) {
        if (p.length < 3) continue;
        polys.push([[toRing(p)]]);
      }
      if (polys.length > 0) {
        try {
          merged = polygonClipper.union(...polys);
        } catch {
          merged = null;
        }
      }
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
    const wallNetworkRenderDebug = {
      rendererFile: "src/app/wallController.ts",
      rendererFunction: "rebuildWallPlanMesh",
      normalRenderGeometry: merged && merged.length > 0 ? "final union footprint" : "fallback solved wall outlines",
      solvedWalls: solved.walls.map((wall) => ({
        id: wall.id,
        a: wall.a,
        b: wall.b,
        outline: wall.outline.map((point) => ({ x: point.x, z: point.z }))
      })),
      joinNodes: solved.debug.nodes.map((node) => ({
        id: node.id,
        p: node.p,
        incident: node.incident.map((item) => ({ wallId: item.wall.id, end: item.end })),
        sortedIncident: node.sortedIncident,
        intersections: node.intersections
      })),
      solvedCaps: solved.debug.solvedCaps,
      fillSource,
      footprint: solved.footprint
    };
    (globalThis as typeof globalThis & { __kitchenWallNetworkRenderDebug?: typeof wallNetworkRenderDebug }).__kitchenWallNetworkRenderDebug =
      wallNetworkRenderDebug;

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

    const pointsClose = (a: { x: number; z: number }, b: { x: number; z: number }, eps = 1e-5) =>
      Math.hypot(a.x - b.x, a.z - b.z) <= eps;
    const segmentsClose = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      c: { x: number; z: number },
      d: { x: number; z: number }
    ) => (pointsClose(a, c) && pointsClose(b, d)) || (pointsClose(a, d) && pointsClose(b, c));
    const segmentOverlapSpan = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      c: { x: number; z: number },
      d: { x: number; z: number },
      eps = 1e-5
    ): [number, number] | null => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-12) return null;
      const lineDist = (p: { x: number; z: number }) => Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / Math.sqrt(lenSq);
      if (lineDist(c) > eps || lineDist(d) > eps) return null;
      const tc = ((c.x - a.x) * dx + (c.z - a.z) * dz) / lenSq;
      const td = ((d.x - a.x) * dx + (d.z - a.z) * dz) / lenSq;
      const start = Math.max(0, Math.min(tc, td));
      const end = Math.min(1, Math.max(tc, td));
      return end - start > eps ? [start, end] : null;
    };
    const pointOnSegment = (
      point: { x: number; z: number },
      a: { x: number; z: number },
      b: { x: number; z: number },
      eps = 0.004
    ) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-10) return Math.hypot(point.x - a.x, point.z - a.z) <= eps;
      const t = ((point.x - a.x) * dx + (point.z - a.z) * dz) / lenSq;
      if (t < -eps || t > 1 + eps) return false;
      return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)) <= eps;
    };
    const pointInOrOnPolygon = (point: { x: number; z: number }, poly: Array<{ x: number; z: number }>) => {
      if (poly.length < 3) return false;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const pi = poly[i]!;
        const pj = poly[j]!;
        if (pointOnSegment(point, pi, pj)) return true;
        const crosses = pi.z > point.z !== pj.z > point.z;
        if (crosses) {
          const xAtZ = ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x;
          if (point.x < xAtZ) inside = !inside;
        }
      }
      return inside;
    };
    const isCoveredShortCapSegment = (wallId: string | null, a: { x: number; z: number }, b: { x: number; z: number }) => {
      if (!wallId) return false;
      const source = solverInputs.find((wall) => wall.id === wallId);
      const maxLen = Math.max(0.18, (source?.thicknessM ?? 0.15) * 2.25);
      if (Math.hypot(a.x - b.x, a.z - b.z) > maxLen) return false;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      return solved.walls.some((solvedWall) => solvedWall.id !== wallId && pointInOrOnPolygon(mid, solvedWall.outline));
    };
    const isSolvedBodyJoinCapSegment = (wallId: string | null, a: { x: number; z: number }, b: { x: number; z: number }) =>
      solved.debug.solvedCaps.some((cap) => {
        if ((wallId && cap.wallId !== wallId) || cap.source !== "bodyJoin") return false;
        if (
          (pointsClose(a, cap.left, 0.004) && pointsClose(b, cap.right, 0.004)) ||
          (pointsClose(a, cap.right, 0.004) && pointsClose(b, cap.left, 0.004))
        )
          return true;
        const capPath = [cap.left, ...(cap.boundaryChain ?? []), cap.right];
        for (let index = 0; index + 1 < capPath.length; index += 1) {
          const c = capPath[index]!;
          const d = capPath[index + 1]!;
          if (
            (pointsClose(a, c, 0.004) && pointsClose(b, d, 0.004)) ||
            (pointsClose(a, d, 0.004) && pointsClose(b, c, 0.004))
          )
            return true;
        }
        return false;
      });
    const isSolvedBodyJoinBoundarySegment = (wallId: string | null, a: { x: number; z: number }, b: { x: number; z: number }) =>
      !!wallId &&
      solved.debug.solvedCaps.some((cap) => {
        if (cap.wallId !== wallId || cap.source !== "bodyJoin" || (cap.boundaryChain ?? []).length === 0) return false;
        const capPath = [cap.left, ...(cap.boundaryChain ?? []), cap.right];
        for (let index = 0; index + 1 < capPath.length; index += 1) {
          const c = capPath[index]!;
          const d = capPath[index + 1]!;
          if (
            (pointsClose(a, c, 0.004) && pointsClose(b, d, 0.004)) ||
            (pointsClose(a, d, 0.004) && pointsClose(b, c, 0.004))
          )
            return true;
        }
        return false;
      });
    const addHiddenSpan = (
      spans: Array<[number, number]>,
      a: { x: number; z: number },
      b: { x: number; z: number },
      c: { x: number; z: number },
      d: { x: number; z: number },
      eps?: number
    ) => {
      const span = segmentOverlapSpan(a, b, c, d, eps);
      if (span) spans.push(span);
    };
    const internalJoinBaseSpans = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const spans: Array<[number, number]> = [];
      for (const poly of solved.joinPolys) {
        if (poly.length === 3) addHiddenSpan(spans, a, b, poly[0], poly[1]);
        if (poly.length >= 4) addHiddenSpan(spans, a, b, poly[0], poly[poly.length - 1]);
      }
      for (const solvedWall of solved.walls) {
        const source = solverInputs.find((wall) => wall.id === solvedWall.id);
        if (!source) continue;
        for (const end of ["a", "b"] as const) {
          const solvedEnd = solvedWall[end];
          const span = segmentOverlapSpan(a, b, solvedEnd.left, solvedEnd.right);
          if (!span) continue;
          const node = solved.debug.nodes.find((item) =>
            item.incident.some((incident) => incident.wall.id === source.id && incident.end === end)
          );
          if (!node || node.incident.length < 2) continue;
          spans.push(span);
        }
      }
      return spans;
    };
    const boundarySpansOnFillSource = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const spans: Array<[number, number]> = [];
      for (const polygon of fillSource) {
        for (const ring of polygon) {
          const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
          for (let i = 0; i < pts.length; i += 1) {
            const cRaw = pts[i];
            const dRaw = pts[(i + 1) % pts.length];
            if (!cRaw || !dRaw) continue;
            addHiddenSpan(spans, a, b, { x: cRaw[0], z: cRaw[1] }, { x: dRaw[0], z: dRaw[1] }, 0.004);
          }
        }
      }
      return spans;
    };
    const isInternalJoinBaseSegment = (a: { x: number; z: number }, b: { x: number; z: number }) =>
      solved.joinPolys.length > 0 &&
      internalJoinBaseSpans(a, b).some(([start, end]) => start <= 1e-5 && end >= 1 - 1e-5) ||
      solved.joinPolys.some((poly) => {
        if (poly.length === 3) return segmentsClose(a, b, poly[0], poly[1]);
        if (poly.length >= 4) return segmentsClose(a, b, poly[0], poly[poly.length - 1]);
        return false;
      });
    const visibleSegmentParts = (a: { x: number; z: number }, b: { x: number; z: number }, spans: Array<[number, number]>) => {
      if (spans.length === 0) return [[a, b]] as Array<[{ x: number; z: number }, { x: number; z: number }]>;
      const merged = spans
        .map(([start, end]) => [Math.max(0, start), Math.min(1, end)] as [number, number])
        .filter(([start, end]) => end - start > 1e-5)
        .sort((left, right) => left[0] - right[0]);
      const compact: Array<[number, number]> = [];
      for (const span of merged) {
        const last = compact[compact.length - 1];
        if (last && span[0] <= last[1] + 1e-5) last[1] = Math.max(last[1], span[1]);
        else compact.push([...span]);
      }
      const pointAt = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      const out: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];
      let cursor = 0;
      for (const [start, end] of compact) {
        if (start - cursor > 1e-5) out.push([pointAt(cursor), pointAt(start)]);
        cursor = Math.max(cursor, end);
      }
      if (1 - cursor > 1e-5) out.push([pointAt(cursor), pointAt(1)]);
      return out;
    };
    const segmentPartsFromSpans = (a: { x: number; z: number }, b: { x: number; z: number }, spans: Array<[number, number]>) => {
      const merged = spans
        .map(([start, end]) => [Math.max(0, start), Math.min(1, end)] as [number, number])
        .filter(([start, end]) => end - start > 1e-5)
        .sort((left, right) => left[0] - right[0]);
      const compact: Array<[number, number]> = [];
      for (const span of merged) {
        const last = compact[compact.length - 1];
        if (last && span[0] <= last[1] + 1e-5) last[1] = Math.max(last[1], span[1]);
        else compact.push([...span]);
      }
      const pointAt = (t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      return compact.map(([start, end]) => [pointAt(start), pointAt(end)] as [{ x: number; z: number }, { x: number; z: number }]);
    };

    const makePlanPolyline = (
      pts: Array<{ x: number; z: number }>,
      color: number,
      y = 0.02,
      opacity = 0.98,
      showInternalJoinSegments = false,
      sourceWallId: string | null = null,
      hideBodyJoinCapSegments = false
    ) => {
      if (pts.length < 2) return null;
      const linePts: THREE.Vector3[] = [];
      const count = pts.length >= 3 ? pts.length : pts.length - 1;
      for (let i = 0; i < count; i += 1) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (
          !a ||
          !b ||
          isWindowOpeningOutlineSegment(a, b) ||
          (hideBodyJoinCapSegments && isSolvedBodyJoinCapSegment(null, a, b)) ||
          (showInternalJoinSegments && sourceWallId && isSolvedBodyJoinCapSegment(sourceWallId, a, b)) ||
          (!isSolvedBodyJoinBoundarySegment(sourceWallId, a, b) && isCoveredShortCapSegment(sourceWallId, a, b)) ||
          (!sourceWallId && !showInternalJoinSegments && isInternalJoinBaseSegment(a, b))
        )
          continue;
        const parts =
          sourceWallId && !showInternalJoinSegments
            ? segmentPartsFromSpans(a, b, boundarySpansOnFillSource(a, b))
            : sourceWallId || showInternalJoinSegments
              ? ([[a, b]] as Array<[{ x: number; z: number }, { x: number; z: number }]>)
              : visibleSegmentParts(a, b, internalJoinBaseSpans(a, b));
        for (const [start, end] of parts) {
          linePts.push(new THREE.Vector3(start.x, y, start.z), new THREE.Vector3(end.x, y, end.z));
        }
      }
      if (linePts.length < 2) return null;
      const geom = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
      );
    };

    const makePlanSegments = (
      segments: Array<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
      color: number,
      y = 0.026,
      opacity = 0.94
    ) => {
      const linePts: THREE.Vector3[] = [];
      for (const segment of segments) {
        if (Math.hypot(segment.a.x - segment.b.x, segment.a.z - segment.b.z) <= 1e-8) continue;
        linePts.push(new THREE.Vector3(segment.a.x, y, segment.a.z), new THREE.Vector3(segment.b.x, y, segment.b.z));
      }
      if (linePts.length < 2) return null;
      const geom = new THREE.BufferGeometry().setFromPoints(linePts);
      return new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
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

    const activeSelectedWallId = ctx.getSelectedKind() === "wall" ? ctx.getSelectedWallId() : null;
    // Temporary diagnostics: show every solved wall footprint so wall joins can be inspected in the live app.
    const showAllWallSolvedOutlines = ctx.getShowAllWallSolvedOutlines?.() ?? true;
    for (const wall of solved.walls) {
      const isSelectedWall = wall.id === activeSelectedWallId;
      if (!showAllWallSolvedOutlines && !isSelectedWall) continue;
      const showClosedSelectedOutline = isSelectedWall && !showAllWallSolvedOutlines;
      const showFullDiagnosticOutline = showAllWallSolvedOutlines;
      const line = makePlanPolyline(
        wall.outline,
        0x2bdc84,
        0.031,
        isSelectedWall ? 0.92 : 0.74,
        showClosedSelectedOutline || showFullDiagnosticOutline,
        showClosedSelectedOutline ? null : wall.id,
        showFullDiagnosticOutline
      );
      if (!line) continue;
      const position = line.geometry.getAttribute("position");
      const renderedSegments: Array<{ a: WallPlanPoint; b: WallPlanPoint }> = [];
      if (position) {
        for (let i = 0; i + 1 < position.count; i += 2) {
          renderedSegments.push({
            a: { x: position.getX(i), z: position.getZ(i) },
            b: { x: position.getX(i + 1), z: position.getZ(i + 1) }
          });
        }
      }
      if (isSelectedWall) {
        const selectedOutlineDebug = {
          rendererFile: "src/app/wallController.ts",
          rendererFunction: "rebuildWallPlanMesh:selectedWallOverlay",
          geometrySource: "solveWallNetwork(...).walls[].outline",
          selectedWallId: wall.id,
          solvedOutline: wall.outline.map((point) => ({ x: point.x, z: point.z })),
          storedSolvedOutline: (wallSolvedOutlines.get(wall.id) ?? []).map((point) => ({ x: point.x, z: point.z })),
          renderedSegments,
          renderedPointCount: position?.count ?? 0,
          closedByRenderer: wall.outline.length >= 3,
          closingSegment:
            wall.outline.length >= 2
              ? {
                  a: wall.outline[wall.outline.length - 1],
                  b: wall.outline[0]
                }
              : null
        };
        (globalThis as typeof globalThis & { __kitchenSelectedWallOutlineDebug?: typeof selectedOutlineDebug })
          .__kitchenSelectedWallOutlineDebug = selectedOutlineDebug;
        console.info("[wall-selected-outline-debug]", selectedOutlineDebug);
      }
      line.name = isSelectedWall ? `wallPlan_faces_${wall.id}` : `wallPlan_all_faces_${wall.id}`;
      line.userData.kind = isSelectedWall ? "wallPlanWallFaces" : "wallPlanAllSolvedFaces";
      line.userData.wallId = wall.id;
      line.userData.debugAllWalls = showAllWallSolvedOutlines && !isSelectedWall;
      line.renderOrder = isSelectedWall ? 28 : 27;
      wallPlanMeshes.set(line.name, line);
      wallPlanGroup.add(line);
    }

    let unionLineIndex = 0;
    for (const rings of fillSource) {
      for (const ring of rings) {
        const pts = (ring.length > 1 ? ring.slice(0, -1) : ring).map(([x, z]) => ({ x, z }));
        const line = makePlanPolyline(pts, 0x4f4f4f, 0.02, 0.98, true, null, true);
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

    ctx.updateSelectionHighlights?.();

    // Debug overlays
    wallDebugGroup.visible = ctx.getWallDebugEnabled();
    if (ctx.getWallDebugEnabled()) {
      const debugLayers = { ...DEFAULT_WALL_DEBUG_LAYERS, ...(ctx.getWallDebugLayers?.() ?? {}) };
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

      const mkLine = (pts: Array<{ x: number; z: number }>, color: number, y = 0.031, hideBodyJoinCapSegments = false) => {
        const renderPts: THREE.Vector3[] = [];
        if (hideBodyJoinCapSegments) {
          for (let index = 0; index + 1 < pts.length; index += 1) {
            const a = pts[index]!;
            const b = pts[index + 1]!;
            if (isSolvedBodyJoinCapSegment(null, a, b)) continue;
            renderPts.push(new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y, b.z));
          }
        } else {
          renderPts.push(...pts.map((p) => new THREE.Vector3(p.x, y, p.z)));
        }
        if (renderPts.length < 2) return;
        const g = new THREE.BufferGeometry().setFromPoints(renderPts);
        const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
        const l = hideBodyJoinCapSegments ? new THREE.LineSegments(g, m) : new THREE.Line(g, m);
        wallDebugGroup.add(l);
      };

      // centerlines + outlines
      for (const w of makeWallSolverInput()) {
        if (debugLayers.centerlines) mkLine([w.a, w.b], 0xffd166, 0.031);
        const poly = wallSolvedOutlines.get(w.id);
        if (debugLayers.perWallOutlines && poly && poly.length >= 3) {
          mkLine([...poly, poly[0]], 0x5c8cff, 0.032, true);
        }
      }

      if (debugLayers.offsetEdges) {
        for (const edge of solved.debug.offsetEdges) {
          if (isSolvedBodyJoinCapSegment(null, edge.a, edge.b)) continue;
          mkLine([edge.a, edge.b], edge.side === "cap" ? 0xff7f50 : 0x00d4ff, 0.034);
        }
      }

      if (debugLayers.capEdges) {
        for (const cap of solved.debug.solvedCaps) {
          if (cap.source === "bodyJoin") continue;
          const color = cap.source === "fallback" ? 0xff3355 : cap.end === "a" ? 0xe05cff : 0x22e6ff;
          const capPath = [cap.left, ...(cap.boundaryChain ?? []), cap.right];
          for (let index = 0; index + 1 < capPath.length; index += 1) {
            mkLine([capPath[index]!, capPath[index + 1]!], color, 0.038);
          }
          for (const point of capPath) {
            const g = new THREE.PlaneGeometry(0.026, 0.026);
            const m = new THREE.MeshBasicMaterial({ color, depthWrite: false });
            const marker = new THREE.Mesh(g, m);
            marker.rotation.x = -Math.PI / 2;
            marker.position.set(point.x, 0.04, point.z);
            wallDebugGroup.add(marker);
          }
        }
      }

      if (debugLayers.finalFootprint) {
        for (const poly of solved.debug.finalPolygons) {
          if (poly.length >= 3) mkLine([...poly, poly[0]], 0x35e07b, 0.036, true);
        }
      }

      if (debugLayers.boundaryEdges) {
        for (const edge of solved.debug.boundaryEdges) {
          if (isSolvedBodyJoinCapSegment(null, edge.a, edge.b)) continue;
          const color =
            edge.kind === "outer"
              ? 0x18d26b
              : edge.kind === "inner"
                ? 0x19a7ff
                : edge.kind === "join"
                  ? 0xff9f1c
                  : edge.kind === "cap"
                    ? 0xff5cad
                    : 0xffffff;
          const y = edge.kind === "outer" || edge.kind === "inner" ? 0.041 : 0.043;
          mkLine([edge.a, edge.b], color, y);
        }
      }

      // node markers
      if (debugLayers.joinNodes) {
        for (const n of solved.debug.nodes) {
          const g = new THREE.PlaneGeometry(0.04, 0.04);
          const m = new THREE.MeshBasicMaterial({ color: 0xff4dff, depthWrite: false });
          const p = new THREE.Mesh(g, m);
          p.rotation.x = -Math.PI / 2;
          p.position.set(n.p.x, 0.033, n.p.z);
          wallDebugGroup.add(p);
        }
      }

      if (debugLayers.intersectionPoints) {
        for (const intersection of solved.debug.intersections) {
          const g = new THREE.PlaneGeometry(0.032, 0.032);
          const m = new THREE.MeshBasicMaterial({ color: 0xfff066, depthWrite: false });
          const p = new THREE.Mesh(g, m);
          p.rotation.x = -Math.PI / 2;
          p.position.set(intersection.point.x, 0.037, intersection.point.z);
          wallDebugGroup.add(p);
        }
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
    syncWallIfcMetadata(w);

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

  function createWallInstanceFromParams(id: string, params: WallParams) {
    const root = new THREE.Group();
    root.name = `wall_${id}`;

    const mesh = createWallMesh(fromMmPoint(params.aMm), fromMmPoint(params.bMm), params.thicknessMm, params.heightMm);
    mesh.name = `wallMesh_${id}`;
    mesh.userData.kind = "wall";
    mesh.userData.wallId = id;
    root.add(mesh);

    const outline = createWallOutline(mesh.geometry as THREE.BufferGeometry, id);
    mesh.add(outline);

    const inst: WallInstance = { id, params, heightMm: params.heightMm, root, mesh, outline };
    layoutRoot.add(root);
    walls.push(inst);
    rebuildWall(inst);
    rebuildWallPlanMesh();
    return inst;
  }

  const discardWallInstance = (inst: WallInstance) => {
    layoutRoot.remove(inst.root);
    disposeObject3D(inst.root);
    const idx = walls.findIndex((w) => w.id === inst.id);
    if (idx >= 0) walls.splice(idx, 1);
  };

  function addWall(a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number): WallInstance | null {
    const id = ctx.nextWallId();
    const params: WallParams = {
      typeId: resolveWallTypeId(wallDefault),
      thicknessMm: Math.max(10, Math.round(thicknessMm)),
      heightMm: wallDefault.heightMm,
      materialId: wallDefault.materialId,
      justification: wallDefault.justification,
      exteriorSign: wallDefault.exteriorSign,
      aMm: toMmPoint(a),
      bMm: toMmPoint(b)
    };

    const inst = createWallInstanceFromParams(id, params);

    // Disallow walls intersecting any module (prevents module-wall overlap states).
    if (instances.some((i) => moduleOverlapsWalls(i))) {
      // rollback
      discardWallInstance(inst);
      rebuildWallPlanMesh();
      setUnderlayStatus("Wall blocked: would overlap a module.");
      return null;
    }

    commitHistory(S);
    return inst;
  }

  function duplicateWall(id: string, offsetMm = { x: 300, z: 300 }): WallInstance | null {
    const source = walls.find((wall) => wall.id === id) ?? null;
    if (!source || pinnedWallIds.has(source.id)) return null;

    const params = JSON.parse(JSON.stringify(source.params)) as WallParams;
    params.aMm = { x: params.aMm.x + offsetMm.x, z: params.aMm.z + offsetMm.z };
    params.bMm = { x: params.bMm.x + offsetMm.x, z: params.bMm.z + offsetMm.z };
    params.joinEnds = undefined;

    const duplicate = createWallInstanceFromParams(ctx.nextWallId(), params);
    if (instances.some((i) => moduleOverlapsWalls(i))) {
      discardWallInstance(duplicate);
      rebuildWallPlanMesh();
      setUnderlayStatus("Wall duplicate blocked: would overlap a module.");
      return null;
    }

    return duplicate;
  }

  return {
    pickAlignLineAt,
    pickDimensionLineAt,
    lineLineIntersectionXZ,
    translateWallAndConnected,
    moveWallEndpointAndConnected,
    setWallEndpointAndConnectedMm,
    setWallEndpointsAndConnectedMm,
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
    addWall,
    duplicateWall
  };
}
