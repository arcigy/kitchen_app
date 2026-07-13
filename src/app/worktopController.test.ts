import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AppState } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import type { LayoutInstance } from "./localTypes";
import { createWorktopController, type WorktopControllerContext } from "./worktopController";

function createContext(overrides: Partial<WorktopControllerContext> = {}): WorktopControllerContext {
  return {
    kitchenWorktops: [],
    layoutRoot: new THREE.Group(),
    S: {} as AppState,
    kitchenWorktopDraw: {
      active: true,
      justification: "back",
      mirrored: true,
      points: [{ x: 0, z: 0 }],
      hoverPoint: { x: 1000, z: 0 },
      typedMm: "500",
      previewUpdatePending: true,
      previewSignature: "preview",
      previewMaterialId: "mat",
      previewRoot: null,
      previewMesh: null,
      previewOutline: null,
      previewBackLine: null
    },
    wallTypedHud: { textContent: "500", style: { display: "block" } } as HTMLElement,
    getKitchenWorktopBackGuidePath: vi.fn(() => []),
    hideHoverCursor: vi.fn(),
    showWallSnapMarkersFor: vi.fn(),
    setUnderlayStatus: vi.fn(),
    mountProps: vi.fn(),
    getViewMode: vi.fn((): "2d" => "2d"),
    getActiveViewerTab: vi.fn(() => "floorplan"),
    nextWorktopId: vi.fn(() => "worktop-1"),
    ensureWorktopCounter: vi.fn(),
    syncWorktopCounter: vi.fn(),
    setWorktopCounter: vi.fn(),
    setWorktopDrawSnap: vi.fn(),
    getSelectedKind: vi.fn(() => "wall"),
    getSelectedWallId: vi.fn(() => "wall-1"),
    catalog: { materials: [] } as unknown as ClientCatalog,
    ...overrides
  };
}

describe("worktopController", () => {
  it("resynchronizes a group whose worktop disappears during snapshot restore", () => {
    const syncKitchenRunEndClosures = vi.fn(() => false);
    const controller = createWorktopController(createContext({ syncKitchenRunEndClosures }));
    controller.createKitchenWorktop(
      {
        path: [
          { x: 0, z: 0 },
          { x: 1200, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        depthMm: 620,
        thicknessMm: 38,
        heightMm: 900,
        overhangSideMm: 20,
        materialId: ""
      },
      "removed-group",
      { skipHistory: true }
    );
    syncKitchenRunEndClosures.mockClear();

    controller.restoreKitchenWorktopsFromSnapshot([], 1);

    expect(syncKitchenRunEndClosures).toHaveBeenCalledExactlyOnceWith("removed-group");
  });

  function createFakeCornerInstance(worktopId: string): LayoutInstance {
    const root = new THREE.Group();
    const module = new THREE.Group();
    const topGeometry = new THREE.BufferGeometry();
    topGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0,
      0.8, 0, 0,
      0.8, 0, 0.8,
      0.2, 0, 0.8,
      0, 0, 0.6
    ], 3));
    const topPanel = new THREE.Mesh(topGeometry, new THREE.MeshBasicMaterial());
    topPanel.userData.boardName = "top_panel";
    module.add(topPanel);
    root.add(module);
    root.position.set(0.3, 0, 0.2);
    return {
      id: "corner-1",
      params: {
        type: "fwm_catalog_base_corner",
        variant: "corner_chamfered",
        cornerShape: "chamfered",
        kitchenModuleRole: "low",
        requiresWorktop: true,
        worktopThicknessMm: 38,
        width: 600,
        depth: 900
      } as ModuleParams,
      kitchenGroupId: "kg1",
      kitchenPlacement: { worktopId, kind: "corner", segmentIndex: 0, offsetAlongM: 0 },
      root,
      module,
      localBox: new THREE.Box3(new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0.8, 0.9)),
      pick: new THREE.Mesh(),
      outline: new THREE.Line()
    } as LayoutInstance;
  }

  it("adds linked corner module footprint coverage to the kitchen worktop", () => {
    const corner = createFakeCornerInstance("worktop-1");
    const ctx = createContext({
      S: {
        kitchenGroups: [
          {
            id: "kg1",
            ctx: { worktopFrontOffsetMm: 30 }
          }
        ],
        kitchenCtx: { worktopFrontOffsetMm: 30 }
      } as AppState,
      instances: [corner],
      getModuleLocalBackCenter: vi.fn(() => new THREE.Vector3(0, 0, 0))
    });
    const controller = createWorktopController(ctx);

    const worktop = controller.createKitchenWorktop(
      {
        path: [
          { x: 0, z: 0 },
          { x: 1200, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        depthMm: 500,
        thicknessMm: 38,
        heightMm: 900,
        overhangSideMm: 20,
        materialId: ""
      },
      "kg1",
      { skipHistory: true }
    );
    const positions = worktop.outline.geometry.getAttribute("position");
    let maxZ = Number.NEGATIVE_INFINITY;
    let hasChamferedSegment = false;
    for (let index = 0; index < positions.count; index += 1) {
      maxZ = Math.max(maxZ, positions.getZ(index));
      const next = index + 1;
      if (next >= positions.count) continue;
      const dx = Math.abs(positions.getX(next) - positions.getX(index));
      const dz = Math.abs(positions.getZ(next) - positions.getZ(index));
      if (dx > 0.05 && dz > 0.05) hasChamferedSegment = true;
    }

    expect(maxZ).toBeGreaterThan(1.02);
    expect(hasChamferedSegment).toBe(true);
  });

  it("preserves explicitly assigned worktop material metadata when a worktop is created", () => {
    const catalog = {
      materials: [
        {
          id: "mat.pino.worktop.compact.grey_stone.38",
          entityType: "material",
          materialType: "board",
          name: "PINO worktop",
          displayName: "PINO worktop",
          category: "PINO",
          baseMaterial: "laminate",
          decor: "grey_stone",
          color: "grey",
          finish: "stone",
          pricingBasis: "sheet_area",
          pricingUnit: "m2",
          availableThicknessesMm: [38],
          defaultThicknessMm: 38,
          isActive: true,
          tags: ["pino", "worktop"],
          preview: { colorHex: "#777972", roughness: 0.58, metalness: 0 },
          boardFamily: "worktop",
          recommendedUse: "worktop",
          grainDirectionRelevant: false
        }
      ],
      kitchenDefaults: { worktopMaterialId: "mat.pino.worktop.compact.grey_stone.38" }
    } as unknown as ClientCatalog;
    const ctx = createContext({ catalog });
    const controller = createWorktopController(ctx);

    const worktop = controller.createKitchenWorktop(
      {
        path: [
          { x: 0, z: 0 },
          { x: 1200, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        depthMm: 620,
        thicknessMm: 38,
        heightMm: 900,
        overhangSideMm: 20,
        materialId: "mat.pino.worktop.compact.grey_stone.38"
      },
      "kg1",
      { skipHistory: true }
    );

    expect(worktop.params.materialId).toBe("mat.pino.worktop.compact.grey_stone.38");
    expect(worktop.mesh.userData.catalogMaterialId).toBe("mat.pino.worktop.compact.grey_stone.38");
    expect(worktop.mesh.userData.catalogMaterialName).toBe("PINO worktop");
    expect(worktop.mesh.userData.materialRequest).toBeTruthy();
    expect(worktop.mesh.userData.tags).toEqual(["worktop"]);
  });

  it("keeps worktops unassigned when no explicit material is provided", () => {
    const catalog = { materials: [], kitchenDefaults: { worktopMaterialId: "legacy-worktop-material" } } as unknown as ClientCatalog;
    const ctx = createContext({ catalog });
    const controller = createWorktopController(ctx);

    const worktop = controller.createKitchenWorktop(
      {
        path: [
          { x: 0, z: 0 },
          { x: 1200, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        depthMm: 620,
        thicknessMm: 38,
        heightMm: 900,
        overhangSideMm: 20,
        materialId: ""
      },
      "kg1",
      { skipHistory: true }
    );

    expect(worktop.params.materialId).toBe("");
    expect(worktop.mesh.userData.catalogMaterialId).toBeUndefined();
    expect(worktop.mesh.userData.catalogMaterialName).toBeUndefined();
    expect(worktop.mesh.userData.materialRequest).toBeUndefined();
  });

  it("preserves per-wing depths through worktop snapshot restore", () => {
    const ctx = createContext();
    const controller = createWorktopController(ctx);
    controller.createKitchenWorktop(
      {
        path: [{ x: 0, z: 0 }, { x: 1200, z: 0 }, { x: 1200, z: 900 }],
        segmentDepthsMm: [620, 760],
        justification: "back",
        mirrored: false,
        depthMm: 620,
        thicknessMm: 38,
        heightMm: 900,
        overhangSideMm: 20,
        materialId: ""
      },
      "kg1",
      { id: "wt1", skipHistory: true }
    );

    const snapshot = controller.getKitchenGroupWorktops("kg1");
    controller.replaceKitchenGroupWorktops("kg1", snapshot, { skipHistory: true });

    expect(ctx.kitchenWorktops[0]?.params.segmentDepthsMm).toEqual([620, 760]);
  });

  it("cancels worktop drawing with current cleanup, status, and props refresh behavior", () => {
    const ctx = createContext();
    const controller = createWorktopController(ctx);

    controller.cancelKitchenWorktopDraw();

    expect(ctx.kitchenWorktopDraw.active).toBe(false);
    expect(ctx.kitchenWorktopDraw.mirrored).toBe(false);
    expect(ctx.kitchenWorktopDraw.points).toEqual([]);
    expect(ctx.kitchenWorktopDraw.hoverPoint).toBeNull();
    expect(ctx.kitchenWorktopDraw.typedMm).toBe("");
    expect(ctx.kitchenWorktopDraw.previewUpdatePending).toBe(false);
    expect(ctx.kitchenWorktopDraw.previewSignature).toBe("");
    expect(ctx.kitchenWorktopDraw.previewMaterialId).toBe("");
    expect(ctx.setWorktopDrawSnap).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledExactlyOnceWith("wall-1");
    expect(ctx.wallTypedHud.textContent).toBe("");
    expect(ctx.wallTypedHud.style.display).toBe("none");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
