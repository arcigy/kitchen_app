import { describe, expect, it } from "vitest";
import { detectWallCandidateSegments, inferHeavyStructuralSegmentIds } from "./wallCandidateDetection";
import type { StrokeWidthGroup, VectorSegment } from "./vectorStrokeGrouping";

describe("wall candidate detection", () => {
  it("selects substantial thick wall-property groups", () => {
    const groups = [
      group("stroke_group_1", 1.7, [segment("heavy", 0, 0, 600, 0, 1.7)]),
      group("stroke_group_2", 0.56, [segment("medium", 0, 10, 600, 10, 0.56)]),
      group("stroke_group_3", 0.42, [
        segment("wall_face_a", 0, 20, 600, 20, 0.42),
        segment("wall_face_b", 0, 30, 600, 30, 0.42)
      ])
    ];

    const result = detectWallCandidateSegments({ groups });

    expect(result.wallCandidateSegmentIds).toEqual(expect.arrayContaining(["heavy", "medium"]));
    expect(result.wallCandidateSegmentIds).not.toContain("wall_face_a");
    expect(result.candidateGroupIds).toEqual(expect.arrayContaining(["stroke_group_1", "stroke_group_2"]));
  });

  it("excludes confirmed dimension segments from wall candidates", () => {
    const groups = [
      group("stroke_group_1", 0.42, [
        segment("wall_face", 0, 0, 600, 0, 0.42),
        segment("dimension_line", 0, 20, 600, 20, 0.42)
      ])
    ];

    const result = detectWallCandidateSegments({
      groups,
      dimensionSegmentIds: ["dimension_line"],
      excludeDimensionSegments: true
    });

    expect(result.wallCandidateSegmentIds).toContain("wall_face");
    expect(result.wallCandidateSegmentIds).not.toContain("dimension_line");
  });

  it("keeps wall candidates when wall priority is enabled", () => {
    const groups = [
      group("stroke_group_1", 0.42, [
        segment("wall_face", 0, 0, 600, 0, 0.42)
      ])
    ];

    const result = detectWallCandidateSegments({
      groups,
      dimensionSegmentIds: ["wall_face"]
    });

    expect(result.wallCandidateSegmentIds).toContain("wall_face");
  });

  it("keeps heavy structural ids for dimension detection exclusion", () => {
    const result = inferHeavyStructuralSegmentIds([
      group("stroke_group_1", 1.7, [segment("heavy", 0, 0, 600, 0, 1.7)]),
      group("stroke_group_2", 0.42, [segment("medium", 0, 10, 600, 10, 0.42)]),
      group("stroke_group_3", 0.12, [segment("thin", 0, 20, 600, 20, 0.12)])
    ]);

    expect(Array.from(result)).toEqual(["heavy"]);
  });
});

function group(groupId: string, strokeWidth: number, segments: VectorSegment[]): StrokeWidthGroup {
  return {
    groupId,
    colorName: "green",
    colorHex: "#22c55e",
    sourceColorHex: "#000000",
    representativeStrokeColorRgb: [0, 0, 0],
    minStrokeWidth: strokeWidth,
    maxStrokeWidth: strokeWidth,
    representativeStrokeWidth: strokeWidth,
    segments,
    totalLength: segments.reduce((sum, item) => sum + Math.hypot(item.x2 - item.x1, item.y2 - item.y1), 0)
  };
}

function segment(id: string, x1: number, y1: number, x2: number, y2: number, strokeWidth: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth,
    sourceStrokeWidth: strokeWidth,
    strokeColorHex: "#000000",
    strokeColorRgb: [0, 0, 0],
    pathKind: "line"
  };
}
