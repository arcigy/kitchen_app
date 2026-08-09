import { describe, expect, it } from "vitest";
import {
  ledStripGroupAreaM2,
  ledStripGroupLengthMm,
  translateLedStripGroupHeight,
  validateLedStripGroup,
  type LedStripGroup
} from "./ledStripTypes";

const group = (): LedStripGroup => ({
  id: "led1",
  params: { name: "LED pĂˇsik 1", mode: "custom", heightMm: 900, offsetMm: 0, lightingComponentId: "led-profile", profileWidthMm: 10 },
  runs: [{ id: "led1-run1", points: [{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 1400, z: 0 }] }]
});

describe("LED strip domain", () => {
  it("prices centreline length times profile width in square metres", () => {
    expect(ledStripGroupLengthMm(group())).toBe(1500);
    expect(ledStripGroupAreaM2(group())).toBe(0.015);
  });

  it("moves every point by the height delta without flattening vertical segments", () => {
    const moved = translateLedStripGroupHeight(group(), 1100);
    expect(moved.runs[0]!.points.map((point) => point.y)).toEqual([1100, 1100, 1600]);
  });

  it("rejects a disconnected custom group and zero-length runs", () => {
    expect(() => validateLedStripGroup({ ...group(), runs: [] })).toThrow("exactly one connected run");
    const invalid = group();
    invalid.runs[0]!.points[1] = { x: 0, y: 900, z: 0 };
    expect(() => validateLedStripGroup(invalid)).toThrow("zero-length");
  });
});
