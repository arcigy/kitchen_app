import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { makeDefaultFridgeTallParams } from "../modules/fridgeTall/types";
import { normalizePinoSideCabinetParams } from "../modules/pinoSideCabinet/types";
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

function vendorTallApplianceModule(): LayoutInstance {
  const inst = tallModule();
  inst.id = "vendor_tall_appliance";
  inst.params = {
    ...makeDefaultFridgeTallParams(),
    kitchenModuleRole: "tall",
    requiresWorktop: false,
    vendorPlacementZone: "tall_appliance",
    vendorRequiresApplianceOpening: true
  } as LayoutInstance["params"];
  return inst;
}

function chamferedCornerModule(rotationOffsetRad: number): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  module.userData.kitchenCornerRotationOffsetRad = rotationOffsetRad;
  const cornerAnchor = new THREE.Object3D();
  cornerAnchor.name = "__kitchen_corner_anchor";
  cornerAnchor.position.set(0, 0, 0);
  const xAnchor = new THREE.Object3D();
  xAnchor.name = "__kitchen_corner_x_anchor";
  xAnchor.position.set(0.9, 0, 0);
  const zAnchor = new THREE.Object3D();
  zAnchor.name = "__kitchen_corner_z_anchor";
  zAnchor.position.set(0, 0, 0.9);
  module.add(cornerAnchor, xAnchor, zAnchor);
  root.add(module);
  root.updateMatrixWorld(true);
  return {
    id: "fwm_chamfered_corner",
    params: {
      type: "fwm_catalog_base_corner",
      variant: "corner_chamfered",
      kitchenModuleRole: "base",
      isCorner: true,
      cornerShape: "chamfered"
    },
    kitchenGroupId: "kg1",
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.9, 0.722, 0.9)),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function pinoTallModule(groupId: "utility_side" | "appliance_tall", definitionId: string, width: number): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  root.add(module);
  root.updateMatrixWorld(true);
  return {
    id: `pino_${groupId}`,
    params: normalizePinoSideCabinetParams({
      type: "pino_side_cabinet",
      groupId,
      definitionId,
      articleCode: "",
      catalogKey: "",
      priceGroup: "3",
      opened: false,
      width,
      height: 2195,
      depth: 560,
      boardThickness: 18,
      frontThicknessMm: 19,
      backThickness: 8,
      plinthHeight: 110,
      frontGap: 3,
      sideGap: 2,
      shelfThickness: 18
    }),
    kitchenGroupId: "kg1",
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 2.195, 0.3)),
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

  it("keeps FWM base corner rebuilds anchored on the rear corner", () => {
    const controller = createKitchenPlacementController(makeContext());
    const root = new THREE.Group();
    const module = new THREE.Group();
    const anchor = new THREE.Object3D();
    anchor.name = "__kitchen_corner_anchor";
    anchor.position.set(0, 0, 0);
    module.add(anchor);
    root.add(module);
    root.position.set(3, 0, 4);
    root.updateMatrixWorld(true);
    const inst = {
      id: "fwm_corner",
      params: { type: "fwm_catalog_base_corner", kitchenModuleRole: "base" },
      kitchenGroupId: "kg1",
      kitchenPlacement: null,
      root,
      module,
      localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.9, 0.72, 0.9)),
      pick: new THREE.Mesh(),
      outline: new THREE.LineSegments()
    } as LayoutInstance;

    const previous = controller.getModuleWorldKitchenAnchor(inst).clone();
    anchor.position.set(-0.22, 0, -0.22);
    root.updateMatrixWorld(true);
    controller.preserveWorldKitchenAnchor(inst, previous);

    expect(controller.isCornerKitchenModule(inst)).toBe(true);
    expect(controller.getModuleWorldKitchenAnchor(inst).distanceTo(previous)).toBeLessThan(1e-9);
    expect(root.position.x).toBeCloseTo(3.22);
    expect(root.position.z).toBeCloseTo(4.22);
  });

  it("uses the chamfered FWM corner rotation offset when snapping into an L worktop corner", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const ctx = makeContext(getKitchenWorktopBackGuidePath);
    getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1)
    ]);
    const controller = createKitchenPlacementController(ctx);

    const inst = chamferedCornerModule(Math.PI / 2);
    const corner = new THREE.Vector3(1, 0, 0);
    const result = controller.getKitchenPlacementConstraint(inst, corner);

    expect(result?.valid).toBe(true);
    if (!result) throw new Error("Expected chamfered corner placement result");
    expect(result?.rotationY).toBeCloseTo(0);
    expect(result.position.x).toBeCloseTo(0.1);
    expect(result.position.z).toBeCloseTo(0);

    const armX = new THREE.Vector3(0, 0, 1);
    const armZ = new THREE.Vector3(-1, 0, 0);
    const euler = new THREE.Euler(0, result.rotationY, 0);
    const footprint = [
      new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.min.z),
      new THREE.Vector3(inst.localBox.max.x, 0, inst.localBox.min.z),
      new THREE.Vector3(inst.localBox.max.x, 0, inst.localBox.max.z),
      new THREE.Vector3(inst.localBox.min.x, 0, inst.localBox.max.z)
    ];
    for (const point of footprint) {
      const relative = point.clone().applyEuler(euler).add(result.position).sub(corner);
      expect(relative.dot(armX)).toBeGreaterThanOrEqual(-1e-9);
      expect(relative.dot(armZ)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("mirrors side-aware corner placement through the corner bisector instead of only changing side geometry", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const ctx = makeContext(getKitchenWorktopBackGuidePath);
    getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1)
    ]);
    const controller = createKitchenPlacementController(ctx);
    const left = chamferedCornerModule(Math.PI / 2);
    left.params = { ...left.params, side: "left" } as LayoutInstance["params"];
    const right = chamferedCornerModule(Math.PI / 2);
    right.params = { ...right.params, side: "right" } as LayoutInstance["params"];
    const corner = new THREE.Vector3(1, 0, 0);

    const leftResult = controller.getKitchenPlacementConstraint(left, corner);
    const rightResult = controller.getKitchenPlacementConstraint(right, corner);

    expect(leftResult?.valid).toBe(true);
    expect(rightResult?.valid).toBe(true);
    if (!leftResult || !rightResult) throw new Error("Expected both side-aware corner placement results");
    expect(Math.abs(controller.normalizeAngleRad(rightResult.rotationY - leftResult.rotationY))).toBeCloseTo(Math.PI / 2);
    expect(rightResult.position.distanceTo(leftResult.position)).toBeGreaterThan(0.5);
  });

  it("describes appliance tall PINO side cabinets as appliance-zone placement targets", () => {
    const controller = createKitchenPlacementController(makeContext());

    const appliance = controller.getKitchenPlacementConstraint(
      pinoTallModule("appliance_tall", "pino_side_cabinet_gb_fb_page245", 600),
      new THREE.Vector3(0, 0, 0)
    );
    const utility = controller.getKitchenPlacementConstraint(
      pinoTallModule("utility_side", "pino_side_cabinet_s_bk_page243", 450),
      new THREE.Vector3(0, 0, 0)
    );

    expect(appliance?.valid).toBe(true);
    expect(appliance?.statusText).toContain("appliance zone");
    expect(utility?.valid).toBe(true);
    expect(utility?.statusText).toContain("beside the worktop");
    expect(utility?.statusText).not.toContain("appliance zone");
  });

  it("uses generic vendor placement metadata for non-PINO tall appliance modules", () => {
    const controller = createKitchenPlacementController(makeContext());

    const result = controller.getKitchenPlacementConstraint(
      vendorTallApplianceModule(),
      new THREE.Vector3(0, 0, 0)
    );

    expect(result?.valid).toBe(true);
    expect(result?.statusText).toContain("appliance zone");
  });
});
