import { Group, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { insertAssistantCatalogModule } from "./assistantCatalogInsertion";
import type { AppState, KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";

function makeInstance(id: string, params: ModuleParams): LayoutInstance {
  return {
    id,
    params,
    root: new Group(),
    module: new Group(),
    outline: new Group(),
    pick: new Mesh(),
    localBox: { min: { x: -0.3, y: 0, z: -0.28 }, max: { x: 0.3, y: 0.9, z: 0.28 } } as never,
    kitchenGroupId: null,
    kitchenPlacement: null
  } as unknown as LayoutInstance;
}

describe("assistantCatalogInsertion", () => {
  it("inserts a resolved module into the active kitchen group and commits history", () => {
    const S = {
      kitchenGroups: [{
        id: "kg1",
        name: "Kitchen",
        ctx: { worktopBackOffsetMm: 45 },
        instanceIds: []
      }],
      activeKitchenGroupId: "kg1"
    } as unknown as AppState;
    const instances: LayoutInstance[] = [];
    const kitchenWorktops: KitchenWorktopInstance[] = [];
    const layoutRoot = new Group();
    const commitHistory = vi.fn();
    const inserted = insertAssistantCatalogModule({
      S,
      layoutRoot,
      instances,
      kitchenWorktops,
      createInstance: (params) => makeInstance("m-new", params),
      inferKitchenPlacementBinding: () => null,
      applyKitchenPlacementBinding: vi.fn(() => false),
      getSelectedKitchenGroupId: () => "kg1",
      setSelectedKitchenGroup: vi.fn(),
      setSelectedModule: vi.fn(),
      updateLayoutPanel: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      mountProps: vi.fn(),
      commitHistory
    }, { type: "pino_side_cabinet", width: 600, widthMm: 600 } as ModuleParams);

    expect(inserted.kitchenGroupId).toBe("kg1");
    expect(instances).toHaveLength(1);
    expect(layoutRoot.children).toContain(inserted.root);
    expect(commitHistory).toHaveBeenCalledOnce();
  });
});
