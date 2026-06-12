import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWallController, WALL_PLAN_FILL_ROTATION_X, type WallControllerContext, type WallPlanMultiPolygon } from "./wallController";
import type { AppState } from "../layout/appState";
import type { DoorInstance, DoorParams, WallInstance, WindowInstance, WindowParams } from "./localTypes";

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
  getShowAllWallSolvedOutlines: () => false,
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

const createTestWallInstance = (id: string, aMm: { x: number; z: number }, bMm: { x: number; z: number }): WallInstance => ({
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
  });

const createTestWindowInstance = (params: Partial<WindowParams> & Pick<WindowParams, "centerMm" | "heightMm" | "sillHeightMm" | "widthMm">): WindowInstance => ({
  id: "window1",
  params: {
    wall: "back",
    wallId: null,
    frameWidthMm: 70,
    offsetFromInteriorMm: 0,
    sashWidthMm: 60,
    sashProfileDepthMm: 40,
    frameProfileDepthMm: 70,
    swingDirection: "left",
    swingSide: "inward",
    swingAngleDeg: 0,
    handleType: "none",
    handleOffsetMm: 0,
    handleHeightMm: 1000,
    materialId: "default",
    ...params
  },
  root: new THREE.Group(),
  frame: new THREE.Group(),
  plan: new THREE.Group(),
  selection: new THREE.Group(),
  pick: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
  outline: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
});

const createTestDoorInstance = (params: Partial<DoorParams> & Pick<DoorParams, "centerMm" | "heightMm" | "widthMm">): DoorInstance => ({
  id: "door1",
  params: {
    wall: "back",
    wallId: null,
    frameWidthMm: 70,
    offsetFromInteriorMm: 0,
    panelThicknessMm: 40,
    swingDirection: "left",
    swingSide: "inward",
    swingAngleDeg: 90,
    handleType: "lever",
    handleOffsetMm: 80,
    handleHeightMm: 1000,
    materialId: "default",
    ...params
  },
  root: new THREE.Group(),
  frame: new THREE.Group(),
  plan: new THREE.Group(),
  selection: new THREE.Group(),
  pick: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
  outline: new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
});

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

const lineSegments = (line: THREE.Line) => {
  const position = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const segments: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];
  for (let i = 0; i + 1 < position.count; i += 2) {
    segments.push([
      { x: position.getX(i), z: position.getZ(i) },
      { x: position.getX(i + 1), z: position.getZ(i + 1) }
    ]);
  }
  return segments;
};

const groupLineSegments = (group: THREE.Group) => {
  const segments: Array<[{ x: number; z: number }, { x: number; z: number }]> = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Line || object instanceof THREE.LineSegments)) return;
    const position = object.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return;
    for (let i = 0; i + 1 < position.count; i += 2) {
      segments.push([
        { x: position.getX(i), z: position.getZ(i) },
        { x: position.getX(i + 1), z: position.getZ(i + 1) }
      ]);
    }
  });
  return segments;
};

const linesHaveSegment = (
  lines: THREE.Line[],
  a: { x: number; z: number },
  b: { x: number; z: number },
  eps = 1e-5
) => lines.some((line) => lineHasSegment(line, a, b, eps));

const segmentsHaveSegment = (
  segments: Array<[{ x: number; z: number }, { x: number; z: number }]>,
  a: { x: number; z: number },
  b: { x: number; z: number },
  eps = 1e-5
) =>
  segments.some(
    ([c, d]) =>
      (Math.abs(c.x - a.x) <= eps && Math.abs(c.z - a.z) <= eps && Math.abs(d.x - b.x) <= eps && Math.abs(d.z - b.z) <= eps) ||
      (Math.abs(c.x - b.x) <= eps && Math.abs(c.z - b.z) <= eps && Math.abs(d.x - a.x) <= eps && Math.abs(d.z - a.z) <= eps)
  );

const expectLineContainsOutline = (line: THREE.Line, outline: Array<{ x: number; z: number }>, eps = 1e-5) => {
  const segments = lineSegments(line);
  expect(segments).toHaveLength(outline.length);
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index]!;
    const b = outline[(index + 1) % outline.length]!;
    expect(
      segments.some(([c, d]) => {
        const direct =
          Math.abs(c.x - a.x) <= eps &&
          Math.abs(c.z - a.z) <= eps &&
          Math.abs(d.x - b.x) <= eps &&
          Math.abs(d.z - b.z) <= eps;
        const reversed =
          Math.abs(c.x - b.x) <= eps &&
          Math.abs(c.z - b.z) <= eps &&
          Math.abs(d.x - a.x) <= eps &&
          Math.abs(d.z - a.z) <= eps;
        return direct || reversed;
      }),
      `missing selected outline segment ${index}`
    ).toBe(true);
  }
};

const properSegmentIntersection = (
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
  eps = 1e-8
) => {
  const orient = (p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < -eps && o3 * o4 < -eps;
};

const expectNoWrongClosingSegment = (line: THREE.Line) => {
  const segments = lineSegments(line);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === segments.length - 1)) continue;
      expect(properSegmentIntersection(segments[i]![0], segments[i]![1], segments[j]![0], segments[j]![1])).toBe(false);
    }
  }
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
      createTestWindowInstance({
          wallId: "w1",
          widthMm: 900,
          heightMm: 900,
          sillHeightMm: 900,
          centerMm: 2000
      });
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
    });
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

  it("regression_selected_wall_outline_only_when_selected", () => {
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
    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();

    selectedKind = "wall";
    selectedWallId = "second";
    controller.rebuildWallPlanMesh();

    const firstFaces = ctx.wallPlanMeshes.get("wallPlan_faces_first");
    const secondFaces = ctx.wallPlanMeshes.get("wallPlan_faces_second");
    expect(firstFaces).toBeUndefined();
    expect(secondFaces).toBeTruthy();
    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();
    expect(secondFaces!.renderOrder).toBeGreaterThan(ctx.wallPlanMeshes.get("wallPlan_union_0")!.renderOrder);
    expectLineContainsOutline(secondFaces!, ctx.wallSolvedOutlines.get("second")!);
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

  it("shows wall face lines only on the selected wall overlay", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = null;
    let selectedWallId: string | null = null;
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    ctx.walls.push(vertical, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const joinStart = ctx.wallSolvedOutlines.get("vertical")![1];
    const joinEnd = ctx.wallSolvedOutlines.get("vertical")![2];
    expect(ctx.wallPlanMeshes.get("wallPlan_faces_vertical")).toBeUndefined();

    selectedKind = "wall";
    selectedWallId = "vertical";
    controller.rebuildWallPlanMesh();

    expect(lineHasSegment(ctx.wallPlanMeshes.get("wallPlan_faces_vertical")!, joinStart, joinEnd)).toBe(true);
    for (const [name, line] of ctx.wallPlanMeshes.entries()) {
      if (name === "wallPlan_faces_vertical") continue;
      if (line.userData.kind !== "wallPlanWallFaces") continue;
      expect(lineHasSegment(line, joinStart, joinEnd)).toBe(false);
    }
  });

  it("regression_selected_wall_outline_is_closed_polygon", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "diagonal";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    const left = createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 });
    const bottom = createTestWallInstance("bottom", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 0 }, { x: 5000, z: 3000 });
    ctx.walls.push(left, bottom, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expectLineContainsOutline(selectedFaces, ctx.wallSolvedOutlines.get("diagonal")!);
    expectNoWrongClosingSegment(selectedFaces);
    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();
  });

  it("regression_selected_outline_follows_ordered_wall_outline", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "diagonal";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 0, z: 0 }, { x: 5000, z: 3000 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expectLineContainsOutline(selectedFaces, ctx.wallSolvedOutlines.get("diagonal")!);
    expectNoWrongClosingSegment(selectedFaces);
    expect(ctx.wallPlanMeshes.get("wallPlan_faces_left")).toBeUndefined();
    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();

    selectedKind = null;
    selectedWallId = null;
    controller.rebuildWallPlanMesh();
    expect([...ctx.wallPlanMeshes.values()].some((line) => line.userData.kind === "wallPlanWallFaces")).toBe(false);
  });

  it("regression_diagonal_wall_selected_outline_matches_clipped_geometry", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "diagonal";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 800, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expect(solvedDiagonal.length).toBeGreaterThanOrEqual(4);
    expect(solvedDiagonal.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expectLineContainsOutline(selectedFaces, solvedDiagonal);
    expectNoWrongClosingSegment(selectedFaces);

    selectedKind = null;
    selectedWallId = null;
    controller.rebuildWallPlanMesh();
    expect(ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")).toBeUndefined();
  });

  it("regression_selected_outline_matches_wall_solved_outline", () => {
    const ctx = createTestWallContext();
    ctx.getSelectedKind = () => "wall";
    ctx.getSelectedWallId = () => "diagonal";
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expect(solvedDiagonal).toHaveLength(4);
    expect(solvedDiagonal.some((point) => Math.abs(point.x - 0.075) < 1e-6 && Math.abs(point.z - 0.075) < 1e-6)).toBe(true);
    expect(solvedDiagonal.some((point) => Math.abs(point.x - 4.925) < 1e-6 && Math.abs(point.z - 2.925) < 1e-6)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[0]!, solvedDiagonal[1]!)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[1]!, solvedDiagonal[2]!)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[0]!, solvedDiagonal[2]!)).toBe(false);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[1]!, solvedDiagonal[3]!)).toBe(false);
    expectLineContainsOutline(selectedFaces, solvedDiagonal);
    expectNoWrongClosingSegment(selectedFaces);
  });

  it("regression_failing_wall_network_case01_selected_outline_matches_solved_outline", () => {
    const ctx = createTestWallContext();
    ctx.getSelectedKind = () => "wall";
    ctx.getSelectedWallId = () => "diagonal";
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expect(solvedDiagonal).toHaveLength(4);
    expect(solvedDiagonal.some((point) => Math.abs(point.x - 0.075) < 1e-6 && Math.abs(point.z - 0.075) < 1e-6)).toBe(true);
    expect(solvedDiagonal.some((point) => Math.abs(point.x - 4.925) < 1e-6 && Math.abs(point.z - 2.925) < 1e-6)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[0]!, solvedDiagonal[1]!)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[1]!, solvedDiagonal[2]!)).toBe(true);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[0]!, solvedDiagonal[2]!)).toBe(false);
    expect(lineHasSegment(selectedFaces, solvedDiagonal[1]!, solvedDiagonal[3]!)).toBe(false);
    expectLineContainsOutline(selectedFaces, solvedDiagonal);
    expectNoWrongClosingSegment(selectedFaces);
    expect([...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanWallFaces")).toHaveLength(1);
  });

  it("keeps selected room brace overlays closed while the union outline stays clean", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "diagonal";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    const left = createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 });
    const top = createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 });
    const right = createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 });
    const bottom = createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 0 }, { x: 5000, z: 3000 });
    ctx.walls.push(left, top, right, bottom, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const diagonalFaces = ctx.wallPlanMeshes.get("wallPlan_faces_diagonal")!;
    expectLineContainsOutline(diagonalFaces, ctx.wallSolvedOutlines.get("diagonal")!);

    selectedWallId = "right";
    controller.rebuildWallPlanMesh();
    const rightFaces = ctx.wallPlanMeshes.get("wallPlan_faces_right")!;
    expectLineContainsOutline(rightFaces, ctx.wallSolvedOutlines.get("right")!);
  });

  it("regression_debug_edges_only_in_debug_mode", () => {
    const ctx = createTestWallContext();
    let debugEnabled = false;
    ctx.getWallDebugEnabled = () => debugEnabled;
    ctx.getWallDebugLayers = () => ({
      centerlines: false,
      perWallOutlines: false,
      offsetEdges: false,
      capEdges: false,
      finalFootprint: false,
      boundaryEdges: true,
      joinNodes: false,
      intersectionPoints: false
    });
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 800, z: 75 }, { x: 4700, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();
    expect(ctx.wallDebugGroup.visible).toBe(false);

    debugEnabled = true;
    controller.rebuildWallPlanMesh();

    expect(ctx.wallPlanMeshes.get("wallPlan_boundary")).toBeUndefined();
    expect(ctx.wallDebugGroup.visible).toBe(true);
    expect(ctx.wallDebugGroup.children.length).toBeGreaterThan(10);
  });

  it("regression_wall_network_no_per_wall_overlap", () => {
    const ctx = createTestWallContext();
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 800, z: 75 }, { x: 4700, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const unionOutlines = [...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanUnion");
    const rawWallFaceOverlays = [...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanWallFaces");
    const boundary = ctx.wallPlanMeshes.get("wallPlan_boundary");

    expect(unionOutlines.length).toBeGreaterThan(0);
    expect(rawWallFaceOverlays).toHaveLength(0);
    expect(boundary).toBeUndefined();
    expect(unionOutlines.flatMap(lineSegments).length).toBeGreaterThan(10);
  });

  it("does not draw old solver tail segments through a multi-wall union join", () => {
    const ctx = createTestWallContext();
    const top = createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 });
    const right = createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 });
    const inside = createTestWallInstance("inside", { x: 0, z: 0 }, { x: 5000, z: 3000 });
    const outside = createTestWallInstance("outside", { x: 5000, z: 3000 }, { x: 8000, z: 4500 });
    ctx.walls.push(top, right, inside, outside);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const topOutline = ctx.wallSolvedOutlines.get("top")!;
    const rightOutline = ctx.wallSolvedOutlines.get("right")!;
    const union = ctx.wallPlanMeshes.get("wallPlan_union_0")!;
    expect(lineHasSegment(union, topOutline[1]!, rightOutline[1]!, 1e-4)).toBe(false);
    expect((union.geometry.getAttribute("position") as THREE.BufferAttribute).count).toBeGreaterThan(4);
  });

  it("draws every final union boundary segment without hiding exterior corner spans", () => {
    const ctx = createTestWallContext();
    let capturedUnion: WallPlanMultiPolygon | null = null;
    ctx.setWallUnionPolys = (next) => {
      capturedUnion = next;
    };
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const unionLines = [...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanUnion");
    expect(unionLines.length).toBeGreaterThan(0);
    expect(capturedUnion).toBeTruthy();
    for (const polygon of capturedUnion!) {
      for (const ring of polygon) {
        const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
        for (let index = 0; index < pts.length; index += 1) {
          const aRaw = pts[index]!;
          const bRaw = pts[(index + 1) % pts.length]!;
          const a = { x: aRaw[0], z: aRaw[1] };
          const b = { x: bRaw[0], z: bRaw[1] };
          expect(linesHaveSegment(unionLines, a, b, 1e-4), `missing union boundary ${JSON.stringify({ a, b })}`).toBe(true);
        }
      }
    }
  });

  it("temporarily shows solved green outlines for every wall, not just the selected wall", () => {
    const ctx = createTestWallContext();
    ctx.getShowAllWallSolvedOutlines = () => true;
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const allSolvedFaceLines = [...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanAllSolvedFaces");
    expect(allSolvedFaceLines).toHaveLength(ctx.walls.length);
    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    const diagonalAllFaces = ctx.wallPlanMeshes.get("wallPlan_all_faces_diagonal")!;
    expect(solvedDiagonal).toHaveLength(4);
    expect(lineHasSegment(diagonalAllFaces, solvedDiagonal[0]!, solvedDiagonal[1]!)).toBe(true);
    expect(lineHasSegment(diagonalAllFaces, solvedDiagonal[2]!, solvedDiagonal[3]!)).toBe(true);
    expect(lineHasSegment(diagonalAllFaces, solvedDiagonal[1]!, solvedDiagonal[2]!)).toBe(false);
    expect(lineHasSegment(diagonalAllFaces, solvedDiagonal[3]!, solvedDiagonal[0]!)).toBe(false);
    expect(lineHasSegment(diagonalAllFaces, { x: 0.075, z: 0.1619905496203105 }, { x: 0.22303654935386175, z: 0.075 })).toBe(false);
    expect(lineHasSegment(diagonalAllFaces, { x: 4.925, z: 2.8380094503796895 }, { x: 4.7769634506461385, z: 2.925 })).toBe(false);
  });

  it("regression_debug_body_join_edges_do_not_redraw_old_direct_cap", () => {
    const ctx = createTestWallContext();
    ctx.getWallDebugEnabled = () => true;
    ctx.getWallDebugLayers = () => ({
      centerlines: false,
      perWallOutlines: false,
      offsetEdges: false,
      capEdges: true,
      finalFootprint: true,
      boundaryEdges: true,
      joinNodes: false,
      intersectionPoints: false
    });
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 3000 }),
      createTestWallInstance("top", { x: 0, z: 3000 }, { x: 5000, z: 3000 }),
      createTestWallInstance("right", { x: 5000, z: 3000 }, { x: 5000, z: 0 }),
      createTestWallInstance("bottom", { x: 5000, z: 0 }, { x: 0, z: 0 }),
      createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 4925, z: 2925 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    const segments = groupLineSegments(ctx.wallDebugGroup);
    expect(solvedDiagonal).toHaveLength(4);
    expect(segmentsHaveSegment(segments, { x: 0.075, z: 0.1619905496203105 }, { x: 0.075, z: 0.075 })).toBe(false);
    expect(segmentsHaveSegment(segments, { x: 0.075, z: 0.1619905496203105 }, { x: 0.22303654935386175, z: 0.075 })).toBe(false);
    expect(segmentsHaveSegment(segments, { x: 4.925, z: 2.8380094503796895 }, { x: 4.925, z: 2.925 })).toBe(false);
    expect(segmentsHaveSegment(segments, { x: 4.925, z: 2.8380094503796895 }, { x: 4.7769634506461385, z: 2.925 })).toBe(false);
  });

  it("renders a three-wall same-endpoint join from union lines without raw wall face overlays", () => {
    const ctx = createTestWallContext();
    ctx.walls.push(
      createTestWallInstance("east", { x: 0, z: 0 }, { x: 4000, z: 0 }),
      createTestWallInstance("north", { x: 0, z: 0 }, { x: 0, z: 4000 }),
      createTestWallInstance("angled", { x: 0, z: 0 }, { x: 3500, z: 2200 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect([...ctx.wallPlanMeshes.values()].filter((line) => line.userData.kind === "wallPlanUnion").length).toBeGreaterThan(0);
    expect([...ctx.wallPlanMeshes.values()].some((line) => line.userData.kind === "wallPlanWallFaces")).toBe(false);
  });

  it("draws selected four-wall star join as a closed wall outline", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "east";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    ctx.walls.push(
      createTestWallInstance("east", { x: 0, z: 0 }, { x: 4000, z: 0 }),
      createTestWallInstance("north", { x: 0, z: 0 }, { x: 0, z: 4000 }),
      createTestWallInstance("west", { x: 0, z: 0 }, { x: -4000, z: 0 }),
      createTestWallInstance("south", { x: 0, z: 0 }, { x: 0, z: -4000 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_east")!;
    expect(selectedFaces).toBeTruthy();
    expectLineContainsOutline(selectedFaces, ctx.wallSolvedOutlines.get("east")!);
  });

  it("draws selected T-join branch as a closed wall outline", () => {
    const ctx = createTestWallContext();
    let selectedKind: string | null = "wall";
    let selectedWallId: string | null = "branch";
    ctx.getSelectedKind = () => selectedKind;
    ctx.getSelectedWallId = () => selectedWallId;
    ctx.walls.push(
      createTestWallInstance("host", { x: -4000, z: 0 }, { x: 4000, z: 0 }),
      createTestWallInstance("branch", { x: 0, z: -3000 }, { x: 0, z: 0 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    const selectedFaces = ctx.wallPlanMeshes.get("wallPlan_faces_branch")!;
    expect(selectedFaces).toBeTruthy();
    expectLineContainsOutline(selectedFaces, ctx.wallSolvedOutlines.get("branch")!);
  });

  it("keeps angled two-wall unions visible without auxiliary join meshes", () => {
    const ctx = createTestWallContext();
    const top = createTestWallInstance("top", { x: 0, z: 5000 }, { x: 5000, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 5000, z: 5000 }, { x: 2000, z: 0 });
    ctx.walls.push(top, diagonal);
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(ctx.wallPlanMeshes.get("wallPlan_union_0")).toBeTruthy();
    expect(ctx.wallJoinMeshes.some((mesh) => mesh.name.startsWith("wallJoin3d"))).toBe(false);
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
    expect(Math.max(...ctx.wallSolvedOutlines.get("diagonal")!.map((point) => point.z))).toBeCloseTo(5.181066, 5);
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
        createTestDoorInstance({
            wallId: "with-door",
            widthMm: 900,
            heightMm: 2100,
            centerMm: 1000
        })
      ];
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

  it("keeps branch wall meshes full thickness at two-wall corners without openings", () => {
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
    const branchMaxZ = Math.max(...branchVertices.map((point) => point.z));
    const branchMinX = Math.min(...branchVertices.map((point) => point.x));
    const branchMaxX = Math.max(...branchVertices.map((point) => point.x));
    expect(branchMinZ).toBeCloseTo(0.075, 5);
    expect(branchMaxZ).toBeCloseTo(5, 5);
    expect(branchMaxX - branchMinX).toBeCloseTo(0.15, 5);
  });

  it("keeps corner wall meshes with openings full thickness", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 5000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: 0 }, { x: 0, z: 5000 });
    main.params.joinEnds = { a: { priority: 10 } };
    ctx.walls.push(main, branch);
    ctx.getWindowInsts = () =>
      [
        createTestWindowInstance({
            wallId: "branch",
            widthMm: 900,
            heightMm: 900,
            sillHeightMm: 900,
            centerMm: 2500
        })
      ];

    const controller = createWallController(ctx);
    controller.rebuildWall(branch);

    const branchVertices = getWorldVertices(branch.mesh);
    const branchMinZ = Math.min(...branchVertices.map((point) => point.z));
    expect(branchMinZ).toBeCloseTo(0.075, 5);
    expect(branch.mesh.userData.wallCutoutBounds).toHaveLength(1);
  });

  it("keeps angled branch starts full thickness at two-wall corners", () => {
    const ctx = createTestWallContext();
    const vertical = createTestWallInstance("vertical", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const diagonal = createTestWallInstance("diagonal", { x: 0, z: 5000 }, { x: 5000, z: 0 });
    vertical.params.joinEnds = { b: { priority: 10 } };
    ctx.walls.push(vertical, diagonal);

    const controller = createWallController(ctx);
    controller.rebuildWall(diagonal);

    const diagonalVertices = getWorldVertices(diagonal.mesh);
    const zValuesNearStart = diagonalVertices.map((point) => point.z).filter((z) => z > 4.8);
    expect(zValuesNearStart.length).toBeGreaterThan(1);
    expect(Math.max(...zValuesNearStart) - Math.min(...zValuesNearStart)).toBeGreaterThan(0.09);
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

  it("freezes a remaining wall end at the visible join line before deleting its joined wall", () => {
    const ctx = createTestWallContext();
    const side = createTestWallInstance("side", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const top = createTestWallInstance("top", { x: 0, z: 5000 }, { x: 4000, z: 5000 });
    side.params.joinEnds = { b: { priority: 10 } };
    ctx.walls.push(side, top);
    const controller = createWallController(ctx);
    controller.rebuildWallPlanMesh();

    controller.removeWall(side);

    const vertices = getWorldVertices(top.mesh);
    expect(ctx.walls.map((wall) => wall.id)).toEqual(["top"]);
    expect(top.params.aMm).toEqual({ x: 0, z: 5000 });
    expect(Math.min(...vertices.map((point) => point.x))).toBeCloseTo(0, 5);
  });

  it("keeps surviving corner joins live when deleting one wall from the node", () => {
    const ctx = createTestWallContext();
    const side = createTestWallInstance("side", { x: 0, z: 0 }, { x: 0, z: 5000 });
    const bottom = createTestWallInstance("bottom", { x: 0, z: 0 }, { x: 8000, z: 0 });
    const diagonal = createTestWallInstance("diagonal", { x: 75, z: 75 }, { x: 8000, z: 5000 });
    ctx.walls.push(side, bottom, diagonal);
    const controller = createWallController(ctx);
    controller.rebuildWallPlanMesh();

    controller.removeWall(side);

    expect(ctx.walls.map((wall) => wall.id).sort()).toEqual(["bottom", "diagonal"]);
    expect(bottom.params.aMm).toEqual({ x: 0, z: 0 });
    const solvedDiagonal = ctx.wallSolvedOutlines.get("diagonal")!;
    expect(solvedDiagonal).toHaveLength(4);
    expect(solvedDiagonal.some((point) => Math.hypot(point.x - 0.3002766, point.z - 0.1125) < 0.01)).toBe(true);
    expect(solvedDiagonal.some((point) => Math.hypot(point.x + 0.2252766, point.z + 0.0375) < 0.01)).toBe(true);
  });

  it("keeps a continuous wall unsplit when a new wall joins its middle", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: -4000, z: 0 }, { x: 4000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 0, z: -4000 }, { x: 0, z: 0 });
    ctx.walls.push(main, branch);
    const controller = createWallController(ctx);

    controller.autoJoinAtMmPoint(branch.params.bMm);

    expect(ctx.walls.map((wall) => wall.id)).toEqual(["main", "branch"]);
    expect(main.params.aMm).toEqual({ x: -4000, z: 0 });
    expect(main.params.bMm).toEqual({ x: 4000, z: 0 });
    const solvedBranch = ctx.wallSolvedOutlines.get("branch")!;
    const branchEndPoints = solvedBranch.filter((point) => Math.abs(point.x) <= 0.08 && Math.abs(point.z + 0.075) <= 1e-6);
    expect(branchEndPoints).toHaveLength(2);
  });

  it("does not move an existing wall endpoint when a new near endpoint auto-joins", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 20, z: 0 }, { x: 20, z: 3000 });
    ctx.walls.push(main, branch);
    const controller = createWallController(ctx);

    controller.autoJoinAtMmPoint(branch.params.aMm);

    expect(main.params.aMm).toEqual({ x: 0, z: 0 });
    expect(main.params.bMm).toEqual({ x: 4000, z: 0 });
    expect(branch.params.aMm).toEqual({ x: 20, z: 0 });
  });

  it("moves only exactly linked endpoint groups when translating a wall", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 20, z: 0 }, { x: 20, z: 3000 });
    ctx.walls.push(main, branch);
    const controller = createWallController(ctx);

    controller.translateWallAndConnected(branch, 100, 0);

    expect(main.params.aMm).toEqual({ x: 0, z: 0 });
    expect(main.params.bMm).toEqual({ x: 4000, z: 0 });
    expect(branch.params.aMm).toEqual({ x: 120, z: 0 });
    expect(branch.params.bMm).toEqual({ x: 120, z: 3000 });
  });

  it("does not drag a nearby main endpoint when editing a branch endpoint", () => {
    const ctx = createTestWallContext();
    const main = createTestWallInstance("main", { x: 0, z: 0 }, { x: 4000, z: 0 });
    const branch = createTestWallInstance("branch", { x: 20, z: 0 }, { x: 20, z: 3000 });
    ctx.walls.push(main, branch);
    const controller = createWallController(ctx);

    const moved = controller.setWallEndpointAndConnectedMm(branch, "a", { x: 120, z: 0 });

    expect(moved).toBe(true);
    expect(main.params.aMm).toEqual({ x: 0, z: 0 });
    expect(main.params.bMm).toEqual({ x: 4000, z: 0 });
    expect(branch.params.aMm).toEqual({ x: 120, z: 0 });
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

  it("refreshes selected wall highlights after solved joins are rebuilt", () => {
    const ctx = createTestWallContext();
    const selectedWallIds = new Set<string>(["left"]);
    let refreshCount = 0;
    ctx.getViewMode = () => "2d";
    ctx.getSelectedKind = () => "wall";
    ctx.getSelectedWallId = () => "left";
    ctx.getSelectedWallIds = () => selectedWallIds;
    ctx.updateSelectionHighlights = () => {
      refreshCount += 1;
    };
    ctx.walls.push(
      createTestWallInstance("left", { x: 0, z: 0 }, { x: 0, z: 5000 }),
      createTestWallInstance("top", { x: 0, z: 5000 }, { x: 5000, z: 5000 })
    );
    const controller = createWallController(ctx);

    controller.rebuildWallPlanMesh();

    expect(refreshCount).toBe(1);
    const solved = ctx.wallSolvedOutlines.get("left");
    expect(solved).toBeDefined();
    expect(solved?.some((point) => point.x !== 0 && point.z > 4.9)).toBe(true);
  });
});
