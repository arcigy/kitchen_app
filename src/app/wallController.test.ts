import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWallController, WALL_PLAN_FILL_ROTATION_X, type WallControllerContext } from "./wallController";
import type { AppState } from "../layout/appState";

const createTestWallContext = (): WallControllerContext => ({
  walls: [],
  instances: [],
  kitchenWorktops: [],
  layoutRoot: new THREE.Group(),
  wallPlanGroup: new THREE.Group(),
  wallPlanMeshes: new Map(),
  wallJoinMeshes: [],
  wallDebugGroup: new THREE.Group(),
  wallSolvedOutlines: new Map(),
  wallDefault: {
    thicknessMm: 180,
    heightMm: 2600,
    materialId: "default",
    justification: "center",
    exteriorSign: 1
  },
  wallJoinTolMm: 40,
  pinnedWallIds: new Set(),
  S: {} as AppState,
  cam: () => new THREE.PerspectiveCamera(),
  getModuleLocalBackCenter: () => new THREE.Vector3(),
  getKitchenWorktopGuidePathForAlign: () => [],
  moduleOverlapsWalls: () => false,
  setUnderlayStatus: () => {},
  showWallSnapMarkersFor: () => {},
  getViewMode: () => "3d",
  getSelectedKind: () => null,
  getSelectedWallId: () => null,
  setSelectedWallId: () => {},
  getWallDebugEnabled: () => false,
  setWallSolvedJoinPolys: () => {},
  setWallUnionPolys: () => {},
  nextWallId: () => "w1"
});

describe("wall plan fill", () => {
  it("keeps shape geometry Z coordinates on the same floorplan side", () => {
    const point = new THREE.Vector3(1.25, 2.5, 0).applyEuler(new THREE.Euler(WALL_PLAN_FILL_ROTATION_X, 0, 0));

    expect(point.x).toBeCloseTo(1.25);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(2.5);
  });

  it("uses cutout face material instead of adding reveal overlay meshes", () => {
    const controller = createWallController(createTestWallContext());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.18), new THREE.MeshBasicMaterial());

    controller.updateWallMesh(
      mesh,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0),
      180,
      2600,
      { centerLocalX: 0, widthM: 1, sillM: 0.8, heightM: 1.2 },
      true
    );

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    expect(materials).toHaveLength(2);
    expect((materials[1] as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    expect(mesh.geometry.groups.some((group) => group.materialIndex === 1)).toBe(true);
    expect(mesh.children.some((child) => child.name === "wallWindowCutoutReveal")).toBe(false);
  });

  it("keeps wall face lines through the window opening in floorplan", () => {
    const ctx = createTestWallContext();
    ctx.getWindowInst = () =>
      ({
        params: {
          wallId: "w1",
          widthMm: 900,
          heightMm: 900,
          sillHeightMm: 900,
          centerMm: 2000
        }
      }) as any;
    ctx.walls.push({
      id: "w1",
      params: {
        thicknessMm: 180,
        heightMm: 2600,
        materialId: "default",
        justification: "center",
        exteriorSign: 1,
        aMm: { x: 0, z: 0 },
        bMm: { x: 4000, z: 0 }
      },
      heightMm: 2600,
      root: new THREE.Group(),
      mesh: new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 0.18), new THREE.MeshBasicMaterial()),
      outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
    } as any);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const line = ctx.wallPlanMeshes.get("wallPlan_window_parapet");
    expect(line).toBeTruthy();
    const position = line!.geometry.getAttribute("position");
    expect(position.count).toBe(4);
    expect(position.getX(0)).toBeCloseTo(1.55);
    expect(position.getX(1)).toBeCloseTo(2.45);
    expect(position.getZ(0)).toBeCloseTo(-0.09);
    expect(position.getZ(2)).toBeCloseTo(0.09);
  });
});
