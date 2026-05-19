import { describe, expect, it } from "vitest";
import type { WallAreaPolygon } from "./wallAreaDetection";
import type { WallCenterline } from "./wallCenterlineDetection";
import { buildWallsFromDetectionResults } from "./wallBuilder";

describe("wall builder", () => {
  it("builds canonical walls from wall areas and links matching centerlines", () => {
    const result = buildWallsFromDetectionResults({
      wallAreas: [
        wallArea("wall_area_1", "paired_faces_band", ["segment_a", "segment_b"], 12, 0.78)
      ],
      centerlines: [
        centerline("wall_centerline_1", ["segment_b", "segment_c"], 0.88)
      ]
    });

    expect(result.unmatchedCenterlineIds).toEqual([]);
    expect(result.walls).toEqual([
      {
        id: "wall_1",
        footprint: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 12 },
          { x: 0, y: 12 }
        ],
        sourceCenterlineId: "wall_centerline_1",
        sourceSegmentIds: ["segment_a", "segment_b"],
        sourceKind: "paired_faces_band",
        thicknessDrawingUnits: 12,
        thicknessMm: null,
        heightMm: null,
        wallKind: "unknown",
        confidence: 0.78,
        reasons: [],
        warnings: [],
        validationStatus: "valid",
        validationFlags: []
      }
    ]);
  });

  it("reports centerlines that did not match any wall area", () => {
    const result = buildWallsFromDetectionResults({
      wallAreas: [
        wallArea("wall_area_1", "closed_polyline", ["segment_a"], 8, 0.84)
      ],
      centerlines: [
        centerline("wall_centerline_1", ["segment_x"], 0.7)
      ]
    });

    expect(result.walls[0].sourceCenterlineId).toBeNull();
    expect(result.unmatchedCenterlineIds).toEqual(["wall_centerline_1"]);
  });
});

function wallArea(
  id: string,
  sourceKind: WallAreaPolygon["sourceKind"],
  sourceSegmentIds: string[],
  estimatedThickness: number,
  confidence: number
): WallAreaPolygon {
  return {
    id,
    sourceKind,
    sourceSegmentIds,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: estimatedThickness },
      { x: 0, y: estimatedThickness }
    ],
    area: 100 * estimatedThickness,
    perimeter: 200 + estimatedThickness * 2,
    estimatedThickness,
    bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: estimatedThickness },
    confidence,
    reasons: ["source reason"]
  };
}

function centerline(id: string, sourceSegmentIds: string[], confidence: number): WallCenterline {
  return {
    id,
    sourceSegmentIds,
    sourceKind: "paired_faces",
    x1: 0,
    y1: 0,
    x2: 100,
    y2: 0,
    wallThicknessEstimate: 12,
    confidence,
    reasons: []
  };
}
