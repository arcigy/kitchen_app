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

const getWorldVertices = (mesh: THREE.Mesh) => {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const vertices: THREE.Vector3[] = [];
  for (let i = 0; i < position.count; i += 1) {
    vertices.push(mesh.localToWorld(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i))));
  }
  return vertices;
};

const createTestWallInstance = (id: string, aMm: { x: number; z: number }, bMm: { x: number; z: number }) =>
  ({
    id,
    params: {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1,
      aMm,
      bMm
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 0.15), new THREE.MeshBasicMaterial()),
    outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
  }) as any;

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

  it("keeps individual wall face lines visible through joined floorplan walls", () => {
    const ctx = createTestWallContext();
    const first = createTestWallInstance("first", { x: -5000, z: 0 }, { x: 0, z: 0 });
    const second = createTestWallInstance("second", { x: 0, z: 0 }, { x: -4330, z: 2500 });
    ctx.walls.push(first, second);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const firstFaces = ctx.wallPlanMeshes.get("wallPlan_faces_first");
    const secondFaces = ctx.wallPlanMeshes.get("wallPlan_faces_second");
    expect(firstFaces).toBeTruthy();
    expect(secondFaces).toBeTruthy();
    expect(firstFaces!.renderOrder).toBeLessThan(ctx.wallPlanMeshes.get("wallPlan_union_0")!.renderOrder);
    expect((firstFaces!.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(0);
  });

  it("uses solved wall outlines for clean 3D corner joins without openings", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: 0 }, { x: 0, z: 5000 });
    ctx.walls.push(main, branch);

    const controller = createWallController(ctx);
    controller.rebuildWall(main);
    controller.rebuildWall(branch);

    const branchVertices = getWorldVertices(branch.mesh);
    const branchMinZ = Math.min(...branchVertices.map((point) => point.z));
    const hasMiterLeft = branchVertices.some((point) => Math.abs(point.x + 0.075) < 1e-5 && Math.abs(point.z - 0.075) < 1e-5);
    const hasMiterRight = branchVertices.some((point) => Math.abs(point.x - 0.075) < 1e-5 && Math.abs(point.z + 0.075) < 1e-5);
    expect(branchMinZ).toBeCloseTo(-0.075, 5);
    expect(hasMiterLeft).toBe(true);
    expect(hasMiterRight).toBe(true);
  });

  it("keeps corner wall meshes with openings trimmed to the solved join", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: 0 }, { x: 0, z: 5000 });
    ctx.walls.push(main, branch);
    ctx.getWindowInsts = () =>
      [
        {
          params: {
            wallId: "branch",
            widthMm: 900,
            heightMm: 900,
            sillHeightMm: 900,
            centerMm: 2500
          }
        }
      ] as any;

    const controller = createWallController(ctx);
    controller.rebuildWall(branch);

    const branchVertices = getWorldVertices(branch.mesh);
    const branchMinZ = Math.min(...branchVertices.map((point) => point.z));
    expect(branchMinZ).toBeCloseTo(-0.075, 5);
    expect(branch.mesh.userData.wallCutoutBounds).toHaveLength(1);
  });

  it("adds a 3D bevel filler when a wall join miter is capped", () => {
    const ctx = createTestWallContext();
    const first = createTestWallInstance("first", { x: -5000, z: 0 }, { x: 0, z: 0 });
    const second = createTestWallInstance("second", { x: 0, z: 0 }, { x: -4330, z: 2500 });
    ctx.walls.push(first, second);

    const controller = createWallController(ctx);
    controller.rebuildWallPlanMesh();

    const joinMesh = ctx.wallJoinMeshes.find((mesh) => mesh.name === "wallJoin3d");
    expect(joinMesh).toBeTruthy();
    expect(joinMesh!.parent).toBe(ctx.layoutRoot);
    expect(joinMesh!.visible).toBe(true);
    expect((joinMesh!.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(0);
  });
});
