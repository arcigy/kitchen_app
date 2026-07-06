import { describe, expect, it, vi } from "vitest";
import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import {
  runToolbarActionCommand,
  runToolbarAlignCommand,
  runToolbarBomCommand,
  runToolbarButtonClickCommand,
  runToolbarCameraCommand,
  runToolbarColumnCommand,
  runToolbarCopyExportCommand,
  runToolbarCustomFurnitureCommand,
  runToolbarDeleteCommand,
  runToolbarDimensionCommand,
  runToolbarDoorCommand,
  runToolbarDuplicateCommand,
  runToolbarExportJsonCommand,
  runToolbarExportSceneCommand,
  runToolbarFloorCommand,
  runToolbarHideToggleCommand,
  runToolbarHistoryActionCommand,
  runToolbarInstallCommand,
  runToolbarIsolateCommand,
  runToolbarMaterialCommand,
  runToolbarMeasureToggleCommand,
  runToolbarMoveCommand,
  runToolbarOptionalEntryModeCommand,
  runToolbarRedoCommand,
  runToolbarResetDefaultsCommand,
  runToolbarResetViewCommand,
  runToolbarRotateCommand,
  runToolbarSectionCommand,
  runToolbarSelectCommand,
  runToolbarPricingCatalogCommand,
  runToolbarToolSetterCommand,
  runToolbarTrimCommand,
  runToolbarToggle2dCommand,
  runToolbarUndoCommand,
  runToolbarUnderlayCommand,
  runToolbarUnpinFromWorktopCommand,
  runToolbarUnhideAllCommand,
  runToolbarWallCommand,
  runToolbarWardrobeCommand,
  runToolbarWindowCommand
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

  it("runs a simple toolbar tool setter command", () => {
    const setTool = vi.fn();

    runToolbarToolSetterCommand(setTool);

    expect(setTool).toHaveBeenCalledExactlyOnceWith();
  });

  it("runs a simple toolbar action command", () => {
    const action = vi.fn();

    runToolbarActionCommand(action);

    expect(action).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes architecture object buttons through current add/select commands", () => {
    const ctx = {
      addColumn: vi.fn(),
      addOrSelectDoor: vi.fn(),
      addOrSelectWindow: vi.fn()
    };

    runToolbarDoorCommand(ctx);
    runToolbarWindowCommand(ctx);
    runToolbarColumnCommand(ctx);

    expect(ctx.addOrSelectDoor).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.addOrSelectWindow).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.addColumn).toHaveBeenCalledExactlyOnceWith();
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

  it("runs toolbar history action with current state and helpers", () => {
    const S = { marker: "state" } as unknown as AppState;
    const helpers = { marker: "helpers" } as unknown as HistoryHelpers;
    const action = vi.fn();

    runToolbarHistoryActionCommand(action, { S, helpers });

    expect(action).toHaveBeenCalledExactlyOnceWith(S, helpers);
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

  it("routes unpin from worktop through current selection command", () => {
    const ctx = {
      unpinSelectedModulesFromWorktop: vi.fn()
    };

    runToolbarUnpinFromWorktopCommand(ctx);

    expect(ctx.unpinSelectedModulesFromWorktop).toHaveBeenCalledExactlyOnceWith();
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

  it("routes floor and room entry buttons through current entry commands", () => {
    const ctx = {
      customFurnitureMode: { enterNew: vi.fn() },
      enterFloorBoundaryEdit: vi.fn(),
      wardrobeMode: { enterNew: vi.fn() }
    };

    runToolbarFloorCommand(ctx);
    runToolbarWardrobeCommand(ctx);
    runToolbarCustomFurnitureCommand(ctx);

    expect(ctx.enterFloorBoundaryEdit).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.wardrobeMode.enterNew).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.customFurnitureMode.enterNew).toHaveBeenCalledExactlyOnceWith();
  });

  it("keeps optional room entry commands inert when modes are unavailable", () => {
    expect(() => runToolbarWardrobeCommand({ wardrobeMode: null })).not.toThrow();
    expect(() => runToolbarCustomFurnitureCommand({ customFurnitureMode: null })).not.toThrow();
  });

  it("runs optional toolbar entry mode only when a mode exists", () => {
    const mode = { enterNew: vi.fn() };

    runToolbarOptionalEntryModeCommand(mode);
    runToolbarOptionalEntryModeCommand(null);

    expect(mode.enterNew).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes view buttons through current view commands", () => {
    const resetViewBtn = { click: vi.fn() };
    const ctx = {
      openUnderlayPanel: vi.fn(),
      toggle2dView: vi.fn()
    };

    runToolbarUnderlayCommand(ctx);
    runToolbarToggle2dCommand(ctx);
    runToolbarResetViewCommand(resetViewBtn);
    runToolbarResetViewCommand(null);

    expect(ctx.openUnderlayPanel).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.toggle2dView).toHaveBeenCalledExactlyOnceWith();
    expect(resetViewBtn.click).toHaveBeenCalledExactlyOnceWith();
  });

  it("runs toolbar button click command only when a button exists", () => {
    const button = { click: vi.fn() };

    runToolbarButtonClickCommand(button);
    runToolbarButtonClickCommand(null);

    expect(button.click).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes output proxy buttons through their current button clicks", () => {
    const ctx = {
      args: {
        copyBtn: { click: vi.fn() },
        exportBtn: { click: vi.fn() },
        exportSceneBtn: { click: vi.fn() },
        resetBtn: { click: vi.fn() }
      }
    };

    runToolbarExportJsonCommand(ctx);
    runToolbarExportSceneCommand(ctx);
    runToolbarCopyExportCommand(ctx);
    runToolbarResetDefaultsCommand(ctx);

    expect(ctx.args.exportBtn.click).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.args.exportSceneBtn.click).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.args.copyBtn.click).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.args.resetBtn.click).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes pricing and BOM buttons through current output commands", () => {
    const S = {
      customFurniture: [{ id: "cf1" }],
      instances: [{ id: "m1" }],
      kitchenCtx: { worktopHeightMm: 900 },
      kitchenWorktops: [{ id: "w1" }]
    } as unknown as Pick<AppState, "customFurniture" | "instances" | "kitchenCtx" | "kitchenWorktops">;
    const ctx = {
      S,
      openBomPanel: vi.fn(),
      openPricingCatalog: vi.fn()
    };

    runToolbarPricingCatalogCommand(ctx);
    runToolbarBomCommand(ctx);

    expect(ctx.openPricingCatalog).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.openBomPanel).toHaveBeenCalledExactlyOnceWith({
      customFurniture: S.customFurniture,
      instances: S.instances,
      kitchenCtx: S.kitchenCtx,
      kitchenWorktops: S.kitchenWorktops
    });
  });

  it("routes install through promptAppInstall when installation is available", () => {
    const ctx = {
      getInstallState: vi.fn(() => ({ available: true })),
      promptAppInstall: vi.fn(() => Promise.resolve(true))
    };
    const alertUser = vi.fn();

    runToolbarInstallCommand(ctx, alertUser);

    expect(ctx.promptAppInstall).toHaveBeenCalledExactlyOnceWith();
    expect(alertUser).not.toHaveBeenCalled();
  });

  it("routes install through fallback alert when installation is unavailable", () => {
    const ctx = {
      getInstallState: vi.fn(() => ({ available: false })),
      promptAppInstall: vi.fn(() => Promise.resolve(true))
    };
    const alertUser = vi.fn();

    runToolbarInstallCommand(ctx, alertUser);

    expect(ctx.promptAppInstall).not.toHaveBeenCalled();
    expect(alertUser).toHaveBeenCalledExactlyOnceWith("Chrome: Save and share > Install page as app.");
  });

  it("routes visualisation buttons through current visualisation commands", () => {
    const ctx = {
      startCameraPlacement: vi.fn(),
      startMaterialModify: vi.fn()
    };

    runToolbarMaterialCommand(ctx);
    runToolbarCameraCommand(ctx);

    expect(ctx.startMaterialModify).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.startCameraPlacement).toHaveBeenCalledExactlyOnceWith();
  });
});
