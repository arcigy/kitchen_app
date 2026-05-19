import { describe, expect, it } from "vitest";
import { cleanupWallLineGroup } from "./wallLineCleanup";
import type { StrokeWidthGroup, VectorSegment } from "./vectorStrokeGrouping";

describe("wall line cleanup", () => {
  it("removes a segment contained inside a longer collinear wall line", () => {
    const result = cleanupWallLineGroup({
      groups: [
        group("stroke_group_1", [
          segment("long", 0, 0, 100, 0),
          segment("inside", 20, 0.4, 60, 0.4)
        ])
      ]
    });

    expect(result.removedDuplicateSegmentIds).toEqual(["inside"]);
    expect(result.groups[0].segments.map((item) => item.id)).not.toContain("inside");
    expect(result.groups[0].segments).toEqual([
      expect.objectContaining({ x1: 0, y1: 0, x2: 100, y2: 0 })
    ]);
  });

  it("removes near-identical duplicate wall lines with tolerance", () => {
    const result = cleanupWallLineGroup({
      groups: [
        group("stroke_group_1", [
          segment("keep", 0, 0, 100, 0),
          segment("duplicate", 0.5, 0.3, 100.4, 0.3)
        ])
      ]
    });

    expect(result.removedDuplicateSegmentIds).toEqual(["duplicate"]);
    expect(result.groups[0].segments).toHaveLength(1);
  });

  it("snaps nearby endpoints so wall corners close cleanly", () => {
    const result = cleanupWallLineGroup({
      groups: [
        group("stroke_group_1", [
          segment("horizontal", 0, 0, 100, 0),
          segment("vertical", 101.2, 1.1, 101.2, 60)
        ])
      ],
      endpointTolerance: 3
    });

    const horizontal = result.groups[0].segments.find((item) => item.id === "horizontal");
    const vertical = result.groups[0].segments.find((item) => item.id === "vertical");

    expect(result.snappedEndpointCount).toBeGreaterThan(0);
    expect(horizontal?.x2).toBe(vertical?.x1);
    expect(horizontal?.y2).toBe(vertical?.y1);
  });

  it("merges collinear split wall pieces back into one visual line", () => {
    const result = cleanupWallLineGroup({
      groups: [
        group("stroke_group_1", [
          segment("left", 0, 0, 40, 0),
          segment("middle", 40.4, 0.2, 80, 0.2),
          segment("right", 80.3, -0.1, 120, -0.1)
        ])
      ],
      endpointTolerance: 2
    });

    expect(result.groups[0].segments).toHaveLength(1);
    expect(result.groups[0].segments[0]).toEqual(expect.objectContaining({
      x1: expect.closeTo(0, 0),
      y1: expect.closeTo(0, 0),
      x2: expect.closeTo(120, 0),
      y2: expect.closeTo(0, 0)
    }));
  });

  it("only cleans the configured wall line group", () => {
    const result = cleanupWallLineGroup({
      groups: [
        group("stroke_group_1", [
          segment("long", 0, 0, 100, 0),
          segment("inside", 20, 0, 60, 0)
        ]),
        group("stroke_group_2", [
          segment("other_long", 0, 10, 100, 10),
          segment("other_inside", 20, 10, 60, 10)
        ])
      ]
    });

    expect(result.groups[0].segments.map((item) => item.id)).not.toContain("inside");
    expect(result.groups[1].segments.map((item) => item.id)).toEqual(["other_long", "other_inside"]);
  });
});

function group(groupId: string, segments: VectorSegment[]): StrokeWidthGroup {
  return {
    groupId,
    colorName: groupId === "stroke_group_1" ? "green" : "blue",
    colorHex: groupId === "stroke_group_1" ? "#22c55e" : "#2563eb",
    sourceColorHex: "#000000",
    representativeStrokeColorRgb: [0, 0, 0],
    minStrokeWidth: 1.7,
    maxStrokeWidth: 1.7,
    representativeStrokeWidth: 1.7,
    segments,
    totalLength: segments.reduce((sum, item) => sum + Math.hypot(item.x2 - item.x1, item.y2 - item.y1), 0)
  };
}

function segment(id: string, x1: number, y1: number, x2: number, y2: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth: 1.7,
    sourceStrokeWidth: 1.7,
    strokeColorHex: "#000000",
    strokeColorRgb: [0, 0, 0],
    pathKind: "line"
  };
}
