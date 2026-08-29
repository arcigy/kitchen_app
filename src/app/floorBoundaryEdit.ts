import * as THREE from "three";
import type { AlignPickedLine, FloorBoundaryPoint, FloorBoundarySegment, FloorBoundaryTool, FloorEditDrag, FloorEditVertexRef, PickedLine2D } from "./localTypes";

export type FloorBoundaryEditPointerState = {
  drag: FloorEditDrag | null;
  error: string;
  first: FloorBoundaryPoint | null;
  hover: FloorBoundaryPoint | null;
  ortho: boolean;
  selectedSegmentIndex: number | null;
  selectedVertex: FloorEditVertexRef | null;
  segments: FloorBoundarySegment[];
  tool: FloorBoundaryTool;
};

export type PickedFloorBoundaryEditElement =
  | { kind: "vertex"; ref: FloorEditVertexRef }
  | { kind: "segment"; segmentIndex: number };

export function floorPointDistMm(a: FloorBoundaryPoint, b: FloorBoundaryPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function floorPointEq(a: FloorBoundaryPoint, b: FloorBoundaryPoint, tolMm = 3) {
  return floorPointDistMm(a, b) <= tolMm;
}

export function worldToFloorPoint(point: THREE.Vector3): FloorBoundaryPoint {
  return { x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) };
}

export function floorPointToWorld(point: FloorBoundaryPoint, y = 0.055) {
  return new THREE.Vector3(point.x / 1000, y, point.z / 1000);
}

export function cloneFloorSegments(segments: FloorBoundarySegment[]) {
  return segments.map((segment) => ({ a: { ...segment.a }, b: { ...segment.b } }));
}

export function floorOrthoPoint(start: FloorBoundaryPoint, raw: FloorBoundaryPoint, enabled: boolean) {
  if (!enabled) return raw;
  const dx = raw.x - start.x;
  const dz = raw.z - start.z;
  return Math.abs(dx) >= Math.abs(dz) ? { x: raw.x, z: start.z } : { x: start.x, z: raw.z };
}

export function moveFloorEditVertex(
  startSegments: FloorBoundarySegment[],
  startPoint: FloorBoundaryPoint,
  nextPoint: FloorBoundaryPoint
) {
  return startSegments.map((segment) => ({
    a: floorPointEq(segment.a, startPoint) ? { ...nextPoint } : { ...segment.a },
    b: floorPointEq(segment.b, startPoint) ? { ...nextPoint } : { ...segment.b }
  }));
}

export function moveFloorEditSegment(
  startSegments: FloorBoundarySegment[],
  segmentIndex: number,
  startWorld: FloorBoundaryPoint,
  nextWorld: FloorBoundaryPoint
) {
  const segment = startSegments[segmentIndex];
  if (!segment) return cloneFloorSegments(startSegments);

  const dx = nextWorld.x - startWorld.x;
  const dz = nextWorld.z - startWorld.z;
  const nextA = { x: segment.a.x + dx, z: segment.a.z + dz };
  const nextB = { x: segment.b.x + dx, z: segment.b.z + dz };

  return startSegments.map((item) => ({
    a: floorPointEq(item.a, segment.a) ? { ...nextA } : floorPointEq(item.a, segment.b) ? { ...nextB } : { ...item.a },
    b: floorPointEq(item.b, segment.a) ? { ...nextA } : floorPointEq(item.b, segment.b) ? { ...nextB } : { ...item.b }
  }));
}

export function floorBoundaryToSegments(boundary: FloorBoundaryPoint[]) {
  const segments: FloorBoundarySegment[] = [];
  for (let index = 0; index < boundary.length; index += 1) {
    const a = boundary[index];
    const b = boundary[(index + 1) % boundary.length];
    segments.push({ a: { ...a }, b: { ...b } });
  }
  return segments;
}

export function floorSegmentsToBoundary(segments: FloorBoundarySegment[]) {
  if (segments.length < 3) return null as FloorBoundaryPoint[] | null;

  const remaining = cloneFloorSegments(segments);
  const first = remaining.shift()!;
  const boundary: FloorBoundaryPoint[] = [{ ...first.a }, { ...first.b }];
  let closed = false;

  while (remaining.length > 0) {
    const current = boundary[boundary.length - 1];
    const index = remaining.findIndex((segment) => floorPointEq(segment.a, current) || floorPointEq(segment.b, current));
    if (index < 0) break;

    const [next] = remaining.splice(index, 1);
    boundary.push(floorPointEq(next.a, current) ? { ...next.b } : { ...next.a });
    if (boundary.length >= 4 && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
      boundary.pop();
      closed = true;
      break;
    }
  }

  if (!closed && floorPointEq(boundary[boundary.length - 1], boundary[0])) {
    boundary.pop();
    closed = true;
  }
  if (boundary.length < 3) return null;
  if (!closed) return null;
  if (remaining.length > 0) return null;
  return boundary;
}

export function makeFloorCirclePoints(center: FloorBoundaryPoint, edge: FloorBoundaryPoint, segments = 48) {
  const radius = Math.max(1, floorPointDistMm(center, edge));
  const points: FloorBoundaryPoint[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push({
      x: Math.round(center.x + Math.cos(angle) * radius),
      z: Math.round(center.z + Math.sin(angle) * radius)
    });
  }
  return points;
}

export function handleFloorBoundaryEditPointerDown(args: {
  addFloorEditSegment: (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => void;
  button: number;
  cloneFloorSegments: (segments: FloorBoundarySegment[]) => FloorBoundarySegment[];
  floorEdit: FloorBoundaryEditPointerState;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  floorPointEq: (a: FloorBoundaryPoint, b: FloorBoundaryPoint, tolMm?: number) => boolean;
  makeFloorCirclePoints: (center: FloorBoundaryPoint, edge: FloorBoundaryPoint) => FloorBoundaryPoint[];
  mountProps: () => void;
  pickedEdit: PickedFloorBoundaryEditElement | null;
  point: FloorBoundaryPoint | null;
  pointerId: number;
  renderFloorBoundaryEdit: () => void;
  resolvePickedLineSegment: () => FloorBoundarySegment | null;
  setPointerCapture: (pointerId: number) => void;
  setUnderlayStatus: (status: string) => void;
}) {
  if (args.button !== 0) return false;
  if (!args.point) return false;

  const { floorEdit, point } = args;

  if (args.pickedEdit) {
    floorEdit.first = null;
    floorEdit.hover = null;
    floorEdit.error = "";
    if (args.pickedEdit.kind === "vertex") {
      const startPoint = { ...floorEdit.segments[args.pickedEdit.ref.segmentIndex][args.pickedEdit.ref.endpoint] };
      floorEdit.selectedVertex = args.pickedEdit.ref;
      floorEdit.selectedSegmentIndex = null;
      floorEdit.drag = {
        pointerId: args.pointerId,
        kind: "vertex",
        startPoint,
        startSegments: args.cloneFloorSegments(floorEdit.segments)
      };
    } else {
      floorEdit.selectedSegmentIndex = args.pickedEdit.segmentIndex;
      floorEdit.selectedVertex = null;
      floorEdit.drag = {
        pointerId: args.pointerId,
        kind: "segment",
        segmentIndex: args.pickedEdit.segmentIndex,
        startWorld: point,
        startSegments: args.cloneFloorSegments(floorEdit.segments)
      };
    }
    args.renderFloorBoundaryEdit();
    args.setPointerCapture(args.pointerId);
    args.mountProps();
    return true;
  }

  floorEdit.selectedSegmentIndex = null;
  floorEdit.selectedVertex = null;

  if (floorEdit.tool === "pickLines") {
    const picked = args.resolvePickedLineSegment();
    if (!picked) {
      args.setUnderlayStatus("Floor boundary: edge was not found.");
      return true;
    }
    args.addFloorEditSegment(picked.a, picked.b);
    args.setUnderlayStatus("Floor boundary: edge added.");
    return true;
  }

  if (!floorEdit.first) {
    floorEdit.first = point;
    floorEdit.hover = point;
    args.renderFloorBoundaryEdit();
    return true;
  }

  if (floorEdit.tool === "rectangle") {
    const a = floorEdit.first;
    const b = floorEdit.ortho ? args.floorOrthoPoint(a, point) : point;
    const p1 = { x: a.x, z: a.z };
    const p2 = { x: b.x, z: a.z };
    const p3 = { x: b.x, z: b.z };
    const p4 = { x: a.x, z: b.z };
    floorEdit.segments.push({ a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p4 }, { a: p4, b: p1 });
    floorEdit.first = null;
    floorEdit.hover = null;
    args.renderFloorBoundaryEdit();
    return true;
  }

  if (floorEdit.tool === "circle") {
    const points = args.makeFloorCirclePoints(floorEdit.first, point);
    for (let i = 0; i < points.length; i++) floorEdit.segments.push({ a: points[i], b: points[(i + 1) % points.length] });
    floorEdit.first = null;
    floorEdit.hover = null;
    args.renderFloorBoundaryEdit();
    return true;
  }

  const start = floorEdit.first;
  const rawEnd = floorEdit.ortho ? args.floorOrthoPoint(start, point) : point;
  const end = floorEdit.segments.length >= 2 && floorEdit.segments[0] && args.floorPointEq(rawEnd, floorEdit.segments[0].a, 12) ? floorEdit.segments[0].a : rawEnd;
  args.addFloorEditSegment(start, end);
  floorEdit.first = args.floorPointEq(end, floorEdit.segments[0]?.a ?? end, 3) ? null : end;
  floorEdit.hover = floorEdit.first;
  args.renderFloorBoundaryEdit();
  return true;
}

export function finishFloorBoundaryEditDragPointerUp(args: {
  floorEdit: FloorBoundaryEditPointerState;
  mountProps: () => void;
  pointerId: number;
  releasePointerCapture: (pointerId: number) => void;
  renderFloorBoundaryEdit: () => void;
}) {
  if (!args.floorEdit.drag || args.floorEdit.drag.pointerId !== args.pointerId) return false;

  args.floorEdit.drag = null;
  args.renderFloorBoundaryEdit();
  args.mountProps();
  args.releasePointerCapture(args.pointerId);
  return true;
}

export function updateFloorBoundaryEditPointerMove(args: {
  floorEdit: FloorBoundaryEditPointerState;
  floorPoint: FloorBoundaryPoint | null;
  hitPoint: THREE.Vector3 | null;
  pointerId: number;
  rect: DOMRect;
  mouse: { x: number; y: number } | null;
  camera: THREE.Camera;
  hudHoverLine: THREE.Mesh;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  moveFloorEditVertex: (
    startSegments: FloorBoundarySegment[],
    startPoint: FloorBoundaryPoint,
    floorPoint: FloorBoundaryPoint
  ) => void;
  moveFloorEditSegment: (
    startSegments: FloorBoundarySegment[],
    segmentIndex: number,
    startWorld: FloorBoundaryPoint,
    floorPoint: FloorBoundaryPoint
  ) => void;
  pickWallLine2D: (hitPoint: THREE.Vector3, rect: DOMRect, camera: THREE.Camera, thresholdPx: number) => PickedLine2D | null;
  pickAlignLineAt: (hitPoint: THREE.Vector3, mouse: { x: number; y: number }, rect: DOMRect) => AlignPickedLine | null;
  updateHudLine: (hud: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thickness: number) => void;
  hudLineThickness: number;
  renderFloorBoundaryEdit: () => void;
}): boolean {
  if (!args.floorPoint || !args.hitPoint) return false;

  const activeFloorDrag = args.floorEdit.drag;
  if (activeFloorDrag && activeFloorDrag.pointerId === args.pointerId) {
    if (activeFloorDrag.kind === "vertex") {
      args.moveFloorEditVertex(activeFloorDrag.startSegments, activeFloorDrag.startPoint, args.floorPoint);
    } else {
      args.moveFloorEditSegment(activeFloorDrag.startSegments, activeFloorDrag.segmentIndex, activeFloorDrag.startWorld, args.floorPoint);
    }
    args.floorEdit.error = "";
    args.renderFloorBoundaryEdit();
    return true;
  }

  if (args.floorEdit.tool === "pickLines") {
    const picked = args.pickWallLine2D(args.hitPoint, args.rect, args.camera, 14);
    const alignPicked = args.mouse ? args.pickAlignLineAt(args.hitPoint, args.mouse, args.rect) : null;
    const a = picked?.a ?? alignPicked?.segA ?? null;
    const b = picked?.b ?? alignPicked?.segB ?? null;
    if (a && b) args.updateHudLine(args.hudHoverLine, a, b, args.hudLineThickness);
    else args.hudHoverLine.visible = false;
  } else {
    args.hudHoverLine.visible = false;
  }

  if (args.floorEdit.first) {
    args.floorEdit.hover = args.floorEdit.ortho ? args.floorOrthoPoint(args.floorEdit.first, args.floorPoint) : args.floorPoint;
    args.renderFloorBoundaryEdit();
  }
  return true;
}
