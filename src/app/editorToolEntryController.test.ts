import { describe, expect, it, vi } from "vitest";
import {
  activateEditorToolPromptState,
  activateSelectToolState,
  activateToggleEditorToolState,
  enterEditorTool,
  type EditorToolEntryContext
} from "./editorToolEntryController";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";

const createContext = (): EditorToolEntryContext => ({
  S: { kitchenEditMode: false } as AppState,
  cancelColumnPlacement: vi.fn(),
  cancelKitchenWorktopDraw: vi.fn(),
  cancelPlacement: vi.fn(),
  cancelSectionDraw: vi.fn(),
  clearTransform: vi.fn(),
  clearWallDrawState: vi.fn(),
  deactivateMeasureTool: vi.fn(),
  ensureLayoutMode: vi.fn(),
  placement: { active: true },
  placementHelpers: {} as PlacementHelpers,
  resetDimensionDraft: vi.fn(),
  setLayoutTool: vi.fn(),
  transformState: { kind: "move", step: "pickTarget" }
});

describe("enterEditorTool", () => {
  it("preserves shared editor tool entry cleanup behavior", () => {
    const ctx = createContext();

    enterEditorTool(ctx, "trim");

    expect(ctx.ensureLayoutMode).toHaveBeenCalledOnce();
    expect(ctx.cancelPlacement).toHaveBeenCalledExactlyOnceWith(ctx.S, ctx.placementHelpers);
    expect(ctx.cancelColumnPlacement).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.clearTransform).toHaveBeenCalledExactlyOnceWith({ restore: true, status: null });
    expect(ctx.setLayoutTool).toHaveBeenCalledExactlyOnceWith("trim");
    expect(ctx.deactivateMeasureTool).toHaveBeenCalledOnce();
    expect(ctx.resetDimensionDraft).toHaveBeenCalledOnce();
    expect(ctx.clearWallDrawState).toHaveBeenCalledOnce();
    expect(ctx.cancelSectionDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.cancelKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
  });

  it("preserves current select tool activation behavior", () => {
    const ctx = {
      enterSelectTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    activateSelectToolState(ctx);

    expect(ctx.enterSelectTool).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("runs prompt tool activation with shared reset/status/mount order", () => {
    const calls: string[] = [];
    const ctx = {
      ensureFloorplanViewerTab: vi.fn(() => calls.push("ensureFloorplanViewerTab")),
      enterTool: vi.fn(() => calls.push("enterTool")),
      mountProps: vi.fn(() => calls.push("mountProps")),
      resetToolState: vi.fn(() => calls.push("resetToolState")),
      setUnderlayStatus: vi.fn(() => calls.push("setUnderlayStatus")),
      status: "Tool: prompt..."
    };

    activateEditorToolPromptState(ctx);

    expect(calls).toEqual(["enterTool", "resetToolState", "ensureFloorplanViewerTab", "setUnderlayStatus", "mountProps"]);
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Tool: prompt...");
  });

  it("routes active toggle tools back to Select without running activation", () => {
    const ctx = {
      activateSelectTool: vi.fn(),
      activateTool: vi.fn(),
      currentTool: "measure" as const,
      tool: "measure" as const
    };

    activateToggleEditorToolState(ctx);

    expect(ctx.activateSelectTool).toHaveBeenCalledOnce();
    expect(ctx.activateTool).not.toHaveBeenCalled();
  });

  it("runs toggle tool activation when another tool is active", () => {
    const ctx = {
      activateSelectTool: vi.fn(),
      activateTool: vi.fn(),
      currentTool: "select" as const,
      tool: "dimension" as const
    };

    activateToggleEditorToolState(ctx);

    expect(ctx.activateTool).toHaveBeenCalledOnce();
    expect(ctx.activateSelectTool).not.toHaveBeenCalled();
  });
});
