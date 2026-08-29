import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModuleSnapCandidates, detectModuleAdjacencyInfo } from "./moduleAdjacency";

const box = (minX: number, minZ: number, maxX: number, maxZ: number) => ({
  min: { x: minX, z: minZ },
  max: { x: maxX, z: maxZ }
});

describe("module adjacency snapping", () => {
  it("uses the shared default module snap distance", () => {
    const candidates = buildModuleSnapCandidates({
      movingId: "moving",
      movingBox: box(0, 0, 1, 1),
      desired: new THREE.Vector3(),
      others: [{ id: "other", box: box(1.075, 0, 2.075, 1) }]
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.link.otherId).toBe("other");
  });

  it("does not snap beyond the shared default module distance", () => {
    const candidates = buildModuleSnapCandidates({
      movingId: "moving",
      movingBox: box(0, 0, 1, 1),
      desired: new THREE.Vector3(),
      others: [{ id: "other", box: box(1.085, 0, 2.085, 1) }]
    });

    expect(candidates).toHaveLength(0);
  });

  it("uses the shared visual adjacency tolerance", () => {
    const adjacent = detectModuleAdjacencyInfo(box(0, 0, 1, 1), box(1.007, 0, 2.007, 1), "other");
    const separated = detectModuleAdjacencyInfo(box(0, 0, 1, 1), box(1.009, 0, 2.009, 1), "other");

    expect(adjacent?.side).toBe("right");
    expect(separated).toBeNull();
  });
});
