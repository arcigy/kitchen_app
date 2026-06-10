import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractDxfVectorObjects } from "./dxfVectorExtractor";
import { getOrientation, segmentLength, type Segment2 } from "./geometryUtils";
import { DEFAULT_WALL_DETECTOR_CONFIG, detectLineweightWallCandidates } from "./wallCandidateDetector";

const FIXTURE_PATH = "public/debug-pdf/generated-debug.dxf";
const itWithFixture = existsSync(FIXTURE_PATH) ? it : it.skip;

describe("PDF demo wall rectangle consistency", () => {
  itWithFixture("covers every target lineweight wall boundary with a wall rectangle", async () => {
    const dxfText = readFileSync(FIXTURE_PATH, "utf8");
    const extraction = await extractDxfVectorObjects(new File([dxfText], "generated-debug.dxf"), { drawingScale: 1 });
    const detection = detectLineweightWallCandidates(extraction.page, extraction.isVectorPdf, extraction.objects, {
      ...DEFAULT_WALL_DETECTOR_CONFIG,
      targetLineweightStrokeWidthPx: 0.4,
      lineweightTolerancePx: 0.001,
      floorplanMaxX: Number.POSITIVE_INFINITY,
      drawingScale: 1
    });

    expect(
      detection.unresolvedWallBoundaries.map((boundary) => ({
        id: boundary.boundaryId,
        reason: boundary.reason,
        orientation: boundary.wall.orientation,
        length: boundary.wall.length,
        bbox: boundary.wall.bbox
      }))
    ).toEqual([]);
  });

  itWithFixture("highlights every axis-aligned target lineweight DXF wall segment as a wall candidate", async () => {
    const dxfText = readFileSync(FIXTURE_PATH, "utf8");
    const extraction = await extractDxfVectorObjects(new File([dxfText], "generated-debug.dxf"), { drawingScale: 1 });
    const config = {
      ...DEFAULT_WALL_DETECTOR_CONFIG,
      targetLineweightStrokeWidthPx: 0.4,
      lineweightTolerancePx: 0.001,
      floorplanMaxX: Number.POSITIVE_INFINITY,
      drawingScale: 1
    };
    const detection = detectLineweightWallCandidates(extraction.page, extraction.isVectorPdf, extraction.objects, config);

    const missedSegments = extraction.objects
      .filter((object) => (
        (object.kind === "line" || object.kind === "polyline") &&
        (object.paintOperation === "stroke" || object.paintOperation === "fill_stroke") &&
        Math.abs(object.strokeWidth - config.targetLineweightStrokeWidthPx) <= config.lineweightTolerancePx
      ))
      .flatMap((object) => object.segments.map((segment, index) => ({ objectId: object.id, segmentIndex: index, segment })))
      .filter(({ segment }) => segmentLength(segment) >= config.minSegmentLengthPx)
      .filter(({ segment }) => getOrientation(segment, config.axisAngleToleranceDeg) !== "diagonal")
      .filter(({ segment }) => !detection.walls.some((wall) => wallCoversSegment(wall.centerline, segment, config.rectangleAxisTolerancePx)));

    expect(missedSegments).toEqual([]);
  });
});

function wallCoversSegment(wall: Segment2, segment: Segment2, tolerance: number): boolean {
  const orientation = Math.abs(segment.start.y - segment.end.y) <= Math.abs(segment.start.x - segment.end.x)
    ? "horizontal"
    : "vertical";

  if (orientation === "horizontal") {
    const wallAxis = (wall.start.y + wall.end.y) / 2;
    const segmentAxis = (segment.start.y + segment.end.y) / 2;
    if (Math.abs(wallAxis - segmentAxis) > tolerance) return false;

    const wallFrom = Math.min(wall.start.x, wall.end.x);
    const wallTo = Math.max(wall.start.x, wall.end.x);
    const segmentFrom = Math.min(segment.start.x, segment.end.x);
    const segmentTo = Math.max(segment.start.x, segment.end.x);
    return wallFrom <= segmentFrom + tolerance && wallTo >= segmentTo - tolerance;
  }

  const wallAxis = (wall.start.x + wall.end.x) / 2;
  const segmentAxis = (segment.start.x + segment.end.x) / 2;
  if (Math.abs(wallAxis - segmentAxis) > tolerance) return false;

  const wallFrom = Math.min(wall.start.y, wall.end.y);
  const wallTo = Math.max(wall.start.y, wall.end.y);
  const segmentFrom = Math.min(segment.start.y, segment.end.y);
  const segmentTo = Math.max(segment.start.y, segment.end.y);
  return wallFrom <= segmentFrom + tolerance && wallTo >= segmentTo - tolerance;
}
