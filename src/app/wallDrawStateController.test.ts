import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  activateWallToolState,
  resetWallDrawState,
  type WallDrawStateCleanupContext,
  type WallToolActivationContext
} from "./wallDrawStateController";
import type { AppState } from "../layout/appState";

const createContext = (): WallDrawStateCleanupContext => {
  const layoutRoot = new THREE.Group();
  const preview = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  vi.spyOn(preview.geometry, "dispose");
  vi.spyOn(preview.material as THREE.Material, "dispose");
  layoutRoot.add(preview);

  return {
    hideHoverCursor: vi.fn(),
    layoutRoot,
    selectedKind: "wall",
    selectedWallId: "wall-1",
    showWallSnapMarkersFor: vi.fn(),
    wallDraw: {
      active: true,
      a: { x: 10, z: 20 },
      chainStart: { x: 10, z: 20 },
      segments: 2,
      hoverB: { x: 100, z: 200 },
      typedMm: "1200",
      preview
    },
    wallDrawSnap: {} as WallDrawStateCleanupContext["wallDrawSnap"],
    wallTypedHud: { textContent: "1200", style: { display: "block" } } as unknown as HTMLElement
  };
};

describe("resetWallDrawState", () => {
  it("preserves current wall drawing cleanup behavior", () => {
    const ctx = createContext();
    const preview = ctx.wallDraw.preview!;

    resetWallDrawState(ctx);

    expect(ctx.wallDraw.active).toBe(false);
    expect(ctx.wallDraw.a).toBeNull();
    expect(ctx.wallDraw.chainStart).toBeNull();
    expect(ctx.wallDraw.segments).toBe(0);
    expect(ctx.wallDraw.hoverB).toBeNull();
    expect(ctx.wallDraw.typedMm).toBe("");
    expect(ctx.wallDraw.preview).toBeNull();
    expect(ctx.wallDrawSnap).toBeNull();
    expect(ctx.wallTypedHud.textContent).toBe("");
    expect(ctx.wallTypedHud.style.display).toBe("none");
    expect(ctx.layoutRoot.children).not.toContain(preview);
    expect(preview.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((preview.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    expect(ctx.hideHoverCursor).toHaveBeenCalledTimes(1);
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledExactlyOnceWith("wall-1");
  });

  it("preserves current wall tool activation behavior", () => {
    const ctx: WallToolActivationContext = {
      S: { kitchenEditMode: false } as AppState,
      clearSelectionBoxes: vi.fn(),
      clearSelectionForDrawingTool: vi.fn(),
      ensureFloorplanViewerTab: vi.fn(),
      enterWallTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    const result = activateWallToolState(ctx);

    expect(result).toBe("activated");
    expect(ctx.enterWallTool).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.clearSelectionForDrawingTool).toHaveBeenCalledOnce();
    expect(ctx.clearSelectionBoxes).toHaveBeenCalledOnce();
    expect(ctx.mountProps).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).not.toHaveBeenCalled();
  });

  it("keeps wall drawing blocked in kitchen edit mode", () => {
    const ctx: WallToolActivationContext = {
      S: { kitchenEditMode: true } as AppState,
      clearSelectionBoxes: vi.fn(),
      clearSelectionForDrawingTool: vi.fn(),
      ensureFloorplanViewerTab: vi.fn(),
      enterWallTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    const result = activateWallToolState(ctx);

    expect(result).toBe("blocked-kitchen-edit");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Wall: v kitchen edit mode sa steny nekreslia.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
    expect(ctx.enterWallTool).not.toHaveBeenCalled();
    expect(ctx.ensureFloorplanViewerTab).not.toHaveBeenCalled();
    expect(ctx.clearSelectionForDrawingTool).not.toHaveBeenCalled();
    expect(ctx.clearSelectionBoxes).not.toHaveBeenCalled();
  });
});
