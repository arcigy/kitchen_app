import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import { buildModule } from "./buildModule";

describe("buildModule", () => {
  it("strips automatic catalog materials from editor module geometry", () => {
    const catalog = { materials: [], components: [], kitchenDefaults: {} } as unknown as ClientCatalog;
    const group = buildModule(makeDefaultModuleParams("drawer_low"), catalog);
    const meshes: THREE.Mesh[] = [];

    group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });

    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.userData.catalogMaterialId).toBeUndefined();
      expect(mesh.userData.catalogMaterialName).toBeUndefined();
      expect(mesh.userData.materialRequest).toBeUndefined();
      expect(mesh.userData.materialUnassigned).toBe(true);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        expect(material.userData.materialUnassigned).toBe(true);
      }
    }
  });
});
