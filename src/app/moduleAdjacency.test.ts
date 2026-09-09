import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModuleSnapCandidates, detectModuleAdjacencyInfo } from "./moduleAdjacency";

const box = (minX: number, minZ: number, maxX: number, maxZ: number) => ({
  min: { x: minX, z: minZ },
  max: { x: maxX, z: maxZ }
});

describe("module adjacency snapping", () => {
  it.each([0, Math.PI / 2, Math.PI / 5, -Math.PI / 3])("snaps facing footprint edges after rotation %s", angle => {
    const rotate = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    const movingPolygon = [[0, 0], [0.6, 0], [0.6, 0.58], [0, 0.58]].map(([x, z]) => rotate(x, z));
    const polygon = [[0.64, 0], [1.24, 0], [1.24, 0.58], [0.64, 0.58]].map(([x, z]) => rotate(x, z));
    const desired = new THREE.Vector3(0, 1.4, 0);
    const candidates = buildModuleSnapCandidates({ movingId: "moving", movingBox: box(0, 0, 0.6, 0.58), movingPolygon,
      desired, others: [{ id: "neighbor", box: box(0.64, 0, 1.24, 0.58), polygon }] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].pos.distanceTo(desired.clone().add(rotate(0.04, 0)))).toBeLessThan(1e-8);
    expect(candidates[0].link.lineStart.distanceTo(candidates[0].link.lineEnd)).toBeCloseTo(0.58);
  });

  it("snaps to the recessed edge of an L corner without using its enclosing box", () => {
    const polygon = [[0, 0], [1, 0], [1, 0.4], [0.4, 0.4], [0.4, 1], [0, 1]].map(([x, z]) => ({ x, z }));
    const movingPolygon = [[0.44, 0.45], [0.84, 0.45], [0.84, 0.95], [0.44, 0.95]].map(([x, z]) => ({ x, z }));
    const candidates = buildModuleSnapCandidates({ movingId: "moving", movingBox: box(0.44, 0.45, 0.84, 0.95), movingPolygon,
      desired: new THREE.Vector3(), others: [{ id: "corner", box: box(0, 0, 1, 1), polygon }] });
    expect(candidates[0].pos.x).toBeCloseTo(-0.04);
    expect(candidates[0].pos.z).toBe(0);
    expect(candidates[0].link.lineStart.x).toBeCloseTo(0.4);
    expect(candidates[0].link.lineEnd.x).toBeCloseTo(0.4);
  });
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
