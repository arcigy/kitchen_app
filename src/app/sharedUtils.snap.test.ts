import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { snapPointXZ } from "./sharedUtils";

function mesh() {
  const target = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2));
  target.updateMatrixWorld(true);
  return target;
}

describe("legacy surface XZ snapping", () => {
  it("snaps to XZ corners within the shared surface measure tolerance", () => {
    const result = snapPointXZ(new THREE.Vector3(1.01, 0, 1.01), mesh());

    expect(result.kind).toBe("corner");
    expect(result.point).toEqual(new THREE.Vector3(1, 0, 1));
  });

  it("snaps to XZ edges inside a narrow explicit tolerance", () => {
    const result = snapPointXZ(new THREE.Vector3(0.25, 0, 1.004), mesh(), 0.005);

    expect(result.kind).toBe("edge");
    expect(result.point).toEqual(new THREE.Vector3(0.25, 0, 1));
  });

  it("returns free points outside the shared tolerance", () => {
    const point = new THREE.Vector3(0.5, 0, 0.5);
    const result = snapPointXZ(point, mesh());

    expect(result.kind).toBe("free");
    expect(result.point).toEqual(point);
    expect(result.point).not.toBe(point);
  });
});
