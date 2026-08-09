import { describe, expect, it } from "vitest";
import type { LedStripGroup } from "./ledStripTypes";
import { deleteLedStripSegment, moveLedStripPoint, moveLedStripSegment, offsetLedStripPolyline } from "./ledStripEditing";

const group = (): LedStripGroup => ({
  id: "led1", params: { name: "LED", mode: "custom", heightMm: 900, offsetMm: 0, lightingComponentId: null, profileWidthMm: 10 },
  runs: [{ id: "run", points: [{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }, { x: 2000, y: 900, z: 1000 }] }]
});

describe("LED strip editing", () => {
  it("moves one point or a selected segment while keeping adjacent runs connected", () => {
    expect(moveLedStripPoint(group(), { runId: "run", pointIndex: 1 }, { x: 1100, y: 950, z: 0 }).runs[0]!.points[1]).toEqual({ x: 1100, y: 950, z: 0 });
    expect(moveLedStripSegment(group(), { runId: "run", segmentIndex: 1 }, { x: 0, y: 100, z: 50 }).runs[0]!.points.slice(1, 3)).toEqual([{ x: 1000, y: 1000, z: 50 }, { x: 1000, y: 1000, z: 1050 }]);
  });

  it("shortens an end and splits an internal deleted segment into separate connected groups", () => {
    expect(deleteLedStripSegment(group(), { runId: "run", segmentIndex: 0 })[0]!.runs[0]!.points).toHaveLength(3);
    const split = deleteLedStripSegment(group(), { runId: "run", segmentIndex: 1 });
    expect(split.map((item) => item.runs[0]!.points.length)).toEqual([2, 2]);
    expect(split.map((item) => item.id)).toEqual(["led1-a", "led1-b"]);
  });

  it("reduces both L-corner arms symmetrically as offset increases", () => {
    const offset = offsetLedStripPolyline([{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }], 100);
    expect(offset).toEqual([{ x: 0, y: 900, z: 100 }, { x: 900, y: 900, z: 100 }, { x: 900, y: 900, z: 1000 }]);
  });
});
