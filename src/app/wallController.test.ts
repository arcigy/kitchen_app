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

const createPlanCamera = () => {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

const testRect = { width: 1000, height: 1000 } as DOMRect;

const lineHasSegment = (
  line: THREE.Line,
  a: { x: number; z: number },
  b: { x: number; z: number },
  eps = 1e-5
) => {
  const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const close = (i: number, p: { x: number; z: number }) =>
    Math.abs(position.getX(i) - p.x) <= eps && Math.abs(position.getZ(i) - p.z) <= eps;
  for (let i = 0; i + 1 < position.count; i += 2) {
    if ((close(i, a) && close(i + 1, b)) || (close(i, b) && close(i + 1, a))) return true;
  }
  return false;
};

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

  it("shows individual wall face lines only for the selected wall", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = null;
    let selectedWallId: string | null = null;
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    const first = createTestWallInstance("first", { x: -5000, z: 0 }, { x: 0, z: 0 });
    const second = createTestWallInstance("second", { x: 0, z: 0 }, { x: -4330, z: 2500 });
    ctx.walls.push(first, second);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.wallPlanMeshes.get("wallPlan_faces_first")).toBeUndefined();
    expect(ctx.wallPlanMeshes.get("wallPlan_faces_second")).toBeUndefined();

    selectedKind = "wall";
    selectedWallId = "second";
    controller.rebuildWallPlanMesh();

    const firstFaces = ctx.wallPlanMeshes.get("wallPlan_faces_first");
    const secondFaces = ctx.wallPlanMeshes.get("wallPlan_faces_second");
    expect(firstFaces).toBeUndefined();
    expect(secondFaces).toBeTruthy();
    expect(secondFaces!.renderOrder).toBeLessThan(ctx.wallPlanMeshes.get("wallPlan_union_0")!.renderOrder);
    expect((secondFaces!.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(0);
  });

  it("omits the capped wall end base line in angled floorplan joins", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const hiddenBaseStart = { x: -0.075, z: 5 };
    const hiddenBaseEnd = { x: 0.075, z: 5 };
    for (const line of ctx.wallPlanMeshes.values()) {
      expect(lineHasSegment(line, hiddenBaseStart, hiddenBaseEnd)).toBe(false);
    }
  });

  it("keeps angled side-butt joins inside the main wall end face", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    vertical.params.joinEnds = { b: { priority: 10 } };
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.wallSolvedOutlines.get("vertical")).toHaveLength(4);
    expect(Math.max(...ctx.wallSolvedOutlines.get("diagonal")!.map((point) => point.z))).toBeLessThanOrEqual(5.1);
    expect(ctx.wallJoinMeshes.some((mesh) => mesh.name.startsWith("wallJoin3d"))).toBe(false);
  });

  it("passes explicit wall join priority into the plan solver", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    diagonal.params.joinEnds = { a: { priority: 10 } };
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.wallSolvedOutlines.get("diagonal")).toHaveLength(4);
    expect(ctx.wallSolvedOutlines.get("vertical")).toHaveLength(4);
  });

  it("lets dimensions pick solved outline edges on angled wall shapes", () => {
    const ctx = createTestWallContext();
    const camera = createPlanCamera();
    ctx.cam = () => camera;
    const wall = createTestWallInstance("angled", { x: 0, z: 0 }, { x: 4000, z: 0 });
    ctx.walls.push(wall);
    ctx.wallSolvedOutlines.set("angled", [
      { x: 1, z: 0.5 },
      { x: 2, z: 1.5 },
      { x: 2.2, z: 1.7 },
      { x: 1.2, z: 0.7 }
    ]);
    const controller = createWallController(ctx);
    const world = new THREE.Vector3(1.5, 0, 1);
    const mouse = { x: 650, y: 600 };

    expect(controller.pickAlignLineAt(world, mouse, testRect)?.lineRole).not.toBe("edge");
    const picked = controller.pickDimensionLineAt(world, mouse, testRect);

    expect(picked).toMatchObject({
      targetKind: "wall",
      lineRole: "edge",
      wallId: "angled",
      segmentIndex: 0
    });
  });

  it("lets dimensions pick visible wall-plan segments and their endpoint references", () => {
    const ctx = createTestWallContext();
    const camera = createPlanCamera();
    ctx.cam = () => camera;
    const line = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(4, 0.02, 0)
      ]),
      new THREE.LineBasicMaterial()
    );
    line.name = "wallPlan_union_0";
    line.userData.kind = "wallPlanUnion";
    ctx.wallPlanMeshes.set(line.name, line);
    const controller = createWallController(ctx);

    const edge = controller.pickDimensionLineAt(new THREE.Vector3(2, 0, 0), { x: 700, y: 500 }, testRect);
    const endpoint = controller.pickDimensionLineAt(new THREE.Vector3(0, 0, 0), { x: 500, y: 500 }, testRect);

    expect(edge).toMatchObject({
      targetKind: "wall",
      lineRole: "edge",
      segmentIndex: 200000
    });
    expect(endpoint).toMatchObject({
      targetKind: "wall",
      lineRole: "endA",
      segmentIndex: 200001
    });
  });

  it("lets dimensions pick wall opening jambs as references", () => {
    const ctx = createTestWallContext();
    const camera = createPlanCamera();
    ctx.cam = () => camera;
    const wall = createTestWallInstance("with-door", { x: 0, z: 0 }, { x: 4000, z: 0 });
    ctx.walls.push(wall);
    ctx.getDoorInsts = () =>
      [
        {
          id: "door1",
          params: {
            wall: "back",
            wallId: "with-door",
            widthMm: 900,
            heightMm: 2100,
            centerMm: 1000,
            frameWidthMm: 70,
            offsetFromInteriorMm: 0,
            panelThicknessMm: 40,
            swingDirection: "left",
            swingSide: "inward",
            swingAngleDeg: 90,
            handleType: "lever",
            handleOffsetMm: 80,
            handleHeightMm: 1000,
            materialId: "default"
          }
        }
      ] as any;
    const controller = createWallController(ctx);

    const picked = controller.pickDimensionLineAt(new THREE.Vector3(0.55, 0, 0), { x: 555, y: 500 }, testRect);

    expect(picked?.label).toBe("Door opening: left jamb");
    expect(picked).toMatchObject({
      targetKind: "wall",
      lineRole: "edge",
      wallId: "with-door",
      segmentIndex: 300000
    });
  });

  it("merges same-style collinear fragments without a real branch at the shared node", () => {
    const ctx = createTestWallContext();
    const lower = createTestWallInstance("lower", { x: 0, z: 0 }, { x: 0, z: 3000 });
    const middle = createTestWallInstance("middle", { x: 0, z: 3000 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: -3000, z: 8000 });
    ctx.walls.push(lower, middle, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.walls).toHaveLength(2);
    expect(ctx.walls.some((wall) => wall.id === "middle")).toBe(false);
    expect(ctx.walls.some((wall) => wall.id === "diagonal")).toBe(true);
    expect(lower.params.aMm).toEqual({ x: 0, z: 0 });
    expect(lower.params.bMm).toEqual({ x: 0, z: 5000 });
  });

  it("does not merge collinear fragments across a real T branch", () => {
    const ctx = createTestWallContext();
    const lower = createTestWallInstance("lower", { x: 0, z: 0 }, { x: 0, z: 3000 });
    const upper = createTestWallInstance("upper", { x: 0, z: 3000 }, { x: 0, z: 5000 });
    const branch = createTestWallInstance("branch", { x: 0, z: 3000 }, { x: 3000, z: 3000 });
    ctx.walls.push(lower, upper, branch);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.walls.map((wall) => wall.id).sort()).toEqual(["branch", "lower", "upper"]);
  });

  it("keeps wall selection when the selected fragment is merged away", () => {
    const ctx = createTestWallContext();
    let selectedWallId: string | null = "upper";
    const selectedWallIds = new Set<string>(["upper"]);
    ctx.getSelectedWallId = () => selectedWallId;
    ctx.setSelectedWallId = (next) => {
      selectedWallId = next;
    };
    ctx.getSelectedWallIds = () => selectedWallIds;
    const lower = createTestWallInstance("lower", { x: 0, z: 0 }, { x: 0, z: 3000 });
    const upper = createTestWallInstance("upper", { x: 0, z: 3000 }, { x: 0, z: 5000 });
    ctx.walls.push(lower, upper);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.walls).toHaveLength(1);
    expect(selectedWallId).toBe("lower");
    expect(selectedWallIds.has("lower")).toBe(true);
    expect(selectedWallIds.has("upper")).toBe(false);
  });

  it("moves connected trim endpoints atomically to a shared intersection", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 4000, z: 1000 });
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);
    const intersection = { x: 250, z: 4750 };

    const moved = controller.setWallEndpointsAndConnectedMm([
      { wall: vertical, which: "b", next: intersection },
      { wall: diagonal, which: "a", next: intersection }
    ]);

    expect(moved).toBe(true);
    expect(vertical.params.bMm).toEqual(intersection);
    expect(diagonal.params.aMm).toEqual(intersection);
  });

  it("duplicates a wall with its type parameters and clears old join priorities", () => {
    const ctx = createTestWallContext();
    let nextId = 1;
    ctx.nextWallId = () => `copy${nextId++}`;
    const source = createTestWallInstance("source", { x: 100, z: 200 }, { x: 1100, z: 200 });
    source.params.typeId = "partition-150";
    source.params.heightMm = 2800;
    source.params.materialId = "mat";
    source.params.joinEnds = { a: { priority: 5 } };
    ctx.walls.push(source);
    const controller = createWallController(ctx);

    const duplicate = controller.duplicateWall("source", { x: 300, z: -100 });

    expect(duplicate?.id).toBe("copy1");
    expect(duplicate?.params.aMm).toEqual({ x: 400, z: 100 });
    expect(duplicate?.params.bMm).toEqual({ x: 1400, z: 100 });
    expect(duplicate?.params.typeId).toBe("partition-150");
    expect(duplicate?.params.heightMm).toBe(2800);
    expect(duplicate?.params.materialId).toBe("mat");
    expect(duplicate?.params.joinEnds).toBeUndefined();
  });

  it("butts branch wall meshes into the main wall face without openings", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: 0 }, { x: 0, z: 5000 });
    main.params.joinEnds = { a: { priority: 10 } };
    ctx.walls.push(main, branch);

    const controller = createWallController(ctx);
    controller.rebuildWall(main);
    controller.rebuildWall(branch);

    const branchVertices = getWorldVertices(branch.mesh);
    const branchMinZ = Math.min(...branchVertices.map((point) => point.z));
    const hasButtLeft = branchVertices.some((point) => Math.abs(point.x + 0.075) < 1e-5 && Math.abs(point.z - 0.075) < 1e-5);
    const hasButtRight = branchVertices.some((point) => Math.abs(point.x - 0.075) < 1e-5 && Math.abs(point.z - 0.075) < 1e-5);
    expect(branchMinZ).toBeCloseTo(0.075, 5);
    expect(hasButtLeft).toBe(true);
    expect(hasButtRight).toBe(true);
  });

  it("keeps corner wall meshes with openings trimmed to the solved join", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: 0 }, { x: 0, z: 5000 });
    main.params.joinEnds = { a: { priority: 10 } };
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
    expect(branchMinZ).toBeCloseTo(0.075, 5);
    expect(branch.mesh.userData.wallCutoutBounds).toHaveLength(1);
  });

  it("keeps angled branch start seams on the main wall face", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    vertical.params.joinEnds = { b: { priority: 10 } };
    ctx.walls.push(vertical, diagonal);

    const controller = createWallController(ctx);
    controller.rebuildWall(diagonal);

    const diagonalVertices = getWorldVertices(diagonal.mesh);
    const seamVertices = diagonalVertices.filter((point) => Math.abs(point.x - 0.075) < 1e-5 && point.z > 4.7);
    expect(seamVertices.length).toBeGreaterThan(0);
    expect(Math.min(...seamVertices.map((point) => point.z))).toBeLessThan(4.85);
    expect(Math.max(...seamVertices.map((point) => point.z))).toBeLessThanOrEqual(5.000001);
  });

  it("rebuilds remaining wall meshes after deleting a joined wall", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);
    controller.rebuildWall(vertical);
    controller.rebuildWall(diagonal);

    controller.removeWall(diagonal);

    const vertices = getWorldVertices(vertical.mesh);
    const topVertices = vertices.filter((point) => Math.abs(point.z - 5) < 1e-5);
    expect(ctx.walls.map((wall) => wall.id)).toEqual(["vertical"]);
    expect(topVertices.some((point) => Math.abs(point.x + 0.075) < 1e-5)).toBe(true);
    expect(topVertices.some((point) => Math.abs(point.x - 0.075) < 1e-5)).toBe(true);
    expect(Math.max(...vertices.map((point) => point.z))).toBeCloseTo(5, 5);
    expect(Math.min(...vertices.map((point) => point.x))).toBeCloseTo(-0.075, 5);
    expect(Math.max(...vertices.map((point) => point.x))).toBeCloseTo(0.075, 5);
  });

  it("drops orphan micro wall remnants during wall plan rebuilds", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const remnant = createTestWallInstance("remnant", { x: 1200, z: 0 }, { x: 1260, z: 0 });
    ctx.walls.push(main, remnant);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.walls.map((wall) => wall.id)).toEqual(["main"]);
    expect(ctx.layoutRoot.children.includes(remnant.root)).toBe(false);
  });

  it("clears orphan explicit join metadata after the neighbor wall is gone", () => {
    const ctx = createTestWallContext();
    const wall = createTestWallInstance("wall", { x: 0, z: 0 }, { x: 4000, z: 0 });
    wall.params.joinEnds = { b: { priority: 10 } };
    ctx.walls.push(wall);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(wall.params.joinEnds).toBeUndefined();
  });
});
