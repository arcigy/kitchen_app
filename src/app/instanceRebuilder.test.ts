import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import type { AppState } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { createInstanceRebuilder } from "./instanceRebuilder";
import type { LayoutInstance } from "./localTypes";

function moduleInstance(id: string, kitchenGroupId: string | null = null): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  root.add(module);
  return {
    id,
    params: {} as ModuleParams,
    kitchenGroupId,
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function makeInstanceRebuilderContext(overrides: Partial<Parameters<typeof createInstanceRebuilder>[0]> = {}) {
  const inst = moduleInstance("m1", "kg1");
  const neighbor = moduleInstance("m2", "missing");
  const instances = [inst, neighbor];
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
  return {
    S: {
      kitchenGroups: [{ id: "kg1", ctx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 45 } }],
      kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 }
    } as AppState,
    anyOverlap: vi.fn(() => false),
    applyWallConstraints: vi.fn((_moving: LayoutInstance, desired: THREE.Vector3) => desired),
    args: { errorsEl: {} as HTMLElement },
    buildModule: vi.fn(() => new THREE.Group()),
    chooseResizeAnchorSide: vi.fn(() => null),
    collectAdjacentModuleInfos: vi.fn(() => []),
    disposeObject3D: vi.fn(),
    ensurePickAndOutline: vi.fn(),
    findInstance: vi.fn((id: string) => instances.find((item) => item.id === id) ?? null),
    footprintExtentsMatchXZ: vi.fn(() => true),
    getModuleLocalKitchenAnchor: vi.fn(() => new THREE.Vector3()),
    inferKitchenPlacementBinding: vi.fn((item: LayoutInstance, groupId: string, backOffsetMm: number) => ({
      worktopId: `${item.id}-${groupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    })),
    inferTallResizeAnchorSide: vi.fn(() => null),
    instanceFitsLayoutBounds: vi.fn(() => true),
    instanceWorldBox: vi.fn(() => box.clone()),
    instances,
    isCornerKitchenModule: vi.fn(() => false),
    lastRebuildDebug: null,
    moduleOverlapsKitchenWorktops: vi.fn(() => false),
    moduleOverlapsWalls: vi.fn(() => false),
    moduleRootLocalBox: vi.fn(() => box.clone()),
    normalizeModuleParamsForSource: vi.fn((params: ModuleParams) => params),
    preserveAnchoredResizeSide: vi.fn(),
    preserveWorldKitchenAnchor: vi.fn(),
    propagateCornerResizeToPinnedNeighbors: vi.fn(() => ({ movedIds: [] })),
    propagateModuleResizeToPinnedNeighbors: vi.fn(() => ({ movedIds: [neighbor.id] })),
    renderErrors: vi.fn(),
    tagModuleGeometry: vi.fn(),
    rebuildKitchenGroupWorktops: vi.fn(),
    updateLayoutPanel: vi.fn(),
    validateModule: vi.fn(() => []),
    ...overrides
  } as Parameters<typeof createInstanceRebuilder>[0] & { instances: LayoutInstance[] };
}

describe("instance rebuilder", () => {
  it("refreshes rebuilt module and moved neighbor kitchen placements after a valid rebuild", () => {
    const ctx = makeInstanceRebuilderContext();
    const [inst, neighbor] = ctx.instances;
    const rebuilder = createInstanceRebuilder(ctx);

    expect(rebuilder.rebuildInstance(inst)).toBe(true);

    expect(ctx.inferKitchenPlacementBinding).toHaveBeenNthCalledWith(1, inst, "kg1", 45);
    expect(ctx.inferKitchenPlacementBinding).toHaveBeenNthCalledWith(2, neighbor, "missing", 80);
    expect(inst.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
    expect(neighbor.kitchenPlacement).toEqual({ worktopId: "m2-missing-80", segmentIndex: 0, offsetAlongM: 0 });
    expect(ctx.rebuildKitchenGroupWorktops).toHaveBeenCalledWith("kg1", ctx.S.kitchenGroups[0]!.ctx);
    expect(ctx.rebuildKitchenGroupWorktops).toHaveBeenCalledWith("missing", ctx.S.kitchenCtx);
  });

  it("does not recursively rebuild worktops when their closure sync rebuilds a module", () => {
    let rebuilder: ReturnType<typeof createInstanceRebuilder>;
    const ctx = makeInstanceRebuilderContext({
      propagateModuleResizeToPinnedNeighbors: vi.fn(() => ({ movedIds: [] }))
    });
    const rebuildKitchenGroupWorktops = vi.fn(() => {
      expect(rebuilder.rebuildInstance(ctx.instances[0]!, { skipLayoutValidation: true })).toBe(true);
    });
    ctx.rebuildKitchenGroupWorktops = rebuildKitchenGroupWorktops;
    rebuilder = createInstanceRebuilder(ctx);

    expect(rebuilder.rebuildInstance(ctx.instances[0]!)).toBe(true);
    expect(rebuildKitchenGroupWorktops).toHaveBeenCalledTimes(1);
  });
});
