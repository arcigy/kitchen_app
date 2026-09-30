import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { customBoardProfilePolygons } from "./customBoardProfile";
import type {
  CustomFurnitureBoardJustification,
  CustomFurnitureBoardParams,
  CustomFurniturePlanPoint,
  CustomFurnitureProfilePoint
} from "./customFurnitureTypes";
import { recipeThicknessMm } from "../core/project-manufacturing/project-manufacturing-types";

const MIN_POINT_DISTANCE_MM = 1;

export function cloneCustomFurniturePlanPoint(point: CustomFurniturePlanPoint): CustomFurniturePlanPoint {
  return { x: Math.round(point.x), z: Math.round(point.z) };
}

export function cloneCustomFurnitureProfilePoint(point: CustomFurnitureProfilePoint): CustomFurnitureProfilePoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function sanitizeCustomFurniturePlanPolygon(points: CustomFurniturePlanPoint[]): CustomFurniturePlanPoint[] {
  const out: CustomFurniturePlanPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    const next = cloneCustomFurniturePlanPoint(point);
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - next.x, prev.z - next.z) < MIN_POINT_DISTANCE_MM) continue;
    out.push(next);
  }
  if (out.length > 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.x - last.x, first.z - last.z) < MIN_POINT_DISTANCE_MM) out.pop();
  }
  return out;
}

export function sanitizeCustomFurnitureProfile(points: CustomFurnitureProfilePoint[]): CustomFurnitureProfilePoint[] {
  const out: CustomFurnitureProfilePoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const next = cloneCustomFurnitureProfilePoint(point);
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - next.x, prev.y - next.y) < MIN_POINT_DISTANCE_MM) continue;
    out.push(next);
  }
  if (out.length > 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first.x - last.x, first.y - last.y) < MIN_POINT_DISTANCE_MM) out.pop();
  }
  return out;
}

export function polygonAreaMm2(points: CustomFurnitureProfilePoint[]): number {
  const profile = sanitizeCustomFurnitureProfile(points);
  if (profile.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const a = profile[index]!;
    const b = profile[(index + 1) % profile.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export function polygonEdgeLengthMm(points: CustomFurnitureProfilePoint[], edgeIndex: number): number {
  const profile = sanitizeCustomFurnitureProfile(points);
  if (profile.length < 2) return 0;
  const index = ((Math.round(edgeIndex) % profile.length) + profile.length) % profile.length;
  const a = profile[index]!;
  const b = profile[(index + 1) % profile.length]!;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonBoundsMm(points: CustomFurnitureProfilePoint[]) {
  const profile = sanitizeCustomFurnitureProfile(points);
  if (profile.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, widthMm: 0, heightMm: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of profile) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY, widthMm: maxX - minX, heightMm: maxY - minY };
}

function triangulateProfile(profile: CustomFurnitureProfilePoint[], holes: CustomFurnitureProfilePoint[][] = []) {
  const vertices = profile.map((point) => new THREE.Vector2(point.x / 1000, point.y / 1000));
  return THREE.ShapeUtils.triangulateShape(vertices, holes.map(ring => ring.map(p => new THREE.Vector2(p.x / 1000, p.y / 1000))));
}

function justificationOffsets(thicknessM: number, justification: CustomFurnitureBoardJustification): [number, number] {
  if (justification === "negative") return [-thicknessM, 0];
  if (justification === "positive") return [0, thicknessM];
  return [-thicknessM / 2, thicknessM / 2];
}

function makePrismGeometry(pointsA: THREE.Vector3[], pointsB: THREE.Vector3[], profile: CustomFurnitureProfilePoint[], holes: CustomFurnitureProfilePoint[][] = []) {
  const count = pointsA.length;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const point of pointsA) vertices.push(point.x, point.y, point.z);
  for (const point of pointsB) vertices.push(point.x, point.y, point.z);

  const triangles = triangulateProfile(profile, holes);
  for (const tri of triangles) {
    indices.push(tri[2]!, tri[1]!, tri[0]!);
    indices.push(count + tri[0]!, count + tri[1]!, count + tri[2]!);
  }

  let ringOffset = 0;
  for (const ring of [profile, ...holes]) {
  for (let i = 0; i < ring.length; i += 1) {
    const index = ringOffset + i;
    const next = ringOffset + (i + 1) % ring.length;
    const a0 = index;
    const a1 = next;
    const b0 = count + index;
    const b1 = count + next;
    indices.push(a0, a1, b1, a0, b1, b0);
  }
  ringOffset += ring.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeVerticalPathGeometry(
  path: CustomFurniturePlanPoint[],
  baseMm: number,
  topMm: number,
  thicknessM: number,
  justification: CustomFurnitureBoardJustification,
  mirrored: boolean
) {
  const cleanPath = sanitizeCustomFurniturePlanPolygon(path);
  if (cleanPath.length < 2) return new THREE.BoxGeometry(0.001, 0.001, 0.001);
  const [offsetA, offsetB] = justificationOffsets(thicknessM, justification);
  const y0 = baseMm / 1000;
  const y1 = topMm / 1000;
  const vertices: number[] = [];
  const indices: number[] = [];
  const sideAt = (index: number) => {
    const prev = cleanPath[Math.max(0, index - 1)]!;
    const next = cleanPath[Math.min(cleanPath.length - 1, index + 1)]!;
    const dir = new THREE.Vector3((next.x - prev.x) / 1000, 0, (next.z - prev.z) / 1000);
    if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0);
    dir.normalize();
    return new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(mirrored ? -1 : 1);
  };
  for (let index = 0; index < cleanPath.length; index += 1) {
    const point = cleanPath[index]!;
    const center = new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
    const side = sideAt(index);
    const left = center.clone().addScaledVector(side, offsetA);
    const right = center.clone().addScaledVector(side, offsetB);
    vertices.push(left.x, y0, left.z, right.x, y0, right.z, left.x, y1, left.z, right.x, y1, right.z);
  }
  const addQuad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  for (let index = 0; index < cleanPath.length - 1; index += 1) {
    const current = index * 4;
    const next = (index + 1) * 4;
    addQuad(current, next, next + 2, current + 2);
    addQuad(current + 1, current + 3, next + 3, next + 1);
    addQuad(current + 2, next + 2, next + 3, current + 3);
    addQuad(current, current + 1, next + 1, next);
  }
  const last = (cleanPath.length - 1) * 4;
  addQuad(0, 2, 3, 1);
  addQuad(last, last + 1, last + 3, last + 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function verticalPathFrames(
  path: CustomFurniturePlanPoint[],
  baseMm: number,
  topMm: number,
  thicknessM: number,
  justification: CustomFurnitureBoardJustification,
  mirrored: boolean
) {
  const cleanPath = sanitizeCustomFurniturePlanPolygon(path);
  const [offsetA, offsetB] = justificationOffsets(thicknessM, justification);
  const y0 = baseMm / 1000;
  const y1 = topMm / 1000;
  const sideAt = (index: number) => {
    const prev = cleanPath[Math.max(0, index - 1)]!;
    const next = cleanPath[Math.min(cleanPath.length - 1, index + 1)]!;
    const dir = new THREE.Vector3((next.x - prev.x) / 1000, 0, (next.z - prev.z) / 1000);
    if (dir.lengthSq() < 1e-9) dir.set(1, 0, 0);
    dir.normalize();
    return new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(mirrored ? -1 : 1);
  };
  return cleanPath.map((point, index) => {
    const center = new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
    const side = sideAt(index);
    const left = center.clone().addScaledVector(side, offsetA);
    const right = center.clone().addScaledVector(side, offsetB);
    return {
      leftBottom: left.clone().setY(y0),
      rightBottom: right.clone().setY(y0),
      leftTop: left.clone().setY(y1),
      rightTop: right.clone().setY(y1)
    };
  });
}

function makeVerticalPathOutlineGeometry(
  path: CustomFurniturePlanPoint[],
  baseMm: number,
  topMm: number,
  thicknessM: number,
  justification: CustomFurnitureBoardJustification,
  mirrored: boolean
) {
  const frames = verticalPathFrames(path, baseMm, topMm, thicknessM, justification, mirrored);
  if (frames.length < 2) return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const points: THREE.Vector3[] = [];
  const addLine = (a: THREE.Vector3, b: THREE.Vector3) => points.push(a.clone(), b.clone());
  const addPath = (pick: (frame: (typeof frames)[number]) => THREE.Vector3) => {
    for (let index = 0; index < frames.length - 1; index += 1) addLine(pick(frames[index]!), pick(frames[index + 1]!));
  };
  addPath((frame) => frame.leftBottom);
  addPath((frame) => frame.rightBottom);
  addPath((frame) => frame.leftTop);
  addPath((frame) => frame.rightTop);
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  addLine(first.leftBottom, first.rightBottom);
  addLine(first.leftTop, first.rightTop);
  addLine(first.leftBottom, first.leftTop);
  addLine(first.rightBottom, first.rightTop);
  addLine(last.leftBottom, last.rightBottom);
  addLine(last.leftTop, last.rightTop);
  addLine(last.leftBottom, last.leftTop);
  addLine(last.rightBottom, last.rightTop);
  return new THREE.BufferGeometry().setFromPoints(points);
}

export function makeCustomFurnitureBoardGeometry(board: CustomFurnitureBoardParams): THREE.BufferGeometry {
  if (board.cutouts?.length) {
    const polygons = customBoardProfilePolygons(board);
    const parts = board.workplane.type === "vertical" && board.workplane.pathMm?.length
      ? makeCutVerticalPathParts(board, polygons)
      : polygons.map(rings => makeBoardPrism(board, rings[0]!, rings.slice(1)));
    if (!parts.length) return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3)).setIndex([]);
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    return geometry;
  }
  return makeBoardPrism(board, sanitizeCustomFurnitureProfile(board.profile));
}

/** Split in unfolded coordinates before mapping to a path, so faces cannot bridge a bend or fill a hole. */
function makeCutVerticalPathParts(board: CustomFurnitureBoardParams, polygons: CustomFurnitureProfilePoint[][][]): THREE.BufferGeometry[] {
  if (board.workplane.type !== "vertical") return [];
  const path = sanitizeCustomFurniturePlanPolygon(board.workplane.pathMm ?? []);
  const thicknessM = Math.max(1, board.recipeSnapshot ? recipeThicknessMm(board.recipeSnapshot) : board.thicknessMm) / 1000;
  const frames = verticalPathFrames(path, 0, 0, thicknessM, board.justification, board.workplane.mirrored);
  const bounds = polygonBoundsMm(board.profile);
  const parts: THREE.BufferGeometry[] = [];
  let startMm = 0;
  for (let index = 0; index < path.length - 1; index++) {
    const a = path[index]!, b = path[index + 1]!;
    const lengthMm = Math.hypot(b.x - a.x, b.z - a.z);
    if (lengthMm < 1) continue;
    const endMm = startMm + lengthMm;
    const strip: [number, number][] = [[startMm, bounds.minY], [endMm, bounds.minY], [endMm, bounds.maxY], [startMm, bounds.maxY]];
    for (const polygon of polygons) {
      const clipped = polygonClipping.intersection(polygon.map(ring => ring.map(p => [p.x, p.y] as [number, number])), [strip]);
      for (const result of clipped) {
        const rings = result.map(ring => ring.slice(0, -1).map(([x, y]) => ({ x, y })));
        const vertices = rings.flat();
        const map = (point: CustomFurnitureProfilePoint, side: "leftBottom" | "rightBottom") =>
          frames[index]![side].clone().lerp(frames[index + 1]![side], (point.x - startMm) / lengthMm).setY(point.y / 1000);
        parts.push(makePrismGeometry(vertices.map(p => map(p, "leftBottom")), vertices.map(p => map(p, "rightBottom")), rings[0]!, rings.slice(1)));
      }
    }
    startMm = endMm;
  }
  return parts;
}
function makeBoardPrism(board: CustomFurnitureBoardParams, outer: CustomFurnitureProfilePoint[], holes: CustomFurnitureProfilePoint[][] = []): THREE.BufferGeometry {
  const profile = outer;
  const vertices = [...outer, ...holes.flat()];
  if (profile.length < 3) return new THREE.BoxGeometry(0.001, 0.001, 0.001);
  const thicknessM = Math.max(1, board.recipeSnapshot ? recipeThicknessMm(board.recipeSnapshot) : board.thicknessMm) / 1000;
  const [offsetA, offsetB] = justificationOffsets(thicknessM, board.justification);

  if (board.workplane.type === "horizontal") {
    const y = board.workplane.elevationMm / 1000;
    const pointsA = vertices.map((point) => new THREE.Vector3(point.x / 1000, y + offsetA, point.y / 1000));
    const pointsB = vertices.map((point) => new THREE.Vector3(point.x / 1000, y + offsetB, point.y / 1000));
    return makePrismGeometry(pointsA, pointsB, profile, holes);
  }

  if (board.workplane.pathMm && board.workplane.pathMm.length >= 2) {
    const bounds = polygonBoundsMm(profile);
    return makeVerticalPathGeometry(board.workplane.pathMm, bounds.minY, bounds.maxY, thicknessM, board.justification, board.workplane.mirrored);
  }

  const a = new THREE.Vector3(board.workplane.aMm.x / 1000, 0, board.workplane.aMm.z / 1000);
  const b = new THREE.Vector3(board.workplane.bMm.x / 1000, 0, board.workplane.bMm.z / 1000);
  const dir = b.clone().sub(a);
  dir.y = 0;
  if (dir.lengthSq() < 1e-9) return new THREE.BoxGeometry(0.001, 0.001, 0.001);
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(board.workplane.mirrored ? -1 : 1);
  const pointsA = vertices.map((point) =>
    a.clone().addScaledVector(dir, point.x / 1000).addScaledVector(side, offsetA).setY(point.y / 1000)
  );
  const pointsB = vertices.map((point) =>
    a.clone().addScaledVector(dir, point.x / 1000).addScaledVector(side, offsetB).setY(point.y / 1000)
  );
  return makePrismGeometry(pointsA, pointsB, profile, holes);
}

export function makeCustomFurnitureBoardOutlineGeometry(board: CustomFurnitureBoardParams, fallbackGeometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const profile = sanitizeCustomFurnitureProfile(board.profile);
  if (!board.cutouts?.length && board.workplane.type === "vertical" && board.workplane.pathMm && board.workplane.pathMm.length >= 2 && profile.length >= 3) {
    const bounds = polygonBoundsMm(profile);
    return makeVerticalPathOutlineGeometry(
      board.workplane.pathMm,
      bounds.minY,
      bounds.maxY,
      Math.max(1, board.recipeSnapshot ? recipeThicknessMm(board.recipeSnapshot) : board.thicknessMm) / 1000,
      board.justification,
      board.workplane.mirrored
    );
  }
  return new THREE.EdgesGeometry(fallbackGeometry);
}

export function makeCustomFurnitureBoundaryGeometry(boundary: CustomFurniturePlanPoint[], yMm: number): THREE.BufferGeometry {
  const points = sanitizeCustomFurniturePlanPolygon(boundary);
  const y = yMm / 1000;
  if (points.length < 2) return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const world = points.map((point) => new THREE.Vector3(point.x / 1000, y, point.z / 1000));
  world.push(world[0]!.clone());
  return new THREE.BufferGeometry().setFromPoints(world);
}

export function makeCustomFurnitureBoardEdgeGeometry(board: CustomFurnitureBoardParams, edgeIndexes: number[]): THREE.BufferGeometry {
  const profile = sanitizeCustomFurnitureProfile(board.profile);
  const points: THREE.Vector3[] = [];
  if (profile.length < 2) return new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

  const edgeSet = new Set(edgeIndexes.map((index) => ((Math.round(index) % profile.length) + profile.length) % profile.length));
  const mapPoint = (point: CustomFurnitureProfilePoint) => {
    if (board.workplane.type === "horizontal") {
      return new THREE.Vector3(point.x / 1000, board.workplane.elevationMm / 1000 + 0.004, point.y / 1000);
    }
    const a = new THREE.Vector3(board.workplane.aMm.x / 1000, 0, board.workplane.aMm.z / 1000);
    const b = new THREE.Vector3(board.workplane.bMm.x / 1000, 0, board.workplane.bMm.z / 1000);
    const dir = b.sub(a);
    dir.y = 0;
    if (dir.lengthSq() < 1e-9) return a;
    dir.normalize();
    return a.clone().addScaledVector(dir, point.x / 1000).setY(point.y / 1000);
  };
  for (const edgeIndex of edgeSet) {
    points.push(mapPoint(profile[edgeIndex]!), mapPoint(profile[(edgeIndex + 1) % profile.length]!));
  }
  return new THREE.BufferGeometry().setFromPoints(points.length > 0 ? points : [new THREE.Vector3(), new THREE.Vector3()]);
}

export function nearestBoardProfileEdge(board: CustomFurnitureBoardParams, worldPoint: THREE.Vector3): number | null {
  const profile = sanitizeCustomFurnitureProfile(board.profile);
  if (profile.length < 2) return null;
  let local: CustomFurnitureProfilePoint | null = null;
  if (board.workplane.type === "horizontal") {
    local = { x: worldPoint.x * 1000, y: worldPoint.z * 1000 };
  } else {
    const a = new THREE.Vector3(board.workplane.aMm.x / 1000, 0, board.workplane.aMm.z / 1000);
    const b = new THREE.Vector3(board.workplane.bMm.x / 1000, 0, board.workplane.bMm.z / 1000);
    const dir = b.sub(a);
    dir.y = 0;
    if (dir.lengthSq() < 1e-9) return null;
    dir.normalize();
    local = { x: worldPoint.clone().sub(a).dot(dir) * 1000, y: worldPoint.y * 1000 };
  }
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < profile.length; index += 1) {
    const a = profile[index]!;
    const b = profile[(index + 1) % profile.length]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((local.x - a.x) * abx + (local.y - a.y) * aby) / lengthSq)) : 0;
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const distance = Math.hypot(local.x - px, local.y - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
