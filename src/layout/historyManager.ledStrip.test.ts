import { describe, expect, it } from "vitest";
import { makeAppState } from "./appState";
import { captureLayoutSnapshot, snapshotSignature } from "./historyManager";

describe("LED strip layout history", () => {
  it("captures LED groups and changes the history signature when their geometry changes", () => {
    const state = makeAppState({ type: "base" } as never);
    state.ledStripCounter = 2;
    state.ledStripGroups.push({
      id: "led1",
      params: { name: "LED pĂˇsik 1", mode: "custom", heightMm: 900, offsetMm: 0, lightingComponentId: null, profileWidthMm: 10 },
      runs: [{ id: "led1-run1", points: [{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }] }]
    });
    const snapshot = captureLayoutSnapshot(state);
    const before = snapshotSignature(snapshot);

    state.ledStripGroups[0]!.runs[0]!.points[1]!.x = 1500;
    expect(snapshot.ledStripCounter).toBe(2);
    expect(snapshot.ledStripGroups?.[0]?.runs[0]?.points[1]?.x).toBe(1000);
    expect(snapshotSignature(captureLayoutSnapshot(state))).not.toBe(before);
  });
});
