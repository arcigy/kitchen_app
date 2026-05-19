import { describe, expect, it } from "vitest";
import {
  createColoredDxf,
  createStrokeGroupSummary,
  groupSegmentsByStrokeWidth,
  type VectorSegment
} from "./vectorStrokeGrouping";

describe("vector stroke grouping", () => {
  it("groups similar stroke widths with absolute and relative tolerance", () => {
    const groups = groupSegmentsByStrokeWidth({
      segments: [
        segment("thin_1", 0.198),
        segment("thin_2", 0.204),
        segment("wall_1", 0.72),
        segment("wall_2", 0.78),
        segment("heavy_1", 1.6)
      ],
      absoluteTolerance: 0.03,
      relativeTolerance: 0.15
    });

    expect(groups).toHaveLength(3);
    expect(createStrokeGroupSummary(groups).map((group) => group.segmentCount)).toEqual([1, 2, 2]);
  });

  it("filters tiny fragments caused by PDF export noise", () => {
    const groups = groupSegmentsByStrokeWidth({
      segments: [
        { ...segment("noise", 0.2), x2: 0.05 },
        segment("real", 0.2)
      ],
      minimumSegmentLength: 0.5
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].segments.map((item) => item.id)).toEqual(["real"]);
  });

  it("exports colored DXF layers per stroke group", () => {
    const dxf = createColoredDxf(groupSegmentsByStrokeWidth({
      segments: [segment("wall", 0.8), segment("dimension", 0.2)]
    }));

    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("stroke_group_1");
    expect(dxf).toContain("LINE");
  });

  it("keeps visually different source line colors in separate groups", () => {
    const groups = groupSegmentsByStrokeWidth({
      segments: [
        { ...segment("black_wall", 0.8), strokeColorRgb: [0, 0, 0], strokeColorHex: "#000000" },
        { ...segment("gray_wall", 0.8), strokeColorRgb: [160, 160, 160], strokeColorHex: "#a0a0a0" },
        { ...segment("gray_wall_2", 0.82), strokeColorRgb: [166, 166, 166], strokeColorHex: "#a6a6a6" }
      ],
      colorTolerance: 20
    });

    expect(groups).toHaveLength(2);
    expect(createStrokeGroupSummary(groups).map((group) => group.segmentCount)).toEqual([2, 1]);
  });
});

function segment(id: string, strokeWidth: number): VectorSegment {
  return {
    id,
    x1: 0,
    y1: 0,
    x2: 10,
    y2: 0,
    strokeWidth,
    sourceStrokeWidth: strokeWidth
  };
}
