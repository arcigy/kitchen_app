import type { VectorSegment } from "./vectorStrokeGrouping";

export interface WallEndHighlight {
  id: string;
  segmentId: string;
  endpoint: "start" | "end";
  x: number;
  y: number;
  directionDeg: number;
  confidence: number;
  reasons: string[];
}

export function detectOpenWallEnds(input: {
  wallSegments: VectorSegment[];
  connectionTolerance?: number;
  minWallSegmentLength?: number;
  capMaxLength?: number;
  danglingOnly?: boolean;
}): WallEndHighlight[] {
  const connectionTolerance = input.connectionTolerance ?? 5;
  const minWallSegmentLength = input.minWallSegmentLength ?? 18;
  const capMaxLength = input.capMaxLength ?? 24;
  const danglingOnly = input.danglingOnly ?? false;
  const usableWallSegments = input.wallSegments.filter((segment) => segmentLength(segment) >= minWallSegmentLength);
  const highlights: WallEndHighlight[] = [];

  for (const segment of usableWallSegments) {
    const endpoints = [
      { endpoint: "start" as const, x: segment.x1, y: segment.y1, directionDeg: segmentAngleDeg(segment) },
      { endpoint: "end" as const, x: segment.x2, y: segment.y2, directionDeg: segmentAngleDeg(reverseSegment(segment)) }
    ];

    for (const endpoint of endpoints) {
      const connections = input.wallSegments
        .filter((candidate) => candidate.id !== segment.id)
        .map((candidate) => classifyEndpointConnection(endpoint, segment, candidate, connectionTolerance, capMaxLength))
        .filter((connection): connection is EndpointConnection => Boolean(connection));
      if (danglingOnly && connections.length > 0) continue;
      const structuralConnections = connections.filter((connection) => connection.kind === "structural");
      if (structuralConnections.length > 0) continue;

      const capConnections = connections.filter((connection) => connection.kind === "cap");

      highlights.push({
        id: `wall_end_${highlights.length + 1}`,
        segmentId: segment.id,
        endpoint: endpoint.endpoint,
        x: round(endpoint.x),
        y: round(endpoint.y),
        directionDeg: round(normalizeAngle360(endpoint.directionDeg)),
        confidence: 0.62,
        reasons: [
          danglingOnly
            ? `wall segment ${segment.id} has a raw dangling endpoint with no touching wall line`
            : capConnections.length > 0
              ? `wall segment ${segment.id} ends at ${capConnections.length} short cap/reveal segment(s)`
              : `wall segment ${segment.id} has no structural continuation within ${connectionTolerance} drawing units`,
          `segment length ${round(segmentLength(segment))}`
        ]
      });
    }
  }

  return mergeNearbyHighlights(highlights, connectionTolerance * 0.65);
}

function mergeNearbyHighlights(highlights: WallEndHighlight[], mergeRadius: number): WallEndHighlight[] {
  const merged: WallEndHighlight[] = [];
  for (const highlight of highlights) {
    const existing = merged.find((item) => distance(item, highlight) <= mergeRadius);
    if (!existing) {
      merged.push(highlight);
      continue;
    }

    existing.reasons = Array.from(new Set([...existing.reasons, ...highlight.reasons]));
    existing.confidence = Math.max(existing.confidence, highlight.confidence);
  }

  return merged.map((highlight, index) => ({ ...highlight, id: `wall_end_${index + 1}` }));
}

interface EndpointConnection {
  kind: "structural" | "cap";
  segmentId: string;
}

function classifyEndpointConnection(
  endpoint: { x: number; y: number; directionDeg: number },
  segment: VectorSegment,
  candidate: VectorSegment,
  connectionTolerance: number,
  capMaxLength: number
): EndpointConnection | null {
  const candidateLength = segmentLength(candidate);
  const endpointTouch = endpointTouchesSegmentEndpoint(endpoint, candidate, connectionTolerance);
  const endpointProjection = projectPointToSegment(endpoint, candidate);
  const sameLineTouch = endpointProjection.distance <= Math.min(1.5, connectionTolerance * 0.35);
  const looseTouch = endpointProjection.distance <= connectionTolerance;
  if (!endpointTouch && !looseTouch) return null;

  const angleDelta = acuteAngleDelta(segmentAngleDeg(segment), segmentAngleDeg(candidate));
  const isCollinearContinuation = angleDelta <= 15 && sameLineTouch;
  if (isCollinearContinuation) {
    return { kind: "structural", segmentId: candidate.id };
  }

  const isShortCrossCap = (endpointTouch || sameLineTouch || endpointProjection.t > 0.02 && endpointProjection.t < 0.98)
    && candidateLength <= capMaxLength
    && angleDelta >= 45
    && angleDelta <= 135;
  if (isShortCrossCap) {
    return { kind: "cap", segmentId: candidate.id };
  }

  const isLongCornerOrJunction = candidateLength > capMaxLength && (endpointTouch || endpointProjection.t > 0.04 && endpointProjection.t < 0.96) && angleDelta > 25;
  if (isLongCornerOrJunction) {
    return { kind: "structural", segmentId: candidate.id };
  }

  return null;
}

function reverseSegment(segment: VectorSegment): VectorSegment {
  return { ...segment, x1: segment.x2, y1: segment.y2, x2: segment.x1, y2: segment.y1 };
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function segmentAngleDeg(segment: VectorSegment): number {
  return Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1) * 180 / Math.PI;
}

function distancePointToSegment(point: { x: number; y: number }, segment: VectorSegment): number {
  return projectPointToSegment(point, segment).distance;
}

function projectPointToSegment(point: { x: number; y: number }, segment: VectorSegment): { t: number; distance: number } {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return { t: 0, distance: distance(point, { x: segment.x1, y: segment.y1 }) };
  const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared));
  const projected = { x: segment.x1 + t * dx, y: segment.y1 + t * dy };
  return { t, distance: distance(point, projected) };
}

function endpointTouchesSegmentEndpoint(point: { x: number; y: number }, segment: VectorSegment, tolerance: number): boolean {
  return distance(point, { x: segment.x1, y: segment.y1 }) <= tolerance
    || distance(point, { x: segment.x2, y: segment.y2 }) <= tolerance;
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizeAngle360(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
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

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
