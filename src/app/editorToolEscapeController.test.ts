import { describe, expect, it, vi } from "vitest";
import {
  finishEditorEscape,
  handleEditorLayoutEscape,
  stopEditorToolFromEscape,
  type EditorLayoutEscapeContext
} from "./editorToolEscapeController";

const createEscapeContext = (overrides: Partial<EditorLayoutEscapeContext> = {}): EditorLayoutEscapeContext => ({
  alignHasReference: () => false,
  cancelColumnPlacement: vi.fn(),
  clearActiveAlignReference: vi.fn(),
  clearActiveSectionLine: vi.fn(),
  clearActiveTrimTarget: vi.fn(),
  dimensionEscape: vi.fn(),
  isColumnPlacementActive: () => false,
  isTypingTarget: () => false,
  layoutTool: "select",
  mode: "layout",
  sectionHasActiveLine: () => false,
  stopMeasureTool: vi.fn(),
  stopSelectTool: vi.fn(),
  stopSectionTool: vi.fn(),
  stopWallTool: vi.fn(),
  trimHasActiveTarget: () => false,
  ...overrides
});

const createEscapeEvent = () => ({ preventDefault: vi.fn(), target: null });

describe("editorToolEscapeController", () => {
  it("stops a tool and applies the provided status", () => {
    const ctx = {
      setUnderlayStatus: vi.fn(),
      stopTool: vi.fn()
    };

    stopEditorToolFromEscape(ctx, "Wall: stopped.");

    expect(ctx.stopTool).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Wall: stopped.");
  });

  it("marks Escape as handled", () => {
    const ev = createEscapeEvent();

    const result = finishEditorEscape(ev);

    expect(result).toBe(true);
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("ignores Escape outside layout mode", () => {
    const ev = createEscapeEvent();
    const ctx = createEscapeContext({ mode: "build" });

    const result = handleEditorLayoutEscape(ctx, ev);

    expect(result).toBe(false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores Escape from typing targets", () => {
    const ev = createEscapeEvent();
    const ctx = createEscapeContext({ isTypingTarget: () => true });

    const result = handleEditorLayoutEscape(ctx, ev);

    expect(result).toBe(false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("routes Escape to the active Align reference reset", () => {
    const ev = createEscapeEvent();
    const clearActiveAlignReference = vi.fn();
    const ctx = createEscapeContext({
      alignHasReference: () => true,
      clearActiveAlignReference,
      layoutTool: "align"
    });

    const result = handleEditorLayoutEscape(ctx, ev);

    expect(result).toBe(true);
    expect(clearActiveAlignReference).toHaveBeenCalledOnce();
    expect(ctx.stopSelectTool).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("routes Escape from idle Trim to select", () => {
    const ev = createEscapeEvent();
    const stopSelectTool = vi.fn();
    const ctx = createEscapeContext({
      layoutTool: "trim",
      stopSelectTool,
      trimHasActiveTarget: () => false
    });

    const result = handleEditorLayoutEscape(ctx, ev);

    expect(result).toBe(true);
    expect(stopSelectTool).toHaveBeenCalledOnce();
    expect(ctx.clearActiveTrimTarget).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("routes Escape from active Section draw to section line cleanup", () => {
    const ev = createEscapeEvent();
    const clearActiveSectionLine = vi.fn();
    const ctx = createEscapeContext({
      clearActiveSectionLine,
      layoutTool: "section",
      sectionHasActiveLine: () => true
    });

    const result = handleEditorLayoutEscape(ctx, ev);

    expect(result).toBe(true);
    expect(clearActiveSectionLine).toHaveBeenCalledOnce();
    expect(ctx.stopSectionTool).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });
});
