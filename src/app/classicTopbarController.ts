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
import { createEditorCommandRegistry, type EditorCommandId } from "./editorCommandRegistry";
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

  const selectionState = () => ({ available: ctx.visibility.hasSelection(), disabledReason: "Select an object first." });
  const commandRegistry = createEditorCommandRegistry([
    { id: "wall", group: "architecture", label: "Wall", iconSvg: ctx.I_WALL, execute: () => runToolbarWallCommand(ctx), getState: () => ({ active: ctx.layoutTool === "wall" }) },
    { id: "door", group: "architecture", label: "Door", iconSvg: ctx.I_DOOR, execute: () => runToolbarDoorCommand(ctx) },
    { id: "window", group: "architecture", label: "Window", iconSvg: ctx.I_WINDOW, execute: () => runToolbarWindowCommand(ctx) },
    { id: "column", group: "architecture", label: "Column", iconSvg: ctx.I_COLUMN, execute: () => runToolbarColumnCommand(ctx) },
    { id: "floor", group: "architecture", label: "Floor", iconSvg: ctx.I_FLOOR, execute: () => runToolbarFloorCommand(ctx) },
    { id: "stair", group: "architecture", label: "Stair", iconSvg: ctx.I_STAIR, execute: () => { showComingSoonDialog("Schodisko"); } },
    { id: "kitchen-catalog", group: "kitchen", label: "Kitchen catalog", iconSvg: ctx.I_CABINET, keywords: ["modules", "cabinets"], execute: () => setActiveTab("kitchen") },
    { id: "led-strip", group: "kitchen", label: "Custom LED strip", iconSvg: ctx.I_LED_STRIP, keywords: ["led", "lighting"], execute: () => ctx.setToolLed("custom") },
    { id: "led-under-upper", group: "kitchen", label: "LED under upper cabinets", iconSvg: ctx.I_LED_STRIP, keywords: ["led", "lighting"], execute: () => ctx.setToolLed("underUpper") },
    { id: "led-plinth-joint", group: "kitchen", label: "LED at plinth", iconSvg: ctx.I_LED_STRIP, keywords: ["led", "lighting"], execute: () => ctx.setToolLed("plinthJoint") },
    { id: "led-shelf-joint", group: "kitchen", label: "LED in shelves", iconSvg: ctx.I_LED_STRIP, keywords: ["led", "lighting"], execute: () => ctx.setToolLed("shelfJoint") },
    { id: "fit-gap", group: "kitchen", label: "Fit gap", iconSvg: ctx.I_FIT_GAP, execute: ctx.fitSelectedKitchenModuleToGap, getState: selectionState },
    { id: "living-wall-catalog", group: "living-wall", label: "Living Wall", iconSvg: ctx.I_LIVING_WALL, execute: () => setActiveTab("livingWall") },
    { id: "room-catalog", group: "room", label: "Room modules", iconSvg: ctx.I_WARDROBE, execute: () => setActiveTab("room") },
    { id: "wardrobe", group: "room", label: "Wardrobe", iconSvg: ctx.I_WARDROBE, execute: () => runToolbarWardrobeCommand(ctx) },
    { id: "custom-furniture", group: "room", label: "Custom Furniture", iconSvg: ctx.I_CABINET, execute: () => runToolbarCustomFurnitureCommand(ctx) },
    { id: "select", group: "modify", label: "Select", iconSvg: ctx.I_SELECT, execute: () => runToolbarSelectCommand(ctx), getState: () => ({ active: ctx.layoutTool === "select" }) },
    { id: "undo", group: "modify", label: "Undo", iconSvg: ctx.I_UNDO, execute: () => runToolbarUndoCommand(ctx) },
    { id: "redo", group: "modify", label: "Redo", iconSvg: ctx.I_REDO, execute: () => runToolbarRedoCommand(ctx) },
    { id: "move", group: "modify", label: "Move", iconSvg: ctx.I_MOVE, execute: () => runToolbarMoveCommand(ctx), getState: () => ({ ...selectionState(), active: ctx.transformState.kind === "move" }) },
    { id: "rotate", group: "modify", label: "Rotate", iconSvg: ctx.I_ROTATE, execute: () => runToolbarRotateCommand(ctx), getState: selectionState },
    { id: "align", group: "modify", label: "Align", iconSvg: ctx.I_ALIGN, execute: () => runToolbarAlignCommand(ctx), getState: () => ({ active: ctx.layoutTool === "align" }) },
    { id: "trim", group: "modify", label: "Trim", iconSvg: ctx.I_TRIM, execute: () => runToolbarTrimCommand(ctx), getState: () => ({ active: ctx.layoutTool === "trim" }) },
    { id: "dimension", group: "modify", label: "Dimension", iconSvg: ctx.I_DIM, execute: () => runToolbarDimensionCommand(ctx), getState: () => ({ active: ctx.layoutTool === "dimension" }) },
    { id: "duplicate", group: "modify", label: "Duplicate", iconSvg: ctx.I_DUP, execute: () => runToolbarDuplicateCommand(ctx), getState: selectionState },
    { id: "unpin-worktop", group: "modify", label: "Unpin Worktop", iconSvg: ctx.I_UNPIN_WORKTOP, execute: () => runToolbarUnpinFromWorktopCommand(ctx), getState: () => ({ available: ctx.canUnpinSelectedModulesFromWorktop() }) },
    { id: "hide", group: "modify", label: "Hide", iconSvg: ctx.I_HIDE, execute: () => runToolbarHideToggleCommand(ctx, syncClassicTopbarVisibility), getState: selectionState },
    { id: "isolate", group: "modify", label: "Isolate", iconSvg: ctx.I_ISOLATE, execute: () => runToolbarIsolateCommand(ctx), getState: selectionState },
    { id: "unhide-all", group: "modify", label: "Unhide All", iconSvg: ctx.I_UNHIDE, execute: () => runToolbarUnhideAllCommand(ctx), getState: () => ({ available: ctx.visibility.hasHiddenObjects() }) },
    { id: "delete", group: "modify", label: "Delete", iconSvg: ctx.I_TRASH, execute: () => runToolbarDeleteCommand(ctx), getState: selectionState },
    { id: "materials", group: "visualisation", label: "Material", iconSvg: ctx.I_MATERIAL_EDIT, execute: () => runToolbarMaterialCommand(ctx) },
    { id: "camera", group: "visualisation", label: "Camera", iconSvg: ctx.I_CAMERA, execute: () => runToolbarCameraCommand(ctx) },
    { id: "section", group: "view", label: "Section", iconSvg: ctx.I_SECTION, execute: () => runToolbarSectionCommand(ctx) },
    { id: "measure", group: "view", label: "Measure", iconSvg: ctx.I_MEASURE, execute: () => runToolbarMeasureToggleCommand(ctx), getState: () => ({ active: ctx.layoutTool === "measure" }) },
    { id: "underlay", group: "view", label: "Underlay", iconSvg: ctx.I_UNDERLAY, execute: () => runToolbarUnderlayCommand(ctx) },
    { id: "toggle-2d", group: "view", label: "2D View", iconSvg: ctx.I_GRID2D, execute: () => runToolbarToggle2dCommand(ctx) },
    { id: "reset-view", group: "view", label: "Reset View", iconSvg: ctx.I_RESET_VIEW, execute: () => runToolbarResetViewCommand(ctx.args.viewerEl.querySelector<HTMLButtonElement>("#resetViewBtn")) },
    { id: "export-json", group: "file", label: "Export JSON", iconSvg: ctx.I_EXPORT, execute: () => runToolbarExportJsonCommand(ctx) },
    { id: "export-scene", group: "file", label: "Blender Material Review", iconSvg: ctx.I_BLENDER_REVIEW, execute: () => runToolbarExportSceneCommand(ctx) },
    { id: "copy-export", group: "file", label: "Copy Export", iconSvg: ctx.I_COPY, execute: () => runToolbarCopyExportCommand(ctx) },
    { id: "pricing", group: "file", label: "Pricing Catalog", iconSvg: ctx.I_PRICING_CATALOG, execute: () => runToolbarPricingCatalogCommand(ctx) },
    { id: "bom", group: "file", label: "BOM", iconSvg: ctx.I_BOM, execute: () => runToolbarBomCommand(ctx) },
    { id: "install", group: "file", label: "Install App", iconSvg: ctx.I_INSTALL, execute: () => runToolbarInstallCommand(ctx), getState: () => ({ available: !ctx.getInstallState().installed }) },
    { id: "reset-defaults", group: "file", label: "Reset Defaults", iconSvg: ctx.I_RESET, execute: () => runToolbarResetDefaultsCommand(ctx) }
  ]);
  const executeCommand = (id: EditorCommandId) => void commandRegistry.execute(id);

  const addArchitectureTab = (row: HTMLElement) => {
    const tools = ctx.tb.addGroup("Architecture", { row });
    addButton(tools, { title: "Wall", label: "Wall", iconSvg: ctx.I_WALL, onClick: () => executeCommand("wall") });
    addButton(tools, { title: "Door", label: "Door", iconSvg: ctx.I_DOOR, onClick: () => executeCommand("door") });
    addButton(tools, { title: "Window", label: "Window", iconSvg: ctx.I_WINDOW, onClick: () => executeCommand("window") });
    addButton(tools, { title: "Column", label: "Column", iconSvg: ctx.I_COLUMN, onClick: () => executeCommand("column") });
    addButton(tools, { title: "Floor", label: "Floor", iconSvg: ctx.I_FLOOR, onClick: () => executeCommand("floor") });
    addButton(tools, { title: "Stair", label: "Stair", iconSvg: ctx.I_STAIR, onClick: () => executeCommand("stair") });
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
    addButton(tools, { title: "Wardrobe", label: "Wardrobe", iconSvg: ctx.I_WARDROBE, onClick: () => executeCommand("wardrobe") });
    addButton(tools, { title: "Custom Furniture", label: "Custom", iconSvg: ctx.I_CABINET, onClick: () => executeCommand("custom-furniture") });
  };

  const addModifyTab = (row: HTMLElement) => {
    const select = ctx.tb.addGroup("Selection", { row });
    addButton(select, { title: "Select", label: "Select", iconSvg: ctx.I_SELECT, onClick: () => executeCommand("select") });

    const edit = ctx.tb.addGroup("Edit", { row });
    ctx.S.undoBtnEl = ctx.tb.toolButton(edit, { title: "Undo", label: "Undo", iconSvg: ctx.I_UNDO, onClick: () => executeCommand("undo") });
    ctx.S.redoBtnEl = ctx.tb.toolButton(edit, { title: "Redo", label: "Redo", iconSvg: ctx.I_REDO, onClick: () => executeCommand("redo") });
    moveBtn = addButton(edit, { title: "Move", label: "Move", iconSvg: ctx.I_MOVE, onClick: () => executeCommand("move") });
    addButton(edit, { title: "Rotate", label: "Rotate", iconSvg: ctx.I_ROTATE, onClick: () => executeCommand("rotate") });
    addButton(edit, { title: "Align", label: "Align", iconSvg: ctx.I_ALIGN, onClick: () => executeCommand("align") });
    addButton(edit, { title: "Trim", label: "Trim", iconSvg: ctx.I_TRIM, onClick: () => executeCommand("trim") });
    addButton(edit, { title: "Dimension", label: "Dimension", iconSvg: ctx.I_DIM, onClick: () => executeCommand("dimension") });
    addButton(edit, { title: "Duplicate", label: "Duplicate", iconSvg: ctx.I_DUP, onClick: () => executeCommand("duplicate") });
    unpinWorktopBtn = addButton(edit, {
      title: "Unpin from Worktop",
      label: "Unpin Worktop",
      iconSvg: ctx.I_UNPIN_WORKTOP,
      onClick: () => executeCommand("unpin-worktop")
    });
    hideBtn = ctx.tb.toolButton(edit, {
      title: "Hide",
      label: "Hide",
      iconSvg: ctx.I_HIDE,
      onClick: () => executeCommand("hide")
    });
    isolateBtn = addButton(edit, { title: "Isolate", label: "Isolate", iconSvg: ctx.I_ISOLATE, onClick: () => executeCommand("isolate") });
    unhideAllBtn = addButton(edit, { title: "Unhide All", label: "Unhide All", iconSvg: ctx.I_UNHIDE, onClick: () => executeCommand("unhide-all") });
    addButton(edit, { title: "Delete", label: "Delete", iconSvg: ctx.I_TRASH, onClick: () => executeCommand("delete") });
  };

  const addViewTab = (row: HTMLElement) => {
    const view = ctx.tb.addGroup("View", { row });
    addButton(view, { title: "Section", label: "Section", iconSvg: ctx.I_SECTION, onClick: () => executeCommand("section") });
    addButton(view, {
      title: "Measure",
      label: "Measure",
      iconSvg: ctx.I_MEASURE,
      onClick: () => executeCommand("measure")
    });
    addButton(view, { title: "Underlay", label: "Underlay", iconSvg: ctx.I_UNDERLAY, onClick: () => executeCommand("underlay") });
    addButton(view, { title: "2D View", label: "2D View", iconSvg: ctx.I_GRID2D, onClick: () => executeCommand("toggle-2d") });
    addButton(view, { title: "Reset View", label: "View", iconSvg: ctx.I_RESET_VIEW, onClick: () => executeCommand("reset-view") });

    const output = ctx.tb.addGroup("Output", { row });
    addButton(output, { title: "Export JSON", label: "Export", iconSvg: ctx.I_EXPORT, onClick: () => executeCommand("export-json") });
    addButton(output, { title: "Blender Material Review", label: "Blender", iconSvg: ctx.I_BLENDER_REVIEW, onClick: () => executeCommand("export-scene") });
    addButton(output, { title: "Copy Export", label: "Copy", iconSvg: ctx.I_COPY, onClick: () => executeCommand("copy-export") });
    addButton(output, { title: "Pricing Catalog", iconSvg: ctx.I_PRICING_CATALOG, label: "Catalog", onClick: () => executeCommand("pricing") });
    ctx.tb.toolButton(output, {
      title: "BOM",
      iconSvg: ctx.I_BOM,
      label: "BOM",
      onClick: () => executeCommand("bom")
    });
    const installBtn = ctx.tb.toolButton(output, {
      title: "Install App",
      label: "Install",
      iconSvg: ctx.I_INSTALL,
      onClick: () => executeCommand("install")
    });
    const syncInstallButton = () => {
      const state = ctx.getInstallState();
      installBtn.style.display = state.supported && !state.installed ? "" : "none";
      installBtn.style.opacity = state.available ? "1" : "0.72";
      installBtn.title = state.available ? "Install App" : "Install App (Chrome menu)";
    };
    syncInstallButton();
    ctx.subscribeInstallState(syncInstallButton);
    addButton(output, { title: "Reset Defaults", label: "Reset", iconSvg: ctx.I_RESET, onClick: () => executeCommand("reset-defaults") });
  };

  const addVisualisationTab = (row: HTMLElement) => {
    const material = ctx.tb.addGroup("Materials", { row });
    addButton(material, {
      title: "Material modify",
      label: "Material",
      iconSvg: ctx.I_MATERIAL_EDIT,
      onClick: () => executeCommand("materials")
    });
    const camera = ctx.tb.addGroup("Camera", { row });
    addButton(camera, {
      title: "Camera",
      label: "Camera",
      iconSvg: ctx.I_CAMERA,
      onClick: () => executeCommand("camera")
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

  return { buildClassicTopbar, commandRegistry, setActiveTab, syncClassicTopbarVisibility };
}
