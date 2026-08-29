import { describe, expect, it } from "vitest";
import {
  SNAP_DISTANCE_PX,
  SNAP_DISTANCE_M,
  SNAP_KIND_SCORE,
  SNAP_PRIORITY_BOUNDARY_DRAW,
  SNAP_PRIORITY_DEFAULT,
  SNAP_PRIORITY_EDGE_FIRST,
  SNAP_PRIORITY_MEASURE,
  SNAP_PRIORITY_MOVE_OBJECT_LINES,
  SNAP_PRIORITY_MOVE_OBJECT_POINTS,
  SNAP_PRIORITY_MOVE_TARGET,
  SNAP_PRIORITY_WALL_DRAW
} from "./snapToolProfiles";

describe("snap tool profiles", () => {
  it("keeps deterministic, duplicate-free snap kind priorities", () => {
    const profiles = [
      SNAP_PRIORITY_DEFAULT,
      SNAP_PRIORITY_MEASURE,
      SNAP_PRIORITY_WALL_DRAW,
      SNAP_PRIORITY_BOUNDARY_DRAW,
      SNAP_PRIORITY_EDGE_FIRST,
      SNAP_PRIORITY_MOVE_TARGET,
      SNAP_PRIORITY_MOVE_OBJECT_POINTS,
      SNAP_PRIORITY_MOVE_OBJECT_LINES
    ];

    for (const profile of profiles) {
      expect(new Set(profile).size).toBe(profile.length);
      for (const kind of profile) expect(["corner", "endpoint", "perpendicular", "midpoint", "edge", "axis"]).toContain(kind);
    }
  });

  it("keeps exact snaps ahead of nearest edge for draw and measure tools", () => {
    expect(SNAP_PRIORITY_DEFAULT.slice(0, 2)).toEqual(["corner", "endpoint"]);
    expect(SNAP_PRIORITY_MEASURE).toBe(SNAP_PRIORITY_DEFAULT);
    expect(SNAP_PRIORITY_WALL_DRAW).toBe(SNAP_PRIORITY_DEFAULT);
    expect(SNAP_PRIORITY_BOUNDARY_DRAW).toBe(SNAP_PRIORITY_DEFAULT);
  });

  it("keeps move target and object-snap profiles distinct", () => {
    expect(SNAP_PRIORITY_MOVE_TARGET).toEqual(["endpoint", "midpoint", "corner", "perpendicular", "edge", "axis"]);
    expect(SNAP_PRIORITY_MOVE_OBJECT_POINTS).toEqual(["endpoint", "corner", "midpoint", "perpendicular"]);
    expect(SNAP_PRIORITY_MOVE_OBJECT_LINES).toEqual(["edge", "axis"]);
    expect(SNAP_KIND_SCORE.endpoint).toBeLessThan(SNAP_KIND_SCORE.edge!);
  });

  it("centralizes existing snap pixel tolerances", () => {
    expect(SNAP_DISTANCE_PX.wallDraw).toBe(14);
    expect(SNAP_DISTANCE_PX.planDefault).toBe(14);
    expect(SNAP_DISTANCE_PX.wallDrawAlignmentPx).toBe(28);
    expect(SNAP_DISTANCE_PX.measure2d).toBe(24);
    expect(SNAP_DISTANCE_PX.measure2dAxis).toBe(12);
    expect(SNAP_DISTANCE_PX.measure3d).toBe(32);
    expect(SNAP_DISTANCE_PX.measure3dAxis).toBe(12);
    expect(SNAP_DISTANCE_PX.alignPick).toBe(12);
    expect(SNAP_DISTANCE_PX.dimensionPick).toBe(24);
    expect(SNAP_DISTANCE_PX.floorEditVertex).toBe(12);
    expect(SNAP_DISTANCE_PX.floorEditSegment).toBe(10);
    expect(SNAP_DISTANCE_PX.moveTarget).toBe(28);
    expect(SNAP_DISTANCE_PX.customBoundaryLocal).toBe(18);
    expect(SNAP_DISTANCE_PX.customBoundaryPick).toBe(12);
    expect(SNAP_DISTANCE_PX.customBoundarySegmentPick).toBe(10);
  });

  it("centralizes world-space snap tolerances separately from pixel tolerances", () => {
    expect(SNAP_DISTANCE_M.wallDrawAlignmentMin).toBe(0.035);
    expect(SNAP_DISTANCE_M.wallDrawAlignmentMax).toBe(0.24);
    expect(SNAP_DISTANCE_M.wallDrawAlignmentPerspective).toBe(0.11);
    expect(SNAP_DISTANCE_M.wallDrawAlignmentPrecision).toBe(0.0015);
    expect(SNAP_DISTANCE_M.moduleAdjacency).toBe(0.08);
    expect(SNAP_DISTANCE_M.moduleAdjacencyDetach).toBe(0.14);
    expect(SNAP_DISTANCE_M.moduleAdjacencyMinOverlap).toBe(0.05);
    expect(SNAP_DISTANCE_M.moduleAdjacencyVisualTolerance).toBe(0.008);
    expect(SNAP_DISTANCE_M.kitchenModulePlacement).toBe(2.4);
    expect(SNAP_DISTANCE_M.kitchenKeyboardPlacement).toBe(0.12);
    expect(SNAP_DISTANCE_M.legacySurfaceMeasure).toBe(0.015);
  });
});
