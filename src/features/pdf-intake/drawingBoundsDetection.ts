import type { VectorSegment } from "./vectorStrokeGrouping";

export interface DrawingBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface DrawingWallComponent {
  id: string;
  segmentIds: string[];
  totalLength: number;
  bounds: DrawingBounds;
  isRetained: boolean;
  reasons: string[];
}

export interface DrawingContentBoundsResult {
  bounds: DrawingBounds | null;
  tightBounds: DrawingBounds | null;
  workingBounds: DrawingBounds | null;
  safetyMargin: number;
  retainedSegmentIds: string[];
  rejectedSegmentIds: string[];
  components: DrawingWallComponent[];
  pageEdgeMargin: number;
  warnings: string[];
}

export function detectDrawingContentBounds(input: {
  wallSegments: VectorSegment[];
  pageWidth: number;
  pageHeight: number;
  connectionTolerance?: number;
  minRetainedLengthRatio?: number;
}): DrawingContentBoundsResult {
  const connectionTolerance = input.connectionTolerance ?? 6;
  const minRetainedLengthRatio = input.minRetainedLengthRatio ?? 0.08;
  const pageEdgeMargin = Math.max(8, Math.min(input.pageWidth, input.pageHeight) * 0.02);
  const warnings: string[] = [];
  if (input.wallSegments.length === 0) {
    return {
      bounds: null,
      tightBounds: null,
      workingBounds: null,
      safetyMargin: 0,
      retainedSegmentIds: [],
      rejectedSegmentIds: [],
      components: [],
      pageEdgeMargin,
      warnings: ["No wall candidates available for drawing bounds detection."]
    };
  }

  const components = buildWallComponents(input.wallSegments, connectionTolerance);
  const primaryComponent = selectPrimaryDrawingComponent(components, input.pageWidth, input.pageHeight, pageEdgeMargin);
  const expandedPrimaryBounds = primaryComponent
    ? expandBounds(primaryComponent.bounds, Math.max(24, pageEdgeMargin * 2), input.pageWidth, input.pageHeight)
    : null;
  const retainedIds = new Set<string>();
  const rejectedIds = new Set<string>();
  const classifiedComponents = components
    .sort((left, right) => right.totalLength - left.totalLength)
    .map((component, index) => {
      const isPrimary = component === primaryComponent;
      const nearPageEdge = isNearPageEdge(component.bounds, input.pageWidth, input.pageHeight, pageEdgeMargin);
      const pageFrameLike = isPageFrameLike(component.bounds, input.pageWidth, input.pageHeight, pageEdgeMargin);
      const insidePrimaryBounds = expandedPrimaryBounds ? boundsIntersect(component.bounds, expandedPrimaryBounds) : false;
      const sizeableInsidePlan = primaryComponent
        ? component.totalLength >= Math.max(80, primaryComponent.totalLength * minRetainedLengthRatio) && insidePrimaryBounds && !pageFrameLike
        : false;
      const sizeableSeparatePlanPart = primaryComponent
        ? component.totalLength >= Math.max(180, primaryComponent.totalLength * 0.06) && !nearPageEdge && !pageFrameLike
        : false;
      const isRetained = Boolean(isPrimary || sizeableInsidePlan || sizeableSeparatePlanPart);
      const reasons = [
        isPrimary ? "selected as main drawing component" : `component length ${round(component.totalLength)}`,
        nearPageEdge ? "near page edge/frame" : "inside drawing area",
        pageFrameLike ? "looks like page frame/titleblock boundary" : "not page-frame-like",
        isRetained ? "retained for wall processing" : "ignored for strict wall end detection"
      ];

      for (const segmentId of component.segmentIds) {
        if (isRetained) retainedIds.add(segmentId);
        else rejectedIds.add(segmentId);
      }

      return {
        ...component,
        id: `wall_component_${index + 1}`,
        isRetained,
        reasons
      };
    });

  if (retainedIds.size === 0) {
    warnings.push("No retained wall components; falling back to all wall candidates.");
    for (const segment of input.wallSegments) retainedIds.add(segment.id);
  }

  const retainedSegments = input.wallSegments.filter((segment) => retainedIds.has(segment.id));
  const tightBounds = retainedSegments.length > 0 ? segmentBounds(retainedSegments) : null;
  const safetyMargin = tightBounds ? workingBoundarySafetyMargin(tightBounds) : 0;
  const workingBounds = tightBounds ? expandBounds(tightBounds, safetyMargin, input.pageWidth, input.pageHeight) : null;
  return {
    bounds: workingBounds,
    tightBounds,
    workingBounds,
    safetyMargin: round(safetyMargin),
    retainedSegmentIds: Array.from(retainedIds),
    rejectedSegmentIds: Array.from(rejectedIds),
    components: classifiedComponents,
    pageEdgeMargin: round(pageEdgeMargin),
    warnings
  };
}

function workingBoundarySafetyMargin(bounds: DrawingBounds): number {
  const width = Math.max(0, bounds.xMax - bounds.xMin);
  const height = Math.max(0, bounds.yMax - bounds.yMin);
  return Math.max(30, Math.min(width, height) * 0.02);
}

function selectPrimaryDrawingComponent(
  components: DrawingWallComponent[],
  pageWidth: number,
  pageHeight: number,
  pageEdgeMargin: number
): DrawingWallComponent | null {
  let best: { component: DrawingWallComponent; score: number } | null = null;
  for (const component of components) {
    const score = drawingComponentScore(component, pageWidth, pageHeight, pageEdgeMargin);
    if (!best || score > best.score) best = { component, score };
  }
  return best?.component ?? null;
}

function drawingComponentScore(component: DrawingWallComponent, pageWidth: number, pageHeight: number, pageEdgeMargin: number): number {
  const nearPageEdge = isNearPageEdge(component.bounds, pageWidth, pageHeight, pageEdgeMargin);
  const frameLike = isPageFrameLike(component.bounds, pageWidth, pageHeight, pageEdgeMargin);
  const spanRatio = Math.max(
    (component.bounds.xMax - component.bounds.xMin) / Math.max(1, pageWidth),
    (component.bounds.yMax - component.bounds.yMin) / Math.max(1, pageHeight)
  );
  const compactnessBonus = spanRatio >= 0.18 && spanRatio <= 0.78 ? 450 : 0;
  const edgePenalty = nearPageEdge ? 500 : 0;
  const framePenalty = frameLike ? 3_000 : 0;
  return component.totalLength + compactnessBonus - edgePenalty - framePenalty;
}

function isPageFrameLike(bounds: DrawingBounds, pageWidth: number, pageHeight: number, margin: number): boolean {
  if (!isNearPageEdge(bounds, pageWidth, pageHeight, margin)) return false;
  const widthRatio = (bounds.xMax - bounds.xMin) / Math.max(1, pageWidth);
  const heightRatio = (bounds.yMax - bounds.yMin) / Math.max(1, pageHeight);
  return widthRatio >= 0.82 || heightRatio >= 0.82;
}

function expandBounds(bounds: DrawingBounds, margin: number, pageWidth: number, pageHeight: number): DrawingBounds {
  return {
    xMin: round(Math.max(0, bounds.xMin - margin)),
    yMin: round(Math.max(0, bounds.yMin - margin)),
    xMax: round(Math.min(pageWidth, bounds.xMax + margin)),
    yMax: round(Math.min(pageHeight, bounds.yMax + margin))
  };
}

function boundsIntersect(left: DrawingBounds, right: DrawingBounds): boolean {
  return left.xMin <= right.xMax
    && left.xMax >= right.xMin
    && left.yMin <= right.yMax
    && left.yMax >= right.yMin;
}

function buildWallComponents(segments: VectorSegment[], connectionTolerance: number): DrawingWallComponent[] {
  const parents = segments.map((_, index) => index);
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      if (segmentsTouch(segments[left], segments[right], connectionTolerance)) {
        union(parents, left, right);
      }
    }
  }

  const buckets = new Map<number, VectorSegment[]>();
  for (let index = 0; index < segments.length; index += 1) {
    const root = find(parents, index);
    const bucket = buckets.get(root) ?? [];
    bucket.push(segments[index]);
    buckets.set(root, bucket);
  }

  return Array.from(buckets.values()).map((componentSegments, index) => ({
    id: `wall_component_${index + 1}`,
    segmentIds: componentSegments.map((segment) => segment.id),
    totalLength: round(componentSegments.reduce((sum, segment) => sum + segmentLength(segment), 0)),
    bounds: segmentBounds(componentSegments),
    isRetained: false,
    reasons: []
  }));
}

function segmentsTouch(left: VectorSegment, right: VectorSegment, tolerance: number): boolean {
  const leftEndpoints = [{ x: left.x1, y: left.y1 }, { x: left.x2, y: left.y2 }];
  const rightEndpoints = [{ x: right.x1, y: right.y1 }, { x: right.x2, y: right.y2 }];
  if (leftEndpoints.some((leftPoint) => rightEndpoints.some((rightPoint) => distance(leftPoint, rightPoint) <= tolerance))) return true;
  const looseTolerance = Math.min(2, tolerance * 0.4);
  return leftEndpoints.some((point) => pointToSegmentDistance(point, right) <= looseTolerance)
    || rightEndpoints.some((point) => pointToSegmentDistance(point, left) <= looseTolerance);
}

function isNearPageEdge(bounds: DrawingBounds, pageWidth: number, pageHeight: number, margin: number): boolean {
  return bounds.xMin <= margin
    || pageWidth - bounds.xMax <= margin
    || bounds.yMin <= margin
    || pageHeight - bounds.yMax <= margin;
}

function segmentBounds(segments: VectorSegment[]): DrawingBounds {
  const xs = segments.flatMap((segment) => [segment.x1, segment.x2]);
  const ys = segments.flatMap((segment) => [segment.y1, segment.y2]);
  return {
    xMin: round(Math.min(...xs)),
    yMin: round(Math.min(...ys)),
    xMax: round(Math.max(...xs)),
    yMax: round(Math.max(...ys))
  };
}

function union(parents: number[], left: number, right: number): void {
  const leftRoot = find(parents, left);
  const rightRoot = find(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function find(parents: number[], index: number): number {
  let root = index;
  while (parents[root] !== root) root = parents[root];
  while (parents[index] !== index) {
    const parent = parents[index];
    parents[index] = root;
    index = parent;
  }
  return root;
}

function pointToSegmentDistance(point: { x: number; y: number }, segment: VectorSegment): number {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return distance(point, { x: segment.x1, y: segment.y1 });
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  return distance(point, { x: segment.x1 + dx * t, y: segment.y1 + dy * t });
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
