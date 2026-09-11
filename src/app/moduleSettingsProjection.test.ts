import * as THREE from "three";
import { expect, it } from "vitest";
import { projectModuleSettingsPoint } from "./moduleSettingsProjection";

it("projects mirrored and rotated builder references through their parent transforms", () => {
  const parent = new THREE.Group(); parent.position.y = .5;
  const root = new THREE.Group(); root.position.x = 1; root.scale.x = -1; root.rotation.z = Math.PI / 2; parent.add(root);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 20);
  camera.position.z = 8; camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const point = new THREE.Vector3(.25, .5, 0);
  const screen = projectModuleSettingsPoint(point, camera, { width: 800, height: 800 }, root);
  // Mirror (-.25,.5), rotate (-.5,-.25), then translate (.5,.25) in world space.
  expect(screen.x).toBeCloseTo(500); expect(screen.y).toBeCloseTo(350);
  expect(screen.z).toBeGreaterThan(-1); expect(screen.z).toBeLessThan(1);
  expect(point.toArray()).toEqual([.25, .5, 0]);
});
