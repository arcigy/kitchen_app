import type { VectorSegment } from "./vectorStrokeGrouping";

export interface CapSegmentDetectionResult {
  capSegmentIds: Set<string>;
  wallFaceSegmentIds: Set<string>;
  reasons: Map<string, string>;
}

export function detectCapSegments(
  segments: VectorSegment[],
  options?: {
    maxCapLength?: number;
    endpointTolerance?: number;
    minFaceToCapLengthRatio?: number;
    parallelAngleTolerance?: number;
    perpendicularAngleTolerance?: number;
  }
): CapSegmentDetectionResult {
  const maxCapLength = options?.maxCapLength ?? 40;
  const endpointTolerance = options?.endpointTolerance ?? 2;
  const minFaceToCapLengthRatio = options?.minFaceToCapLengthRatio ?? 1.5;
  const parallelAngleTolerance = options?.parallelAngleTolerance ?? 10;
  const perpendicularAngleTolerance = options?.perpendicularAngleTolerance ?? 15;

  const capSegmentIds = new Set<string>();
  const reasons = new Map<string, string>();

  for (const segment of segments) {
    const capLength = segmentLength(segment);
    if (capLength > maxCapLength) continue;

    const startContacts = touchingSegmentsAtPoint(segment, startPoint(segment), segments, endpointTolerance);
    const endContacts = touchingSegmentsAtPoint(segment, endPoint(segment), segments, endpointTolerance);

    const touchingPair = startContacts.find((startContact) =>
      endContacts.some((endContact) =>
        startContact.id !== endContact.id
        && isPerpendicular(segment, startContact, perpendicularAngleTolerance)
        && isPerpendicular(segment, endContact, perpendicularAngleTolerance)
        && isParallel(startContact, endContact, parallelAngleTolerance)
        && segmentLength(startContact) > capLength * minFaceToCapLengthRatio
        && segmentLength(endContact) > capLength * minFaceToCapLengthRatio
      )
    );
    if (!touchingPair) continue;

    const endPair = endContacts.find((endContact) =>
      touchingPair.id !== endContact.id
      && isPerpendicular(segment, endContact, perpendicularAngleTolerance)
      && isParallel(touchingPair, endContact, parallelAngleTolerance)
      && segmentLength(endContact) > capLength * minFaceToCapLengthRatio
    );
    if (!endPair) continue;

    capSegmentIds.add(segment.id);
    reasons.set(
      segment.id,
      `short segment connects parallel perpendicular faces ${touchingPair.id} and ${endPair.id}`
    );
  }

  return {
    capSegmentIds,
    wallFaceSegmentIds: new Set(segments.filter((segment) => !capSegmentIds.has(segment.id)).map((segment) => segment.id)),
    reasons
  };
}

export function splitWallCandidatesIntoFacesAndCaps(
  candidateSegments: VectorSegment[]
): { faceSegments: VectorSegment[]; capSegments: VectorSegment[] } {
  const result = detectCapSegments(candidateSegments);
  return {
    faceSegments: candidateSegments.filter((segment) => result.wallFaceSegmentIds.has(segment.id)),
    capSegments: candidateSegments.filter((segment) => result.capSegmentIds.has(segment.id))
  };
}

function touchingSegmentsAtPoint(
  segment: VectorSegment,
  point: { x: number; y: number },
  segments: VectorSegment[],
  tolerance: number
): VectorSegment[] {
  return segments.filter((candidate) => {
    if (candidate.id === segment.id) return false;
    return pointTouchesSegment(point, candidate, tolerance);
  });
}

function pointTouchesSegment(point: { x: number; y: number }, segment: VectorSegment, tolerance: number): boolean {
  const startDistance = distance(point, startPoint(segment));
  const endDistance = distance(point, endPoint(segment));
  if (startDistance <= tolerance || endDistance <= tolerance) return true;

  const projection = projectPointToSegment(point, segment);
  return projection.t >= 0 && projection.t <= 1 && projection.distance <= tolerance;
}

function projectPointToSegment(point: { x: number; y: number }, segment: VectorSegment): {
  t: number;
  distance: number;
} {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { t: 0, distance: distance(point, startPoint(segment)) };
  const t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared;
  const projected = {
    x: segment.x1 + dx * t,
    y: segment.y1 + dy * t
  };
  return { t, distance: distance(point, projected) };
}

function isParallel(left: VectorSegment, right: VectorSegment, tolerance: number): boolean {
  return angleDelta(left, right) <= tolerance;
}

function isPerpendicular(left: VectorSegment, right: VectorSegment, tolerance: number): boolean {
  return Math.abs(90 - angleDelta(left, right)) <= tolerance;
}

function angleDelta(left: VectorSegment, right: VectorSegment): number {
  const raw = Math.abs(segmentAngle(left) - segmentAngle(right)) % 180;
  return raw > 90 ? 180 - raw : raw;
}

function segmentAngle(segment: VectorSegment): number {
  const raw = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1) * 180 / Math.PI;
  const normalized = raw % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function segmentLength(segment: VectorSegment): number {
  return distance(startPoint(segment), endPoint(segment));
}

function startPoint(segment: VectorSegment): { x: number; y: number } {
  return { x: segment.x1, y: segment.y1 };
}

function endPoint(segment: VectorSegment): { x: number; y: number } {
  return { x: segment.x2, y: segment.y2 };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
