import { describe, expect, it } from "vitest";
import { detectWallCenterlines } from "./wallCenterlineDetection";
import type { WallHatchRectangle } from "./wallHatchRectangulation";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("wall centerline detection", () => {
  it("creates a centerline between two parallel horizontal wall faces", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("face_a", 0, 0, 100, 0),
        line("face_b", 0, 10, 100, 10)
      ],
      minWallThickness: 4,
      maxWallThickness: 20
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x1: 0, y1: 5, x2: 100, y2: 5 });
    expect(result[0].wallThicknessEstimate).toBe(10);
  });

  it("creates a centerline between two parallel vertical wall faces", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("face_a", 20, 0, 20, 80),
        line("face_b", 30, 0, 30, 80)
      ],
      minWallThickness: 4,
      maxWallThickness: 20
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x1: 25, y1: 0, x2: 25, y2: 80 });
  });

  it("does not pair unrelated parallel lines that are too far apart", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("face_a", 0, 0, 100, 0),
        line("face_b", 0, 80, 100, 80)
      ],
      maxWallThickness: 20
    });

    expect(result).toHaveLength(0);
  });

  it("merges split centerline candidates on the same wall axis", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("a1", 0, 0, 50, 0),
        line("b1", 0, 10, 50, 10),
        line("a2", 52, 0, 100, 0),
        line("b2", 52, 10, 100, 10)
      ],
      mergeGapTolerance: 4
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x1: 0, y1: 5, x2: 100, y2: 5 });
  });

  it("does not create a centerline directly on a single wall boundary line", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("boundary_only", 0, 0, 100, 0)
      ],
      minSegmentLength: 10
    });

    expect(result).toHaveLength(0);
  });

  it("snaps perpendicular centerlines into a shared wall corner", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("horizontal_a", 0, 0, 90, 0),
        line("horizontal_b", 0, 10, 90, 10),
        line("vertical_a", 90, 10, 90, 100),
        line("vertical_b", 100, 10, 100, 100)
      ],
      minWallThickness: 4,
      maxWallThickness: 20,
      cornerSnapTolerance: 12
    });

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ x1: 0, y1: 5, x2: 95, y2: 5 }),
      expect.objectContaining({ x1: 95, y1: 5, x2: 95, y2: 100 })
    ]));
  });

  it("keeps short paired wall faces when the short-wall thresholds are explicitly lowered", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("short_a", 0, 0, 12, 0),
        line("short_b", 0, 8, 12, 8)
      ],
      minSegmentLength: 6,
      minOverlapLength: 6,
      minCenterlineLength: 6,
      minWallThickness: 4,
      maxWallThickness: 12
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x1: 0, y1: 4, x2: 12, y2: 4 });
  });

  it("detects very thick paired wall faces when max wall thickness is raised", () => {
    const result = detectWallCenterlines({
      wallSegments: [
        line("thick_a", 0, 0, 120, 0),
        line("thick_b", 0, 52, 120, 52)
      ],
      minWallThickness: 4,
      maxWallThickness: 60
    });

    expect(result).toHaveLength(1);
    expect(result[0].wallThicknessEstimate).toBe(52);
  });

  it("creates centerlines from normalized wall rectangles using their thickness axis", () => {
    const result = detectWallCenterlines({
      wallRectangles: [
        rectangle("wall_rect_1", "wall_area_1", { xMin: 10, yMin: 20, xMax: 20, yMax: 120 }, "x", 10),
        rectangle("wall_rect_2", "wall_area_2", { xMin: 20, yMin: 110, xMax: 90, yMax: 120 }, "y", 10)
      ],
      minCenterlineLength: 1
    });

    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKind: "wall_rectangle",
        sourceWallRectangleIds: ["wall_rect_1"],
        sourceWallAreaIds: ["wall_area_1"],
        x1: 15,
        y1: 20,
        x2: 15,
        y2: 115
      }),
      expect.objectContaining({
        sourceKind: "wall_rectangle",
        sourceWallRectangleIds: ["wall_rect_2"],
        sourceWallAreaIds: ["wall_area_2"],
        x1: 15,
        y1: 115,
        x2: 90,
        y2: 115
      })
    ]));
  });

  it("does not place rectangle centerlines on wall boundary lines", () => {
    const result = detectWallCenterlines({
      wallRectangles: [
        rectangle("wall_rect_1", "wall_area_1", { xMin: 0, yMin: 0, xMax: 10, yMax: 100 }, "x", 10)
      ],
      minCenterlineLength: 1
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ x1: 5, y1: 0, x2: 5, y2: 100 });
  });

  it("does not aggressively corner-snap compact short wall rectangles", () => {
    const result = detectWallCenterlines({
      wallRectangles: [
        rectangle("wall_rect_short", "wall_area_1", { xMin: 20, yMin: 110, xMax: 42, yMax: 120 }, "y", 10),
        rectangle("wall_rect_long", "wall_area_2", { xMin: 10, yMin: 20, xMax: 20, yMax: 120 }, "x", 10)
      ],
      minCenterlineLength: 1
    });

    const short = result.find((centerline) => centerline.sourceWallRectangleIds?.[0] === "wall_rect_short");
    expect(short).toMatchObject({ x1: 20, y1: 115, x2: 42, y2: 115 });
    expect(short?.reasons).not.toContain("snapped rectangle centerline to wall corner");
  });
});

function line(id: string, x1: number, y1: number, x2: number, y2: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth: 1,
    sourceStrokeWidth: 1,
    strokeColorHex: "#000000",
    strokeColorRgb: [0, 0, 0],
    pathKind: "line"
  };
}

function rectangle(
  id: string,
  sourceWallAreaId: string,
  bounds: WallHatchRectangle["bounds"],
  thicknessAxis: WallHatchRectangle["thicknessAxis"],
  thicknessDrawingUnits: number
): WallHatchRectangle {
  return {
    id,
    sourceWallAreaId,
    thicknessAxis,
    thicknessDrawingUnits,
    thicknessMm: null,
    lengthDrawingUnits: Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin),
    lengthMm: null,
    bounds,
    points: [
      { x: bounds.xMin, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMax },
      { x: bounds.xMin, y: bounds.yMax }
    ],
    area: (bounds.xMax - bounds.xMin) * (bounds.yMax - bounds.yMin),
    confidence: 0.9,
    reasons: []
  };
}
