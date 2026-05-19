import { describe, expect, it } from "vitest";
import { detectDimensionAnnotations, type VectorTextToken } from "./dimensionDetection";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("dimension detection", () => {
  it("infers scale from repeated numeric text and nearby measured lines", () => {
    const result = detectDimensionAnnotations({
      texts: [
        text("t1", "2460", 95, 22),
        text("t2", "1200", 345, 22),
        text("t3", "800", 565, 22),
        text("room_number", "01", 20, 200)
      ],
      segments: [
        line("l1", 0, 10, 246, 10),
        line("l2", 300, 10, 420, 10),
        line("l3", 520, 10, 600, 10),
        line("unrelated", 15, 170, 16, 200)
      ]
    });

    expect(result.inferredScaleFactor).toBeCloseTo(10, 1);
    expect(result.dimensions.map((dimension) => dimension.text)).toEqual(["2460", "1200", "800"]);
    expect(result.dimensionTextTokenIds).not.toContain("room_number");
  });

  it("includes perpendicular endpoint marker lines when present", () => {
    const result = detectDimensionAnnotations({
      texts: [text("t1", "1000", 35, 22), text("t2", "500", 180, 22), text("t3", "250", 275, 22)],
      segments: [
        line("main", 0, 10, 100, 10),
        line("tick_left", 0, 0, 0, 20),
        line("tick_right", 100, 0, 100, 20),
        line("m2", 160, 10, 210, 10),
        line("m3", 260, 10, 285, 10)
      ]
    });

    const dimension = result.dimensions.find((item) => item.mainSegmentId === "main");
    expect(dimension?.markerSegmentIds).toEqual(expect.arrayContaining(["tick_left", "tick_right"]));
  });

  it("does not use excluded wall segments as dimension main lines", () => {
    const result = detectDimensionAnnotations({
      texts: [text("t1", "1000", 35, 22), text("t2", "500", 180, 22), text("t3", "250", 275, 22)],
      segments: [
        line("wall", 0, 10, 100, 10),
        line("m2", 160, 10, 210, 10),
        line("m3", 260, 10, 285, 10)
      ],
      excludedSegmentIds: ["wall"]
    });

    expect(result.dimensions.map((dimension) => dimension.mainSegmentId)).not.toContain("wall");
  });

  it("does not use excluded wall segments as dimension marker lines", () => {
    const result = detectDimensionAnnotations({
      texts: [text("t1", "1000", 35, 22), text("t2", "500", 180, 22), text("t3", "250", 275, 22)],
      segments: [
        line("main", 0, 10, 100, 10),
        line("wall_endpoint", 0, 0, 0, 20),
        line("tick_right", 100, 0, 100, 20),
        line("m2", 160, 10, 210, 10),
        line("m3", 260, 10, 285, 10)
      ],
      excludedSegmentIds: ["wall_endpoint"]
    });

    const dimension = result.dimensions.find((item) => item.mainSegmentId === "main");
    expect(dimension?.markerSegmentIds).not.toContain("wall_endpoint");
    expect(dimension?.markerSegmentIds).toContain("tick_right");
  });

  it("uses rotated numeric text to find vertical dimensions", () => {
    const result = detectDimensionAnnotations({
      texts: [
        { ...text("t1", "1000", 5, 35), rotationDeg: 90 },
        { ...text("t2", "500", 160, 35), rotationDeg: 90 },
        { ...text("t3", "250", 250, 35), rotationDeg: 90 }
      ],
      segments: [
        line("v1", 20, 0, 20, 100),
        line("v2", 180, 0, 180, 50),
        line("v3", 270, 0, 270, 25)
      ]
    });

    expect(result.dimensions.map((dimension) => dimension.orientation)).toEqual(["vertical", "vertical", "vertical"]);
  });

});

function text(id: string, value: string, x: number, y: number): VectorTextToken {
  return { id, text: value, x, y, width: 30, height: 8, fontSize: 8 };
}

function line(id: string, x1: number, y1: number, x2: number, y2: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth: 0.2,
    sourceStrokeWidth: 0.2,
    strokeColorHex: "#000000",
    strokeColorRgb: [0, 0, 0],
    pathKind: "line"
  };
}
