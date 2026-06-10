import { describe, expect, it } from "vitest";
import {
  PLAN_LINE_DRAW_TOOL_IDS,
  alignPlanLineSegmentToReference,
  movePlanLineSegmentToParallelDistance,
  offsetPlanLinePath,
  resolvePlanLineCombinedAxisSnap,
  resolvePlanLineParallelDimension,
  selectPlanLineSegmentsInRect,
  trimExtendPlanLineSegmentsToCorner
} from "./planLineDrawingTool";

describe("plan line drawing tool", () => {
  it("keeps one shared draw tool list for every sketch context", () => {
    expect(PLAN_LINE_DRAW_TOOL_IDS).toEqual([
      "boundaryLine",
      "line",
      "rectangle",
      "polygon",
      "circle",
      "arc",
      "spline",
      "pickLines"
    ]);
  });

  it("provides shared axis tracking and automatic orthogonal snap", () => {
    expect(resolvePlanLineCombinedAxisSnap({ x: 1035, z: 35 }, { x: 1000, z: 500 }, { x: 0, z: 0 }, 60)?.point).toEqual({
      x: 1000,
      z: 0
    });
  });

  it("selects, dimensions, moves, aligns, trims, and offsets line segments generically", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 0, z: 500 }, b: { x: 1000, z: 500 } },
      { a: { x: 1200, z: -200 }, b: { x: 1200, z: 900 } }
    ];

    expect(selectPlanLineSegmentsInRect(segments, { x0: -10, y0: -10, x1: 1010, y1: 10 }, (point) => ({ x: point.x, y: point.z }))).toEqual([0]);
    expect(Math.round(resolvePlanLineParallelDimension(segments, 0)?.distanceMm ?? 0)).toBe(500);
    expect(movePlanLineSegmentToParallelDistance(segments, 0, 1, 300)[0]).toEqual({ a: { x: 0, z: 200 }, b: { x: 1000, z: 200 } });
    expect(alignPlanLineSegmentToReference(segments, 0, 1)[1]).toEqual({ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } });
    expect(trimExtendPlanLineSegmentsToCorner(segments, 0, 2)[0]).toEqual({ a: { x: 0, z: 0 }, b: { x: 1200, z: 0 } });
    expect(offsetPlanLinePath([segments[0]!.a, segments[0]!.b], 100, -1)).toEqual([
      { x: 0, z: -100 },
      { x: 1000, z: -100 }
    ]);
  });
});
