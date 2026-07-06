import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { getModulePlanLocalPolygon } from "./planSnap";
import { buildModuleEdgeGeometry, buildModulePlanPickGeometry } from "./moduleVisualGeometry";
import type { LayoutInstance } from "./localTypes";

function makePrismGeometry(points: Array<{ x: number; z: number }>, yMin = 0, yMax = 0.018) {
  const positions: number[] = [];
  for (const point of points) positions.push(point.x, yMin, point.z);
  for (const point of points) positions.push(point.x, yMax, point.z);
  const indices: number[] = [];
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index, index + 1, count, count + index + 1, count + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  return geometry;
}

function createChamferedCornerInstance(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const topPanel = new THREE.Mesh(
    makePrismGeometry([
      { x: 0, z: 0 },
      { x: 0.9, z: 0 },
      { x: 0.9, z: 0.58 },
      { x: 0.2, z: 0.58 },
      { x: 0, z: 0.38 }
    ]),
    new THREE.MeshBasicMaterial()
  );
  topPanel.userData.boardName = "top_panel";
  module.add(topPanel);
  root.add(module);
  return {
    id: "corner",
    params: {
      type: "fwm_catalog_base_corner",
      variant: "corner_chamfered",
      cornerShape: "chamfered",
      width: 900,
      depth: 580
    },
    root,
    module,
    kitchenGroupId: null,
    kitchenPlacement: null,
    localBox: new THREE.Box3().setFromObject(module),
    pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
    outline: new THREE.LineSegments()
  } as unknown as LayoutInstance;
}

describe("module plan geometry", () => {
  it("uses the real chamfered corner board silhouette in floorplan instead of a width-depth rectangle", () => {
    const inst = createChamferedCornerInstance();
    const polygon = getModulePlanLocalPolygon(inst, () => new THREE.Vector3());

    expect(polygon).toHaveLength(5);
    expect(polygon.some((point) => Math.abs(point.x - 0.9) < 1e-6 && Math.abs(point.z - 0.58) < 1e-6)).toBe(true);
    expect(polygon.some((point) => Math.abs(point.x) < 1e-6 && Math.abs(point.z - 0.58) < 1e-6)).toBe(false);

    const outline = buildModuleEdgeGeometry(inst, true, () => new THREE.Vector3());
    expect(outline.getAttribute("position").count).toBe(10);

    const pick = buildModulePlanPickGeometry(polygon);
    const pickBox = new THREE.Box3().setFromBufferAttribute(pick.getAttribute("position") as THREE.BufferAttribute);
    expect(pickBox.max.x - pickBox.min.x).toBeCloseTo(0.9);
    expect(pickBox.max.z - pickBox.min.z).toBeCloseTo(0.58);
  });
});
