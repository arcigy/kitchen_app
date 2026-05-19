import type { StrokeWidthGroup, VectorSegment } from "./vectorStrokeGrouping";

export interface WallLineCleanupResult {
  groups: StrokeWidthGroup[];
  targetGroupId: string;
  removedDuplicateSegmentIds: string[];
  adjustedSegmentIds: string[];
  snappedEndpointCount: number;
  warnings: string[];
}

export function cleanupWallLineGroup(input: {
  groups: StrokeWidthGroup[];
  targetGroupId?: string;
  collinearTolerance?: number;
  endpointTolerance?: number;
  angleToleranceDeg?: number;
}): WallLineCleanupResult {
  const targetGroupId = input.targetGroupId ?? "stroke_group_1";
  const collinearTolerance = input.collinearTolerance ?? 1.25;
  const endpointTolerance = input.endpointTolerance ?? 3;
  const angleToleranceDeg = input.angleToleranceDeg ?? 3;
  const targetGroup = input.groups.find((group) => group.groupId === targetGroupId);

  if (!targetGroup) {
    return {
      groups: input.groups,
      targetGroupId,
      removedDuplicateSegmentIds: [],
      adjustedSegmentIds: [],
      snappedEndpointCount: 0,
      warnings: [`Wall line cleanup target group ${targetGroupId} was not found.`]
    };
  }

  const duplicateResult = removeContainedDuplicateSegments(targetGroup.segments, collinearTolerance, endpointTolerance, angleToleranceDeg);
  const topologyPreservedSegments = splitSegmentsAtRemovedDuplicateEndpoints(
    duplicateResult.segments,
    duplicateResult.removedSegments,
    collinearTolerance,
    endpointTolerance,
    angleToleranceDeg
  );
  const joinResult = snapNearbyWallLineEndpoints(topologyPreservedSegments, endpointTolerance);
  const finalDuplicateResult = removeContainedDuplicateSegments(joinResult.segments, collinearTolerance, endpointTolerance, angleToleranceDeg);
  const mergeResult = mergeCollinearWallSegments(finalDuplicateResult.segments, collinearTolerance, endpointTolerance, angleToleranceDeg);
  const removedDuplicateSegmentIds = Array.from(new Set([
    ...duplicateResult.removedSegmentIds,
    ...finalDuplicateResult.removedSegmentIds
  ]));
  const adjustedSegmentIds = Array.from(new Set(joinResult.adjustedSegmentIds))
    .filter((id) => !removedDuplicateSegmentIds.includes(id));
  const cleanedGroup = recalculateGroup({
    ...targetGroup,
    segments: mergeResult.segments
  });

  return {
    groups: input.groups.map((group) => group.groupId === targetGroupId ? cleanedGroup : group),
    targetGroupId,
    removedDuplicateSegmentIds,
    adjustedSegmentIds,
    snappedEndpointCount: joinResult.snappedEndpointCount,
    warnings: []
  };
}

function mergeCollinearWallSegments(
  segments: VectorSegment[],
  collinearTolerance: number,
  endpointTolerance: number,
  angleToleranceDeg: number
): { segments: VectorSegment[] } {
  const merged = segments.map((segment) => ({ ...segment }));
  let changed = true;

  while (changed) {
    changed = false;
    for (let leftIndex = 0; leftIndex < merged.length && !changed; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < merged.length; rightIndex += 1) {
        const combined = combineCollinearSegments(
          merged[leftIndex],
          merged[rightIndex],
          collinearTolerance,
          endpointTolerance,
          angleToleranceDeg
        );
        if (!combined) continue;
        merged[leftIndex] = combined;
        merged.splice(rightIndex, 1);
        changed = true;
        break;
      }
    }
  }

  return { segments: merged };
}

function combineCollinearSegments(
  left: VectorSegment,
  right: VectorSegment,
  collinearTolerance: number,
  endpointTolerance: number,
  angleToleranceDeg: number
): VectorSegment | null {
  if (left.pathKind === "curve" || right.pathKind === "curve") return null;
  if (angleDelta(left, right) > angleToleranceDeg) return null;

  const axis = segmentAxis(left);
  const normal = { x: -axis.y, y: axis.x };
  const leftOffset = dot({ x: left.x1, y: left.y1 }, normal);
  const rightOffset = dot({ x: right.x1, y: right.y1 }, normal);
  if (Math.abs(leftOffset - rightOffset) > collinearTolerance) return null;

  const leftProjection = intervalProjection(left, axis);
  const rightProjection = intervalProjection(right, axis);
  const gap = Math.max(leftProjection.min, rightProjection.min) - Math.min(leftProjection.max, rightProjection.max);
  if (gap > endpointTolerance) return null;

  const min = Math.min(leftProjection.min, rightProjection.min);
  const max = Math.max(leftProjection.max, rightProjection.max);
  const offset = (leftOffset + rightOffset) / 2;
  const base = segmentLength(left) >= segmentLength(right) ? left : right;

  return {
    ...base,
    x1: round(axis.x * min + normal.x * offset),
    y1: round(axis.y * min + normal.y * offset),
    x2: round(axis.x * max + normal.x * offset),
    y2: round(axis.y * max + normal.y * offset)
  };
}

function removeContainedDuplicateSegments(
  segments: VectorSegment[],
  collinearTolerance: number,
  endpointTolerance: number,
  angleToleranceDeg: number
): { segments: VectorSegment[]; removedSegmentIds: string[]; removedSegments: VectorSegment[] } {
  const removedIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    if (removedIds.has(segments[leftIndex].id)) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      if (removedIds.has(segments[rightIndex].id)) continue;
      const duplicate = classifyContainedDuplicate(
        segments[leftIndex],
        segments[rightIndex],
        collinearTolerance,
        endpointTolerance,
        angleToleranceDeg
      );
      if (!duplicate) continue;
      removedIds.add(duplicate.removeId);
    }
  }

  return {
    segments: segments.filter((segment) => !removedIds.has(segment.id)),
    removedSegmentIds: Array.from(removedIds),
    removedSegments: segments.filter((segment) => removedIds.has(segment.id))
  };
}

function splitSegmentsAtRemovedDuplicateEndpoints(
  segments: VectorSegment[],
  removedSegments: VectorSegment[],
  collinearTolerance: number,
  endpointTolerance: number,
  angleToleranceDeg: number
): VectorSegment[] {
  const result: VectorSegment[] = [];

  for (const segment of segments) {
    const splitPoints = [
      { t: 0, x: segment.x1, y: segment.y1 },
      { t: 1, x: segment.x2, y: segment.y2 }
    ];

    for (const removed of removedSegments) {
      if (angleDelta(segment, removed) > angleToleranceDeg) continue;
      for (const point of [{ x: removed.x1, y: removed.y1 }, { x: removed.x2, y: removed.y2 }]) {
        const projection = projectPointToSegment(point, segment);
        if (projection.t <= 0.02 || projection.t >= 0.98) continue;
        if (projection.distance > Math.max(collinearTolerance, endpointTolerance * 0.5)) continue;
        splitPoints.push({ t: projection.t, x: projection.x, y: projection.y });
      }
    }

    const uniquePoints = dedupeSplitPoints(splitPoints, 0.01).sort((left, right) => left.t - right.t);
    if (uniquePoints.length <= 2) {
      result.push(segment);
      continue;
    }

    for (let index = 0; index < uniquePoints.length - 1; index += 1) {
      const from = uniquePoints[index];
      const to = uniquePoints[index + 1];
      if (distance(from, to) <= 0.5) continue;
      result.push({
        ...segment,
        id: `${segment.id}_part_${index + 1}`,
        x1: round(from.x),
        y1: round(from.y),
        x2: round(to.x),
        y2: round(to.y)
      });
    }
  }

  return result;
}

function dedupeSplitPoints<T extends { t: number; x: number; y: number }>(points: T[], tolerance: number): T[] {
  const unique: T[] = [];
  for (const point of points) {
    if (unique.some((item) => Math.abs(item.t - point.t) <= tolerance)) continue;
    unique.push(point);
  }
  return unique;
}

function classifyContainedDuplicate(
  left: VectorSegment,
  right: VectorSegment,
  collinearTolerance: number,
  endpointTolerance: number,
  angleToleranceDeg: number
): { removeId: string } | null {
  const leftLength = segmentLength(left);
  const rightLength = segmentLength(right);
  if (leftLength <= 0.5 || rightLength <= 0.5) return null;
  if (angleDelta(left, right) > angleToleranceDeg) return null;

  const axis = segmentAxis(left);
  const normal = { x: -axis.y, y: axis.x };
  const leftOffset = dot({ x: left.x1, y: left.y1 }, normal);
  const rightOffset = dot({ x: right.x1, y: right.y1 }, normal);
  if (Math.abs(leftOffset - rightOffset) > collinearTolerance) return null;

  const leftProjection = intervalProjection(left, axis);
  const rightProjection = intervalProjection(right, axis);
  const overlap = Math.max(0, Math.min(leftProjection.max, rightProjection.max) - Math.max(leftProjection.min, rightProjection.min));
  const smallerLength = Math.min(leftLength, rightLength);
  const contained = overlap >= smallerLength - endpointTolerance;
  const sameEndpoints = endpointsMatch(left, right, endpointTolerance);
  if (!contained && !sameEndpoints) return null;

  if (Math.abs(leftLength - rightLength) <= endpointTolerance) {
    return { removeId: right.id };
  }

  return { removeId: leftLength < rightLength ? left.id : right.id };
}

function snapNearbyWallLineEndpoints(
  segments: VectorSegment[],
  endpointTolerance: number
): { segments: VectorSegment[]; adjustedSegmentIds: string[]; snappedEndpointCount: number } {
  const cleaned = segments.map((segment) => ({ ...segment }));
  const endpointRefs = cleaned.flatMap((segment, segmentIndex) => [
    { segmentIndex, endpoint: "start" as const, x: segment.x1, y: segment.y1 },
    { segmentIndex, endpoint: "end" as const, x: segment.x2, y: segment.y2 }
  ]);
  const parents = endpointRefs.map((_, index) => index);
  const adjustedIds = new Set<string>();
  let snappedEndpointCount = 0;

  for (let left = 0; left < endpointRefs.length; left += 1) {
    for (let right = left + 1; right < endpointRefs.length; right += 1) {
      if (endpointRefs[left].segmentIndex === endpointRefs[right].segmentIndex) continue;
      if (distance(endpointRefs[left], endpointRefs[right]) <= endpointTolerance) union(parents, left, right);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let index = 0; index < endpointRefs.length; index += 1) {
    const root = find(parents, index);
    const cluster = clusters.get(root) ?? [];
    cluster.push(index);
    clusters.set(root, cluster);
  }

  for (const cluster of clusters.values()) {
    if (cluster.length < 2) continue;
    const target = averagePoint(cluster.map((index) => endpointRefs[index]));
    for (const index of cluster) {
      const ref = endpointRefs[index];
      if (distance(ref, target) <= 0.001) continue;
      setEndpoint(cleaned[ref.segmentIndex], ref.endpoint, target);
      adjustedIds.add(cleaned[ref.segmentIndex].id);
      snappedEndpointCount += 1;
    }
  }

  for (const segment of cleaned) {
    for (const endpoint of ["start", "end"] as const) {
      const point = endpoint === "start" ? { x: segment.x1, y: segment.y1 } : { x: segment.x2, y: segment.y2 };
      const target = findClosestInteriorProjection(point, segment, cleaned, endpointTolerance);
      if (!target) continue;
      setEndpoint(segment, endpoint, target);
      adjustedIds.add(segment.id);
      snappedEndpointCount += 1;
    }
  }

  return {
    segments: cleaned.filter((segment) => segmentLength(segment) > 0.5),
    adjustedSegmentIds: Array.from(adjustedIds),
    snappedEndpointCount
  };
}

function findClosestInteriorProjection(
  point: { x: number; y: number },
  ownSegment: VectorSegment,
  segments: VectorSegment[],
  tolerance: number
): { x: number; y: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const segment of segments) {
    if (segment.id === ownSegment.id) continue;
    const projection = projectPointToSegment(point, segment);
    if (projection.t <= 0.02 || projection.t >= 0.98) continue;
    if (projection.distance > tolerance) continue;
    if (!best || projection.distance < best.distance) {
      best = { x: projection.x, y: projection.y, distance: projection.distance };
    }
  }

  return best ? { x: best.x, y: best.y } : null;
}

function recalculateGroup(group: StrokeWidthGroup): StrokeWidthGroup {
  return {
    ...group,
    totalLength: round(group.segments.reduce((sum, segment) => sum + segmentLength(segment), 0))
  };
}

function endpointsMatch(left: VectorSegment, right: VectorSegment, tolerance: number): boolean {
  const leftStart = { x: left.x1, y: left.y1 };
  const leftEnd = { x: left.x2, y: left.y2 };
  const rightStart = { x: right.x1, y: right.y1 };
  const rightEnd = { x: right.x2, y: right.y2 };
  return distance(leftStart, rightStart) <= tolerance && distance(leftEnd, rightEnd) <= tolerance
    || distance(leftStart, rightEnd) <= tolerance && distance(leftEnd, rightStart) <= tolerance;
}

function setEndpoint(segment: VectorSegment, endpoint: "start" | "end", point: { x: number; y: number }): void {
  if (endpoint === "start") {
    segment.x1 = round(point.x);
    segment.y1 = round(point.y);
    return;
  }

  segment.x2 = round(point.x);
  segment.y2 = round(point.y);
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
  if (lengthSquared <= 0) return { x: segment.x1, y: segment.y1, t: 0, distance: distance(point, { x: segment.x1, y: segment.y1 }) };
  const t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  const x = segment.x1 + dx * clamped;
  const y = segment.y1 + dy * clamped;
  return { x, y, t: clamped, distance: distance(point, { x, y }) };
}

function intervalProjection(segment: VectorSegment, axis: { x: number; y: number }): { min: number; max: number } {
  const start = dot({ x: segment.x1, y: segment.y1 }, axis);
  const end = dot({ x: segment.x2, y: segment.y2 }, axis);
  return { min: Math.min(start, end), max: Math.max(start, end) };
}

function segmentAxis(segment: VectorSegment): { x: number; y: number } {
  const length = segmentLength(segment);
  if (length <= 0) return { x: 1, y: 0 };
  let x = (segment.x2 - segment.x1) / length;
  let y = (segment.y2 - segment.y1) / length;
  if (x < 0 || Math.abs(x) < 0.0001 && y < 0) {
    x *= -1;
    y *= -1;
  }
  return { x, y };
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
  return distance({ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 });
}

function averagePoint(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  return {
    x: round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: round(points.reduce((sum, point) => sum + point.y, 0) / points.length)
  };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function dot(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return left.x * right.x + left.y * right.y;
}

function find(parents: number[], index: number): number {
  if (parents[index] !== index) parents[index] = find(parents, parents[index]);
  return parents[index];
}

function union(parents: number[], left: number, right: number): void {
  const leftRoot = find(parents, left);
  const rightRoot = find(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
