import * as THREE from "three";

export type MeshOverlapRow = {
  a: string;
  b: string;
  overlapMm: { x: number; y: number; z: number };
  intersectionMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  aBoxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  bBoxMm: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  volumeMm3: number;
  planAreaMm2: number;
};

type PlanPoint = { x: number; z: number };

function boxToMm(box: THREE.Box3) {
  return {
    min: { x: box.min.x * 1000, y: box.min.y * 1000, z: box.min.z * 1000 },
    max: { x: box.max.x * 1000, y: box.max.y * 1000, z: box.max.z * 1000 }
  };
}

function polygonAreaMm2(points: PlanPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.z - next.x * current.z;
  }
  return Math.abs(area) / 2;
}

function lineIntersection(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): PlanPoint {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const cdx = d.x - c.x;
  const cdz = d.z - c.z;
  const denominator = abx * cdz - abz * cdx;
  if (Math.abs(denominator) < 1e-9) return b;
  const t = ((c.x - a.x) * cdz - (c.z - a.z) * cdx) / denominator;
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function clipConvexPolygon(subject: PlanPoint[], clip: PlanPoint[]) {
  let output = subject;
  const clipSignedArea = clip.reduce((sum, current, index) => {
    const next = clip[(index + 1) % clip.length]!;
    return sum + current.x * next.z - next.x * current.z;
  }, 0);

  for (let clipIndex = 0; clipIndex < clip.length; clipIndex += 1) {
    const edgeStart = clip[clipIndex]!;
    const edgeEnd = clip[(clipIndex + 1) % clip.length]!;
    const input = output;
    output = [];

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index + input.length - 1) % input.length]!;
      const currentCross = (edgeEnd.x - edgeStart.x) * (current.z - edgeStart.z) - (edgeEnd.z - edgeStart.z) * (current.x - edgeStart.x);
      const previousCross = (edgeEnd.x - edgeStart.x) * (previous.z - edgeStart.z) - (edgeEnd.z - edgeStart.z) * (previous.x - edgeStart.x);
      const currentInside = clipSignedArea >= 0 ? currentCross >= -1e-6 : currentCross <= 1e-6;
      const previousInside = clipSignedArea >= 0 ? previousCross >= -1e-6 : previousCross <= 1e-6;

      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, edgeStart, edgeEnd));
      }
    }

    if (output.length === 0) break;
  }

  return output;
}

function triangulatedPlanMm(points: PlanPoint[]) {
  if (points.length < 3) return [];
  const triangles = THREE.ShapeUtils.triangulateShape(points.map((point) => new THREE.Vector2(point.x, point.z)), []);
  return triangles.map((triangle) => triangle.map((pointIndex) => points[pointIndex]!));
}

function planOverlapAreaMm2(a: PlanPoint[], b: PlanPoint[]) {
  let area = 0;
  for (const aTriangle of triangulatedPlanMm(a)) {
    for (const bTriangle of triangulatedPlanMm(b)) {
      area += polygonAreaMm2(clipConvexPolygon(aTriangle, bTriangle));
    }
  }
  return area;
}

function profileBoundsMm(profile: PlanPoint[]) {
  return {
    minX: Math.min(...profile.map((point) => point.x)),
    maxX: Math.max(...profile.map((point) => point.x)),
    minZ: Math.min(...profile.map((point) => point.z)),
    maxZ: Math.max(...profile.map((point) => point.z))
  };
}

function convexHull(points: PlanPoint[]) {
  const sorted = [...points]
    .sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x)
    .filter((point, index, array) => index === 0 || point.x !== array[index - 1]!.x || point.z !== array[index - 1]!.z);
  if (sorted.length <= 3) return sorted;

  const cross = (origin: PlanPoint, a: PlanPoint, b: PlanPoint) =>
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
  const lower: PlanPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: PlanPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function explicitPlanProfileMm(mesh: THREE.Mesh): PlanPoint[] {
  const raw = mesh.userData.revitPlanProfileMm as Array<{ x?: number; z?: number }> | undefined;
  if (!Array.isArray(raw)) return [];
  const parentMatrix = mesh.parent?.matrixWorld ?? new THREE.Matrix4();
  return raw
    .map((point) => {
      const x = Number(point.x);
      const z = Number(point.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      const world = new THREE.Vector3(x * 0.001, 0, z * 0.001).applyMatrix4(parentMatrix);
      return { x: world.x * 1000, z: world.z * 1000 };
    })
    .filter((point): point is PlanPoint => Boolean(point));
}

function geometryPlanProfileMm(mesh: THREE.Mesh): PlanPoint[] {
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
  const position = geometry?.getAttribute("position");
  if (!position) return [];

  const points: PlanPoint[] = [];
  const seen = new Set<string>();
  const vector = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vector.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    const point = { x: Math.round(vector.x * 1000000) / 1000, z: Math.round(vector.z * 1000000) / 1000 };
    const key = `${point.x}:${point.z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }
  return convexHull(points);
}

function meshPlanProfileMm(mesh: THREE.Mesh) {
  const explicit = explicitPlanProfileMm(mesh);
  if (explicit.length >= 3) return explicit;
  return geometryPlanProfileMm(mesh);
}

export function computeMeshVolumeOverlaps(
  meshes: THREE.Mesh[],
  options: { toleranceMm?: number } = {}
): MeshOverlapRow[] {
  const toleranceMm = options.toleranceMm ?? 2;
  const entries = meshes
    .filter((mesh) => mesh.visible !== false && mesh.userData.hiddenByDefault !== true)
    .map((mesh) => {
      mesh.updateMatrixWorld(true);
      return {
        mesh,
        box: new THREE.Box3().setFromObject(mesh),
        profile: meshPlanProfileMm(mesh)
      };
    })
    .filter((entry) => entry.profile.length >= 3);

  const out: MeshOverlapRow[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < entries.length; otherIndex += 1) {
      const a = entries[index]!;
      const b = entries[otherIndex]!;

      const yOverlapMm = (Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y)) * 1000;
      if (yOverlapMm <= toleranceMm) continue;

      const aPlan = profileBoundsMm(a.profile);
      const bPlan = profileBoundsMm(b.profile);
      const minX = Math.max(aPlan.minX, bPlan.minX);
      const maxX = Math.min(aPlan.maxX, bPlan.maxX);
      const minZ = Math.max(aPlan.minZ, bPlan.minZ);
      const maxZ = Math.min(aPlan.maxZ, bPlan.maxZ);
      const overlapX = maxX - minX;
      const overlapZ = maxZ - minZ;
      if (overlapX <= toleranceMm || overlapZ <= toleranceMm) continue;

      const planArea = planOverlapAreaMm2(a.profile, b.profile);
      if (planArea <= toleranceMm * toleranceMm) continue;

      out.push({
        a: a.mesh.name,
        b: b.mesh.name,
        overlapMm: { x: overlapX, y: yOverlapMm, z: overlapZ },
        intersectionMm: {
          min: { x: minX, y: Math.max(a.box.min.y, b.box.min.y) * 1000, z: minZ },
          max: { x: maxX, y: Math.min(a.box.max.y, b.box.max.y) * 1000, z: maxZ }
        },
        aBoxMm: boxToMm(a.box),
        bBoxMm: boxToMm(b.box),
        volumeMm3: planArea * yOverlapMm,
        planAreaMm2: planArea
      });
    }
  }

  return out.sort((a, b) => b.volumeMm3 - a.volumeMm3);
}
