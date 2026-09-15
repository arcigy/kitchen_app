import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { ownModulePreviewResources } from "./moduleSettingsResources";

it("owns preview resources while preserving project materials, geometry and textures", () => {
  const sharedGeometry = new THREE.BoxGeometry(); const texture = new THREE.Texture();
  const sharedMaterial = new THREE.MeshStandardMaterial({ map: texture });
  const root = new THREE.Group(); root.add(new THREE.Mesh(sharedGeometry, sharedMaterial), new THREE.Mesh(sharedGeometry, sharedMaterial));
  const geometryDispose = vi.spyOn(sharedGeometry, "dispose"); const materialDispose = vi.spyOn(sharedMaterial, "dispose"); const textureDispose = vi.spyOn(texture, "dispose");
  const dispose = ownModulePreviewResources(root);
  const first = root.children[0] as THREE.Mesh; const second = root.children[1] as THREE.Mesh;
  expect(first.geometry).not.toBe(sharedGeometry); expect(first.material).not.toBe(sharedMaterial); expect(first.material).toBe(second.material);
  const ownedDispose = vi.spyOn(first.material as THREE.Material, "dispose");
  dispose(); dispose(); expect(ownedDispose).toHaveBeenCalledTimes(1);
  expect(geometryDispose).not.toHaveBeenCalled(); expect(materialDispose).not.toHaveBeenCalled(); expect(textureDispose).not.toHaveBeenCalled();
});
