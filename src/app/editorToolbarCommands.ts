import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import type { AppInstallState } from "../pwa/installController";
import type { StartTransformOptions, TransformKind } from "./transformStateTypes";

export type ToolbarTransformCommandContext = {
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => void;
};

export type ToolbarMeasureToggleCommandContext = {
  layoutTool: string;
  setToolMeasure: () => void;
  setToolSelect: () => void;
};

export type ToolbarToolCommandContext = {
  addColumn: () => void;
  addOrSelectDoor: () => void;
  addOrSelectWindow: () => void;
  setToolAlign: () => void;
  setToolDimension: () => void;
  setToolSection: () => void;
  setToolSelect: () => void;
  setToolTrim: () => void;
  setToolWall: () => void;
};

export type ToolbarHistoryCommandContext = {
  S: AppState;
  helpers: HistoryHelpers;
  redo: (S: AppState, helpers: HistoryHelpers) => void;
  undo: (S: AppState, helpers: HistoryHelpers) => void;
};

export type ToolbarSelectionEditCommandContext = {
  deleteSelected: () => void;
  duplicateSelected: () => void;
};

export type ToolbarVisibilityCommandContext = {
  visibility: {
    hideSelected: () => void;
    isolateSelected: () => void;
    selectedHasHidden: () => boolean;
    unhideAll: () => void;
    unhideSelected: () => void;
  };
};

export type ToolbarEntryModeCommandContext = {
  customFurnitureMode: { enterNew: () => void } | null;
  enterFloorBoundaryEdit: () => void;
  wardrobeMode: { enterNew: () => void } | null;
};

export type ToolbarViewOutputCommandContext = {
  S: Pick<AppState, "customFurniture" | "instances" | "kitchenCtx" | "kitchenWorktops">;
  args: {
    copyBtn: Pick<HTMLButtonElement, "click">;
    exportBtn: Pick<HTMLButtonElement, "click">;
    exportSceneBtn: Pick<HTMLButtonElement, "click">;
    resetBtn: Pick<HTMLButtonElement, "click">;
  };
  openBomPanel: (args: Pick<AppState, "customFurniture" | "instances" | "kitchenCtx" | "kitchenWorktops">) => void;
  openPricingCatalog: () => void;
  openUnderlayPanel: () => void;
  toggle2dView: () => void;
};

export type ToolbarInstallCommandContext = {
  getInstallState: () => Pick<AppInstallState, "available">;
  promptAppInstall: () => Promise<boolean>;
};

export type ToolbarVisualisationCommandContext = {
  startCameraPlacement: () => void;
  startMaterialModify: () => void;
};

export function runToolbarMoveCommand(ctx: ToolbarTransformCommandContext) {
  ctx.startTransformFromSelection("move", { sticky: true, toggle: true });
}

export function runToolbarRotateCommand(ctx: ToolbarTransformCommandContext) {
  ctx.startTransformFromSelection("rotate");
}

export function runToolbarMeasureToggleCommand(ctx: ToolbarMeasureToggleCommandContext) {
  if (ctx.layoutTool === "measure") ctx.setToolSelect();
  else ctx.setToolMeasure();
}

export function runToolbarToolSetterCommand(setTool: () => void) {
  setTool();
}

export function runToolbarSelectCommand(ctx: Pick<ToolbarToolCommandContext, "setToolSelect">) {
  runToolbarToolSetterCommand(ctx.setToolSelect);
}

export function runToolbarWallCommand(ctx: Pick<ToolbarToolCommandContext, "setToolWall">) {
  runToolbarToolSetterCommand(ctx.setToolWall);
}

export function runToolbarDoorCommand(ctx: Pick<ToolbarToolCommandContext, "addOrSelectDoor">) {
  ctx.addOrSelectDoor();
}

export function runToolbarWindowCommand(ctx: Pick<ToolbarToolCommandContext, "addOrSelectWindow">) {
  ctx.addOrSelectWindow();
}

export function runToolbarColumnCommand(ctx: Pick<ToolbarToolCommandContext, "addColumn">) {
  ctx.addColumn();
}

export function runToolbarAlignCommand(ctx: Pick<ToolbarToolCommandContext, "setToolAlign">) {
  runToolbarToolSetterCommand(ctx.setToolAlign);
}

export function runToolbarTrimCommand(ctx: Pick<ToolbarToolCommandContext, "setToolTrim">) {
  runToolbarToolSetterCommand(ctx.setToolTrim);
}

export function runToolbarDimensionCommand(ctx: Pick<ToolbarToolCommandContext, "setToolDimension">) {
  runToolbarToolSetterCommand(ctx.setToolDimension);
}

export function runToolbarSectionCommand(ctx: Pick<ToolbarToolCommandContext, "setToolSection">) {
  runToolbarToolSetterCommand(ctx.setToolSection);
}

export function runToolbarUndoCommand(ctx: ToolbarHistoryCommandContext) {
  ctx.undo(ctx.S, ctx.helpers);
}

export function runToolbarRedoCommand(ctx: ToolbarHistoryCommandContext) {
  ctx.redo(ctx.S, ctx.helpers);
}

export function runToolbarDuplicateCommand(ctx: Pick<ToolbarSelectionEditCommandContext, "duplicateSelected">) {
  ctx.duplicateSelected();
}

export function runToolbarDeleteCommand(ctx: Pick<ToolbarSelectionEditCommandContext, "deleteSelected">) {
  ctx.deleteSelected();
}

export function runToolbarHideToggleCommand(ctx: ToolbarVisibilityCommandContext, syncVisibility: () => void) {
  if (ctx.visibility.selectedHasHidden()) ctx.visibility.unhideSelected();
  else ctx.visibility.hideSelected();
  syncVisibility();
}

export function runToolbarIsolateCommand(ctx: ToolbarVisibilityCommandContext) {
  ctx.visibility.isolateSelected();
}

export function runToolbarUnhideAllCommand(ctx: ToolbarVisibilityCommandContext) {
  ctx.visibility.unhideAll();
}

export function runToolbarFloorCommand(ctx: Pick<ToolbarEntryModeCommandContext, "enterFloorBoundaryEdit">) {
  ctx.enterFloorBoundaryEdit();
}

export function runToolbarWardrobeCommand(ctx: Pick<ToolbarEntryModeCommandContext, "wardrobeMode">) {
  ctx.wardrobeMode?.enterNew();
}

export function runToolbarCustomFurnitureCommand(ctx: Pick<ToolbarEntryModeCommandContext, "customFurnitureMode">) {
  ctx.customFurnitureMode?.enterNew();
}

export function runToolbarUnderlayCommand(ctx: Pick<ToolbarViewOutputCommandContext, "openUnderlayPanel">) {
  ctx.openUnderlayPanel();
}

export function runToolbarToggle2dCommand(ctx: Pick<ToolbarViewOutputCommandContext, "toggle2dView">) {
  ctx.toggle2dView();
}

export function runToolbarButtonClickCommand(button: Pick<HTMLButtonElement, "click"> | null | undefined) {
  button?.click();
}

export function runToolbarResetViewCommand(resetViewBtn: Pick<HTMLButtonElement, "click"> | null) {
  runToolbarButtonClickCommand(resetViewBtn);
}

export function runToolbarExportJsonCommand(ctx: Pick<ToolbarViewOutputCommandContext, "args">) {
  runToolbarButtonClickCommand(ctx.args.exportBtn);
}

export function runToolbarExportSceneCommand(ctx: Pick<ToolbarViewOutputCommandContext, "args">) {
  runToolbarButtonClickCommand(ctx.args.exportSceneBtn);
}

export function runToolbarCopyExportCommand(ctx: Pick<ToolbarViewOutputCommandContext, "args">) {
  runToolbarButtonClickCommand(ctx.args.copyBtn);
}

export function runToolbarPricingCatalogCommand(ctx: Pick<ToolbarViewOutputCommandContext, "openPricingCatalog">) {
  ctx.openPricingCatalog();
}

export function runToolbarBomCommand(ctx: Pick<ToolbarViewOutputCommandContext, "S" | "openBomPanel">) {
  ctx.openBomPanel({
    customFurniture: ctx.S.customFurniture,
    instances: ctx.S.instances,
    kitchenCtx: ctx.S.kitchenCtx,
    kitchenWorktops: ctx.S.kitchenWorktops
  });
}

export function runToolbarResetDefaultsCommand(ctx: Pick<ToolbarViewOutputCommandContext, "args">) {
  runToolbarButtonClickCommand(ctx.args.resetBtn);
}

export function runToolbarInstallCommand(
  ctx: ToolbarInstallCommandContext,
  alertUser: (message: string) => void = (message) => window.alert(message)
) {
  const state = ctx.getInstallState();
  if (state.available) {
    void ctx.promptAppInstall();
    return;
  }
  alertUser("Chrome: Save and share > Install page as app.");
}

export function runToolbarMaterialCommand(ctx: Pick<ToolbarVisualisationCommandContext, "startMaterialModify">) {
  ctx.startMaterialModify();
}

export function runToolbarCameraCommand(ctx: Pick<ToolbarVisualisationCommandContext, "startCameraPlacement">) {
  ctx.startCameraPlacement();
}
