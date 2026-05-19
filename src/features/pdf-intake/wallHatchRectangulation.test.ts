import { describe, expect, it } from "vitest";
import type { WallAreaPolygon } from "./wallAreaDetection";
import { rectangulateWallHatches } from "./wallHatchRectangulation";

describe("wall hatch rectangulation", () => {
  it("keeps a rectangular hatch as one rectangle", () => {
    const result = rectangulateWallHatches({
      wallAreaPolygons: [polygon("wall_area_1", [
        [0, 0],
        [100, 0],
        [100, 12],
        [0, 12]
      ])]
    });

    expect(result.rectangles).toHaveLength(1);
    expect(result.rectangles[0].bounds).toEqual({ xMin: 0, yMin: 0, xMax: 100, yMax: 12 });
  });

  it("splits an L shaped hatch into non-overlapping rectangles", () => {
    const result = rectangulateWallHatches({
      wallAreaPolygons: [polygon("wall_area_1", [
        [0, 0],
        [80, 0],
        [80, 20],
        [20, 20],
        [20, 80],
        [0, 80]
      ])]
    });

    expect(result.rectangles).toHaveLength(2);
    expect(totalArea(result.rectangles)).toBe(2800);
    expect(hasOverlaps(result.rectangles)).toBe(false);
  });

  it("does not overlap rectangles from separate hatches", () => {
    const result = rectangulateWallHatches({
      wallAreaPolygons: [
        polygon("wall_area_1", [
          [0, 0],
          [50, 0],
          [50, 10],
          [0, 10]
        ]),
        polygon("wall_area_2", [
          [60, 0],
          [90, 0],
          [90, 10],
          [60, 10]
        ])
      ]
    });

    expect(result.rectangles).toHaveLength(2);
    expect(hasOverlaps(result.rectangles)).toBe(false);
  });

  it("aligns close edges and snaps rectangle sizes to the drawing grid", () => {
    const result = rectangulateWallHatches({
      wallAreaPolygons: [
        polygon("wall_area_1", [
          [0.1, 0.1],
          [10.2, 0.1],
          [10.2, 5.2],
          [0.1, 5.2]
        ]),
        polygon("wall_area_2", [
          [10.7, 0.2],
          [20.3, 0.2],
          [20.3, 5.1],
          [10.7, 5.1]
        ])
      ],
      edgeAlignmentTolerance: 1,
      gridSizeDrawingUnits: 1
    });

    expect(result.rectangles).toHaveLength(2);
    expect(hasOverlaps(result.rectangles)).toBe(false);
    expect(result.rectangles[0].bounds.xMax).toBe(result.rectangles[1].bounds.xMin);
    for (const rectangle of result.rectangles) {
      expect((rectangle.bounds.xMax - rectangle.bounds.xMin) % 1).toBe(0);
      expect((rectangle.bounds.yMax - rectangle.bounds.yMin) % 1).toBe(0);
    }
  });

  it("snaps coordinates to 1 mm grid while snapping wall thickness to 5 mm", () => {
    const scaleFactor = 10;
    const result = rectangulateWallHatches({
      wallAreaPolygons: [polygon("wall_area_1", [
        [0.03, 0.01],
        [30.06, 0.01],
        [30.06, 1.26],
        [0.03, 1.26]
      ])],
      coordinateTolerance: 0.01,
      coordinateGridSizeDrawingUnits: 1 / scaleFactor,
      wallThicknessGridSizeDrawingUnits: 5 / scaleFactor,
      scaleFactor
    });

    expect(result.rectangles).toHaveLength(1);
    const rectangle = result.rectangles[0];
    expect(rectangle.thicknessAxis).toBe("y");
    expect(rectangle.thicknessMm).toBe(15);
    expect(rectangle.lengthMm).toBe(301);
    for (const point of rectangle.points) {
      expect(Math.abs(point.x * scaleFactor - Math.round(point.x * scaleFactor))).toBeLessThan(0.001);
      expect(Math.abs(point.y * scaleFactor - Math.round(point.y * scaleFactor))).toBeLessThan(0.001);
    }
  });

  it("marks square junction blocks as both-axis thickness instead of guessing a long wall axis", () => {
    const scaleFactor = 10;
    const result = rectangulateWallHatches({
      wallAreaPolygons: [polygon("wall_area_1", [
        [0, 0],
        [1.2, 0],
        [1.2, 1.3],
        [0, 1.3]
      ])],
      coordinateTolerance: 0.01,
      coordinateGridSizeDrawingUnits: 1 / scaleFactor,
      wallThicknessGridSizeDrawingUnits: 5 / scaleFactor,
      scaleFactor
    });

    expect(result.rectangles[0].thicknessAxis).toBe("both");
    expect((result.rectangles[0].thicknessMm ?? 0) % 5).toBe(0);
  });
});

function polygon(id: string, points: Array<[number, number]>): WallAreaPolygon {
  const mapped = points.map(([x, y]) => ({ x, y }));
  const area = Math.abs(mapped.reduce((sum, point, index) => {
    const next = mapped[(index + 1) % mapped.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  return {
    id,
    sourceKind: "closed_polyline",
    sourceSegmentIds: [],
    points: mapped,
    area,
    perimeter: 0,
    estimatedThickness: 0,
    bounds: {
      xMin: Math.min(...mapped.map((point) => point.x)),
      yMin: Math.min(...mapped.map((point) => point.y)),
      xMax: Math.max(...mapped.map((point) => point.x)),
      yMax: Math.max(...mapped.map((point) => point.y))
    },
    confidence: 0.8,
    reasons: []
  };
}

function totalArea(rectangles: Array<{ area: number }>): number {
  return rectangles.reduce((sum, rectangle) => sum + rectangle.area, 0);
}

function hasOverlaps(rectangles: Array<{ bounds: { xMin: number; yMin: number; xMax: number; yMax: number } }>): boolean {
  for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
      const left = rectangles[leftIndex].bounds;
      const right = rectangles[rightIndex].bounds;
      const width = Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin));
      const height = Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin));
      if (width * height > 0) return true;
    }
  }
  return false;
}
