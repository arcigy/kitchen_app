import * as THREE from "three";
import { worldToScreen } from "./sharedUtils";
import { distPxPointToSeg } from "./screenGeometry";
import {
  floorPointToWorld,
  makeFloorCirclePoints
} from "./floorBoundaryEdit";
import type {
  FloorBoundaryPoint,
  FloorBoundarySegment,
  FloorBoundaryTool,
  FloorEditDrag,
  FloorEditVertexRef
} from "./localTypes";

export type FloorBoundaryEditVisualState = {
  active: boolean;
  segments: FloorBoundarySegment[];
  tool: FloorBoundaryTool;
  first: FloorBoundaryPoint | null;
  hover: FloorBoundaryPoint | null;
  selectedSegmentIndex: number | null;
  selectedVertex: FloorEditVertexRef | null;
  drag: FloorEditDrag | null;
};

export function clearFloorBoundaryGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child);
    const anyChild = child as any;
    anyChild.geometry?.dispose?.();
    if (Array.isArray(anyChild.material)) for (const mat of anyChild.material) mat?.dispose?.();
    else anyChild.material?.dispose?.();
  }
}

function addFloorBoundaryLineMesh(
  group: THREE.Group,
  a: FloorBoundaryPoint,
  b: FloorBoundaryPoint,
  color = 0x00e5ff,
  opacity = 0.95
) {
  const geom = new THREE.BufferGeometry().setFromPoints([floorPointToWorld(a), floorPointToWorld(b)]);
  const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  line.renderOrder = 90;
  group.add(line);
}

function addFloorBoundaryPointMesh(group: THREE.Group, p: FloorBoundaryPoint, selected: boolean) {
  const geom = new THREE.CircleGeometry(selected ? 0.055 : 0.04, 16);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({ color: selected ? 0xffd166 : 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  mesh.position.copy(floorPointToWorld(p, 0.058));
  mesh.renderOrder = 95;
  group.add(mesh);
}

export function renderFloorBoundaryEdit(opts: {
  group: THREE.Group;
  floorEdit: FloorBoundaryEditVisualState;
}) {
  const { group, floorEdit } = opts;
  clearFloorBoundaryGroup(group);
  for (let i = 0; i < floorEdit.segments.length; i++) {
    const segment = floorEdit.segments[i];
    addFloorBoundaryLineMesh(group, segment.a, segment.b, floorEdit.selectedSegmentIndex === i ? 0xffd166 : 0x00e5ff);
    addFloorBoundaryPointMesh(group, segment.a, floorEdit.selectedVertex?.segmentIndex === i && floorEdit.selectedVertex.endpoint === "a");
    addFloorBoundaryPointMesh(group, segment.b, floorEdit.selectedVertex?.segmentIndex === i && floorEdit.selectedVertex.endpoint === "b");
  }

  if (floorEdit.first && floorEdit.hover) {
    if (floorEdit.tool === "rectangle") {
      const a = floorEdit.first;
      const b = floorEdit.hover;
      const p1 = { x: a.x, z: a.z };
      const p2 = { x: b.x, z: a.z };
      const p3 = { x: b.x, z: b.z };
      const p4 = { x: a.x, z: b.z };
      for (const [start, end] of [[p1, p2], [p2, p3], [p3, p4], [p4, p1]] as Array<[FloorBoundaryPoint, FloorBoundaryPoint]>) {
        addFloorBoundaryLineMesh(group, start, end, 0xffd166, 0.75);
      }
    } else if (floorEdit.tool === "circle") {
      const points = makeFloorCirclePoints(floorEdit.first, floorEdit.hover);
      for (let i = 0; i < points.length; i++) addFloorBoundaryLineMesh(group, points[i], points[(i + 1) % points.length], 0xffd166, 0.75);
    } else {
      addFloorBoundaryLineMesh(group, floorEdit.first, floorEdit.hover, 0xffd166, 0.75);
    }
  }

  group.visible = floorEdit.active;
}

export function pickFloorEditElement(opts: {
  floorEdit: FloorBoundaryEditVisualState;
  mousePx: { x: number; y: number };
  rect: DOMRect;
  camera: THREE.Camera;
}) {
  const { floorEdit, mousePx, rect, camera } = opts;
  let bestVertex: { ref: FloorEditVertexRef; px: number } | null = null;
  for (let i = 0; i < floorEdit.segments.length; i++) {
    for (const endpoint of ["a", "b"] as const) {
      const p = floorEdit.segments[i][endpoint];
      const s = worldToScreen(floorPointToWorld(p), camera, rect);
      const px = Math.hypot(mousePx.x - s.x, mousePx.y - s.y);
      if (px <= 12 && (!bestVertex || px < bestVertex.px)) bestVertex = { ref: { segmentIndex: i, endpoint }, px };
    }
  }
  if (bestVertex) return { kind: "vertex" as const, ref: bestVertex.ref };

  let bestSegment: { segmentIndex: number; px: number } | null = null;
  for (let i = 0; i < floorEdit.segments.length; i++) {
    const segment = floorEdit.segments[i];
    const a = worldToScreen(floorPointToWorld(segment.a), camera, rect);
    const b = worldToScreen(floorPointToWorld(segment.b), camera, rect);
    const px = distPxPointToSeg(mousePx.x, mousePx.y, a.x, a.y, b.x, b.y);
    if (px <= 10 && (!bestSegment || px < bestSegment.px)) bestSegment = { segmentIndex: i, px };
  }
  if (bestSegment) return { kind: "segment" as const, segmentIndex: bestSegment.segmentIndex };
  return null;
}
