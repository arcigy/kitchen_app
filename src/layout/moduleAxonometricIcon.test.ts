import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAxonometricLineSvgFromObject } from "./moduleAxonometricIcon";

describe("createAxonometricLineSvgFromObject", () => {
  it("creates a single-color line SVG from 3D mesh geometry", () => {
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6));
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.05));
    drawer.position.set(0, 1.1, -0.32);
    root.add(body, drawer);

    const svg = createAxonometricLineSvgFromObject(root, { hints: { moduleType: "drawer_low", displayName: "Drawer" } });

    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain("<rect");
    expect(svg.match(/stroke=/g)?.length).toBe(1);
    expect((svg.match(/M/g) ?? []).length).toBeLessThan(12);
    expect(svg).toContain("L35.5 23.4");
  });
});
