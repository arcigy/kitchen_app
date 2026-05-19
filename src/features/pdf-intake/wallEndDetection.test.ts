import { describe, expect, it } from "vitest";
import { detectOpenWallEnds } from "./wallEndDetection";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("wall end detection", () => {
  it("does not highlight connected wall corners", () => {
    const result = detectOpenWallEnds({
      wallSegments: [
        line("horizontal", 0, 0, 100, 0),
        line("vertical", 0, 0, 0, 100)
      ],
      connectionTolerance: 3
    });

    expect(result.map((item) => [item.x, item.y])).toEqual(expect.arrayContaining([[100, 0], [0, 100]]));
    expect(result.map((item) => [item.x, item.y])).not.toContainEqual([0, 0]);
  });

  it("highlights both sides of an opening gap", () => {
    const result = detectOpenWallEnds({
      wallSegments: [
        line("left_wall", 0, 0, 40, 0),
        line("right_wall", 70, 0, 120, 0),
        line("left_connected", 0, 0, 0, 40),
        line("right_connected", 120, 0, 120, 40)
      ],
      connectionTolerance: 3
    });

    expect(result.map((item) => [item.x, item.y])).toEqual(expect.arrayContaining([[40, 0], [70, 0]]));
    expect(result).toHaveLength(4);
  });

  it("keeps a wall endpoint open when it only touches a short perpendicular cap", () => {
    const result = detectOpenWallEnds({
      wallSegments: [
        line("main_wall", 0, 0, 100, 0),
        line("short_cap", 100, -6, 100, 6)
      ],
      connectionTolerance: 3,
      capMaxLength: 16
    });

    expect(result.map((item) => [item.x, item.y])).toContainEqual([100, 0]);
  });

  it("does not keep a wall endpoint open at a long perpendicular wall junction", () => {
    const result = detectOpenWallEnds({
      wallSegments: [
        line("main_wall", 0, 0, 100, 0),
        line("long_wall", 100, 0, 100, 80)
      ],
      connectionTolerance: 3,
      capMaxLength: 16
    });

    expect(result.map((item) => [item.x, item.y])).not.toContainEqual([100, 0]);
  });

  it("in strict dangling mode highlights only endpoints with no touching wall line", () => {
    const result = detectOpenWallEnds({
      wallSegments: [
        line("main_wall", 0, 0, 100, 0),
        line("short_cap", 100, -6, 100, 6)
      ],
      connectionTolerance: 3,
      capMaxLength: 16,
      danglingOnly: true
    });

    expect(result.map((item) => [item.x, item.y])).toContainEqual([0, 0]);
    expect(result.map((item) => [item.x, item.y])).not.toContainEqual([100, 0]);
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
