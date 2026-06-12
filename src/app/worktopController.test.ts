import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AppState } from "../layout/appState";
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
