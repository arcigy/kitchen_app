import { describe, expect, it } from "vitest";
import {
  moveCustomFurnitureTemporaryBoundaryDimension,
  resolveCustomFurnitureTemporaryBoundaryDimension
} from "./customFurnitureTemporaryDimensions";

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

  it("uses the current move by parallel boundary distance behavior", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 0, z: 500 }, b: { x: 1000, z: 500 } },
      { a: { x: 1000, z: 0 }, b: { x: 1000, z: 700 } }
    ];

    const moved = moveCustomFurnitureTemporaryBoundaryDimension(segments, 0, 1, 700);

    expect(moved[0]).toEqual({ a: { x: 0, z: -200 }, b: { x: 1000, z: -200 } });
    expect(moved[2]?.a).toEqual({ x: 1000, z: -200 });
    expect(moved[2]?.b).toEqual({ x: 1000, z: 700 });
  });
});
