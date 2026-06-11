import { describe, expect, it } from "vitest";
import { resolveCustomFurnitureTemporaryBoundaryDimension } from "./customFurnitureTemporaryDimensions";

describe("resolveCustomFurnitureTemporaryBoundaryDimension", () => {
  it("uses the current parallel boundary distance behavior", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 0, z: 500 }, b: { x: 1000, z: 500 } },
      { a: { x: 1000, z: 0 }, b: { x: 1000, z: 700 } }
    ];

    const dimension = resolveCustomFurnitureTemporaryBoundaryDimension(segments, 0);

    expect(dimension?.referenceSegmentIndex).toBe(1);
    expect(Math.round(dimension?.distanceMm ?? 0)).toBe(500);
    expect(dimension?.selectedPoint).toEqual({ x: 500, z: 0 });
    expect(dimension?.referencePoint).toEqual({ x: 500, z: 500 });
  });
});
