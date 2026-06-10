import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import {
  chooseTrimWallEndpoint,
  resolveTrimCornerEdit,
  resolveTrimSingleWallEdit,
  trimWallEndpointWorldPoint,
  type TrimWallLike
} from "./pointerTrimGeometryHelpers";

function wall(id: string, aMm: { x: number; z: number }, bMm: { x: number; z: number }): TrimWallLike {
  return { id, params: { aMm, bMm } };
}

function picked(overrides: Partial<AlignPickedLine> = {}): AlignPickedLine {
  return {
    p: new THREE.Vector3(1, 0, -1),
    dir: new THREE.Vector3(0, 0, 1),
    segA: new THREE.Vector3(1, 0, -1),
    segB: new THREE.Vector3(1, 0, 1),
    label: "picked",
    targetKind: "wall",
    lineRole: "center",
    wallId: "cutter",
    ...overrides
  };
}

function geometry(intersection: THREE.Vector3 | null) {
  return {
    lineLineIntersectionXZ: vi.fn(() => intersection),
    toMmPoint: vi.fn((point: THREE.Vector3) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) }))
  };
}

describe("pointer trim geometry helpers", () => {
  it("converts wall endpoints from millimeters to world meters", () => {
    const target = wall("wall-1", { x: 1250, z: -500 }, { x: 3000, z: 0 });

    expect(trimWallEndpointWorldPoint(target, "a")).toEqual(new THREE.Vector3(1.25, 0, -0.5));
    expect(trimWallEndpointWorldPoint(target, "b")).toEqual(new THREE.Vector3(3, 0, 0));
  });

  it("chooses the nearest trim endpoint using the current tie rule", () => {
    const target = wall("wall-1", { x: 0, z: 0 }, { x: 2000, z: 0 });

    expect(chooseTrimWallEndpoint(target, new THREE.Vector3(0.25, 0, 0))).toBe("a");
    expect(chooseTrimWallEndpoint(target, new THREE.Vector3(1.75, 0, 0))).toBe("b");
    expect(chooseTrimWallEndpoint(target, new THREE.Vector3(1, 0, 0))).toBe("a");
  });

  it("resolves a wall-to-wall corner edit for the clicked endpoints", () => {
    const targetWall = wall("target", { x: 0, z: 0 }, { x: 2000, z: 0 });
    const cutterWall = wall("cutter", { x: 3000, z: -1000 }, { x: 3000, z: 2000 });
    const targetPick = picked({ wallId: "target", p: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 0, 0) });
    const cutterPick = picked({ wallId: "cutter", p: new THREE.Vector3(3, 0, -1), dir: new THREE.Vector3(0, 0, 1) });
    const ctx = geometry(new THREE.Vector3(3, 0, 0));

    const result = resolveTrimCornerEdit({
      targetWall,
      cutterWall,
      targetPick,
      cutterPick,
      targetClick: new THREE.Vector3(1.8, 0, 0),
      cutterClick: new THREE.Vector3(3, 0, -0.8),
      geometry: ctx
    });

    expect(result).toEqual({
      kind: "edit",
      edits: [
        { wall: targetWall, which: "b", next: { x: 3000, z: 0 } },
        { wall: cutterWall, which: "a", next: { x: 3000, z: 0 } }
      ]
    });
    expect(ctx.lineLineIntersectionXZ).toHaveBeenCalledWith(targetPick.p, targetPick.dir, cutterPick.p, cutterPick.dir);
  });

  it("reports parallel corner trims without producing edits", () => {
    const result = resolveTrimCornerEdit({
      targetWall: wall("target", { x: 0, z: 0 }, { x: 1000, z: 0 }),
      cutterWall: wall("cutter", { x: 0, z: 1000 }, { x: 1000, z: 1000 }),
      targetPick: picked({ wallId: "target" }),
      cutterPick: picked({ wallId: "cutter" }),
      targetClick: new THREE.Vector3(),
      cutterClick: new THREE.Vector3(),
      geometry: geometry(null)
    });

    expect(result).toEqual({ kind: "parallel" });
  });

  it("reports no-change corner trims when both selected endpoints already match the intersection", () => {
    const targetWall = wall("target", { x: 0, z: 0 }, { x: 3000, z: 0 });
    const cutterWall = wall("cutter", { x: 3000, z: 0 }, { x: 3000, z: 2000 });

    const result = resolveTrimCornerEdit({
      targetWall,
      cutterWall,
      targetPick: picked({ wallId: "target" }),
      cutterPick: picked({ wallId: "cutter" }),
      targetClick: new THREE.Vector3(2.9, 0, 0),
      cutterClick: new THREE.Vector3(3, 0, 0.1),
      geometry: geometry(new THREE.Vector3(3, 0, 0))
    });

    expect(result).toEqual({ kind: "noChange" });
  });

  it("resolves single-wall trim by side of cutter and current fallback rules", () => {
    const targetWall = wall("target", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const cutter = picked({ p: new THREE.Vector3(1, 0, -1), dir: new THREE.Vector3(0, 0, 1) });

    const result = resolveTrimSingleWallEdit({
      wall: targetWall,
      picked: cutter,
      hitPoint: new THREE.Vector3(0.5, 0, 0),
      cutterClick: new THREE.Vector3(0.5, 0, 0),
      geometry: geometry(new THREE.Vector3(1, 0, 0))
    });

    expect(result).toEqual({ kind: "edit", edit: { wall: targetWall, which: "a", next: { x: 1000, z: 0 } } });
  });

  it("resolves single-wall extend by moving the opposite endpoint side", () => {
    const targetWall = wall("target", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const cutter = picked({ p: new THREE.Vector3(3, 0, -1), dir: new THREE.Vector3(0, 0, 1) });

    const result = resolveTrimSingleWallEdit({
      wall: targetWall,
      picked: cutter,
      hitPoint: new THREE.Vector3(3.5, 0, 0),
      cutterClick: new THREE.Vector3(3.5, 0, 0),
      geometry: geometry(new THREE.Vector3(3, 0, 0))
    });

    expect(result).toEqual({ kind: "edit", edit: { wall: targetWall, which: "b", next: { x: 3000, z: 0 } } });
  });

  it("keeps current single-wall trim guard outcomes", () => {
    const cutter = picked();

    expect(
      resolveTrimSingleWallEdit({
        wall: wall("tiny", { x: 0, z: 0 }, { x: 0, z: 0 }),
        picked: cutter,
        hitPoint: new THREE.Vector3(),
        cutterClick: new THREE.Vector3(),
        geometry: geometry(new THREE.Vector3(1, 0, 0))
      })
    ).toEqual({ kind: "tooSmall" });

    expect(
      resolveTrimSingleWallEdit({
        wall: wall("parallel", { x: 0, z: 0 }, { x: 4000, z: 0 }),
        picked: cutter,
        hitPoint: new THREE.Vector3(),
        cutterClick: new THREE.Vector3(),
        geometry: geometry(null)
      })
    ).toEqual({ kind: "parallel" });

    expect(
      resolveTrimSingleWallEdit({
        wall: wall("same", { x: 0, z: 0 }, { x: 4000, z: 0 }),
        picked: cutter,
        hitPoint: new THREE.Vector3(0.5, 0, 0),
        cutterClick: new THREE.Vector3(0.5, 0, 0),
        geometry: geometry(new THREE.Vector3(0, 0, 0))
      })
    ).toEqual({ kind: "noChange" });
  });
});
