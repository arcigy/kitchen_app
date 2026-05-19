import { describe, expect, it } from "vitest";
import type { Wall } from "./wallBuilder";
import { validateWall } from "./wallValidation";

describe("wall validation", () => {
  it("keeps a thin high-aspect wall valid", () => {
    const result = validateWall(wall({
      sourceKind: "paired_faces_band",
      footprint: rectangle(0, 0, 180, 20)
    }));

    expect(result.validationStatus).toBe("valid");
    expect(result.validationFlags).toEqual([]);
  });

  it("flags wall_20 equivalent with thick square-like footprint", () => {
    const result = validateWall(wall({
      sourceKind: "paired_faces_band",
      footprint: rectangle(560.527, 636.68, 169.268, 73.701)
    }));

    expect(result.validationStatus).toBe("suspicious");
    expect(result.validationFlags.map((flag) => flag.code)).toEqual([
      "thickness_too_large",
      "aspect_ratio_too_low"
    ]);
  });

  it("flags wall_5 equivalent with complex closed polyline", () => {
    const result = validateWall(wall({
      sourceKind: "closed_polyline",
      footprint: [
        { x: 742.752, y: 636.68 },
        { x: 716.838, y: 636.68 },
        { x: 718.456, y: 308.67 },
        { x: 671.483, y: 308.67 },
        { x: 671.483, y: 300.571 },
        { x: 720.075, y: 300.571 },
        { x: 720.075, y: 144.26 },
        { x: 673.913, y: 144.26 },
        { x: 673.913, y: 134.948 },
        { x: 673.913, y: 121.583 },
        { x: 720.075, y: 121.583 },
        { x: 742.752, y: 121.583 },
        { x: 742.752, y: 308.67 }
      ]
    }));

    expect(result.validationStatus).toBe("suspicious");
    expect(result.validationFlags.map((flag) => flag.code)).toEqual([
      "thickness_too_large",
      "closed_polyline_too_thick",
      "complex_closed_polyline",
      "large_area_with_complex_shape"
    ]);
  });
});

function wall(input: {
  sourceKind: Wall["sourceKind"];
  footprint: Wall["footprint"];
}): Wall {
  return {
    id: "wall_test",
    footprint: input.footprint,
    sourceCenterlineId: null,
    sourceSegmentIds: [],
    sourceKind: input.sourceKind,
    thicknessDrawingUnits: 0,
    thicknessMm: null,
    heightMm: null,
    wallKind: "unknown",
    confidence: 0.8,
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
