import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createLayoutSceneQueries } from "./layoutSceneQueries";
import type { AppState } from "../layout/appState";
import type { LayoutInstance } from "./localTypes";

const createInstance = (): LayoutInstance => {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const moduleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  moduleMesh.userData.instanceId = "m1";
  module.add(moduleMesh);
  root.add(module);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial());
  pick.userData.instanceId = "m1";
  root.add(pick);
  return {
    id: "m1",
    params: { width: 1000, height: 1000, depth: 1000 },
    kitchenGroupId: null,
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(),
    pick,
    outline: new THREE.LineSegments()
  } as unknown as LayoutInstance;
};

describe("createLayoutSceneQueries", () => {
  it("uses real module geometry for 2d elevation picks instead of floorplan pick mesh", () => {
    const inst = createInstance();
    let activeViewerTab = "floorplan";
    const queries = createLayoutSceneQueries({
      instances: [inst],
      kitchenWorktops: [],
      walls: [],
      columns: [],
      floors: [],
      sections: [],
      roomBounds: { halfW: 10, halfD: 10 },
      getWindowInst: () => null,
      getWindowInsts: () => [],
      getDoorInst: () => null,
      getDoorInsts: () => [],
      getViewMode: () => "2d",
      getActiveViewerTab: () => activeViewerTab,
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    expect(queries.getInstanceGeometryMeshes(inst)).toEqual([inst.pick]);

    activeViewerTab = "elevation:north";

    expect(queries.getInstanceGeometryMeshes(inst)).toEqual([inst.module.children[0]]);
  });
});
