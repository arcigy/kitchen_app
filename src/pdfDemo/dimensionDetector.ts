import { bboxFromSegments, round, segmentLength, type BBox, type Segment2 } from "./geometryUtils";
import type { PdfTextObject, PdfVectorExtractionResult, PdfVectorObject } from "./pdfVectorExtractor";
import type { WallCandidate } from "./wallCandidateDetector";

export interface DimensionDetectorConfig {
  textToLineMinMm: number;
  textToLineMaxMm: number;
  lengthToleranceMm: number;
  planPaddingMm: number;
  axisToleranceMm: number;
  textCenterToleranceMm: number;
  minDimensionMm: number;
  maxDimensionMm: number;
  attachmentAxisToleranceMm: number;
  attachmentMinLengthMm: number;
  attachmentHelperMaxLengthMm: number;
  attachmentHelperTouchToleranceMm: number;
  attachmentCornerToleranceMm: number;
}

export interface DimensionAttachment {
  endpoint: "start" | "end";
  line: Segment2;
  vectorObjectId: string;
  axisDeltaMm: number;
  distanceMm: number;
}

export interface DimensionCandidate {
  id: string;
  valueMm: number;
  confidence: number;
  text: PdfTextObject;
  line: Segment2;
  bbox: BBox;
  orientation: "horizontal" | "vertical";
  vectorObjectId: string;
  attachments: DimensionAttachment[];
  reasons: {
    numericText: boolean;
    inPlanRegion: boolean;
    textToLineDistanceMm: number;
    lineLengthMm: number;
    lengthDeltaMm: number;
  };
}

export interface DimensionDetectionResult {
  dimensions: DimensionCandidate[];
  debug: {
    numericTexts: number;
    numericTextsInPlan: number;
    candidateSegments: number;
    matchedDimensions: number;
  };
}

export const DEFAULT_DIMENSION_DETECTOR_CONFIG: DimensionDetectorConfig = {
  textToLineMinMm: 35,
  textToLineMaxMm: 125,
  lengthToleranceMm: 4,
  planPaddingMm: 1500,
  axisToleranceMm: 8,
  textCenterToleranceMm: 250,
  minDimensionMm: 80,
  maxDimensionMm: 12000,
  attachmentAxisToleranceMm: 3,
  attachmentMinLengthMm: 80,
  attachmentHelperMaxLengthMm: 300,
  attachmentHelperTouchToleranceMm: 8,
  attachmentCornerToleranceMm: 8
};

export function detectDimensionCandidates(
  extraction: PdfVectorExtractionResult,
  walls: WallCandidate[],
  config: DimensionDetectorConfig = DEFAULT_DIMENSION_DETECTOR_CONFIG
): DimensionDetectionResult {
  const planRegion = getPlanRegion(walls, extraction, config.planPaddingMm);
  const numericTexts = (extraction.texts ?? [])
    .map((text) => ({ text, valueMm: parseDimensionValue(text.value) }))
    .filter((item): item is { text: PdfTextObject; valueMm: number } => (
      item.valueMm !== null &&
      item.valueMm >= config.minDimensionMm &&
      item.valueMm <= config.maxDimensionMm
    ));
  const numericTextsInPlan = numericTexts.filter((item) => pointInBbox(item.text, planRegion));
  const segments = extraction.objects.flatMap((object) => dimensionLineSegments(object, planRegion));
  const dimensions: DimensionCandidate[] = [];
  const usedSegments = new Set<string>();

  for (const item of numericTextsInPlan) {
    const match = findBestLineForText(item.text, item.valueMm, segments, usedSegments, config);
    if (!match) continue;
    usedSegments.add(match.key);
    const length = segmentLength(match.segment);
    const distance = textToLineDistance(item.text, match.segment, match.orientation);
    const delta = Math.abs(length - item.valueMm);
    dimensions.push({
      id: `dim_${String(dimensions.length + 1).padStart(3, "0")}`,
      valueMm: item.valueMm,
      confidence: round(Math.max(0.5, 1 - delta / Math.max(config.lengthToleranceMm, 1)), 2),
      text: item.text,
      line: match.segment,
      bbox: bboxFromSegments([match.segment], 20),
      orientation: match.orientation,
      vectorObjectId: match.object.id,
      attachments: findDimensionAttachments(match, segments, config),
      reasons: {
        numericText: true,
        inPlanRegion: true,
        textToLineDistanceMm: round(distance, 3),
        lineLengthMm: round(length, 3),
        lengthDeltaMm: round(delta, 3)
      }
    });
  }

  return {
    dimensions,
    debug: {
      numericTexts: numericTexts.length,
      numericTextsInPlan: numericTextsInPlan.length,
      candidateSegments: segments.length,
      matchedDimensions: dimensions.length
    }
  };
}

function findDimensionAttachments(
  dimension: DimensionSegment,
  segments: DimensionSegment[],
  config: DimensionDetectorConfig
): DimensionAttachment[] {
  return [
    findAttachmentForEndpoint("start", dimension.segment.start, dimension, segments, config),
    findAttachmentForEndpoint("end", dimension.segment.end, dimension, segments, config)
  ].filter((attachment): attachment is DimensionAttachment => attachment !== null);
}

function findAttachmentForEndpoint(
  endpoint: "start" | "end",
  point: Segment2["start"],
  dimension: DimensionSegment,
  segments: DimensionSegment[],
  config: DimensionDetectorConfig
): DimensionAttachment | null {
  const targetOrientation = dimension.orientation === "horizontal" ? "vertical" : "horizontal";
  const candidates = segments
    .filter((candidate) => candidate.key !== dimension.key && candidate.orientation === targetOrientation)
    .filter((candidate) => segmentLength(candidate.segment) >= config.attachmentMinLengthMm)
    .filter((candidate) => isStraightOnOrientation(candidate.segment, targetOrientation, config.attachmentAxisToleranceMm))
    .filter((candidate) => !isDimensionHelperLine(candidate, dimension, segments, config))
    .map((candidate) => {
      const axisDelta = dimension.orientation === "horizontal"
        ? Math.abs(segmentAxis(candidate.segment, "vertical") - point.x)
        : Math.abs(segmentAxis(candidate.segment, "horizontal") - point.y);
      const distance = dimension.orientation === "horizontal"
        ? distanceToInterval(point.y, candidate.segment.start.y, candidate.segment.end.y)
        : distanceToInterval(point.x, candidate.segment.start.x, candidate.segment.end.x);
      return { candidate, axisDelta, distance };
    })
    .filter((item) => item.axisDelta <= config.attachmentAxisToleranceMm)
    .sort((left, right) => left.distance - right.distance || left.axisDelta - right.axisDelta);

  const best = candidates[0];
  if (!best) return null;
  return {
    endpoint,
    line: best.candidate.segment,
    vectorObjectId: best.candidate.object.id,
    axisDeltaMm: round(best.axisDelta, 3),
    distanceMm: round(best.distance, 3)
  };
}

function isStraightOnOrientation(
  segment: Segment2,
  orientation: "horizontal" | "vertical",
  tolerance: number
): boolean {
  return orientation === "horizontal"
    ? Math.abs(segment.start.y - segment.end.y) <= tolerance
    : Math.abs(segment.start.x - segment.end.x) <= tolerance;
}

function isDimensionHelperLine(
  candidate: DimensionSegment,
  dimension: DimensionSegment,
  segments: DimensionSegment[],
  config: DimensionDetectorConfig
): boolean {
  const segment = candidate.segment;
  if (segmentLength(segment) > config.attachmentHelperMaxLengthMm) return false;
  if (!sameLineStyle(candidate.object, dimension.object)) return false;

  if (dimension.orientation === "horizontal") {
    const dimensionY = segmentAxis(dimension.segment, "horizontal");
    if (distanceToInterval(dimensionY, segment.start.y, segment.end.y) > config.attachmentHelperTouchToleranceMm) return false;
    return !hasEndpointIntersection(segment.start, candidate, dimension, segments, config) &&
      !hasEndpointIntersection(segment.end, candidate, dimension, segments, config);
  }

  const dimensionX = segmentAxis(dimension.segment, "vertical");
  if (distanceToInterval(dimensionX, segment.start.x, segment.end.x) > config.attachmentHelperTouchToleranceMm) return false;
  return !hasEndpointIntersection(segment.start, candidate, dimension, segments, config) &&
    !hasEndpointIntersection(segment.end, candidate, dimension, segments, config);
}

function hasEndpointIntersection(
  point: Segment2["start"],
  candidate: DimensionSegment,
  dimension: DimensionSegment,
  segments: DimensionSegment[],
  config: DimensionDetectorConfig
): boolean {
  return segments.some((other) => {
    if (other.key === candidate.key || other.key === dimension.key) return false;
    if (other.orientation === candidate.orientation) return false;
    if (isColinearWithDimensionLine(other, dimension, config)) return false;
    return distancePointToSegment(point, other.segment) <= config.attachmentCornerToleranceMm;
  });
}

function isColinearWithDimensionLine(
  candidate: DimensionSegment,
  dimension: DimensionSegment,
  config: DimensionDetectorConfig
): boolean {
  if (candidate.orientation !== dimension.orientation) return false;
  const candidateAxis = segmentAxis(candidate.segment, candidate.orientation);
  const dimensionAxis = segmentAxis(dimension.segment, dimension.orientation);
  return Math.abs(candidateAxis - dimensionAxis) <= config.attachmentAxisToleranceMm;
}

function sameLineStyle(left: PdfVectorObject, right: PdfVectorObject): boolean {
  return Math.abs(left.strokeWidth - right.strokeWidth) < 0.001;
}

function distancePointToSegment(point: Segment2["start"], segment: Segment2): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - segment.start.x, point.y - segment.start.y);

  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));
  const projection = {
    x: segment.start.x + t * dx,
    y: segment.start.y + t * dy
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function segmentAxis(segment: Segment2, orientation: "horizontal" | "vertical"): number {
  return orientation === "horizontal"
    ? (segment.start.y + segment.end.y) / 2
    : (segment.start.x + segment.end.x) / 2;
}

function distanceToInterval(value: number, first: number, second: number): number {
  const min = Math.min(first, second);
  const max = Math.max(first, second);
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function findBestLineForText(
  text: PdfTextObject,
  valueMm: number,
  segments: DimensionSegment[],
  usedSegments: Set<string>,
  config: DimensionDetectorConfig
): DimensionSegment | null {
  const matches = segments
    .filter((candidate) => !usedSegments.has(candidate.key))
    .map((candidate) => ({
      candidate,
      lengthDelta: Math.abs(segmentLength(candidate.segment) - valueMm),
      distance: textToLineDistance(text, candidate.segment, candidate.orientation),
      centered: textCenteredOnSegment(text, candidate.segment, candidate.orientation, config.textCenterToleranceMm)
    }))
    .filter((match) => (
      match.lengthDelta <= config.lengthToleranceMm &&
      match.distance >= config.textToLineMinMm &&
      match.distance <= config.textToLineMaxMm &&
      match.centered
    ))
    .sort((left, right) => left.lengthDelta - right.lengthDelta || left.distance - right.distance);

  return matches[0]?.candidate ?? null;
}

interface DimensionSegment {
  key: string;
  object: PdfVectorObject;
  segment: Segment2;
  orientation: "horizontal" | "vertical";
}

function dimensionLineSegments(object: PdfVectorObject, planRegion: BBox): DimensionSegment[] {
  return object.segments
    .map((segment, index) => {
      const dx = Math.abs(segment.end.x - segment.start.x);
      const dy = Math.abs(segment.end.y - segment.start.y);
      const orientation: "horizontal" | "vertical" = dx >= dy ? "horizontal" : "vertical";
      return { key: `${object.id}:${index}`, object, segment, orientation };
    })
    .filter((item) => segmentInBbox(item.segment, planRegion) && segmentLength(item.segment) >= 20);
}

function textToLineDistance(text: PdfTextObject, segment: Segment2, orientation: "horizontal" | "vertical"): number {
  if (orientation === "horizontal") {
    const lineY = (segment.start.y + segment.end.y) / 2;
    return lineY - text.y;
  }

  const lineX = (segment.start.x + segment.end.x) / 2;
  return lineX - text.x;
}

function textCenteredOnSegment(
  text: PdfTextObject,
  segment: Segment2,
  orientation: "horizontal" | "vertical",
  tolerance: number
): boolean {
  if (orientation === "horizontal") {
    const minX = Math.min(segment.start.x, segment.end.x) - tolerance;
    const maxX = Math.max(segment.start.x, segment.end.x) + tolerance;
    return text.x >= minX && text.x <= maxX;
  }

  const minY = Math.min(segment.start.y, segment.end.y) - tolerance;
  const maxY = Math.max(segment.start.y, segment.end.y) + tolerance;
  return text.y >= minY && text.y <= maxY;
}

function parseDimensionValue(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getPlanRegion(walls: WallCandidate[], extraction: PdfVectorExtractionResult, padding: number): BBox {
  if (walls.length === 0) {
    return { x: 0, y: 0, width: extraction.width * 0.65, height: extraction.height };
  }

  const minX = Math.min(...walls.map((wall) => wall.bbox.x));
  const minY = Math.min(...walls.map((wall) => wall.bbox.y));
  const maxX = Math.max(...walls.map((wall) => wall.bbox.x + wall.bbox.width));
  const maxY = Math.max(...walls.map((wall) => wall.bbox.y + wall.bbox.height));

  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    width: Math.min(extraction.width, maxX + padding) - Math.max(0, minX - padding),
    height: Math.min(extraction.height, maxY + padding) - Math.max(0, minY - padding)
  };
}

function pointInBbox(point: { x: number; y: number }, bbox: BBox): boolean {
  return point.x >= bbox.x && point.x <= bbox.x + bbox.width && point.y >= bbox.y && point.y <= bbox.y + bbox.height;
}

function segmentInBbox(segment: Segment2, bbox: BBox): boolean {
  return pointInBbox(segment.start, bbox) && pointInBbox(segment.end, bbox);
}
