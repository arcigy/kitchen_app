import * as THREE from "three";
import { getKitchenWorktopSegmentPolygon } from "../layout/worktopGeometry";
import type { KitchenWorktopSegmentRef } from "../layout/worktopSegmentEditing";
import type { ColumnInstance, FloorInstance, KitchenWorktopInstance, SelectedKind, WallInstance, WindowInstance } from "../layout/appState";
import type { DoorInstance, LayoutInstance, SectionInstance } from "./localTypes";
import { getModulePlanLocalPolygon } from "./planSnap";

type GetCamera = () => THREE.Camera;
type WallUnionRing = Array<[number, number]>;
type WallUnionPolygon = WallUnionRing[];
type WallUnionMultiPolygon = WallUnionPolygon[];
export type SelectionHighlightTargetKind = "module" | "kitchenGroup" | "worktop" | "wall" | "floor" | "column" | "section" | "window" | "door" | "submodule";
export type SelectionHighlightTarget =
  | { kind: Exclude<SelectionHighlightTargetKind, "submodule">; id: string }
  | { kind: "submodule"; id: string; hostInstanceId: string };

const HOVER_EDGE_COLOR = 0x1f6fff;
const SELECTED_EDGE_COLOR = 0x0f5eff;
const SELECTED_FILL_COLOR = 0x1f6fff;

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
  getViewMode?: () => "2d" | "3d";
  getWalls: () => WallInstance[];
  getSelectedWallIds: () => Set<string>;
  getSelectedInstanceIds: () => Set<string>;
  getWallSolvedOutlines: () => Map<string, Array<{ x: number; z: number }>>;
  getWallUnionPolys?: () => WallUnionMultiPolygon | null;
  getSelectedKind: () => SelectedKind;
  getSelectedKitchenGroupId?: () => string | null;
  getSelectedFloorId: () => string | null;
  getFloors: () => FloorInstance[];
  getInstances: () => LayoutInstance[];
  getKitchenWorktops?: () => KitchenWorktopInstance[];
  getSelectedColumnId?: () => string | null;
  getColumns?: () => ColumnInstance[];
  getSelectedSectionId?: () => string | null;
  getSections?: () => SectionInstance[];
  getSelectedWindow?: () => WindowInstance | null;
  getWindows?: () => WindowInstance[];
  getSelectedDoor?: () => DoorInstance | null;
  getDoors?: () => DoorInstance[];
  getSelectedSubmoduleHighlightTarget?: () => SelectionHighlightTarget | null;
  getSelectedSubmoduleHighlightTargets?: () => SelectionHighlightTarget[];
  getSelectedWorktopSegment?: () => KitchenWorktopSegmentRef | null;
  getModuleLocalBackCenter: (inst: LayoutInstance) => THREE.Vector3;
}) {
  const selectionHighlights = new THREE.Group();
  selectionHighlights.name = "selectionHighlights";
  selectionHighlights.visible = false;
  args.layoutRoot.add(selectionHighlights);

  const hoverHighlights = new THREE.Group();
  hoverHighlights.name = "hoverHighlights";
  hoverHighlights.visible = false;
  args.layoutRoot.add(hoverHighlights);

  let activeHoverKey: string | null = null;

  const disposeHighlightChildren = (group: THREE.Group) => {
    const materials = new Set<THREE.Material>();
    for (const ch of [...group.children]) {
      group.remove(ch);
      if (ch.userData.selectionHighlightSharedGeometry !== true && "geometry" in ch && ch.geometry instanceof THREE.BufferGeometry) {
        ch.geometry.dispose();
      }
      if ("material" in ch) {
        const material = ch.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) for (const mat of material) materials.add(mat);
        else if (material) materials.add(material);
      }
    }
    for (const material of materials) material.dispose();
  };

  const matrixToLayout = (source: THREE.Object3D) => {
    args.layoutRoot.updateMatrixWorld(true);
    source.updateMatrixWorld(true);
    return new THREE.Matrix4().copy(args.layoutRoot.matrixWorld).invert().multiply(source.matrixWorld);
  };

  const transformGeometryToLayout = (geometry: THREE.BufferGeometry, source: THREE.Object3D) => {
    const localGeometry = geometry.clone();
    localGeometry.applyMatrix4(matrixToLayout(source));
    return localGeometry;
  };

  const shouldSkipHighlightMesh = (mesh: THREE.Mesh) => {
    if (mesh.userData?.viewDisplaySkipMaterialRestore) return true;
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    return materials.some((item) => item.transparent && item.opacity <= 0.01);
  };

  const addObjectHighlight = (group: THREE.Group, target: THREE.Object3D, mode: "hover" | "selected") => {
    target.updateMatrixWorld(true);
    target.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!(object.geometry instanceof THREE.BufferGeometry)) return;
      if (shouldSkipHighlightMesh(object)) return;

      if (mode === "selected") {
        const fill = new THREE.Mesh(
          transformGeometryToLayout(object.geometry, object),
          new THREE.MeshBasicMaterial({
            color: SELECTED_FILL_COLOR,
            transparent: true,
            opacity: 0.2,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        );
        fill.name = "selectedFillHighlight";
        fill.renderOrder = 88;
        group.add(fill);
      }

      const edgeSource = new THREE.EdgesGeometry(object.geometry, 1);
      const edgeGeometry = transformGeometryToLayout(edgeSource, object);
      edgeSource.dispose();
      const edges = new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({
          color: mode === "hover" ? HOVER_EDGE_COLOR : SELECTED_EDGE_COLOR,
          transparent: true,
          opacity: mode === "hover" ? 0.98 : 1,
          depthTest: false,
          depthWrite: false
        })
      );
      edges.name = mode === "hover" ? "hoverEdgeHighlight" : "selectedEdgeHighlight";
      edges.renderOrder = mode === "hover" ? 96 : 90;
      group.add(edges);
    });
  };

  const addLineLikeHighlight = (group: THREE.Group, target: THREE.Object3D, mode: "hover" | "selected") => {
    target.updateMatrixWorld(true);
    target.traverse((object) => {
      if (!(object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
      if (!(object.geometry instanceof THREE.BufferGeometry) || !object.visible) return;
      const line = object instanceof THREE.LineSegments
        ? new THREE.LineSegments(
            transformGeometryToLayout(object.geometry, object),
            new THREE.LineBasicMaterial({
              color: mode === "hover" ? HOVER_EDGE_COLOR : SELECTED_EDGE_COLOR,
              transparent: true,
              opacity: mode === "hover" ? 0.98 : 1,
              depthTest: false,
              depthWrite: false
            })
          )
        : new THREE.Line(
            transformGeometryToLayout(object.geometry, object),
            new THREE.LineBasicMaterial({
              color: mode === "hover" ? HOVER_EDGE_COLOR : SELECTED_EDGE_COLOR,
              transparent: true,
              opacity: mode === "hover" ? 0.98 : 1,
              depthTest: false,
              depthWrite: false
            })
          );
      line.name = mode === "hover" ? "hoverLineHighlight" : "selectedLineHighlight";
      line.renderOrder = mode === "hover" ? 96 : 90;
      group.add(line);
    });
  };

  const addKitchenGroupModuleHighlight = (group: THREE.Group, inst: LayoutInstance, mode: "hover" | "selected") => {
    const polygon = getModulePlanLocalPolygon(inst, args.getModuleLocalBackCenter);
    if (polygon.length < 3) return;
    const shape = new THREE.Shape();
    polygon.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    shape.closePath();
    const planGeometry = new THREE.ShapeGeometry(shape);
    planGeometry.rotateX(Math.PI / 2);

    if (mode === "selected") {
      const fill = new THREE.Mesh(
        transformGeometryToLayout(planGeometry, inst.root),
        new THREE.MeshBasicMaterial({
          color: SELECTED_FILL_COLOR,
          transparent: true,
          opacity: 0.14,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      fill.name = "selectedKitchenGroupPlanFill";
      fill.renderOrder = 88;
      group.add(fill);
    }

    const edgeSource = new THREE.EdgesGeometry(planGeometry, 1);
    const edges = new THREE.LineSegments(
      transformGeometryToLayout(edgeSource, inst.root),
      new THREE.LineBasicMaterial({
        color: mode === "hover" ? HOVER_EDGE_COLOR : SELECTED_EDGE_COLOR,
        transparent: true,
        opacity: mode === "hover" ? 0.98 : 1,
        depthTest: false,
        depthWrite: false
      })
    );
    edges.name = mode === "hover" ? "hoverKitchenGroupPlanEdge" : "selectedKitchenGroupPlanEdge";
    edges.renderOrder = mode === "hover" ? 96 : 90;
    group.add(edges);
    edgeSource.dispose();
    planGeometry.dispose();
  };

  const addKitchenGroupModule3dHighlight = (group: THREE.Group, inst: LayoutInstance, mode: "hover" | "selected") => {
    if (mode === "selected") {
      const fillMaterial = new THREE.MeshBasicMaterial({
        color: SELECTED_FILL_COLOR,
        transparent: true,
        opacity: 0.2,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      inst.module.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) return;
        if (!object.visible || shouldSkipHighlightMesh(object)) return;
        const fill = new THREE.Mesh(object.geometry, fillMaterial);
        fill.name = "selectedKitchenGroup3dFill";
        fill.matrixAutoUpdate = false;
        fill.matrix.copy(matrixToLayout(object));
        fill.renderOrder = 88;
        fill.userData.selectionHighlightSharedGeometry = true;
        group.add(fill);
      });
    }

    if (!(inst.outline.geometry instanceof THREE.BufferGeometry)) return;
    const edges = new THREE.LineSegments(
      inst.outline.geometry,
      new THREE.LineBasicMaterial({
        color: mode === "hover" ? HOVER_EDGE_COLOR : SELECTED_EDGE_COLOR,
        transparent: true,
        opacity: mode === "hover" ? 0.98 : 1,
        depthTest: false,
        depthWrite: false
      })
    );
    edges.name = mode === "hover" ? "hoverKitchenGroup3dEdge" : "selectedKitchenGroup3dEdge";
    edges.matrixAutoUpdate = false;
    edges.matrix.copy(matrixToLayout(inst.outline));
    edges.renderOrder = mode === "hover" ? 96 : 90;
    edges.userData.selectionHighlightSharedGeometry = true;
    group.add(edges);
  };

  const getWorktopById = (id: string) => (args.getKitchenWorktops?.() ?? []).find((worktop) => worktop.id === id) ?? null;
  const getWindowById = (id: string) => (args.getWindows?.() ?? []).find((window) => window.id === id) ?? null;
  const getDoorById = (id: string) => (args.getDoors?.() ?? []).find((door) => door.id === id) ?? null;

  const getSubmoduleHighlightRoots = (hostInstanceId: string, submoduleId: string) => {
    const inst = args.getInstances().find((item) => item.id === hostInstanceId) ?? null;
    if (!inst) return [];
    const roots: THREE.Object3D[] = [];
    inst.module.traverse((object) => {
      if (object.userData?.selectableSubmoduleId !== submoduleId) return;
      if (object.parent?.userData?.selectableSubmoduleId === submoduleId) return;
      roots.push(object);
    });
    return roots;
  };

  const getHighlightTargets = (target: SelectionHighlightTarget): THREE.Object3D[] => {
    if (target.kind === "module") {
      const inst = args.getInstances().find((item) => item.id === target.id) ?? null;
      return inst ? [inst.module] : [];
    }
    if (target.kind === "kitchenGroup") {
      return [
        ...args.getInstances().filter((inst) => inst.kitchenGroupId === target.id).map((inst) => inst.module),
        ...(args.getKitchenWorktops?.() ?? []).filter((worktop) => worktop.kitchenGroupId === target.id).map((worktop) => worktop.mesh)
      ];
    }
    if (target.kind === "worktop") {
      const worktop = getWorktopById(target.id);
      return worktop ? [worktop.mesh] : [];
    }
    if (target.kind === "wall") {
      const wall = args.getWalls().find((item) => item.id === target.id) ?? null;
      return wall ? [wall.mesh] : [];
    }
    if (target.kind === "floor") {
      const floor = args.getFloors().find((item) => item.id === target.id) ?? null;
      return floor ? [floor.mesh] : [];
    }
    if (target.kind === "column") {
      const column = (args.getColumns?.() ?? []).find((item) => item.id === target.id) ?? null;
      return column ? [column.mesh] : [];
    }
    if (target.kind === "section") {
      const section = (args.getSections?.() ?? []).find((item) => item.id === target.id) ?? null;
      return section ? [section.line, section.arrows] : [];
    }
    if (target.kind === "window") {
      const window = getWindowById(target.id) ?? args.getSelectedWindow?.() ?? null;
      return window ? [window.root] : [];
    }
    if (target.kind === "door") {
      const door = getDoorById(target.id) ?? args.getSelectedDoor?.() ?? null;
      return door ? [door.root] : [];
    }
    if (target.kind === "submodule") {
      return getSubmoduleHighlightRoots(target.hostInstanceId, target.id);
    }
    return [];
  };

  const addTargetsHighlight = (group: THREE.Group, targets: SelectionHighlightTarget[], mode: "hover" | "selected") => {
    for (const target of targets) {
      if (target.kind === "kitchenGroup") {
        for (const inst of args.getInstances()) {
          if (inst.kitchenGroupId !== target.id) continue;
          if (args.getViewMode?.() === "3d") addKitchenGroupModule3dHighlight(group, inst, mode);
          else addKitchenGroupModuleHighlight(group, inst, mode);
        }
        for (const worktop of args.getKitchenWorktops?.() ?? []) {
          if (worktop.kitchenGroupId !== target.id) continue;
          addObjectHighlight(group, worktop.mesh, mode);
        }
        continue;
      }
      for (const object of getHighlightTargets(target)) {
        addObjectHighlight(group, object, mode);
        addLineLikeHighlight(group, object, mode);
      }
    }
  };

  const selectedTargets = (): SelectionHighlightTarget[] => {
    const targets: SelectionHighlightTarget[] = [];
    const selectedInstanceIds = args.getSelectedInstanceIds();
    const fallbackSubmoduleTarget = args.getSelectedSubmoduleHighlightTarget?.() ?? null;
    const selectedSubmoduleTargets = args.getSelectedSubmoduleHighlightTargets?.() ?? (fallbackSubmoduleTarget ? [fallbackSubmoduleTarget] : []);
    const selectedSubmoduleHostIds = new Set(selectedSubmoduleTargets.filter((target) => target.kind === "submodule").map((target) => target.hostInstanceId));
    for (const id of args.getSelectedWallIds()) targets.push({ kind: "wall", id });
    const selectedKitchenGroupId = args.getSelectedKind() === "kitchenGroup" ? args.getSelectedKitchenGroupId?.() ?? null : null;
    if (!selectedKitchenGroupId) {
      for (const id of selectedInstanceIds) {
        if (!selectedSubmoduleHostIds.has(id)) targets.push({ kind: "module", id });
      }
    }
    targets.push(...selectedSubmoduleTargets.filter((target) => target.kind === "submodule"));
    if (selectedKitchenGroupId) targets.push({ kind: "kitchenGroup", id: selectedKitchenGroupId });
    const selectedFloorId = args.getSelectedKind() === "floor" ? args.getSelectedFloorId() : null;
    if (selectedFloorId) targets.push({ kind: "floor", id: selectedFloorId });
    const selectedColumnId = args.getSelectedKind() === "column" ? args.getSelectedColumnId?.() ?? null : null;
    if (selectedColumnId) targets.push({ kind: "column", id: selectedColumnId });
    const selectedSectionId = args.getSelectedKind() === "section" ? args.getSelectedSectionId?.() ?? null : null;
    if (selectedSectionId) targets.push({ kind: "section", id: selectedSectionId });
    const selectedWindow = args.getSelectedKind() === "window" ? args.getSelectedWindow?.() ?? null : null;
    if (selectedWindow) targets.push({ kind: "window", id: selectedWindow.id });
    const selectedDoor = args.getSelectedKind() === "door" ? args.getSelectedDoor?.() ?? null : null;
    if (selectedDoor) targets.push({ kind: "door", id: selectedDoor.id });
    return targets;
  };

  const selectionSourceSignature = (targets: SelectionHighlightTarget[]) => {
    const parts: Array<string | number | boolean> = [args.getMode()];
    for (const target of targets) {
      parts.push(target.kind, target.id);
      if (target.kind === "submodule") parts.push(target.hostInstanceId);
      const objects = getHighlightTargets(target);
      parts.push(objects.length);
      for (const object of objects) {
        object.updateWorldMatrix(true, true);
        parts.push(object.uuid, object.visible);
        for (const value of object.matrixWorld.elements) parts.push(Math.round(value * 1_000_000));
        if (target.kind === "module" || target.kind === "kitchenGroup" || target.kind === "worktop") {
          if ((object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) && object.geometry) {
            parts.push(object.geometry.uuid);
          }
          continue;
        }
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) return;
          const geometry = child.geometry;
          if (!(geometry instanceof THREE.BufferGeometry)) return;
          const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
          parts.push(
            child.uuid,
            geometry.uuid,
            (geometry as THREE.BufferGeometry & { version?: number }).version ?? -1,
            position?.version ?? -1,
            position?.count ?? 0,
            child.visible
          );
        });
      }
    }
    return parts.join("|");
  };

  const getSelectionBounds = () => {
    const box = new THREE.Box3();
    const selectedWorktopSegment = args.getSelectedWorktopSegment?.() ?? null;
    if (selectedWorktopSegment) {
      const worktop = getWorktopById(selectedWorktopSegment.worktopId);
      if (worktop) {
        const polygon = getKitchenWorktopSegmentPolygon(worktop.params, selectedWorktopSegment.segmentIndex);
        const bottomY = worktop.params.heightMm / 1000 - worktop.params.thicknessMm / 1000;
        const topY = worktop.params.heightMm / 1000;
        worktop.root.updateMatrixWorld(true);
        for (const point of polygon) {
          box.expandByPoint(worktop.root.localToWorld(new THREE.Vector3(point.x, bottomY, point.z)));
          box.expandByPoint(worktop.root.localToWorld(new THREE.Vector3(point.x, topY, point.z)));
        }
      }
      if (!box.isEmpty()) return box;
    }

    for (const target of selectedTargets()) {
      for (const object of getHighlightTargets(target)) box.expandByObject(object);
    }
    return box.isEmpty() ? null : box;
  };

  const updateSelectionHover = (target: SelectionHighlightTarget | null) => {
    const nextKey = target ? `${target.kind}:${target.id}` : null;
    if (nextKey === activeHoverKey) return;
    activeHoverKey = nextKey;
    disposeHighlightChildren(hoverHighlights);
    if (!target || args.getMode() !== "layout") {
      hoverHighlights.visible = false;
      return;
    }
    addTargetsHighlight(hoverHighlights, [target], "hover");
    hoverHighlights.visible = hoverHighlights.children.length > 0;
  };

  let activeSelectionSourceSignature = "";

  const rebuildSelectionHighlights = (targets: SelectionHighlightTarget[]) => {
    disposeHighlightChildren(selectionHighlights);

    if (args.getMode() !== "layout") {
      selectionHighlights.visible = false;
      return;
    }

    addTargetsHighlight(selectionHighlights, targets, "selected");
    selectionHighlights.visible = selectionHighlights.children.length > 0;
  };

  const updateSelectionHighlights = () => {
    const targets = selectedTargets();
    rebuildSelectionHighlights(targets);
    activeSelectionSourceSignature = selectionSourceSignature(targets);
  };

  const syncSelectionHighlights = () => {
    const targets = selectedTargets();
    const signature = selectionSourceSignature(targets);
    if (signature === activeSelectionSourceSignature) return false;
    rebuildSelectionHighlights(targets);
    activeSelectionSourceSignature = signature;
    return true;
  };

  return {
    selectionHighlights,
    hoverHighlights,
    getSelectionBounds,
    updateSelectionHighlights,
    syncSelectionHighlights,
    updateSelectionHover
  };
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
