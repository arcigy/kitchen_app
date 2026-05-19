import type { StrokeWidthGroup, VectorSegment } from "./vectorStrokeGrouping";

export interface WallCandidateDetectionResult {
  wallCandidateSegmentIds: string[];
  heavyStructuralSegmentIds: string[];
  candidateGroupIds: string[];
  excludedDimensionSegmentCount: number;
  warnings: string[];
}

export function detectWallCandidateSegments(input: {
  groups: StrokeWidthGroup[];
  dimensionSegmentIds?: string[];
  excludeDimensionSegments?: boolean;
  minimumSegmentLength?: number;
}): WallCandidateDetectionResult {
  const minimumSegmentLength = input.minimumSegmentLength ?? 8;
  const excludedDimensionSegmentIds = new Set(input.dimensionSegmentIds ?? []);
  const excludeDimensionSegments = input.excludeDimensionSegments ?? false;
  const heavyStructuralSegmentIds = inferHeavyStructuralSegmentIds(input.groups);
  const candidateGroupIds = inferStructuralGroupIds(input.groups);
  const ids = new Set<string>();

  for (const group of input.groups) {
    if (!candidateGroupIds.has(group.groupId)) continue;
    for (const segment of group.segments) {
      if (excludeDimensionSegments && excludedDimensionSegmentIds.has(segment.id)) continue;
      if (!isLikelyWallFaceSegment(segment, minimumSegmentLength, group.representativeStrokeWidth)) continue;
      ids.add(segment.id);
    }
  }

  if (ids.size < heavyStructuralSegmentIds.size) {
    for (const id of heavyStructuralSegmentIds) {
      if (!excludedDimensionSegmentIds.has(id)) ids.add(id);
    }
  }

  const warnings: string[] = [];
  if (ids.size === 0) {
    warnings.push("No wall candidate segments found from stroke groups.");
  }

  return {
    wallCandidateSegmentIds: Array.from(ids),
    heavyStructuralSegmentIds: Array.from(heavyStructuralSegmentIds),
    candidateGroupIds: Array.from(candidateGroupIds),
    excludedDimensionSegmentCount: excludedDimensionSegmentIds.size,
    warnings
  };
}

export function inferHeavyStructuralSegmentIds(groups: StrokeWidthGroup[]): Set<string> {
  const sorted = [...groups].sort((left, right) => right.representativeStrokeWidth - left.representativeStrokeWidth);
  const medianWidth = median(sorted.map((group) => group.representativeStrokeWidth));
  const ids = new Set<string>();

  for (const group of sorted) {
    const thickEnough = group.representativeStrokeWidth >= Math.max(0.7, medianWidth * 1.8);
    const substantial = group.totalLength >= 500 || group.segments.length >= 20;
    if (!thickEnough || !substantial) continue;
    for (const segment of group.segments) ids.add(segment.id);
  }

  return ids;
}

function inferStructuralGroupIds(groups: StrokeWidthGroup[]): Set<string> {
  const sorted = [...groups].sort((left, right) => right.representativeStrokeWidth - left.representativeStrokeWidth);
  const substantialGroups = sorted.filter((group) => group.totalLength >= 400 || group.segments.length >= 12);
  const largestWidth = Math.max(...substantialGroups.map((group) => group.representativeStrokeWidth), 0);
  const minimumStructuralWidth = Math.max(0.08, largestWidth * 0.32);
  const ids = new Set<string>();

  for (const group of substantialGroups) {
    const lineWeightFits = group.representativeStrokeWidth >= minimumStructuralWidth;
    if (lineWeightFits) ids.add(group.groupId);
  }

  return ids;
}

function isLikelyWallFaceSegment(segment: VectorSegment, minimumSegmentLength: number, groupStrokeWidth: number): boolean {
  const length = segmentLength(segment);
  if (length < minimumSegmentLength) return false;
  if (segment.pathKind === "curve") return false;
  const angle = normalizedAcuteAngle(segment);
  const orthogonal = angle <= 10 || Math.abs(90 - angle) <= 10;
  if (orthogonal) return true;
  return length >= 80 && groupStrokeWidth >= 0.3;
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function normalizedAcuteAngle(segment: VectorSegment): number {
  const raw = Math.abs(Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1) * 180 / Math.PI) % 180;
  return raw > 90 ? 180 - raw : raw;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}
