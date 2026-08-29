import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createNavigationFocusProvider, getNavigationTargetBounds } from "./navigationFocus";

const meshAt = (x: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.x = x;
  mesh.updateMatrixWorld(true);
  return mesh;
};

describe("navigation focus", () => {
  it("excludes hidden model targets, underlays and section helpers from visible bounds", () => {
    const visible = meshAt(2);
    const hidden = meshAt(20);
    hidden.userData.visibilityHidden = true;
    const bounds = getNavigationTargetBounds(
      [
        { key: "module:visible", root: visible },
        { key: "module:hidden", root: hidden },
        { key: "underlay:main", root: meshAt(40) },
        { key: "section:1", root: meshAt(60) }
      ],
      { visibleOnly: true }
    );

    expect(bounds.min.x).toBeCloseTo(1.5);
    expect(bounds.max.x).toBeCloseTo(2.5);
  });

  it("includes every root of a visible multi-root model target", () => {
    const bounds = getNavigationTargetBounds([
      { key: "custom:1", root: [meshAt(-3), meshAt(4)] }
    ]);

    expect(bounds.min.x).toBeCloseTo(-3.5);
    expect(bounds.max.x).toBeCloseTo(4.5);
  });

  it("prefers exact layout selection bounds and falls back safely for an empty project", () => {
    const exact = new THREE.Box3(new THREE.Vector3(7, 1, 2), new THREE.Vector3(8, 2, 3));
    const provider = createNavigationFocusProvider({
      getMode: () => "layout",
      getBuildSelectionBounds: () => null,
      getLayoutSelectionBounds: () => exact,
      getSelectedTargetKeys: () => [],
      getVisibilityTargets: () => [],
      getBuildProjectBounds: () => new THREE.Box3()
    });

    expect(provider.getSelectionBounds()?.equals(exact)).toBe(true);
    expect(provider.getVisibleProjectBounds().isEmpty()).toBe(false);
    expect(provider.getVisibleProjectBounds().getCenter(new THREE.Vector3()).y).toBeCloseTo(1.3);
  });
});
