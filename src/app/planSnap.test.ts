import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPlanSnapper, resolveWallSnapBindingPoint, type PlanSnapResult } from "./planSnap";
import type { ColumnInstance, SectionInstance, WallInstance, WindowInstance } from "./localTypes";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";

const wall = (id: string, aMm = { x: 0, z: 0 }, bMm = { x: 4000, z: 0 }): WallInstance =>
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
    }
  }) as WallInstance;

const planCamera = () => {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

const baseSnapperArgs = (patch = {}) => ({
  getWalls: () => [],
  getInstances: () => [],
  getFloors: () => [],
  getColumns: () => [],
  getSections: () => [],
  getWindows: () => [],
  getDoors: () => [],
  getCustomFurniture: () => [],
  getKitchenWorktops: () => [],
  getWallSolvedOutlines: () => new Map(),
  getWallSolvedJoinPolys: () => [],
  getWallUnionPolys: () => null,
  getLayoutTool: () => "select",
  getWallChainStart: () => null,
  getModuleLocalBackCenter: () => new THREE.Vector3(),
  getKitchenWorktopPolygon: () => [],
  ...patch
});

describe("plan wall snap binding points", () => {
  it("projects wall outline snap points back to the wall axis for drawing joins", () => {
    const snap = {
      point: new THREE.Vector3(2, 0, 0.075),
      kind: "edge",
      owner: "wall",
      binding: { type: "wallCenterline", wallId: "w1", t: 0.5, normalOffsetMm: 75 }
    } satisfies PlanSnapResult;

    const point = resolveWallSnapBindingPoint([wall("w1")], snap, new THREE.Vector3(9, 0, 9));

    expect(point.x).toBeCloseTo(2);
    expect(point.z).toBeCloseTo(0);
  });

  it("uses the real wall endpoint when an outline corner binds to an endpoint", () => {
    const snap = {
      point: new THREE.Vector3(0, 0, 0.075),
      kind: "corner",
      owner: "wall",
      binding: { type: "wallEndpoint", wallId: "w1", endpoint: "a", normalOffsetMm: 75 }
    } satisfies PlanSnapResult;

    const point = resolveWallSnapBindingPoint([wall("w1")], snap, new THREE.Vector3(9, 0, 9));

    expect(point.x).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
  });

  it("offers the centerline intersection of crossing walls as a snap corner", () => {
    const walls = [
      wall("a", { x: -4000, z: -4000 }, { x: 4000, z: 4000 }),
      wall("b", { x: -4000, z: 4000 }, { x: 4000, z: -4000 })
    ];
    const snap = createPlanSnapper({
      getWalls: () => walls,
      getInstances: () => [],
      getFloors: () => [],
      getKitchenWorktops: () => [],
      getWallSolvedOutlines: () => new Map(),
      getWallSolvedJoinPolys: () => [],
      getWallUnionPolys: () => null,
      getLayoutTool: () => "wall",
      getWallChainStart: () => null,
      getModuleLocalBackCenter: () => new THREE.Vector3(),
      getKitchenWorktopPolygon: () => []
    });

    const result = snap(new THREE.Vector3(0.03, 0, -0.02), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("corner");
    expect(result.point.x).toBeCloseTo(0);
    expect(result.point.z).toBeCloseTo(0);
    expect(result.binding?.type).toBe("wallCenterline");
  });

  it("prefers a wall axis intersection over a nearby outline corner", () => {
    const walls = [
      wall("top", { x: 0, z: 0 }, { x: 4000, z: 0 }),
      wall("right", { x: 4000, z: 0 }, { x: 4000, z: 4000 })
    ];
    const outlines = new Map([
      [
        "top",
        [
          { x: 4.075, z: 0.075 },
          { x: 4.2, z: 0.075 },
          { x: 4.2, z: 0.2 },
          { x: 4.075, z: 0.2 }
        ]
      ]
    ]);
    const snap = createPlanSnapper({
      getWalls: () => walls,
      getInstances: () => [],
      getFloors: () => [],
      getKitchenWorktops: () => [],
      getWallSolvedOutlines: () => outlines,
      getWallSolvedJoinPolys: () => [],
      getWallUnionPolys: () => null,
      getLayoutTool: () => "wall",
      getWallChainStart: () => null,
      getModuleLocalBackCenter: () => new THREE.Vector3(),
      getKitchenWorktopPolygon: () => []
    });

    const stickyOutline = {
      point: new THREE.Vector3(4.075, 0, 0.075),
      kind: "corner",
      owner: "wall",
      binding: { type: "wallCenterline", wallId: "top", t: 1, normalOffsetMm: 75 }
    } satisfies PlanSnapResult;
    const result = snap(new THREE.Vector3(4.075, 0, 0.075), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14, {
      sticky: stickyOutline
    });

    expect(result.kind).toBe("corner");
    expect(result.point.x).toBeCloseTo(4);
    expect(result.point.z).toBeCloseTo(0);
  });

  it("lets nearest wall edge win when an endpoint is only broadly nearby", () => {
    const walls = [wall("w1", { x: 0, z: 0 }, { x: 4000, z: 0 })];
    const outlines = new Map([
      [
        "w1",
        [
          { x: 0, z: 0.075 },
          { x: 4, z: 0.075 },
          { x: 4, z: -0.075 },
          { x: 0, z: -0.075 }
        ]
      ]
    ]);
    const snap = createPlanSnapper(baseSnapperArgs({ getWalls: () => walls, getWallSolvedOutlines: () => outlines }));

    const result = snap(new THREE.Vector3(0.16, 0, 0.075), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("edge");
    expect(result.owner).toBe("wall");
    expect(result.point.x).toBeCloseTo(0.16);
    expect(result.point.z).toBeCloseTo(0.075);
    expect(result.binding?.type).toBe("wallEndpoint");
    if (result.binding?.type === "wallEndpoint") {
      expect(result.binding.wallId).toBe("w1");
      expect(result.binding.endpoint).toBe("a");
      expect(result.binding.normalOffsetMm).toBe(75);
    }
  });

  it("prefers physical wall surface edges over the wall centerline axis", () => {
    const walls = [wall("w1", { x: 0, z: 0 }, { x: 4000, z: 0 })];
    const outlines = new Map([
      [
        "w1",
        [
          { x: 0, z: 0.075 },
          { x: 4, z: 0.075 },
          { x: 4, z: -0.075 },
          { x: 0, z: -0.075 }
        ]
      ]
    ]);
    const snap = createPlanSnapper(baseSnapperArgs({ getWalls: () => walls, getWallSolvedOutlines: () => outlines }));

    const result = snap(new THREE.Vector3(2.2, 0, 0.074), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("edge");
    expect(result.point.x).toBeCloseTo(2.2);
    expect(result.point.z).toBeCloseTo(0.075);
    expect(result.binding?.type).toBe("wallCenterline");
    if (result.binding?.type === "wallCenterline") {
      expect(result.binding.wallId).toBe("w1");
      expect(result.binding.t).toBeCloseTo(0.55);
      expect(result.binding.normalOffsetMm).toBe(75);
    }
  });

  it("keeps exact endpoints ahead of edge projection when the cursor is very close", () => {
    const section = {
      id: "s1",
      params: { name: "Section 1", aMm: { x: 5200, z: 2800 }, bMm: { x: 6200, z: 2800 }, mirrored: false }
    } as SectionInstance;
    const snap = createPlanSnapper(baseSnapperArgs({ getSections: () => [section] }));

    const result = snap(new THREE.Vector3(5.205, 0, 2.8), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("endpoint");
    expect(result.owner).toBe("section");
    expect(result.binding).toEqual({ type: "sectionEndpoint", sectionId: "s1", endpoint: "a" });
  });

  it("does not freeze sticky edge snaps and keeps projecting under the cursor", () => {
    const walls = [wall("w1", { x: 0, z: 0 }, { x: 4000, z: 0 })];
    const outlines = new Map([
      [
        "w1",
        [
          { x: 0, z: 0.075 },
          { x: 4, z: 0.075 },
          { x: 4, z: -0.075 },
          { x: 0, z: -0.075 }
        ]
      ]
    ]);
    const snap = createPlanSnapper(baseSnapperArgs({ getWalls: () => walls, getWallSolvedOutlines: () => outlines }));
    const stickyEdge = {
      point: new THREE.Vector3(1, 0, 0.075),
      kind: "edge",
      owner: "wall",
      binding: { type: "wallCenterline", wallId: "w1", t: 0.25, normalOffsetMm: 75 }
    } satisfies PlanSnapResult;

    const result = snap(new THREE.Vector3(1.1, 0, 0.074), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14, {
      sticky: stickyEdge
    });

    expect(result.kind).toBe("edge");
    expect(result.point.x).toBeCloseTo(1.1);
    expect(result.point.z).toBeCloseTo(0.075);
  });

  it("snaps to column centers through the shared plan snapper", () => {
    const column = {
      id: "c1",
      params: {
        name: "Column 1",
        shape: "rectangular",
        xMm: 1000,
        zMm: 2000,
        justifyX: "center",
        justifyY: "center",
        widthMm: 400,
        depthMm: 600,
        diameterMm: 400,
        heightMm: 2600,
        materialId: "default"
      }
    } as ColumnInstance;
    const snap = createPlanSnapper(baseSnapperArgs({ getColumns: () => [column] }));

    const result = snap(new THREE.Vector3(1.02, 0, 2.01), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("midpoint");
    expect(result.owner).toBe("column");
    expect(result.binding).toEqual({ type: "columnCenter", columnId: "c1" });
    expect(result.point.x).toBeCloseTo(1);
    expect(result.point.z).toBeCloseTo(2);
  });

  it("snaps to section line endpoints through the shared plan snapper", () => {
    const section = {
      id: "s1",
      params: { name: "Section 1", aMm: { x: 500, z: 500 }, bMm: { x: 2500, z: 500 }, mirrored: false }
    } as SectionInstance;
    const snap = createPlanSnapper(baseSnapperArgs({ getSections: () => [section] }));

    const result = snap(new THREE.Vector3(0.51, 0, 0.48), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("endpoint");
    expect(result.owner).toBe("section");
    expect(result.binding).toEqual({ type: "sectionEndpoint", sectionId: "s1", endpoint: "a" });
  });

  it("snaps to opening endpoints before the host wall nearest edge", () => {
    const walls = [wall("w1", { x: 0, z: 0 }, { x: 4000, z: 0 })];
    const windowInst = {
      id: "win1",
      params: {
        wall: "back",
        wallId: "w1",
        widthMm: 1000,
        heightMm: 1200,
        sillHeightMm: 900,
        centerMm: 2000,
        frameWidthMm: 80,
        offsetFromInteriorMm: 0,
        sashWidthMm: 60,
        sashProfileDepthMm: 50,
        frameProfileDepthMm: 70,
        swingDirection: "left",
        swingSide: "inward",
        swingAngleDeg: 0,
        handleType: "none",
        handleOffsetMm: 0,
        handleHeightMm: 0,
        materialId: "default"
      }
    } as WindowInstance;
    const snap = createPlanSnapper(baseSnapperArgs({ getWalls: () => walls, getWindows: () => [windowInst] }));

    const result = snap(new THREE.Vector3(1.5, 0, 0.01), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("endpoint");
    expect(result.owner).toBe("window");
    expect(result.binding).toEqual({ type: "openingEndpoint", openingKind: "window", openingId: "win1", endpoint: "left" });
    expect(result.point.x).toBeCloseTo(1.5);
    expect(result.point.z).toBeCloseTo(0);
  });

  it("snaps to custom furniture boundary vertices through the shared plan snapper", () => {
    const furniture = {
      id: "cf1",
      params: {
        name: "Custom",
        baseConstraint: "projectBase",
        baseOffsetMm: 0,
        topConstraint: "absolute",
        topOffsetMm: 1000,
        boundary: [
          { x: 1000, z: 1000 },
          { x: 2000, z: 1000 },
          { x: 2000, z: 1800 },
          { x: 1000, z: 1800 }
        ],
        boards: []
      }
    } as unknown as CustomFurnitureInstance;
    const snap = createPlanSnapper(baseSnapperArgs({ getCustomFurniture: () => [furniture] }));

    const result = snap(new THREE.Vector3(1.01, 0, 1.02), { width: 1000, height: 1000 } as DOMRect, planCamera(), 14);

    expect(result.kind).toBe("corner");
    expect(result.owner).toBe("customFurniture");
    expect(result.binding).toEqual({ type: "customFurnitureVertex", furnitureId: "cf1", vertexIndex: 0 });
  });
});
