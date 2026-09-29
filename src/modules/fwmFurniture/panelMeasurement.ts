import { BoxGeometry, Mesh, Vector3 } from "three";

export type PanelMeasurement = {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  areaMm2: number;
  perimeterMm: number;
  verticalMm: number;
  horizontalMm: number;
  /** From the measured face to the opposite face, in scaled local millimetres. */
  thicknessOffset: { x: number; y: number; z: number };
  boundary: Array<{ a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }>;
};

/** Measures the panel in its own plane, before door opening/placement transforms.
 * A diagonal panel's world bounding box is NOT its cutting size.
 */
export function measurePanel(mesh: Mesh, nominalThicknessMm?: number): PanelMeasurement {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertices = Array.from({ length: position.count }, (_, i) =>
    new Vector3().fromBufferAttribute(position, i).multiply(mesh.scale).multiplyScalar(1000));
  const faces = new Map<string, { normal: Vector3; area: number; triangles: Vector3[][] }>();
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle = [0, 1, 2].map(offset => vertices[index ? index.getX(i + offset) : i + offset]!);
    const [a, b, c] = triangle as [Vector3, Vector3, Vector3];
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const area = cross.length() / 2;
    if (area < 0.00001) continue;
    const normal = cross.normalize();
    const plane = normal.dot(a);
    const key = `${normal.toArray().map(n => Math.round(n * 10000)).join(":")}:${Math.round(plane * 10)}`;
    const face = faces.get(key) ?? { normal, area: 0, triangles: [] };
    face.area += area;
    face.triangles.push(triangle);
    faces.set(key, face);
  }
  let candidates = [...faces.values()];
  if (geometry instanceof BoxGeometry && Number.isFinite(nominalThicknessMm) && nominalThicknessMm! > 0) {
    const sizes = [geometry.parameters.width * mesh.scale.x, geometry.parameters.height * mesh.scale.y, geometry.parameters.depth * mesh.scale.z].map(value => Math.abs(value) * 1000);
    const axis = [0, 1, 2].sort((a, b) => Math.abs(sizes[a]! - nominalThicknessMm!) - Math.abs(sizes[b]! - nominalThicknessMm!))[0]!;
    candidates = candidates.filter(face => Math.abs(face.normal.getComponent(axis)) > 0.9999);
  }
  const face = candidates.sort((a, b) => b.area - a.area)[0];
  if (!face) throw new Error(`Panel ${mesh.name} has no measurable face.`);
  const normal = face.normal;
  const horizontal = Math.abs(normal.y) > 0.9999
    ? new Vector3(1, 0, 0)
    : new Vector3(normal.z, 0, -normal.x).normalize();
  const vertical = normal.clone().cross(horizontal).normalize();
  const span = (axis: Vector3) => {
    const values = vertices.map(vertex => vertex.dot(axis));
    return Math.max(...values) - Math.min(...values);
  };
  const horizontalMm = span(horizontal);
  const verticalMm = span(vertical);
  const thicknessMm = span(normal);
  // A mirrored mesh reverses triangle winding. Find the opposite plane from
  // the actual vertices instead of assuming the face normal points outward.
  const facePlane = normal.dot(face.triangles[0]![0]!);
  const oppositeDistance = vertices.map(vertex => normal.dot(vertex) - facePlane)
    .reduce((furthest, distance) => Math.abs(distance) > Math.abs(furthest) ? distance : furthest, 0);
  // Cancel triangulation diagonals. Weld duplicated triangle vertices at 0.01 mm.
  const key = (point: Vector3) => point.toArray().map(value => Math.round(value * 100)).join(":");
  const edges = new Map<string, { count: number; length: number; a: Vector3; b: Vector3 }>();
  for (const triangle of face.triangles) for (let i = 0; i < 3; i += 1) {
    const a = triangle[i]!;
    const b = triangle[(i + 1) % 3]!;
    const edgeKey = [key(a), key(b)].sort().join("/");
    const edge = edges.get(edgeKey) ?? { count: 0, length: a.distanceTo(b), a, b };
    edge.count += 1;
    edges.set(edgeKey, edge);
  }
  const perimeterMm = [...edges.values()].filter(edge => edge.count === 1).reduce((sum, edge) => sum + edge.length, 0);
  if (![horizontalMm, verticalMm, thicknessMm, face.area, perimeterMm].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error(`Panel ${mesh.name} has invalid manufacturing dimensions (${[horizontalMm, verticalMm, thicknessMm, face.area, perimeterMm].join(", ")}).`);
  }
  return {
    lengthMm: horizontalMm, widthMm: verticalMm, thicknessMm,
    horizontalMm, verticalMm, areaMm2: face.area, perimeterMm,
    thicknessOffset: { x: normal.x * oppositeDistance, y: normal.y * oppositeDistance, z: normal.z * oppositeDistance },
    boundary: [...edges.values()].filter(edge => edge.count === 1).map(({ a, b }) => ({ a: { x: a.x, y: a.y, z: a.z }, b: { x: b.x, y: b.y, z: b.z } }))
  };
}
