import { describe, expect, it } from "vitest";
import { BoxGeometry, ExtrudeGeometry } from "three";
import {
  cloneFloorParams,
  floorMaterialColor,
  makeFloorGeometry,
  makeFloorOutlineGeometry
} from "./floorGeometry";
import type { FloorParams } from "./localTypes";

const sampleFloor: FloorParams = {
  name: "Podlaha",
  heightMm: 12,
  thicknessMm: 18,
  materialId: "mat_white_melamine",
  boundary: [
    { x: 0, z: 0 },
    { x: 1000, z: 0 },
    { x: 1000, z: 800 },
    { x: 0, z: 800 }
  ]
};

describe("floorGeometry", () => {
  it("clones floor params without sharing boundary points", () => {
    const clone = cloneFloorParams(sampleFloor, "fallback");

    expect(clone).toEqual(sampleFloor);
    expect(clone).not.toBe(sampleFloor);
    expect(clone.boundary).not.toBe(sampleFloor.boundary);
    expect(clone.boundary[0]).not.toBe(sampleFloor.boundary[0]);
  });

  it("uses fallback material when missing", () => {
    const clone = cloneFloorParams({ ...sampleFloor, materialId: undefined as unknown as string }, "fallback");

    expect(clone.materialId).toBe("fallback");
  });

  it("keeps existing material color mapping", () => {
    expect(floorMaterialColor("mat_oak_natural")).toBe(0xb98755);
    expect(floorMaterialColor("mat_worktop_oak")).toBe(0xb98755);
    expect(floorMaterialColor("mat_white_melamine")).toBe(0xf1f3f5);
    expect(floorMaterialColor("other")).toBe(0x9aa3af);
  });

  it("creates fallback geometry for invalid floor boundaries", () => {
    const geometry = makeFloorGeometry({ ...sampleFloor, boundary: [] });

    expect(geometry).toBeInstanceOf(BoxGeometry);
  });

  it("creates floor and closed outline geometries", () => {
    const floorGeometry = makeFloorGeometry(sampleFloor);
    const outlineGeometry = makeFloorOutlineGeometry(sampleFloor);
    const positions = outlineGeometry.getAttribute("position");

    expect(floorGeometry).toBeInstanceOf(ExtrudeGeometry);
    expect(positions.count).toBe(sampleFloor.boundary.length + 1);
    expect(positions.getX(0)).toBe(positions.getX(positions.count - 1));
    expect(positions.getZ(0)).toBe(positions.getZ(positions.count - 1));
  });
});
