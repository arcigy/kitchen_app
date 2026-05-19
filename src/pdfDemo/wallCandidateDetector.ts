import {
  bboxFromSegments,
  bboxOrientation,
  getOrientation,
  mergeColinearSegments,
  round,
  segmentLength,
  type BBox,
  type Orientation,
  type Segment2
} from "./geometryUtils";
import type { PdfVectorObject, RgbColor } from "./pdfVectorExtractor";

export interface WallDetectorConfig {
  minSegmentLengthPx: number;
  minStrokeWidthPx: number;
  minFilledThicknessPx: number;
  maxThinLineWidthPx: number;
  axisAngleToleranceDeg: number;
  colinearAxisTolerancePx: number;
  mergeGapTolerancePx: number;
  darkColorMaxChannel: number;
  minimumConfidence: number;
  targetLineweightStrokeWidthPx: number;
  lineweightTolerancePx: number;
  drawingScale: number;
  floorplanMaxX: number;
  sampledStrokeWidthTolerancePx: number;
  sampledColorTolerance: number;
  minWallRectangleThicknessPx: number;
  maxWallRectangleThicknessPx: number;
  minWallRectangleLengthPx: number;
  rectangleAxisTolerancePx: number;
  maxWallRectanglesPerBoundary: number;
  tJoinSnapTolerancePx: number;
  cornerPriorityThicknessRatio: number;
  minWallRectangleAspectRatio: number;
}

export interface WallCandidate {
  id: string;
  type: "wall_candidate";
  confidence: number;
  source: "vector_path";
  strokeWidth: number;
  bbox: BBox;
  centerline: Segment2;
  orientation: Exclude<Orientation, "diagonal">;
  vectorObjectIds: string[];
  reasons: WallCandidateReasons;
  length: number;
  realWorldLength: number;
}

export interface WallCandidateReasons {
  strokeWidthScore: number;
  lengthScore: number;
  orientationScore: number;
  colorScore: number;
  mergeScore: number;
}

export interface WallRectangle {
  id: string;
  type: "wall_rectangle";
  orientation: Exclude<Orientation, "diagonal">;
  bbox: BBox;
  polygon: [Segment2["start"], Segment2["start"], Segment2["start"], Segment2["start"]];
  boundaryWallIds: [string, string];
  thickness: number;
  length: number;
  autoClosedEdges: Segment2[];
}

export interface UnresolvedWallBoundary {
  boundaryId: string;
  reason: "missing_parallel_boundary" | "too_short" | "ambiguous_multiple_matches" | "inside_fill_wall";
  wall: WallCandidate;
}

export interface WallDetectionResult {
  page: number;
  isVectorPdf: boolean;
  scale: null;
  walls: WallCandidate[];
  wallRectangles: WallRectangle[];
  unresolvedWallBoundaries: UnresolvedWallBoundary[];
  debug: {
    totalVectorObjects: number;
    objectsAfterStrokeFilter: number;
    objectsAfterLengthFilter: number;
    objectsAfterOrientationFilter: number;
    mergedSegments: number;
    finalWallCandidates: number;
    wallCandidates: number;
    wallRectangles: number;
    unresolvedWallBoundaries: number;
    ignoredObjects: number;
  };
}

export const DEFAULT_WALL_DETECTOR_CONFIG: WallDetectorConfig = {
  minSegmentLengthPx: 35,
  minStrokeWidthPx: 1.2,
  minFilledThicknessPx: 3,
  maxThinLineWidthPx: 0.8,
  axisAngleToleranceDeg: 2,
  colinearAxisTolerancePx: 4,
  mergeGapTolerancePx: 5,
  darkColorMaxChannel: 205,
  minimumConfidence: 0.45,
  targetLineweightStrokeWidthPx: 0.24,
  lineweightTolerancePx: 0.025,
  drawingScale: 50,
  floorplanMaxX: 600
  ,
  sampledStrokeWidthTolerancePx: 0.02,
  sampledColorTolerance: 12,
  minWallRectangleThicknessPx: 45,
  maxWallRectangleThicknessPx: 560,
  minWallRectangleLengthPx: 120,
  rectangleAxisTolerancePx: 3,
  maxWallRectanglesPerBoundary: 4,
  tJoinSnapTolerancePx: 180,
  cornerPriorityThicknessRatio: 1.35,
  minWallRectangleAspectRatio: 1.45
};

interface SegmentCandidate {
  sourceObject: PdfVectorObject;
  segment: Segment2;
  orientation: Exclude<Orientation, "diagonal">;
  strokeWidth: number;
  confidence: number;
  reasons: WallCandidateReasons;
}

export function detectWallCandidates(
  page: number,
  isVectorPdf: boolean,
  objects: PdfVectorObject[],
  config: WallDetectorConfig = DEFAULT_WALL_DETECTOR_CONFIG
): WallDetectionResult {
  const segmentCandidates = objects.flatMap((object) => getObjectSegmentCandidates(object, config));
  const grouped = groupSegmentCandidates(segmentCandidates, config);
  const walls = grouped
    .filter((wall) => wall.confidence >= config.minimumConfidence)
    .map((wall, index) => ({
      ...wall,
      id: `wall_${String(index + 1).padStart(3, "0")}`
    }));
  const wallRectangles = buildWallRectangles(walls, config, objects);
  const unresolvedWallBoundaries = findUnresolvedWallBoundaries(walls, wallRectangles, config);

  return {
    page,
    isVectorPdf,
    scale: null,
    walls,
    wallRectangles,
    unresolvedWallBoundaries,
    debug: {
      totalVectorObjects: objects.length,
      objectsAfterStrokeFilter: countObjectsAfterStrokeFilter(objects, config),
      objectsAfterLengthFilter: countObjectsAfterLengthFilter(objects, config),
      objectsAfterOrientationFilter: new Set(segmentCandidates.map((candidate) => candidate.sourceObject.id)).size,
      mergedSegments: grouped.length,
      finalWallCandidates: walls.length,
      wallCandidates: walls.length,
      wallRectangles: wallRectangles.length,
      unresolvedWallBoundaries: unresolvedWallBoundaries.length,
      ignoredObjects: Math.max(0, objects.length - new Set(segmentCandidates.map((candidate) => candidate.sourceObject.id)).size)
    }
  };
}

function getObjectSegmentCandidates(
  object: PdfVectorObject,
  config: WallDetectorConfig
): SegmentCandidate[] {
  const dark = isDarkColor(object.strokeColor, config) || isDarkColor(object.fillColor, config);
  const filledWallLike = object.closed && dark && isFilledWallLike(object, config);
  const strokeWallLike = dark && object.strokeWidth >= config.minStrokeWidthPx;

  if (!filledWallLike && !strokeWallLike) return [];
  if (!filledWallLike && object.strokeWidth <= config.maxThinLineWidthPx) return [];

  const segments = object.segments
    .map((segment) => ({
      segment,
      orientation: getOrientation(segment, config.axisAngleToleranceDeg)
    }))
    .filter((item): item is { segment: Segment2; orientation: Exclude<Orientation, "diagonal"> } => (
      item.orientation !== "diagonal" && segmentLength(item.segment) >= config.minSegmentLengthPx
    ));

  if (segments.length === 0 && filledWallLike) {
    const orientation = bboxOrientation(object.bbox);
    const centerline = centerlineFromBbox(object.bbox, orientation);
    return [{
      sourceObject: object,
      segment: centerline,
      orientation,
      strokeWidth: Math.max(object.strokeWidth, Math.min(object.bbox.width, object.bbox.height)),
      confidence: scoreObject(object, orientation, config),
      reasons: scoreObjectReasons(object, orientation, config)
    }];
  }

  return segments.map(({ segment, orientation }) => ({
    sourceObject: object,
    segment,
    orientation,
    strokeWidth: Math.max(object.strokeWidth, filledWallLike ? Math.min(object.bbox.width, object.bbox.height) : 0),
    confidence: scoreObject(object, orientation, config),
    reasons: scoreObjectReasons(object, orientation, config)
  }));
}

function groupSegmentCandidates(
  candidates: SegmentCandidate[],
  config: WallDetectorConfig
): Array<Omit<WallCandidate, "id">> {
  const byOrientation = {
    horizontal: candidates.filter((candidate) => candidate.orientation === "horizontal"),
    vertical: candidates.filter((candidate) => candidate.orientation === "vertical")
  };

  return (["horizontal", "vertical"] as const).flatMap((orientation) => {
    const sourceSegments = byOrientation[orientation];
    const mergedSegments = mergeColinearSegments(
      sourceSegments.map((candidate) => candidate.segment),
      orientation,
      config.colinearAxisTolerancePx,
      config.mergeGapTolerancePx
    );

    return mergedSegments.map((segment) => {
      const overlapping = sourceSegments.filter((candidate) => (
        hasCloseAxis(candidate.segment, segment, orientation, config.colinearAxisTolerancePx) &&
        overlapsOnAxis(candidate.segment, segment, orientation)
      ));
      const strokeWidth = Math.max(...overlapping.map((candidate) => candidate.strokeWidth), 0);
      const confidence = round(average(overlapping.map((candidate) => candidate.confidence)), 2);
      const reasons = averageReasons(overlapping.map((candidate) => candidate.reasons), overlapping.length);

      return {
        type: "wall_candidate" as const,
        confidence,
        source: "vector_path" as const,
        strokeWidth: round(strokeWidth, 3),
        bbox: bboxFromSegments([segment], strokeWidth),
        centerline: segment,
        orientation,
        vectorObjectIds: Array.from(new Set(overlapping.map((candidate) => candidate.sourceObject.id))),
        reasons,
        length: round(segmentLength(segment), 3),
        realWorldLength: round(segmentLength(segment) * config.drawingScale, 3)
      };
    });
  });
}

export function detectLineweightWallCandidates(
  page: number,
  isVectorPdf: boolean,
  objects: PdfVectorObject[],
  config: WallDetectorConfig = DEFAULT_WALL_DETECTOR_CONFIG
): WallDetectionResult {
  const afterStroke = objects.filter((object) => isTargetLineweightObject(object, config));
  const afterLength = afterStroke.filter((object) => (
    object.segments.some((segment) => segmentLength(segment) >= config.minSegmentLengthPx)
  ));
  const segmentCandidates = afterLength.flatMap((object) => (
    object.segments
      .map((segment) => {
        const orientation = getOrientation(segment, config.axisAngleToleranceDeg);
        return {
          sourceObject: object,
          segment,
          orientation,
          strokeWidth: object.strokeWidth,
          confidence: 0.95,
          reasons: {
            strokeWidthScore: 1,
            lengthScore: Math.min(1, round(segmentLength(segment) / (config.minSegmentLengthPx * 2), 2)),
            orientationScore: orientation === "diagonal" ? 0 : 1,
            colorScore: isDarkColor(object.strokeColor, config) || isDarkColor(object.fillColor, config) ? 1 : 0,
            mergeScore: 0
          }
        };
      })
      .filter((candidate): candidate is SegmentCandidate => (
        candidate.orientation !== "diagonal" &&
        segmentLength(candidate.segment) >= config.minSegmentLengthPx
      ))
  ));
  const grouped = groupSegmentCandidates(segmentCandidates, config);
  const walls = grouped.map((wall, index) => ({
    ...wall,
    id: `wall_${String(index + 1).padStart(3, "0")}`
  }));
  const wallRectangles = buildWallRectangles(walls, config, objects);
  const unresolvedWallBoundaries = findUnresolvedWallBoundaries(walls, wallRectangles, config);

  return {
    page,
    isVectorPdf,
    scale: null,
    walls,
    wallRectangles,
    unresolvedWallBoundaries,
    debug: {
      totalVectorObjects: objects.length,
      objectsAfterStrokeFilter: afterStroke.length,
      objectsAfterLengthFilter: afterLength.length,
      objectsAfterOrientationFilter: new Set(segmentCandidates.map((candidate) => candidate.sourceObject.id)).size,
      mergedSegments: grouped.length,
      finalWallCandidates: walls.length,
      wallCandidates: walls.length,
      wallRectangles: wallRectangles.length,
      unresolvedWallBoundaries: unresolvedWallBoundaries.length,
      ignoredObjects: Math.max(0, objects.length - afterStroke.length)
    }
  };
}

export function detectSampledWallCandidates(
  page: number,
  isVectorPdf: boolean,
  objects: PdfVectorObject[],
  sampleObjectId: string,
  config: WallDetectorConfig = DEFAULT_WALL_DETECTOR_CONFIG
): WallDetectionResult {
  const sample = objects.find((object) => object.id === sampleObjectId);
  if (!sample) {
    return detectLineweightWallCandidates(page, isVectorPdf, objects, config);
  }

  const afterStroke = objects.filter((object) => isSampleLikeObject(object, sample, config));
  const afterLength = afterStroke.filter((object) => (
    object.segments.some((segment) => segmentLength(segment) >= config.minSegmentLengthPx)
  ));
  const segmentCandidates = afterLength.flatMap((object) => (
    object.segments
      .map((segment) => {
        const orientation = getOrientation(segment, config.axisAngleToleranceDeg);
        return {
          sourceObject: object,
          segment,
          orientation,
          strokeWidth: object.strokeWidth,
          confidence: 0.98,
          reasons: {
            strokeWidthScore: 1,
            lengthScore: Math.min(1, round(segmentLength(segment) / (config.minSegmentLengthPx * 2), 2)),
            orientationScore: orientation === "diagonal" ? 0 : 1,
            colorScore: colorDistance(getObjectColor(object), getObjectColor(sample)) <= config.sampledColorTolerance ? 1 : 0,
            mergeScore: 0
          }
        };
      })
      .filter((candidate): candidate is SegmentCandidate => (
        candidate.orientation !== "diagonal" &&
        segmentLength(candidate.segment) >= config.minSegmentLengthPx
      ))
  ));
  const grouped = groupSegmentCandidates(segmentCandidates, config);
  const walls = grouped.map((wall, index) => ({
    ...wall,
    id: `wall_${String(index + 1).padStart(3, "0")}`
  }));
  const wallRectangles = buildWallRectangles(walls, config, objects);
  const unresolvedWallBoundaries = findUnresolvedWallBoundaries(walls, wallRectangles, config);

  return {
    page,
    isVectorPdf,
    scale: null,
    walls,
    wallRectangles,
    unresolvedWallBoundaries,
    debug: {
      totalVectorObjects: objects.length,
      objectsAfterStrokeFilter: afterStroke.length,
      objectsAfterLengthFilter: afterLength.length,
      objectsAfterOrientationFilter: new Set(segmentCandidates.map((candidate) => candidate.sourceObject.id)).size,
      mergedSegments: grouped.length,
      finalWallCandidates: walls.length,
      wallCandidates: walls.length,
      wallRectangles: wallRectangles.length,
      unresolvedWallBoundaries: unresolvedWallBoundaries.length,
      ignoredObjects: Math.max(0, objects.length - afterStroke.length)
    }
  };
}

function buildWallRectangles(
  walls: WallCandidate[],
  config: WallDetectorConfig,
  objects: PdfVectorObject[]
): WallRectangle[] {
  const lineRectangles = (["horizontal", "vertical"] as const).flatMap((orientation) => (
    buildWallRectanglesForOrientation(
      walls.filter((wall) => wall.orientation === orientation),
      orientation,
      config
    )
  ));
  const fillRectangles = buildFilledWallRectangles(objects, config);
  const rectangles = mergeAdjacentWallRectangles(
    dedupeWallRectangles([...lineRectangles, ...fillRectangles], config),
    config
  );
  const snappedRectangles = snapRectanglesToPerpendicularBoundaries(rectangles, walls, config);
  const completedRectangles = completeMissingBoundaryRectangles(walls, snappedRectangles, config);

  return completedRectangles.map((rectangle, index) => ({
    ...rectangle,
    id: `wall_rect_${String(index + 1).padStart(3, "0")}`
  }));
}

function completeMissingBoundaryRectangles(
  walls: WallCandidate[],
  rectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  let result = rectangles;
  const unresolved = walls.filter((wall) => !isWallBoundaryUsedByDraft(wall, result, config));
  const additions: Array<Omit<WallRectangle, "id">> = [];

  for (const wall of unresolved) {
    const candidates = buildTargetedRectanglesForBoundary(wall, walls, result, config);
    const selected = candidates
      .filter((candidate) => !isWallBoundaryUsedByDraft(wall, [...result, ...additions], config) || isWallBoundaryUsedByDraft(wall, [candidate], config))
      .sort((left, right) => rectangleCoverageScore(wall, right, config) - rectangleCoverageScore(wall, left, config));

    for (const candidate of selected.slice(0, config.maxWallRectanglesPerBoundary)) {
      if (isWallBoundaryUsedByDraft(wall, [...result, ...additions], config)) break;
      additions.push(candidate);
    }
  }

  if (additions.length === 0) return result;
  return [...result, ...additions];
}

function buildTargetedRectanglesForBoundary(
  wall: WallCandidate,
  walls: WallCandidate[],
  existingRectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  const sorted = walls
    .filter((candidate) => candidate.orientation === wall.orientation)
    .sort((left, right) => wallAxis(left, wall.orientation) - wallAxis(right, wall.orientation));
  const wallIndex = sorted.findIndex((candidate) => candidate.id === wall.id);
  if (wallIndex < 0) return [];

  const candidates: Array<Omit<WallRectangle, "id">> = [];
  for (let index = 0; index < sorted.length; index += 1) {
    if (index === wallIndex) continue;
    const other = sorted[index];
    const thickness = Math.abs(wallAxis(other, wall.orientation) - wallAxis(wall, wall.orientation));
    if (thickness < config.minWallRectangleThicknessPx || thickness > config.maxWallRectangleThicknessPx) continue;

    const overlap = overlapInterval(wall.centerline, other.centerline, wall.orientation, config.rectangleAxisTolerancePx);
    if (!overlap) continue;

    const fromIndex = Math.min(wallIndex, index);
    const toIndex = Math.max(wallIndex, index);
    const snapped = snapTJoinOverlap(wall.centerline, other.centerline, wall.orientation, overlap, config);
    const parts = splitOverlapAroundInteriorParallelBoundaries(
      sorted,
      fromIndex,
      toIndex,
      snapped,
      wall.orientation,
      config.rectangleAxisTolerancePx
    );

    for (const part of parts) {
      if (part.to - part.from < config.minWallRectangleLengthPx) continue;
      const rectangle = createWallRectangle(wall, other, wall.orientation, part.from, part.to, thickness);
      if (isDuplicateTargetRectangle(rectangle, existingRectangles, config)) continue;
      candidates.push(rectangle);
    }
  }

  return candidates;
}

function isWallBoundaryUsedByDraft(
  wall: WallCandidate,
  rectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): boolean {
  return rectangles.some((rectangle) => (
    rectangle.boundaryWallIds.includes(wall.id) ||
    segmentOnRectangleBoundary(wall.centerline, wall.orientation, rectangle.bbox, config.rectangleAxisTolerancePx) ||
    segmentInsideRectangle(wall.centerline, rectangle.bbox, config.tJoinSnapTolerancePx)
  ));
}

function isDuplicateTargetRectangle(
  rectangle: Omit<WallRectangle, "id">,
  existingRectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): boolean {
  return existingRectangles.some((existing) => (
    existing.orientation === rectangle.orientation &&
    bboxOverlapRatio(existing.bbox, rectangle.bbox) > 0.82 &&
    Math.abs(existing.thickness - rectangle.thickness) <= config.tJoinSnapTolerancePx
  ));
}

function rectangleCoverageScore(
  wall: WallCandidate,
  rectangle: Omit<WallRectangle, "id">,
  config: WallDetectorConfig
): number {
  const boundaryScore = rectangle.boundaryWallIds.includes(wall.id) ? 10 : 0;
  const boundaryCoverage = segmentOnRectangleBoundary(wall.centerline, wall.orientation, rectangle.bbox, config.rectangleAxisTolerancePx) ? 5 : 0;
  const thicknessScore = 1 / (1 + rectangle.thickness / Math.max(config.maxWallRectangleThicknessPx, 1));
  return boundaryScore + boundaryCoverage + thicknessScore;
}

function findUnresolvedWallBoundaries(
  walls: WallCandidate[],
  rectangles: WallRectangle[],
  config: WallDetectorConfig
): UnresolvedWallBoundary[] {
  return walls
    .filter((wall) => !isWallBoundaryUsed(wall, rectangles, config))
    .map((wall) => ({
      boundaryId: wall.id,
      reason: getUnresolvedBoundaryReason(wall, rectangles, config),
      wall
    }));
}

function isWallBoundaryUsed(
  wall: WallCandidate,
  rectangles: WallRectangle[],
  config: WallDetectorConfig
): boolean {
  return rectangles.some((rectangle) => (
    rectangle.boundaryWallIds.includes(wall.id) ||
    segmentOnRectangleBoundary(wall.centerline, wall.orientation, rectangle.bbox, config.rectangleAxisTolerancePx) ||
    segmentInsideRectangle(wall.centerline, rectangle.bbox, config.tJoinSnapTolerancePx)
  ));
}

function getUnresolvedBoundaryReason(
  wall: WallCandidate,
  rectangles: WallRectangle[],
  config: WallDetectorConfig
): UnresolvedWallBoundary["reason"] {
  if (wall.length < config.minWallRectangleLengthPx) return "too_short";
  if (rectangles.some((rectangle) => segmentInsideRectangle(wall.centerline, rectangle.bbox, config.tJoinSnapTolerancePx))) {
    return "inside_fill_wall";
  }
  return "missing_parallel_boundary";
}

function segmentOnRectangleBoundary(
  segment: Segment2,
  orientation: Exclude<Orientation, "diagonal">,
  bbox: BBox,
  tolerance: number
): boolean {
  const interval = wallInterval(segment, orientation);
  if (orientation === "horizontal") {
    const axis = (segment.start.y + segment.end.y) / 2;
    const onTopOrBottom = Math.abs(axis - bbox.y) <= tolerance || Math.abs(axis - (bbox.y + bbox.height)) <= tolerance;
    const overlap = intervalOverlapRatio(interval.from, interval.to, bbox.x, bbox.x + bbox.width);
    return onTopOrBottom && overlap >= 0.75;
  }

  const axis = (segment.start.x + segment.end.x) / 2;
  const onLeftOrRight = Math.abs(axis - bbox.x) <= tolerance || Math.abs(axis - (bbox.x + bbox.width)) <= tolerance;
  const overlap = intervalOverlapRatio(interval.from, interval.to, bbox.y, bbox.y + bbox.height);
  return onLeftOrRight && overlap >= 0.75;
}

function segmentInsideRectangle(segment: Segment2, bbox: BBox, tolerance: number): boolean {
  const points = [segment.start, segment.end];
  return points.every((point) => (
    point.x >= bbox.x - tolerance &&
    point.x <= bbox.x + bbox.width + tolerance &&
    point.y >= bbox.y - tolerance &&
    point.y <= bbox.y + bbox.height + tolerance
  ));
}

function buildFilledWallRectangles(
  objects: PdfVectorObject[],
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  return objects
    .filter((object) => object.paintOperation === "fill" || object.paintOperation === "fill_stroke")
    .filter((object) => object.closed)
    .flatMap((object): Array<Omit<WallRectangle, "id">> => {
      const thickness = Math.min(object.bbox.width, object.bbox.height);
      const length = Math.max(object.bbox.width, object.bbox.height);
      if (thickness < config.minWallRectangleThicknessPx || thickness > config.maxWallRectangleThicknessPx) return [];
      if (length < config.minWallRectangleLengthPx) return [];
      if (length / Math.max(thickness, 1) < config.minWallRectangleAspectRatio) return [];

      const orientation = bboxOrientation(object.bbox);
      const polygon = [
        { x: object.bbox.x, y: object.bbox.y },
        { x: object.bbox.x + object.bbox.width, y: object.bbox.y },
        { x: object.bbox.x + object.bbox.width, y: object.bbox.y + object.bbox.height },
        { x: object.bbox.x, y: object.bbox.y + object.bbox.height }
      ] as WallRectangle["polygon"];

      return [{
        type: "wall_rectangle" as const,
        orientation,
        bbox: object.bbox,
        polygon,
        boundaryWallIds: [object.id, object.id] as [string, string],
        thickness: round(thickness, 3),
        length: round(length, 3),
        autoClosedEdges: []
      }];
    });
}

function dedupeWallRectangles(
  rectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  const result: Array<Omit<WallRectangle, "id">> = [];

  for (const rectangle of rectangles.sort((left, right) => rectangleArea(right) - rectangleArea(left))) {
    const duplicate = result.some((existing) => (
      existing.orientation === rectangle.orientation &&
      bboxOverlapRatio(existing.bbox, rectangle.bbox) > 0.82 &&
      Math.abs(existing.thickness - rectangle.thickness) <= config.tJoinSnapTolerancePx
    ));
    if (!duplicate) result.push(rectangle);
  }

  return result;
}

function mergeAdjacentWallRectangles(
  rectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  let result = rectangles;
  let changed = true;

  while (changed) {
    changed = false;
    const next: Array<Omit<WallRectangle, "id">> = [];
    const used = new Set<number>();

    for (let index = 0; index < result.length; index += 1) {
      if (used.has(index)) continue;
      let current = result[index];

      for (let otherIndex = index + 1; otherIndex < result.length; otherIndex += 1) {
        if (used.has(otherIndex)) continue;
        const merged = tryMergeAdjacentWallRectangles(current, result[otherIndex], config);
        if (!merged) continue;

        current = merged;
        used.add(otherIndex);
        changed = true;
      }

      used.add(index);
      next.push(current);
    }

    result = next;
  }

  return result;
}

function tryMergeAdjacentWallRectangles(
  first: Omit<WallRectangle, "id">,
  second: Omit<WallRectangle, "id">,
  config: WallDetectorConfig
): Omit<WallRectangle, "id"> | null {
  if (first.orientation !== second.orientation) return null;

  if (first.orientation === "horizontal") {
    const crossOverlap = intervalOverlapRatio(
      first.bbox.y,
      first.bbox.y + first.bbox.height,
      second.bbox.y,
      second.bbox.y + second.bbox.height
    );
    const lengthGap = intervalGap(
      first.bbox.x,
      first.bbox.x + first.bbox.width,
      second.bbox.x,
      second.bbox.x + second.bbox.width
    );
    if (crossOverlap >= 0.92 && lengthGap <= config.mergeGapTolerancePx) {
      return rectangleFromAxes(
        first,
        Math.min(first.bbox.x, second.bbox.x),
        Math.max(first.bbox.x + first.bbox.width, second.bbox.x + second.bbox.width),
        Math.max(first.bbox.y, second.bbox.y),
        Math.min(first.bbox.y + first.bbox.height, second.bbox.y + second.bbox.height)
      );
    }

    const overlap = intervalOverlapRatio(
      first.bbox.x,
      first.bbox.x + first.bbox.width,
      second.bbox.x,
      second.bbox.x + second.bbox.width
    );
    const longOverlap = intervalOverlapOverLonger(
      first.bbox.x,
      first.bbox.x + first.bbox.width,
      second.bbox.x,
      second.bbox.x + second.bbox.width
    );
    const gap = intervalGap(
      first.bbox.y,
      first.bbox.y + first.bbox.height,
      second.bbox.y,
      second.bbox.y + second.bbox.height
    );
    const thickness = Math.max(first.bbox.y + first.bbox.height, second.bbox.y + second.bbox.height) -
      Math.min(first.bbox.y, second.bbox.y);
    if (overlap < 0.92 || longOverlap < 0.88 || gap > config.rectangleAxisTolerancePx || thickness > config.maxWallRectangleThicknessPx) return null;
    return rectangleFromAxes(
      first,
      Math.max(first.bbox.x, second.bbox.x),
      Math.min(first.bbox.x + first.bbox.width, second.bbox.x + second.bbox.width),
      Math.min(first.bbox.y, second.bbox.y),
      Math.max(first.bbox.y + first.bbox.height, second.bbox.y + second.bbox.height)
    );
  }

  const crossOverlap = intervalOverlapRatio(
    first.bbox.x,
    first.bbox.x + first.bbox.width,
    second.bbox.x,
    second.bbox.x + second.bbox.width
  );
  const lengthGap = intervalGap(
    first.bbox.y,
    first.bbox.y + first.bbox.height,
    second.bbox.y,
    second.bbox.y + second.bbox.height
  );
  if (crossOverlap >= 0.92 && lengthGap <= config.mergeGapTolerancePx) {
    return rectangleFromAxes(
      first,
      Math.max(first.bbox.x, second.bbox.x),
      Math.min(first.bbox.x + first.bbox.width, second.bbox.x + second.bbox.width),
      Math.min(first.bbox.y, second.bbox.y),
      Math.max(first.bbox.y + first.bbox.height, second.bbox.y + second.bbox.height)
    );
  }

  const overlap = intervalOverlapRatio(
    first.bbox.y,
    first.bbox.y + first.bbox.height,
    second.bbox.y,
    second.bbox.y + second.bbox.height
  );
  const longOverlap = intervalOverlapOverLonger(
    first.bbox.y,
    first.bbox.y + first.bbox.height,
    second.bbox.y,
    second.bbox.y + second.bbox.height
  );
  const gap = intervalGap(
    first.bbox.x,
    first.bbox.x + first.bbox.width,
    second.bbox.x,
    second.bbox.x + second.bbox.width
  );
  const thickness = Math.max(first.bbox.x + first.bbox.width, second.bbox.x + second.bbox.width) -
    Math.min(first.bbox.x, second.bbox.x);
  if (overlap < 0.92 || longOverlap < 0.88 || gap > config.rectangleAxisTolerancePx || thickness > config.maxWallRectangleThicknessPx) return null;
  return rectangleFromAxes(
    first,
    Math.min(first.bbox.x, second.bbox.x),
    Math.max(first.bbox.x + first.bbox.width, second.bbox.x + second.bbox.width),
    Math.max(first.bbox.y, second.bbox.y),
    Math.min(first.bbox.y + first.bbox.height, second.bbox.y + second.bbox.height)
  );
}

function intervalOverlapRatio(firstFrom: number, firstTo: number, secondFrom: number, secondTo: number): number {
  const overlap = Math.max(0, Math.min(firstTo, secondTo) - Math.max(firstFrom, secondFrom));
  const smaller = Math.min(firstTo - firstFrom, secondTo - secondFrom);
  return smaller > 0 ? overlap / smaller : 0;
}

function intervalOverlapOverLonger(firstFrom: number, firstTo: number, secondFrom: number, secondTo: number): number {
  const overlap = Math.max(0, Math.min(firstTo, secondTo) - Math.max(firstFrom, secondFrom));
  const longer = Math.max(firstTo - firstFrom, secondTo - secondFrom);
  return longer > 0 ? overlap / longer : 0;
}

function intervalGap(firstFrom: number, firstTo: number, secondFrom: number, secondTo: number): number {
  if (firstTo < secondFrom) return secondFrom - firstTo;
  if (secondTo < firstFrom) return firstFrom - secondTo;
  return 0;
}

function snapRectanglesToPerpendicularBoundaries(
  rectangles: Array<Omit<WallRectangle, "id">>,
  walls: WallCandidate[],
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  const horizontalWalls = walls.filter((wall) => wall.orientation === "horizontal");
  const verticalWalls = walls.filter((wall) => wall.orientation === "vertical");

  return rectangles.map((rectangle) => {
    if (rectangle.orientation === "horizontal") {
      const yFrom = rectangle.bbox.y;
      const yTo = rectangle.bbox.y + rectangle.bbox.height;
      const xFrom = snapRectangleEndToWalls(rectangle.bbox.x, yFrom, yTo, verticalWalls, "vertical", config);
      const xTo = snapRectangleEndToWalls(rectangle.bbox.x + rectangle.bbox.width, yFrom, yTo, verticalWalls, "vertical", config);
      return rectangleFromAxes(rectangle, xFrom, xTo, yFrom, yTo);
    }

    const xFrom = rectangle.bbox.x;
    const xTo = rectangle.bbox.x + rectangle.bbox.width;
    const yFrom = snapRectangleEndToWalls(rectangle.bbox.y, xFrom, xTo, horizontalWalls, "horizontal", config);
    const yTo = snapRectangleEndToWalls(rectangle.bbox.y + rectangle.bbox.height, xFrom, xTo, horizontalWalls, "horizontal", config);
    return rectangleFromAxes(rectangle, xFrom, xTo, yFrom, yTo);
  }).filter((rectangle) => (
    rectangle.length >= config.minWallRectangleLengthPx &&
    rectangle.length / Math.max(rectangle.thickness, 1) >= config.minWallRectangleAspectRatio
  ));
}

function snapRectangleEndToWalls(
  value: number,
  crossFrom: number,
  crossTo: number,
  perpendicularWalls: WallCandidate[],
  perpendicularOrientation: Exclude<Orientation, "diagonal">,
  config: WallDetectorConfig
): number {
  let best: { distance: number; axis: number } | null = null;

  for (const wall of perpendicularWalls) {
    const axis = wallAxis(wall, perpendicularOrientation);
    const distance = Math.abs(axis - value);
    if (distance > config.tJoinSnapTolerancePx) continue;

    const interval = wallInterval(wall.centerline, perpendicularOrientation);
    if (interval.to < crossFrom - config.rectangleAxisTolerancePx || interval.from > crossTo + config.rectangleAxisTolerancePx) {
      continue;
    }

    if (!best || distance < best.distance) best = { distance, axis };
  }

  return best ? round(best.axis, 3) : value;
}

function buildWallRectanglesForOrientation(
  walls: WallCandidate[],
  orientation: Exclude<Orientation, "diagonal">,
  config: WallDetectorConfig
): Omit<WallRectangle, "id">[] {
  const sorted = walls.slice().sort((left, right) => wallAxis(left, orientation) - wallAxis(right, orientation));
  const rectangles: Omit<WallRectangle, "id">[] = [];
  const usedPairs = new Set<string>();
  const boundaryUseCount = new Map<string, number>();

  for (let index = 0; index < sorted.length; index += 1) {
    const first = sorted[index];
    const firstAxis = wallAxis(first, orientation);
    const matches: Array<{ wall: WallCandidate; thickness: number; overlapFrom: number; overlapTo: number; score: number }> = [];

    for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
      const second = sorted[nextIndex];
      const secondAxis = wallAxis(second, orientation);
      const thickness = secondAxis - firstAxis;
      if (thickness > config.maxWallRectangleThicknessPx) break;
      if (thickness < config.minWallRectangleThicknessPx) continue;

      const overlap = overlapInterval(first.centerline, second.centerline, orientation, config.rectangleAxisTolerancePx);
      if (!overlap) continue;
      const snapped = snapTJoinOverlap(first.centerline, second.centerline, orientation, overlap, config);
      const overlapParts = splitOverlapAroundInteriorParallelBoundaries(
        sorted,
        index,
        nextIndex,
        snapped,
        orientation,
        config.rectangleAxisTolerancePx
      );

      for (const part of overlapParts) {
        if (part.to - part.from < config.minWallRectangleLengthPx) continue;
        matches.push({
          wall: second,
          thickness,
          overlapFrom: part.from,
          overlapTo: part.to,
          score: wallPairScore(first, second, thickness, part.to - part.from, config)
        });
      }
    }

    for (const match of matches.sort((left, right) => right.score - left.score)) {
      if ((boundaryUseCount.get(first.id) ?? 0) >= config.maxWallRectanglesPerBoundary) break;
      if ((boundaryUseCount.get(match.wall.id) ?? 0) >= config.maxWallRectanglesPerBoundary) continue;

      const pairKey = `${[first.id, match.wall.id].sort().join("|")}:${round(match.overlapFrom, 1)}:${round(match.overlapTo, 1)}`;
      if (usedPairs.has(pairKey)) continue;
      usedPairs.add(pairKey);
      boundaryUseCount.set(first.id, (boundaryUseCount.get(first.id) ?? 0) + 1);
      boundaryUseCount.set(match.wall.id, (boundaryUseCount.get(match.wall.id) ?? 0) + 1);
      rectangles.push(createWallRectangle(first, match.wall, orientation, match.overlapFrom, match.overlapTo, match.thickness));
    }
  }

  return resolveOrthogonalJoins(rectangles, config);
}

function snapTJoinOverlap(
  first: Segment2,
  second: Segment2,
  orientation: Exclude<Orientation, "diagonal">,
  overlap: { from: number; to: number },
  config: WallDetectorConfig
): { from: number; to: number } {
  const firstInterval = wallInterval(first, orientation);
  const secondInterval = wallInterval(second, orientation);
  const from = snapOverlapEdge(overlap.from, firstInterval, secondInterval, config.tJoinSnapTolerancePx);
  const to = snapOverlapEdge(overlap.to, firstInterval, secondInterval, config.tJoinSnapTolerancePx);
  return { from: round(Math.min(from, to), 3), to: round(Math.max(from, to), 3) };
}

function snapOverlapEdge(
  value: number,
  first: { from: number; to: number },
  second: { from: number; to: number },
  tolerance: number
): number {
  const endpoints = [first.from, first.to, second.from, second.to];
  const close = endpoints.filter((endpoint) => Math.abs(endpoint - value) <= tolerance);
  if (close.length === 0) return value;
  return close.reduce((sum, item) => sum + item, 0) / close.length;
}

function wallPairScore(
  first: WallCandidate,
  second: WallCandidate,
  thickness: number,
  length: number,
  config: WallDetectorConfig
): number {
  const targetThickness = Math.max(first.strokeWidth, second.strokeWidth) * 350;
  const thicknessScore = targetThickness > 0
    ? 1 / (1 + Math.abs(thickness - targetThickness) / targetThickness)
    : 0.5;
  const lengthScore = Math.min(2, length / Math.max(config.minWallRectangleLengthPx, 1));
  return round(thicknessScore + lengthScore, 3);
}

function resolveOrthogonalJoins(
  rectangles: Array<Omit<WallRectangle, "id">>,
  config: WallDetectorConfig
): Array<Omit<WallRectangle, "id">> {
  let result = rectangles;

  for (let pass = 0; pass < 2; pass += 1) {
    result = result.map((rectangle, index) => {
      let current = rectangle;

      for (let otherIndex = 0; otherIndex < result.length; otherIndex += 1) {
        if (otherIndex === index) continue;
        const other = result[otherIndex];
        if (current.orientation === other.orientation) continue;
        if (!rectanglesOverlapOrNearlyTouch(current.bbox, other.bbox, config.tJoinSnapTolerancePx)) continue;
        if (!rectangleHasPriority(other, current, config)) continue;

        const trimmed = trimRectangleToPriority(current, other, config);
        if (!trimmed) return current;
        current = trimmed;
      }

      return current;
    });
  }

  return result.filter((rectangle) => (
    rectangle.length >= config.minWallRectangleLengthPx &&
    rectangle.length / Math.max(rectangle.thickness, 1) >= config.minWallRectangleAspectRatio
  ));
}

function rectangleHasPriority(
  candidate: Omit<WallRectangle, "id">,
  current: Omit<WallRectangle, "id">,
  config: WallDetectorConfig
): boolean {
  if (candidate.thickness >= current.thickness * config.cornerPriorityThicknessRatio) return true;
  if (current.thickness >= candidate.thickness * config.cornerPriorityThicknessRatio) return false;
  return candidate.length >= current.length;
}

function trimRectangleToPriority(
  rectangle: Omit<WallRectangle, "id">,
  priority: Omit<WallRectangle, "id">,
  config: WallDetectorConfig
): Omit<WallRectangle, "id"> | null {
  const rectCenter = bboxCenterLocal(rectangle.bbox);
  const priorityCenter = bboxCenterLocal(priority.bbox);

  if (rectangle.orientation === "horizontal") {
    let from = rectangle.bbox.x;
    let to = rectangle.bbox.x + rectangle.bbox.width;
    if (rectCenter.x <= priorityCenter.x) {
      to = priority.bbox.x;
    } else {
      from = priority.bbox.x + priority.bbox.width;
    }
    if (to - from < config.minWallRectangleLengthPx) return null;
    return rectangleFromAxes(rectangle, from, to, rectangle.bbox.y, rectangle.bbox.y + rectangle.bbox.height);
  }

  let from = rectangle.bbox.y;
  let to = rectangle.bbox.y + rectangle.bbox.height;
  if (rectCenter.y <= priorityCenter.y) {
    to = priority.bbox.y;
  } else {
    from = priority.bbox.y + priority.bbox.height;
  }
  if (to - from < config.minWallRectangleLengthPx) return null;
  return rectangleFromAxes(rectangle, rectangle.bbox.x, rectangle.bbox.x + rectangle.bbox.width, from, to);
}

function rectangleFromAxes(
  source: Omit<WallRectangle, "id">,
  x1: number,
  x2: number,
  y1: number,
  y2: number
): Omit<WallRectangle, "id"> {
  const left = round(Math.min(x1, x2), 3);
  const right = round(Math.max(x1, x2), 3);
  const top = round(Math.min(y1, y2), 3);
  const bottom = round(Math.max(y1, y2), 3);
  const polygon = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ] as WallRectangle["polygon"];
  const width = round(right - left, 3);
  const height = round(bottom - top, 3);

  return {
    ...source,
    bbox: { x: left, y: top, width, height },
    polygon,
    length: source.orientation === "horizontal" ? width : height,
    thickness: source.orientation === "horizontal" ? height : width,
    autoClosedEdges: source.orientation === "horizontal"
      ? [
        { start: polygon[0], end: polygon[3] },
        { start: polygon[1], end: polygon[2] }
      ]
      : [
        { start: polygon[0], end: polygon[1] },
        { start: polygon[3], end: polygon[2] }
      ]
  };
}

function rectanglesOverlapOrNearlyTouch(first: BBox, second: BBox, tolerance: number): boolean {
  return (
    first.x <= second.x + second.width + tolerance &&
    first.x + first.width >= second.x - tolerance &&
    first.y <= second.y + second.height + tolerance &&
    first.y + first.height >= second.y - tolerance
  );
}

function rectangleArea(rectangle: Omit<WallRectangle, "id">): number {
  return rectangle.bbox.width * rectangle.bbox.height;
}

function bboxOverlapRatio(first: BBox, second: BBox): number {
  const x1 = Math.max(first.x, second.x);
  const y1 = Math.max(first.y, second.y);
  const x2 = Math.min(first.x + first.width, second.x + second.width);
  const y2 = Math.min(first.y + first.height, second.y + second.height);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smaller = Math.min(first.width * first.height, second.width * second.height);
  return smaller > 0 ? overlap / smaller : 0;
}

function bboxCenterLocal(bbox: BBox): { x: number; y: number } {
  return {
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  };
}

function rectanglesTouchAtCorner(
  first: Omit<WallRectangle, "id">,
  second: Omit<WallRectangle, "id">,
  tolerance: number
): boolean {
  const firstCorners = first.polygon;
  const secondCorners = second.polygon;
  return firstCorners.some((firstCorner) => (
    secondCorners.some((secondCorner) => (
      Math.abs(firstCorner.x - secondCorner.x) <= tolerance &&
      Math.abs(firstCorner.y - secondCorner.y) <= tolerance
    ))
  ));
}

function createWallRectangle(
  first: WallCandidate,
  second: WallCandidate,
  orientation: Exclude<Orientation, "diagonal">,
  overlapFrom: number,
  overlapTo: number,
  thickness: number
): Omit<WallRectangle, "id"> {
  const firstAxis = wallAxis(first, orientation);
  const secondAxis = wallAxis(second, orientation);
  const minAxis = Math.min(firstAxis, secondAxis);
  const maxAxis = Math.max(firstAxis, secondAxis);
  const length = overlapTo - overlapFrom;

  const polygon = orientation === "horizontal"
    ? [
      { x: overlapFrom, y: minAxis },
      { x: overlapTo, y: minAxis },
      { x: overlapTo, y: maxAxis },
      { x: overlapFrom, y: maxAxis }
    ] as WallRectangle["polygon"]
    : [
      { x: minAxis, y: overlapFrom },
      { x: maxAxis, y: overlapFrom },
      { x: maxAxis, y: overlapTo },
      { x: minAxis, y: overlapTo }
    ] as WallRectangle["polygon"];

  return {
    type: "wall_rectangle",
    orientation,
    bbox: {
      x: polygon[0].x,
      y: polygon[0].y,
      width: orientation === "horizontal" ? length : thickness,
      height: orientation === "horizontal" ? thickness : length
    },
    polygon,
    boundaryWallIds: [first.id, second.id],
    thickness: round(thickness, 3),
    length: round(length, 3),
    autoClosedEdges: [
      { start: polygon[0], end: polygon[3] },
      { start: polygon[1], end: polygon[2] }
    ]
  };
}

function splitOverlapAroundInteriorParallelBoundaries(
  sortedWalls: WallCandidate[],
  fromIndex: number,
  toIndex: number,
  overlap: { from: number; to: number },
  orientation: Exclude<Orientation, "diagonal">,
  tolerance: number
): Array<{ from: number; to: number }> {
  let ranges = [overlap];

  for (let index = fromIndex + 1; index < toIndex; index += 1) {
    const wall = sortedWalls[index];
    const interval = wallInterval(wall.centerline, orientation);
    const blockFrom = Math.max(overlap.from, interval.from);
    const blockTo = Math.min(overlap.to, interval.to);
    if (blockTo - blockFrom <= tolerance) continue;

    ranges = ranges.flatMap((range) => subtractInterval(range, blockFrom, blockTo, tolerance));
  }

  return ranges
    .filter((range) => range.to - range.from > tolerance)
    .map((range) => ({ from: round(range.from, 3), to: round(range.to, 3) }));
}

function subtractInterval(
  range: { from: number; to: number },
  blockFrom: number,
  blockTo: number,
  tolerance: number
): Array<{ from: number; to: number }> {
  if (blockTo <= range.from + tolerance || blockFrom >= range.to - tolerance) return [range];

  const result: Array<{ from: number; to: number }> = [];
  if (blockFrom - range.from > tolerance) result.push({ from: range.from, to: Math.min(blockFrom, range.to) });
  if (range.to - blockTo > tolerance) result.push({ from: Math.max(blockTo, range.from), to: range.to });
  return result;
}

function overlapInterval(
  first: Segment2,
  second: Segment2,
  orientation: Exclude<Orientation, "diagonal">,
  tolerance: number
): { from: number; to: number } | null {
  const left = wallInterval(first, orientation);
  const right = wallInterval(second, orientation);
  const from = Math.max(left.from, right.from);
  const to = Math.min(left.to, right.to);
  if (to + tolerance < from) return null;
  return { from: round(from, 3), to: round(to, 3) };
}

function wallInterval(segment: Segment2, orientation: Exclude<Orientation, "diagonal">): { from: number; to: number } {
  const values = orientation === "horizontal"
    ? [segment.start.x, segment.end.x]
    : [segment.start.y, segment.end.y];
  return { from: Math.min(...values), to: Math.max(...values) };
}

function wallAxis(wall: WallCandidate, orientation: Exclude<Orientation, "diagonal">): number {
  return orientation === "horizontal"
    ? (wall.centerline.start.y + wall.centerline.end.y) / 2
    : (wall.centerline.start.x + wall.centerline.end.x) / 2;
}

function isTargetLineweightObject(object: PdfVectorObject, config: WallDetectorConfig): boolean {
  const isLineGeometry = object.kind === "line" || object.kind === "polyline";
  const isStrokePainted = object.paintOperation === "stroke" || object.paintOperation === "fill_stroke";
  const centerX = object.bbox.x + object.bbox.width / 2;
  const withinRegion = Number.isFinite(config.floorplanMaxX) ? centerX <= config.floorplanMaxX : true;
  return (
    isLineGeometry &&
    isStrokePainted &&
    withinRegion &&
    Math.abs(object.strokeWidth - config.targetLineweightStrokeWidthPx) <= config.lineweightTolerancePx
  );
}

function isSampleLikeObject(
  object: PdfVectorObject,
  sample: PdfVectorObject,
  config: WallDetectorConfig
): boolean {
  const isLineGeometry = object.kind === "line" || object.kind === "polyline";
  const isStrokePainted = object.paintOperation === "stroke" || object.paintOperation === "fill_stroke";
  const sampleColor = getObjectColor(sample);
  const objectColor = getObjectColor(object);

  return (
    isLineGeometry &&
    isStrokePainted &&
    Math.abs(object.strokeWidth - sample.strokeWidth) <= config.sampledStrokeWidthTolerancePx &&
    colorDistance(objectColor, sampleColor) <= config.sampledColorTolerance
  );
}

function getObjectColor(object: PdfVectorObject): RgbColor | null {
  return object.strokeColor ?? object.fillColor;
}

function colorDistance(left: RgbColor | null, right: RgbColor | null): number {
  if (!left && !right) return 0;
  if (!left || !right) return 255;
  return Math.max(
    Math.abs(left.r - right.r),
    Math.abs(left.g - right.g),
    Math.abs(left.b - right.b)
  );
}

function scoreObject(
  object: PdfVectorObject,
  orientation: Exclude<Orientation, "diagonal">,
  config: WallDetectorConfig
): number {
  const thickness = Math.min(object.bbox.width, object.bbox.height);
  const length = Math.max(object.bbox.width, object.bbox.height);
  let score = 0;

  if (isDarkColor(object.strokeColor, config) || isDarkColor(object.fillColor, config)) score += 0.2;
  if (object.strokeWidth >= config.minStrokeWidthPx) score += 0.25;
  if (object.closed && thickness >= config.minFilledThicknessPx) score += 0.25;
  if (length >= config.minSegmentLengthPx * 2) score += 0.2;
  if (orientation === bboxOrientation(object.bbox)) score += 0.1;

  return Math.min(0.98, round(score, 2));
}

function scoreObjectReasons(
  object: PdfVectorObject,
  orientation: Exclude<Orientation, "diagonal">,
  config: WallDetectorConfig
): WallCandidateReasons {
  const thickness = Math.min(object.bbox.width, object.bbox.height);
  const length = Math.max(object.bbox.width, object.bbox.height);

  return {
    strokeWidthScore: object.strokeWidth >= config.minStrokeWidthPx || thickness >= config.minFilledThicknessPx ? 1 : 0,
    lengthScore: length >= config.minSegmentLengthPx * 2 ? 1 : round(length / (config.minSegmentLengthPx * 2), 2),
    orientationScore: orientation === bboxOrientation(object.bbox) ? 1 : 0,
    colorScore: isDarkColor(object.strokeColor, config) || isDarkColor(object.fillColor, config) ? 1 : 0,
    mergeScore: 0
  };
}

function averageReasons(reasons: WallCandidateReasons[], mergedCount: number): WallCandidateReasons {
  return {
    strokeWidthScore: round(average(reasons.map((reason) => reason.strokeWidthScore)), 2),
    lengthScore: round(average(reasons.map((reason) => reason.lengthScore)), 2),
    orientationScore: round(average(reasons.map((reason) => reason.orientationScore)), 2),
    colorScore: round(average(reasons.map((reason) => reason.colorScore)), 2),
    mergeScore: Math.min(1, round(mergedCount / 3, 2))
  };
}

function countObjectsAfterStrokeFilter(objects: PdfVectorObject[], config: WallDetectorConfig): number {
  return objects.filter((object) => {
    const dark = isDarkColor(object.strokeColor, config) || isDarkColor(object.fillColor, config);
    const filledWallLike = object.closed && dark && isFilledWallLike(object, config);
    const strokeWallLike = dark && object.strokeWidth >= config.minStrokeWidthPx;
    return filledWallLike || strokeWallLike;
  }).length;
}

function countObjectsAfterLengthFilter(objects: PdfVectorObject[], config: WallDetectorConfig): number {
  return objects.filter((object) => (
    countObjectsAfterStrokeFilter([object], config) > 0 &&
    Math.max(object.bbox.width, object.bbox.height) >= config.minSegmentLengthPx
  )).length;
}

function isFilledWallLike(object: PdfVectorObject, config: WallDetectorConfig): boolean {
  const thickness = Math.min(object.bbox.width, object.bbox.height);
  const length = Math.max(object.bbox.width, object.bbox.height);
  return (
    object.paintOperation !== "stroke" &&
    thickness >= config.minFilledThicknessPx &&
    length >= config.minSegmentLengthPx &&
    length / Math.max(thickness, 1) >= 2
  );
}

function isDarkColor(color: RgbColor | null, config: WallDetectorConfig): boolean {
  if (!color) return true;
  return color.r <= config.darkColorMaxChannel && color.g <= config.darkColorMaxChannel && color.b <= config.darkColorMaxChannel;
}

function centerlineFromBbox(bbox: BBox, orientation: Exclude<Orientation, "diagonal">): Segment2 {
  if (orientation === "horizontal") {
    const y = bbox.y + bbox.height / 2;
    return {
      start: { x: bbox.x, y: round(y, 3) },
      end: { x: bbox.x + bbox.width, y: round(y, 3) }
    };
  }

  const x = bbox.x + bbox.width / 2;
  return {
    start: { x: round(x, 3), y: bbox.y },
    end: { x: round(x, 3), y: bbox.y + bbox.height }
  };
}

function overlapsOnAxis(
  candidate: Segment2,
  merged: Segment2,
  orientation: Exclude<Orientation, "diagonal">
): boolean {
  const candidateFrom = orientation === "horizontal"
    ? Math.min(candidate.start.x, candidate.end.x)
    : Math.min(candidate.start.y, candidate.end.y);
  const candidateTo = orientation === "horizontal"
    ? Math.max(candidate.start.x, candidate.end.x)
    : Math.max(candidate.start.y, candidate.end.y);
  const mergedFrom = orientation === "horizontal"
    ? Math.min(merged.start.x, merged.end.x)
    : Math.min(merged.start.y, merged.end.y);
  const mergedTo = orientation === "horizontal"
    ? Math.max(merged.start.x, merged.end.x)
    : Math.max(merged.start.y, merged.end.y);

  return candidateTo >= mergedFrom && candidateFrom <= mergedTo;
}

function hasCloseAxis(
  candidate: Segment2,
  merged: Segment2,
  orientation: Exclude<Orientation, "diagonal">,
  axisTolerance: number
): boolean {
  const candidateAxis = orientation === "horizontal"
    ? (candidate.start.y + candidate.end.y) / 2
    : (candidate.start.x + candidate.end.x) / 2;
  const mergedAxis = orientation === "horizontal"
    ? (merged.start.y + merged.end.y) / 2
    : (merged.start.x + merged.end.x) / 2;

  return Math.abs(candidateAxis - mergedAxis) <= axisTolerance;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
