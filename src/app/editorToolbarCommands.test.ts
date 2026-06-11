import { describe, expect, it, vi } from "vitest";
import { runToolbarMeasureToggleCommand, runToolbarMoveCommand, runToolbarRotateCommand } from "./editorToolbarCommands";

describe("editor toolbar commands", () => {
  it("runs the current sticky move toolbar command", () => {
    const ctx = { startTransformFromSelection: vi.fn() };

    runToolbarMoveCommand(ctx);

    expect(ctx.startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("move", { sticky: true, toggle: true });
  });

  it("runs the current rotate toolbar command", () => {
    const ctx = { startTransformFromSelection: vi.fn() };

    runToolbarRotateCommand(ctx);

    expect(ctx.startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("rotate");
  });

  it("toggles measure off through Select when Measure is already active", () => {
    const ctx = {
      layoutTool: "measure",
      setToolMeasure: vi.fn(),
      setToolSelect: vi.fn()
    };

    runToolbarMeasureToggleCommand(ctx);

    expect(ctx.setToolSelect).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolMeasure).not.toHaveBeenCalled();
  });

  it("toggles measure on when another layout tool is active", () => {
    const ctx = {
      layoutTool: "select",
      setToolMeasure: vi.fn(),
      setToolSelect: vi.fn()
    };

    runToolbarMeasureToggleCommand(ctx);

    expect(ctx.setToolMeasure).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolSelect).not.toHaveBeenCalled();
  });
});
