import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createMeasureSelectionActions } from "./measureSelectionActions";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import type { AlignPickedLine, FloorInstance, KitchenWorktopInstance, LayoutInstance, WallInstance } from "./localTypes";
import type { AppState } from "../layout/appState";
import type { MeasureState } from "./measureTools";

function moduleInstance(id: string, kitchenGroupId: string | null = null): LayoutInstance {
  return {
    id,
    params: {} as LayoutInstance["params"],
    kitchenGroupId,
    kitchenPlacement: null,
    root: new THREE.Group(),
    module: new THREE.Group(),
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

function makeMeasureSelectionActionsContext(overrides: Partial<Parameters<typeof createMeasureSelectionActions>[0]> = {}) {
  const instance = moduleInstance("m1", "kg1");
  return {
    S: {
      kitchenGroups: [{ id: "kg1", ctx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 45 } }],
      kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 },
      alignLocks: []
    } as unknown as AppState,
    measureState: { measures: [] } as unknown as MeasureState,
    walls: [],
    floors: [],
    instances: [instance],
    kitchenWorktops: [],
    getAssociativeMeasureContext: vi.fn(),
    updateMeasurementGeometry: vi.fn(),
    getSelectedKind: vi.fn(() => null),
    getSelectedWallId: vi.fn(() => null),
    getSelectedInstanceId: vi.fn(() => null),
    getSelectedFloorId: vi.fn(() => null),
    getSelectedKitchenGroupId: vi.fn(() => null),
    wallEndpointWhich: vi.fn(),
    setWallEndpointMm: vi.fn(),
    rebuildWall: vi.fn(),
    autoJoinAtMmPoint: vi.fn(),
    rebuildWallPlanMesh: vi.fn(),
    wallJoinTolMm: 1,
    findInstance: vi.fn((id: string) => (id === instance.id ? instance : null)),
    instanceFitsRoom: vi.fn(() => true),
    anyOverlap: vi.fn(() => false),
    moduleOverlapsWalls: vi.fn(() => false),
    moduleOverlapsKitchenWorktops: vi.fn(() => false),
    inferKitchenPlacementBinding: vi.fn((inst: LayoutInstance, groupId: string, backOffsetMm: number) => ({
      worktopId: `${inst.id}-${groupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    })),
    rebuildFloor: vi.fn(),
    rebuildKitchenWorktop: vi.fn(),
    applyKitchenPlacementBinding: vi.fn(() => true),
    findKitchenWorktop: vi.fn(() => null),
    updateSelectionHighlights: vi.fn(),
    updateLayoutPanel: vi.fn(),
    ...overrides
  } as Parameters<typeof createMeasureSelectionActions>[0];
}

describe("measure selection actions", () => {
  it("refreshes moved module kitchen placement after a valid measure translation", () => {
    const ctx = makeMeasureSelectionActionsContext();
    const instance = ctx.instances[0];
    const actions = createMeasureSelectionActions(ctx);

    expect(actions.translateModuleByMeasure(instance.id, 100, 50)).toBe(true);

    expect(instance.root.position.x).toBe(0.1);
    expect(instance.root.position.z).toBe(0.05);
    expect(ctx.inferKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(instance, "kg1", 45);
    expect(instance.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
  });

  it("blocks measure translation for a module in a locked align joint", () => {
    const ctx = makeMeasureSelectionActionsContext();
    ctx.S.alignLocks = [
      {
        id: "lock-1",
        locked: true,
        a: { targetKind: "module", targetId: "m1", lineRole: "edge", moduleSide: "right" },
        b: { targetKind: "module", targetId: "m2", lineRole: "edge", moduleSide: "left" },
        pointMm: { x: 0, z: 0 }
      }
    ];
    const instance = ctx.instances[0];
    const actions = createMeasureSelectionActions(ctx);

    expect(actions.translateModuleByMeasure(instance.id, 100, 50)).toBe(false);

    expect(instance.root.position.x).toBe(0);
    expect(instance.root.position.z).toBe(0);
    expect(ctx.inferKitchenPlacementBinding).not.toHaveBeenCalled();
  });

  it("blocks measure translation for a wall in a locked align joint", () => {
    const wall = {
      id: "wall-1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 }
      }
    } as WallInstance;
    const ctx = makeMeasureSelectionActionsContext({ walls: [wall] });
    ctx.S.alignLocks = [
      {
        id: "lock-1",
        locked: true,
        a: { targetKind: "wall", targetId: "wall-1", lineRole: "edge" },
        b: { targetKind: "module", targetId: "m1", lineRole: "edge", moduleSide: "back" },
        pointMm: { x: 0, z: 0 }
      }
    ];
    const actions = createMeasureSelectionActions(ctx);

    expect(actions.translateWallByMeasure(wall.id, 100, 50)).toBe(false);

    expect(wall.params.aMm).toEqual({ x: 0, z: 0 });
    expect(wall.params.bMm).toEqual({ x: 1000, z: 0 });
    expect(ctx.rebuildWall).not.toHaveBeenCalled();
  });

  it("rebuilds floor and refreshes selection highlights after a valid measure translation", () => {
    const floor = {
      id: "floor-1",
      params: {
        name: "Floor",
        heightMm: 0,
        thicknessMm: 20,
        materialId: "floor",
        boundary: [
          { x: 0, z: 0 },
          { x: 1000, z: 0 }
        ]
      },
      root: new THREE.Group(),
      mesh: new THREE.Mesh(),
      outline: new THREE.Line()
    } as FloorInstance;
    const ctx = makeMeasureSelectionActionsContext({ floors: [floor] });
    const actions = createMeasureSelectionActions(ctx);

    expect(actions.translateFloorByMeasure(floor.id, 100, 50)).toBe(true);

    expect(floor.params.boundary).toEqual([
      { x: 100, z: 50 },
      { x: 1100, z: 50 }
    ]);
    expect(ctx.rebuildFloor).toHaveBeenCalledExactlyOnceWith(floor);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledExactlyOnceWith();
  });

  it("reapplies kitchen group placement with default back offset when the group is missing", () => {
    const instance = moduleInstance("m1", "missing");
    instance.kitchenPlacement = { worktopId: "w1", segmentIndex: 0, offsetAlongM: 0 };
    const worktop = {
      id: "w1",
      kitchenGroupId: "missing",
      params: { path: [{ x: 0, z: 0 }, { x: 1000, z: 0 }] }
    } as KitchenWorktopInstance;
    const ctx = makeMeasureSelectionActionsContext({
      S: {
        kitchenGroups: [],
        kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 }
      } as unknown as AppState,
      instances: [instance],
      kitchenWorktops: [worktop],
      findKitchenWorktop: vi.fn((id: string) => (id === worktop.id ? worktop : null))
    });
    const actions = createMeasureSelectionActions(ctx);

    expect(
      actions.alignKitchenWorktopLine(
        {
          targetKind: "worktop",
          worktopId: worktop.id,
          segmentIndex: 0,
          lineRole: "edge"
        } as AlignPickedLine,
        100,
        0
      )
    ).toBe(true);

    expect(ctx.applyKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(instance, instance.kitchenPlacement, 80);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.updateLayoutPanel).toHaveBeenCalledOnce();
  });

  it("blocks worktop align movement for a worktop in a locked align joint", () => {
    const worktop = {
      id: "w1",
      kitchenGroupId: "kg1",
      params: { path: [{ x: 0, z: 0 }, { x: 1000, z: 0 }] }
    } as KitchenWorktopInstance;
    const ctx = makeMeasureSelectionActionsContext({
      kitchenWorktops: [worktop],
      findKitchenWorktop: vi.fn((id: string) => (id === worktop.id ? worktop : null))
    });
    ctx.S.alignLocks = [
      {
        id: "lock-1",
        locked: true,
        a: { targetKind: "worktop", targetId: "w1", lineRole: "edge", segmentIndex: 0 },
        b: { targetKind: "module", targetId: "m1", lineRole: "edge", moduleSide: "back" },
        pointMm: { x: 0, z: 0 }
      }
    ];
    const actions = createMeasureSelectionActions(ctx);

    expect(
      actions.alignKitchenWorktopLine(
        {
          targetKind: "worktop",
          worktopId: worktop.id,
          segmentIndex: 0,
          lineRole: "edge"
        } as AlignPickedLine,
        100,
        0
      )
    ).toBe(false);

    expect(worktop.params.path).toEqual([{ x: 0, z: 0 }, { x: 1000, z: 0 }]);
    expect(ctx.rebuildKitchenWorktop).not.toHaveBeenCalled();
  });
});
