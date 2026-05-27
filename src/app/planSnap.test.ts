import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createPlanSnapper, resolveWallSnapBindingPoint, type PlanSnapResult } from "./planSnap";
import type { WallInstance } from "./localTypes";

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
});
