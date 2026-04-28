import { describe, expect, it } from "vitest";
import { dist2, distPointToSegment2, distPxPointToSeg } from "./screenGeometry";

describe("screenGeometry", () => {
  it("computes squared point distance", () => {
    expect(dist2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
  });

  it("computes point to segment distance and clamps projection", () => {
    expect(distPointToSegment2({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ d2: 9, t: 0.5 });
    expect(distPointToSegment2({ x: -5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ d2: 34, t: 0 });
    expect(distPointToSegment2({ x: 15, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ d2: 34, t: 1 });
  });

  it("handles degenerate segments", () => {
    expect(distPointToSegment2({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ d2: 25, t: 0 });
    expect(distPxPointToSeg(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});
