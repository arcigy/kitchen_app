import type { AppState } from "../layout/appState";
import type { HistoryHelpers } from "../layout/historyManager";
import type { AppArgs } from "./bootstrap";
import type { createTopbar } from "../ui/createTopbar";
import { showComingSoonDialog } from "../ui/comingSoonDialog";
import type { AppInstallState } from "../pwa/installController";
import type { StartTransformOptions, TransformKind, TransformState } from "./transformStateTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { ModuleParams } from "../model/cabinetTypes";
import { t } from "../i18n";
import { installLedStripMenu } from "../ui/ledStripMenu";
import type { LedStripMode } from "../layout/ledStripTypes";
import {
  runToolbarAlignCommand,
  runToolbarBomCommand,
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
  runToolbarInstallCommand,
  runToolbarIsolateCommand,
  runToolbarMaterialCommand,
  runToolbarMeasureToggleCommand,
  runToolbarMoveCommand,
  runToolbarPricingCatalogCommand,
  runToolbarRedoCommand,
  runToolbarResetDefaultsCommand,
  runToolbarResetViewCommand,
  runToolbarRotateCommand,
  runToolbarSectionCommand,
  runToolbarSelectCommand,
  runToolbarToggle2dCommand,
  runToolbarTrimCommand,
  runToolbarUndoCommand,
  runToolbarUnderlayCommand,
  runToolbarUnpinFromWorktopCommand,
  runToolbarUnhideAllCommand,
  runToolbarWallCommand,
  runToolbarWardrobeCommand,
  runToolbarWindowCommand
} from "./editorToolbarCommands";

type KitchenModeActions = {
  enterNew: () => void;
  mountTopbar: (row: HTMLElement) => void;
  mountModuleCatalog: (host: HTMLElement | null) => void;
};

type WardrobeModeActions = {
  enterNew: () => void;
};

type CustomFurnitureModeActions = {
  enterNew: () => void;
};

type ClassicTopbarControllerContext = {
  I_ALIGN: string;
  I_BLENDER_REVIEW: string;
  I_BOM: string;
  I_CABINET: string;
  I_COLUMN: string;
  I_COPY: string;
  I_DIM: string;
  I_DOOR: string;
  I_DUP: string;
  I_EXPORT: string;
  I_FIT_GAP: string;
  I_FLOOR: string;
  I_GRID2D: string;
  I_HIDE: string;
  I_INSTALL: string;
  I_ISOLATE: string;
  I_LIVING_WALL: string;
  I_LED_STRIP: string;
  I_MATERIAL_EDIT: string;
  I_MEASURE: string;
  I_MOVE: string;
  I_PRICING_CATALOG: string;
  I_REDO: string;
  I_RESET: string;
  I_RESET_VIEW: string;
  I_ROTATE: string;
  I_SECTION: string;
  I_SELECT: string;
  I_STAIR: string;
  I_TRASH: string;
  I_TRIM: string;
  I_UNDERLAY: string;
  I_UNPIN_WORKTOP: string;
  I_UNDO: string;
  I_UNHIDE: string;
  I_VIEW: string;
  I_CAMERA: string;
  I_WARDROBE: string;
  I_WINDOW: string;
  I_WALL: string;
  S: AppState;
  addColumn: () => void;
  addInstance: (type: ModuleParams["type"]) => void;
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
  canUnpinSelectedModulesFromWorktop: () => boolean;
  unpinSelectedModulesFromWorktop: () => void;
  enterFloorBoundaryEdit: () => void;
  ensureFloorplanViewerTab: () => void;
  ensureLayoutMode: () => void;
  getInstallState: () => AppInstallState;
  helpers: HistoryHelpers;
  customFurnitureMode: CustomFurnitureModeActions | null;
  kitchenMode: KitchenModeActions | null;
  fitSelectedKitchenModuleToGap: () => void;
  clientCatalog: ClientCatalog;
  modulePackages: readonly FurnQuoteModulePackage[];
  wardrobeMode: WardrobeModeActions | null;
  layoutTool: string;
  openBomPanel: (args: Pick<AppState, "instances" | "kitchenWorktops" | "customFurniture" | "kitchenCtx">) => void;
  openPricingCatalog: () => void;
  openUnderlayPanel: () => void;
  promptAppInstall: () => Promise<boolean>;
  redo: (S: AppState, helpers: HistoryHelpers) => void;
  setToolAlign: () => void;
  setToolDimension: () => void;
  setToolLed: (mode: LedStripMode) => void;
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
  let unpinWorktopBtn: HTMLButtonElement | null = null;
  let unhideAllBtn: HTMLButtonElement | null = null;
  let activeTab: TopbarTab = "architecture";
  let tabHandlersInstalled = false;
  let disposeLedStripMenu: (() => void) | null = null;

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
    button.dataset.iconTooltipTitle = title;
    button.dataset.iconTooltipDescription = `Use this control to ${title.toLocaleLowerCase()}.`;
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
    setToolButton(unpinWorktopBtn, {
      title: "Unpin from Worktop",
      label: "Unpin Worktop",
      disabled: !ctx.canUnpinSelectedModulesFromWorktop()
    });
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

  const addModuleButton = (toolsEl: HTMLElement, modulePackage: FurnQuoteModulePackage, iconSvg: string) => {
    addButton(toolsEl, {
      title: modulePackage.module.moduleType,
      label: modulePackage.module.displayName,
      iconSvg,
      onClick: () => {
        ctx.ensureLayoutMode();
        ctx.ensureFloorplanViewerTab();
        ctx.setToolSelect();
        ctx.addInstance(modulePackage.module.moduleType as ModuleParams["type"]);
      }
    });
  };

  const isKitchenModule = (modulePackage: FurnQuoteModulePackage) => {
    const tags = new Set((modulePackage.module.tags ?? []).map((tag) => tag.toLowerCase()));
    if (tags.has("kitchen")) return true;
    if (modulePackage.behavior?.contextBindings?.some((binding) => binding.contextType === "kitchenGroup")) return true;
    return (
      modulePackage.module.category === "base_cabinet" ||
      modulePackage.module.category === "wall_cabinet" ||
      modulePackage.module.category === "tall_cabinet" ||
      modulePackage.module.category === "corner_cabinet"
    );
  };

  const enabledRoomPackages = () =>
    getEnabledModulePackageDefinitions(ctx.clientCatalog, ctx.modulePackages)
      .filter((modulePackage) => !isKitchenModule(modulePackage));

  const addArchitectureTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Architecture", { row });
    addButton(tools, { title: "Wall", label: "Wall", iconSvg: ctx.I_WALL, onClick: () => runToolbarWallCommand(ctx) });
    addButton(tools, { title: "Door", label: "Door", iconSvg: ctx.I_DOOR, onClick: () => runToolbarDoorCommand(ctx) });
    addButton(tools, { title: "Window", label: "Window", iconSvg: ctx.I_WINDOW, onClick: () => runToolbarWindowCommand(ctx) });
    addButton(tools, { title: "Column", label: "Column", iconSvg: ctx.I_COLUMN, onClick: () => runToolbarColumnCommand(ctx) });
    addButton(tools, { title: "Floor", label: "Floor", iconSvg: ctx.I_FLOOR, onClick: () => runToolbarFloorCommand(ctx) });
    addButton(tools, { title: "Stair", label: "Stair", iconSvg: ctx.I_STAIR, onClick: () => showComingSoonDialog("Schodisko") });
  };

  const addKitchenTab = (row: HTMLElement) => {
    ctx.kitchenMode?.mountModuleCatalog(document.getElementById("moduleCatalog"));
    ctx.kitchenMode?.mountTopbar(row);
    const led = ctx.tb.addGroup("LED", { row });
    const ledButton = addButton(led, { title: "LED pásik", label: "LED pásik", iconSvg: ctx.I_LED_STRIP });
    disposeLedStripMenu?.();
    disposeLedStripMenu = installLedStripMenu({ trigger: ledButton, onChoose: ctx.setToolLed });
    const auto = ctx.tb.addGroup("Auto", { row });
    addButton(auto, { title: "Fit selected module into gap", label: "Fit gap", iconSvg: ctx.I_FIT_GAP, onClick: ctx.fitSelectedKitchenModuleToGap });
  };

  const addLivingWallTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Living Wall", { row });
    const modules = enabledRoomPackages().filter((modulePackage) =>
      modulePackage.module.moduleType === "fwm_living_wall" ||
      modulePackage.module.category === "wall_unit" ||
      (modulePackage.module.tags ?? []).includes("living")
    );
    if (modules.length === 0) {
      addButton(tools, { title: "Living Wall", label: "Living Wall", iconSvg: ctx.I_LIVING_WALL, onClick: () => showComingSoonDialog("Obývačková stena") });
      return;
    }
    for (const modulePackage of modules) addModuleButton(tools, modulePackage, ctx.I_LIVING_WALL);
  };

  const addRoomTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Room", { row });
    const modules = enabledRoomPackages().filter((modulePackage) =>
      modulePackage.module.moduleType !== "fwm_living_wall" &&
      modulePackage.module.category !== "wall_unit" &&
      !(modulePackage.module.tags ?? []).includes("living")
    );
    for (const modulePackage of modules) addModuleButton(tools, modulePackage, ctx.I_WARDROBE);
    addButton(tools, { title: "Wardrobe", label: "Wardrobe", iconSvg: ctx.I_WARDROBE, onClick: () => runToolbarWardrobeCommand(ctx) });
    addButton(tools, { title: "Custom Furniture", label: "Custom", iconSvg: ctx.I_CABINET, onClick: () => runToolbarCustomFurnitureCommand(ctx) });
  };

  const addModifyTab = (row: HTMLElement) => {
    const select = ctx.tb.addGroup("Selection", { row });
    addButton(select, { title: "Select", label: "Select", iconSvg: ctx.I_SELECT, onClick: () => runToolbarSelectCommand(ctx) });

    const edit = ctx.tb.addGroup("Edit", { row });
    ctx.S.undoBtnEl = ctx.tb.toolButton(edit, { title: "Undo", label: "Undo", iconSvg: ctx.I_UNDO, onClick: () => runToolbarUndoCommand(ctx) });
    ctx.S.redoBtnEl = ctx.tb.toolButton(edit, { title: "Redo", label: "Redo", iconSvg: ctx.I_REDO, onClick: () => runToolbarRedoCommand(ctx) });
    moveBtn = addButton(edit, { title: "Move", label: "Move", iconSvg: ctx.I_MOVE, onClick: () => runToolbarMoveCommand(ctx) });
    addButton(edit, { title: "Rotate", label: "Rotate", iconSvg: ctx.I_ROTATE, onClick: () => runToolbarRotateCommand(ctx) });
    addButton(edit, { title: "Align", label: "Align", iconSvg: ctx.I_ALIGN, onClick: () => runToolbarAlignCommand(ctx) });
    addButton(edit, { title: "Trim", label: "Trim", iconSvg: ctx.I_TRIM, onClick: () => runToolbarTrimCommand(ctx) });
    addButton(edit, { title: "Dimension", label: "Dimension", iconSvg: ctx.I_DIM, onClick: () => runToolbarDimensionCommand(ctx) });
    addButton(edit, { title: "Duplicate", label: "Duplicate", iconSvg: ctx.I_DUP, onClick: () => runToolbarDuplicateCommand(ctx) });
    unpinWorktopBtn = addButton(edit, {
      title: "Unpin from Worktop",
      label: "Unpin Worktop",
      iconSvg: ctx.I_UNPIN_WORKTOP,
      onClick: () => runToolbarUnpinFromWorktopCommand(ctx)
    });
    hideBtn = ctx.tb.toolButton(edit, {
      title: "Hide",
      label: "Hide",
      iconSvg: ctx.I_HIDE,
      onClick: () => runToolbarHideToggleCommand(ctx, syncClassicTopbarVisibility)
    });
    isolateBtn = addButton(edit, { title: "Isolate", label: "Isolate", iconSvg: ctx.I_ISOLATE, onClick: () => runToolbarIsolateCommand(ctx) });
    unhideAllBtn = addButton(edit, { title: "Unhide All", label: "Unhide All", iconSvg: ctx.I_UNHIDE, onClick: () => runToolbarUnhideAllCommand(ctx) });
    addButton(edit, { title: "Delete", label: "Delete", iconSvg: ctx.I_TRASH, onClick: () => runToolbarDeleteCommand(ctx) });
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
    addButton(view, { title: "Underlay", label: "Underlay", iconSvg: ctx.I_UNDERLAY, onClick: () => runToolbarUnderlayCommand(ctx) });
    addButton(view, { title: "2D View", label: "2D View", iconSvg: ctx.I_GRID2D, onClick: () => runToolbarToggle2dCommand(ctx) });
    const resetViewBtn = ctx.args.viewerEl.querySelector("#resetViewBtn") as HTMLButtonElement | null;
    addButton(view, { title: "Reset View", label: "View", iconSvg: ctx.I_RESET_VIEW, onClick: () => runToolbarResetViewCommand(resetViewBtn) });

    const output = ctx.tb.addGroup("Output", { row });
    addButton(output, { title: "Export JSON", label: "Export", iconSvg: ctx.I_EXPORT, onClick: () => runToolbarExportJsonCommand(ctx) });
    addButton(output, { title: "Blender Material Review", label: "Blender", iconSvg: ctx.I_BLENDER_REVIEW, onClick: () => runToolbarExportSceneCommand(ctx) });
    addButton(output, { title: "Copy Export", label: "Copy", iconSvg: ctx.I_COPY, onClick: () => runToolbarCopyExportCommand(ctx) });
    addButton(output, { title: "Pricing Catalog", iconSvg: ctx.I_PRICING_CATALOG, label: "Catalog", onClick: () => runToolbarPricingCatalogCommand(ctx) });
    ctx.tb.toolButton(output, {
      title: "BOM",
      iconSvg: ctx.I_BOM,
      label: "BOM",
      onClick: () => runToolbarBomCommand(ctx)
    });
    const installBtn = ctx.tb.toolButton(output, {
      title: "Install App",
      label: "Install",
      iconSvg: ctx.I_INSTALL,
      onClick: () => runToolbarInstallCommand(ctx)
    });
    const syncInstallButton = () => {
      const state = ctx.getInstallState();
      installBtn.style.display = state.supported && !state.installed ? "" : "none";
      installBtn.style.opacity = state.available ? "1" : "0.72";
      installBtn.title = state.available ? "Install App" : "Install App (Chrome menu)";
    };
    syncInstallButton();
    ctx.subscribeInstallState(syncInstallButton);
    addButton(output, { title: "Reset Defaults", label: "Reset", iconSvg: ctx.I_RESET, onClick: () => runToolbarResetDefaultsCommand(ctx) });
  };

  const addVisualisationTab = (row: HTMLElement) => {
    const material = ctx.tb.addGroup("Materials", { row });
    addButton(material, {
      title: "Material modify",
      label: "Material",
      iconSvg: ctx.I_MATERIAL_EDIT,
      onClick: () => runToolbarMaterialCommand(ctx)
    });
    const camera = ctx.tb.addGroup("Camera", { row });
    addButton(camera, {
      title: "Camera",
      label: "Camera",
      iconSvg: ctx.I_CAMERA,
      onClick: () => runToolbarCameraCommand(ctx)
    });
  };

  function buildClassicTopbar() {
    installTabHandlers();
    syncTopbarTabs();
    disposeLedStripMenu?.();
    disposeLedStripMenu = null;
    ctx.tb.clear();
    ctx.S.undoBtnEl = null;
    ctx.S.redoBtnEl = null;
    hideBtn = null;
    isolateBtn = null;
    moveBtn = null;
    unpinWorktopBtn = null;
    unhideAllBtn = null;

    const row = ctx.tb.addRow({ className: "topbar-classic-ribbon" });
    if (activeTab !== "kitchen") ctx.kitchenMode?.mountModuleCatalog(null);
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
