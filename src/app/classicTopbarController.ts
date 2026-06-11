import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import type { AppArgs } from "./bootstrap";
import type { createTopbar } from "../ui/createTopbar";
import type { AppInstallState } from "../pwa/installController";
import type { StartTransformOptions, TransformKind, TransformState } from "./transformStateTypes";
import { t } from "../i18n";
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

type KitchenModeActions = {
  enterNew: () => void;
  mountTopbar: (row: HTMLElement) => void;
};

type WardrobeModeActions = {
  enterNew: () => void;
};

type CustomFurnitureModeActions = {
  enterNew: () => void;
};

type ClassicTopbarControllerContext = {
  I_ALIGN: string;
  I_BOM: string;
  I_CABINET: string;
  I_COLUMN: string;
  I_COPY: string;
  I_DIM: string;
  I_DOOR: string;
  I_DUP: string;
  I_EXPORT: string;
  I_FLOOR: string;
  I_GRID2D: string;
  I_HIDE: string;
  I_INSTALL: string;
  I_ISOLATE: string;
  I_LIVING_WALL: string;
  I_MEASURE: string;
  I_MOVE: string;
  I_REDO: string;
  I_RESET: string;
  I_ROTATE: string;
  I_SECTION: string;
  I_SELECT: string;
  I_STAIR: string;
  I_TRASH: string;
  I_TRIM: string;
  I_UNDERLAY: string;
  I_UNDO: string;
  I_UNHIDE: string;
  I_VIEW: string;
  I_WARDROBE: string;
  I_WINDOW: string;
  I_WALL: string;
  S: AppState;
  addColumn: () => void;
  addOrSelectDoor: () => void;
  addOrSelectWindow: () => void;
  args: AppArgs & {
    copyBtn: HTMLButtonElement;
    exportBtn: HTMLButtonElement;
    exportSceneBtn: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
    viewerEl: HTMLElement;
  };
  deleteSelected: () => void;
  duplicateSelected: () => void;
  enterFloorBoundaryEdit: () => void;
  getInstallState: () => AppInstallState;
  helpers: HistoryHelpers;
  customFurnitureMode: CustomFurnitureModeActions | null;
  kitchenMode: KitchenModeActions | null;
  wardrobeMode: WardrobeModeActions | null;
  layoutTool: string;
  openBomPanel: (args: Pick<AppState, "instances" | "kitchenWorktops" | "customFurniture" | "kitchenCtx">) => void;
  openPricingCatalog: () => void;
  openUnderlayPanel: () => void;
  promptAppInstall: () => Promise<boolean>;
  redo: (S: AppState, helpers: HistoryHelpers) => void;
  setToolAlign: () => void;
  setToolDimension: () => void;
  setToolMeasure: () => void;
  setToolSection: () => void;
  setToolSelect: () => void;
  setToolTrim: () => void;
  setToolWall: () => void;
  startTransformFromSelection: (kind: TransformKind, opts?: StartTransformOptions) => void;
  startCameraPlacement: () => void;
  startMaterialModify: () => void;
  subscribeInstallState: (listener: (state: AppInstallState) => void) => () => void;
  tb: ReturnType<typeof createTopbar>;
  toggle2dView: () => void;
  transformState: Pick<TransformState, "kind" | "stickyMove">;
  undo: (S: AppState, helpers: HistoryHelpers) => void;
  updateUndoRedoUi: (S: AppState) => void;
  visibility: {
    hasSelection: () => boolean;
    selectedHasHidden: () => boolean;
    isShowHidden: () => boolean;
    hasHiddenObjects: () => boolean;
    hideSelected: () => void;
    unhideSelected: () => void;
    isolateSelected: () => void;
    unhideAll: () => void;
  };
};

type TopbarTab = "architecture" | "kitchen" | "livingWall" | "room" | "modify" | "visualisation" | "view";
const TOPBAR_TABS: TopbarTab[] = ["architecture", "kitchen", "livingWall", "room", "modify", "visualisation", "view"];

export function createClassicTopbarController(ctx: ClassicTopbarControllerContext) {
  let hideBtn: HTMLButtonElement | null = null;
  let isolateBtn: HTMLButtonElement | null = null;
  let moveBtn: HTMLButtonElement | null = null;
  let unhideAllBtn: HTMLButtonElement | null = null;
  let activeTab: TopbarTab = "architecture";
  let tabHandlersInstalled = false;

  const setToolButton = (button: HTMLButtonElement | null, args: { title: string; label: string; iconSvg?: string; disabled?: boolean }) => {
    if (!button) return;
    const title = t(args.title);
    const labelText = t(args.label);
    button.title = title;
    button.setAttribute("aria-label", title);
    button.disabled = !!args.disabled;
    const label = button.querySelector<HTMLElement>(".tool-label");
    if (label) label.textContent = labelText;
    if (args.iconSvg) {
      const icon = button.querySelector<HTMLElement>(".tool-icon");
      if (icon) icon.innerHTML = args.iconSvg;
    }
  };

  const syncClassicTopbarVisibility = () => {
    const hasSelection = ctx.visibility.hasSelection();
    const selectedHidden = ctx.visibility.selectedHasHidden();
    setToolButton(hideBtn, {
      title: selectedHidden ? "Unhide" : "Hide",
      label: selectedHidden ? "Unhide" : "Hide",
      iconSvg: selectedHidden ? ctx.I_UNHIDE : ctx.I_HIDE,
      disabled: !hasSelection
    });
    setToolButton(isolateBtn, {
      title: "Isolate",
      label: "Isolate",
      disabled: !hasSelection
    });
    if (unhideAllBtn) {
      const visible = ctx.visibility.isShowHidden() && ctx.visibility.hasHiddenObjects();
      unhideAllBtn.style.display = visible ? "" : "none";
      unhideAllBtn.disabled = !visible;
    }
    moveBtn?.classList.toggle("active", ctx.transformState.kind === "move" && !!ctx.transformState.stickyMove);
  };

  const syncTopbarTabs = () => {
    for (const tabId of TOPBAR_TABS) {
      ctx.tb.getTab(tabId)?.classList.toggle("active", tabId === activeTab);
    }
  };

  const installTabHandlers = () => {
    if (tabHandlersInstalled) return;
    tabHandlersInstalled = true;
    for (const tabId of TOPBAR_TABS) {
      ctx.tb.getTab(tabId)?.addEventListener("click", () => {
        setActiveTab(tabId);
      });
    }
  };

  const addButton = (
    toolsEl: HTMLElement,
    args: { title: string; label: string; iconSvg: string; onClick?: () => void; variant?: "success" | "danger" }
  ) => ctx.tb.toolButton(toolsEl, args);

  const addArchitectureTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Architecture", { row });
    addButton(tools, { title: "Wall", label: "Wall", iconSvg: ctx.I_WALL, onClick: () => runToolbarWallCommand(ctx) });
    addButton(tools, { title: "Door", label: "Door", iconSvg: ctx.I_DOOR, onClick: ctx.addOrSelectDoor });
    addButton(tools, { title: "Window", label: "Window", iconSvg: ctx.I_WINDOW, onClick: ctx.addOrSelectWindow });
    addButton(tools, { title: "Column", label: "Column", iconSvg: ctx.I_COLUMN, onClick: ctx.addColumn });
    addButton(tools, { title: "Floor", label: "Floor", iconSvg: ctx.I_FLOOR, onClick: () => ctx.enterFloorBoundaryEdit() });
    addButton(tools, { title: "Stair", label: "Stair", iconSvg: ctx.I_STAIR });
  };

  const addKitchenTab = (row: HTMLElement) => {
    ctx.kitchenMode?.mountTopbar(row);
  };

  const addLivingWallTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Living Wall", { row });
    addButton(tools, { title: "Living Wall", label: "Living Wall", iconSvg: ctx.I_LIVING_WALL });
  };

  const addRoomTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Room", { row });
    addButton(tools, { title: "Room", label: "Room", iconSvg: ctx.I_WARDROBE });
    addButton(tools, { title: "Wardrobe", label: "Wardrobe", iconSvg: ctx.I_WARDROBE, onClick: () => ctx.wardrobeMode?.enterNew() });
    addButton(tools, { title: "Custom Furniture", label: "Custom", iconSvg: ctx.I_CABINET, onClick: () => ctx.customFurnitureMode?.enterNew() });
  };

  const addModifyTab = (row: HTMLElement) => {
    const select = ctx.tb.addGroup("Selection", { row });
    addButton(select, { title: "Select", label: "Select", iconSvg: ctx.I_SELECT, onClick: () => runToolbarSelectCommand(ctx) });

    const edit = ctx.tb.addGroup("Edit", { row });
    ctx.S.undoBtnEl = ctx.tb.toolButton(edit, { title: "Undo", label: "Undo", iconSvg: ctx.I_UNDO, onClick: () => ctx.undo(ctx.S, ctx.helpers) });
    ctx.S.redoBtnEl = ctx.tb.toolButton(edit, { title: "Redo", label: "Redo", iconSvg: ctx.I_REDO, onClick: () => ctx.redo(ctx.S, ctx.helpers) });
    moveBtn = addButton(edit, { title: "Move", label: "Move", iconSvg: ctx.I_MOVE, onClick: () => runToolbarMoveCommand(ctx) });
    addButton(edit, { title: "Rotate", label: "Rotate", iconSvg: ctx.I_ROTATE, onClick: () => runToolbarRotateCommand(ctx) });
    addButton(edit, { title: "Align", label: "Align", iconSvg: ctx.I_ALIGN, onClick: () => runToolbarAlignCommand(ctx) });
    addButton(edit, { title: "Trim", label: "Trim", iconSvg: ctx.I_TRIM, onClick: () => runToolbarTrimCommand(ctx) });
    addButton(edit, { title: "Dimension", label: "Dimension", iconSvg: ctx.I_DIM, onClick: () => runToolbarDimensionCommand(ctx) });
    addButton(edit, { title: "Duplicate", label: "Duplicate", iconSvg: ctx.I_DUP, onClick: ctx.duplicateSelected });
    hideBtn = ctx.tb.toolButton(edit, {
      title: "Hide",
      label: "Hide",
      iconSvg: ctx.I_HIDE,
      onClick: () => {
        if (ctx.visibility.selectedHasHidden()) ctx.visibility.unhideSelected();
        else ctx.visibility.hideSelected();
        syncClassicTopbarVisibility();
      }
    });
    isolateBtn = addButton(edit, { title: "Isolate", label: "Isolate", iconSvg: ctx.I_ISOLATE, onClick: ctx.visibility.isolateSelected });
    unhideAllBtn = addButton(edit, { title: "Unhide All", label: "Unhide All", iconSvg: ctx.I_UNHIDE, onClick: ctx.visibility.unhideAll });
    addButton(edit, { title: "Delete", label: "Delete", iconSvg: ctx.I_TRASH, onClick: ctx.deleteSelected });
  };

  const addViewTab = (row: HTMLElement) => {
    const view = ctx.tb.addGroup("View", { row });
    addButton(view, { title: "Section", label: "Section", iconSvg: ctx.I_SECTION, onClick: () => runToolbarSectionCommand(ctx) });
    addButton(view, {
      title: "Measure",
      label: "Measure",
      iconSvg: ctx.I_MEASURE,
      onClick: () => runToolbarMeasureToggleCommand(ctx)
    });
    addButton(view, { title: "Underlay", label: "Underlay", iconSvg: ctx.I_UNDERLAY, onClick: ctx.openUnderlayPanel });
    addButton(view, { title: "2D View", label: "2D View", iconSvg: ctx.I_GRID2D, onClick: ctx.toggle2dView });
    const resetViewBtn = ctx.args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
    addButton(view, { title: "Reset View", label: "View", iconSvg: ctx.I_VIEW, onClick: () => resetViewBtn?.click() });

    const output = ctx.tb.addGroup("Output", { row });
    addButton(output, { title: "Export JSON", label: "Export", iconSvg: ctx.I_EXPORT, onClick: () => ctx.args.exportBtn.click() });
    addButton(output, { title: "Blender Material Review", label: "Blender", iconSvg: ctx.I_EXPORT, onClick: () => ctx.args.exportSceneBtn.click() });
    addButton(output, { title: "Copy Export", label: "Copy", iconSvg: ctx.I_COPY, onClick: () => ctx.args.copyBtn.click() });
    addButton(output, { title: "Pricing Catalog", iconSvg: ctx.I_BOM, label: "Catalog", onClick: ctx.openPricingCatalog });
    ctx.tb.toolButton(output, {
      title: "BOM",
      iconSvg: ctx.I_BOM,
      label: "BOM",
      onClick: () => ctx.openBomPanel({ instances: ctx.S.instances, kitchenWorktops: ctx.S.kitchenWorktops, customFurniture: ctx.S.customFurniture, kitchenCtx: ctx.S.kitchenCtx })
    });
    const installBtn = ctx.tb.toolButton(output, {
      title: "Install App",
      label: "Install",
      iconSvg: ctx.I_INSTALL,
      onClick: () => {
        const state = ctx.getInstallState();
        if (state.available) {
          void ctx.promptAppInstall();
          return;
        }
        window.alert("Chrome: Save and share > Install page as app.");
      }
    });
    const syncInstallButton = () => {
      const state = ctx.getInstallState();
      installBtn.style.display = state.supported && !state.installed ? "" : "none";
      installBtn.style.opacity = state.available ? "1" : "0.72";
      installBtn.title = state.available ? "Install App" : "Install App (Chrome menu)";
    };
    syncInstallButton();
    ctx.subscribeInstallState(syncInstallButton);
    addButton(output, { title: "Reset Defaults", label: "Reset", iconSvg: ctx.I_RESET, onClick: () => ctx.args.resetBtn.click() });
  };

  const addVisualisationTab = (row: HTMLElement) => {
    const material = ctx.tb.addGroup("Materials", { row });
    addButton(material, {
      title: "Material modify",
      label: "Material",
      iconSvg: ctx.I_VIEW,
      onClick: ctx.startMaterialModify
    });
    const camera = ctx.tb.addGroup("Camera", { row });
    addButton(camera, {
      title: "Camera",
      label: "Camera",
      iconSvg: ctx.I_VIEW,
      onClick: ctx.startCameraPlacement
    });
  };

  function buildClassicTopbar() {
    installTabHandlers();
    syncTopbarTabs();
    ctx.tb.clear();
    ctx.S.undoBtnEl = null;
    ctx.S.redoBtnEl = null;
    hideBtn = null;
    isolateBtn = null;
    moveBtn = null;
    unhideAllBtn = null;

    const row = ctx.tb.addRow({ className: "topbar-classic-ribbon" });
    if (activeTab === "architecture") addArchitectureTab(row);
    else if (activeTab === "kitchen") addKitchenTab(row);
    else if (activeTab === "livingWall") addLivingWallTab(row);
    else if (activeTab === "room") addRoomTab(row);
    else if (activeTab === "modify") addModifyTab(row);
    else if (activeTab === "visualisation") addVisualisationTab(row);
    else addViewTab(row);

    ctx.updateUndoRedoUi(ctx.S);
    syncClassicTopbarVisibility();
  }

  function setActiveTab(tab: TopbarTab) {
    activeTab = tab;
    buildClassicTopbar();
  }

  return { buildClassicTopbar, setActiveTab, syncClassicTopbarVisibility };
}
