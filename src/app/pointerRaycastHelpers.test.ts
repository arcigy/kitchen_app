import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { intersectRayPlane } from "./pointerRaycastHelpers";

describe("pointer raycast helpers", () => {
  it("returns the ray and plane intersection point", () => {
    const raycaster = new THREE.Raycaster(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, -1, 0));
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    expect(intersectRayPlane(raycaster, plane)).toEqual(new THREE.Vector3(1, 0, 3));
  });

  it("returns null when the ray does not intersect the plane", () => {
    const raycaster = new THREE.Raycaster(new THREE.Vector3(1, 2, 3), new THREE.Vector3(1, 0, 0));
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    expect(intersectRayPlane(raycaster, plane)).toBeNull();
  });
});
