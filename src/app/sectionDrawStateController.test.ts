import { describe, expect, it, vi } from "vitest";
import {
  activateSectionToolState,
  clearActiveSectionDrawLine,
  type SectionDrawLineCleanupContext,
  type SectionToolActivationContext
} from "./sectionDrawStateController";

const createContext = (): SectionDrawLineCleanupContext => ({
  drawSnapOverlay: { hide: vi.fn() },
  hideHoverCursor: vi.fn(),
  mountProps: vi.fn(),
  sectionDraw: {
    active: true,
    a: { x: 100, z: 200 },
    hoverPoint: { x: 300, z: 400 }
  },
  setUnderlayStatus: vi.fn(),
  updateSectionDrawPreview: vi.fn()
});

describe("clearActiveSectionDrawLine", () => {
  it("preserves current Escape cleanup for an active section line", () => {
    const ctx = createContext();

    clearActiveSectionDrawLine(ctx);

    expect(ctx.sectionDraw.active).toBe(true);
    expect(ctx.sectionDraw.a).toBeNull();
    expect(ctx.sectionDraw.hoverPoint).toBeNull();
    expect(ctx.updateSectionDrawPreview).toHaveBeenCalledOnce();
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.drawSnapOverlay.hide).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Section: current line canceled. Click first point.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("preserves current section tool activation behavior", () => {
    const ctx: SectionToolActivationContext = {
      clearSectionSelection: vi.fn(),
      clearSelectionBoxes: vi.fn(),
      ensureFloorplanViewerTab: vi.fn(),
      enterSectionTool: vi.fn(),
      mountProps: vi.fn(),
      sectionDraw: { active: false, a: null, hoverPoint: null },
      setUnderlayStatus: vi.fn(),
      syncSelectionState: vi.fn(),
      updateAllSectionVisuals: vi.fn(),
      updateSelectionHighlights: vi.fn()
    };

    activateSectionToolState(ctx);

    expect(ctx.enterSectionTool).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.clearSectionSelection).toHaveBeenCalledOnce();
    expect(ctx.clearSelectionBoxes).toHaveBeenCalledOnce();
    expect(ctx.sectionDraw.active).toBe(true);
    expect(ctx.syncSelectionState).toHaveBeenCalledOnce();
    expect(ctx.updateAllSectionVisuals).toHaveBeenCalledOnce();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Section: click first point, then second point. Space mirrors direction.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
