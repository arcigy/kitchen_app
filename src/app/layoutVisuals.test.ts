import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createSelectionHighlights, createWallSnapMarkers } from "./layoutVisuals";
import type { FloorInstance, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";

const createWall = (id = "wall"): WallInstance =>
  ({
    id,
    params: {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1,
      aMm: { x: 0, z: 0 },
      bMm: { x: 0, z: 5000 }
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.6, 5), new THREE.MeshBasicMaterial()),
    outline: new THREE.LineSegments()
  }) as WallInstance;

const createWorktop = (id = "wt1", kitchenGroupId = "kg1"): KitchenWorktopInstance =>
  ({
    id,
    kitchenGroupId,
    params: {
      path: [
        { x: 0, z: 0 },
        { x: 2000, z: 0 }
      ],
      justification: "back",
      mirrored: false,
      depthMm: 600,
      thicknessMm: 38,
      heightMm: 900,
      overhangSideMm: 0,
      materialId: "oak"
    },
    root: new THREE.Group(),
    mesh: new THREE.Mesh(new THREE.BoxGeometry(2, 0.038, 0.6), new THREE.MeshBasicMaterial()),
    outline: new THREE.Line()
  }) as KitchenWorktopInstance;

const createModuleInstance = (layoutRoot: THREE.Group, id = "module1", width = 1) => {
  const root = new THREE.Group();
  const module = new THREE.Group();
  module.add(new THREE.Mesh(new THREE.BoxGeometry(width, 1, 0.6), new THREE.MeshBasicMaterial()));
  root.add(module);
  layoutRoot.add(root);
  return {
    id,
    root,
    module,
    params: { type: "base" },
    kitchenGroupId: null,
    kitchenPlacement: null,
    localBox: new THREE.Box3(
      new THREE.Vector3(-width / 2, -0.5, -0.3),
      new THREE.Vector3(width / 2, 0.5, 0.3)
    ),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
};

describe("createWallSnapMarkers", () => {
  it("shows only endpoint and axis markers, not every solved outline vertex", () => {
    const layoutRoot = new THREE.Group();
    const wall = createWall();
    const solvedOutlines = new Map([
      [
        "wall",
        [
          { x: -0.075, z: 0 },
          { x: 0.075, z: 0 },
          { x: 0.075, z: 5 },
          { x: 0.075, z: 5.03 },
          { x: -0.075, z: 5.18 },
          { x: -0.075, z: 5 }
        ]
      ]
    ]);
    const { wallSnapMarkers, showWallSnapMarkersFor } = createWallSnapMarkers({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [wall],
      getWallSolvedOutlines: () => solvedOutlines
    });

    showWallSnapMarkersFor("wall");

    expect(wallSnapMarkers.visible).toBe(true);
    expect(wallSnapMarkers.children).toHaveLength(3);
    expect(wallSnapMarkers.children.map((child) => child.userData.snapKind).sort()).toEqual(["axis", "endpoint", "endpoint"]);
  });
});

describe("createSelectionHighlights", () => {
  it("returns exact bounds for the selected worktop wing", () => {
    const layoutRoot = new THREE.Group();
    const worktop = createWorktop();
    worktop.params.path = [
      { x: 0, z: 0 },
      { x: 2000, z: 0 },
      { x: 2000, z: 1000 }
    ];
    worktop.params.segmentDepthsMm = [600, 900];
    layoutRoot.add(worktop.root);
    const { getSelectionBounds } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => null,
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getKitchenWorktops: () => [worktop],
      getSelectedWorktopSegment: () => ({ worktopId: worktop.id, segmentIndex: 1 }),
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    const bounds = getSelectionBounds();

    expect(bounds).not.toBeNull();
    expect(bounds!.max.x - bounds!.min.x).toBeCloseTo(0.9, 5);
    expect(bounds!.max.z - bounds!.min.z).toBeCloseTo(1, 5);
    expect(bounds!.max.y - bounds!.min.y).toBeCloseTo(0.038, 5);
  });

  it("tracks the current selected module after move, geometry rebuild and delete", () => {
    const layoutRoot = new THREE.Group();
    const instance = createModuleInstance(layoutRoot);
    const instances = [instance];
    const selectedIds = new Set([instance.id]);
    const { selectionHighlights, updateSelectionHighlights, syncSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => selectedIds,
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "module",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => instances,
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();
    const initialBounds = new THREE.Box3().setFromObject(selectionHighlights);

    instance.root.position.x = 2;
    expect(syncSelectionHighlights()).toBe(true);
    const movedBounds = new THREE.Box3().setFromObject(selectionHighlights);
    expect(movedBounds.min.x - initialBounds.min.x).toBeCloseTo(2);

    const previousModule = instance.module;
    const rebuiltModule = new THREE.Group();
    rebuiltModule.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.6), new THREE.MeshBasicMaterial()));
    instance.root.remove(previousModule);
    instance.root.add(rebuiltModule);
    instance.module = rebuiltModule;
    expect(syncSelectionHighlights()).toBe(true);
    const rebuiltBounds = new THREE.Box3().setFromObject(selectionHighlights);
    expect(rebuiltBounds.max.x - rebuiltBounds.min.x).toBeCloseTo(1.6);

    instances.splice(0, 1);
    expect(syncSelectionHighlights()).toBe(true);
    expect(selectionHighlights.children).toHaveLength(0);
    expect(selectionHighlights.visible).toBe(false);
  });

  it("highlights selected objects with transparent faces and exact edges", () => {
    const layoutRoot = new THREE.Group();
    const wall = createWall();
    const selectedWallIds = new Set(["wall"]);
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [wall],
      getSelectedWallIds: () => selectedWallIds,
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "wall",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    expect(selectionHighlights.visible).toBe(true);
    expect(selectionHighlights.children.map((child) => child.name).sort()).toEqual(["selectedEdgeHighlight", "selectedFillHighlight"]);
    const fill = selectionHighlights.children.find((child) => child.name === "selectedFillHighlight") as THREE.Mesh;
    const edges = selectionHighlights.children.find((child) => child.name === "selectedEdgeHighlight") as THREE.LineSegments;
    expect(fill).toBeInstanceOf(THREE.Mesh);
    expect(edges).toBeInstanceOf(THREE.LineSegments);
    expect((fill.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.2);
    expect((edges.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(0);
  });

  it("highlights objects that are hidden by floorplan presentation", () => {
    const layoutRoot = new THREE.Group();
    const wall = createWall();
    wall.mesh.visible = false;
    wall.mesh.userData.viewDisplaySkipEdges = true;
    const selectedWallIds = new Set(["wall"]);
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [wall],
      getSelectedWallIds: () => selectedWallIds,
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "wall",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    expect(selectionHighlights.children.map((child) => child.name).sort()).toEqual(["selectedEdgeHighlight", "selectedFillHighlight"]);
  });

  it("semi-highlights hovered objects with blue edges only", () => {
    const layoutRoot = new THREE.Group();
    const { hoverHighlights, updateSelectionHover } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => null,
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getKitchenWorktops: () => [createWorktop()],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHover({ kind: "worktop", id: "wt1" });

    expect(hoverHighlights.visible).toBe(true);
    expect(hoverHighlights.children).toHaveLength(1);
    expect(hoverHighlights.children[0]).toBeInstanceOf(THREE.LineSegments);
    expect(hoverHighlights.children[0]!.name).toBe("hoverEdgeHighlight");
  });

  it("highlights worktops that belong to a selected kitchen group without modules", () => {
    const layoutRoot = new THREE.Group();
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "kitchenGroup",
      getSelectedKitchenGroupId: () => "kg1",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [] as LayoutInstance[],
      getKitchenWorktops: () => [createWorktop()],
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    expect(selectionHighlights.visible).toBe(true);
    expect(selectionHighlights.children.map((child) => child.name).sort()).toEqual(["selectedEdgeHighlight", "selectedFillHighlight"]);
  });

  it("uses one lightweight plan highlight pair per kitchen module instead of every board mesh", () => {
    const layoutRoot = new THREE.Group();
    const instances = Array.from({ length: 30 }, (_, index) => {
      const instance = createModuleInstance(layoutRoot, `module${index + 1}`);
      instance.kitchenGroupId = "kg1";
      for (let board = 0; board < 20; board += 1) {
        instance.module.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial()));
      }
      return instance;
    });
    const selectedIds = new Set(instances.map((instance) => instance.id));
    const { selectionHighlights, updateSelectionHighlights, syncSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => selectedIds,
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "kitchenGroup",
      getSelectedKitchenGroupId: () => "kg1",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => instances,
      getKitchenWorktops: () => [],
      getModuleLocalBackCenter: () => new THREE.Vector3(0, 0, -0.3)
    });

    updateSelectionHighlights();

    expect(selectionHighlights.children).toHaveLength(instances.length * 2);
    expect(selectionHighlights.children.filter((child) => child.name === "selectedKitchenGroupPlanFill")).toHaveLength(instances.length);
    expect(selectionHighlights.children.filter((child) => child.name === "selectedKitchenGroupPlanEdge")).toHaveLength(instances.length);
    expect(syncSelectionHighlights()).toBe(false);
  });

  it("highlights one selected kitchen module from its floorplan footprint, not every hidden 3D board", () => {
    const layoutRoot = new THREE.Group();
    const instance = createModuleInstance(layoutRoot);
    instance.kitchenGroupId = "kg1";
    for (let board = 0; board < 20; board += 1) {
      instance.module.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial()));
    }
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getViewMode: () => "2d",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set([instance.id]),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "module",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [instance],
      getModuleLocalBackCenter: () => new THREE.Vector3(0, 0, -0.3)
    });

    updateSelectionHighlights();

    expect(selectionHighlights.children.map((child) => child.name).sort()).toEqual([
      "selectedModulePlanEdge",
      "selectedModulePlanFill"
    ]);
    const fill = selectionHighlights.children.find((child) => child.name === "selectedModulePlanFill") as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(fill);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(1, 3);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.6, 3);
  });

  it("keeps exact 3D kitchen-group fills while reusing module and outline geometry", () => {
    const layoutRoot = new THREE.Group();
    const instance = createModuleInstance(layoutRoot);
    instance.kitchenGroupId = "kg1";
    instance.outline.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 0.6));
    const sourceGeometry = (instance.module.children[0] as THREE.Mesh).geometry;
    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getViewMode: () => "3d",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set([instance.id]),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "kitchenGroup",
      getSelectedKitchenGroupId: () => "kg1",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [instance],
      getKitchenWorktops: () => [],
      getModuleLocalBackCenter: () => new THREE.Vector3(0, 0, -0.3)
    });

    updateSelectionHighlights();

    const fills = selectionHighlights.children.filter((child) => child.name === "selectedKitchenGroup3dFill") as THREE.Mesh[];
    expect(fills).toHaveLength(1);
    expect(fills[0]!.geometry).toBe(sourceGeometry);
    expect(selectionHighlights.children.filter((child) => child.name === "selectedKitchenGroup3dEdge")).toHaveLength(1);
  });

  it("highlights only the selected submodule inside a selected host module", () => {
    const layoutRoot = new THREE.Group();
    const host = new THREE.Group();
    host.name = "host_module";
    const carcass = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    carcass.name = "host_carcass";
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.2), new THREE.MeshBasicMaterial());
    drawer.name = "tower_drawer_front_1";
    drawer.position.set(0.2, 0.1, 0.7);
    drawer.userData.selectableSubmoduleId = "tower_drawer_1";
    host.add(carcass, drawer);
    const instance = { id: "module1", module: host } as LayoutInstance;

    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set<string>(["module1"]),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => "module",
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [instance],
      getSelectedSubmoduleHighlightTarget: () => ({ kind: "submodule", id: "tower_drawer_1", hostInstanceId: "module1" }),
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    expect(selectionHighlights.children.map((child) => child.name).sort()).toEqual(["selectedEdgeHighlight", "selectedFillHighlight"]);
    const fill = selectionHighlights.children.find((child) => child.name === "selectedFillHighlight") as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(fill);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.4, 3);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(0.3, 3);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.2, 3);
  });

  it("can highlight a selected submodule without selecting the whole host module", () => {
    const layoutRoot = new THREE.Group();
    const host = new THREE.Group();
    const carcass = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.2), new THREE.MeshBasicMaterial());
    drawer.userData.selectableSubmoduleId = "tower_drawer_1";
    host.add(carcass, drawer);
    const instance = { id: "module1", module: host } as LayoutInstance;

    const { selectionHighlights, updateSelectionHighlights } = createSelectionHighlights({
      layoutRoot,
      getMode: () => "layout",
      getWalls: () => [] as WallInstance[],
      getSelectedWallIds: () => new Set<string>(),
      getSelectedInstanceIds: () => new Set<string>(),
      getWallSolvedOutlines: () => new Map(),
      getSelectedKind: () => null,
      getSelectedFloorId: () => null,
      getFloors: () => [] as FloorInstance[],
      getInstances: () => [instance],
      getSelectedSubmoduleHighlightTarget: () => ({ kind: "submodule", id: "tower_drawer_1", hostInstanceId: "module1" }),
      getModuleLocalBackCenter: () => new THREE.Vector3()
    });

    updateSelectionHighlights();

    const fill = selectionHighlights.children.find((child) => child.name === "selectedFillHighlight") as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(fill);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.4, 3);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(0.3, 3);
    expect(bounds.max.z - bounds.min.z).toBeCloseTo(0.2, 3);
  });
});
