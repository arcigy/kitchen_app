import { describe, expect, it } from "vitest";
import {
  buildSemanticKitchenPath,
  inspectKitchenRunOverlaps,
  placeOnKitchenRun,
  validateSemanticKitchenLayout
} from "./kitchenSemanticLayout";

describe("semantic kitchen JSON layout", () => {
  it("turns compact straight, L and U JSON into deterministic worktop paths", () => {
    expect(buildSemanticKitchenPath({ shape: "straight", runsMm: [2400], turns: [] })).toEqual([
      { x: 0, z: 0 },
      { x: 2400, z: 0 }
    ]);
    expect(buildSemanticKitchenPath({ shape: "L", runsMm: [2400, 1800], turns: ["left"] })).toEqual([
      { x: 0, z: 0 },
      { x: 2400, z: 0 },
      { x: 2400, z: 1800 }
    ]);
    expect(buildSemanticKitchenPath({
      shape: "U",
      originMm: { x: 100, z: 200 },
      orientationDeg: 90,
      runsMm: [2000, 3000, 2000],
      turns: ["right", "right"]
    })).toEqual([
      { x: 100, z: 200 },
      { x: 100, z: 2200 },
      { x: 3100, z: 2200 },
      { x: 3100, z: 200 }
    ]);
  });

  it("rejects missing dimensions instead of inventing scale for a photo", () => {
    expect(validateSemanticKitchenLayout({ shape: "L", runsMm: [2400], turns: ["left"] })).toContain(
      "L layout requires exactly 2 run lengths."
    );
  });

  it("places modules in free run intervals without overlap", () => {
    const first = placeOnKitchenRun({
      runLengthMm: 2400,
      reservedStartMm: 600,
      occupants: [],
      request: { widthMm: 600, anchor: "auto" }
    });
    expect(first).toEqual({ ok: true, centerMm: 900 });

    const second = placeOnKitchenRun({
      runLengthMm: 2400,
      reservedStartMm: 600,
      occupants: [{ id: "a", centerMm: 900, widthMm: 600 }],
      request: { widthMm: 800, anchor: "auto" }
    });
    expect(second).toEqual({ ok: true, centerMm: 1600 });

    expect(placeOnKitchenRun({
      runLengthMm: 1200,
      occupants: [{ id: "a", centerMm: 300, widthMm: 600 }],
      request: { widthMm: 700, anchor: "auto" }
    })).toEqual({ ok: false, reason: "no-space" });
  });

  it("reports overlap pairs for the analyzer", () => {
    expect(inspectKitchenRunOverlaps([
      { id: "a", centerMm: 300, widthMm: 600 },
      { id: "b", centerMm: 850, widthMm: 600 }
    ])).toEqual([{ firstId: "a", secondId: "b", overlapMm: 50 }]);
  });
});
