import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createViewDisplayController } from "./viewDisplayController";

describe("view display controller", () => {
  it("draws generated mesh edge lines above coplanar solid surfaces without disabling depth test", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      material
    );
    scene.add(mesh);

    const controller = createViewDisplayController(scene);
    controller.setMode("solid");

    const edge = mesh.children.find((child): child is THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> =>
      child instanceof THREE.LineSegments
    );
    expect(edge).toBeTruthy();
    expect(edge?.material.depthTest).toBe(true);
    expect(edge?.material.depthWrite).toBe(false);
    expect(edge?.renderOrder).toBeGreaterThan(mesh.renderOrder);
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(1);
    expect(material.polygonOffsetUnits).toBe(1);

    controller.setMode("realistic");

    expect(material.polygonOffset).toBe(false);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(0);

    controller.dispose();
  });
});
