import { describe, expect, it } from "vitest";
import type { ModuleParams } from "../model/cabinetTypes";
import {
  applyTallStackDimensionSegmentEdit,
  resolveTallStackDimensionChain,
  shouldShowTallStackDimensionChainForView
} from "./tallStackDimensionChain";

function tallParams(overrides: Record<string, unknown> = {}) {
  return {
    type: "fwm_catalog_tall_cabinet",
    height: 2080,
    plinthHeight: 100,
    boardThickness: 18,
    tallStackMode: "builder",
    tallSlotCount: 3,
    tallSlot1Type: "drawer",
    tallSlot1HeightMm: 190,
    tallSlot2Type: "oven",
    tallSlot2HeightMm: 600,
    tallSlot3Type: "door",
    tallSlot3HeightMm: 0,
    ...overrides
  } as ModuleParams;
}

describe("tall stack dimension chain", () => {
  it("resolves bottom-up front-view slot dimensions from real tall stack parameters", () => {
    const chain = resolveTallStackDimensionChain(tallParams());

    expect(chain.contentBottomMm).toBe(0);
    expect(chain.contentTopMm).toBe(2080);
    expect(chain.segments.map((segment) => [segment.slotIndex, segment.type, Math.round(segment.heightMm)])).toEqual([
      [0, "empty", 118],
      [1, "drawer", 190],
      [2, "oven", 600],
      [3, "door", 1154],
      [0, "empty", 18]
    ]);
    expect(chain.boundaries.map((boundary) => Math.round(boundary.yMm))).toEqual([0, 118, 308, 908, 2062, 2080]);
  });

  it("moves an internal boundary by growing one slot and shrinking the adjacent slot", () => {
    const result = applyTallStackDimensionSegmentEdit(tallParams(), {
      boundaryIndex: 2,
      segmentIndex: 1,
      nextHeightMm: 230
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.params as Record<string, unknown>;
    expect(record.height).toBe(2080);
    expect(record.tallSlot1HeightMm).toBe(230);
    expect(record.tallSlot2HeightMm).toBe(560);
  });

  it("extends the whole module when editing the top final boundary", () => {
    const result = applyTallStackDimensionSegmentEdit(tallParams(), {
      boundaryIndex: 5,
      segmentIndex: 4,
      nextHeightMm: 114
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.params as Record<string, unknown>;
    expect(record.height).toBe(2176);
    expect(record.tallSlot3HeightMm).toBe(0);
  });

  it("keeps empty spacer height in the visible full-height chain", () => {
    const chain = resolveTallStackDimensionChain(tallParams({
      tallSlotCount: 3,
      tallSlot1Type: "empty",
      tallSlot1HeightMm: 120,
      tallSlot2Type: "drawer",
      tallSlot2HeightMm: 190,
      tallSlot3Type: "door",
      tallSlot3HeightMm: 480
    }));

    expect(chain.segments.map((segment) => segment.type)).toEqual(["empty", "drawer", "door", "empty"]);
    expect(chain.segments[0]?.bottomMm).toBe(0);
    expect(chain.segments[0]?.topMm).toBe(238);
    expect(chain.segments[1]?.bottomMm).toBe(238);
    expect(chain.segments[1]?.topMm).toBe(428);
    expect(chain.segments[2]?.bottomMm).toBe(428);
    expect(chain.segments[3]?.topMm).toBe(2080);
  });

  it("dimensions an independently moved shelf without exposing hidden boundary shelves", () => {
    const chain = resolveTallStackDimensionChain(tallParams({
      tallSlotCount: 4,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "shelf",
      tallSlot2HeightMm: 18,
      tallSlot3Type: "oven",
      tallSlot3HeightMm: 600,
      tallSlot4Type: "shelf",
      tallSlot4HeightMm: 18,
      tallSlot4OffsetMm: 120
    }));

    expect(chain.segments.map((segment) => [segment.slotIndex, segment.type, Math.round(segment.heightMm)])).toContainEqual([4, "shelf", 18]);
    expect(chain.segments.some((segment) => segment.slotIndex === 2 && segment.type === "shelf")).toBe(false);
  });

  it("uses the real board extents for moved shelves instead of treating the shelf anchor as its bottom", () => {
    const chain = resolveTallStackDimensionChain(tallParams({
      tallSlotCount: 1,
      tallSlot1Type: "shelf",
      tallSlot1HeightMm: 18,
      tallSlot1OffsetMm: 120
    }));

    const shelf = chain.segments.find((segment) => segment.slotIndex === 1 && segment.type === "shelf");
    expect(shelf?.bottomMm).toBe(220);
    expect(shelf?.topMm).toBe(238);
  });

  it("moves the next slot boundary to the real hidden shelf top between drawer and appliance", () => {
    const chain = resolveTallStackDimensionChain(tallParams({
      frontGap: 2,
      tallSlotCount: 3,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "shelf",
      tallSlot2HeightMm: 18,
      tallSlot3Type: "oven",
      tallSlot3HeightMm: 600
    }));

    const oven = chain.segments.find((segment) => segment.slotIndex === 3 && segment.type === "oven");
    expect(oven?.bottomMm).toBe(307);
  });

  it("edits an empty gap by moving the adjacent submodule instead of stretching it", () => {
    const result = applyTallStackDimensionSegmentEdit(tallParams({
      tallSlotCount: 2,
      tallSlot1Type: "empty",
      tallSlot1HeightMm: 120,
      tallSlot2Type: "drawer",
      tallSlot2HeightMm: 190
    }), {
      boundaryIndex: 1,
      segmentIndex: 0,
      nextHeightMm: 300
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.params as Record<string, unknown>;
    expect(record.tallSlot2HeightMm).toBe(190);
    expect(record.tallSlot2OffsetMm).toBe(62);
  });

  it("edits a selected submodule placement gap by moving the selected submodule", () => {
    const result = applyTallStackDimensionSegmentEdit(tallParams(), {
      boundaryIndex: 4,
      segmentIndex: 4,
      nextHeightMm: 118,
      selectedSlotIndex: 3
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.params as Record<string, unknown>;
    expect(record.height).toBe(2080);
    expect(record.tallSlot3HeightMm).toBe(0);
    expect(record.tallSlot3OffsetMm).toBe(-100);
  });

  it("shows one full-height empty chain when the tall host has no submodules", () => {
    const chain = resolveTallStackDimensionChain(tallParams({
      tallSlotCount: 0
    }));

    expect(chain.segments.map((segment) => [segment.slotIndex, segment.type, Math.round(segment.heightMm)])).toEqual([
      [0, "empty", 2080]
    ]);
    expect(chain.boundaries.map((boundary) => Math.round(boundary.yMm))).toEqual([0, 2080]);
  });

  it("shows in elevation views even when the shell still reports the 3D view mode", () => {
    expect(shouldShowTallStackDimensionChainForView("3d", "elevation:south")).toBe(true);
    expect(shouldShowTallStackDimensionChainForView("2d", "floorplan")).toBe(false);
    expect(shouldShowTallStackDimensionChainForView("3d", "3d")).toBe(false);
  });
});
