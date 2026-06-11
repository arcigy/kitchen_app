import { describe, expect, it, vi } from "vitest";
import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import {
  runToolbarAlignCommand,
  runToolbarDeleteCommand,
  runToolbarDimensionCommand,
  runToolbarDuplicateCommand,
  runToolbarHideToggleCommand,
  runToolbarIsolateCommand,
  runToolbarMeasureToggleCommand,
  runToolbarMoveCommand,
  runToolbarRedoCommand,
  runToolbarRotateCommand,
  runToolbarSectionCommand,
  runToolbarSelectCommand,
  runToolbarTrimCommand,
  runToolbarUndoCommand,
  runToolbarUnhideAllCommand,
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

  it("routes history buttons through the current history helpers", () => {
    const ctx = {
      S: { marker: "state" } as unknown as AppState,
      helpers: { marker: "helpers" } as unknown as HistoryHelpers,
      redo: vi.fn(),
      undo: vi.fn()
    };

    runToolbarUndoCommand(ctx);
    runToolbarRedoCommand(ctx);

    expect(ctx.undo).toHaveBeenCalledExactlyOnceWith(ctx.S, ctx.helpers);
    expect(ctx.redo).toHaveBeenCalledExactlyOnceWith(ctx.S, ctx.helpers);
  });

  it("routes selection edit buttons through current selection commands", () => {
    const ctx = {
      deleteSelected: vi.fn(),
      duplicateSelected: vi.fn()
    };

    runToolbarDuplicateCommand(ctx);
    runToolbarDeleteCommand(ctx);

    expect(ctx.duplicateSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.deleteSelected).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes hide toggle through hideSelected and refreshes toolbar visibility", () => {
    const ctx = {
      visibility: {
        hideSelected: vi.fn(),
        isolateSelected: vi.fn(),
        selectedHasHidden: vi.fn(() => false),
        unhideAll: vi.fn(),
        unhideSelected: vi.fn()
      }
    };
    const syncVisibility = vi.fn();

    runToolbarHideToggleCommand(ctx, syncVisibility);

    expect(ctx.visibility.hideSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.visibility.unhideSelected).not.toHaveBeenCalled();
    expect(syncVisibility).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes hide toggle through unhideSelected when selected objects are hidden", () => {
    const ctx = {
      visibility: {
        hideSelected: vi.fn(),
        isolateSelected: vi.fn(),
        selectedHasHidden: vi.fn(() => true),
        unhideAll: vi.fn(),
        unhideSelected: vi.fn()
      }
    };
    const syncVisibility = vi.fn();

    runToolbarHideToggleCommand(ctx, syncVisibility);

    expect(ctx.visibility.unhideSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.visibility.hideSelected).not.toHaveBeenCalled();
    expect(syncVisibility).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes isolate and unhide all through current visibility commands", () => {
    const ctx = {
      visibility: {
        hideSelected: vi.fn(),
        isolateSelected: vi.fn(),
        selectedHasHidden: vi.fn(),
        unhideAll: vi.fn(),
        unhideSelected: vi.fn()
      }
    };

    runToolbarIsolateCommand(ctx);
    runToolbarUnhideAllCommand(ctx);

    expect(ctx.visibility.isolateSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.visibility.unhideAll).toHaveBeenCalledExactlyOnceWith();
  });
});
