import type { VectorSegment } from "./vectorStrokeGrouping";

export interface VectorTextToken {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  rotationDeg?: number;
}

export interface DimensionAnnotation {
  id: string;
  valueMm: number;
  textTokenId: string;
  text: string;
  mainSegmentId: string;
  markerSegmentIds: string[];
  orientation: "horizontal" | "vertical" | "angled";
  detectionKind: "full_segment" | "chained_span";
  measuredLengthMm: number;
  scaleFactor: number;
  confidence: number;
  reasons: string[];
}

export interface DimensionDetectionResult {
  dimensions: DimensionAnnotation[];
  chainCandidates: DimensionAnnotation[];
  dimensionTextTokenIds: string[];
  dimensionSegmentIds: string[];
  inferredScaleFactor?: number;
  scaleEvidenceCount: number;
  numericTextCount: number;
  warnings: string[];
}

interface RawMatch {
  text: VectorTextToken;
  valueMm: number;
  segment: VectorSegment;
  orientation: "horizontal" | "vertical" | "angled";
  ratio: number;
  gap: number;
  overlapScore: number;
  markerSegmentIds?: string[];
  detectionKind?: DimensionAnnotation["detectionKind"];
}

export function detectDimensionAnnotations(input: {
  segments: VectorSegment[];
  texts: VectorTextToken[];
  scaleFactor?: number;
  scaleToleranceRatio?: number;
  minimumScaleEvidence?: number;
  maxPerpendicularGap?: number;
  excludedSegmentIds?: string[];
}): DimensionDetectionResult {
  const scaleToleranceRatio = input.scaleToleranceRatio ?? 0.08;
  const minimumScaleEvidence = input.minimumScaleEvidence ?? 3;
  const maxPerpendicularGap = input.maxPerpendicularGap ?? 42;
  const excludedSegmentIds = new Set(input.excludedSegmentIds ?? []);
  const numericTexts = input.texts
    .map((text) => ({ text, valueMm: parseDimensionNumber(text.text) }))
    .filter((item): item is { text: VectorTextToken; valueMm: number } => item.valueMm !== null);
  const candidateSegments = input.segments.filter((segment) => {
    const length = segmentLength(segment);
    return length >= 2 && !excludedSegmentIds.has(segment.id);
  });
  const rawMatches: RawMatch[] = [];

  for (const { text, valueMm } of numericTexts) {
    for (const segment of candidateSegments) {
      const orientation = segmentOrientation(segment);
      const match = createRawMatch(text, valueMm, segment, orientation, maxPerpendicularGap);
      if (match) rawMatches.push(match);
    }
  }

  const inferredScaleFactor = input.scaleFactor ?? inferScaleFactor(rawMatches, scaleToleranceRatio, minimumScaleEvidence);
  const warnings: string[] = [];
  if (!inferredScaleFactor) {
    warnings.push("Could not infer a stable drawing scale from numeric text and nearby lines.");
  }

  const bestByText = new Map<string, RawMatch>();
  if (inferredScaleFactor) {
    for (const match of rawMatches) {
      const measured = segmentLength(match.segment) * inferredScaleFactor;
      const allowedDelta = Math.max(10, match.valueMm * scaleToleranceRatio);
      if (Math.abs(measured - match.valueMm) > allowedDelta) continue;
      const previous = bestByText.get(match.text.id);
      if (!previous || rawMatchScore(match) > rawMatchScore(previous)) {
        bestByText.set(match.text.id, match);
      }
    }
  }

  const dimensions = Array.from(bestByText.values())
    .sort((left, right) => left.text.id.localeCompare(right.text.id, undefined, { numeric: true }))
    .map((match, index) => {
      const markerSegmentIds = findMarkerSegments(match.segment, input.segments, match.orientation, excludedSegmentIds);
      const allMarkerSegmentIds = unique([...(match.markerSegmentIds ?? []), ...markerSegmentIds]);
      const measuredLengthMm = segmentLength(match.segment) * (inferredScaleFactor ?? match.ratio);
      return {
        id: `dimension_${index + 1}`,
        valueMm: match.valueMm,
        textTokenId: match.text.id,
        text: match.text.text,
        mainSegmentId: match.segment.id,
        markerSegmentIds: allMarkerSegmentIds,
        orientation: match.orientation,
        detectionKind: match.detectionKind ?? "full_segment",
        measuredLengthMm: round(measuredLengthMm),
        scaleFactor: round(inferredScaleFactor ?? match.ratio),
        confidence: clamp(0.45 + match.overlapScore * 0.25 + Math.min(0.2, allMarkerSegmentIds.length * 0.05) - Math.min(0.2, match.gap / 300), 0, 0.98),
        reasons: [
          `numeric text ${match.text.text}`,
          match.detectionKind === "chained_span" ? `nearby chained span on ${match.orientation} line ${match.segment.id}` : `nearby ${match.orientation} line ${match.segment.id}`,
          `line length ${round(segmentLength(match.segment))} * scale ${round(inferredScaleFactor ?? match.ratio)} ~= ${round(measuredLengthMm)}mm`,
          allMarkerSegmentIds.length > 0 ? `${allMarkerSegmentIds.length} possible end/tick marker lines found` : "no clear end/tick marker lines found"
        ]
      };
    });
  const dimensionSegmentIds = new Set<string>();
  for (const dimension of dimensions) {
    dimensionSegmentIds.add(dimension.mainSegmentId);
    for (const markerId of dimension.markerSegmentIds) dimensionSegmentIds.add(markerId);
  }
  return {
    dimensions,
    chainCandidates: [],
    dimensionTextTokenIds: dimensions.map((dimension) => dimension.textTokenId),
    dimensionSegmentIds: Array.from(dimensionSegmentIds),
    inferredScaleFactor: inferredScaleFactor ? round(inferredScaleFactor) : undefined,
    scaleEvidenceCount: inferredScaleFactor ? rawMatches.filter((match) => Math.abs(match.ratio - inferredScaleFactor) <= inferredScaleFactor * scaleToleranceRatio).length : 0,
    numericTextCount: numericTexts.length,
    warnings
  };
}

function createRawMatch(
  text: VectorTextToken,
  valueMm: number,
  segment: VectorSegment,
  orientation: "horizontal" | "vertical" | "angled",
  maxPerpendicularGap: number
): RawMatch | null {
  const length = segmentLength(segment);
  if (length <= 0) return null;
  const center = textCenter(text);
  const margin = Math.max(10, text.fontSize * 2.5);
  const projection = projectPointToSegment(center, segment);
  const gap = projection.distance;
  if (gap > maxPerpendicularGap) return null;
  if (projection.t < -margin / length || projection.t > 1 + margin / length) return null;
  const angleScore = textRotationFitsSegment(text, segment);
  if (angleScore < 0.55) return null;
  const overlapScore = (1 - Math.min(1, Math.abs(projection.t - 0.5) * 2)) * 0.65 + angleScore * 0.35;

  const ratio = valueMm / length;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return { text, valueMm, segment, orientation, ratio, gap, overlapScore };
}

function inferScaleFactor(matches: RawMatch[], toleranceRatio: number, minimumEvidence: number): number | undefined {
  const usable = matches
    .filter((match) => match.valueMm >= 50 && segmentLength(match.segment) >= 4)
    .map((match) => match.ratio)
    .sort((left, right) => left - right);
  let best: number[] = [];
  for (const ratio of usable) {
    const cluster = usable.filter((candidate) => Math.abs(candidate - ratio) <= Math.max(ratio, candidate) * toleranceRatio);
    if (cluster.length > best.length) best = cluster;
  }
  if (best.length < minimumEvidence) return undefined;
  return best.reduce((sum, ratio) => sum + ratio, 0) / best.length;
}

function findMarkerSegments(main: VectorSegment, segments: VectorSegment[], orientation: "horizontal" | "vertical" | "angled", excludedSegmentIds: Set<string>): string[] {
  const endpointRadius = 7;
  const minMarkerLength = 2;
  const maxMarkerLength = 65;
  const endpoints = [{ x: main.x1, y: main.y1 }, { x: main.x2, y: main.y2 }];
  return segments
    .filter((segment) => segment.id !== main.id)
    .filter((segment) => !excludedSegmentIds.has(segment.id))
    .filter((segment) => {
      const length = segmentLength(segment);
      if (length < minMarkerLength || length > maxMarkerLength) return false;
      return endpoints.some((endpoint) => touchesPoint(segment, endpoint, endpointRadius) && isLikelyDimensionMarker(main, segment, orientation));
    })
    .map((segment) => segment.id)
    .slice(0, 8);
}

function parseDimensionNumber(text: string): number | null {
  const compact = text.replace(/\s+/gu, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/u.test(compact)) return null;
  const value = Number(compact);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return value;
}

function rawMatchScore(match: RawMatch): number {
  return match.overlapScore * 2 - match.gap / 30;
}

function isHorizontal(segment: VectorSegment, tolerance = 0.08): boolean {
  return Math.abs(segment.y2 - segment.y1) <= Math.max(0.5, segmentLength(segment) * tolerance);
}

function isVertical(segment: VectorSegment, tolerance = 0.08): boolean {
  return Math.abs(segment.x2 - segment.x1) <= Math.max(0.5, segmentLength(segment) * tolerance);
}

function segmentOrientation(segment: VectorSegment): "horizontal" | "vertical" | "angled" {
  if (isHorizontal(segment)) return "horizontal";
  if (isVertical(segment)) return "vertical";
  return "angled";
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function textCenter(text: VectorTextToken): { x: number; y: number } {
  return { x: text.x + text.width / 2, y: text.y + text.height / 2 };
}

function projectPointToSegment(point: { x: number; y: number }, segment: VectorSegment): { t: number; distance: number } {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return { t: 0, distance: Math.hypot(point.x - segment.x1, point.y - segment.y1) };
  const t = ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  const projected = { x: segment.x1 + clamped * dx, y: segment.y1 + clamped * dy };
  return { t, distance: Math.hypot(point.x - projected.x, point.y - projected.y) };
}

function textRotationFitsSegment(text: VectorTextToken, segment: VectorSegment): number {
  const textAngle = normalizeAngle(text.rotationDeg ?? 0);
  const segmentAngle = normalizeAngle(segmentAngleDeg(segment));
  const primaryDelta = acuteAngleDelta(textAngle, segmentAngle);
  const perpendicularDelta = acuteAngleDelta(textAngle + 90, segmentAngle);
  const delta = Math.min(primaryDelta, perpendicularDelta);
  if (delta <= 12) return 1;
  if (delta <= 25) return 0.75;
  if (delta <= 40) return 0.55;
  return 0;
}

function isLikelyDimensionMarker(main: VectorSegment, marker: VectorSegment, orientation: "horizontal" | "vertical" | "angled"): boolean {
  const angleDelta = acuteAngleDelta(segmentAngleDeg(main), segmentAngleDeg(marker));
  if (angleDelta >= 65 && angleDelta <= 115) return true;
  if (orientation === "horizontal" && isVertical(marker, 0.28)) return true;
  if (orientation === "vertical" && isHorizontal(marker, 0.28)) return true;
  return angleDelta >= 20 && angleDelta <= 160;
}

function touchesPoint(segment: VectorSegment, endpoint: { x: number; y: number }, radius: number): boolean {
  const projection = projectPointToSegment(endpoint, segment);
  return Math.hypot(segment.x1 - endpoint.x, segment.y1 - endpoint.y) <= radius
    || Math.hypot(segment.x2 - endpoint.x, segment.y2 - endpoint.y) <= radius
    || (projection.t >= -0.05 && projection.t <= 1.05 && projection.distance <= radius);
}

function segmentAngleDeg(segment: VectorSegment): number {
  return Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1) * 180 / Math.PI;
}

function normalizeAngle(angle: number): number {
  const normalized = angle % 180;
  return normalized < 0 ? normalized + 180 : normalized;
}

function acuteAngleDelta(left: number, right: number): number {
  const delta = Math.abs(normalizeAngle(left) - normalizeAngle(right));
  return Math.min(delta, 180 - delta);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
