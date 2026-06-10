import { describe, expect, it, vi } from "vitest";
import {
  activateDimensionToolState,
  handleDimensionEscape,
  type DimensionToolActivationContext,
  type DimensionToolEscapeContext
} from "./dimensionToolStateController";

const createContext = (picked: unknown[]): DimensionToolEscapeContext => ({
  dimensionState: { picked },
  setUnderlayStatus: vi.fn(),
  stopDimensionTool: vi.fn(),
  technicalDimensions: { resetDraft: vi.fn() }
});

describe("handleDimensionEscape", () => {
  it("clears the active dimension draft without stopping the tool", () => {
    const ctx = createContext([{ id: "line-1" }]);

    const result = handleDimensionEscape(ctx);

    expect(result).toBe("draft-cleared");
    expect(ctx.technicalDimensions.resetDraft).toHaveBeenCalledOnce();
    expect(ctx.stopDimensionTool).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Dimension: selection cleared. Pick the first line.");
  });

  it("stops the dimension tool when there is no active draft", () => {
    const ctx = createContext([]);

    const result = handleDimensionEscape(ctx);

    expect(result).toBe("stopped");
    expect(ctx.technicalDimensions.resetDraft).not.toHaveBeenCalled();
    expect(ctx.stopDimensionTool).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Dimension: stopped.");
  });

  it("preserves current dimension tool activation behavior", () => {
    const ctx: DimensionToolActivationContext = {
      clearSelectionForDrawingTool: vi.fn(),
      ensureFloorplanViewerTab: vi.fn(),
      enterDimensionTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn(),
      syncSelectionState: vi.fn(),
      updateSelectionHighlights: vi.fn()
    };

    activateDimensionToolState(ctx);

    expect(ctx.enterDimensionTool).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.clearSelectionForDrawingTool).toHaveBeenCalledOnce();
    expect(ctx.syncSelectionState).toHaveBeenCalledOnce();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith(
      "Dimension: pick the first line, then another parallel line. Click empty space to place dimension."
    );
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
