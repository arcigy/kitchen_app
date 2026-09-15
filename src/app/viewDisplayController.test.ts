import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createViewDisplayController, resolveViewDisplayMode, type ViewDisplayMode } from "./viewDisplayController";

describe("view display controller", () => {
  it.each(["wireframe", undefined, null, "unknown"])("opens retired or missing display mode %s as solid", value => {
    expect(resolveViewDisplayMode(value)).toBe("solid");
  });
  it.each(["solid", "realistic"] as const)("preserves saved %s mode", mode => {
    expect(resolveViewDisplayMode(mode)).toBe(mode);
  });
  it("rejects retired wireframe requests and keeps newly added surfaces visible", () => {
    const scene = new THREE.Scene();
    const controller = createViewDisplayController(scene);
    controller.setMode("wireframe" as ViewDisplayMode);
    const material = new THREE.MeshStandardMaterial({ color: 0xba8957 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(mesh);
    controller.sync();
    expect(controller.getMode()).toBe("solid");
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(mesh.children.some(child => child instanceof THREE.LineSegments)).toBe(false);
  });

  it.each(["solid", "realistic"] as const)("disables mesh wireframe flags in %s", mode => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ wireframe: true });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const controller = createViewDisplayController(scene);
    controller.setMode(mode);
    expect(material.wireframe).toBe(false);
    material.wireframe = true;
    controller.sync();
    expect(material.wireframe).toBe(false);
  });

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

    controller.setMode("realistic");

    expect(mesh.children.some((child) => child instanceof THREE.LineSegments)).toBe(false);
    expect(material.polygonOffset).toBe(false);
    expect(material.polygonOffsetFactor).toBe(0);
    expect(material.polygonOffsetUnits).toBe(0);

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
  });

  it("preserves geometry, PBR settings and legitimate transparent helpers across mode changes", () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: 0xba8957, metalness: 0.6, roughness: 0.2, envMapIntensity: 1.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [material, material.clone()]);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.name = "windowPick";
    pick.userData.kind = "window";
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.3, transmission: 0.8 }));
    glass.userData.kind = "window";
    glass.userData.viewDisplaySkipMaterialRestore = true;
    scene.add(mesh, pick, glass);
    const before = JSON.stringify(scene.toJSON());
    const controller = createViewDisplayController(scene);
    for (let i = 0; i < 3; i++) {
      controller.setMode("solid");
      expect(material.metalness).toBe(0);
      expect(pick.material.opacity).toBe(0);
      expect(glass.material.opacity).toBe(0.3);
      controller.setMode("realistic");
      expect(JSON.stringify(scene.toJSON())).toBe(before);
    }
  });
});
