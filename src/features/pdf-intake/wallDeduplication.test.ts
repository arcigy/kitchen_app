import { describe, expect, it } from "vitest";
import type { Wall } from "./wallBuilder";
import { deduplicateWalls } from "./wallDeduplication";

describe("wall deduplication", () => {
  it("suppresses one wall when overlap is above 85 percent and source segments are shared", () => {
    const result = deduplicateWalls([
      wall("wall_a", rectangle(0, 0, 100, 20), ["shared", "a"], 0.7),
      wall("wall_b", rectangle(2, 0, 100, 20), ["shared"], 0.9)
    ]);

    expect(result.find((item) => item.id === "wall_b")?.validationFlags).toEqual([]);
    expect(result.find((item) => item.id === "wall_a")?.validationStatus).toBe("suspicious");
    expect(result.find((item) => item.id === "wall_a")?.validationFlags).toEqual([
      {
        code: "duplicate_suppressed",
        severity: "error",
        message: "Wall overlaps another wall with shared source segments and was suppressed as a duplicate.",
        values: { deduplicatedAgainstWallId: "wall_b" }
      }
    ]);
  });

  it("keeps overlapping walls when no source segment is shared", () => {
    const result = deduplicateWalls([
      wall("wall_a", rectangle(0, 0, 100, 20), ["a"], 0.7),
      wall("wall_b", rectangle(2, 0, 100, 20), ["b"], 0.9)
    ]);

    expect(result.every((item) => item.validationFlags.length === 0)).toBe(true);
  });

  it("keeps walls with shared source segments when overlap is below 85 percent", () => {
    const result = deduplicateWalls([
      wall("wall_a", rectangle(0, 0, 100, 20), ["shared"], 0.7),
      wall("wall_b", rectangle(60, 0, 100, 20), ["shared"], 0.9)
    ]);

    expect(result.every((item) => item.validationFlags.length === 0)).toBe(true);
  });

  it("suppresses duplicate chains against the best representative", () => {
    const result = deduplicateWalls([
      wall("wall_a", rectangle(0, 0, 100, 20), ["shared_a"], 0.7),
      wall("wall_b", rectangle(2, 0, 100, 20), ["shared_a", "shared_b"], 0.9),
      wall("wall_c", rectangle(4, 0, 100, 20), ["shared_b"], 0.8)
    ]);

    expect(result.find((item) => item.id === "wall_b")?.validationFlags).toEqual([]);
    expect(result.find((item) => item.id === "wall_a")?.validationFlags[0]?.values).toEqual({ deduplicatedAgainstWallId: "wall_b" });
    expect(result.find((item) => item.id === "wall_c")?.validationFlags[0]?.values).toEqual({ deduplicatedAgainstWallId: "wall_b" });
  });
});

function wall(id: string, footprint: Wall["footprint"], sourceSegmentIds: string[], confidence: number): Wall {
  return {
    id,
    footprint,
    sourceCenterlineId: null,
    sourceSegmentIds,
    sourceKind: "paired_faces_band",
    thicknessDrawingUnits: 20,
    thicknessMm: null,
    heightMm: null,
    wallKind: "unknown",
    confidence,
    reasons: [],
    warnings: [],
    validationStatus: "valid",
    validationFlags: []
  };
}

function rectangle(x: number, y: number, width: number, height: number): Wall["footprint"] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
}
