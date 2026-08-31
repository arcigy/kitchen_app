import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createViewDisplayController } from "./viewDisplayController";

describe("view display controller", () => {
  it("keeps solid mode free of global edge overlays", () => {
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
    expect(edge).toBeFalsy();
    expect(material.polygonOffset).toBe(false);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(0);

    controller.setMode("wireframe");
    const wireframeEdge = mesh.children.find((child): child is THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> =>
      child instanceof THREE.LineSegments
    );
    expect(wireframeEdge).toBeTruthy();
    expect(wireframeEdge?.material.depthTest).toBe(true);
    expect(wireframeEdge?.material.depthWrite).toBe(false);
    expect(wireframeEdge?.renderOrder).toBeGreaterThan(mesh.renderOrder);

    controller.setMode("realistic");

    expect(mesh.children.some((child) => child instanceof THREE.LineSegments)).toBe(false);
    expect(material.polygonOffset).toBe(false);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(0);

    controller.dispose();
  });

  it("makes a newly synchronized preview material opaque in Solid and restores it for Realistic", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    scene.add(mesh);

    const controller = createViewDisplayController(scene);
    controller.setMode("solid");

    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
    expect(mesh.children.some((child) => child instanceof THREE.LineSegments)).toBe(false);

    controller.setMode("realistic");

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.35);
    expect(material.depthWrite).toBe(false);
    controller.dispose();
  });
});
