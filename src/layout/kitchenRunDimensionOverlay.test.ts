import { describe, expect, it } from "vitest";
import {
  resolveKitchenRunDimensionOffsets,
  resolveKitchenWorktopDimensionEdit
} from "./kitchenRunDimensionOverlay";
import type { KitchenRunDimensionSource } from "./kitchenRunDimensions";

const source: KitchenRunDimensionSource = {
  id: "w1:0",
  groupId: "kg1",
  worktopId: "w1",
  segmentIndex: 0,
  lengthMm: 2400,
  worktopDepthMm: 620,
  start: { x: 0, z: 0 },
  end: { x: 2.4, z: 0 },
  frontNormal: { x: 0, z: 1 },
  reservedStartMm: 0,
  reservedEndMm: 0,
  modules: []
};

describe("kitchen run dimension overlay placement", () => {
  it("routes an adjacent worktop dimension to movement of the selected wing", () => {
    expect(resolveKitchenWorktopDimensionEdit(
      { worktopId: "w1", segmentIndex: 0 },
      { worktopId: "w1", segmentIndex: 1 }
    )).toEqual({ segmentIndex: 0, adjacentSegmentIndex: 1 });
    expect(resolveKitchenWorktopDimensionEdit(
      { worktopId: "w1", segmentIndex: 0 },
      { worktopId: "w1", segmentIndex: 0 }
    )).toEqual({ segmentIndex: 0 });
  });

  it("places dimensions behind the worktop when no furniture module blocks them", () => {
    expect(resolveKitchenRunDimensionOffsets(source, [])).toEqual({
      behindBlocked: false,
      innerOffsetMm: -240,
      outerOffsetMm: -410
    });
  });

  it("moves dimensions in front of the worktop when a furniture module blocks the rear line", () => {
    const result = resolveKitchenRunDimensionOffsets(source, [{
      id: "blocking-module",
      minX: 0.8,
      maxX: 1.4,
      minZ: -0.48,
      maxZ: -0.34
    }]);
    expect(result.behindBlocked).toBe(true);
    expect(result.innerOffsetMm).toBe(860);
    expect(result.outerOffsetMm).toBe(1030);
  });
});
