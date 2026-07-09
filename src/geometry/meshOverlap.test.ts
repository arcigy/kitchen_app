import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeMeshVolumeOverlaps } from "./meshOverlap";

function profiledBoard(name: string, profile: Array<{ x: number; z: number }>) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.001, 0.018, 0.001),
    new THREE.MeshBasicMaterial()
  );
  mesh.name = name;
  mesh.position.y = 0.009;
  mesh.userData.revitPlanProfileMm = profile;
  return mesh;
}

describe("computeMeshVolumeOverlaps", () => {
  it("ignores shared diagonal or edge contact that only overlaps in AABB", () => {
    const a = profiledBoard("a", [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 0, z: 100 }
    ]);
    const b = profiledBoard("b", [
      { x: 100, z: 100 },
      { x: 0, z: 100 },
      { x: 100, z: 0 }
    ]);
    const c = profiledBoard("c", [
      { x: 100, z: 0 },
      { x: 200, z: 0 },
      { x: 200, z: 100 },
      { x: 100, z: 100 }
    ]);

    expect(computeMeshVolumeOverlaps([a, b, c], { toleranceMm: 2 })).toEqual([]);
  });

  it("reports real positive profile and height overlap", () => {
    const a = profiledBoard("a", [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 100 },
      { x: 0, z: 100 }
    ]);
    const b = profiledBoard("b", [
      { x: 50, z: 50 },
      { x: 150, z: 50 },
      { x: 150, z: 150 },
      { x: 50, z: 150 }
    ]);

    const overlaps = computeMeshVolumeOverlaps([a, b], { toleranceMm: 2 });
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({
      a: "a",
      b: "b",
      overlapMm: { x: 50, z: 50 },
      planAreaMm2: 2500
    });
    expect(overlaps[0]!.overlapMm.y).toBeCloseTo(18, 3);
  });
});
