import * as THREE from "three";
import type { SectionElevationKey, SectionParams } from "./localTypes";

type SectionBasis = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  mid: THREE.Vector3;
  dir: THREE.Vector3;
  normal: THREE.Vector3;
  length: number;
};

export type OrthoViewConfig = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
  clipPlane: THREE.Plane;
};

function mmPointToWorld(point: { x: number; z: number }) {
  return new THREE.Vector3(point.x / 1000, 0, point.z / 1000);
}

function boxCorners(box: THREE.Box3) {
  return [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z)
  ];
}

export function getSectionBasis(params: SectionParams): SectionBasis | null {
  const a = mmPointToWorld(params.aMm);
  const b = mmPointToWorld(params.bMm);
  const dir = b.clone().sub(a);
  dir.y = 0;
  const length = dir.length();
  if (length < 1e-6) return null;
  dir.multiplyScalar(1 / length);
  const normal = new THREE.Vector3(-dir.z, 0, dir.x);
  if (params.mirrored) normal.multiplyScalar(-1);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return { a, b, mid, dir, normal, length };
}

function buildArrowSegments(origin: THREE.Vector3, dir: THREE.Vector3, sizeM: number) {
  const tip = origin.clone().addScaledVector(dir, sizeM);
  const wingBase = tip.clone().addScaledVector(dir, -sizeM * 0.42);
  const left = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(sizeM * 0.28);
  const right = left.clone().multiplyScalar(-1);
  return [
    origin.clone(),
    tip.clone(),
    tip.clone(),
    wingBase.clone().add(left),
    tip.clone(),
    wingBase.clone().add(right)
  ];
}

function buildDashedStripeSegments(
  a: THREE.Vector3,
  dir: THREE.Vector3,
  lateral: THREE.Vector3,
  length: number,
  stripeOffsetM: number,
  dashLengthM: number,
  gapLengthM: number,
  y: number
) {
  const points: THREE.Vector3[] = [];
  const stripeOrigin = a.clone().addScaledVector(lateral, stripeOffsetM).setY(y);
  for (let offset = 0; offset < length; offset += dashLengthM + gapLengthM) {
    const segA = stripeOrigin.clone().addScaledVector(dir, offset);
    const segB = stripeOrigin.clone().addScaledVector(dir, Math.min(length, offset + dashLengthM));
    points.push(segA, segB);
  }
  return points;
}

export function buildSectionMarkerGeometry(params: SectionParams) {
  const basis = getSectionBasis(params);
  if (!basis) {
    return {
      line: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      arrows: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    };
  }

  const lineY = 0.014;
  const arrowY = 0.018;
  const lateral = new THREE.Vector3(-basis.dir.z, 0, basis.dir.x);
  const dashLengthM = Math.min(0.34, Math.max(0.14, basis.length * 0.075));
  const gapLengthM = Math.min(0.22, Math.max(0.07, dashLengthM * 0.55));
  const stripeOffsets = [-0.018, 0, 0.018];
  const linePoints: THREE.Vector3[] = [];
  for (const stripeOffset of stripeOffsets) {
    linePoints.push(...buildDashedStripeSegments(basis.a, basis.dir, lateral, basis.length, stripeOffset, dashLengthM, gapLengthM, lineY));
  }

  const arrowSizeM = Math.min(0.28, Math.max(0.12, basis.length * 0.08));
  const inwardOffsetM = Math.min(0.18, Math.max(0.08, basis.length * 0.05));
  const arrowPoints: THREE.Vector3[] = [];
  const startOrigin = basis.a.clone().addScaledVector(basis.dir, inwardOffsetM).setY(arrowY);
  const endOrigin = basis.b.clone().addScaledVector(basis.dir, -inwardOffsetM).setY(arrowY);
  arrowPoints.push(...buildArrowSegments(startOrigin, basis.normal, arrowSizeM).map((point) => point.setY(arrowY)));
  arrowPoints.push(...buildArrowSegments(endOrigin, basis.normal, arrowSizeM).map((point) => point.setY(arrowY)));

  return {
    line: new THREE.BufferGeometry().setFromPoints(linePoints),
    arrows: new THREE.BufferGeometry().setFromPoints(arrowPoints)
  };
}

export function createSectionPickGeometry(params: SectionParams) {
  const basis = getSectionBasis(params);
  if (!basis) return new THREE.PlaneGeometry(0.001, 0.001);
  const width = basis.length;
  const depth = 0.18;
  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(Math.atan2(basis.dir.x, basis.dir.z));
  geometry.translate(basis.mid.x, 0.006, basis.mid.z);
  return geometry;
}

function buildOrthoConfig(
  origin: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  points: THREE.Vector3[]
): OrthoViewConfig {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let maxW = 0.05;

  const visiblePoints = points.filter((point) => point.clone().sub(origin).dot(forward) >= -0.02);
  const source = visiblePoints.length > 0 ? visiblePoints : points;

  for (const point of source) {
    const rel = point.clone().sub(origin);
    const u = rel.dot(right);
    const v = rel.dot(up);
    const w = rel.dot(forward);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
    maxW = Math.max(maxW, w);
  }

  const horizontalPad = Math.max(0.15, (maxU - minU) * 0.06);
  const verticalPad = Math.max(0.15, (maxV - minV) * 0.06);
  const farPad = Math.max(0.3, maxW * 0.08);
  const position = origin.clone().addScaledVector(forward, 0.001);
  const target = origin.clone().addScaledVector(forward, 1);
  const clipOrigin = origin.clone().addScaledVector(forward, -0.003);

  return {
    position,
    target,
    up: up.clone(),
    left: minU - horizontalPad,
    right: maxU + horizontalPad,
    top: maxV + verticalPad,
    bottom: minV - verticalPad,
    near: 0.001,
    far: Math.max(1, maxW + farPad),
    clipPlane: new THREE.Plane().setFromNormalAndCoplanarPoint(forward.clone().normalize(), clipOrigin)
  };
}

export function computeSectionViewConfig(section: SectionParams, bounds: THREE.Box3) {
  const basis = getSectionBasis(section);
  if (!basis) return null;
  const points = boxCorners(bounds);
  const origin = new THREE.Vector3(basis.mid.x, bounds.min.y, basis.mid.z);
  return buildOrthoConfig(origin, basis.dir, new THREE.Vector3(0, 1, 0), basis.normal, points);
}

export function computeElevationViewConfig(direction: SectionElevationKey, bounds: THREE.Box3) {
  const center = bounds.getCenter(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);
  let origin = center.clone();
  let right = new THREE.Vector3(1, 0, 0);
  let forward = new THREE.Vector3(0, 0, 1);

  if (direction === "north") {
    origin.z = bounds.min.z;
    right.set(1, 0, 0);
    forward.set(0, 0, 1);
  } else if (direction === "south") {
    origin.z = bounds.max.z;
    right.set(-1, 0, 0);
    forward.set(0, 0, -1);
  } else if (direction === "east") {
    origin.x = bounds.max.x;
    right.set(0, 0, 1);
    forward.set(-1, 0, 0);
  } else {
    origin.x = bounds.min.x;
    right.set(0, 0, -1);
    forward.set(1, 0, 0);
  }

  return buildOrthoConfig(origin, right, up, forward, boxCorners(bounds));
}

function addUniqueSegment(
  acc: Map<string, [THREE.Vector3, THREE.Vector3]>,
  a: THREE.Vector3,
  b: THREE.Vector3,
  precision = 1000
) {
  if (a.distanceToSquared(b) < 1e-8) return;
  const keyOf = (p: THREE.Vector3) => `${Math.round(p.x * precision)},${Math.round(p.y * precision)},${Math.round(p.z * precision)}`;
  const ka = keyOf(a);
  const kb = keyOf(b);
  const key = ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  if (!acc.has(key)) acc.set(key, [a.clone(), b.clone()]);
}

function trianglePlaneIntersections(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, plane: THREE.Plane) {
  const out: THREE.Vector3[] = [];
  const edges: Array<[THREE.Vector3, THREE.Vector3]> = [
    [a, b],
    [b, c],
    [c, a]
  ];
  for (const [p0, p1] of edges) {
    const d0 = plane.distanceToPoint(p0);
    const d1 = plane.distanceToPoint(p1);
    if (Math.abs(d0) < 1e-6 && Math.abs(d1) < 1e-6) continue;
    if (Math.abs(d0) < 1e-6) {
      out.push(p0.clone());
      continue;
    }
    if (Math.abs(d1) < 1e-6) {
      out.push(p1.clone());
      continue;
    }
    if (d0 * d1 > 0) continue;
    const t = d0 / (d0 - d1);
    if (t < 0 || t > 1) continue;
    out.push(p0.clone().lerp(p1, t));
  }
  return out;
}

export function buildPlaneSliceStripGeometry(objects: THREE.Object3D[], plane: THREE.Plane, thicknessM = 0.018) {
  const segments = new Map<string, [THREE.Vector3, THREE.Vector3]>();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const edgeDir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const normal = plane.normal.clone().normalize();

  for (const object of objects) {
    object.updateWorldMatrix(true, false);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const geometry = child.geometry;
      const position = geometry.getAttribute("position");
      if (!position) return;
      const index = geometry.getIndex();
      const matrixWorld = child.matrixWorld;
      const triangleCount = index ? index.count / 3 : position.count / 3;
      for (let i = 0; i < triangleCount; i += 1) {
        const ia = index ? index.getX(i * 3) : i * 3;
        const ib = index ? index.getX(i * 3 + 1) : i * 3 + 1;
        const ic = index ? index.getX(i * 3 + 2) : i * 3 + 2;
        vA.fromBufferAttribute(position, ia).applyMatrix4(matrixWorld);
        vB.fromBufferAttribute(position, ib).applyMatrix4(matrixWorld);
        vC.fromBufferAttribute(position, ic).applyMatrix4(matrixWorld);
        const hits = trianglePlaneIntersections(vA, vB, vC, plane);
        if (hits.length < 2) continue;
        addUniqueSegment(segments, hits[0]!, hits[1]!);
      }
    });
  }

  const vertices: number[] = [];
  for (const [a, b] of segments.values()) {
    edgeDir.copy(b).sub(a);
    const length = edgeDir.length();
    if (length < 1e-5) continue;
    edgeDir.multiplyScalar(1 / length);
    perp.copy(normal).cross(edgeDir);
    if (perp.lengthSq() < 1e-8) continue;
    perp.normalize().multiplyScalar(thicknessM * 0.5);
    const a0 = a.clone().add(perp);
    const a1 = a.clone().sub(perp);
    const b0 = b.clone().add(perp);
    const b1 = b.clone().sub(perp);
    vertices.push(
      a0.x, a0.y, a0.z,
      b0.x, b0.y, b0.z,
      b1.x, b1.y, b1.z,
      a0.x, a0.y, a0.z,
      b1.x, b1.y, b1.z,
      a1.x, a1.y, a1.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
