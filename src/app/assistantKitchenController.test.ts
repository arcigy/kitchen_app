import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { makeAppState, type KitchenWorktopInstance } from "../layout/appState";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import { createAssistantKitchenController } from "./assistantKitchenController";

function tenantCatalog(): ClientCatalog {
  const materialIds = [
    "mat.board.body.dtd.white.18",
    "mat.board.front.mdf.white_supermat.18",
    "mat.board.worktop.laminate_oak.38",
    "mat.board.back.hdf.grey.6",
    "mat.board.drawer_bottom.hdf.white.8"
  ];
  return {
    materials: materialIds.map((id) => ({ id, isActive: true })),
    components: [{ id: "cmp.handle.bar.160.black", isActive: true }],
    modules: [],
    kitchenDefaults: {}
  } as unknown as ClientCatalog;
}

describe("assistant semantic kitchen controller", () => {
  it("creates an L worktop from compact JSON and commits one transaction", () => {
    const S = makeAppState(makeDefaultModuleParams("drawer_low"));
    S.mode = "layout";
    const catalog = tenantCatalog();
    const layoutRoot = new THREE.Group();
    const commitHistory = vi.fn();
    const createKitchenWorktop = vi.fn((params, kitchenGroupId) => {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh();
      const outline = new THREE.Line();
      root.add(mesh, outline);
      const worktop = { id: "wt1", kitchenGroupId, params, root, mesh, outline } as KitchenWorktopInstance;
      S.kitchenWorktops.push(worktop);
      layoutRoot.add(root);
      return worktop;
    });
    const controller = createAssistantKitchenController({
      S,
      catalog,
      modulePackages: [],
      instances: S.instances,
      kitchenWorktops: S.kitchenWorktops,
      layoutRoot,
      createInstance: vi.fn(),
      deleteInstance: vi.fn(),
      createKitchenWorktop,
      removeKitchenWorktop: vi.fn(),
      rebuildKitchenWorktop: vi.fn(),
      rebuildKitchenGroupLayout: vi.fn(),
      getKitchenGuideSegmentInfo: vi.fn(),
      getKitchenCornerPlacementInfo: vi.fn(),
      applyKitchenPlacementBinding: vi.fn(),
      getKitchenRunDimensionSources: vi.fn(() => []),
      setSelectedKitchenGroup: vi.fn(),
      setSelectedModule: vi.fn(),
      updateLayoutPanel: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      mountProps: vi.fn(),
      commitHistory
    });

    const output = controller.create({
      name: "Kitchen L",
      source: { kind: "text" },
      layout: { shape: "L", runsMm: [3000, 2400], turns: ["left"] },
      modules: []
    });

    expect(output.path).toEqual([{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 2400 }]);
    expect(S.kitchenGroups).toHaveLength(1);
    expect(S.kitchenWorktops).toHaveLength(1);
    expect(createKitchenWorktop).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
  });

  it("refuses an unscaled photo before touching project state", () => {
    const S = makeAppState(makeDefaultModuleParams("drawer_low"));
    S.mode = "layout";
    const controller = createAssistantKitchenController({
      S,
      catalog: tenantCatalog(),
      modulePackages: [],
      instances: S.instances,
      kitchenWorktops: S.kitchenWorktops,
      layoutRoot: new THREE.Group()
    } as never);

    expect(() => controller.validateCreate({
      name: "Photo kitchen",
      source: { kind: "photo", scaleConfirmed: false },
      layout: { shape: "straight", runsMm: [2400], turns: [] }
    })).toThrow("confirmed real-world dimensions");
    expect(S.kitchenGroups).toHaveLength(0);
    expect(S.kitchenWorktops).toHaveLength(0);
  });
});
