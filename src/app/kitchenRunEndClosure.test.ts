import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { deriveKitchenRunEndClosure } from "./kitchenRunEndClosure";

const point = (x: number, z: number) => new THREE.Vector3(x, 0, z);
const binding = (segmentIndex: number, offsetAlongM: number) => ({
  worktopId: "worktop",
  segmentIndex,
  offsetAlongM
});

describe("kitchen run end closure", () => {
  const straight = [point(0, 0), point(2, 0)];

  it("marks the local left and right sides only when a module touches a straight run end", () => {
    const left = deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 0.3),
      guidePath: straight,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    });
    const middle = deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 1),
      guidePath: straight,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    });
    const right = deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 1.7),
      guidePath: straight,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    });

    expect(left).toEqual({ left: true, right: false, backGapMm: 80 });
    expect(middle).toEqual({ left: false, right: false, backGapMm: 0 });
    expect(right).toEqual({ left: false, right: true, backGapMm: 80 });
  });

  it("can close both sides of one full-width module", () => {
    expect(deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 1),
      guidePath: straight,
      moduleWidthM: 2,
      moduleRotationY: 0,
      backGapMm: 80
    })).toEqual({ left: true, right: true, backGapMm: 80 });
  });

  it("treats a 180 degree island return as two real run ends", () => {
    const island = [point(0, 0), point(2, 0), point(0, 0)];
    const firstSideAtB = deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 1.7),
      guidePath: island,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    });
    const secondSideAtB = deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(1, 0.3),
      guidePath: island,
      moduleWidthM: 0.6,
      moduleRotationY: Math.PI,
      backGapMm: 80
    });

    expect(firstSideAtB.right).toBe(true);
    expect(secondSideAtB.left).toBe(true);
  });

  it("does not close a normal internal L corner", () => {
    const lRun = [point(0, 0), point(2, 0), point(2, 2)];
    expect(deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 1.7),
      guidePath: lRun,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    })).toEqual({ left: false, right: false, backGapMm: 0 });
  });

  it("maps the run start to local right when the worktop placement is mirrored", () => {
    expect(deriveKitchenRunEndClosure({
      enabled: true,
      binding: binding(0, 0.3),
      guidePath: straight,
      moduleWidthM: 0.6,
      moduleRotationY: Math.PI,
      backGapMm: 80
    })).toEqual({ left: false, right: true, backGapMm: 80 });
  });

  it("clears closure for disabled, corner, stale, and detached bindings", () => {
    const common = {
      guidePath: straight,
      moduleWidthM: 0.6,
      moduleRotationY: 0,
      backGapMm: 80
    };
    expect(deriveKitchenRunEndClosure({ ...common, enabled: false, binding: binding(0, 0.3) }).left).toBe(false);
    expect(deriveKitchenRunEndClosure({ ...common, enabled: true, binding: { ...binding(0, 0.3), kind: "corner" } }).left).toBe(false);
    expect(deriveKitchenRunEndClosure({ ...common, enabled: true, binding: binding(2, 0.3) }).left).toBe(false);
    expect(deriveKitchenRunEndClosure({ ...common, enabled: true, binding: null }).left).toBe(false);
  });
});
