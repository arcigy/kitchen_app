import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  fromMmPoint,
  joinExtensionM,
  mmDist,
  pointOnWallAxisMm,
  snapAxisXZ,
  toMmPoint,
  wallDirOutFromNode,
  wallEndpointWhich,
  wallEndpointToTrimForKeepClick,
  wallExteriorSign
} from "./wallGeometryHelpers";
import type { WallInstance } from "./localTypes";

function wall(id: string, aMm: { x: number; z: number }, bMm: { x: number; z: number }, thicknessMm = 100): WallInstance {
  return {
    id,
    params: {
      aMm,
      bMm,
      thicknessMm,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1
    },
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.LineSegments(),
    heightMm: 2600
  };
}

describe("wallGeometryHelpers", () => {
  it("snaps XZ axis and converts millimetre points", () => {
    expect(snapAxisXZ(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 5, 1), true).toArray()).toEqual([2, 5, 0]);
    expect(snapAxisXZ(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 5, 2), true).toArray()).toEqual([0, 5, 2]);
    expect(toMmPoint(new THREE.Vector3(1.234, 9, -0.456))).toEqual({ x: 1234, z: -456 });
    expect(fromMmPoint({ x: 250, z: 500 }).toArray()).toEqual([0.25, 0, 0.5]);
  });

  it("finds endpoints and closest points on wall axes", () => {
    const item = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });

    expect(mmDist({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(wallEndpointWhich(item, { x: 10, z: 0 }, 25)).toBe("a");
    expect(wallEndpointWhich(item, { x: 990, z: 0 }, 25)).toBe("b");
    expect(wallEndpointWhich(item, { x: 500, z: 0 }, 25)).toBeNull();
    expect(pointOnWallAxisMm(item, { x: 500, z: 200 })).toEqual({ t: 0.5, closest: { x: 500, z: 0 }, distMm: 200 });
  });

  it("resolves wall direction from a joined node and exterior sign", () => {
    const item = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });

    expect(wallDirOutFromNode(item, { x: 0, z: 0 }, 25).toArray()).toEqual([1000, 0, 0]);
    expect(wallDirOutFromNode(item, { x: 1000, z: 0 }, 25).toArray()).toEqual([-1000, 0, 0]);
    expect(wallExteriorSign(item)).toBe(1);
  });

  it("chooses the trim endpoint from the side that should be discarded", () => {
    const item = wall("w1", { x: 0, z: 0 }, { x: 4000, z: 0 });

    expect(wallEndpointToTrimForKeepClick(item, new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0))).toBe("b");
    expect(wallEndpointToTrimForKeepClick(item, new THREE.Vector3(3, 0, 0), new THREE.Vector3(2, 0, 0))).toBe("a");
    expect(wallEndpointToTrimForKeepClick(item, new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0))).toBe("a");
    expect(wallEndpointToTrimForKeepClick(item, new THREE.Vector3(3, 0, 0), new THREE.Vector3(5, 0, 0))).toBe("b");
  });

  it("computes miter-like join extension for angled walls", () => {
    const a = wall("a", { x: 0, z: 0 }, { x: 1000, z: 0 }, 100);
    const b = wall("b", { x: 0, z: 0 }, { x: 0, z: 1000 }, 100);
    const straight = wall("c", { x: 0, z: 0 }, { x: -1000, z: 0 }, 100);

    expect(joinExtensionM(a, { x: 0, z: 0 }, [a], 25)).toBe(0);
    expect(joinExtensionM(a, { x: 0, z: 0 }, [a, b], 25)).toBeCloseTo(0.05);
    expect(joinExtensionM(a, { x: 0, z: 0 }, [a, straight], 25)).toBe(0);
  });
});
