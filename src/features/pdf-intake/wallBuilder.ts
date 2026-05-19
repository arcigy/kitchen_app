import type { WallAreaPolygon } from "./wallAreaDetection";
import type { WallCenterline } from "./wallCenterlineDetection";
import { deduplicateWalls } from "./wallDeduplication";
import { validateWalls, type WallValidationFlag } from "./wallValidation";

export interface Wall {
  id: string;
  footprint: Array<{ x: number; y: number }>;
  sourceCenterlineId: string | null;
  sourceSegmentIds: string[];
  // extend base Wall
  sourceKind: "closed_polyline" | "paired_faces_band";
  thicknessDrawingUnits: number;
  thicknessMm: number | null;
  heightMm: number | null;
  wallKind: "exterior" | "interior" | "unknown";
  confidence: number;
  reasons: string[];
  warnings: string[];
  validationStatus: "valid" | "suspicious";
  validationFlags: WallValidationFlag[];
}

export interface WallBuildResult {
  walls: Wall[];
  unmatchedCenterlineIds: string[];
}

export function buildWallsFromDetectionResults(input: {
  wallAreas: WallAreaPolygon[];
  centerlines: WallCenterline[];
}): WallBuildResult {
  const matchedCenterlineIds = new Set<string>();
  const walls = input.wallAreas.map((wallArea, index): Wall => {
    const centerline = findBestMatchingCenterline(wallArea, input.centerlines);
    if (centerline) matchedCenterlineIds.add(centerline.id);

    return {
      id: `wall_${index + 1}`,
      footprint: wallArea.points.map((point) => ({ x: point.x, y: point.y })),
      sourceCenterlineId: centerline?.id ?? null,
      sourceSegmentIds: [...wallArea.sourceSegmentIds],
      sourceKind: wallArea.sourceKind,
      thicknessDrawingUnits: wallArea.estimatedThickness,
      thicknessMm: null,
      heightMm: null,
      wallKind: "unknown",
      confidence: wallArea.confidence,
      reasons: [],
      warnings: [],
      validationStatus: "valid",
      validationFlags: []
    };
  });

  return {
    walls: deduplicateWalls(validateWalls(walls)),
    unmatchedCenterlineIds: input.centerlines
      .filter((centerline) => !matchedCenterlineIds.has(centerline.id))
      .map((centerline) => centerline.id)
  };
}

function findBestMatchingCenterline(wallArea: WallAreaPolygon, centerlines: WallCenterline[]): WallCenterline | null {
  const wallAreaSegmentIds = new Set(wallArea.sourceSegmentIds);
  let best: { centerline: WallCenterline; overlapCount: number } | null = null;

  for (const centerline of centerlines) {
    const sourceAreaMatch = centerline.sourceWallAreaIds?.includes(wallArea.id) ? 1000 : 0;
    const overlapCount = sourceAreaMatch + centerline.sourceSegmentIds.filter((segmentId) => wallAreaSegmentIds.has(segmentId)).length;
    if (overlapCount === 0) continue;
    if (!best || overlapCount > best.overlapCount || (overlapCount === best.overlapCount && centerline.confidence > best.centerline.confidence)) {
      best = { centerline, overlapCount };
    }
  }

  return best?.centerline ?? null;
}
