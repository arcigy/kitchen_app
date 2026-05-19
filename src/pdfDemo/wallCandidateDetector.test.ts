import { describe, expect, it } from "vitest";
import type { PdfVectorObject } from "./pdfVectorExtractor";
import { detectWallCandidates } from "./wallCandidateDetector";

describe("wall candidate detector", () => {
  it("merges close colinear dark wall segments", () => {
    const objects: PdfVectorObject[] = [
      makeLine("a", 0, 10, 100, 10, 2),
      makeLine("b", 103, 10.5, 220, 10.5, 2),
      makeLine("thin", 0, 50, 120, 50, 0.3)
    ];

    const result = detectWallCandidates(1, true, objects);

    expect(result.walls).toHaveLength(1);
    expect(result.walls[0].centerline.start.x).toBe(0);
    expect(result.walls[0].centerline.end.x).toBe(220);
    expect(result.debug.ignoredObjects).toBe(1);
  });
});

function makeLine(id: string, x1: number, y1: number, x2: number, y2: number, strokeWidth: number): PdfVectorObject {
  return {
    id,
    page: 1,
    kind: "line",
    source: "vector_path",
    paintOperation: "stroke",
    strokeWidth,
    fillColor: null,
    strokeColor: { r: 0, g: 0, b: 0 },
    bbox: {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    },
    segments: [{ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } }],
    points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
    closed: false
  };
}
