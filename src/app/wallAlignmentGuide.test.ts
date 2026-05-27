import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { findParallelWallEndAlignmentGuide, type WallAlignmentGuideWall } from "./wallAlignmentGuide";

const wall = (id: string, ax: number, az: number, bx: number, bz: number): WallAlignmentGuideWall => ({
  id,
  params: {
    aMm: { x: ax, z: az },
    bMm: { x: bx, z: bz }
  }
});

describe("parallel wall end alignment guide", () => {
  it("snaps a new parallel wall end to an existing wall endpoint projection", () => {
    const guide = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 0)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.98, 0, 1.03),
      snapDistanceM: 0.08
    });

    expect(guide?.wallId).toBe("w1");
    expect(guide?.endpoint).toBe("b");
    expect(guide?.refPoint.x).toBeCloseTo(3);
    expect(guide?.refPoint.z).toBeCloseTo(0);
    expect(guide?.snapPoint.x).toBeCloseTo(3);
    expect(guide?.snapPoint.z).toBeCloseTo(1);
  });

  it("does not snap when the cursor is not near the aligned end point", () => {
    const guide = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 0)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.5, 0, 1.03),
      snapDistanceM: 0.08
    });

    expect(guide).toBeNull();
  });

  it("has enough tolerance to feel catchable without staying latched far away", () => {
    const guide = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 0)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.86, 0, 1.09),
      snapDistanceM: 0.18
    });
    const released = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 0)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.62, 0, 1.09),
      snapDistanceM: 0.18
    });

    expect(guide?.snapPoint.x).toBeCloseTo(3);
    expect(released).toBeNull();
  });

  it("releases when the cursor leaves the drawn wall axis even near an aligned endpoint", () => {
    const guide = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 0)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.98, 0, 1.14),
      snapDistanceM: 0.18
    });

    expect(guide).toBeNull();
  });

  it("supports angled parallel walls", () => {
    const guide = findParallelWallEndAlignmentGuide({
      walls: [wall("w1", 0, 0, 3000, 1500)],
      start: new THREE.Vector3(0, 0, 1),
      cursor: new THREE.Vector3(2.61, 0, 2.32),
      snapDistanceM: 0.08
    });

    expect(guide?.endpoint).toBe("b");
    expect(guide?.snapPoint.x).toBeCloseTo(2.6);
    expect(guide?.snapPoint.z).toBeCloseTo(2.3);
  });
});
