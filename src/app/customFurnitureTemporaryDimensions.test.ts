import { describe, expect, it } from "vitest";
import {
  moveCustomFurnitureTemporaryBoundaryDimension,
  parseCustomFurnitureTemporaryDimensionEdit,
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

describe("parseCustomFurnitureTemporaryDimensionEdit", () => {
  it("accepts the current boundary dimension edit metadata shapes", () => {
    expect(parseCustomFurnitureTemporaryDimensionEdit({
      kind: "parallelSegmentDistance",
      segmentIndex: 2,
      referenceSegmentIndex: 4
    })).toEqual({
      kind: "parallelSegmentDistance",
      segmentIndex: 2,
      referenceSegmentIndex: 4
    });
    expect(parseCustomFurnitureTemporaryDimensionEdit({ kind: "filletRadius", filletId: "fillet-1" })).toEqual({
      kind: "filletRadius",
      filletId: "fillet-1"
    });
    expect(parseCustomFurnitureTemporaryDimensionEdit({ kind: "cutPosition", cutId: "cut-1" })).toEqual({
      kind: "cutPosition",
      cutId: "cut-1"
    });
  });

  it("ignores unsupported boundary dimension edit metadata", () => {
    expect(parseCustomFurnitureTemporaryDimensionEdit(null)).toBeNull();
    expect(parseCustomFurnitureTemporaryDimensionEdit({ kind: "parallelSegmentDistance", segmentIndex: 2 })).toBeNull();
    expect(parseCustomFurnitureTemporaryDimensionEdit({ kind: "filletRadius", filletId: 1 })).toBeNull();
    expect(parseCustomFurnitureTemporaryDimensionEdit({ kind: "unknown", id: "x" })).toBeNull();
  });
});
