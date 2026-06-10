import { describe, expect, it, vi } from "vitest";
import {
  activateAlignToolState,
  clearAlignReference,
  clearAlignReferenceFromEscape,
  resetAlignState,
  type AlignReferenceEscapeContext,
  type AlignToolActivationContext,
  type AlignToolStateContext
} from "./alignToolStateController";

const createContext = (): AlignToolStateContext => ({
  alignState: {
    ref: { id: "ref" },
    hover: { id: "hover" },
    lastA: { id: "last-a" },
    lastB: { id: "last-b" },
    lastUntilMs: 12345
  }
});

describe("alignToolStateController", () => {
  it("clears only the active align reference", () => {
    const ctx = createContext();
    const hover = ctx.alignState.hover;
    const lastA = ctx.alignState.lastA;
    const lastB = ctx.alignState.lastB;

    clearAlignReference(ctx);

    expect(ctx.alignState.ref).toBeNull();
    expect(ctx.alignState.hover).toBe(hover);
    expect(ctx.alignState.lastA).toBe(lastA);
    expect(ctx.alignState.lastB).toBe(lastB);
    expect(ctx.alignState.lastUntilMs).toBe(12345);
  });

  it("preserves current full align state reset behavior", () => {
    const ctx = createContext();

    resetAlignState(ctx);

    expect(ctx.alignState.ref).toBeNull();
    expect(ctx.alignState.hover).toBeNull();
    expect(ctx.alignState.lastA).toBeNull();
    expect(ctx.alignState.lastB).toBeNull();
    expect(ctx.alignState.lastUntilMs).toBe(0);
  });

  it("preserves current align tool activation behavior", () => {
    const ctx: AlignToolActivationContext = {
      ...createContext(),
      ensureFloorplanViewerTab: vi.fn(),
      enterAlignTool: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    activateAlignToolState(ctx);

    expect(ctx.enterAlignTool).toHaveBeenCalledOnce();
    expect(ctx.alignState.ref).toBeNull();
    expect(ctx.alignState.hover).toBeNull();
    expect(ctx.alignState.lastA).toBeNull();
    expect(ctx.alignState.lastB).toBeNull();
    expect(ctx.alignState.lastUntilMs).toBe(0);
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Align: click reference line...");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("preserves current Align Escape reference clear behavior", () => {
    const ctx: AlignReferenceEscapeContext = {
      ...createContext(),
      clearToolHud: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayStatus: vi.fn()
    };

    clearAlignReferenceFromEscape(ctx);

    expect(ctx.alignState.ref).toBeNull();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Align: click reference line...");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
