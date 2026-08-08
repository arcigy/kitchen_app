import { describe, expect, it } from "vitest";
import { validateOpeningPlacement, type HostedWallOpening } from "./openingPlacementValidation";

const door: HostedWallOpening = {
  id: "door-1",
  params: { wall: "back", wallId: "wall-1", centerMm: 1500, widthMm: 900 }
};

describe("validateOpeningPlacement", () => {
  it("rejects an opening as wide as its host wall", () => {
    expect(
      validateOpeningPlacement({ wallId: "wall-1", lengthMm: 3000, centerMm: 1500, widthMm: 3000, existingOpenings: [] })
    ).toEqual({ valid: false, reason: "outside-wall" });
  });

  it("rejects a door/window span overlapping an existing hosted opening", () => {
    expect(
      validateOpeningPlacement({ wallId: "wall-1", lengthMm: 3000, centerMm: 1900, widthMm: 700, existingOpenings: [door] })
    ).toEqual({ valid: false, reason: "overlap", conflictingOpeningId: "door-1" });
  });

  it("permits touching jambs and ignores openings on another host", () => {
    expect(
      validateOpeningPlacement({
        wallId: "wall-1",
        lengthMm: 3000,
        centerMm: 2400,
        widthMm: 900,
        existingOpenings: [door, { ...door, id: "window-2", params: { ...door.params, wallId: "wall-2", centerMm: 2400 } }]
      })
    ).toEqual({ valid: true });
  });

  it("honors legacy wall hosts when a persisted opening has no wallId", () => {
    expect(
      validateOpeningPlacement({
        wallId: "back",
        lengthMm: 3000,
        centerMm: 1500,
        widthMm: 900,
        existingOpenings: [{ ...door, params: { ...door.params, wallId: null } }]
      })
    ).toEqual({ valid: false, reason: "overlap", conflictingOpeningId: "door-1" });
  });
});
