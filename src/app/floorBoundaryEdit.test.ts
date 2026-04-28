import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  cloneFloorSegments,
  floorBoundaryToSegments,
  floorOrthoPoint,
  floorPointDistMm,
  floorPointEq,
  floorPointToWorld,
  floorSegmentsToBoundary,
  makeFloorCirclePoints,
  moveFloorEditSegment,
  moveFloorEditVertex,
  worldToFloorPoint
} from "./floorBoundaryEdit";
import type { FloorBoundaryPoint, FloorBoundarySegment } from "./localTypes";

const boundary: FloorBoundaryPoint[] = [
  { x: 0, z: 0 },
  { x: 1000, z: 0 },
  { x: 1000, z: 800 },
  { x: 0, z: 800 }
];

describe("floorBoundaryEdit", () => {
  it("converts points and measures in millimetres", () => {
    expect(floorPointDistMm({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(floorPointEq({ x: 0, z: 0 }, { x: 2, z: 2 })).toBe(true);
    expect(worldToFloorPoint(new Vector3(1.234, 9, -0.456))).toEqual({ x: 1234, z: -456 });
    expect(floorPointToWorld({ x: 500, z: 250 }).toArray()).toEqual([0.5, 0.055, 0.25]);
  });

  it("applies ortho lock only when enabled", () => {
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 900, z: 400 }, true)).toEqual({ x: 900, z: 0 });
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 300, z: 700 }, true)).toEqual({ x: 0, z: 700 });
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 300, z: 700 }, false)).toEqual({ x: 300, z: 700 });
  });

  it("round-trips closed floor boundaries through segments", () => {
    const segments = floorBoundaryToSegments(boundary);
    const restored = floorSegmentsToBoundary(segments);

    expect(restored).toEqual(boundary);
    expect(segments[0].a).not.toBe(boundary[0]);
  });

  it("rejects open or disconnected segment sets", () => {
    expect(floorSegmentsToBoundary(floorBoundaryToSegments(boundary).slice(0, 2))).toBeNull();
    expect(
      floorSegmentsToBoundary([
        { a: { x: 0, z: 0 }, b: { x: 100, z: 0 } },
        { a: { x: 200, z: 0 }, b: { x: 300, z: 0 } },
        { a: { x: 300, z: 0 }, b: { x: 200, z: 0 } }
      ])
    ).toBeNull();
  });

  it("moves linked vertices and complete picked segments", () => {
    const segments = floorBoundaryToSegments(boundary);
    const movedVertex = moveFloorEditVertex(segments, { x: 1000, z: 0 }, { x: 1200, z: 50 });
    const movedSegment = moveFloorEditSegment(segments, 1, { x: 1000, z: 0 }, { x: 1100, z: 100 });

    expect(movedVertex[0].b).toEqual({ x: 1200, z: 50 });
    expect(movedVertex[1].a).toEqual({ x: 1200, z: 50 });
    expect(movedSegment[1]).toEqual({ a: { x: 1100, z: 100 }, b: { x: 1100, z: 900 } });
    expect(movedSegment[0].b).toEqual({ x: 1100, z: 100 });
    expect(movedSegment[2].a).toEqual({ x: 1100, z: 900 });
  });

  it("clones segments and builds circle points", () => {
    const segments: FloorBoundarySegment[] = floorBoundaryToSegments(boundary);
    const cloned = cloneFloorSegments(segments);
    const circle = makeFloorCirclePoints({ x: 0, z: 0 }, { x: 1000, z: 0 }, 8);

    expect(cloned).toEqual(segments);
    expect(cloned[0]).not.toBe(segments[0]);
    expect(circle).toHaveLength(8);
    expect(circle[0]).toEqual({ x: 1000, z: 0 });
    expect(circle[2]).toEqual({ x: 0, z: 1000 });
  });
});
