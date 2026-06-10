import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveNavigationPointerControls, resolveNavigationViewerToolMode } from "./viewNavigation";

describe("viewNavigation pointer controls", () => {
  it("defaults to select mode before the viewer tool controller is initialized", () => {
    expect(resolveNavigationViewerToolMode()).toBe("select");
  });

  it("reads the active viewer tool mode when the controller is available", () => {
    expect(resolveNavigationViewerToolMode(() => "pan")).toBe("pan");
  });

  it("does not allow left-drag pan in floorplan select mode", () => {
    const controls = resolveNavigationPointerControls("2d", "floorplan", "select");

    expect(controls.enablePan).toBe(false);
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(controls.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
  });

  it("allows left-drag pan only when the pan tool is active", () => {
    const controls = resolveNavigationPointerControls("2d", "floorplan", "pan");

    expect(controls.enablePan).toBe(true);
    expect(controls.mouseButtons.LEFT).toBe(THREE.MOUSE.PAN);
  });
});
