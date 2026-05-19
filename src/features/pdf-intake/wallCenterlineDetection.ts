import type { VectorSegment } from "./vectorStrokeGrouping";
import type { WallHatchRectangle } from "./wallHatchRectangulation";

export interface WallCenterline {
  id: string;
  sourceSegmentIds: string[];
  sourceKind: "paired_faces" | "wall_rectangle";
  sourceWallRectangleIds?: string[];
  sourceWallAreaIds?: string[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wallThicknessEstimate: number;
  confidence: number;
  reasons: string[];
}

interface CenterlineCandidate {
  sourceSegmentIds: string[];
  sourceKind: WallCenterline["sourceKind"];
  angleDeg: number;
  axis: { x: number; y: number };
  normal: { x: number; y: number };
  centerOffset: number;
  start: number;
  end: number;
  wallThicknessEstimate: number;
  confidence: number;
  reasons: string[];
}

export function detectWallCenterlines(input: {
  wallSegments?: VectorSegment[];
  wallRectangles?: WallHatchRectangle[];
  angleToleranceDeg?: number;
  minSegmentLength?: number;
  minOverlapLength?: number;
  minWallThickness?: number;
  maxWallThickness?: number;
  minCenterlineLength?: number;
  mergeGapTolerance?: number;
  mergeOffsetTolerance?: number;
  cornerSnapTolerance?: number;
}): WallCenterline[] {
  if (input.wallRectangles && input.wallRectangles.length > 0) {
    return detectWallCenterlinesFromRectangles(input.wallRectangles, input.minCenterlineLength ?? input.minSegmentLength ?? 8);
  }

  const angleToleranceDeg = input.angleToleranceDeg ?? 8;
  const minSegmentLength = input.minSegmentLength ?? 18;
  const minOverlapLength = input.minOverlapLength ?? 18;
  const minWallThickness = input.minWallThickness ?? 4;
  const maxWallThickness = input.maxWallThickness ?? 34;
  const minCenterlineLength = input.minCenterlineLength ?? minSegmentLength;
  const mergeGapTolerance = input.mergeGapTolerance ?? 8;
  const mergeOffsetTolerance = input.mergeOffsetTolerance ?? 2.5;
  const cornerSnapTolerance = input.cornerSnapTolerance ?? 22;
  const wallSegments = (input.wallSegments ?? []).filter((segment) => segmentLength(segment) >= minSegmentLength);
  const candidates: CenterlineCandidate[] = [];

  for (let leftIndex = 0; leftIndex < wallSegments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < wallSegments.length; rightIndex += 1) {
      const candidate = createCenterlineCandidate(wallSegments[leftIndex], wallSegments[rightIndex], {
        angleToleranceDeg,
        minOverlapLength,
        minWallThickness,
        maxWallThickness
      });
      if (candidate) candidates.push(candidate);
    }
  }

  const pairedCandidates = connectCenterlineCorners(
    mergeCenterlineCandidates(candidates, mergeGapTolerance, mergeOffsetTolerance, minCenterlineLength),
    cornerSnapTolerance
  );

  return pairedCandidates
    .map((candidate, index) => {
      const startPoint = pointFromAxis(candidate.axis, candidate.normal, candidate.start, candidate.centerOffset);
      const endPoint = pointFromAxis(candidate.axis, candidate.normal, candidate.end, candidate.centerOffset);
      return {
        id: `wall_centerline_${index + 1}`,
        sourceSegmentIds: Array.from(new Set(candidate.sourceSegmentIds)),
        sourceKind: candidate.sourceKind,
        x1: round(startPoint.x),
        y1: round(startPoint.y),
        x2: round(endPoint.x),
        y2: round(endPoint.y),
        wallThicknessEstimate: round(candidate.wallThicknessEstimate),
        confidence: round(candidate.confidence),
        reasons: candidate.reasons
      };
    });
}

export function detectWallCenterlinesFromRectangles(
  rectangles: WallHatchRectangle[],
  minCenterlineLength = 8
): WallCenterline[] {
  const centerlines = rectangles
    .flatMap((rectangle) => createRectangleCenterlineCandidates(rectangle, minCenterlineLength))
    .map((centerline, index) => ({
      ...centerline,
      id: `wall_centerline_${index + 1}`
    }));

  return connectRectangleCenterlineCorners(centerlines, rectangles);
}

function createRectangleCenterlineCandidates(rectangle: WallHatchRectangle, minCenterlineLength: number): WallCenterline[] {
  const width = rectangle.bounds.xMax - rectangle.bounds.xMin;
  const height = rectangle.bounds.yMax - rectangle.bounds.yMin;
  const centerX = (rectangle.bounds.xMin + rectangle.bounds.xMax) / 2;
  const centerY = (rectangle.bounds.yMin + rectangle.bounds.yMax) / 2;
  const common = {
    id: "",
    sourceSegmentIds: [],
    sourceKind: "wall_rectangle" as const,
    sourceWallRectangleIds: [rectangle.id],
    sourceWallAreaIds: [rectangle.sourceWallAreaId],
    wallThicknessEstimate: rectangle.thicknessDrawingUnits ?? Math.min(width, height),
    confidence: rectangle.thicknessAxis === "both" ? 0.74 : 0.93,
    reasons: [
      `centerline from normalized wall rectangle ${rectangle.id}`,
      `thickness axis ${rectangle.thicknessAxis}`,
      `thickness ${round(rectangle.thicknessDrawingUnits ?? Math.min(width, height))}`
    ]
  };

  if (rectangle.thicknessAxis === "x") {
    if (height < minCenterlineLength) return [];
    return [{
      ...common,
      x1: round(centerX),
      y1: round(rectangle.bounds.yMin),
      x2: round(centerX),
      y2: round(rectangle.bounds.yMax)
    }];
  }

  if (rectangle.thicknessAxis === "y") {
    if (width < minCenterlineLength) return [];
    return [{
      ...common,
      x1: round(rectangle.bounds.xMin),
      y1: round(centerY),
      x2: round(rectangle.bounds.xMax),
      y2: round(centerY)
    }];
  }

  const axis = width >= height ? "y" : "x";
  if (axis === "y") {
    if (width < minCenterlineLength) return [];
    return [{
      ...common,
      confidence: 0.68,
      reasons: [...common.reasons, "ambiguous compact wall block; centerline follows longer axis"],
      x1: round(rectangle.bounds.xMin),
      y1: round(centerY),
      x2: round(rectangle.bounds.xMax),
      y2: round(centerY)
    }];
  }

  if (height < minCenterlineLength) return [];
  return [{
    ...common,
    confidence: 0.68,
    reasons: [...common.reasons, "ambiguous compact wall block; centerline follows longer axis"],
    x1: round(centerX),
    y1: round(rectangle.bounds.yMin),
    x2: round(centerX),
    y2: round(rectangle.bounds.yMax)
  }];
}

function connectRectangleCenterlineCorners(centerlines: WallCenterline[], rectangles: WallHatchRectangle[]): WallCenterline[] {
  const connected = centerlines.map((centerline) => ({ ...centerline, reasons: [...centerline.reasons] }));
  const rectangleById = new Map(rectangles.map((rectangle) => [rectangle.id, rectangle]));
  const tolerance = 0.75;

  for (let leftIndex = 0; leftIndex < connected.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < connected.length; rightIndex += 1) {
      const left = connected[leftIndex];
      const right = connected[rightIndex];
      const leftRectangle = rectangleById.get(left.sourceWallRectangleIds?.[0] ?? "");
      const rightRectangle = rectangleById.get(right.sourceWallRectangleIds?.[0] ?? "");
      if (!leftRectangle || !rightRectangle) continue;
      if (isCompactRectangleForCenterlineSnap(leftRectangle) || isCompactRectangleForCenterlineSnap(rightRectangle)) continue;
      const leftAxis = centerlineAxis(left);
      const rightAxis = centerlineAxis(right);
      const angleDelta = acuteAngleDelta(leftAxis.angleDeg, rightAxis.angleDeg);
      if (angleDelta < 35 || angleDelta > 145) continue;

      const intersection = lineIntersection(
        { x: left.x1, y: left.y1 },
        { x: left.x2, y: left.y2 },
        { x: right.x1, y: right.y1 },
        { x: right.x2, y: right.y2 }
      );
      if (!intersection) continue;

      const leftEndpoint = nearestCenterlineEndpoint(left, intersection);
      const rightEndpoint = nearestCenterlineEndpoint(right, intersection);
      const snapTolerance = Math.max(tolerance, left.wallThicknessEstimate * 0.6, right.wallThicknessEstimate * 0.6);
      if (leftEndpoint.distance > snapTolerance || rightEndpoint.distance > snapTolerance) continue;
      if (
        !isPointInsideBounds(intersection, leftRectangle.bounds, Math.max(tolerance, left.wallThicknessEstimate * 0.6))
        || !isPointInsideBounds(intersection, rightRectangle.bounds, Math.max(tolerance, right.wallThicknessEstimate * 0.6))
      ) continue;

      setCenterlineEndpoint(left, leftEndpoint.endpoint, intersection);
      setCenterlineEndpoint(right, rightEndpoint.endpoint, intersection);
      left.reasons = Array.from(new Set([...left.reasons, "snapped rectangle centerline to wall corner"]));
      right.reasons = Array.from(new Set([...right.reasons, "snapped rectangle centerline to wall corner"]));
      left.confidence = Math.min(0.96, left.confidence + 0.02);
      right.confidence = Math.min(0.96, right.confidence + 0.02);
    }
  }

  return connected.map((centerline) => ({
    ...centerline,
    x1: round(centerline.x1),
    y1: round(centerline.y1),
    x2: round(centerline.x2),
    y2: round(centerline.y2),
    wallThicknessEstimate: round(centerline.wallThicknessEstimate),
    confidence: round(centerline.confidence)
  }));
}

function isCompactRectangleForCenterlineSnap(rectangle: WallHatchRectangle): boolean {
  const width = rectangle.bounds.xMax - rectangle.bounds.xMin;
  const height = rectangle.bounds.yMax - rectangle.bounds.yMin;
  const shorterSide = Math.max(0.001, Math.min(width, height));
  const longerSide = Math.max(width, height);
  const aspectRatio = longerSide / shorterSide;
  return rectangle.thicknessAxis === "both"
    || aspectRatio < 3
    || (rectangle.lengthDrawingUnits ?? longerSide) < 45;
}

function isPointInsideBounds(point: { x: number; y: number }, bounds: WallHatchRectangle["bounds"], tolerance: number): boolean {
  return point.x >= bounds.xMin - tolerance
    && point.x <= bounds.xMax + tolerance
    && point.y >= bounds.yMin - tolerance
    && point.y <= bounds.yMax + tolerance;
}

function centerlineAxis(centerline: WallCenterline): { angleDeg: number } {
  return { angleDeg: normalizeAngle180(Math.atan2(centerline.y2 - centerline.y1, centerline.x2 - centerline.x1) * 180 / Math.PI) };
}

function nearestCenterlineEndpoint(centerline: WallCenterline, point: { x: number; y: number }): {
  endpoint: "start" | "end";
  distance: number;
} {
  const startDistance = distance({ x: centerline.x1, y: centerline.y1 }, point);
  const endDistance = distance({ x: centerline.x2, y: centerline.y2 }, point);
  return startDistance <= endDistance
    ? { endpoint: "start", distance: startDistance }
    : { endpoint: "end", distance: endDistance };
}

function setCenterlineEndpoint(centerline: WallCenterline, endpoint: "start" | "end", point: { x: number; y: number }): void {
  if (endpoint === "start") {
    centerline.x1 = point.x;
    centerline.y1 = point.y;
    return;
  }
  centerline.x2 = point.x;
  centerline.y2 = point.y;
}

function createCenterlineCandidate(
  left: VectorSegment,
  right: VectorSegment,
  options: {
    angleToleranceDeg: number;
    minOverlapLength: number;
    minWallThickness: number;
    maxWallThickness: number;
  }
): CenterlineCandidate | null {
  const leftAxis = segmentAxis(left);
  const rightAxis = segmentAxis(right);
  if (acuteAngleDelta(leftAxis.angleDeg, rightAxis.angleDeg) > options.angleToleranceDeg) return null;

  const axis = averageAxis(leftAxis, rightAxis);
  const normal = { x: -axis.y, y: axis.x };
  const leftProjection = segmentProjection(left, axis, normal);
  const rightProjection = segmentProjection(right, axis, normal);
  const wallThicknessEstimate = Math.abs(leftProjection.offset - rightProjection.offset);
  if (wallThicknessEstimate < options.minWallThickness || wallThicknessEstimate > options.maxWallThickness) return null;

  const start = Math.max(leftProjection.min, rightProjection.min);
  const end = Math.min(leftProjection.max, rightProjection.max);
  const overlapLength = end - start;
  if (overlapLength < options.minOverlapLength) return null;

  const shorterLength = Math.min(leftProjection.max - leftProjection.min, rightProjection.max - rightProjection.min);
  const overlapRatio = overlapLength / Math.max(1, shorterLength);
  if (overlapRatio < 0.28) return null;

  return {
    sourceSegmentIds: [left.id, right.id],
    sourceKind: "paired_faces",
    angleDeg: axis.angleDeg,
    axis,
    normal,
    centerOffset: (leftProjection.offset + rightProjection.offset) / 2,
    start,
    end,
    wallThicknessEstimate,
    confidence: clamp(0.58 + Math.min(0.24, overlapRatio * 0.18), 0, 0.88),
    reasons: [
      `parallel wall faces ${left.id} and ${right.id}`,
      `estimated wall thickness ${round(wallThicknessEstimate)}`,
      `overlap ${round(overlapLength)}`
    ]
  };
}

function mergeCenterlineCandidates(
  candidates: CenterlineCandidate[],
  mergeGapTolerance: number,
  mergeOffsetTolerance: number,
  minCenterlineLength: number
): CenterlineCandidate[] {
  const sorted = candidates.sort((left, right) =>
    left.angleDeg - right.angleDeg || left.centerOffset - right.centerOffset || left.start - right.start
  );
  const merged: CenterlineCandidate[] = [];

  for (const candidate of sorted) {
    const existing = merged.find((item) =>
      acuteAngleDelta(item.angleDeg, candidate.angleDeg) <= 4
      && Math.abs(item.centerOffset - candidate.centerOffset) <= mergeOffsetTolerance
      && candidate.start <= item.end + mergeGapTolerance
      && candidate.end >= item.start - mergeGapTolerance
    );
    if (!existing) {
      merged.push({ ...candidate });
      continue;
    }

    existing.start = Math.min(existing.start, candidate.start);
    existing.end = Math.max(existing.end, candidate.end);
    existing.sourceSegmentIds = Array.from(new Set([...existing.sourceSegmentIds, ...candidate.sourceSegmentIds]));
    existing.wallThicknessEstimate = (existing.wallThicknessEstimate + candidate.wallThicknessEstimate) / 2;
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    existing.reasons = Array.from(new Set([...existing.reasons, ...candidate.reasons])).slice(0, 8);
  }

  return merged.filter((candidate) => candidate.end - candidate.start >= minCenterlineLength);
}

function connectCenterlineCorners(candidates: CenterlineCandidate[], cornerSnapTolerance: number): CenterlineCandidate[] {
  const connected = candidates.map((candidate) => ({
    ...candidate,
    sourceSegmentIds: [...candidate.sourceSegmentIds],
    reasons: [...candidate.reasons]
  }));

  for (let leftIndex = 0; leftIndex < connected.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < connected.length; rightIndex += 1) {
      const left = connected[leftIndex];
      const right = connected[rightIndex];
      const angleDelta = acuteAngleDelta(left.angleDeg, right.angleDeg);
      if (angleDelta < 35 || angleDelta > 145) continue;

      const intersection = lineIntersection(candidateStartPoint(left), candidateEndPoint(left), candidateStartPoint(right), candidateEndPoint(right));
      if (!intersection) continue;

      const leftEndpoint = nearestCandidateEndpoint(left, intersection);
      const rightEndpoint = nearestCandidateEndpoint(right, intersection);
      const tolerance = Math.max(cornerSnapTolerance, left.wallThicknessEstimate * 1.25, right.wallThicknessEstimate * 1.25);
      if (leftEndpoint.distance > tolerance || rightEndpoint.distance > tolerance) continue;

      setCandidateEndpoint(left, leftEndpoint.endpoint, dot(intersection, left.axis));
      setCandidateEndpoint(right, rightEndpoint.endpoint, dot(intersection, right.axis));
      left.reasons = Array.from(new Set([...left.reasons, `snapped ${leftEndpoint.endpoint} to centerline corner`])).slice(0, 8);
      right.reasons = Array.from(new Set([...right.reasons, `snapped ${rightEndpoint.endpoint} to centerline corner`])).slice(0, 8);
      left.confidence = Math.min(0.92, left.confidence + 0.04);
      right.confidence = Math.min(0.92, right.confidence + 0.04);
    }
  }

  return connected;
}

function candidateStartPoint(candidate: CenterlineCandidate): { x: number; y: number } {
  return pointFromAxis(candidate.axis, candidate.normal, candidate.start, candidate.centerOffset);
}

function candidateEndPoint(candidate: CenterlineCandidate): { x: number; y: number } {
  return pointFromAxis(candidate.axis, candidate.normal, candidate.end, candidate.centerOffset);
}

function nearestCandidateEndpoint(candidate: CenterlineCandidate, point: { x: number; y: number }): {
  endpoint: "start" | "end";
  distance: number;
} {
  const startDistance = distance(candidateStartPoint(candidate), point);
  const endDistance = distance(candidateEndPoint(candidate), point);
  return startDistance <= endDistance
    ? { endpoint: "start", distance: startDistance }
    : { endpoint: "end", distance: endDistance };
}

function setCandidateEndpoint(candidate: CenterlineCandidate, endpoint: "start" | "end", projectedPosition: number): void {
  if (endpoint === "start") {
    candidate.start = Math.min(projectedPosition, candidate.end - 1);
    return;
  }

  candidate.end = Math.max(projectedPosition, candidate.start + 1);
}

function lineIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number }
): { x: number; y: number } | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denominator = cross({ x: dax, y: day }, { x: dbx, y: dby });
  if (Math.abs(denominator) < 0.0001) return null;
  const delta = { x: b1.x - a1.x, y: b1.y - a1.y };
  const t = cross(delta, { x: dbx, y: dby }) / denominator;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function segmentAxis(segment: VectorSegment): { x: number; y: number; angleDeg: number } {
  const length = segmentLength(segment);
  const rawX = (segment.x2 - segment.x1) / length;
  const rawY = (segment.y2 - segment.y1) / length;
  const angleDeg = normalizeAngle180(Math.atan2(rawY, rawX) * 180 / Math.PI);
  const radians = angleDeg * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians), angleDeg };
}

function averageAxis(left: { angleDeg: number }, right: { angleDeg: number }): { x: number; y: number; angleDeg: number } {
  const leftAngle = left.angleDeg * Math.PI / 180;
  let rightAngle = right.angleDeg * Math.PI / 180;
  if (Math.abs(left.angleDeg - right.angleDeg) > 90) rightAngle += Math.PI;
  const x = Math.cos(leftAngle) + Math.cos(rightAngle);
  const y = Math.sin(leftAngle) + Math.sin(rightAngle);
  const angleDeg = normalizeAngle180(Math.atan2(y, x) * 180 / Math.PI);
  const radians = angleDeg * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians), angleDeg };
}

function segmentProjection(segment: VectorSegment, axis: { x: number; y: number }, normal: { x: number; y: number }): {
  min: number;
  max: number;
  offset: number;
} {
  const p1 = { x: segment.x1, y: segment.y1 };
  const p2 = { x: segment.x2, y: segment.y2 };
  const t1 = dot(p1, axis);
  const t2 = dot(p2, axis);
  return {
    min: Math.min(t1, t2),
    max: Math.max(t1, t2),
    offset: (dot(p1, normal) + dot(p2, normal)) / 2
  };
}

function pointFromAxis(axis: { x: number; y: number }, normal: { x: number; y: number }, t: number, offset: number): { x: number; y: number } {
  return {
    x: axis.x * t + normal.x * offset,
    y: axis.y * t + normal.y * offset
  };
}

function dot(point: { x: number; y: number }, vector: { x: number; y: number }): number {
  return point.x * vector.x + point.y * vector.y;
}

function cross(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.y - left.y * right.x;
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function acuteAngleDelta(left: number, right: number): number {
  const normalizedLeft = normalizeAngle180(left);
  const normalizedRight = normalizeAngle180(right);
  const delta = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(delta, 180 - delta);
}

function normalizeAngle180(angle: number): number {
  const normalized = angle % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
