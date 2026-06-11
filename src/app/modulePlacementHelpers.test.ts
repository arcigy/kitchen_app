import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import type { AppState } from "../layout/appState";
import { createModulePlacementHelpers, type ModulePlacementHelpersContext } from "./modulePlacementHelpers";
import type { KitchenWorktopInstance, LayoutInstance } from "./localTypes";

function moduleInstance(kitchenGroupId: string | null): LayoutInstance {
  const root = new THREE.Group();
  root.updateMatrixWorld(true);
  return {
    id: "m1",
    params: { type: "fridge_tall", width: 600 },
    kitchenGroupId,
    kitchenPlacement: null,
    root,
    module: new THREE.Group(),
    localBox: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 2, 0.3)),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function cornerModule(): LayoutInstance {
  const inst = moduleInstance("kg1");
  inst.id = "corner";
  inst.params = { type: "corner_shelf_lower" } as LayoutInstance["params"];
  return inst;
}

function groupedModule(id: string, binding: NonNullable<LayoutInstance["kitchenPlacement"]>): LayoutInstance {
  const inst = moduleInstance("kg1");
  inst.id = id;
  inst.kitchenPlacement = binding;
  return inst;
}

function worktop(groupId: string): KitchenWorktopInstance {
  return {
    id: "w1",
    kitchenGroupId: groupId,
    params: { path: [{ x: 0, z: 0 }, { x: 1000, z: 0 }] }
  } as KitchenWorktopInstance;
}

function makeContext(instance: LayoutInstance, getKitchenGuideSegmentInfo = vi.fn()): ModulePlacementHelpersContext {
  const guidePath = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
  return {
    instances: [instance],
    kitchenWorktops: [worktop(instance.kitchenGroupId ?? "missing")],
    walls: [],
    S: {
      kitchenGroups: [{ id: "kg1", ctx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 45 } }],
      kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 }
    } as Pick<AppState, "kitchenCtx" | "kitchenGroups">,
    roomBounds: { halfW: 10, halfD: 10 },
    wallSolvedOutlines: new Map(),
    moduleAdjacencyGroup: new THREE.Group(),
    placementAdjacencyPreview: new THREE.Line(),
    instanceLayoutWorldBox: vi.fn(() => instance.localBox.clone()),
    instanceWorldBox: vi.fn(() => instance.localBox.clone()),
    instanceFitsRoom: vi.fn(() => true),
    getModuleLocalBackCenter: vi.fn(() => new THREE.Vector3(0, 0, 0)),
    moduleStaysOutsideKitchenWorktop: vi.fn(() => true),
    isCornerKitchenModule: vi.fn(() => false),
    applyKitchenPlacementBinding: vi.fn(() => true),
    getKitchenCornerArmBindingInfo: vi.fn(() => null),
    getKitchenGuideSegmentInfo: getKitchenGuideSegmentInfo.mockImplementation(() => ({
      start: new THREE.Vector3(0, 0, 0),
      dir: new THREE.Vector3(1, 0, 0),
      length: 1
    })),
    getKitchenWorktopBackGuidePath: vi.fn(() => guidePath),
    findInstance: vi.fn(() => null),
    getWallUnionPolys: vi.fn(() => null),
    getWallSolvedJoinPolys: vi.fn(() => []),
    getViewMode: vi.fn((): "2d" => "2d"),
    getActiveViewerTab: vi.fn(() => "layout")
  };
}

describe("module placement helpers", () => {
  it("uses group-specific kitchen placement back offset for tall resize anchor inference", () => {
    const instance = moduleInstance("kg1");
    const getKitchenGuideSegmentInfo = vi.fn();
    const helpers = createModulePlacementHelpers(makeContext(instance, getKitchenGuideSegmentInfo));

    expect(helpers.inferTallResizeAnchorSide(instance)).toBe("right");

    expect(getKitchenGuideSegmentInfo).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), 0, 45);
  });

  it("falls back to default kitchen placement back offset when the group is missing", () => {
    const instance = moduleInstance("missing");
    const getKitchenGuideSegmentInfo = vi.fn();
    const helpers = createModulePlacementHelpers(makeContext(instance, getKitchenGuideSegmentInfo));

    expect(helpers.inferTallResizeAnchorSide(instance)).toBe("right");

    expect(getKitchenGuideSegmentInfo).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), 0, 80);
  });

  it("uses the required group offset when propagating corner resize to pinned neighbors", () => {
    const corner = cornerModule();
    const neighbor = groupedModule("m2", { worktopId: "w1", segmentIndex: 0, offsetAlongM: 0 });
    const applyKitchenPlacementBinding = vi.fn((inst: LayoutInstance) => {
      inst.root.position.x += 0.1;
      return true;
    });
    const getKitchenCornerArmBindingInfo = vi.fn(() => ({
      worktopId: "w1",
      xSegmentIndex: 0,
      zSegmentIndex: null
    }));
    const ctx = makeContext(corner);
    ctx.instances = [corner, neighbor];
    ctx.applyKitchenPlacementBinding = applyKitchenPlacementBinding;
    ctx.getKitchenCornerArmBindingInfo = getKitchenCornerArmBindingInfo;
    ctx.isCornerKitchenModule = vi.fn(() => true);
    const helpers = createModulePlacementHelpers(ctx);

    expect(helpers.propagateCornerResizeToPinnedNeighbors(corner, corner.params)).toEqual({ ok: true, movedIds: ["m2"] });

    expect(getKitchenCornerArmBindingInfo).toHaveBeenCalledExactlyOnceWith(corner, 45);
    expect(applyKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(neighbor, neighbor.kitchenPlacement, 45);
  });
});
