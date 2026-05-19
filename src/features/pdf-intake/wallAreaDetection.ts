import type { VectorSegment } from "./vectorStrokeGrouping";

export interface WallAreaPolygon {
  id: string;
  sourceKind: "closed_polyline" | "paired_faces_band";
  sourceSegmentIds: string[];
  points: Array<{ x: number; y: number }>;
  area: number;
  perimeter: number;
  estimatedThickness: number;
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  confidence: number;
  reasons: string[];
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  degree: number;
}

interface DirectedEdge {
  key: string;
  from: string;
  to: string;
  segmentId: string;
  angle: number;
}

interface SplitEdge {
  segmentId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function detectWallAreaPolygons(input: {
  wallSegments: VectorSegment[];
  snapTolerance?: number;
  minSegmentLength?: number;
  minArea?: number;
  maxEstimatedThickness?: number;
  maxPolygonPoints?: number;
}): WallAreaPolygon[] {
  const snapTolerance = input.snapTolerance ?? 3;
  const minSegmentLength = input.minSegmentLength ?? 6;
  const minArea = input.minArea ?? 20;
  const maxEstimatedThickness = input.maxEstimatedThickness ?? 80;
  const maxPolygonPoints = input.maxPolygonPoints ?? 80;
  const graph = buildGraph(
    input.wallSegments.filter((segment) => segmentLength(segment) >= minSegmentLength && isMostlyStraightWallSegment(segment)),
    snapTolerance
  );
  const visited = new Set<string>();
  const rawPolygons: WallAreaPolygon[] = [];

  for (const edge of graph.directedEdges) {
    if (visited.has(edge.key)) continue;
    const face = traceFace(edge, graph.nodes, graph.adjacency, visited, maxPolygonPoints);
    if (!face) continue;
    const signedArea = polygonSignedArea(face.points);
    if (signedArea <= minArea) continue;
    const perimeter = polygonPerimeter(face.points);
    const estimatedThickness = perimeter > 0 ? (2 * signedArea) / perimeter : 0;
    if (estimatedThickness > maxEstimatedThickness) continue;
    const sourceSegmentIds = Array.from(new Set(face.segmentIds));
    const bounds = polygonBounds(face.points);
    const mostlySimpleBoundary = face.nodeIds.every((nodeId) => (graph.nodes.get(nodeId)?.degree ?? 0) <= 3);
    rawPolygons.push({
      id: `wall_area_${rawPolygons.length + 1}`,
      sourceKind: "closed_polyline",
      sourceSegmentIds,
      points: face.points.map((point) => ({ x: round(point.x), y: round(point.y) })),
      area: round(signedArea),
      perimeter: round(perimeter),
      estimatedThickness: round(estimatedThickness),
      bounds,
      confidence: mostlySimpleBoundary ? 0.84 : 0.72,
      reasons: [
        "closed wall-face polyline detected",
        `estimated thickness ${round(estimatedThickness)}`,
        mostlySimpleBoundary ? "simple boundary graph" : "boundary has wall junctions"
      ]
    });
  }

  return dedupeNestedWallAreas(rawPolygons).map((polygon, index) => ({ ...polygon, id: `wall_area_${index + 1}` }));
}

export function createWallAreaPolygonsFromCenterlines(input: {
  wallCenterlines: Array<{
    id: string;
    sourceSegmentIds: string[];
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    wallThicknessEstimate: number;
    confidence: number;
  }>;
  minLength?: number;
}): WallAreaPolygon[] {
  const minLength = input.minLength ?? 6;
  const polygons: WallAreaPolygon[] = [];

  for (const centerline of input.wallCenterlines) {
    const length = distance({ x: centerline.x1, y: centerline.y1 }, { x: centerline.x2, y: centerline.y2 });
    if (length < minLength || centerline.wallThicknessEstimate <= 0) continue;
    const axis = {
      x: (centerline.x2 - centerline.x1) / length,
      y: (centerline.y2 - centerline.y1) / length
    };
    const normal = { x: -axis.y, y: axis.x };
    const halfThickness = centerline.wallThicknessEstimate / 2;
    const points = [
      offsetPoint({ x: centerline.x1, y: centerline.y1 }, normal, halfThickness),
      offsetPoint({ x: centerline.x2, y: centerline.y2 }, normal, halfThickness),
      offsetPoint({ x: centerline.x2, y: centerline.y2 }, normal, -halfThickness),
      offsetPoint({ x: centerline.x1, y: centerline.y1 }, normal, -halfThickness)
    ];
    const area = Math.abs(polygonSignedArea(points));
    polygons.push({
      id: `wall_area_band_${polygons.length + 1}`,
      sourceKind: "paired_faces_band",
      sourceSegmentIds: Array.from(new Set(centerline.sourceSegmentIds)),
      points: points.map((point) => ({ x: round(point.x), y: round(point.y) })),
      area: round(area),
      perimeter: round(polygonPerimeter(points)),
      estimatedThickness: round(centerline.wallThicknessEstimate),
      bounds: polygonBounds(points),
      confidence: round(Math.min(0.78, centerline.confidence)),
      reasons: [
        "closed wall band created from paired wall faces",
        `centerline ${centerline.id}`,
        `estimated thickness ${round(centerline.wallThicknessEstimate)}`
      ]
    });
  }

  return polygons;
}

export function detectWallAreaPolygonsByStrokeFloodFill(input: {
  wallSegments: VectorSegment[];
  gridSize?: number;
  minArea?: number;
  maxEstimatedThickness?: number;
  maxPolygonPoints?: number;
  barrierPadding?: number;
  boundarySnapDistance?: number;
}): WallAreaPolygon[] {
  const gridSize = input.gridSize ?? 1;
  const minArea = input.minArea ?? 20;
  const maxEstimatedThickness = input.maxEstimatedThickness ?? 80;
  const maxPolygonPoints = input.maxPolygonPoints ?? 500;
  const barrierPadding = input.barrierPadding ?? 0.45;
  const boundarySnapDistance = input.boundarySnapDistance ?? 0;
  const wallSegments = input.wallSegments.filter((segment) => segmentLength(segment) >= 0.5 && isMostlyStraightWallSegment(segment));
  if (wallSegments.length === 0) return [];

  const bounds = segmentCollectionBounds(wallSegments, Math.max(12, maxEstimatedThickness * 0.25));
  const width = Math.ceil((bounds.xMax - bounds.xMin) / gridSize) + 1;
  const height = Math.ceil((bounds.yMax - bounds.yMin) / gridSize) + 1;
  const blocked = new Uint8Array(width * height);

  for (const segment of wallSegments) {
    const radius = Math.max(0.9, segment.strokeWidth / 2 + barrierPadding);
    const xMin = clampIndex(Math.floor((Math.min(segment.x1, segment.x2) - radius - bounds.xMin) / gridSize), width);
    const xMax = clampIndex(Math.ceil((Math.max(segment.x1, segment.x2) + radius - bounds.xMin) / gridSize), width);
    const yMin = clampIndex(Math.floor((Math.min(segment.y1, segment.y2) - radius - bounds.yMin) / gridSize), height);
    const yMax = clampIndex(Math.ceil((Math.max(segment.y1, segment.y2) + radius - bounds.yMin) / gridSize), height);

    for (let y = yMin; y <= yMax; y += 1) {
      for (let x = xMin; x <= xMax; x += 1) {
        const point = gridCellCenter(bounds, gridSize, x, y);
        if (distancePointToSegment(point, segment) <= radius) blocked[cellIndex(x, y, width)] = 1;
      }
    }
  }

  const visited = new Uint8Array(width * height);
  const polygons: WallAreaPolygon[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = cellIndex(x, y, width);
      if (blocked[startIndex] || visited[startIndex]) continue;
      const component = floodFillOpenComponent(x, y, width, height, blocked, visited);
      if (component.touchesBoundary) continue;

      const area = component.cells.length * gridSize * gridSize;
      if (area < minArea) continue;
      const tracedLoop = traceGridComponentBoundary(component.cells, width, height, bounds, gridSize);
      const loop = boundarySnapDistance > 0
        ? simplifyCollinearPolygon(snapPolygonToNearbyWallLines(tracedLoop, wallSegments, boundarySnapDistance))
        : tracedLoop;
      if (loop.length < 4 || loop.length > maxPolygonPoints) continue;
      const signedArea = Math.abs(polygonSignedArea(loop));
      const perimeter = polygonPerimeter(loop);
      const estimatedThickness = perimeter > 0 ? (2 * signedArea) / perimeter : 0;
      if (estimatedThickness <= 0 || estimatedThickness > maxEstimatedThickness) continue;

      const polygonBoundsValue = polygonBounds(loop);
      const sourceSegmentIds = wallSegments
        .filter((segment) => segmentOverlapsBounds(segment, polygonBoundsValue, Math.max(maxEstimatedThickness, gridSize * 4)))
        .map((segment) => segment.id);

      polygons.push({
        id: `wall_area_${polygons.length + 1}`,
        sourceKind: "closed_polyline",
        sourceSegmentIds: Array.from(new Set(sourceSegmentIds)),
        points: loop.map((point) => ({ x: round(point.x), y: round(point.y) })),
        area: round(signedArea),
        perimeter: round(perimeter),
        estimatedThickness: round(estimatedThickness),
        bounds: polygonBoundsValue,
        confidence: 0.76,
        reasons: [
          "closed wall area detected by stroke flood fill",
          `estimated thickness ${round(estimatedThickness)}`,
          `grid size ${gridSize}`,
          boundarySnapDistance > 0 ? `boundary snapped to wall lines within ${boundarySnapDistance}` : "boundary not snapped"
        ]
      });
    }
  }

  return dedupeNestedWallAreas(polygons).map((polygon, index) => ({ ...polygon, id: `wall_area_${index + 1}` }));
}

function snapPolygonToNearbyWallLines(
  points: Array<{ x: number; y: number }>,
  segments: VectorSegment[],
  snapDistance: number
): Array<{ x: number; y: number }> {
  const snapped = points.map((point) => ({ ...point }));

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index];
    const end = points[nextIndex];
    if (Math.abs(start.y - end.y) <= 0.001) {
      const y = findNearestAxisLineForEdge(start, end, segments, "horizontal", snapDistance);
      if (y !== null) {
        snapped[index].y = y;
        snapped[nextIndex].y = y;
      }
    } else if (Math.abs(start.x - end.x) <= 0.001) {
      const x = findNearestAxisLineForEdge(start, end, segments, "vertical", snapDistance);
      if (x !== null) {
        snapped[index].x = x;
        snapped[nextIndex].x = x;
      }
    }
  }

  return snapped.map((point) => ({ x: round(point.x), y: round(point.y) }));
}

function findNearestAxisLineForEdge(
  start: { x: number; y: number },
  end: { x: number; y: number },
  segments: VectorSegment[],
  axis: "horizontal" | "vertical",
  snapDistance: number
): number | null {
  let best: { distance: number; value: number } | null = null;

  for (const segment of segments) {
    if (axis === "vertical") {
      if (Math.abs(segment.x1 - segment.x2) > 2) continue;
      const value = (segment.x1 + segment.x2) / 2;
      const distanceValue = Math.abs(start.x - value);
      if (distanceValue > snapDistance) continue;
      if (rangeOverlap(start.y, end.y, segment.y1, segment.y2) <= 0) continue;
      if (!best || distanceValue < best.distance) best = { distance: distanceValue, value };
    } else {
      if (Math.abs(segment.y1 - segment.y2) > 2) continue;
      const value = (segment.y1 + segment.y2) / 2;
      const distanceValue = Math.abs(start.y - value);
      if (distanceValue > snapDistance) continue;
      if (rangeOverlap(start.x, end.x, segment.x1, segment.x2) <= 0) continue;
      if (!best || distanceValue < best.distance) best = { distance: distanceValue, value };
    }
  }

  return best?.value ?? null;
}

function rangeOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  const leftMin = Math.min(leftStart, leftEnd);
  const leftMax = Math.max(leftStart, leftEnd);
  const rightMin = Math.min(rightStart, rightEnd);
  const rightMax = Math.max(rightStart, rightEnd);
  return Math.max(0, Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin));
}

function buildGraph(segments: VectorSegment[], snapTolerance: number): {
  nodes: Map<string, GraphNode>;
  directedEdges: DirectedEdge[];
  adjacency: Map<string, DirectedEdge[]>;
} {
  const nodes = new Map<string, GraphNode>();
  const directedEdges: DirectedEdge[] = [];
  const adjacency = new Map<string, DirectedEdge[]>();
  const edgeKeys = new Set<string>();
  const splitEdges = splitSegmentsAtTouches(segments, snapTolerance);

  for (const edge of splitEdges) {
    const from = getOrCreateNode(nodes, edge.from, snapTolerance);
    const to = getOrCreateNode(nodes, edge.to, snapTolerance);
    if (from.id === to.id) continue;
    const normalizedEdgeKey = [from.id, to.id].sort().join("::");
    if (edgeKeys.has(normalizedEdgeKey)) continue;
    edgeKeys.add(normalizedEdgeKey);
    from.degree += 1;
    to.degree += 1;
    pushDirectedEdge(directedEdges, adjacency, from, to, edge.segmentId);
    pushDirectedEdge(directedEdges, adjacency, to, from, edge.segmentId);
  }

  for (const edges of adjacency.values()) {
    edges.sort((left, right) => left.angle - right.angle);
  }

  return { nodes, directedEdges, adjacency };
}

function segmentCollectionBounds(segments: VectorSegment[], padding: number): WallAreaPolygon["bounds"] {
  const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
  const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
  return {
    xMin: Math.floor(Math.min(...xs) - padding),
    yMin: Math.floor(Math.min(...ys) - padding),
    xMax: Math.ceil(Math.max(...xs) + padding),
    yMax: Math.ceil(Math.max(...ys) + padding)
  };
}

function clampIndex(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value));
}

function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

function gridCellCenter(bounds: WallAreaPolygon["bounds"], gridSize: number, x: number, y: number): { x: number; y: number } {
  return {
    x: bounds.xMin + (x + 0.5) * gridSize,
    y: bounds.yMin + (y + 0.5) * gridSize
  };
}

function floodFillOpenComponent(
  startX: number,
  startY: number,
  width: number,
  height: number,
  blocked: Uint8Array,
  visited: Uint8Array
): { cells: number[]; touchesBoundary: boolean } {
  const stack = [{ x: startX, y: startY }];
  const cells: number[] = [];
  let touchesBoundary = false;
  visited[cellIndex(startX, startY, width)] = 1;

  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) break;
    cells.push(cellIndex(cell.x, cell.y, width));
    if (cell.x === 0 || cell.y === 0 || cell.x === width - 1 || cell.y === height - 1) touchesBoundary = true;

    for (const next of [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 }
    ]) {
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue;
      const index = cellIndex(next.x, next.y, width);
      if (blocked[index] || visited[index]) continue;
      visited[index] = 1;
      stack.push(next);
    }
  }

  return { cells, touchesBoundary };
}

function traceGridComponentBoundary(
  cellIndexes: number[],
  width: number,
  height: number,
  bounds: WallAreaPolygon["bounds"],
  gridSize: number
): Array<{ x: number; y: number }> {
  const cellSet = new Set(cellIndexes);
  const hasCell = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && cellSet.has(cellIndex(x, y, width));
  const edges: Array<{ from: string; to: string }> = [];

  for (const index of cellIndexes) {
    const x = index % width;
    const y = Math.floor(index / width);

    if (!hasCell(x, y - 1)) edges.push({ from: vertexKey(x, y), to: vertexKey(x + 1, y) });
    if (!hasCell(x + 1, y)) edges.push({ from: vertexKey(x + 1, y), to: vertexKey(x + 1, y + 1) });
    if (!hasCell(x, y + 1)) edges.push({ from: vertexKey(x + 1, y + 1), to: vertexKey(x, y + 1) });
    if (!hasCell(x - 1, y)) edges.push({ from: vertexKey(x, y + 1), to: vertexKey(x, y) });
  }

  const loops = traceBoundaryLoops(edges);
  const largest = loops
    .map((loop) => loop.map((key) => pointFromVertexKey(key, bounds, gridSize)))
    .sort((left, right) => Math.abs(polygonSignedArea(right)) - Math.abs(polygonSignedArea(left)))[0] ?? [];
  return simplifyCollinearPolygon(largest);
}

function traceBoundaryLoops(edges: Array<{ from: string; to: string }>): string[][] {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const bucket = outgoing.get(edge.from) ?? [];
    bucket.push(edge.to);
    outgoing.set(edge.from, bucket);
  }

  const loops: string[][] = [];
  while (true) {
    const start = Array.from(outgoing.entries()).find(([, targets]) => targets.length > 0);
    if (!start) break;
    const startKey = start[0];
    const loop = [startKey];
    let current = startKey;

    for (let guard = 0; guard < edges.length + 2; guard += 1) {
      const targets = outgoing.get(current);
      const next = targets?.shift();
      if (!next) break;
      if (targets && targets.length === 0) outgoing.delete(current);
      if (next === startKey) {
        loops.push(loop);
        break;
      }
      loop.push(next);
      current = next;
    }
  }

  return loops;
}

function vertexKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function pointFromVertexKey(key: string, bounds: WallAreaPolygon["bounds"], gridSize: number): { x: number; y: number } {
  const [x, y] = key.split(":").map(Number);
  return {
    x: bounds.xMin + x * gridSize,
    y: bounds.yMin + y * gridSize
  };
}

function simplifyCollinearPolygon(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  let simplified = points;
  let changed = true;
  while (changed) {
    changed = false;
    const next: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < simplified.length; index += 1) {
      const previous = simplified[(index - 1 + simplified.length) % simplified.length];
      const current = simplified[index];
      const following = simplified[(index + 1) % simplified.length];
      const crossValue = (current.x - previous.x) * (following.y - current.y) - (current.y - previous.y) * (following.x - current.x);
      if (Math.abs(crossValue) <= 0.0001) {
        changed = true;
        continue;
      }
      next.push(current);
    }
    simplified = next;
  }
  return simplified;
}

function segmentOverlapsBounds(segment: VectorSegment, bounds: WallAreaPolygon["bounds"], padding: number): boolean {
  const xMin = Math.min(segment.x1, segment.x2);
  const xMax = Math.max(segment.x1, segment.x2);
  const yMin = Math.min(segment.y1, segment.y2);
  const yMax = Math.max(segment.y1, segment.y2);
  return xMax >= bounds.xMin - padding
    && xMin <= bounds.xMax + padding
    && yMax >= bounds.yMin - padding
    && yMin <= bounds.yMax + padding;
}

function splitSegmentsAtTouches(segments: VectorSegment[], tolerance: number): SplitEdge[] {
  const endpoints = segments.flatMap((segment) => [
    { segmentId: segment.id, x: segment.x1, y: segment.y1 },
    { segmentId: segment.id, x: segment.x2, y: segment.y2 }
  ]);
  const result: SplitEdge[] = [];

  for (const segment of segments) {
    const splitPoints = [
      { t: 0, x: segment.x1, y: segment.y1 },
      { t: 1, x: segment.x2, y: segment.y2 }
    ];

    for (const endpoint of endpoints) {
      if (endpoint.segmentId === segment.id) continue;
      const projection = projectPointToSegment(endpoint, segment);
      if (projection.t <= 0.015 || projection.t >= 0.985) continue;
      if (projection.distance <= tolerance) {
        splitPoints.push({ t: projection.t, x: projection.x, y: projection.y });
      }
    }

    for (const other of segments) {
      if (other.id === segment.id) continue;
      const intersection = segmentIntersection(segment, other);
      if (!intersection) continue;
      if (intersection.t <= 0.015 || intersection.t >= 0.985) continue;
      splitPoints.push({ t: intersection.t, x: intersection.x, y: intersection.y });
    }

    const uniquePoints = dedupeSplitPoints(splitPoints, tolerance * 0.35).sort((left, right) => left.t - right.t);
    for (let index = 0; index < uniquePoints.length - 1; index += 1) {
      const from = uniquePoints[index];
      const to = uniquePoints[index + 1];
      if (distance(from, to) <= Math.max(0.8, tolerance * 0.5)) continue;
      result.push({
        segmentId: segment.id,
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y }
      });
    }
  }

  return result;
}

function dedupeSplitPoints<T extends { t: number; x: number; y: number }>(points: T[], tolerance: number): T[] {
  const result: T[] = [];
  for (const point of points) {
    const existing = result.find((item) => Math.abs(item.t - point.t) <= 0.002 || distance(item, point) <= tolerance);
    if (existing) {
      existing.t = Math.min(existing.t, point.t);
      continue;
    }
    result.push({ ...point });
  }
  return result;
}

function getOrCreateNode(nodes: Map<string, GraphNode>, point: { x: number; y: number }, tolerance: number): GraphNode {
  for (const node of nodes.values()) {
    if (distance(node, point) <= tolerance) return node;
  }
  const node: GraphNode = {
    id: `node_${nodes.size + 1}`,
    x: point.x,
    y: point.y,
    degree: 0
  };
  nodes.set(node.id, node);
  return node;
}

function pushDirectedEdge(
  directedEdges: DirectedEdge[],
  adjacency: Map<string, DirectedEdge[]>,
  from: GraphNode,
  to: GraphNode,
  segmentId: string
): void {
  const edge: DirectedEdge = {
    key: `${from.id}->${to.id}`,
    from: from.id,
    to: to.id,
    segmentId,
    angle: Math.atan2(to.y - from.y, to.x - from.x)
  };
  directedEdges.push(edge);
  const bucket = adjacency.get(from.id) ?? [];
  bucket.push(edge);
  adjacency.set(from.id, bucket);
}

function traceFace(
  start: DirectedEdge,
  nodes: Map<string, GraphNode>,
  adjacency: Map<string, DirectedEdge[]>,
  visited: Set<string>,
  maxPolygonPoints: number
): { nodeIds: string[]; points: Array<{ x: number; y: number }>; segmentIds: string[] } | null {
  const nodeIds: string[] = [];
  const segmentIds: string[] = [];
  const pathKeys: string[] = [];
  const localVisited = new Set<string>();
  let current = start;

  for (let step = 0; step < maxPolygonPoints; step += 1) {
    if (visited.has(current.key) || localVisited.has(current.key)) return null;
    localVisited.add(current.key);
    pathKeys.push(current.key);
    nodeIds.push(current.from);
    segmentIds.push(current.segmentId);

    const outgoing = adjacency.get(current.to) ?? [];
    const reverseIndex = outgoing.findIndex((edge) => edge.to === current.from);
    if (reverseIndex < 0 || outgoing.length < 2) return null;
    current = outgoing[(reverseIndex - 1 + outgoing.length) % outgoing.length];
    if (current.key === start.key) {
      const points = nodeIds.map((nodeId) => {
        const node = nodes.get(nodeId);
        if (!node) throw new Error(`Missing wall area node ${nodeId}`);
        return { x: node.x, y: node.y };
      });
      if (points.length < 4) return null;
      for (const key of pathKeys) visited.add(key);
      return { nodeIds, points, segmentIds };
    }
  }

  return null;
}

function dedupeNestedWallAreas(polygons: WallAreaPolygon[]): WallAreaPolygon[] {
  const byKey = new Map<string, WallAreaPolygon>();
  for (const polygon of polygons) {
    const key = polygon.points
      .map((point) => `${round(point.x)}:${round(point.y)}`)
      .sort()
      .join("|");
    const existing = byKey.get(key);
    if (!existing || polygon.area < existing.area) byKey.set(key, polygon);
  }
  return Array.from(byKey.values()).sort((left, right) => left.area - right.area);
}

function isMostlyStraightWallSegment(segment: VectorSegment): boolean {
  if (segment.pathKind === "curve") return false;
  const angle = Math.abs(Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1) * 180 / Math.PI) % 180;
  const acute = angle > 90 ? 180 - angle : angle;
  return acute <= 12 || Math.abs(90 - acute) <= 12;
}

function polygonSignedArea(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function polygonPerimeter(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    sum += distance(points[index], points[(index + 1) % points.length]);
  }
  return sum;
}

function polygonBounds(points: Array<{ x: number; y: number }>): WallAreaPolygon["bounds"] {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    xMin: round(Math.min(...xs)),
    yMin: round(Math.min(...ys)),
    xMax: round(Math.max(...xs)),
    yMax: round(Math.max(...ys))
  };
}

function offsetPoint(point: { x: number; y: number }, vector: { x: number; y: number }, distanceValue: number): {
  x: number;
  y: number;
} {
  return {
    x: point.x + vector.x * distanceValue,
    y: point.y + vector.y * distanceValue
  };
}

function projectPointToSegment(point: { x: number; y: number }, segment: VectorSegment): {
  x: number;
  y: number;
  t: number;
  distance: number;
} {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return { x: segment.x1, y: segment.y1, t: 0, distance: distance(point, { x: segment.x1, y: segment.y1 }) };
  }
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  const x = segment.x1 + dx * t;
  const y = segment.y1 + dy * t;
  return { x, y, t, distance: distance(point, { x, y }) };
}

function distancePointToSegment(point: { x: number; y: number }, segment: VectorSegment): number {
  return projectPointToSegment(point, segment).distance;
}

function segmentIntersection(left: VectorSegment, right: VectorSegment): {
  x: number;
  y: number;
  t: number;
} | null {
  const leftDx = left.x2 - left.x1;
  const leftDy = left.y2 - left.y1;
  const rightDx = right.x2 - right.x1;
  const rightDy = right.y2 - right.y1;
  const denominator = leftDx * rightDy - leftDy * rightDx;
  if (Math.abs(denominator) < 0.0001) return null;
  const qpx = right.x1 - left.x1;
  const qpy = right.y1 - left.y1;
  const t = (qpx * rightDy - qpy * rightDx) / denominator;
  const u = (qpx * leftDy - qpy * leftDx) / denominator;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return {
    x: left.x1 + leftDx * t,
    y: left.y1 + leftDy * t,
    t
  };
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
