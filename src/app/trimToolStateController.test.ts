import { describe, expect, it, vi } from "vitest";
import {
  activateTrimToolState,
  resetTrimState,
  resetTrimTargetFromEscape,
  type TrimTargetEscapeContext,
  type TrimToolActivationContext,
  type TrimToolStateContext
} from "./trimToolStateController";

const createContext = (): TrimToolStateContext => ({
  trimState: {
    step: "pickCutter",
    targetWallId: "wall-1",
    targetPick: { id: "target-pick" },
    targetClick: { x: 10, z: 20 },
    hover: { id: "hover-pick" },
    lastTarget: { id: "last-target" },
    lastCutter: { id: "last-cutter" },
    lastUntilMs: 12345
  }
});

describe("resetTrimState", () => {
  it("preserves current trim tool state reset behavior", () => {
    const ctx = createContext();

    resetTrimState(ctx);

    expect(ctx.trimState.step).toBe("pickTarget");
    expect(ctx.trimState.targetWallId).toBeNull();
    expect(ctx.trimState.targetPick).toBeNull();
    expect(ctx.trimState.targetClick).toBeNull();
    expect(ctx.trimState.hover).toBeNull();
    expect(ctx.trimState.lastTarget).toBeNull();
    expect(ctx.trimState.lastCutter).toBeNull();
    expect(ctx.trimState.lastUntilMs).toBe(0);
  });

  it("preserves current trim tool activation behavior", () => {
    const ctx: TrimToolActivationContext = {
      ...createContext(),
      ensureFloorplanViewerTab: vi.fn(),
      enterTrimTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    activateTrimToolState(ctx);

    expect(ctx.enterTrimTool).toHaveBeenCalledOnce();
    expect(ctx.trimState.step).toBe("pickTarget");
    expect(ctx.trimState.targetWallId).toBeNull();
    expect(ctx.trimState.targetPick).toBeNull();
    expect(ctx.trimState.targetClick).toBeNull();
    expect(ctx.trimState.hover).toBeNull();
    expect(ctx.trimState.lastTarget).toBeNull();
    expect(ctx.trimState.lastCutter).toBeNull();
    expect(ctx.trimState.lastUntilMs).toBe(0);
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Trim: click target wall...");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("preserves current Trim Escape target reset behavior", () => {
    const ctx: TrimTargetEscapeContext = {
      ...createContext(),
      clearToolHud: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    resetTrimTargetFromEscape(ctx);

    expect(ctx.trimState.step).toBe("pickTarget");
    expect(ctx.trimState.targetWallId).toBeNull();
    expect(ctx.trimState.targetPick).toBeNull();
    expect(ctx.trimState.targetClick).toBeNull();
    expect(ctx.trimState.hover).toBeNull();
    expect(ctx.trimState.lastTarget).toBeNull();
    expect(ctx.trimState.lastCutter).toBeNull();
    expect(ctx.trimState.lastUntilMs).toBe(0);
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Trim: click target wall...");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
