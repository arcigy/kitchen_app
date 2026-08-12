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

function createAnchoredFwmCorner90Instance(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.018, 0.58), new THREE.MeshBasicMaterial());
  body.position.set(-0.05, 0, -0.21);
  body.userData.boardName = "bottom_x";
  module.add(body);

  const corner = new THREE.Object3D();
  corner.name = "__kitchen_corner_anchor";
  corner.position.set(-0.5, 0, -0.5);
  module.add(corner);
  const xAnchor = new THREE.Object3D();
  xAnchor.name = "__kitchen_corner_x_anchor";
  xAnchor.position.set(0.4, 0, -0.5);
  module.add(xAnchor);
  const zAnchor = new THREE.Object3D();
  zAnchor.name = "__kitchen_corner_z_anchor";
  zAnchor.position.set(-0.5, 0, 0.4);
  module.add(zAnchor);

  root.add(module);
  return {
    id: "corner90",
    params: {
      type: "fwm_catalog_base_corner",
      variant: "corner_90",
      cornerShape: "l_shape",
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

function createWallCorner90Instance(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const profile = [
    { x: -0.292, z: -0.292 },
    { x: 0.282, z: -0.292 },
    { x: 0.282, z: 0.03 },
    { x: 0.03, z: 0.03 },
    { x: 0.03, z: 0.282 },
    { x: -0.292, z: 0.282 }
  ];
  const topPanel = new THREE.Mesh(makePrismGeometry(profile), new THREE.MeshBasicMaterial());
  topPanel.userData.boardName = "top_panel";
  topPanel.userData.revitPlanProfileMm = profile.map((point) => ({ x: point.x * 1000, z: point.z * 1000 }));
  module.add(topPanel);
  root.add(module);
  return {
    id: "wallCorner90",
    params: {
      type: "fwm_catalog_wall_cabinet",
      variant: "corner_90",
      cornerShape: "l_shape",
      width: 600,
      depth: 330
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

function createProfiledModuleWithHardware(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const profile = [
    { x: -0.4, z: -0.3 }, { x: 0.4, z: -0.3 }, { x: 0.4, z: 0.3 },
    { x: 0.05, z: 0.3 }, { x: -0.4, z: 0.05 }
  ];
  const front = new THREE.Mesh(makePrismGeometry(profile), new THREE.MeshBasicMaterial());
  front.userData.materialGroup = "front";
  front.userData.revitPlanProfileMm = profile.map((point) => ({ x: point.x * 1000, z: point.z * 1000 }));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.1), new THREE.MeshBasicMaterial());
  handle.userData.componentType = "handle";
  handle.userData.revitPlanProfileMm = [
    { x: -750, z: -50 }, { x: 750, z: -50 }, { x: 750, z: 50 }, { x: -750, z: 50 }
  ];
  module.add(front, handle);
  root.add(module);
  return {
    id: "profiled-module",
    params: { type: "catalog_module", width: 800, depth: 600 }, root, module,
    kitchenGroupId: null, kitchenPlacement: null,
    localBox: new THREE.Box3().setFromObject(module),
    pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
    outline: new THREE.LineSegments()
  } as unknown as LayoutInstance;
}

describe("module plan geometry", () => {
  it("suppresses imported triangulation seams when a module board declares a higher edge threshold", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      1, 0, 1,
      0, 0.1, 1
    ], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const root = new THREE.Group();
    const module = new THREE.Group();
    const panel = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    module.add(panel);
    root.add(module);
    const inst = {
      id: "joined-solid",
      params: { type: "fwm_catalog_wall_cabinet" },
      root,
      module,
      localBox: new THREE.Box3().setFromObject(module),
      pick: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
      outline: new THREE.LineSegments()
    } as unknown as LayoutInstance;

    const rawEdges = buildModuleEdgeGeometry(inst, false, () => new THREE.Vector3());
    expect(rawEdges.getAttribute("position").count).toBe(10);

    panel.userData.moduleEdgeThresholdAngleDeg = 28;
    const filteredEdges = buildModuleEdgeGeometry(inst, false, () => new THREE.Vector3());
    expect(filteredEdges.getAttribute("position").count).toBe(8);
  });

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

  it("uses anchored L-corner silhouette for FWM corner 90 instead of a bounding rectangle", () => {
    const inst = createAnchoredFwmCorner90Instance();
    const polygon = getModulePlanLocalPolygon(inst, () => new THREE.Vector3());

    expect(polygon).toHaveLength(6);
    expect(polygon.some((point) => Math.abs(point.x - 0.08) < 1e-6 && Math.abs(point.z - 0.08) < 1e-6)).toBe(true);
    expect(polygon.some((point) => Math.abs(point.x - 0.4) < 1e-6 && Math.abs(point.z - 0.4) < 1e-6)).toBe(false);

    const outline = buildModuleEdgeGeometry(inst, true, () => new THREE.Vector3());
    expect(outline.getAttribute("position").count).toBe(12);
  });

  it("uses the real concave L profile for FWM upper wall corner 90", () => {
    const inst = createWallCorner90Instance();
    const polygon = getModulePlanLocalPolygon(inst, () => new THREE.Vector3());

    expect(polygon).toHaveLength(6);
    expect(polygon.some((point) => Math.abs(point.x - 0.03) < 1e-6 && Math.abs(point.z - 0.03) < 1e-6)).toBe(true);
    expect(polygon.some((point) => Math.abs(point.x - 0.282) < 1e-6 && Math.abs(point.z - 0.282) < 1e-6)).toBe(false);

    const outline = buildModuleEdgeGeometry(inst, true, () => new THREE.Vector3());
    expect(outline.getAttribute("position").count).toBe(12);
  });

  it("uses any approved Revit front profile and excludes hardware from the boundary", () => {
    const polygon = getModulePlanLocalPolygon(createProfiledModuleWithHardware(), () => new THREE.Vector3());

    expect(polygon).toHaveLength(5);
    expect(Math.max(...polygon.map((point) => point.x))).toBeCloseTo(0.4);
    expect(polygon.some((point) => Math.abs(point.x - 0.05) < 1e-6 && Math.abs(point.z - 0.3) < 1e-6)).toBe(true);
  });
});
