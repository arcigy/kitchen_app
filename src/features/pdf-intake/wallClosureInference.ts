import type { VectorSegment } from "./vectorStrokeGrouping";
import type { WallEndHighlight } from "./wallEndDetection";

export interface WallClosureSegment extends VectorSegment {
  sourceOpenEndIds: [string, string];
  confidence: number;
  reasons: string[];
}

export function inferWallClosureSegments(input: {
  openEnds: WallEndHighlight[];
  existingSegments?: VectorSegment[];
  maxClosureLength?: number;
  parallelAngleToleranceDeg?: number;
  perpendicularAngleToleranceDeg?: number;
}): WallClosureSegment[] {
  const maxClosureLength = input.maxClosureLength ?? 60;
  const parallelAngleToleranceDeg = input.parallelAngleToleranceDeg ?? 15;
  const perpendicularAngleToleranceDeg = input.perpendicularAngleToleranceDeg ?? 15;
  const usedEndIds = new Set<string>();
  const closures: WallClosureSegment[] = [];

  for (let leftIndex = 0; leftIndex < input.openEnds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < input.openEnds.length; rightIndex += 1) {
      const left = input.openEnds[leftIndex];
      const right = input.openEnds[rightIndex];
      if (usedEndIds.has(left.id) || usedEndIds.has(right.id)) continue;

      const length = distance(left, right);
      if (length <= 0.5 || length > maxClosureLength) continue;
      if (lineAlreadyExists(left, right, input.existingSegments ?? [])) continue;

      const directionDelta = acuteAngleDelta(left.directionDeg, right.directionDeg);
      if (directionDelta > parallelAngleToleranceDeg) continue;

      const closureAngle = Math.atan2(right.y - left.y, right.x - left.x) * 180 / Math.PI;
      const perpendicularDelta = Math.abs(90 - acuteAngleDelta(closureAngle, left.directionDeg));
      if (perpendicularDelta > perpendicularAngleToleranceDeg) continue;

      usedEndIds.add(left.id);
      usedEndIds.add(right.id);
      closures.push({
        id: `inferred_wall_closure_${closures.length + 1}`,
        x1: left.x,
        y1: left.y,
        x2: right.x,
        y2: right.y,
        strokeWidth: 0,
        sourceStrokeWidth: 0,
        pathKind: "line",
        sourceOpenEndIds: [left.id, right.id],
        confidence: 0.72,
        reasons: [
          `closed dangling wall ends ${left.id} and ${right.id}`,
          `closure length ${round(length)}`,
          "open end directions are parallel and closure is perpendicular"
        ]
      });
    }
  }

  return closures;
}

function lineAlreadyExists(left: WallEndHighlight, right: WallEndHighlight, segments: VectorSegment[]): boolean {
  return segments.some((segment) =>
    (
      endpointDistance(segment.x1, segment.y1, left.x, left.y) <= 2
      && endpointDistance(segment.x2, segment.y2, right.x, right.y) <= 2
    )
    || (
      endpointDistance(segment.x1, segment.y1, right.x, right.y) <= 2
      && endpointDistance(segment.x2, segment.y2, left.x, left.y) <= 2
    )
  );
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function endpointDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

function acuteAngleDelta(left: number, right: number): number {
  const delta = Math.abs(normalizeAngle180(left) - normalizeAngle180(right));
  return Math.min(delta, 180 - delta);
}

function normalizeAngle180(angle: number): number {
  const normalized = angle % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
