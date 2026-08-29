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

function baseModule(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  root.add(module);
  root.updateMatrixWorld(true);
  return {
    id: "base_module",
    params: {
      type: "fwm_catalog_base_doors",
      kitchenModuleRole: "low",
      width: 600,
      depth: 530,
      requiresWorktop: true,
      worktopThicknessMm: 38
    },
    kitchenGroupId: "kg1",
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.265), new THREE.Vector3(0.3, 0.722, 0.265)),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function boundBaseModule(id: string, centerM: number): LayoutInstance {
  const inst = baseModule();
  inst.id = id;
  inst.kitchenPlacement = { worktopId: "w1", segmentIndex: 0, offsetAlongM: centerM };
  return inst;
}

function boundUpperModule(id: string, centerM: number): LayoutInstance {
  const inst = boundBaseModule(id, centerM);
  inst.params = {
    ...inst.params,
    type: "fwm_catalog_wall_cabinet",
    kitchenModuleRole: "upper"
  } as LayoutInstance["params"];
  inst.root.position.y = 1.4;
  return inst;
}

function boundCorner90Module(): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  const corner = new THREE.Object3D();
  corner.name = "__kitchen_corner_anchor";
  const xAnchor = new THREE.Object3D();
  xAnchor.name = "__kitchen_corner_x_anchor";
  xAnchor.position.x = 0.9;
  const zAnchor = new THREE.Object3D();
  zAnchor.name = "__kitchen_corner_z_anchor";
  zAnchor.position.z = 0.9;
  module.add(corner, xAnchor, zAnchor);
  root.add(module);
  root.position.set(2.4, 0, 0);
  root.rotation.y = -Math.PI / 2;
  root.updateMatrixWorld(true);
  return {
    id: "corner-90",
    params: {
      type: "fwm_catalog_base_corner",
      variant: "corner_90",
      kitchenModuleRole: "low",
      cornerShape: "l_shape",
      width: 900,
      depth: 560
    },
    kitchenGroupId: "kg1",
    kitchenPlacement: { worktopId: "w1", kind: "corner", segmentIndex: 0, cornerIndex: 1, offsetAlongM: 0 },
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.9, 0.722, 0.9)),
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
  cornerAnchor.position.set(0.9, 0, 0);
  const xAnchor = new THREE.Object3D();
  xAnchor.name = "__kitchen_corner_x_anchor";
  xAnchor.position.set(0, 0, 0);
  const zAnchor = new THREE.Object3D();
  zAnchor.name = "__kitchen_corner_z_anchor";
  zAnchor.position.set(0.9, 0, 0.9);
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
    rebuildKitchenWorktop: vi.fn(),
    updateLayoutPanel: vi.fn(),
    getWallSolvedJoinPolys: vi.fn(() => []),
    getWallUnionPolys: vi.fn(() => null),
    getLayoutTool: vi.fn(() => "select"),
    getWallChainStart: vi.fn(() => null),
    commitHistory: vi.fn(),
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

  it("selects either coincident island side from the cursor side", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const ctx = makeContext(getKitchenWorktopBackGuidePath);
    getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0, 0)
    ]);
    const controller = createKitchenPlacementController(ctx);

    const front = controller.getKitchenPlacementConstraint(baseModule(), new THREE.Vector3(1, 0, 0.3));
    const back = controller.getKitchenPlacementConstraint(baseModule(), new THREE.Vector3(1, 0, -0.3));
    const seam = controller.getKitchenPlacementConstraint(baseModule(), new THREE.Vector3(1, 0, 0));

    expect(front?.kitchenPlacement?.segmentIndex).toBe(0);
    expect(front?.rotationY).toBeCloseTo(0);
    expect(front?.position.z).toBeGreaterThan(0);
    expect(back?.kitchenPlacement?.segmentIndex).toBe(1);
    expect(Math.abs(controller.normalizeAngleRad(back?.rotationY ?? 0))).toBeCloseTo(Math.PI);
    expect(back?.position.z).toBeLessThan(0);
    expect(seam?.kitchenPlacement?.segmentIndex).toBe(0);

    ctx.kitchenWorktops[0]!.params.mirrored = true;
    const mirroredFront = controller.getKitchenPlacementConstraint(baseModule(), new THREE.Vector3(1, 0, 0.3));
    expect(mirroredFront?.kitchenPlacement?.segmentIndex).toBe(1);
  });

  it("rebuilds supported base modules when their automatic end closure changes", () => {
    const ctx = makeContext();
    const inst = baseModule();
    inst.module.userData.supportsKitchenRunEndClosure = true;
    ctx.instances.push(inst);
    const controller = createKitchenPlacementController(ctx);

    expect(controller.applyKitchenPlacementBinding(inst, {
      worktopId: "w1",
      segmentIndex: 0,
      offsetAlongM: 0.3
    }, 45)).toBe(true);
    expect(inst.params).toMatchObject({
      kitchenEndClosureLeft: true,
      kitchenEndClosureRight: false,
      kitchenEndClosureBackGapMm: 45
    });
    expect(ctx.rebuildInstance).toHaveBeenCalledTimes(1);

    inst.kitchenPlacement = null;
    expect(controller.syncKitchenRunEndClosure(inst, 45)).toBe(true);
    expect(inst.params).toMatchObject({
      kitchenEndClosureLeft: false,
      kitchenEndClosureRight: false,
      kitchenEndClosureBackGapMm: 0
    });
    expect(ctx.rebuildInstance).toHaveBeenCalledTimes(2);
  });

  it("resizes a bound base module and cascades its run neighbors inside the worktop", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    getGuide.mockImplementation(() => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 0, 0)]);
    ctx.kitchenWorktops[0]!.params.path = [{ x: 0, z: 0 }, { x: 2400, z: 0 }];
    const modules = [boundBaseModule("a", 0.3), boundBaseModule("b", 0.9), boundBaseModule("c", 1.5)];
    ctx.instances.push(...modules);
    ctx.rebuildInstance = vi.fn((inst) => {
      const widthM = Number(inst.params.width ?? 600) / 1000;
      inst.localBox.min.x = -widthM / 2;
      inst.localBox.max.x = widthM / 2;
      return true;
    });
    const controller = createKitchenPlacementController(ctx);

    const result = controller.resizeKitchenRunModule("b", 900);

    expect(result).toEqual({ ok: true, appliedValueMm: 900, clamped: false });
    expect(modules[1]!.params.width).toBe(900);
    expect(modules.map((inst) => inst.kitchenPlacement?.offsetAlongM)).toEqual([0.3, 1.05, 1.8]);
    expect(ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("clamps an impossible run width instead of putting a module outside the worktop", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    getGuide.mockImplementation(() => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.8, 0, 0)]);
    const modules = [boundBaseModule("a", 0.3), boundBaseModule("b", 0.9), boundBaseModule("c", 1.5)];
    ctx.instances.push(...modules);
    ctx.rebuildInstance = vi.fn(() => true);
    const controller = createKitchenPlacementController(ctx);

    const result = controller.resizeKitchenRunModule("b", 1000);

    expect(result).toEqual({ ok: true, appliedValueMm: 600, clamped: true });
    expect(modules.map((inst) => inst.kitchenPlacement?.offsetAlongM)).toEqual([0.3, 0.9, 1.5]);
  });

  it("moves a selected module from an edited adjacent gap and keeps the run ordered", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    getGuide.mockImplementation(() => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 0, 0)]);
    const modules = [boundBaseModule("a", 0.3), boundBaseModule("b", 1.1), boundBaseModule("c", 1.9)];
    ctx.instances.push(...modules);
    const controller = createKitchenPlacementController(ctx);

    const result = controller.moveKitchenRunModuleByGap("b", "before", 50);

    expect(result).toEqual({ ok: true, appliedValueMm: 50, clamped: false });
    expect(modules[1]!.kitchenPlacement?.offsetAlongM).toBeCloseTo(0.95);
    expect((modules[2]!.kitchenPlacement?.offsetAlongM ?? 0) - (modules[1]!.kitchenPlacement?.offsetAlongM ?? 0)).toBeGreaterThanOrEqual(0.6);
  });

  it("creates one complete dimension source per U-shaped worktop segment", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    getGuide.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(2, 0, 1.5),
      new THREE.Vector3(0, 0, 1.5)
    ]);
    const controller = createKitchenPlacementController(ctx);

    const sources = controller.getKitchenRunDimensionSources("kg1");

    expect(sources).toHaveLength(3);
    expect(sources.map((source) => Math.round(source.lengthMm))).toEqual([2000, 1500, 2000]);
  });

  it("dimensions worktop wings from their real path edges instead of the inset placement guide", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    ctx.kitchenWorktops[0]!.params.path = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1500 }];
    getGuide.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0.045),
      new THREE.Vector3(1.955, 0, 0.045),
      new THREE.Vector3(1.955, 0, 1.5)
    ]);
    const controller = createKitchenPlacementController(ctx);

    const sources = controller.getKitchenRunDimensionSources("kg1");

    expect(sources.map((source) => Math.round(source.lengthMm))).toEqual([1955, 1455]);
    expect(sources.map((source) => Math.round(source.worktopEdgeLengthMm ?? 0))).toEqual([2000, 1500]);
    expect(sources[0]?.worktopEdgeEnd).toEqual({ x: 2, z: 0 });
    expect(sources[1]?.worktopEdgeStart).toEqual({ x: 2, z: 0 });
  });

  it("builds independent lower and upper dimension chains from the same worktop", () => {
    const ctx = makeContext();
    const lower = boundBaseModule("lower", 0.3);
    const upper = boundUpperModule("upper", 0.9);
    ctx.instances.push(lower, upper);
    const controller = createKitchenPlacementController(ctx);

    expect(controller.getKitchenRunDimensionSources("kg1", "base")[0]!.modules.map((module) => module.id)).toEqual(["lower"]);
    expect(controller.getKitchenRunDimensionSources("kg1", "upper")[0]!.modules.map((module) => module.id)).toEqual(["upper"]);
  });

  it("exposes both corner arms as independent reserved run dimensions", () => {
    const ctx = makeContext();
    ctx.getKitchenWorktopBackGuidePath = vi.fn(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2.4, 0, 0),
      new THREE.Vector3(2.4, 0, 2.4)
    ]);
    ctx.instances.push(boundCorner90Module());
    const controller = createKitchenPlacementController(ctx);

    const sources = controller.getKitchenRunDimensionSources("kg1", "base");

    expect(sources[0]?.reservedEndArm).toMatchObject({ moduleId: "corner-90", axis: "z" });
    expect(sources[0]?.reservedEndArm?.lengthMm).toBeCloseTo(900, 6);
    expect(sources[1]?.reservedStartArm).toMatchObject({ moduleId: "corner-90", axis: "x" });
    expect(sources[1]?.reservedStartArm?.lengthMm).toBeCloseTo(900, 6);
  });

  it("rewrites the selected 90-corner arm parameter and keeps straight modules inside the worktop", () => {
    const ctx = makeContext();
    ctx.getKitchenWorktopBackGuidePath = vi.fn(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2.4, 0, 0),
      new THREE.Vector3(2.4, 0, 2.4)
    ]);
    const corner = boundCorner90Module();
    const straight = boundBaseModule("straight-z", 1.5);
    straight.kitchenPlacement = { worktopId: "w1", segmentIndex: 0, offsetAlongM: 1.5 };
    ctx.instances.push(corner, straight);
    ctx.rebuildInstance = vi.fn((inst) => {
      if (inst.id !== corner.id) return true;
      const zAnchor = inst.module.getObjectByName("__kitchen_corner_z_anchor")!;
      zAnchor.position.z = Number((inst.params as Record<string, unknown>).cornerLengthZMm ?? 900) / 1000;
      inst.localBox.max.z = zAnchor.position.z;
      inst.root.updateMatrixWorld(true);
      return true;
    });
    const controller = createKitchenPlacementController(ctx);

    const result = controller.resizeKitchenCornerArm(corner.id, "z", 1100);

    expect(result).toEqual({ ok: true, appliedValueMm: 1100, clamped: false });
    expect((corner.params as Record<string, unknown>).cornerLengthZMm).toBe(1100);
    expect(straight.kitchenPlacement?.offsetAlongM).toBeCloseTo(1, 6);
    expect((straight.kitchenPlacement?.offsetAlongM ?? 0) + 0.3).toBeLessThanOrEqual(1.3);
    expect(ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("resizes one worktop wing and moves its bound modules with the changed start point", () => {
    const ctx = makeContext();
    ctx.getKitchenWorktopBackGuidePath = vi.fn((params: KitchenWorktopInstance["params"]) => params.path.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000)));
    const straight = boundBaseModule("straight", 0.3);
    ctx.instances.push(straight);
    const controller = createKitchenPlacementController(ctx);

    const result = controller.editKitchenWorktopSegment({ worktopId: "w1", segmentIndex: 0, lengthMm: 1400 });

    expect(result).toEqual({ ok: true, appliedValueMm: 1400, clamped: false });
    expect(ctx.kitchenWorktops[0]?.params.path[0]).toEqual({ x: -400, z: 0 });
    expect(straight.root.position.x).toBeCloseTo(-0.1, 6);
    expect(straight.kitchenPlacement?.offsetAlongM).toBeCloseTo(0.3, 6);
    expect(ctx.rebuildKitchenWorktop).toHaveBeenCalledTimes(1);
  });

  it("moves a selected worktop wing and its modules when an adjacent dimension is rewritten", () => {
    const ctx = makeContext();
    ctx.kitchenWorktops[0]!.params.path = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }];
    ctx.getKitchenWorktopBackGuidePath = vi.fn((params: KitchenWorktopInstance["params"]) =>
      params.path.map((point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000))
    );
    const straight = boundBaseModule("straight", 0.3);
    ctx.instances.push(straight);
    const controller = createKitchenPlacementController(ctx);
    expect(controller.applyKitchenPlacementBinding(straight, straight.kitchenPlacement!, 45)).toBe(true);
    const beforeZ = straight.root.position.z;

    const result = controller.editKitchenWorktopSegment({
      worktopId: "w1",
      segmentIndex: 0,
      adjacentSegmentIndex: 1,
      lengthMm: 1400
    });

    expect(result).toEqual({ ok: true, appliedValueMm: 1400, clamped: false });
    expect(ctx.kitchenWorktops[0]?.params.path).toEqual([
      { x: 0, z: -400 },
      { x: 1000, z: -400 },
      { x: 1000, z: 1000 }
    ]);
    expect(straight.root.position.z - beforeZ).toBeCloseTo(-0.4, 6);
    expect(straight.kitchenPlacement?.offsetAlongM).toBeCloseTo(0.3, 6);
    expect(ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("resizes an upper run without reflowing lower modules on the same worktop", () => {
    const getGuide = vi.fn();
    const ctx = makeContext(getGuide);
    getGuide.mockImplementation(() => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.4, 0, 0)]);
    const lower = boundBaseModule("lower", 0.3);
    const upperA = boundUpperModule("upper-a", 0.3);
    const upperB = boundUpperModule("upper-b", 0.9);
    ctx.instances.push(lower, upperA, upperB);
    ctx.rebuildInstance = vi.fn((inst) => {
      const widthM = Number(inst.params.width ?? 600) / 1000;
      inst.localBox.min.x = -widthM / 2;
      inst.localBox.max.x = widthM / 2;
      return true;
    });
    const controller = createKitchenPlacementController(ctx);

    const result = controller.resizeKitchenRunModule("upper-b", 900);

    expect(result).toEqual({ ok: true, appliedValueMm: 900, clamped: false });
    expect(lower.kitchenPlacement?.offsetAlongM).toBe(0.3);
    expect(upperA.kitchenPlacement?.offsetAlongM).toBe(0.3);
    expect(upperB.kitchenPlacement?.offsetAlongM).toBe(1.05);
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

  it("reserves both worktop arms from the chamfered corner's real wall anchor", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const ctx = makeContext(getKitchenWorktopBackGuidePath);
    getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1)
    ]);
    const inst = chamferedCornerModule(Math.PI / 2);
    ctx.instances.push(inst);
    const controller = createKitchenPlacementController(ctx);
    const placement = controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(1, 0, 0));
    if (!placement) throw new Error("Expected chamfered corner placement result");
    inst.root.position.copy(placement.position);
    inst.root.rotation.y = placement.rotationY;
    inst.kitchenPlacement = placement.kitchenPlacement;
    inst.root.updateMatrixWorld(true);

    const worldAnchor = controller.getModuleWorldKitchenAnchor(inst).setY(0);
    expect(worldAnchor.x).toBeCloseTo(1);
    expect(worldAnchor.z).toBeCloseTo(0);
    expect(controller.getKitchenSegmentReservedMargins("kg1", "w1", 0, 45)).toEqual({ startM: 0, endM: 0.9 });
    expect(controller.getKitchenSegmentReservedMargins("kg1", "w1", 1, 45)).toEqual({ startM: 0.9, endM: 0 });
  });

  it("places zero-offset FWM upper L corner without adding an extra 90 degrees", () => {
    const getKitchenWorktopBackGuidePath = vi.fn();
    const ctx = makeContext(getKitchenWorktopBackGuidePath);
    getKitchenWorktopBackGuidePath.mockImplementation(() => [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1)
    ]);
    const controller = createKitchenPlacementController(ctx);

    const inst = chamferedCornerModule(0);
    inst.id = "fwm_upper_l_corner";
    inst.params = {
      type: "fwm_catalog_wall_cabinet",
      variant: "corner_90",
      kitchenModuleRole: "top",
      isCorner: true,
      cornerShape: "l_shape"
    } as LayoutInstance["params"];
    const result = controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(1, 0, 0));

    expect(result?.valid).toBe(true);
    expect(result?.rotationY).toBeCloseTo(-Math.PI / 2);
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
