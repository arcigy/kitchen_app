import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import type { AppState } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { createInstanceActionsController } from "./instanceActionsController";
import type { LayoutInstance } from "./localTypes";

vi.mock("../geometry/buildModule", async () => {
  const THREE = await import("three");
  return {
    buildModule: vi.fn(() => new THREE.Group())
  };
});

function moduleInstance(id: string): LayoutInstance {
  const root = new THREE.Group();
  const module = new THREE.Group();
  root.add(module);
  return {
    id,
    params: { type: "drawer_low" } as ModuleParams,
    kitchenGroupId: null,
    kitchenPlacement: null,
    root,
    module,
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

describe("instance actions controller", () => {
  it("refreshes duplicated module kitchen placement from the active kitchen group", () => {
    const source = moduleInstance("source");
    const instances = [source];
    const layoutRoot = new THREE.Group();
    let counter = 1;
    const inferKitchenPlacementBinding = vi.fn((inst: LayoutInstance, groupId: string, backOffsetMm: number) => ({
      worktopId: `${inst.id}-${groupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));
    const controller = createInstanceActionsController({
      S: {
        kitchenEditMode: true,
        activeKitchenGroupId: "kg1",
        kitchenGroups: [{ id: "kg1", ctx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 45 } }],
        kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 80 }
      } as AppState,
      instances,
      layoutRoot,
      clientCatalog: {} as Parameters<typeof createInstanceActionsController>[0]["clientCatalog"],
      getMode: () => "layout",
      getInstanceCounter: () => counter,
      setInstanceCounter: (next) => {
        counter = next;
      },
      findInstance: (id) => instances.find((item) => item.id === id) ?? null,
      getSelectedInstanceId: () => null,
      ensurePickAndOutline: vi.fn(),
      placeWithoutOverlap: vi.fn(),
      inferKitchenPlacementBinding,
      setSelectedModule: vi.fn(),
      updateLayoutPanel: vi.fn()
    });

    controller.duplicateInstance(source.id);

    const duplicated = instances[1];
    expect(duplicated.id).toBe("m1");
    expect(duplicated.kitchenGroupId).toBe("kg1");
    expect(inferKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(duplicated, "kg1", 45);
    expect(duplicated.kitchenPlacement).toEqual({ worktopId: "m1-kg1-45", segmentIndex: 0, offsetAlongM: 0 });
  });
});
