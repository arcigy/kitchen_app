import { describe, expect, it, vi } from "vitest";
import {
  runToolbarAlignCommand,
  runToolbarDimensionCommand,
  runToolbarMeasureToggleCommand,
  runToolbarMoveCommand,
  runToolbarRotateCommand,
  runToolbarSectionCommand,
  runToolbarSelectCommand,
  runToolbarTrimCommand,
  runToolbarWallCommand
} from "./editorToolbarCommands";

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

  it("routes simple tool buttons through their current tool setters", () => {
    const ctx = {
      setToolAlign: vi.fn(),
      setToolDimension: vi.fn(),
      setToolSection: vi.fn(),
      setToolSelect: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn()
    };

    runToolbarSelectCommand(ctx);
    runToolbarWallCommand(ctx);
    runToolbarAlignCommand(ctx);
    runToolbarTrimCommand(ctx);
    runToolbarDimensionCommand(ctx);
    runToolbarSectionCommand(ctx);

    expect(ctx.setToolSelect).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolWall).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolAlign).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolTrim).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolDimension).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolSection).toHaveBeenCalledExactlyOnceWith();
  });
});
