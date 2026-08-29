import { describe, expect, it } from "vitest";
import { createInitialTransformState } from "./transformStateFactory";

describe("createInitialTransformState", () => {
  it("creates the default transform command state", () => {
    const state = createInitialTransformState();

    expect(state.kind).toBeNull();
    expect(state.step).toBeNull();
    expect(state.stickyMove).toBe(false);
    expect(state.moveSnapDisabled).toBe(false);
    expect(state.base).toBeNull();
    expect(state.pivot).toBeNull();
    expect(state.typed).toBe("");
    expect(state.lastAngleSign).toBe(1);
    expect(state.lastPointerPx).toEqual({ x: 0, y: 0 });
    expect(state.selectedWallIds).toEqual([]);
    expect(state.selectedInstanceIds).toEqual([]);
    expect(state.selectedSectionIds).toEqual([]);
    expect(state.selectedWindowIds).toEqual([]);
    expect(state.selectedDoorIds).toEqual([]);
    expect(state.startWalls.size).toBe(0);
    expect(state.startInstances.size).toBe(0);
    expect(state.startInstanceAdjacency.size).toBe(0);
    expect(state.startSections.size).toBe(0);
    expect(state.startWindows.size).toBe(0);
    expect(state.startDoors.size).toBe(0);
    expect(state.startPointerAngle).toBe(0);
    expect(state.lastValidDelta.toArray()).toEqual([0, 0, 0]);
    expect(state.lastValidAngle).toBe(0);
  });

  it("does not share mutable transform collections between states", () => {
    const first = createInitialTransformState();
    const second = createInitialTransformState();

    first.selectedWallIds.push("wall-a");
    first.startInstanceAdjacency.set("module-a", "module-b");
    first.lastValidDelta.set(1, 0, 2);
    first.lastPointerPx.x = 20;

    expect(second.selectedWallIds).toEqual([]);
    expect(second.startInstanceAdjacency.size).toBe(0);
    expect(second.lastValidDelta.toArray()).toEqual([0, 0, 0]);
    expect(second.lastPointerPx).toEqual({ x: 0, y: 0 });
  });
});
