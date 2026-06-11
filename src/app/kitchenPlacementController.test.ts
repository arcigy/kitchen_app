import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { makeDefaultFridgeTallParams } from "../modules/fridgeTall/types";
import { createKitchenPlacementController, type KitchenPlacementControllerContext } from "./kitchenPlacementController";
import type { KitchenWorktopInstance, LayoutInstance } from "./localTypes";

function tallModule(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  root.add(module);
  root.updateMatrixWorld(true);
  return {
    id: "m1",
    params: makeDefaultFridgeTallParams(),
    kitchenGroupId: "kg1",
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 2, 0.3)),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function worktop(): KitchenWorktopInstance {
  return {
    id: "w1",
    kitchenGroupId: "kg1",
    params: {
      path: [{ x: 0, z: 0 }, { x: 1000, z: 0 }],
      justification: "back",
      mirrored: false,
      depthMm: 600,
      thicknessMm: 38,
      heightMm: 900,
      overhangSideMm: 20,
      materialId: "mat"
    },
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.Line()
  } as KitchenWorktopInstance;
}

function makeContext(getKitchenWorktopBackGuidePath = vi.fn()): KitchenPlacementControllerContext {
  const kitchenCtx = { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 };
  return {
    S: {
      activeKitchenGroupId: "kg1",
      kitchenCtx,
      kitchenEditMode: true,
      kitchenGroups: [{ id: "kg1", name: "Kitchen 1", ctx: { ...kitchenCtx, worktopBackOffsetMm: 45 }, instanceIds: [] }]
    },
    walls: [],
    instances: [],
    floors: [],
    kitchenWorktops: [worktop()],
    wallSolvedOutlines: new Map(),
    getKitchenWorktopBackGuidePath: getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0)
    ]),
    rebuildInstance: vi.fn(() => true),
    rebuildKitchenGroupWorktops: vi.fn(),
    updateLayoutPanel: vi.fn(),
    getWallSolvedJoinPolys: vi.fn(() => []),
    getWallUnionPolys: vi.fn(() => null),
    getLayoutTool: vi.fn(() => "select"),
    getWallChainStart: vi.fn(() => null),
    catalog: {}
  } as unknown as KitchenPlacementControllerContext;
}

describe("kitchen placement controller", () => {
  it("uses group-specific back offset for active kitchen placement constraints", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const controller = createKitchenPlacementController(makeContext(getKitchenWorktopBackGuidePath));

    const result = controller.getKitchenPlacementConstraint(tallModule(), new THREE.Vector3(0, 0, 0));

    expect(result?.valid).toBe(true);
    expect(getKitchenWorktopBackGuidePath).toHaveBeenCalledWith(expect.objectContaining({ materialId: "mat" }), 45);
  });

  it("resolves upper module placement height from group context with default fallback", () => {
    const ctx = makeContext();
    ctx.S.kitchenCtx.upperStartHeightMm = 1400;
    ctx.S.kitchenGroups[0]!.ctx.upperStartHeightMm = 1600;
    const controller = createKitchenPlacementController(ctx);

    expect(controller.getKitchenModulePlacementY({ type: "flap_shelves_low", kitchenModuleRole: "upper" } as LayoutInstance["params"], "kg1")).toBe(1.6);
    expect(
      controller.getKitchenModulePlacementY({ type: "flap_shelves_low", kitchenModuleRole: "upper" } as LayoutInstance["params"], "missing")
    ).toBe(1.4);
    expect(controller.getKitchenModulePlacementY({ type: "drawer_low", kitchenModuleRole: "base" } as LayoutInstance["params"], "kg1")).toBe(0);
  });
});
