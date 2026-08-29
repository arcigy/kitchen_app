import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveNormalGuideCore, resolveNormalGuideSegment } from "./measureGeometryHelpers";

describe("measure geometry helpers", () => {
  it("returns null for a degenerate normal guide base", () => {
    expect(resolveNormalGuideSegment(new THREE.Vector3(1, 0, 2), new THREE.Vector3(1, 0, 2))).toBeNull();
  });

  it("builds a normal guide centered on the first point with the current minimum span", () => {
    const result = resolveNormalGuideSegment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0, 0));

    expect(result?.a).toEqual(new THREE.Vector3(0, 0, -2));
    expect(result?.b).toEqual(new THREE.Vector3(0, 0, 2));
  });

  it("exposes the shared normal guide core direction and span", () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const result = resolveNormalGuideCore(anchor, new THREE.Vector3(1, 0, 0));

    expect(result?.anchor).toBe(anchor);
    expect(result?.direction.x).toBeCloseTo(0);
    expect(result?.direction.y).toBeCloseTo(0);
    expect(result?.direction.z).toBeCloseTo(1);
    expect(result?.spanM).toBe(6);
  });

  it("keeps the current maximum span clamp", () => {
    const result = resolveNormalGuideSegment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));

    expect(result?.a).toEqual(new THREE.Vector3(0, 0, -15));
    expect(result?.b).toEqual(new THREE.Vector3(0, 0, 15));
  });

  it("uses the horizontal XZ direction and preserves the current anchor point", () => {
    const result = resolveNormalGuideSegment(new THREE.Vector3(1, 5, 1), new THREE.Vector3(1, 9, 3));

    expect(result?.a.x).toBeCloseTo(14.416);
    expect(result?.a.y).toBe(5);
    expect(result?.a.z).toBe(1);
    expect(result?.b.x).toBeCloseTo(-12.416);
    expect(result?.b.y).toBe(5);
    expect(result?.b.z).toBe(1);
  });
});
