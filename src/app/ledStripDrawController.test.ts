import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeAppState } from "../layout/appState";
import { createLedStripDrawController } from "./ledStripDrawController";

describe("LED strip draw controller", () => {
  it("creates a single connected custom group only after the second point and commits each added segment", () => {
    const state = makeAppState({ type: "base" } as never);
    const commitHistory = vi.fn();
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory, mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    expect(state.ledStripGroups).toEqual([]);
    controller.point(new THREE.Vector3(1, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 1));
    expect(state.ledStripGroups[0]!.runs[0]!.points).toEqual([{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }]);
    expect(commitHistory).toHaveBeenCalledTimes(2);
    controller.escape();
    expect(controller.state.active).toBe(false);
  });
});
