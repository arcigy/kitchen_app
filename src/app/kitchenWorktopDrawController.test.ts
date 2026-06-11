import { describe, expect, it, vi } from "vitest";
import { createKitchenWorktopDrawController } from "./kitchenWorktopDrawController";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./localTypes";
import type { AppState } from "../layout/appState";

type KitchenWorktopDrawContext = Parameters<typeof createKitchenWorktopDrawController>[0];

const worktopParams = (path: FloorBoundaryPoint[]): KitchenWorktopParams => ({
  path,
  justification: "back",
  mirrored: false,
  depthMm: 600,
  thicknessMm: 38,
  heightMm: 900,
  overhangSideMm: 20,
  materialId: "mat"
});

function createContext(overrides: Partial<KitchenWorktopDrawContext> = {}): KitchenWorktopDrawContext {
  return {
    S: { kitchenEditMode: true, activeKitchenGroupId: "kg1" } as AppState,
    kitchenWorktopDraw: {
      active: false,
      points: [],
      hoverPoint: null,
      typedMm: "",
      mirrored: true,
      justification: "back"
    },
    wallTypedHud: { style: { display: "block" } } as HTMLElement,
    getWorktopCounter: vi.fn(() => 7),
    setWorktopDrawSnap: vi.fn(),
    cancelKitchenWorktopDraw: vi.fn(),
    cancelPlacement: vi.fn(),
    isPlacementActive: vi.fn(() => true),
    ensureFloorplanViewerTab: vi.fn(),
    clearSelectionForDraw: vi.fn(),
    syncSelectionState: vi.fn(),
    updateSelectionHighlights: vi.fn(),
    setUnderlayStatus: vi.fn(),
    mountProps: vi.fn(),
    scheduleKitchenWorktopPreviewUpdate: vi.fn(),
    updateKitchenWorktopPreview: vi.fn(),
    floorOrthoPoint: vi.fn((_start, raw) => raw),
    makeKitchenWorktopParamsFromPath: vi.fn((path) => worktopParams(path)),
    getKitchenGroupWorktops: vi.fn(() => []),
    replaceKitchenGroupWorktops: vi.fn(),
    ...overrides
  };
}

describe("kitchenWorktopDrawController", () => {
  it("starts kitchen worktop drawing with current cleanup and selection refresh behavior", () => {
    const ctx = createContext();
    const controller = createKitchenWorktopDrawController(ctx);

    controller.startKitchenWorktopDraw();

    expect(ctx.cancelKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.cancelPlacement).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.kitchenWorktopDraw.active).toBe(true);
    expect(ctx.kitchenWorktopDraw.mirrored).toBe(false);
    expect(ctx.setWorktopDrawSnap).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.clearSelectionForDraw).toHaveBeenCalledOnce();
    expect(ctx.syncSelectionState).toHaveBeenCalledOnce();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Worktop: click shape points. Type mm + Enter for segment length. Esc confirms the shape.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("does not start worktop drawing outside an active kitchen group", () => {
    const ctx = createContext({ S: { kitchenEditMode: false, activeKitchenGroupId: null } as AppState });
    const controller = createKitchenWorktopDrawController(ctx);

    controller.startKitchenWorktopDraw();

    expect(ctx.cancelKitchenWorktopDraw).not.toHaveBeenCalled();
    expect(ctx.ensureFloorplanViewerTab).not.toHaveBeenCalled();
    expect(ctx.mountProps).not.toHaveBeenCalled();
  });

  it("appends typed worktop length through the existing typed point resolver path", () => {
    const ctx = createContext();
    ctx.kitchenWorktopDraw.active = true;
    ctx.kitchenWorktopDraw.points = [{ x: 0, z: 0 }];
    ctx.kitchenWorktopDraw.hoverPoint = { x: 1000, z: 0 };
    ctx.kitchenWorktopDraw.typedMm = "500";
    const controller = createKitchenWorktopDrawController(ctx);

    expect(controller.commitKitchenWorktopTypedLength()).toBe(true);

    expect(ctx.floorOrthoPoint).toHaveBeenCalledOnce();
    expect(ctx.kitchenWorktopDraw.points).toEqual([
      { x: 0, z: 0 },
      { x: 500, z: 0 }
    ]);
    expect(ctx.kitchenWorktopDraw.typedMm).toBe("");
    expect(ctx.wallTypedHud.style.display).toBe("none");
    expect(ctx.scheduleKitchenWorktopPreviewUpdate).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledWith("Worktop: continue with the next point or press Esc to confirm.");
  });

  it("cancels short active worktop drawing on Escape", () => {
    const ctx = createContext();
    ctx.kitchenWorktopDraw.active = true;
    ctx.kitchenWorktopDraw.points = [{ x: 0, z: 0 }];
    const controller = createKitchenWorktopDrawController(ctx);

    expect(controller.handleKitchenWorktopEscape()).toBe(true);

    expect(ctx.cancelKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.replaceKitchenGroupWorktops).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Worktop: canceled.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("commits active worktop drawing on Escape using the existing or generated worktop id", () => {
    const ctx = createContext({
      getKitchenGroupWorktops: vi.fn(() => [{ id: "existing-worktop" }])
    });
    ctx.kitchenWorktopDraw.active = true;
    ctx.kitchenWorktopDraw.points = [
      { x: 0, z: 0 },
      { x: 1000, z: 0 },
      { x: 1000, z: 600 }
    ];
    const controller = createKitchenWorktopDrawController(ctx);

    expect(controller.handleKitchenWorktopEscape()).toBe(true);

    expect(ctx.makeKitchenWorktopParamsFromPath).toHaveBeenCalledExactlyOnceWith(ctx.kitchenWorktopDraw.points);
    expect(ctx.replaceKitchenGroupWorktops).toHaveBeenCalledExactlyOnceWith(
      "kg1",
      [{ id: "existing-worktop", params: worktopParams(ctx.kitchenWorktopDraw.points) }],
      { skipHistory: false }
    );
    expect(ctx.cancelKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Corner worktop created.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
