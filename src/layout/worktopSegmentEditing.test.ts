import { describe, expect, it } from "vitest";
import type { KitchenWorktopParams } from "./appState";
import {
  findKitchenWorktopSegmentAtPoint,
  moveKitchenWorktopSegmentByAdjacentLength,
  resizeKitchenWorktopSegment,
  setKitchenWorktopSegmentDepth
} from "./worktopSegmentEditing";

const params = (): KitchenWorktopParams => ({
  path: [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1500 }],
  justification: "back",
  mirrored: false,
  depthMm: 620,
  thicknessMm: 38,
  heightMm: 900,
  overhangSideMm: 20,
  materialId: ""
});

describe("worktop segment editing", () => {
  it("changes only the selected wing depth", () => {
    const next = setKitchenWorktopSegmentDepth(params(), 1, 760)!;
    expect(next.segmentDepthsMm).toEqual([620, 760]);
  });

  it("resizes the first wing from its free endpoint and preserves the shared corner", () => {
    const next = resizeKitchenWorktopSegment(params(), 0, 2400)!;
    expect(next.path).toEqual([{ x: -400, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1500 }]);
  });

  it("moves the selected first wing when its adjacent dimension is rewritten", () => {
    const next = moveKitchenWorktopSegmentByAdjacentLength(params(), 0, 1, 1900)!;
    expect(next.path).toEqual([{ x: 0, z: -400 }, { x: 2000, z: -400 }, { x: 2000, z: 1500 }]);
  });

  it("moves the selected last wing from the preceding adjacent dimension", () => {
    const next = moveKitchenWorktopSegmentByAdjacentLength(params(), 1, 0, 2400)!;
    expect(next.path).toEqual([{ x: 0, z: 0 }, { x: 2400, z: 0 }, { x: 2400, z: 1500 }]);
  });

  it("selects the nearest individual wing in plan", () => {
    expect(findKitchenWorktopSegmentAtPoint(params(), { x: 900, z: 250 })).toBe(0);
    expect(findKitchenWorktopSegmentAtPoint(params(), { x: 1800, z: 1100 })).toBe(1);
  });
});
