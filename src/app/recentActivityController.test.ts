import { describe, expect, it } from "vitest";
import type { LayoutSnapshot } from "../layout/appState";
import { describeSnapshotActivity } from "./recentActivityController";

const snapshot = (patch: Partial<LayoutSnapshot>): LayoutSnapshot => ({
  wallCounter: 1,
  walls: [],
  floorCounter: 1,
  floors: [],
  columnCounter: 1,
  columns: [],
  sectionCounter: 1,
  sections: [],
  worktopCounter: 1,
  worktops: [],
  instanceCounter: 1,
  instances: [],
  pinnedWallIds: [],
  pinnedInstanceIds: [],
  underlayPinned: false,
  selected: { kind: null, wallId: null, instId: null, floorId: null, columnId: null, sectionId: null, wallIds: [], instIds: [] },
  ...patch
});

const wall = (id: string, thicknessMm = 120) => ({
  id,
  params: {
    aMm: { x: 0, z: 0 },
    bMm: { x: 1000, z: 0 },
    thicknessMm,
    heightMm: 2600
  }
});

const moduleItem = (id: string, width = 600) => ({
  id,
  params: { type: "base", width },
  kitchenGroupId: null,
  kitchenPlacement: null,
  positionMm: { x: 0, y: 0, z: 0 },
  rotationYDeg: 0
});

describe("describeSnapshotActivity", () => {
  it("reports multiple deleted walls", () => {
    const activity = describeSnapshotActivity(
      snapshot({ walls: [wall("w1"), wall("w2"), wall("w3")] as LayoutSnapshot["walls"] }),
      snapshot({ walls: [wall("w1")] as LayoutSnapshot["walls"] })
    );

    expect(activity.label).toBe("2 walls deleted");
    expect(activity.target).toEqual({ kind: null, id: null });
  });

  it("reports multiple updated objects", () => {
    const activity = describeSnapshotActivity(
      snapshot({
        walls: [wall("w1")] as LayoutSnapshot["walls"],
        instances: [moduleItem("m1")] as LayoutSnapshot["instances"]
      }),
      snapshot({
        walls: [wall("w1", 180)] as LayoutSnapshot["walls"],
        instances: [moduleItem("m1", 900)] as LayoutSnapshot["instances"]
      })
    );

    expect(activity.label).toBe("2 objects updated");
    expect(activity.target).toEqual({ kind: null, id: null });
  });
});
