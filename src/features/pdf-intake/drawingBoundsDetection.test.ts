import { describe, expect, it } from "vitest";
import { detectDrawingContentBounds } from "./drawingBoundsDetection";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("drawing bounds detection", () => {
  it("keeps the main connected wall cluster and rejects a small page-edge frame segment", () => {
    const result = detectDrawingContentBounds({
      wallSegments: [
        line("main_a", 100, 100, 300, 100),
        line("main_b", 300, 100, 300, 260),
        line("main_c", 300, 260, 100, 260),
        line("main_d", 100, 260, 100, 100),
        line("page_frame", 1176, 35, 1176, 240)
      ],
      pageWidth: 1190,
      pageHeight: 842
    });

    expect(result.retainedSegmentIds).toEqual(expect.arrayContaining(["main_a", "main_b", "main_c", "main_d"]));
    expect(result.rejectedSegmentIds).toContain("page_frame");
    expect(result.tightBounds).toMatchObject({ xMin: 100, yMin: 100, xMax: 300, yMax: 260 });
    expect(result.workingBounds?.xMin).toBeLessThan(100);
    expect(result.workingBounds?.xMax).toBeGreaterThan(300);
  });

  it("retains a substantial secondary wall cluster inside the drawing", () => {
    const result = detectDrawingContentBounds({
      wallSegments: [
        line("main_a", 100, 100, 500, 100),
        line("main_b", 500, 100, 500, 500),
        line("main_c", 500, 500, 100, 500),
        line("main_d", 100, 500, 100, 100),
        line("partition_a", 650, 180, 850, 180),
        line("partition_b", 850, 180, 850, 300)
      ],
      pageWidth: 1190,
      pageHeight: 842
    });

    expect(result.retainedSegmentIds).toEqual(expect.arrayContaining(["partition_a", "partition_b"]));
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
