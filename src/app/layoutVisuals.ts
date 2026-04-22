import * as THREE from "three";
import type { FloorInstance, SelectedKind, WallInstance } from "../layout/appState";

type GetCamera = () => THREE.Camera;

export function createToolHud(args: {
  layoutRoot: THREE.Group;
  getCamera: GetCamera;
  getDimPreviewRoot: () => THREE.Object3D;
}) {
  const toolHud = new THREE.Group();
  toolHud.name = "toolHud";
  args.layoutRoot.add(toolHud);

  const hudMatHover = new THREE.MeshBasicMaterial({ color: 0x8ab3d9, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false });
  const hudMatPick1 = new THREE.MeshBasicMaterial({ color: 0x2f78c4, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });
  const hudMatPick2 = new THREE.MeshBasicMaterial({ color: 0x5c8f44, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });

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

  const clearToolHud = () => {
    hudHoverLine.visible = false;
    hudPickLine1.visible = false;
    hudPickLine2.visible = false;
    args.getDimPreviewRoot().visible = false;
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

  return {
    toolHud,
    hudHoverLine,
    hudPickLine1,
    hudPickLine2,
    clearToolHud,
    hudLineThicknessM,
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

  const snapMatCorner = new THREE.MeshBasicMaterial({ color: 0x5c8f44, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapMatAxis = new THREE.MeshBasicMaterial({ color: 0x2f78c4, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapMatEdge = new THREE.MeshBasicMaterial({ color: 0x8ab3d9, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapMatEnd = new THREE.MeshBasicMaterial({ color: 0x5f5f5f, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const snapGeom = new THREE.CircleGeometry(0.035, 16);

  const makeSnapDot = (kind: "corner" | "edge" | "axis" | "endpoint") => {
    const mat = kind === "corner" ? snapMatCorner : kind === "edge" ? snapMatEdge : kind === "axis" ? snapMatAxis : snapMatEnd;
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

    const poly = args.getWallSolvedOutlines().get(wallId) ?? null;
    if (poly && poly.length >= 3) {
      for (const p of poly) {
        const dot = makeSnapDot("corner");
        dot.position.x = p.x;
        dot.position.z = p.z;
        wallSnapMarkers.add(dot);
      }
    } else {
      const n = new THREE.Vector3(-d.z, 0, d.x);
      const h = Math.max(1, wall.params.thicknessMm / 2) / 1000;
      const corners = [
        a.clone().addScaledVector(n, h),
        a.clone().addScaledVector(n, -h),
        b.clone().addScaledVector(n, -h),
        b.clone().addScaledVector(n, h)
      ];
      for (const p of corners) {
        const dot = makeSnapDot("corner");
        dot.position.x = p.x;
        dot.position.z = p.z;
        wallSnapMarkers.add(dot);
      }
    }

    wallSnapMarkers.visible = args.getMode() === "layout";
  };

  return { wallSnapMarkers, clearWallSnapMarkers, showWallSnapMarkersFor };
}

export function createSelectionHighlights(args: {
  layoutRoot: THREE.Group;
  getMode: () => string;
  getSelectedWallIds: () => Set<string>;
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
  getSelectedKind: () => SelectedKind;
  getSelectedFloorId: () => string | null;
  getFloors: () => FloorInstance[];
}) {
  const selectionHighlights = new THREE.Group();
  selectionHighlights.name = "selectionHighlights";
  selectionHighlights.visible = false;
  args.layoutRoot.add(selectionHighlights);

  const updateSelectionHighlights = () => {
    for (const ch of [...selectionHighlights.children]) {
      selectionHighlights.remove(ch);
      const mesh = ch as any;
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) for (const material of mesh.material) material?.dispose?.();
      else mesh.material?.dispose?.();
    }

    if (args.getMode() !== "layout") {
      selectionHighlights.visible = false;
      return;
    }

    for (const id of args.getSelectedWallIds()) {
      const poly = args.getWallSolvedOutlines().get(id) ?? null;
      if (!poly || poly.length < 3) continue;
      const pts = poly.map((p) => new THREE.Vector3(p.x, 0.012, p.z));
      pts.push(new THREE.Vector3(poly[0].x, 0.012, poly[0].z));
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
    setUnderlayBaseSize,
    setUnderlayFromCanvas,
    clearUnderlay
  };
}
