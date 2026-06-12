import * as THREE from "three";
import type { FloorInstance, SelectedKind, WallInstance } from "../layout/appState";
import type { LayoutInstance } from "./localTypes";
import { getModulePlanPolygon } from "./planSnap";

type GetCamera = () => THREE.Camera;
type WallUnionRing = Array<[number, number]>;
type WallUnionPolygon = WallUnionRing[];
type WallUnionMultiPolygon = WallUnionPolygon[];

export function createToolHud(args: {
  layoutRoot: THREE.Group;
  getCamera: GetCamera;
}) {
  const toolHud = new THREE.Group();
  toolHud.name = "toolHud";
  args.layoutRoot.add(toolHud);

  const hudMatHover = new THREE.MeshBasicMaterial({ color: 0x8ab3d9, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false });
  const hudMatPick1 = new THREE.MeshBasicMaterial({ color: 0x2f78c4, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });
  const hudMatPick2 = new THREE.MeshBasicMaterial({ color: 0x5c8f44, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });
  const dashedGuideMat = new THREE.LineDashedMaterial({
    color: 0x1c8ed6,
    dashSize: 0.11,
    gapSize: 0.07,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
    depthWrite: false
  });

  const makeHudLineMesh = (mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.01, 0.01), mat);
    mesh.visible = false;
    mesh.position.y = 0.05;
    mesh.renderOrder = 80;
    toolHud.add(mesh);
    return mesh;
  };

  const hudHoverLine = makeHudLineMesh(hudMatHover);
  const hudPickLine1 = makeHudLineMesh(hudMatPick1);
  const hudPickLine2 = makeHudLineMesh(hudMatPick2);
  const hudWallEndAlignmentGuide = new THREE.Line(new THREE.BufferGeometry(), dashedGuideMat);
  hudWallEndAlignmentGuide.name = "wallEndAlignmentGuide";
  hudWallEndAlignmentGuide.visible = false;
  hudWallEndAlignmentGuide.renderOrder = 83;
  toolHud.add(hudWallEndAlignmentGuide);

  const clearToolHud = () => {
    hudHoverLine.visible = false;
    hudPickLine1.visible = false;
    hudPickLine2.visible = false;
    hudWallEndAlignmentGuide.visible = false;
  };

  const hudLineThicknessM = (rect: DOMRect) => {
    const camera = args.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) return 0.01;
    const visibleW = Math.abs(camera.right - camera.left) / Math.max(1e-6, camera.zoom);
    const worldPerPx = visibleW / Math.max(1, rect.width);
    return Math.min(0.06, Math.max(0.004, worldPerPx * 4));
  };

  const updateHudLine = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thicknessM: number) => {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-6) {
      mesh.visible = false;
      return;
    }

    const ang = Math.atan2(d.z, d.x);
    const mid = a.clone().addScaledVector(d, 0.5);
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BoxGeometry(len, 0.01, thicknessM);
    mesh.position.set(mid.x, 0.05, mid.z);
    mesh.rotation.set(0, ang, 0);
    mesh.visible = true;
  };

  const updateHudDashedLine = (line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) => {
    if (a.distanceToSquared(b) < 1e-10) {
      line.visible = false;
      return;
    }
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, 0.062, a.z),
      new THREE.Vector3(b.x, 0.062, b.z)
    ]);
    line.computeLineDistances();
    line.visible = true;
  };

  return {
    toolHud,
    hudHoverLine,
    hudWallEndAlignmentGuide,
    hudPickLine1,
    hudPickLine2,
    clearToolHud,
    hudLineThicknessM,
    updateHudDashedLine,
    updateHudLine
  };
}

export function createWallSnapMarkers(args: {
  layoutRoot: THREE.Group;
  getMode: () => string;
  getWalls: () => WallInstance[];
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
}) {
  const wallSnapMarkers = new THREE.Group();
  wallSnapMarkers.name = "wallSnapMarkers";
  wallSnapMarkers.visible = false;
  args.layoutRoot.add(wallSnapMarkers);

  const snapMatAxis = new THREE.MeshBasicMaterial({ color: 0x2f78c4, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapMatEnd = new THREE.MeshBasicMaterial({ color: 0x5f5f5f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapGeom = new THREE.CircleGeometry(0.035, 16);

  const makeSnapDot = (kind: "axis" | "endpoint") => {
    const mat = kind === "axis" ? snapMatAxis : snapMatEnd;
    const mesh = new THREE.Mesh(snapGeom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.renderOrder = 50;
    mesh.userData.kind = "snapDot";
    mesh.userData.snapKind = kind;
    return mesh;
  };

  const clearWallSnapMarkers = () => {
    for (const ch of [...wallSnapMarkers.children]) wallSnapMarkers.remove(ch);
  };

  const showWallSnapMarkersFor = (wallId: string | null) => {
    clearWallSnapMarkers();
    if (!wallId) {
      wallSnapMarkers.visible = false;
      return;
    }

    const wall = args.getWalls().find((x) => x.id === wallId) ?? null;
    if (!wall) {
      wallSnapMarkers.visible = false;
      return;
    }

    const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
    const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < 1e-6) {
      wallSnapMarkers.visible = false;
      return;
    }
    d.multiplyScalar(1 / len);

    const dotA = makeSnapDot("endpoint");
    dotA.position.x = a.x;
    dotA.position.z = a.z;
    wallSnapMarkers.add(dotA);

    const dotB = makeSnapDot("endpoint");
    dotB.position.x = b.x;
    dotB.position.z = b.z;
    wallSnapMarkers.add(dotB);

    const mid = a.clone().addScaledVector(d, len * 0.5);
    const dotM = makeSnapDot("axis");
    dotM.position.x = mid.x;
    dotM.position.z = mid.z;
    wallSnapMarkers.add(dotM);

    wallSnapMarkers.visible = args.getMode() === "layout";
  };

  return { wallSnapMarkers, clearWallSnapMarkers, showWallSnapMarkersFor };
}

export function createSelectionHighlights(args: {
  layoutRoot: THREE.Group;
  getMode: () => string;
  getWalls: () => WallInstance[];
  getSelectedWallIds: () => Set<string>;
  getSelectedInstanceIds: () => Set<string>;
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
  getWallUnionPolys?: () => WallUnionMultiPolygon | null;
  getSelectedKind: () => SelectedKind;
  getSelectedFloorId: () => string | null;
  getFloors: () => FloorInstance[];
  getInstances: () => LayoutInstance[];
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
}) {
  const selectionHighlights = new THREE.Group();
  selectionHighlights.name = "selectionHighlights";
  selectionHighlights.visible = false;
  args.layoutRoot.add(selectionHighlights);

  const updateSelectionHighlights = () => {
    for (const ch of [...selectionHighlights.children]) {
      selectionHighlights.remove(ch);
      if ("geometry" in ch && ch.geometry instanceof THREE.BufferGeometry) ch.geometry.dispose();
      if ("material" in ch) {
        const material = ch.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) for (const mat of material) mat.dispose();
        else material?.dispose();
      }
    }

    if (args.getMode() !== "layout") {
      selectionHighlights.visible = false;
      return;
    }

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
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      return Math.hypot(point.x - px, point.z - pz) <= eps;
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

    const selectedWallEdgeIsCoveredByAnotherWall = (
      wallId: string,
      a: { x: number; z: number },
      b: { x: number; z: number },
      wallThicknessM: number
    ) => {
      if (Math.hypot(b.x - a.x, b.z - a.z) > Math.max(0.18, wallThicknessM * 2.25)) return false;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      for (const [otherId, otherOutline] of args.getWallSolvedOutlines()) {
        if (otherId === wallId) continue;
        if (pointInOrOnPolygon(mid, otherOutline)) return true;
      }
      return false;
    };
    const segmentOverlapSpan = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      c: { x: number; z: number },
      d: { x: number; z: number },
      eps = 0.004
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
      return end - start > 1e-5 ? [start, end] : null;
    };
    const boundarySpansOnUnion = (a: { x: number; z: number }, b: { x: number; z: number }) => {
      const union = args.getWallUnionPolys?.() ?? null;
      if (!union || union.length === 0) return null;
      const spans: Array<[number, number]> = [];
      for (const polygon of union) {
        for (const ring of polygon) {
          const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
          for (let i = 0; i < pts.length; i += 1) {
            const cRaw = pts[i];
            const dRaw = pts[(i + 1) % pts.length];
            if (!cRaw || !dRaw) continue;
            const span = segmentOverlapSpan(a, b, { x: cRaw[0], z: cRaw[1] }, { x: dRaw[0], z: dRaw[1] });
            if (span) spans.push(span);
          }
        }
      }
      return spans;
    };
    const segmentPartsFromSpans = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      spans: Array<[number, number]>
    ) => {
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

    for (const id of args.getSelectedWallIds()) {
      const wall = args.getWalls().find((item) => item.id === id) ?? null;
      if (!wall) continue;
      const solvedOutline = args.getWallSolvedOutlines().get(id) ?? null;
      let pts: THREE.Vector3[];
      if (solvedOutline && solvedOutline.length >= 3) {
        pts = [];
        const thicknessM = Math.max(1, wall.params.thicknessMm) / 1000;
        for (let i = 0; i < solvedOutline.length; i += 1) {
          const a = solvedOutline[i]!;
          const b = solvedOutline[(i + 1) % solvedOutline.length]!;
          const unionSpans = boundarySpansOnUnion(a, b);
          if (unionSpans) {
            for (const [start, end] of segmentPartsFromSpans(a, b, unionSpans)) {
              pts.push(new THREE.Vector3(start.x, 0.018, start.z), new THREE.Vector3(end.x, 0.018, end.z));
            }
            continue;
          }
          if (selectedWallEdgeIsCoveredByAnotherWall(id, a, b, thicknessM)) continue;
          pts.push(new THREE.Vector3(a.x, 0.018, a.z), new THREE.Vector3(b.x, 0.018, b.z));
        }
      } else {
        const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0.018, wall.params.aMm.z / 1000);
        const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0.018, wall.params.bMm.z / 1000);
        const d = b.clone().sub(a);
        if (d.lengthSq() < 1e-10) continue;
        d.normalize();
        const n = new THREE.Vector3(-d.z, 0, d.x);
        const half = Math.max(1, wall.params.thicknessMm / 2) / 1000;
        pts = [
          a.clone().addScaledVector(n, half),
          a.clone().addScaledVector(n, -half),
          b.clone().addScaledVector(n, -half),
          b.clone().addScaledVector(n, half),
          a.clone().addScaledVector(n, half)
        ];
      }
      if (pts.length < 2) continue;
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
      );
      line.renderOrder = 60;
      selectionHighlights.add(line);
    }

    for (const id of args.getSelectedInstanceIds()) {
      const inst = args.getInstances().find((item) => item.id === id) ?? null;
      if (!inst) continue;
      const poly = getModulePlanPolygon(inst, args.getModuleLocalBackCenter);
      if (poly.length < 3) continue;
      const pts = poly.map((p) => p.clone().setY(0.016));
      pts.push(poly[0]!.clone().setY(0.016));
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
      );
      line.renderOrder = 60;
      selectionHighlights.add(line);
    }

    if (args.getSelectedKind() === "floor" && args.getSelectedFloorId()) {
      const floor = args.getFloors().find((x) => x.id === args.getSelectedFloorId()) ?? null;
      if (floor && floor.params.boundary.length >= 3) {
        const pts = floor.params.boundary.map((p) => new THREE.Vector3(p.x / 1000, 0.018, p.z / 1000));
        pts.push(new THREE.Vector3(floor.params.boundary[0].x / 1000, 0.018, floor.params.boundary[0].z / 1000));
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.98, depthTest: false, depthWrite: false })
        );
        line.renderOrder = 61;
        selectionHighlights.add(line);
      }
    }

    selectionHighlights.visible = selectionHighlights.children.length > 0;
  };

  return { selectionHighlights, updateSelectionHighlights };
}

export function createUnderlayController(args: {
  layoutRoot: THREE.Group;
  renderer: THREE.WebGLRenderer;
}) {
  const underlayMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const underlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), underlayMat);
  underlayMesh.name = "underlay";
  underlayMesh.userData.viewDisplaySkipEdges = true;
  underlayMesh.rotation.x = -Math.PI / 2;
  underlayMesh.position.y = 0.006;
  underlayMesh.visible = false;
  underlayMesh.renderOrder = 1;
  args.layoutRoot.add(underlayMesh);

  const underlayState = {
    sourceName: null as string | null,
    sourceKind: null as "png" | "jpg" | "pdf" | null,
    baseWidthM: 1,
    baseHeightM: 1,
    scale: 1,
    rotationDeg: 0,
    opacity: 0.65,
    offsetMm: { x: 0, z: 0 },
    pinned: false
  };

  const underlayCal = {
    active: false,
    first: null as THREE.Vector3 | null,
    knownMm: 1000,
    mode: "calibrate" as "calibrate" | "reference"
  };

  const roomBounds = {
    halfW: 3,
    halfD: 3,
    h: 3
  };

  function updateUnderlayTransform() {
    underlayMesh.scale.set(underlayState.scale, underlayState.scale, 1);
    underlayMesh.rotation.y = (underlayState.rotationDeg * Math.PI) / 180;
    underlayMat.opacity = underlayState.opacity;
    underlayMesh.position.x = underlayState.offsetMm.x / 1000;
    underlayMesh.position.z = underlayState.offsetMm.z / 1000;
    if (!underlayState.sourceName || !underlayMat.map) underlayMesh.visible = false;
  }

  function hasUnderlaySource() {
    return !!underlayState.sourceName && !!underlayMat.map;
  }

  function setUnderlayBaseSize(wM: number, hM: number) {
    underlayState.baseWidthM = Math.max(0.001, wM);
    underlayState.baseHeightM = Math.max(0.001, hM);
    underlayMesh.geometry.dispose();
    underlayMesh.geometry = new THREE.PlaneGeometry(underlayState.baseWidthM, underlayState.baseHeightM);
  }

  function setUnderlayFromCanvas(
    canvas: HTMLCanvasElement,
    name: string,
    kind: "png" | "jpg" | "pdf",
    physicalSizeMm?: { w: number; h: number } | null
  ) {
    const prev = underlayMat.map;
    if (prev) prev.dispose();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.max(1, args.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    underlayMat.map = tex;
    underlayMat.needsUpdate = true;

    if (physicalSizeMm && Number.isFinite(physicalSizeMm.w) && Number.isFinite(physicalSizeMm.h) && physicalSizeMm.w > 0 && physicalSizeMm.h > 0) {
      setUnderlayBaseSize(physicalSizeMm.w / 1000, physicalSizeMm.h / 1000);
    } else {
      const roomW = roomBounds.halfW * 2;
      const roomD = roomBounds.halfD * 2;
      const aspect = canvas.height / Math.max(1, canvas.width);

      let w = roomW;
      let h = w * aspect;
      if (h > roomD) {
        h = roomD;
        w = h / aspect;
      }

      setUnderlayBaseSize(w, h);
    }

    underlayState.sourceName = name;
    underlayState.sourceKind = kind;
    underlayState.scale = 1;
    underlayState.rotationDeg = 0;
    underlayState.opacity = 0.65;
    underlayState.offsetMm = { x: 0, z: 0 };
    underlayState.pinned = false;
    underlayMesh.visible = true;
    updateUnderlayTransform();
  }

  function clearUnderlay() {
    underlayState.sourceName = null;
    underlayState.sourceKind = null;
    underlayState.scale = 1;
    underlayState.rotationDeg = 0;
    underlayState.opacity = 0.65;
    underlayState.offsetMm = { x: 0, z: 0 };
    underlayState.pinned = false;
    underlayMesh.visible = false;
    if (underlayMat.map) {
      underlayMat.map.dispose();
      underlayMat.map = null;
    }
    underlayMat.needsUpdate = true;
    updateUnderlayTransform();
  }

  return {
    underlayMat,
    underlayMesh,
    underlayState,
    underlayCal,
    roomBounds,
    updateUnderlayTransform,
    hasUnderlaySource,
    setUnderlayBaseSize,
    setUnderlayFromCanvas,
    clearUnderlay
  };
}
