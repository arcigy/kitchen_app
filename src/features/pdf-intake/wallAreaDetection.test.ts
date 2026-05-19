import { describe, expect, it } from "vitest";
import { createWallAreaPolygonsFromCenterlines, detectWallAreaPolygons, detectWallAreaPolygonsByStrokeFloodFill } from "./wallAreaDetection";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("wall area detection", () => {
  it("detects a closed wall-face rectangle as a hatched area", () => {
    const result = detectWallAreaPolygons({
      wallSegments: [
        segment("bottom", 0, 0, 100, 0),
        segment("right", 100, 0, 100, 12),
        segment("top", 100, 12, 0, 12),
        segment("left", 0, 12, 0, 0)
      ],
      maxEstimatedThickness: 20
    });

    expect(result).toHaveLength(1);
    expect(result[0].area).toBe(1200);
    expect(result[0].sourceKind).toBe("closed_polyline");
    expect(result[0].estimatedThickness).toBeCloseTo(10.714, 3);
    expect(result[0].sourceSegmentIds).toEqual(expect.arrayContaining(["bottom", "right", "top", "left"]));
  });

  it("snaps small endpoint gaps before detecting a wall area", () => {
    const result = detectWallAreaPolygons({
      wallSegments: [
        segment("bottom", 0, 0, 100, 0),
        segment("right", 100.8, 0.5, 100, 12),
        segment("top", 100, 12, 0, 12),
        segment("left", 0, 12, 0.4, 0.4)
      ],
      snapTolerance: 2,
      maxEstimatedThickness: 20
    });

    expect(result).toHaveLength(1);
  });

  it("detects a paint-bucket style closed wall area from stroke barriers", () => {
    const result = detectWallAreaPolygonsByStrokeFloodFill({
      wallSegments: [
        segment("bottom", 0, 0, 100, 0),
        segment("right", 100, 0, 100, 12),
        segment("top", 100, 12, 0, 12),
        segment("left", 0, 12, 0, 0)
      ],
      gridSize: 1,
      maxEstimatedThickness: 20
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].sourceSegmentIds).toEqual(expect.arrayContaining(["bottom", "right", "top", "left"]));
  });

  it("can snap paint-bucket hatch boundaries back to the source wall lines", () => {
    const result = detectWallAreaPolygonsByStrokeFloodFill({
      wallSegments: [
        segment("bottom", 0, 0, 100, 0),
        segment("right", 100, 0, 100, 12),
        segment("top", 100, 12, 0, 12),
        segment("left", 0, 12, 0, 0)
      ],
      gridSize: 1,
      barrierPadding: 1.8,
      boundarySnapDistance: 5,
      maxEstimatedThickness: 20
    });

    expect(result[0].bounds).toMatchObject({
      xMin: 0,
      yMin: 0,
      xMax: 100,
      yMax: 12
    });
  });

  it("filters large room-like loops that are not wall material bands", () => {
    const result = detectWallAreaPolygons({
      wallSegments: [
        segment("bottom", 0, 0, 500, 0),
        segment("right", 500, 0, 500, 500),
        segment("top", 500, 500, 0, 500),
        segment("left", 0, 500, 0, 0)
      ],
      maxEstimatedThickness: 80
    });

    expect(result).toHaveLength(0);
  });

  it("does not let a failed dangling branch trace block a valid closed wall area", () => {
    const result = detectWallAreaPolygons({
      wallSegments: [
        segment("dangling", -20, 0, 0, 0),
        segment("bottom", 0, 0, 100, 0),
        segment("right", 100, 0, 100, 12),
        segment("top", 100, 12, 0, 12),
        segment("left", 0, 12, 0, 0)
      ],
      maxEstimatedThickness: 20
    });

    expect(result.some((polygon) => polygon.sourceSegmentIds.includes("bottom"))).toBe(true);
  });

  it("creates closed hatch bands from paired wall-face centerlines", () => {
    const result = createWallAreaPolygonsFromCenterlines({
      wallCenterlines: [{
        id: "wall_centerline_1",
        sourceSegmentIds: ["face_a", "face_b"],
        x1: 0,
        y1: 6,
        x2: 100,
        y2: 6,
        wallThicknessEstimate: 12,
        confidence: 0.76
      }]
    });

    expect(result).toHaveLength(1);
    expect(result[0].sourceKind).toBe("paired_faces_band");
    expect(result[0].points).toEqual([
      { x: 0, y: 12 },
      { x: 100, y: 12 },
      { x: 100, y: 0 },
      { x: 0, y: 0 }
    ]);
  });
});

function segment(id: string, x1: number, y1: number, x2: number, y2: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth: 0.5,
    sourceStrokeWidth: 0.5,
    strokeColorHex: "#000000",
    strokeColorRgb: [0, 0, 0],
    pathKind: "line"
  };
}
