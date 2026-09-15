// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureViewportOutput, getTechnicalColors, renderEditorViewport, useProjectViewportAppearance, withViewportAppearance } from "./viewportAppearance";

afterEach(() => { delete document.documentElement.dataset.theme; });
describe("viewport appearance isolation", () => {
  it("draws dark temporarily without touching project background, materials, environment or lights", () => {
    const scene = new THREE.Scene();
    const background = new THREE.Color("#f3f3f3");
    scene.background = background;
    scene.environment = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: "#ba8957" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const light = new THREE.HemisphereLight("#ffffff", "#182231", 1.35);
    scene.add(mesh, light);
    const original = JSON.stringify(scene.toJSON());
    withViewportAppearance(scene, "dark", () => {
      expect((scene.background as THREE.Color).getHexString()).toBe("101722");
      expect(material.color.getHexString()).toBe("ba8957");
      expect(light.intensity).toBe(1.35);
    });
    expect(scene.background).toBe(background);
    expect(JSON.stringify(scene.toJSON())).toBe(original);
  });
  it("respects explicit HDRI and restores the exact background after a failed draw", () => {
    const scene = new THREE.Scene();
    const hdri = new THREE.Texture();
    scene.background = hdri;
    withViewportAppearance(scene, "dark", () => expect(scene.background).toBe(hdri));
    const original = new THREE.Color("#eeeeee");
    scene.background = original;
    expect(() => withViewportAppearance(scene, "dark", () => { throw new Error("draw failed"); })).toThrow();
    expect(scene.background).toBe(original);
  });
  it("exports the neutral frame and restores the visible dark frame even if capture fails", () => {
    document.documentElement.dataset.theme = "dark";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f5f5f5");
    const frames: string[] = [];
    const renderer = { render: vi.fn(() => frames.push((scene.background as THREE.Color).getHexString())) } as unknown as THREE.WebGLRenderer;
    renderEditorViewport(renderer, scene, new THREE.OrthographicCamera());
    captureViewportOutput(renderer, () => expect(frames.at(-1)).toBe("f5f5f5"));
    expect(frames).toEqual(["101722", "f5f5f5", "101722"]);
    expect(() => captureViewportOutput(renderer, () => { throw new Error("capture failed"); })).toThrow();
    expect(frames.at(-1)).toBe("101722");
    expect((scene.background as THREE.Color).getHexString()).toBe("f5f5f5");
    useProjectViewportAppearance(renderer);
    const count = frames.length;
    captureViewportOutput(renderer, () => {});
    expect(frames).toHaveLength(count);
  });
  it("keeps light and dark technical annotation colors distinct and legible", () => {
    expect(getTechnicalColors("dark")).toEqual({ line: "#d4dfed", active: "#78b6ff" });
    expect(getTechnicalColors("light").line).toBe("#333333");
  });
  it("leaves annotation and selection lines unchanged in both themes", () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f5f5f5");
    const material = new THREE.LineBasicMaterial({ color: "#1d2630", opacity: 0.55 });
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry(), material));
    for (const theme of ["light", "dark"] as const) {
      withViewportAppearance(scene, theme, () => {
        expect(material.color.getHexString()).toBe("1d2630");
        expect(material.opacity).toBe(0.55);
      });
    }
  });
});
