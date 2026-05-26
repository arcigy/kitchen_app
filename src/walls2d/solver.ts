import polygonClipping from "polygon-clipping";
import { add, cross, dist, dot, intersectLines, len2, mul, sub, type Line, type Point } from "./geom";
import { baseDir, leftNormal, offsetsM, rawEndCorners, spineDir, type Wall } from "./model";

export type WallEnd = "a" | "b";

export type WallSolvedEnd = {
  left: Point;
  right: Point;
  join: "butt" | "miter" | "bevel";
  source: "free" | "join" | "bodyJoin" | "fallback";
  boundaryChain?: Point[];
  bevelJoinPoly?: Point[];
  ownedCapPoly?: Point[];
  fillPoly?: Point[];
  /** @deprecated Use boundaryChain. Kept only for older debug consumers. */
  extra?: Point[];
};

export type WallSolved = {
  id: string;
  a: WallSolvedEnd;
  b: WallSolvedEnd;
  outline: Point[];
};

export type WallJoinDebugEdge = {
  wallId: string;
  end?: WallEnd;
  side: "left" | "right" | "cap";
  a: Point;
  b: Point;
};

export type WallJoinDebugCap = {
  wallId: string;
  end: WallEnd;
  source: "free" | "join" | "bodyJoin" | "fallback";
  left: Point;
  right: Point;
  boundaryChain?: Point[];
};

export type WallJoinDebugIntersection = {
  nodeId: string;
  aWallId: string;
  bWallId: string;
  point: Point;
};

export type WallBoundaryEdgeKind = "outer" | "inner" | "wallFace" | "cap" | "join";

export type WallJoinDebugBoundaryEdge = {
  kind: WallBoundaryEdgeKind;
  wallId?: string;
  side?: "left" | "right" | "cap";
  end?: WallEnd;
  source?: WallJoinDebugCap["source"];
  a: Point;
  b: Point;
};

export type WallJoinDebugNode = {
  id: string;
  p: Point;
  incident: Array<{ wall: Wall; end: WallEnd }>;
  sortedIncident: Array<{ wallId: string; end: WallEnd; angle: number }>;
  intersections: WallJoinDebugIntersection[];
};

export type WallJoinDebug = {
  nodes: WallJoinDebugNode[];
  rawWallPolygons: Array<{ wallId: string; polygon: Point[] }>;
  offsetEdges: WallJoinDebugEdge[];
  solvedCaps: WallJoinDebugCap[];
  intersections: WallJoinDebugIntersection[];
  finalPolygons: Point[][];
  boundaryEdges: WallJoinDebugBoundaryEdge[];
};

type PolygonRing = Array<[number, number]>;
type WallPlanPolygon = PolygonRing[];
type WallPlanMultiPolygon = WallPlanPolygon[];
type PolygonClipper = {
  union: (...polygons: WallPlanMultiPolygon[]) => WallPlanMultiPolygon;
};

type EndpointRef = { wall: Wall; end: WallEnd; point: Point };
type NodeDraft = { id: string; p: Point; incident: Array<{ wall: Wall; end: WallEnd }> };
type SortedIncident = { item: { wall: Wall; end: WallEnd }; index: number; angle: number };
type SolvedEndSource = WallJoinDebugCap["source"];
type SolvedEndDraft = { left: Point; right: Point; source: SolvedEndSource; boundaryChain?: Point[]; extra?: Point[] };

const polygonClipper = polygonClipping as PolygonClipper;
export const DEFAULT_WALL_MITER_LIMIT = Number.POSITIVE_INFINITY;

function key(p: Point, tol = 1e-3) {
  const qx = Math.round(p.x / tol);
  const qz = Math.round(p.z / tol);
  return `${qx},${qz}`;
}

function joinEnabled(item: { wall: Wall; end: WallEnd }) {
  return item.wall.joinEnds?.[item.end]?.enabled !== false;
}

function angleOf(p: Point) {
  const a = Math.atan2(p.z, p.x);
  return a < 0 ? a + Math.PI * 2 : a;
}

function samePoint(a: Point, b: Point, eps = 1e-6) {
  return dist(a, b) <= eps;
}

function dedupeLoop(points: Point[], eps = 1e-6) {
  const out: Point[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && samePoint(prev, point, eps)) continue;
    out.push(point);
  }
  if (out.length > 2 && samePoint(out[0], out[out.length - 1], eps)) out.pop();
  return out;
}

function signedArea(points: Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function ensureCcw(points: Point[]) {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}

function orderLoopAroundCentroid(points: Point[]) {
  const unique = dedupeLoop(points);
  if (unique.length < 3) return unique;
  const center = {
    x: unique.reduce((sum, point) => sum + point.x, 0) / unique.length,
    z: unique.reduce((sum, point) => sum + point.z, 0) / unique.length
  };
  return ensureCcw(
    [...unique].sort((a, b) => Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x))
  );
}

function wallRawPolygon(wall: Wall) {
  const a = rawEndCorners(wall, "a");
  const b = rawEndCorners(wall, "b");
  return orderLoopAroundCentroid([a.left, a.right, b.right, b.left]);
}

function endBoundaryChain(end: SolvedEndDraft) {
  return end.boundaryChain ?? end.extra ?? [];
}

function wallSolvedPolygon(a: SolvedEndDraft, b: SolvedEndDraft) {
  const aChain = endBoundaryChain(a);
  const bChain = endBoundaryChain(b);
  return ensureCcw(dedupeLoop([a.left, b.left, ...bChain, b.right, a.right, ...[...aChain].reverse()]));
}

function rawEndCornersAtNode(wall: Wall, node: Point): SolvedEndDraft {
  const nL = leftNormal(wall);
  const offs = offsetsM(wall);
  return {
    left: add(node, mul(nL, offs.left)),
    right: add(node, mul(nL, offs.right)),
    source: "free"
  };
}

function rawEndDraft(wall: Wall, end: WallEnd): SolvedEndDraft {
  const raw = rawEndCorners(wall, end);
  return { left: raw.left, right: raw.right, source: "free" };
}

function toRing(poly: Point[]): PolygonRing {
  const ring = ensureCcw(poly).map((point) => [point.x, point.z] as [number, number]);
  if (ring.length > 0) ring.push(ring[0]!);
  return ring;
}

function fromRing(ring: PolygonRing): Point[] {
  const source = ring.length > 1 ? ring.slice(0, -1) : ring;
  return ensureCcw(dedupeLoop(source.map(([x, z]) => ({ x, z }))));
}

function polygonUnionMulti(polygons: Point[][]) {
  const inputs = polygons.filter((poly) => poly.length >= 3).map((poly) => [[toRing(poly)]] as WallPlanMultiPolygon);
  if (inputs.length === 0) return [] as WallPlanMultiPolygon;
  try {
    return polygonClipper.union(...inputs);
  } catch {
    return polygons.filter((poly) => poly.length >= 3).map((poly) => [toRing(poly)]);
  }
}

function flattenMultiPolygon(polygons: WallPlanMultiPolygon) {
  return polygons
    .flatMap((polygon) => polygon.map(fromRing))
    .filter((poly) => poly.length >= 3);
}

function finiteSegment(a: Point, b: Point) {
  return Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(b.x) && Number.isFinite(b.z) && dist(a, b) > 1e-8;
}

function footprintBoundaryEdges(footprint: WallPlanMultiPolygon): WallJoinDebugBoundaryEdge[] {
  const edges: WallJoinDebugBoundaryEdge[] = [];
  footprint.forEach((polygon) => {
    polygon.forEach((ring, ringIndex) => {
      const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
      for (let i = 0; i < pts.length; i += 1) {
        const aRaw = pts[i];
        const bRaw = pts[(i + 1) % pts.length];
        if (!aRaw || !bRaw) continue;
        const a = { x: aRaw[0], z: aRaw[1] };
        const b = { x: bRaw[0], z: bRaw[1] };
        if (!finiteSegment(a, b)) continue;
        edges.push({ kind: ringIndex === 0 ? "outer" : "inner", a, b });
      }
    });
  });
  return edges;
}

function pointOnSegment(point: Point, a: Point, b: Point, eps = 1e-6) {
  const ab = sub(b, a);
  const lengthSq = len2(ab);
  if (lengthSq < 1e-12) return dist(point, a) <= eps;
  const ap = sub(point, a);
  const lineDistance = Math.abs(cross(ap, ab)) / Math.sqrt(lengthSq);
  if (lineDistance > eps) return false;
  const t = dot(ap, ab) / lengthSq;
  return t >= -eps && t <= 1 + eps;
}

function pointStrictlyInsidePolygon(point: Point, polygon: Point[], eps = 1e-6) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if (pointOnSegment(point, pi, pj, eps)) return false;
    const crosses = pi.z > point.z !== pj.z > point.z;
    if (!crosses) continue;
    const xAtZ = ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z) + pi.x;
    if (point.x < xAtZ) inside = !inside;
  }
  return inside;
}

function pushUniqueNumber(values: number[], value: number, eps = 1e-6) {
  if (value < eps || value > 1 - eps) return;
  if (values.some((existing) => Math.abs(existing - value) <= eps)) return;
  values.push(value);
}

function segmentSplitParameters(a: Point, b: Point, polygon: Point[]) {
  const values = [0, 1];
  const segmentDir = sub(b, a);
  const segmentLenSq = len2(segmentDir);
  if (segmentLenSq < 1e-12) return values;

  const paramOf = (point: Point) => dot(sub(point, a), segmentDir) / segmentLenSq;
  for (let i = 0; i < polygon.length; i += 1) {
    const c = polygon[i]!;
    const d = polygon[(i + 1) % polygon.length]!;
    const edgeDir = sub(d, c);
    const hit = intersectLines({ p: a, d: segmentDir }, { p: c, d: edgeDir });
    if (hit && hit.ta > 1e-6 && hit.ta < 1 - 1e-6 && hit.tb > -1e-6 && hit.tb < 1 + 1e-6) {
      pushUniqueNumber(values, hit.ta);
      continue;
    }

    if (Math.abs(cross(segmentDir, edgeDir)) > 1e-6) continue;
    if (Math.abs(cross(sub(c, a), segmentDir)) > 1e-6) continue;
    pushUniqueNumber(values, paramOf(c));
    pushUniqueNumber(values, paramOf(d));
  }

  return values.sort((left, right) => left - right);
}

function clippedVisibleSegments(
  a: Point,
  b: Point,
  blockers: Point[][]
): Array<{ a: Point; b: Point }> {
  if (!finiteSegment(a, b)) return [];
  const dir = sub(b, a);
  const splitValues = [0, 1];
  for (const blocker of blockers) {
    for (const t of segmentSplitParameters(a, b, blocker)) pushUniqueNumber(splitValues, t);
  }
  splitValues.sort((left, right) => left - right);

  const at = (t: number) => ({ x: a.x + dir.x * t, z: a.z + dir.z * t });
  const out: Array<{ a: Point; b: Point }> = [];
  for (let i = 0; i < splitValues.length - 1; i += 1) {
    const start = splitValues[i]!;
    const end = splitValues[i + 1]!;
    if (end - start <= 1e-6) continue;
    const mid = at((start + end) / 2);
    if (blockers.some((blocker) => pointStrictlyInsidePolygon(mid, blocker))) continue;
    const p0 = at(start);
    const p1 = at(end);
    if (finiteSegment(p0, p1)) out.push({ a: p0, b: p1 });
  }
  return out;
}

function solvedWallBoundaryEdges(solvedWalls: WallSolved[]): WallJoinDebugBoundaryEdge[] {
  const edges: WallJoinDebugBoundaryEdge[] = [];
  for (const wall of solvedWalls) {
    const blockers = solvedWalls.filter((item) => item.id !== wall.id).map((item) => item.outline);
    const faceCandidates: Array<{ side: "left" | "right"; a: Point; b: Point }> = [
      { side: "left", a: wall.a.left, b: wall.b.left },
      { side: "right", a: wall.a.right, b: wall.b.right }
    ];
    for (const candidate of faceCandidates) {
      for (const segment of clippedVisibleSegments(candidate.a, candidate.b, blockers)) {
        edges.push({
          kind: "wallFace",
          wallId: wall.id,
          side: candidate.side,
          a: segment.a,
          b: segment.b
        });
      }
    }

    const capCandidates: Array<{ end: WallEnd; source: WallJoinDebugCap["source"]; a: Point; b: Point }> = [
      { end: "a", source: wall.a.source, a: wall.a.left, b: wall.a.right },
      { end: "b", source: wall.b.source, a: wall.b.right, b: wall.b.left }
    ];
    for (const candidate of capCandidates) {
      if (candidate.source === "join") continue;
      if (!finiteSegment(candidate.a, candidate.b)) continue;
      edges.push({
        kind: candidate.source === "bodyJoin" ? "join" : "cap",
        wallId: wall.id,
        side: "cap",
        end: candidate.end,
        source: candidate.source,
        a: candidate.a,
        b: candidate.b
      });
    }
  }
  return edges.sort(
    (a, b) =>
      (a.kind.localeCompare(b.kind) ||
        (a.wallId ?? "").localeCompare(b.wallId ?? "") ||
        (a.side ?? "").localeCompare(b.side ?? "") ||
        (a.end ?? "").localeCompare(b.end ?? "") ||
        a.a.x - b.a.x ||
        a.a.z - b.a.z ||
        a.b.x - b.b.x ||
        a.b.z - b.b.z)
  );
}

function makeOffsetEdges(wall: Wall): WallJoinDebugEdge[] {
  const a = rawEndCorners(wall, "a");
  const b = rawEndCorners(wall, "b");
  return [
    { wallId: wall.id, side: "left", a: a.left, b: b.left },
    { wallId: wall.id, side: "right", a: a.right, b: b.right },
    { wallId: wall.id, end: "a", side: "cap", a: a.left, b: a.right },
    { wallId: wall.id, end: "b", side: "cap", a: b.right, b: b.left }
  ];
}

function connectedTolerance(a: EndpointRef, b: EndpointRef, nodeTolM: number) {
  return Math.max(nodeTolM, Math.min(a.wall.thicknessM, b.wall.thicknessM) * 0.75);
}

function endpointClusterTolerance(nodeTolM: number) {
  return Math.max(1e-7, Math.min(1e-4, nodeTolM * 0.25));
}

function clusterEndpointRefs(group: EndpointRef[], tol: number) {
  const clusters: Array<{ point: Point; count: number; first: EndpointRef }> = [];
  for (const endpoint of group) {
    let cluster = clusters.find((item) => dist(item.point, endpoint.point) <= tol);
    if (!cluster) {
      cluster = { point: { ...endpoint.point }, count: 0, first: endpoint };
      clusters.push(cluster);
    }
    cluster.count += 1;
    cluster.point = {
      x: (cluster.point.x * (cluster.count - 1) + endpoint.point.x) / cluster.count,
      z: (cluster.point.z * (cluster.count - 1) + endpoint.point.z) / cluster.count
    };
  }
  return clusters;
}

function canonicalNodePointInfo(group: EndpointRef[], nodeTolM: number) {
  const tightTol = endpointClusterTolerance(nodeTolM);
  const clusters = clusterEndpointRefs(group, tightTol);

  const anchored = clusters
    .filter((cluster) => cluster.count > 1)
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.point.x - b.point.x ||
        a.point.z - b.point.z ||
        a.first.wall.id.localeCompare(b.first.wall.id) ||
        a.first.end.localeCompare(b.first.end)
    )[0];
  if (anchored) return { point: anchored.point, anchored: true };

  return {
    point: {
      x: group.reduce((sum, endpoint) => sum + endpoint.point.x, 0) / group.length,
      z: group.reduce((sum, endpoint) => sum + endpoint.point.z, 0) / group.length
    },
    anchored: false
  };
}

function canonicalNodePoint(group: EndpointRef[], nodeTolM: number) {
  return canonicalNodePointInfo(group, nodeTolM).point;
}

function splitAnchoredEndpointGroup(group: EndpointRef[], nodeTolM: number): EndpointRef[][] {
  const info = canonicalNodePointInfo(group, nodeTolM);
  if (!info.anchored) return [group];

  const tightTol = endpointClusterTolerance(nodeTolM);
  const anchored: EndpointRef[] = [];
  const loose: EndpointRef[] = [];
  for (const endpoint of group) {
    (dist(endpoint.point, info.point) <= tightTol ? anchored : loose).push(endpoint);
  }

  const groups: EndpointRef[][] = anchored.length > 0 ? [anchored] : [];
  for (const cluster of clusterEndpointRefs(loose, tightTol)) {
    groups.push(loose.filter((endpoint) => dist(endpoint.point, cluster.point) <= tightTol));
  }
  return groups;
}

function buildEndpointNodes(walls: Wall[], nodeTolM: number): NodeDraft[] {
  const endpoints: EndpointRef[] = walls.flatMap((wall) => [
    { wall, end: "a" as const, point: wall.a },
    { wall, end: "b" as const, point: wall.b }
  ]);
  endpoints.sort(
    (a, b) =>
      a.point.x - b.point.x ||
      a.point.z - b.point.z ||
      a.wall.id.localeCompare(b.wall.id) ||
      a.end.localeCompare(b.end)
  );

  const parent = endpoints.map((_, index) => index);
  const find = (index: number): number => {
    const p = parent[index]!;
    if (p === index) return index;
    const root = find(p);
    parent[index] = root;
    return root;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (dist(endpoints[i]!.point, endpoints[j]!.point) <= connectedTolerance(endpoints[i]!, endpoints[j]!, nodeTolM)) {
        unite(i, j);
      }
    }
  }

  const groups = new Map<number, EndpointRef[]>();
  endpoints.forEach((endpoint, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(endpoint);
    groups.set(root, group);
  });

  return [...groups.values()]
    .flatMap((group) => splitAnchoredEndpointGroup(group, nodeTolM))
    .map((group) => {
      const p = canonicalNodePoint(group, nodeTolM);
      return {
        id: key(p, nodeTolM),
        p,
        incident: group.map(({ wall, end }) => ({ wall, end }))
      };
    })
    .sort((a, b) => a.p.x - b.p.x || a.p.z - b.p.z || a.id.localeCompare(b.id));
}

function sideLinesForNode(wall: Wall, end: WallEnd, node: Point) {
  const raw = rawEndCornersAtNode(wall, node);
  const dir = spineDir(wall, end);
  const lineFor = (side: "left" | "right", p: Point) => ({ side, line: { p, d: dir } as Line });
  const lines = [lineFor("left", raw.left), lineFor("right", raw.right)];
  const withSide = lines.map((entry) => ({
    ...entry,
    ccw: (entry.line.p.x - node.x) * dir.z - (entry.line.p.z - node.z) * dir.x < 0
  }));
  const ccw = withSide.find((entry) => entry.ccw) ?? withSide[0]!;
  const cw = withSide.find((entry) => !entry.ccw) ?? withSide[1] ?? withSide[0]!;
  return { ccw, cw };
}

function sideLineForSideAtNode(wall: Wall, end: WallEnd, node: Point, side: "left" | "right") {
  const raw = rawEndCornersAtNode(wall, node);
  return {
    side,
    line: { p: side === "left" ? raw.left : raw.right, d: spineDir(wall, end) } as Line
  };
}

function sortedIncidentAtNode(node: NodeDraft): SortedIncident[] {
  const incident = node.incident.filter(joinEnabled);
  return incident
    .map((item, index) => ({
      item,
      index,
      angle: angleOf(spineDir(item.wall, item.end))
    }))
    .sort((a, b) => a.angle - b.angle || a.item.wall.id.localeCompare(b.item.wall.id) || a.item.end.localeCompare(b.item.end) || a.index - b.index);
}

function nodeIntersections(node: NodeDraft): WallJoinDebugIntersection[] {
  const sorted = sortedIncidentAtNode(node);
  const intersections: WallJoinDebugIntersection[] = [];
  if (sorted.length >= 2) {
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i]!;
      const next = sorted[(i + 1) % sorted.length]!;
      const currentSides = sideLinesForNode(current.item.wall, current.item.end, node.p);
      const nextSides = sideLinesForNode(next.item.wall, next.item.end, node.p);
      const hit = intersectLines(currentSides.ccw.line, nextSides.cw.line);
      if (!hit) continue;
      intersections.push({
        nodeId: node.id,
        aWallId: current.item.wall.id,
        bWallId: next.item.wall.id,
        point: hit.p
      });
    }
  }

  return intersections;
}

function buildJoinPolyForNode(node: NodeDraft) {
  const points = dedupeLoop(nodeIntersections(node).map((hit) => hit.point));
  return points.length >= 3 ? ensureCcw(points) : [];
}

function buildNodeDebug(node: NodeDraft): WallJoinDebugNode {
  const sorted = sortedIncidentAtNode(node);
  const intersections = nodeIntersections(node);

  return {
    id: node.id,
    p: node.p,
    incident: node.incident,
    sortedIncident: sorted.map((entry) => ({ wallId: entry.item.wall.id, end: entry.item.end, angle: entry.angle })),
    intersections
  };
}

function cloneEndDraft(end: SolvedEndDraft): SolvedEndDraft {
  return {
    left: { ...end.left },
    right: { ...end.right },
    source: end.source,
    boundaryChain: end.boundaryChain?.map((point) => ({ ...point })),
    extra: end.extra?.map((point) => ({ ...point }))
  };
}

function setDraftSide(draft: SolvedEndDraft, side: "left" | "right", point: Point) {
  draft[side] = { ...point };
}

function isPerpendicular(a: Point, b: Point, eps = 1e-6) {
  return Math.abs(dot(a, b)) <= eps;
}

function throughPreference(item: { wall: Wall; end: WallEnd }) {
  const dir = spineDir(item.wall, item.end);
  const horizontalBias = Math.abs(dir.x) - Math.abs(dir.z);
  const angle = angleOf(dir);
  return { horizontalBias, angle };
}

function chooseThroughIncident(
  first: { wall: Wall; end: WallEnd },
  second: { wall: Wall; end: WallEnd }
) {
  const a = throughPreference(first);
  const b = throughPreference(second);
  if (Math.abs(a.horizontalBias - b.horizontalBias) > 1e-9) return a.horizontalBias > b.horizontalBias ? first : second;
  if (Math.abs(a.angle - b.angle) > 1e-9) return a.angle < b.angle ? first : second;
  return first.wall.id.localeCompare(second.wall.id) <= 0 ? first : second;
}

function solvePerpendicularButtJoinNode(node: NodeDraft, solvedEnds: Map<string, { a: SolvedEndDraft; b: SolvedEndDraft }>, first: SortedIncident, second: SortedIncident) {
  const firstOut = spineDir(first.item.wall, first.item.end);
  const secondOut = spineDir(second.item.wall, second.item.end);
  if (!isPerpendicular(firstOut, secondOut)) return false;

  const through = chooseThroughIncident(first.item, second.item);
  const branch = through.wall.id === first.item.wall.id && through.end === first.item.end ? second.item : first.item;
  const throughOut = spineDir(through.wall, through.end);
  const branchOut = spineDir(branch.wall, branch.end);
  const branchOffsets = offsetsM(branch.wall);
  const throughExtension = Math.max(Math.abs(branchOffsets.left), Math.abs(branchOffsets.right));
  const throughCapCenter = add(node.p, mul(throughOut, -throughExtension));
  const throughNormal = leftNormal(through.wall);
  const throughOffsets = offsetsM(through.wall);
  const throughDraft: SolvedEndDraft = {
    left: add(throughCapCenter, mul(throughNormal, throughOffsets.left)),
    right: add(throughCapCenter, mul(throughNormal, throughOffsets.right)),
    source: "join"
  };

  const throughSideLines = (["left", "right"] as const)
    .map((side) => {
      const entry = sideLineForSideAtNode(through.wall, through.end, node.p, side);
      return { ...entry, score: dot(sub(entry.line.p, node.p), branchOut) };
    })
    .sort((a, b) => b.score - a.score || a.side.localeCompare(b.side));
  const cut = throughSideLines[0];
  if (!cut) return false;

  const branchLeftLine = sideLineForSideAtNode(branch.wall, branch.end, node.p, "left");
  const branchRightLine = sideLineForSideAtNode(branch.wall, branch.end, node.p, "right");
  const leftHit = intersectLines(branchLeftLine.line, cut.line);
  const rightHit = intersectLines(branchRightLine.line, cut.line);
  if (!leftHit || !rightHit) return false;
  const branchDraft: SolvedEndDraft = {
    left: leftHit.p,
    right: rightHit.p,
    source: "join"
  };

  const throughEnds = solvedEnds.get(through.wall.id);
  const branchEnds = solvedEnds.get(branch.wall.id);
  if (!throughEnds || !branchEnds) return false;
  throughEnds[through.end] = throughDraft;
  branchEnds[branch.end] = branchDraft;
  return true;
}

function areOppositeDirections(a: Point, b: Point, eps = 1e-5) {
  return Math.abs(cross(a, b)) <= eps && dot(a, b) < -1 + eps;
}

function chooseCollinearThroughPair(sorted: SortedIncident[]) {
  if (sorted.length !== 3) return null as { first: SortedIncident; second: SortedIncident; branch: SortedIncident } | null;
  const candidates: Array<{ first: SortedIncident; second: SortedIncident; branch: SortedIncident; score: number }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = sorted[i]!;
      const second = sorted[j]!;
      const firstOut = spineDir(first.item.wall, first.item.end);
      const secondOut = spineDir(second.item.wall, second.item.end);
      if (!areOppositeDirections(firstOut, secondOut)) continue;
      const branch = sorted.find((entry) => entry !== first && entry !== second);
      if (!branch) continue;
      const branchOut = spineDir(branch.item.wall, branch.item.end);
      if (Math.abs(cross(firstOut, branchOut)) <= 1e-5) continue;
      candidates.push({
        first,
        second,
        branch,
        score: Math.abs(dot(firstOut, secondOut) + 1) + Math.abs(cross(firstOut, secondOut))
      });
    }
  }
  return candidates.sort((a, b) => a.score - b.score || a.first.item.wall.id.localeCompare(b.first.item.wall.id))[0] ?? null;
}

function solveCollinearTJoinNode(node: NodeDraft, solvedEnds: Map<string, { a: SolvedEndDraft; b: SolvedEndDraft }>, sorted: SortedIncident[]) {
  const match = chooseCollinearThroughPair(sorted);
  if (!match) return false;

  const throughItems = [match.first.item, match.second.item];
  for (const through of throughItems) {
    const ends = solvedEnds.get(through.wall.id);
    if (!ends) return false;
    const draft = rawEndCornersAtNode(through.wall, node.p);
    draft.source = "join";
    ends[through.end] = draft;
  }

  const branch = match.branch.item;
  const branchOut = spineDir(branch.wall, branch.end);
  const through = match.first.item;
  const cut = (["left", "right"] as const)
    .map((side) => {
      const entry = sideLineForSideAtNode(through.wall, through.end, node.p, side);
      return { ...entry, score: dot(sub(entry.line.p, node.p), branchOut) };
    })
    .sort((a, b) => b.score - a.score || a.side.localeCompare(b.side))[0];
  if (!cut) return false;

  const branchLeftLine = sideLineForSideAtNode(branch.wall, branch.end, node.p, "left");
  const branchRightLine = sideLineForSideAtNode(branch.wall, branch.end, node.p, "right");
  const leftHit = intersectLines(branchLeftLine.line, cut.line);
  const rightHit = intersectLines(branchRightLine.line, cut.line);
  const branchEnds = solvedEnds.get(branch.wall.id);
  if (!leftHit || !rightHit || !branchEnds) return false;
  branchEnds[branch.end] = {
    left: leftHit.p,
    right: rightHit.p,
    source: "join"
  };
  return true;
}

function incidentKey(item: { wall: Wall; end: WallEnd }) {
  return `${item.wall.id}:${item.end}`;
}

function clockwiseDelta(from: number, to: number) {
  const delta = to - from;
  return delta < 0 ? delta + Math.PI * 2 : delta;
}

function angleBetweenShortSweep(angle: number, start: number, end: number, eps = 1e-6) {
  const sweep = clockwiseDelta(start, end);
  const rel = clockwiseDelta(start, angle);
  if (sweep <= Math.PI + eps) return rel >= -eps && rel <= sweep + eps;
  return !(rel > sweep + eps && rel < Math.PI * 2 - eps);
}

function choosePrimaryCornerPair(sorted: SortedIncident[]) {
  if (sorted.length !== 3) return null as { first: SortedIncident; second: SortedIncident } | null;
  const candidates: Array<{ first: SortedIncident; second: SortedIncident; containsBranch: boolean }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const first = sorted[i]!;
      const second = sorted[j]!;
      const firstOut = spineDir(first.item.wall, first.item.end);
      const secondOut = spineDir(second.item.wall, second.item.end);
      if (!isPerpendicular(firstOut, secondOut, 1e-5)) continue;
      const sweep = clockwiseDelta(first.angle, second.angle);
      const start = sweep <= Math.PI ? first : second;
      const end = sweep <= Math.PI ? second : first;
      const shortSweep = Math.min(sweep, Math.PI * 2 - sweep);
      if (shortSweep > Math.PI / 2 + 1e-4) continue;
      const branch = sorted.find((entry) => entry !== first && entry !== second);
      if (!branch) continue;
      candidates.push({
        first,
        second,
        containsBranch: angleBetweenShortSweep(branch.angle, start.angle, end.angle, 1e-6)
      });
    }
  }
  const containing = candidates.find((candidate) => candidate.containsBranch);
  if (containing) return { first: containing.first, second: containing.second };
  return null;
}

function genericJoinDrafts(node: NodeDraft, sorted: SortedIncident[]) {
  const drafts = new Map<string, SolvedEndDraft>();
  const draftFor = (item: { wall: Wall; end: WallEnd }) => {
    const keyValue = incidentKey(item);
    let draft = drafts.get(keyValue);
    if (!draft) {
      draft = cloneEndDraft(rawEndCornersAtNode(item.wall, node.p));
      draft.source = "join";
      drafts.set(keyValue, draft);
    }
    return draft;
  };

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    const next = sorted[(i + 1) % sorted.length]!;
    const currentSides = sideLinesForNode(current.item.wall, current.item.end, node.p);
    const nextSides = sideLinesForNode(next.item.wall, next.item.end, node.p);
    const hit = intersectLines(currentSides.ccw.line, nextSides.cw.line);
    if (!hit) continue;
    setDraftSide(draftFor(current.item), currentSides.ccw.side, hit.p);
    setDraftSide(draftFor(next.item), nextSides.cw.side, hit.p);
  }

  return drafts;
}

function solveEndpointJoinNode(node: NodeDraft, solvedEnds: Map<string, { a: SolvedEndDraft; b: SolvedEndDraft }>) {
  const sorted = sortedIncidentAtNode(node);
  if (sorted.length < 2) return;
  if (sorted.length === 3 && solveCollinearTJoinNode(node, solvedEnds, sorted)) return;
  if (sorted.length === 2 && solvePerpendicularButtJoinNode(node, solvedEnds, sorted[0]!, sorted[1]!)) return;

  const drafts = genericJoinDrafts(node, sorted);
  const primaryCorner = choosePrimaryCornerPair(sorted);
  if (primaryCorner && solvePerpendicularButtJoinNode(node, solvedEnds, primaryCorner.first, primaryCorner.second)) {
    const primaryKeys = new Set([incidentKey(primaryCorner.first.item), incidentKey(primaryCorner.second.item)]);
    for (const entry of sorted) {
      const keyValue = incidentKey(entry.item);
      if (primaryKeys.has(keyValue)) continue;
      const ends = solvedEnds.get(entry.item.wall.id);
      const draft = drafts.get(keyValue);
      if (!ends || !draft) continue;
      ends[entry.item.end] = draft;
    }
    return;
  }

  for (const entry of sorted) {
    const ends = solvedEnds.get(entry.item.wall.id);
    const draft = drafts.get(incidentKey(entry.item));
    if (!ends || !draft) continue;
    ends[entry.item.end] = draft;
  }
}

function lineForWallSide(wall: Wall, side: "left" | "right"): Line {
  const raw = rawEndCorners(wall, "a");
  return { p: side === "left" ? raw.left : raw.right, d: baseDir(wall) };
}

function pointProjectionOnWall(point: Point, wall: Wall) {
  const d = sub(wall.b, wall.a);
  const lengthSq = len2(d);
  if (lengthSq < 1e-12) return null;
  const t = dot(sub(point, wall.a), d) / lengthSq;
  const projected = add(wall.a, mul(d, t));
  return { t, point: projected, distance: dist(point, projected) };
}

function solveEndpointOnWallBodyJoins(walls: Wall[], nodeDrafts: NodeDraft[], solvedEnds: Map<string, { a: SolvedEndDraft; b: SolvedEndDraft }>, nodeTolM: number) {
  const endpointKeysInJoinNodes = new Set(
    nodeDrafts
      .filter((node) => sortedIncidentAtNode(node).length >= 2)
      .flatMap((node) => node.incident.map((incident) => `${incident.wall.id}:${incident.end}`))
  );

  const endpoints: EndpointRef[] = walls.flatMap((wall) => [
    { wall, end: "a" as const, point: wall.a },
    { wall, end: "b" as const, point: wall.b }
  ]);

  for (const endpoint of endpoints) {
    if (!joinEnabled(endpoint) || endpointKeysInJoinNodes.has(`${endpoint.wall.id}:${endpoint.end}`)) continue;

    const branchOut = spineDir(endpoint.wall, endpoint.end);
    const candidates: Array<{
      host: Wall;
      projection: Point;
      projectionT: number;
      distance: number;
      alignment: number;
      cut: { side: "left" | "right"; line: Line; score: number };
    }> = [];
    for (const host of walls) {
      if (host.id === endpoint.wall.id) continue;
      const projection = pointProjectionOnWall(endpoint.point, host);
      if (!projection) continue;
      if (projection.t <= 1e-5 || projection.t >= 1 - 1e-5) continue;
      const hostOffsets = offsetsM(host);
      const hostFaceReach = Math.max(Math.abs(hostOffsets.left), Math.abs(hostOffsets.right));
      const tol = Math.max(nodeTolM, hostFaceReach + nodeTolM);
      if (projection.distance > tol) continue;
      const alignment = Math.abs(dot(baseDir(host), branchOut));
      const hostSides = (["left", "right"] as const)
        .map((side) => {
          const line = lineForWallSide(host, side);
          return { side, line, score: dot(sub(line.p, projection.point), branchOut) };
        })
        .sort((a, b) => b.score - a.score || a.side.localeCompare(b.side));
      const cut = hostSides[0];
      if (!cut) continue;
      candidates.push({ host, projection: projection.point, projectionT: projection.t, distance: projection.distance, alignment, cut });
    }
    if (candidates.length === 0) continue;
    candidates.sort(
      (a, b) =>
        a.distance - b.distance ||
        b.alignment - a.alignment ||
        a.host.id.localeCompare(b.host.id) ||
        a.cut.side.localeCompare(b.cut.side)
    );

    const best = candidates[0]!;
    const sameDistanceTol = Math.max(nodeTolM, 1e-6);
    const nearbyCandidates = candidates.filter((candidate) => Math.abs(candidate.distance - best.distance) <= sameDistanceTol);
    // A body join needs one resolved host face per endpoint. Combining equally close corner
    // hosts produced an L-shaped "extra" point, which made the wall outline close through
    // the wrong boundary. Keep the highest-ranked host deterministic here; multi-host corner
    // fills are handled by the final network footprint, not by a single wall outline.
    const activeCandidates = [best];
    const chooseSideHit = (side: "left" | "right") => {
      const branchLine = sideLineForSideAtNode(endpoint.wall, endpoint.end, endpoint.point, side).line;
      const hits = activeCandidates
        .map((candidate) => {
          const hit = intersectLines(branchLine, candidate.cut.line);
          return hit ? { candidate, hit } : null;
        })
        .filter((hit): hit is { candidate: (typeof activeCandidates)[number]; hit: NonNullable<ReturnType<typeof intersectLines>> } => !!hit);
      if (hits.length === 0) return null;
      const forwardHits = hits.filter((entry) => entry.hit.ta >= -sameDistanceTol);
      const pool = forwardHits.length > 0 ? forwardHits : hits;
      return [...pool].sort(
        (a, b) =>
          Math.abs(a.hit.ta) - Math.abs(b.hit.ta) ||
          a.candidate.distance - b.candidate.distance ||
          b.candidate.alignment - a.candidate.alignment ||
          a.candidate.host.id.localeCompare(b.candidate.host.id)
      )[0]!;
    };

    const leftHit = chooseSideHit("left");
    const rightHit = chooseSideHit("right");
    if (!leftHit || !rightHit) continue;

    let leftPoint = leftHit.hit.p;
    let rightPoint = rightHit.hit.p;
    const isCornerCap = leftHit.candidate !== rightHit.candidate || leftHit.candidate.cut.side !== rightHit.candidate.cut.side;
    if (!isCornerCap && activeCandidates.length > 1) {
      const hostDir = baseDir(best.host);
      for (const candidate of nearbyCandidates) {
        if (candidate === best) continue;
        const corner = intersectLines(best.cut.line, candidate.cut.line);
        if (!corner) continue;
        const sideLimit = best.projectionT <= 0.5 ? 1 : -1;
        const param = (point: Point) => dot(sub(point, corner.p), hostDir);
        const leftParam = param(leftPoint);
        const rightParam = param(rightPoint);
        const violation = sideLimit > 0 ? Math.min(leftParam, rightParam, 0) : Math.max(leftParam, rightParam, 0);
        if (Math.abs(violation) <= 1e-8) continue;
        const shift = -violation;
        leftPoint = add(leftPoint, mul(hostDir, shift));
        rightPoint = add(rightPoint, mul(hostDir, shift));
      }
    }

    const ends = solvedEnds.get(endpoint.wall.id);
    if (!ends) continue;
    const draft = cloneEndDraft(rawEndCornersAtNode(endpoint.wall, endpoint.point));
    draft.source = "bodyJoin";
    setDraftSide(draft, "left", leftPoint);
    setDraftSide(draft, "right", rightPoint);
    if (isCornerCap) {
      const corner = intersectLines(leftHit.candidate.cut.line, rightHit.candidate.cut.line);
      if (corner && dist(corner.p, draft.left) > 1e-8 && dist(corner.p, draft.right) > 1e-8) {
        draft.boundaryChain = [corner.p];
        draft.extra = [corner.p];
      }
    }
    ends[endpoint.end] = draft;
  }
}

function finitePoint(point: Point) {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}

function endpointWidthAlongWallNormal(wall: Wall, draft: SolvedEndDraft) {
  return Math.abs(dot(sub(draft.left, draft.right), leftNormal(wall)));
}

function finalizeEndDraft(wall: Wall, end: WallEnd, draft: SolvedEndDraft) {
    const raw = rawEndDraft(wall, end);
  const minWidth = Math.max(1e-6, wall.thicknessM * 0.05);
  if (!finitePoint(draft.left) || !finitePoint(draft.right) || dist(draft.left, draft.right) <= 1e-8 || endpointWidthAlongWallNormal(wall, draft) < minWidth) {
    return {
      left: raw.left,
      right: raw.right,
      source: "fallback" as const
    };
  }
  return draft;
}

function validPolygon(points: Point[]) {
  return points.length >= 4 && points.every(finitePoint) && Math.abs(signedArea(points)) > 1e-10;
}

function solveWallOutline(wall: Wall, ends: { a: SolvedEndDraft; b: SolvedEndDraft }) {
  const a = finalizeEndDraft(wall, "a", ends.a);
  const b = finalizeEndDraft(wall, "b", ends.b);
  let outline = wallSolvedPolygon(a, b);
  if (!validPolygon(outline)) {
    const rawA = rawEndDraft(wall, "a");
    const rawB = rawEndDraft(wall, "b");
    const fallbackA: SolvedEndDraft = { left: rawA.left, right: rawA.right, source: "fallback" };
    const fallbackB: SolvedEndDraft = { left: rawB.left, right: rawB.right, source: "fallback" };
    outline = wallSolvedPolygon(fallbackA, fallbackB);
    return { a: fallbackA, b: fallbackB, outline };
  }
  return { a, b, outline };
}

function solvedCapDebug(wallId: string, end: WallEnd, draft: SolvedEndDraft): WallJoinDebugCap {
  return {
    wallId,
    end,
    source: draft.source,
    left: draft.left,
    right: draft.right,
    boundaryChain: draft.boundaryChain?.map((point) => ({ ...point }))
  };
}

export function solveWallNetwork(
  walls: Wall[],
  opts: { nodeTolM?: number; miterLimit?: number } = {}
): { walls: WallSolved[]; joinPolys: Point[][]; footprint: WallPlanMultiPolygon; debug: WallJoinDebug } {
  void opts.miterLimit;
  const nodeTolM = opts.nodeTolM ?? 0.02;
  const rawWallPolygons = walls
    .map((wall) => ({ wallId: wall.id, polygon: wallRawPolygon(wall) }))
    .sort((a, b) => a.wallId.localeCompare(b.wallId));
  const nodeDrafts = buildEndpointNodes(walls, nodeTolM);
  const solvedEnds = new Map(
    walls.map((wall) => [
      wall.id,
      {
        a: rawEndDraft(wall, "a"),
        b: rawEndDraft(wall, "b")
      }
    ])
  );
  for (const node of nodeDrafts) solveEndpointJoinNode(node, solvedEnds);
  solveEndpointOnWallBodyJoins(walls, nodeDrafts, solvedEnds, nodeTolM);
  const solvedWalls = walls.map((wall) => {
    const ends = solvedEnds.get(wall.id) ?? { a: rawEndDraft(wall, "a"), b: rawEndDraft(wall, "b") };
    const solved = solveWallOutline(wall, ends);
    return {
      id: wall.id,
      a: { ...solved.a, join: "butt" as const },
      b: { ...solved.b, join: "butt" as const },
      outline: solved.outline
    };
  });
  const joinPolys = nodeDrafts.map(buildJoinPolyForNode).filter((poly) => poly.length >= 3);
  const footprint = polygonUnionMulti([...solvedWalls.map((entry) => entry.outline), ...joinPolys]);
  const finalPolygons = flattenMultiPolygon(footprint);
  const nodes = nodeDrafts.map(buildNodeDebug);
  const offsetEdges = walls.flatMap(makeOffsetEdges);
  const solvedCaps = solvedWalls.flatMap((wall) => [solvedCapDebug(wall.id, "a", wall.a), solvedCapDebug(wall.id, "b", wall.b)]);
  const intersections = nodes.flatMap((node) => node.intersections);
  const boundaryEdges = [...footprintBoundaryEdges(footprint), ...solvedWallBoundaryEdges(solvedWalls)];

  return {
    walls: solvedWalls,
    joinPolys,
    footprint,
    debug: {
      nodes,
      rawWallPolygons,
      offsetEdges,
      solvedCaps,
      intersections,
      finalPolygons,
      boundaryEdges
    }
  };
}
