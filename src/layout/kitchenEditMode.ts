import * as THREE from "three";
import type { Group, Object3D } from "three";
import type { ModuleParams } from "../model/cabinetTypes";
import type {
  ClientCatalog,
  MaterialDefinition,
} from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type {
  AppState,
  KitchenGroup,
  KitchenWorktopParams,
  LayoutInstance,
} from "./appState";
import { resolveContext, type KitchenContext } from "./kitchenContext";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import {
  getKitchenWorktopThicknessOptions,
  resolveKitchenWorktopThickness,
} from "./kitchenMaterialSync";
import {
  getKitchenModuleRole,
  isKitchenModuleInEditLayer,
  resolveKitchenModulePlanEmphasis,
  type KitchenModuleEditLayer
} from "./kitchenModuleRules";
import {
  groupKitchenModulePackages,
  type KitchenCatalogRole,
  type KitchenCatalogSubcategoryKey,
} from "./kitchenModuleCatalog";
import {
  buildPinoVendorKitchenCatalog,
  type PinoVendorKitchenCatalogEntry,
} from "./pinoVendorKitchenCatalog";
import { getModuleCatalogCardPresentation } from "./moduleCatalogCardPresentation";
import { renderModuleCatalogPreview } from "./moduleCatalogPreview";
import { createAxonometricLineSvgFromObject } from "./moduleAxonometricIcon";
import { t, translateParamLabel } from "../i18n";
import type { EditorPropsApi, EditorTopbarApi } from "../app/editorModeApis";
import { commitHistory } from "./historyManager";
import {
  applyTallStackDimensionSegmentEdit,
  resolveTallStackDimensionChain,
  shouldShowTallStackDimensionChainForView,
  type TallStackDimensionBoundary,
  type TallStackDimensionSegment,
} from "./tallStackDimensionChain";
import {
  copyTallStackSlot,
  insertTallStackSlotAt,
  isTallStackHostParams,
  moveTallStackSlot,
  removeTallStackSlot,
  resolveTallStackSlotBaseBottomMm,
  resolveTallStackUsableBoundsMm,
  TALL_STACK_INSERT_TOOLS,
  type TallStackInsertType,
} from "./tallStackEditor";
import { resolveKitchenEditTopbarAction } from "./kitchenModuleEditorFlow";
import { chooseTallVerticalSnapCandidate } from "./tallStackMoveSnap";
import {
  FWM_DRAWER_SYSTEM_BRAND_OPTIONS,
  listFwmDrawerSystemPresetsForBrand,
  resolveFwmDrawerSystemPresetForFrontHeight,
} from "../modules/fwmFurniture/drawerSystemPresets";
import {
  createDimensionEditInput,
  parseDimensionMillimeters,
  showDimensionInputAtPointer,
} from "../app/pointerDimensionInputControls";
import { isPrimaryPointerButton } from "../app/pointerButtons";
import { SNAP_DISTANCE_PX } from "../app/snapToolProfiles";
import type { PlanSnapKind } from "../app/planSnap";
import { createKitchenRunDimensionOverlay } from "./kitchenRunDimensionOverlay";
import type { KitchenRunDimensionSource } from "./kitchenRunDimensions";
import { getKitchenWorktopSegmentDepthMm } from "./worktopGeometry";
import type { KitchenWorktopSegmentRef } from "./worktopSegmentEditing";

type GroupInstanceSnapshot = {
  id: string;
  params: ModuleParams;
  position: { x: number; y: number; z: number };
  rotationY: number;
};

type GroupWorktopSnapshot = {
  id: string;
  params: KitchenWorktopParams;
};

type KitchenMaterialLookupFamily =
  "front" | "body" | "back" | "drawer_bottom" | "worktop";

type TallSubmoduleSelection = {
  hostInstanceId: string;
  submoduleId: string;
  label: string;
  kind: string;
  slotIndex: number;
};

type TallSubmoduleMoveState = {
  active: boolean;
  operation: "move" | "copy";
  step: "selectObject" | "pickBase" | "pickTarget";
  baseYMm: number | null;
  baseScreenX: number | null;
  currentYMm: number | null;
  currentScreenX: number | null;
  lastDirection: 1 | -1;
  typedMm: string;
  snap: TallVerticalSnap | null;
  originalOffsetMm: number | null;
  originalParams: ModuleParams | null;
  copySourceSlotIndex: number | null;
  previewSlotIndex: number | null;
  previewApplied: boolean;
};

type TallSubmoduleInsertState = {
  active: boolean;
  step: "pickBottom" | "pickTop";
  type: TallStackInsertType | null;
  bottomMm: number | null;
  yMm: number | null;
  screenX: number | null;
  snap: TallVerticalSnap | null;
  originalParams: ModuleParams | null;
  previewSlotIndex: number | null;
  previewApplied: boolean;
};

type TallVerticalSnap = {
  yMm: number;
  kind: Exclude<PlanSnapKind, "none">;
  screenPoint: THREE.Vector2;
  distancePx: number;
  priority: number;
  slotIndex?: number;
};

type TallSubmoduleAlignReference = {
  yMm: number;
  slotIndex?: number;
};

const TALL_DIMENSION_TEXT_HIT_WIDTH_PX = 36;
const TALL_DIMENSION_TEXT_HIT_HEIGHT_PX = 64;
const TALL_DIMENSION_BOUNDARY_HIT_OVERHANG_PX = 16;
const TALL_DIMENSION_BOUNDARY_HIT_WIDTH_PX = 18;
const TALL_DIMENSION_OFFSET_MM = 240;
const TALL_DIMENSION_EXTENSION_GAP_MM = 32;
const TALL_DIMENSION_TEXT_OFFSET_MM = 85;
const TALL_DIMENSION_TEXT_HEIGHT_MM = 78;
const TALL_DIMENSION_BOUNDARY_TICK_MM = 42;
const TALL_DIMENSION_EXTENSION_OVERHANG_MM = 35;
const TALL_MOVE_PREVIEW_SNAP_DISTANCE_PX = 5;

function isKitchenRibbonModule(modulePackage: FurnQuoteModulePackage) {
  const tags = new Set(
    (modulePackage.module.tags ?? []).map((tag) => tag.toLowerCase()),
  );
  if (tags.has("kitchen")) return true;
  if (
    modulePackage.behavior?.contextBindings?.some(
      (binding) => binding.contextType === "kitchenGroup",
    )
  )
    return true;
  return (
    modulePackage.module.category === "base_cabinet" ||
    modulePackage.module.category === "wall_cabinet" ||
    modulePackage.module.category === "tall_cabinet" ||
    modulePackage.module.category === "corner_cabinet"
  );
}

function matchesKitchenMaterialFamily(
  material: MaterialDefinition,
  family: KitchenMaterialLookupFamily,
) {
  return (
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family
  );
}

function findKitchenMaterialByExactId(
  catalog: ClientCatalog,
  family: KitchenMaterialLookupFamily,
  id: string,
) {
  const wanted = id.trim();
  if (!wanted) return null;
  const material = catalog.materials.find((item) => item.id === wanted) ?? null;
  return material && matchesKitchenMaterialFamily(material, family)
    ? material
    : null;
}

function findKitchenHandleByExactId(catalog: ClientCatalog, id: string) {
  const wanted = id.trim();
  if (!wanted) return null;
  const component =
    catalog.components.find((item) => item.id === wanted) ?? null;
  return component?.componentType === "handle" && component.isActive
    ? component
    : null;
}

async function lookupKitchenMaterialByExactId(
  catalog: ClientCatalog,
  family: KitchenMaterialLookupFamily,
  id: string,
) {
  const wanted = id.trim();
  if (!wanted) return null;
  try {
    const response = await fetch(
      `/api/catalog/lookup?kind=material&family=${encodeURIComponent(family)}&id=${encodeURIComponent(wanted)}`,
      {
        credentials: "same-origin",
      },
    );
    if (response.ok) {
      const body = (await response.json()) as {
        material?: MaterialDefinition | null;
      };
      if (body.material && matchesKitchenMaterialFamily(body.material, family))
        return body.material;
    }
  } catch {
    // Local fallback keeps static/dev builds usable when the worker endpoint is not present.
  }
  return findKitchenMaterialByExactId(catalog, family, wanted);
}

async function lookupKitchenHandleByExactId(
  catalog: ClientCatalog,
  id: string,
) {
  const wanted = id.trim();
  if (!wanted) return null;
  try {
    const response = await fetch(
      `/api/catalog/lookup?kind=component&componentType=handle&id=${encodeURIComponent(wanted)}`,
      {
        credentials: "same-origin",
      },
    );
    if (response.ok) {
      const body = (await response.json()) as {
        component?: ReturnType<typeof findKitchenHandleByExactId>;
      };
      if (body.component?.componentType === "handle" && body.component.isActive)
        return body.component;
    }
  } catch {
    // Local fallback keeps static/dev builds usable when the worker endpoint is not present.
  }
  return findKitchenHandleByExactId(catalog, wanted);
}

type CreateKitchenEditModeArgs = {
  S: AppState;
  layoutRoot: Group;
  viewerEl: HTMLElement;
  tb: EditorTopbarApi;
  props: EditorPropsApi;

  icons: {
    cabinet: string;
    worktop: string;
    done: string;
    cancel: string;
    move: string;
    align: string;
  };

  ensureLayoutMode: () => void;
  ensureFloorplanViewerTab: () => void;
  setToolSelect: () => void;
  setToolAlign: () => void;
  startTransformFromSelection: (
    kind: "move",
    opts?: { sticky?: boolean; toggle?: boolean },
  ) => boolean;
  cancelPlacementIfActive: () => void;
  addInstance: (
    type: ModuleParams["type"],
    opts?: { modulePackageId?: string; initialParams?: ModuleParams },
  ) => void;
  rebuildInstance: (
    inst: LayoutInstance,
    opts?: { skipLayoutValidation?: boolean; skipLayoutPanelUpdate?: boolean },
  ) => boolean;
  rebuildKitchenGroupLayout: (
    groupId: string,
    nextCtx: KitchenContext,
    prevCtx?: KitchenContext,
  ) => void;
  disposeObject3D: (obj: Object3D) => void;
  createInstance: (
    params: ModuleParams,
    opts?: { id?: string },
  ) => LayoutInstance;
  findInstance: (id: string) => LayoutInstance | null;
  setSelectedModule: (id: string | null) => void;
  getSelectedModuleIds: () => string[];
  getSelectedKitchenGroupId: () => string | null;
  setSelectedKitchenGroup: (id: string | null) => void;
  updateLayoutPanel: () => void;
  startWorktopDraw: () => void;
  cancelWorktopDraw: (opts?: { silent?: boolean }) => void;
  handleWorktopEscape: () => boolean;
  refreshWorktopPreview: () => void;
  getGroupWorktops: (groupId: string) => GroupWorktopSnapshot[];
  replaceGroupWorktops: (
    groupId: string,
    worktops: GroupWorktopSnapshot[],
    opts?: { skipHistory?: boolean },
  ) => void;
  rebuildGroupWorktops: (groupId: string, ctx: KitchenContext) => void;
  buildClassicTopbar: () => void;
  showKitchenTab: () => void;
  restoreStandardTopbar: () => void;
  refreshProps: () => void;
  setUnderlayStatus: (message: string) => void;
  updateHoverCursor: (
    point: THREE.Vector2,
    kind: Exclude<PlanSnapKind, "none">,
  ) => void;
  hideHoverCursor: () => void;
  getCamera?: () => THREE.Camera;
  worldToScreen?: (
    world: THREE.Vector3,
    camera: THREE.Camera,
    rect: DOMRect,
  ) => THREE.Vector2;
  getViewMode?: () => "2d" | "3d";
  getActiveViewerTab?: () => string;
  getKitchenRunDimensionSources: (
    groupId: string,
    moduleRole?: KitchenModuleEditLayer
  ) => KitchenRunDimensionSource[];
  resizeKitchenRunModule: (
    instanceId: string,
    widthMm: number,
  ) => { ok: true; appliedValueMm: number; clamped: boolean } | { ok: false; reason: string };
  resizeKitchenCornerArm: (
    instanceId: string,
    axis: "x" | "z",
    lengthMm: number,
  ) => { ok: true; appliedValueMm: number; clamped: boolean } | { ok: false; reason: string };
  moveKitchenRunModuleByGap: (
    instanceId: string,
    side: "before" | "after",
    gapMm: number,
  ) => { ok: true; appliedValueMm: number; clamped: boolean } | { ok: false; reason: string };
  editKitchenWorktopSegment: (args: {
    worktopId: string;
    segmentIndex: number;
    depthMm?: number;
    lengthMm?: number;
    adjacentSegmentIndex?: number;
  }) => { ok: true; appliedValueMm: number; clamped: boolean } | { ok: false; reason: string };
  catalog: ClientCatalog;
  modulePackages?: readonly FurnQuoteModulePackage[];
};

export function createKitchenEditMode(args: CreateKitchenEditModeArgs) {
  let overlayEl: HTMLDivElement | null = null;
  let escapeHandler: ((ev: KeyboardEvent) => void) | null = null;
  let pendingCtxTimer: number | null = null;
  let pendingActiveCtx: KitchenContext | null = null;
  const pendingNormalCtx = new Map<string, KitchenContext>();
  let prewarmTimer: number | null = null;
  const prewarmedModuleTypes = new Set<string>();
  const moduleCatalogIconSvgCache = new Map<string, string>();
  let moduleCatalogHost: HTMLElement | null = null;
  let moduleCatalogSearch = "";
  let tallDimensionOverlayEl: HTMLDivElement | null = null;
  let tallDimensionInputEl: HTMLInputElement | null = null;
  let tallDimensionCanvasEl: HTMLCanvasElement | null = null;
  let tallEditorPointerHandlersAttached = false;
  let activeTallDimensionBoundaryIndex: number | null = null;
  let activeTallDimensionInputSegmentIndex: number | null = null;
  let tallDimensionOverlaySignature = "";
  let kitchenRunDimensionOverlay: ReturnType<typeof createKitchenRunDimensionOverlay> | null = null;
  let selectedWorktopSegment: KitchenWorktopSegmentRef | null = null;
  const tallSubmoduleMoveState: TallSubmoduleMoveState = {
    active: false,
    operation: "move",
    step: "selectObject",
    baseYMm: null,
    baseScreenX: null,
    currentYMm: null,
    currentScreenX: null,
    lastDirection: 1,
    typedMm: "",
    snap: null,
    originalOffsetMm: null,
    originalParams: null,
    copySourceSlotIndex: null,
    previewSlotIndex: null,
    previewApplied: false,
  };
  const tallSubmoduleInsertState: TallSubmoduleInsertState = {
    active: false,
    step: "pickBottom",
    type: null,
    bottomMm: null,
    yMm: null,
    screenX: null,
    snap: null,
    originalParams: null,
    previewSlotIndex: null,
    previewApplied: false,
  };
  let tallSubmoduleAlignActive = false;
  let tallSubmoduleAlignReference: TallSubmoduleAlignReference | null = null;
  let tallSubmoduleAlignHoverYMm: number | null = null;

  let activeName = "";
  let activeModuleEditLayer: KitchenModuleEditLayer = "base";
  const planOutlineSnapshots = new Map<THREE.LineBasicMaterial, {
    color: THREE.Color;
    opacity: number;
    renderOrder: number;
  }>();
  let snapshotName = "";
  let editingExistingGroupId: string | null = null;
  let activeTallEditorInstanceId: string | null = null;
  let activeTallEditorSnapshot: {
    instanceId: string;
    params: ModuleParams;
  } | null = null;
  let activeTallSubmoduleSelection: TallSubmoduleSelection | null = null;
  const activeTallSubmoduleSelections = new Map<
    number,
    TallSubmoduleSelection
  >();
  let kitchenCtxSnapshot: KitchenContext | null = null;
  let instanceSnapshots: GroupInstanceSnapshot[] = [];
  let worktopSnapshots: GroupWorktopSnapshot[] = [];

  const findKitchenGroup = (groupId: string | null) => {
    if (!groupId) return null;
    return args.S.kitchenGroups.find((group) => group.id === groupId) ?? null;
  };

  const getGroupInstanceIds = (groupId: string) => {
    return args.S.instances
      .filter((inst) => inst.kitchenGroupId === groupId)
      .map((inst) => inst.id);
  };

  const captureGroupInstances = (groupId: string) => {
    return args.S.instances
      .filter((inst) => inst.kitchenGroupId === groupId)
      .map((inst) => ({
        id: inst.id,
        params: structuredClone(inst.params),
        position: {
          x: inst.root.position.x,
          y: inst.root.position.y,
          z: inst.root.position.z,
        },
        rotationY: inst.root.rotation.y,
      }));
  };

  const captureGroupWorktops = (groupId: string) => {
    return args.getGroupWorktops(groupId).map((worktop) => ({
      id: worktop.id,
      params: structuredClone(worktop.params),
    }));
  };

  const getNextKitchenName = () => {
    const base = "Kuchyňa";
    const used = new Set(
      args.S.kitchenGroups.map((group) => group.name.trim()).filter(Boolean),
    );
    let index = 1;
    while (used.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  };

  const rebuildGroupModules = (
    groupId: string,
    nextCtx: KitchenContext,
    prevCtx?: KitchenContext,
  ) => {
    args.rebuildKitchenGroupLayout(groupId, nextCtx, prevCtx);
  };

  const setInstanceInactivePreview = (
    inst: LayoutInstance,
    inactive: boolean,
  ) => {
    if (!!inst.root.userData.kitchenInactivePickDisabled === inactive) return;
    inst.root.userData.kitchenInactivePickDisabled = inactive || undefined;
  };

  const syncInactiveModulePreviews = () => {
    const activeGroupId = args.S.kitchenEditMode
      ? args.S.activeKitchenGroupId
      : null;
    for (const inst of args.S.instances) {
      setInstanceInactivePreview(
        inst,
        !!activeGroupId && inst.kitchenGroupId !== activeGroupId,
      );
    }
  };

  const clearInactiveModulePreviews = () => {
    for (const inst of args.S.instances)
      setInstanceInactivePreview(inst, false);
  };

  const applyNormalGroupCtx = (
    groupId: string,
    next: KitchenContext,
    opts?: { refreshProps?: boolean },
  ) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    const prevCtx = resolveContext(structuredClone(group.ctx));
    group.ctx = resolveContext(next);
    rebuildGroupModules(groupId, group.ctx, prevCtx);
    if (opts?.refreshProps !== false) args.refreshProps();
  };

  const applyActiveGroupCtx = (
    next: KitchenContext,
    opts?: { refreshProps?: boolean },
  ) => {
    const groupId = args.S.activeKitchenGroupId;
    if (!groupId) return;
    const prevCtx = resolveContext(structuredClone(args.S.kitchenCtx));
    args.S.kitchenCtx = resolveContext(next);
    rebuildGroupModules(groupId, args.S.kitchenCtx, prevCtx);
    args.refreshWorktopPreview();
    if (opts?.refreshProps !== false) args.refreshProps();
  };

  const flushPendingCtx = () => {
    if (pendingCtxTimer != null) window.clearTimeout(pendingCtxTimer);
    pendingCtxTimer = null;

    const activeCtx = pendingActiveCtx;
    pendingActiveCtx = null;
    if (activeCtx) applyActiveGroupCtx(activeCtx, { refreshProps: false });

    for (const [groupId, nextCtx] of pendingNormalCtx) {
      applyNormalGroupCtx(groupId, nextCtx, { refreshProps: false });
    }
    pendingNormalCtx.clear();
  };

  const schedulePendingCtxFlush = () => {
    if (pendingCtxTimer != null) window.clearTimeout(pendingCtxTimer);
    pendingCtxTimer = window.setTimeout(flushPendingCtx, 80);
  };

  const removeOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };

  const ensureOverlay = () => {
    removeOverlay();
    overlayEl = document.createElement("div");
    overlayEl.style.position = "absolute";
    overlayEl.style.inset = "0";
    overlayEl.style.background = "rgba(255,255,255,0.14)";
    overlayEl.style.mixBlendMode = "screen";
    overlayEl.style.pointerEvents = "none";
    overlayEl.style.zIndex = "9";
    args.viewerEl.appendChild(overlayEl);
  };

  const removeEscapeHandler = () => {
    if (!escapeHandler) return;
    window.removeEventListener("keydown", escapeHandler, {
      capture: true,
    } as AddEventListenerOptions);
    escapeHandler = null;
  };

  const addEscapeHandler = () => {
    removeEscapeHandler();
    escapeHandler = (ev: KeyboardEvent) => {
      if (handleTallStackEditorKeyDown(ev)) return;
      if (
        args.S.kitchenEditMode &&
        !activeTallStackEditorInstance() &&
        !isTextEntryTarget(ev.target) &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        !ev.altKey
      ) {
        if (
          ev.key.toLowerCase() === "m" &&
          args.startTransformFromSelection("move", { sticky: true, toggle: true })
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (ev.key.toLowerCase() === "a") {
          args.setToolAlign();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      }
      if (ev.key !== "Escape") return;
      if (ev.shiftKey) return;
      if (!args.S.kitchenEditMode) return;
      if (args.handleWorktopEscape()) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    };
    window.addEventListener("keydown", escapeHandler, { capture: true });
  };

  const setTallMoveStatus = () => {
    if (!tallSubmoduleMoveState.active) return;
    const tool = tallSubmoduleMoveState.operation === "copy" ? "Copy" : "Move";
    if (tallSubmoduleMoveState.step === "selectObject") {
      args.setUnderlayStatus(`${tool}: vyber submodule.`);
    } else if (tallSubmoduleMoveState.step === "pickBase") {
      args.setUnderlayStatus(
        `${tool}: zvol pociatocny bod. Snapping je aktivny.`,
      );
    } else {
      const typed = tallSubmoduleMoveState.typedMm.trim();
      args.setUnderlayStatus(
        typed
          ? `${tool}: ${typed} mm (Enter). Alebo klikni cielovy bod.`
          : `${tool}: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm.`,
      );
    }
  };

  const setTallAlignStatus = () => {
    if (!tallSubmoduleAlignActive) return;
    args.setUnderlayStatus(
      tallSubmoduleAlignReference
        ? "Align: zvol druhu liniu submodulu, ktora sa ma posunut ku prvej."
        : "Align: zvol prvu cielovu liniu. Snapping je aktivny.",
    );
  };

  const attachTallEditorPointerHandlers = () => {
    if (tallEditorPointerHandlersAttached) return;
    args.viewerEl.addEventListener(
      "pointerdown",
      handleTallEditorPointerDown,
      true,
    );
    args.viewerEl.addEventListener(
      "pointermove",
      handleTallEditorPointerMove,
      true,
    );
    tallEditorPointerHandlersAttached = true;
  };

  const detachTallEditorPointerHandlers = () => {
    if (!tallEditorPointerHandlersAttached) return;
    args.viewerEl.removeEventListener(
      "pointerdown",
      handleTallEditorPointerDown,
      true,
    );
    args.viewerEl.removeEventListener(
      "pointermove",
      handleTallEditorPointerMove,
      true,
    );
    tallEditorPointerHandlersAttached = false;
  };

  const scheduleKitchenModulePrewarm = (
    modulePackages: readonly FurnQuoteModulePackage[],
  ) => {
    const queue = modulePackages.filter(
      (modulePackage) =>
        !prewarmedModuleTypes.has(modulePackage.module.moduleType),
    );
    if (queue.length === 0 || prewarmTimer != null) return;

    const runNext = () => {
      const modulePackage = queue.shift();
      if (!modulePackage) {
        prewarmTimer = null;
        return;
      }
      prewarmedModuleTypes.add(modulePackage.module.moduleType);
      try {
        const params = {
          ...createDefaultModulePackageParameters(modulePackage),
          type: modulePackage.module.moduleType,
        } as ModuleParams;
        const inst = args.createInstance(params, {
          id: `prewarm_${modulePackage.module.moduleType}`,
        });
        args.disposeObject3D(inst.root);
      } catch {
        // Prewarm should never interfere with normal editing.
      }
      prewarmTimer = window.setTimeout(runNext, 40);
    };

    prewarmTimer = window.setTimeout(runNext, 40);
  };

  const roleLabel = (role: KitchenCatalogRole) => {
    if (role === "top") return t("Vrchné");
    if (role === "tall") return t("Vysoké");
    if (role === "accessory") return t("Doplnky");
    return t("Spodné");
  };

  const subcategoryLabel = (subcategory: KitchenCatalogSubcategoryKey) => {
    if (subcategory === "corner") return t("Rohové");
    if (subcategory === "appliance") return t("Spotrebičové");
    if (subcategory === "drawer") return t("Šuflíkové");
    if (subcategory === "sink") return t("Drezové");
    if (subcategory === "shelf") return t("Policové");
    if (subcategory === "island") return t("Ostrovné");
    if (subcategory === "cover_panel") return t("Krycie panely");
    return t("Ostatné");
  };

  const kitchenModuleGroups = () => {
    const kitchenPackages = kitchenRibbonPackages();
    return groupKitchenModulePackages(kitchenPackages, moduleCatalogSearch);
  };

  const kitchenRibbonPackages = () =>
    getEnabledModulePackageDefinitions(
      args.catalog,
      args.modulePackages ?? [],
    ).filter(isKitchenRibbonModule);

  const pinoVendorKitchenCatalog = () =>
    buildPinoVendorKitchenCatalog(args.catalog, moduleCatalogSearch, {
      includeNeedsReview: true,
    });

  const findEnabledModulePackage = (modulePackageId: string) =>
    getEnabledModulePackageDefinitions(
      args.catalog,
      args.modulePackages ?? [],
    ).find(
      (candidate) => candidate.module.modulePackageId === modulePackageId,
    ) ?? null;

  const addModuleFromCatalog = (modulePackage: FurnQuoteModulePackage) => {
    if (!args.S.kitchenEditMode) return;
    args.ensureLayoutMode();
    args.ensureFloorplanViewerTab();
    args.handleWorktopEscape();
    args.setToolSelect();
    args.addInstance(modulePackage.module.moduleType as ModuleParams["type"], {
      modulePackageId: modulePackage.module.modulePackageId,
    });
  };

  const addVendorModuleFromCatalog = (entry: PinoVendorKitchenCatalogEntry) => {
    if (!args.S.kitchenEditMode) return;
    args.ensureLayoutMode();
    args.ensureFloorplanViewerTab();
    args.handleWorktopEscape();
    args.setToolSelect();
    args.addInstance(entry.moduleType as ModuleParams["type"], {
      modulePackageId: entry.modulePackageId,
      initialParams: structuredClone(entry.params),
    });
  };

  const moduleCatalogIconSvg = (
    modulePackage: FurnQuoteModulePackage,
    opts?: { cacheKey?: string; params?: ModuleParams },
  ) => {
    const moduleType = modulePackage.module.moduleType;
    const cacheKey = opts?.cacheKey ?? moduleType;
    const cached = moduleCatalogIconSvgCache.get(cacheKey);
    if (cached) return cached;
    try {
      const params = structuredClone(
        opts?.params ?? {
          ...createDefaultModulePackageParameters(modulePackage),
          type: moduleType,
        },
      ) as ModuleParams;
      const inst = args.createInstance(params, {
        id: `catalog_icon_${moduleType}`,
      });
      const svg = createAxonometricLineSvgFromObject(inst.module, {
        hints: {
          category: modulePackage.module.category,
          displayName: modulePackage.module.displayName,
          moduleType,
          tags: modulePackage.module.tags,
        },
      });
      args.disposeObject3D(inst.root);
      moduleCatalogIconSvgCache.set(cacheKey, svg);
      return svg;
    } catch {
      const svg = createAxonometricLineSvgFromObject(new THREE.Group(), {
        hints: {
          category: modulePackage.module.category,
          displayName: modulePackage.module.displayName,
          moduleType,
          tags: modulePackage.module.tags,
        },
      });
      moduleCatalogIconSvgCache.set(cacheKey, svg);
      return svg;
    }
  };

  const renderModuleCatalog = () => {
    const host = moduleCatalogHost;
    if (!host) return;
    host.hidden = false;
    host.innerHTML = "";
    const isEditing = !!args.S.kitchenEditMode;
    const tallEditorInstance = activeTallStackEditorInstance();
    const vendorCatalog = pinoVendorKitchenCatalog();
    const isVendorCatalog = vendorCatalog.entries.length > 0;
    const genericCatalog = isVendorCatalog ? null : kitchenModuleGroups();
    const prewarmPackages = isVendorCatalog
      ? [
          ...new Map(
            vendorCatalog.entries
              .map((entry) => findEnabledModulePackage(entry.modulePackageId))
              .filter(
                (modulePackage): modulePackage is FurnQuoteModulePackage =>
                  !!modulePackage,
              )
              .map(
                (modulePackage) =>
                  [
                    modulePackage.module.modulePackageId,
                    modulePackage,
                  ] as const,
              ),
          ).values(),
        ]
      : (genericCatalog?.packages ?? []);
    scheduleKitchenModulePrewarm(prewarmPackages);

    const header = document.createElement("div");
    header.className = "module-catalog-header";
    const headerText = document.createElement("div");
    const headerTitle = document.createElement("strong");
    headerTitle.textContent = t("Kuchynské moduly");
    const headerStatus = document.createElement("span");
    headerStatus.textContent = isEditing
      ? t("Kitchen group active")
      : t("Najprv vytvor alebo otvor kuchyňu");
    headerText.append(headerTitle, headerStatus);
    header.appendChild(headerText);
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "module-catalog-primary";
    newButton.textContent = isEditing
      ? t("Aktívna kuchyňa")
      : t("Nová kuchyňa");
    newButton.disabled = isEditing;
    newButton.addEventListener("click", () => {
      if (!args.S.kitchenEditMode) enterNew();
    });
    header.appendChild(newButton);
    host.appendChild(header);

    if (isEditing && tallEditorInstance) {
      headerStatus.textContent = t("Tall module editor");
      newButton.textContent = t("Custom tall module");
      const body = document.createElement("div");
      body.className = "module-catalog-body";
      const section = document.createElement("section");
      section.className = "module-catalog-section";
      const title = document.createElement("h3");
      title.textContent = tallEditorInstance.params.displayName
        ? String(tallEditorInstance.params.displayName)
        : t("Custom tall module");
      const status = document.createElement("div");
      status.className = "muted";
      status.textContent = `tall ${tallEditorInstance.id}: OK`;
      section.append(title, status);
      body.appendChild(section);
      host.appendChild(body);
      return;
    }

    const search = document.createElement("input");
    search.className = "module-catalog-search";
    search.type = "search";
    search.placeholder = t("Hľadať modul");
    search.value = moduleCatalogSearch;
    search.addEventListener("input", () => {
      moduleCatalogSearch = search.value;
      renderModuleCatalog();
      moduleCatalogHost
        ?.querySelector<HTMLInputElement>(".module-catalog-search")
        ?.focus();
    });
    host.appendChild(search);

    const body = document.createElement("div");
    body.className = "module-catalog-body";
    body.classList.toggle("module-catalog-disabled", !isEditing);
    if (isVendorCatalog) {
      for (const role of ["low", "top", "tall", "accessory"] as const) {
        const roleGroups = vendorCatalog.groups[role];
        if (roleGroups.size === 0) continue;
        const section = document.createElement("section");
        section.className = "module-catalog-section";
        const title = document.createElement("h3");
        title.textContent = roleLabel(role);
        section.appendChild(title);
        for (const [, entries] of roleGroups) {
          const groupLabel = entries[0]?.groupLabel ?? "";
          const sub = document.createElement("div");
          sub.className = "module-catalog-subcategory";
          const subTitle = document.createElement("h4");
          subTitle.textContent = groupLabel;
          sub.appendChild(subTitle);
          const grid = document.createElement("div");
          const vendorPresentation = getModuleCatalogCardPresentation(true);
          grid.className = vendorPresentation.gridClassName;
          for (const entry of entries) {
            const modulePackage = findEnabledModulePackage(
              entry.modulePackageId,
            );
            if (!modulePackage) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.className = vendorPresentation.cardClassName;
            button.disabled = !isEditing;
            button.dataset.moduleType = entry.moduleType;
            button.dataset.productTemplateId = entry.productTemplateId;
            button.title = entry.productTemplateName;
            const icon = document.createElement("span");
            icon.className = "module-catalog-card-icon";
            renderModuleCatalogPreview({
              host: icon,
              modulePackage,
              fallbackSvg: () => moduleCatalogIconSvg(modulePackage, {
                cacheKey: `${entry.productTemplateId}:${entry.catalogKey}`,
                params: entry.params,
              }),
            });
            const label = document.createElement("span");
            label.className = vendorPresentation.labelClassName;
            label.textContent = entry.productTemplateName;
            const meta = document.createElement("span");
            meta.className = vendorPresentation.metaClassName;
            const metaParts = [
              entry.widthLabel !== "-"
                ? entry.widthLabel
                : `str. ${entry.sourcePages.join(", ")}`,
            ];
            if (entry.templateNeedsReview || entry.status === "needs_review")
              metaParts.push("review");
            meta.textContent = metaParts.join(" • ");
            button.append(icon, label, meta);
            button.addEventListener("click", () =>
              addVendorModuleFromCatalog(entry),
            );
            grid.appendChild(button);
          }
          sub.appendChild(grid);
          section.appendChild(sub);
        }
        body.appendChild(section);
      }
    } else {
      for (const role of ["low", "top", "tall", "accessory"] as const) {
        const roleGroups = genericCatalog?.groups[role];
        if (!roleGroups) continue;
        if (roleGroups.size === 0) continue;
        const section = document.createElement("section");
        section.className = "module-catalog-section";
        const title = document.createElement("h3");
        title.textContent = roleLabel(role);
        section.appendChild(title);
        for (const [subcategory, modulePackages] of roleGroups) {
          const sub = document.createElement("div");
          sub.className = "module-catalog-subcategory";
          const subTitle = document.createElement("h4");
          subTitle.textContent = subcategoryLabel(subcategory);
          sub.appendChild(subTitle);
          const grid = document.createElement("div");
          const genericPresentation = getModuleCatalogCardPresentation(false);
          grid.className = genericPresentation.gridClassName;
          for (const modulePackage of modulePackages) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = genericPresentation.cardClassName;
            button.disabled = !isEditing;
            button.dataset.moduleType = modulePackage.module.moduleType;
            button.title = modulePackage.module.displayName;
            const icon = document.createElement("span");
            icon.className = "module-catalog-card-icon";
            renderModuleCatalogPreview({
              host: icon,
              modulePackage,
              fallbackSvg: () => moduleCatalogIconSvg(modulePackage),
            });
            const label = document.createElement("span");
            label.className = genericPresentation.labelClassName;
            label.textContent = modulePackage.module.displayName;
            button.append(icon, label);
            button.addEventListener("click", () =>
              addModuleFromCatalog(modulePackage),
            );
            grid.appendChild(button);
          }
          sub.appendChild(grid);
          section.appendChild(sub);
        }
        body.appendChild(section);
      }
    }

    const worktop = document.createElement("section");
    worktop.className = "module-catalog-section";
    const worktopTitle = document.createElement("h3");
    worktopTitle.textContent = t("Pracovné dosky");
    worktop.appendChild(worktopTitle);
    const worktopButton = document.createElement("button");
    worktopButton.type = "button";
    worktopButton.className = "module-catalog-worktop";
    worktopButton.disabled = !isEditing;
    const worktopIcon = document.createElement("span");
    worktopIcon.innerHTML = args.icons.worktop;
    const worktopLabel = document.createElement("strong");
    worktopLabel.textContent = t("Kresliť pracovnú dosku");
    worktopButton.append(worktopIcon, worktopLabel);
    worktopButton.addEventListener("click", () => {
      if (!args.S.kitchenEditMode) return;
      args.ensureLayoutMode();
      args.cancelPlacementIfActive();
      args.startWorktopDraw();
    });
    worktop.appendChild(worktopButton);
    body.appendChild(worktop);
    host.appendChild(body);
  };

  const mountModuleCatalog = (host: HTMLElement | null) => {
    if (!host) {
      moduleCatalogHost?.replaceChildren();
      moduleCatalogHost?.setAttribute("hidden", "");
      moduleCatalogHost = null;
      document
        .getElementById("main")
        ?.classList.remove("archux-has-module-catalog");
      return;
    }
    moduleCatalogHost = host;
    document.getElementById("main")?.classList.add("archux-has-module-catalog");
    renderModuleCatalog();
  };

  const tallStackInstanceById = (instanceId: string | null) => {
    const inst = instanceId ? args.findInstance(instanceId) : null;
    if (!inst || !isTallStackHostParams(inst.params)) return null;
    if (
      args.S.kitchenEditMode &&
      args.S.activeKitchenGroupId &&
      inst.kitchenGroupId !== args.S.activeKitchenGroupId
    )
      return null;
    return inst;
  };

  const activeTallStackEditorInstance = () => {
    return tallStackInstanceById(activeTallEditorInstanceId);
  };

  const ensureKitchenRunDimensionOverlay = () => {
    if (kitchenRunDimensionOverlay) return kitchenRunDimensionOverlay;
    kitchenRunDimensionOverlay = createKitchenRunDimensionOverlay({
      host: args.viewerEl,
      getCamera: () => args.getCamera!(),
      worldToScreen: (world, camera, rect) => args.worldToScreen!(world, camera, rect),
      getSources: () => {
        const groupId = args.S.activeKitchenGroupId;
        return groupId ? args.getKitchenRunDimensionSources(groupId, activeModuleEditLayer) : [];
      },
      getSelectedModuleIds: args.getSelectedModuleIds,
      getSelectedWorktopSegment: () => selectedWorktopSegment,
      getBlockingModules: () => {
        const blockers: Array<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }> = [];
        for (const inst of args.S.instances) {
          inst.module.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(inst.module);
          if (bounds.isEmpty()) continue;
          blockers.push({
            id: inst.id,
            minX: bounds.min.x,
            maxX: bounds.max.x,
            minZ: bounds.min.z,
            maxZ: bounds.max.z
          });
        }
        return blockers;
      },
      selectModule: (instanceId) => args.setSelectedModule(instanceId),
      selectWorktopSegment: (worktopId, segmentIndex) => {
        selectedWorktopSegment = { worktopId, segmentIndex };
        args.setSelectedModule(null);
        args.refreshProps();
      },
      editModuleWidth: (instanceId, widthMm) => {
        const result = args.resizeKitchenRunModule(instanceId, widthMm);
        if (result.ok) {
          args.refreshProps();
          renderModuleCatalog();
        }
        return result;
      },
      editCornerArm: (instanceId, axis, lengthMm) => {
        const result = args.resizeKitchenCornerArm(instanceId, axis, lengthMm);
        if (result.ok) {
          args.refreshProps();
          renderModuleCatalog();
        }
        return result;
      },
      editModuleGap: (instanceId, side, gapMm) => {
        const result = args.moveKitchenRunModuleByGap(instanceId, side, gapMm);
        if (result.ok) args.refreshProps();
        return result;
      },
      editWorktopLength: (worktopId, segmentIndex, lengthMm) => {
        const result = args.editKitchenWorktopSegment({ worktopId, segmentIndex, lengthMm });
        if (result.ok) args.refreshProps();
        return result;
      },
      editWorktopAdjacentOffset: (worktopId, selectedSegmentIndex, adjacentSegmentIndex, lengthMm) => {
        const result = args.editKitchenWorktopSegment({
          worktopId,
          segmentIndex: selectedSegmentIndex,
          adjacentSegmentIndex,
          lengthMm
        });
        if (result.ok) args.refreshProps();
        return result;
      },
      setStatus: args.setUnderlayStatus
    });
    return kitchenRunDimensionOverlay;
  };

  const renderKitchenRunDimensionOverlay = () => {
    const groupId = args.S.activeKitchenGroupId;
    const visible =
      !!groupId &&
      args.S.kitchenEditMode &&
      !activeTallStackEditorInstance() &&
      (args.getViewMode?.() ?? "3d") === "2d" &&
      (args.getActiveViewerTab?.() ?? "3d") === "floorplan" &&
      !!args.getCamera &&
      !!args.worldToScreen;
    if (!visible) {
      kitchenRunDimensionOverlay?.hide();
      return;
    }
    ensureKitchenRunDimensionOverlay().sync(true);
  };

  const refreshKitchenDimensionOverlays = () => {
    renderTallDimensionOverlay();
    renderKitchenRunDimensionOverlay();
  };

  const restoreKitchenPlanPresentation = () => {
    for (const [material, snapshot] of planOutlineSnapshots) {
      material.color.copy(snapshot.color);
      material.opacity = snapshot.opacity;
      material.needsUpdate = true;
    }
    for (const inst of args.S.instances) {
      const material = inst.outline.material as THREE.LineBasicMaterial;
      const snapshot = planOutlineSnapshots.get(material);
      if (snapshot) inst.outline.renderOrder = snapshot.renderOrder;
    }
    planOutlineSnapshots.clear();
  };

  const syncKitchenPlanPresentation = () => {
    const groupId = args.S.activeKitchenGroupId;
    const visible =
      !!groupId &&
      args.S.kitchenEditMode &&
      !activeTallStackEditorInstance() &&
      (args.getViewMode?.() ?? "3d") === "2d" &&
      (args.getActiveViewerTab?.() ?? "3d") === "floorplan";
    if (!visible) {
      restoreKitchenPlanPresentation();
      return;
    }

    const invalidSelection = args.getSelectedModuleIds().some((id) => {
      const inst = args.findInstance(id);
      return !inst || inst.kitchenGroupId !== groupId || !isKitchenModuleInEditLayer(inst.params as Record<string, unknown>, activeModuleEditLayer);
    });
    if (invalidSelection) args.setSelectedModule(null);

    for (const inst of args.S.instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const material = inst.outline.material as THREE.LineBasicMaterial;
      if (!planOutlineSnapshots.has(material)) {
        planOutlineSnapshots.set(material, {
          color: material.color.clone(),
          opacity: material.opacity,
          renderOrder: inst.outline.renderOrder
        });
      }
      const emphasis = resolveKitchenModulePlanEmphasis(
        inst.params as Record<string, unknown>,
        activeModuleEditLayer
      );
      if (material.color.getHex() !== emphasis.color) material.color.setHex(emphasis.color);
      material.transparent = true;
      material.opacity = emphasis.opacity;
      material.needsUpdate = true;
      inst.outline.renderOrder = emphasis.renderOrder;
    }
  };

  const ensureTallDimensionOverlay = () => {
    if (tallDimensionOverlayEl) return tallDimensionOverlayEl;
    const el = document.createElement("div");
    el.className = "tall-stack-dimension-chain";
    el.style.position = "absolute";
    el.style.inset = "0";
    el.style.zIndex = "17";
    el.style.pointerEvents = "none";
    el.style.display = "none";
    args.viewerEl.appendChild(el);
    tallDimensionOverlayEl = el;
    tallDimensionInputEl = createDimensionEditInput(document, el, {
      id: "tall-stack-dimension-input",
      ariaLabel: "Tall stack dimension",
      onCommit: () => {
        if (
          !tallDimensionInputEl ||
          activeTallDimensionInputSegmentIndex == null ||
          activeTallDimensionBoundaryIndex == null
        )
          return;
        const value = parseDimensionMillimeters(tallDimensionInputEl.value);
        if (value == null) return;
        commitTallDimensionSegmentEdit(
          activeTallDimensionInputSegmentIndex,
          value,
        );
      },
      onHide: () => {
        activeTallDimensionInputSegmentIndex = null;
      },
    });
    return el;
  };

  const hideTallDimensionOverlay = () => {
    if (!tallDimensionOverlayEl) return;
    tallDimensionOverlayEl.style.display = "none";
    tallDimensionOverlaySignature = "";
    if (tallDimensionInputEl) {
      tallDimensionOverlayEl.replaceChildren(tallDimensionInputEl);
    } else {
      tallDimensionOverlayEl.replaceChildren();
    }
  };

  const shouldShowTallDimensionOverlay = () => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    if (!args.S.kitchenEditMode) return false;
    const viewerTab = args.getActiveViewerTab?.() ?? "3d";
    const activeBottomViewKeys = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-bottom-view-key].active",
      ),
    )
      .map((button) => button.dataset.bottomViewKey ?? "")
      .filter(Boolean);
    return (
      shouldShowTallStackDimensionChainForView(
        args.getViewMode?.() ?? "3d",
        viewerTab,
      ) ||
      activeBottomViewKeys.some((key) =>
        shouldShowTallStackDimensionChainForView(
          args.getViewMode?.() ?? "3d",
          key,
        ),
      )
    );
  };

  const isBoundaryAdjacentToSegment = (
    boundary: TallStackDimensionBoundary | null,
    segment: TallStackDimensionSegment,
  ) => {
    if (!boundary) return false;
    return (
      boundary.lowerSegmentIndex === segment.segmentIndex ||
      boundary.upperSegmentIndex === segment.segmentIndex
    );
  };

  const boundaryForSegmentLabel = (
    segment: TallStackDimensionSegment,
    boundaries: readonly TallStackDimensionBoundary[],
  ) => {
    const active =
      boundaries.find(
        (boundary) =>
          boundary.boundaryIndex === activeTallDimensionBoundaryIndex,
      ) ?? null;
    if (isBoundaryAdjacentToSegment(active, segment)) return active;
    return (
      boundaries.find(
        (boundary) => boundary.lowerSegmentIndex === segment.segmentIndex,
      ) ??
      boundaries.find(
        (boundary) => boundary.upperSegmentIndex === segment.segmentIndex,
      ) ??
      null
    );
  };

  const showTallDimensionInput = (
    ev: PointerEvent,
    segment: TallStackDimensionSegment,
    boundary: TallStackDimensionBoundary,
  ) => {
    const overlay = ensureTallDimensionOverlay();
    activeTallDimensionBoundaryIndex = boundary.boundaryIndex;
    activeTallDimensionInputSegmentIndex = segment.segmentIndex;
    if (!tallDimensionInputEl) return;
    showDimensionInputAtPointer(tallDimensionInputEl, {
      clientX: ev.clientX,
      clientY: ev.clientY,
      hostLeft: args.viewerEl.getBoundingClientRect().left,
      hostTop: args.viewerEl.getBoundingClientRect().top,
      value: String(Math.round(segment.heightMm)),
    });
    overlay.style.pointerEvents = "none";
    renderTallDimensionOverlay();
  };

  const commitTallDimensionSegmentEdit = (
    segmentIndex: number,
    nextHeightMm: number,
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || activeTallDimensionBoundaryIndex == null) return;
    const previousParams = structuredClone(inst.params);
    const result = applyTallStackDimensionSegmentEdit(inst.params, {
      boundaryIndex: activeTallDimensionBoundaryIndex,
      segmentIndex,
      nextHeightMm,
      selectedSlotIndex:
        activeTallSubmoduleSelection?.hostInstanceId === inst.id
          ? activeTallSubmoduleSelection.slotIndex
          : null,
    });
    if (!result.ok) {
      console.warn(`Tall stack dimension edit failed: ${result.reason}`);
      return;
    }
    inst.params = result.params;
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return;
    }
    commitHistory(args.S);
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const resolveTallStackScreenMetrics = (inst: LayoutInstance) => {
    const dimensionParams =
      tallSubmoduleInsertState.active && tallSubmoduleInsertState.originalParams
        ? tallSubmoduleInsertState.originalParams
        : inst.params;
    const chain = resolveTallStackDimensionChain(dimensionParams);
    const widthPx = Math.max(1, args.viewerEl.clientWidth);
    const heightPx = Math.max(1, args.viewerEl.clientHeight);
    const hostWidthMm = Math.max(300, Number(inst.params.width ?? 600));
    const hostDepthMm = Math.max(100, Number(inst.params.depth ?? 560));
    const moduleScreenBounds = (() => {
      const camera = args.getCamera?.() ?? null;
      const rect = args.viewerEl.getBoundingClientRect();
      if (!camera || !args.worldToScreen || rect.width <= 0 || rect.height <= 0)
        return null;
      const box = new THREE.Box3().setFromObject(inst.module);
      if (box.isEmpty()) return null;
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ].map((point) => args.worldToScreen!(point, camera, rect));
      return {
        minX: Math.min(...corners.map((point) => point.x)),
        maxX: Math.max(...corners.map((point) => point.x)),
        minY: Math.min(...corners.map((point) => point.y)),
        maxY: Math.max(...corners.map((point) => point.y)),
      };
    })();
    const projectLocalMm = (xMm: number, yMm: number, zMm: number) => {
      const camera = args.getCamera?.() ?? null;
      const rect = args.viewerEl.getBoundingClientRect();
      if (!camera || !args.worldToScreen || rect.width <= 0 || rect.height <= 0)
        return null;
      inst.module.updateMatrixWorld(true);
      const world = inst.module.localToWorld(
        new THREE.Vector3(xMm * 0.001, yMm * 0.001, zMm * 0.001),
      );
      return args.worldToScreen(world, camera, rect);
    };
    const frontZMm = hostDepthMm / 2;
    const leftXmm = -hostWidthMm / 2;
    const rightXmm = hostWidthMm / 2;
    const projectedBottomLeft = projectLocalMm(leftXmm, 0, frontZMm);
    const projectedTopLeft = projectLocalMm(
      leftXmm,
      chain.hostHeightMm,
      frontZMm,
    );
    const projectedMidLeft = projectLocalMm(
      leftXmm,
      chain.hostHeightMm / 2,
      frontZMm,
    );
    const projectedMidRight = projectLocalMm(
      rightXmm,
      chain.hostHeightMm / 2,
      frontZMm,
    );
    const verticalScale = Math.min(
      (heightPx - 120) / chain.hostHeightMm,
      (widthPx * 0.55) / hostWidthMm,
    );
    const fittedModuleHeightPx = moduleScreenBounds
      ? Math.max(1, moduleScreenBounds.maxY - moduleScreenBounds.minY)
      : 0;
    const projectedHeightPx =
      projectedBottomLeft && projectedTopLeft
        ? Math.abs(projectedBottomLeft.y - projectedTopLeft.y)
        : 0;
    const scale =
      projectedHeightPx > 20
        ? projectedHeightPx / chain.hostHeightMm
        : fittedModuleHeightPx > 20
          ? fittedModuleHeightPx / chain.hostHeightMm
          : Math.max(
              0.08,
              Math.min(
                0.7,
                Number.isFinite(verticalScale) ? verticalScale : 0.25,
              ),
            );
    const moduleHeightPx = chain.hostHeightMm * scale;
    const topPx = projectedTopLeft
      ? projectedTopLeft.y
      : moduleScreenBounds
        ? moduleScreenBounds.minY
        : Math.max(48, (heightPx - moduleHeightPx) / 2);
    const bottomPx = projectedBottomLeft
      ? projectedBottomLeft.y
      : topPx + moduleHeightPx;
    const centerX =
      projectedMidLeft && projectedMidRight
        ? (projectedMidLeft.x + projectedMidRight.x) / 2
        : moduleScreenBounds
          ? (moduleScreenBounds.minX + moduleScreenBounds.maxX) / 2
          : widthPx * 0.5;
    const moduleWidthPx =
      projectedMidLeft && projectedMidRight
        ? Math.abs(projectedMidRight.x - projectedMidLeft.x)
        : hostWidthMm * scale;
    const moduleLeftX = projectedMidLeft
      ? projectedMidLeft.x
      : moduleScreenBounds
        ? moduleScreenBounds.minX
        : centerX - moduleWidthPx / 2;
    const yForMm = (yMm: number) => {
      const projected = projectLocalMm(leftXmm, yMm, frontZMm);
      if (projected) return projected.y;
      return topPx + (chain.hostHeightMm - yMm) * scale;
    };
    const mmForClientY = (clientY: number) => {
      const rect = args.viewerEl.getBoundingClientRect();
      const yPx = clientY - rect.top;
      const raw =
        (chain.hostHeightMm * (bottomPx - yPx)) / Math.max(1, bottomPx - topPx);
      return Math.max(0, Math.min(chain.hostHeightMm, raw));
    };
    return {
      chain,
      widthPx,
      heightPx,
      moduleScreenBounds,
      hostWidthMm,
      scale,
      topPx,
      centerX,
      moduleWidthPx,
      moduleLeftX,
      yForMm,
      mmForClientY,
    };
  };

  const nearestTallStackBoundary = (
    clientY: number,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
  ) => {
    const rect = args.viewerEl.getBoundingClientRect();
    const targetYPx = clientY - rect.top;
    let best: {
      boundary: TallStackDimensionBoundary;
      distancePx: number;
    } | null = null;
    for (const boundary of metrics.chain.boundaries) {
      const distancePx = Math.abs(metrics.yForMm(boundary.yMm) - targetYPx);
      if (!best || distancePx < best.distancePx)
        best = { boundary, distancePx };
    }
    return best?.boundary ?? null;
  };

  const tallSnapPriority = (kind: Exclude<PlanSnapKind, "none">) => {
    if (kind === "endpoint" || kind === "corner") return 0;
    if (kind === "midpoint") return 1;
    if (kind === "edge" || kind === "perpendicular") return 2;
    return 3;
  };

  const collectTallVerticalSnapCandidates = (
    inst: LayoutInstance,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    clientX: number,
    opts?: { linesOnly?: boolean },
  ): TallVerticalSnap[] => {
    const rect = args.viewerEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const candidates: TallVerticalSnap[] = [];
    const push = (
      yMm: number,
      kind: Exclude<PlanSnapKind, "none">,
      priorityAdjust = 0,
      slotIndex?: number,
    ) => {
      if (!Number.isFinite(yMm)) return;
      const clamped = Math.max(0, Math.min(metrics.chain.hostHeightMm, yMm));
      candidates.push({
        yMm: clamped,
        kind,
        screenPoint: new THREE.Vector2(x, metrics.yForMm(clamped)),
        distancePx: 0,
        priority: tallSnapPriority(kind) + priorityAdjust,
        slotIndex,
      });
    };

    for (const boundary of metrics.chain.boundaries)
      push(boundary.yMm, opts?.linesOnly ? "edge" : "endpoint");
    for (const segment of metrics.chain.segments) {
      const slotIndex = segment.slotIndex > 0 ? segment.slotIndex : undefined;
      push(
        segment.bottomMm,
        opts?.linesOnly ? "edge" : "endpoint",
        slotIndex ? -0.08 : 0,
        slotIndex,
      );
      push(
        segment.topMm,
        opts?.linesOnly ? "edge" : "endpoint",
        slotIndex ? -0.08 : 0,
        slotIndex,
      );
      if (!opts?.linesOnly)
        push(
          segment.bottomMm + segment.heightMm / 2,
          "midpoint",
          slotIndex ? -0.05 : 0,
          slotIndex,
        );
    }

    inst.module.updateMatrixWorld(true);
    const slotBounds = new Map<number, THREE.Box3>();
    inst.module.traverse((object) => {
      if (
        !(object as THREE.Mesh).isMesh ||
        object.visible === false ||
        object.userData.hiddenByDefault === true
      )
        return;
      const rawSlotIndex = object.userData.hostSlotIndex;
      if (typeof rawSlotIndex !== "number") return;
      const slotIndex = Math.round(rawSlotIndex);
      const bounds = new THREE.Box3().setFromObject(object);
      const existing = slotBounds.get(slotIndex);
      if (existing) existing.union(bounds);
      else slotBounds.set(slotIndex, bounds);
    });
    for (const [slotIndex, bounds] of slotBounds.entries()) {
      if (bounds.isEmpty()) continue;
      const minLocal = inst.root.worldToLocal(
        new THREE.Vector3(0, bounds.min.y, 0),
      );
      const maxLocal = inst.root.worldToLocal(
        new THREE.Vector3(0, bounds.max.y, 0),
      );
      const minY = Math.min(minLocal.y, maxLocal.y) * 1000;
      const maxY = Math.max(minLocal.y, maxLocal.y) * 1000;
      push(minY, opts?.linesOnly ? "edge" : "endpoint", -0.2, slotIndex);
      push(maxY, opts?.linesOnly ? "edge" : "endpoint", -0.2, slotIndex);
      if (!opts?.linesOnly)
        push((minY + maxY) / 2, "midpoint", -0.1, slotIndex);
    }

    return candidates;
  };

  const resolveTallSlotVisualBoundsMm = (
    inst: LayoutInstance,
    slotIndex: number,
  ) => {
    inst.module.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    let found = false;
    inst.module.traverse((object) => {
      if (
        !(object as THREE.Mesh).isMesh ||
        object.visible === false ||
        object.userData.hiddenByDefault === true
      )
        return;
      const rawSlotIndex = object.userData.hostSlotIndex;
      if (
        typeof rawSlotIndex !== "number" ||
        Math.round(rawSlotIndex) !== slotIndex
      )
        return;
      bounds.union(new THREE.Box3().setFromObject(object));
      found = true;
    });
    if (!found || bounds.isEmpty()) return null;
    const minLocal = inst.root.worldToLocal(
      new THREE.Vector3(0, bounds.min.y, 0),
    );
    const maxLocal = inst.root.worldToLocal(
      new THREE.Vector3(0, bounds.max.y, 0),
    );
    return {
      bottomMm: Math.min(minLocal.y, maxLocal.y) * 1000,
      topMm: Math.max(minLocal.y, maxLocal.y) * 1000,
    };
  };

  const resolveTallVerticalSnapResult = (
    inst: LayoutInstance,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    ev: PointerEvent,
    options?: {
      snapDistancePx?: number;
      stickyDistancePx?: number;
      linesOnly?: boolean;
    },
  ) => {
    const rect = args.viewerEl.getBoundingClientRect();
    const targetY = ev.clientY - rect.top;
    const best = chooseTallVerticalSnapCandidate(
      targetY,
      collectTallVerticalSnapCandidates(inst, metrics, ev.clientX, {
        linesOnly: options?.linesOnly,
      }),
      options?.linesOnly && tallSubmoduleMoveState.snap?.kind !== "edge"
        ? null
        : tallSubmoduleMoveState.snap,
      {
        snapDistancePx: options?.snapDistancePx ?? SNAP_DISTANCE_PX.moveTarget,
        stickyDistancePx:
          options?.stickyDistancePx ?? SNAP_DISTANCE_PX.moveSticky,
      },
    );
    tallSubmoduleMoveState.snap = best;
    if (best) {
      args.updateHoverCursor(best.screenPoint, best.kind);
      return { yMm: best.yMm, snap: best };
    }
    args.hideHoverCursor();
    return { yMm: metrics.mmForClientY(ev.clientY), snap: null };
  };

  const resolveTallVerticalSnap = (
    inst: LayoutInstance,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    ev: PointerEvent,
    options?: {
      snapDistancePx?: number;
      stickyDistancePx?: number;
      linesOnly?: boolean;
    },
  ) => {
    return resolveTallVerticalSnapResult(inst, metrics, ev, options).yMm;
  };

  const resolveTallInsertSnapResult = (
    inst: LayoutInstance,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    ev: PointerEvent,
    options?: {
      linesOnly?: boolean;
      snapDistancePx?: number;
      stickyDistancePx?: number;
    },
  ) => {
    const rect = args.viewerEl.getBoundingClientRect();
    const targetY = ev.clientY - rect.top;
    const best = chooseTallVerticalSnapCandidate(
      targetY,
      collectTallVerticalSnapCandidates(inst, metrics, ev.clientX, {
        linesOnly: options?.linesOnly,
      }),
      tallSubmoduleInsertState.snap,
      {
        snapDistancePx:
          options?.snapDistancePx ?? TALL_MOVE_PREVIEW_SNAP_DISTANCE_PX,
        stickyDistancePx: options?.stickyDistancePx ?? 0,
      },
    );
    tallSubmoduleInsertState.snap = best;
    if (best) {
      args.updateHoverCursor(best.screenPoint, best.kind);
      return { yMm: best.yMm, snap: best };
    }
    args.hideHoverCursor();
    return { yMm: metrics.mmForClientY(ev.clientY), snap: null };
  };

  const resolveTallDoorInsertRange = (
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    bottomMm: number,
    topMm: number,
    params: ModuleParams,
  ) => {
    const usable = resolveTallStackUsableBoundsMm(params);
    const bottomLimitMm = Math.max(
      0,
      Math.min(metrics.chain.hostHeightMm, usable.bottomMm),
    );
    const topLimitMm = Math.max(
      bottomLimitMm,
      Math.min(metrics.chain.hostHeightMm, usable.topMm),
    );
    const minHeightMm = 60;
    const startMm = Math.max(
      bottomLimitMm,
      Math.min(topLimitMm - minHeightMm, bottomMm),
    );
    const endMm = Math.max(startMm + minHeightMm, Math.min(topLimitMm, topMm));
    return {
      bottomMm: startMm,
      topMm: endMm,
      heightMm: Math.max(minHeightMm, endMm - startMm),
    };
  };

  const tallInsertDefaultHeightMm = (type: TallStackInsertType) => {
    return (
      TALL_STACK_INSERT_TOOLS.find((tool) => tool.type === type)?.heightMm ??
      120
    );
  };

  const tallInsertPreviewHeightMm = (type: TallStackInsertType) => {
    return Math.max(
      type === "shelf" ? 8 : 60,
      tallInsertDefaultHeightMm(type) || 360,
    );
  };

  const clampTallInsertBottomMm = (
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    type: TallStackInsertType,
    yMm: number,
    params: ModuleParams,
  ) => {
    const usable = resolveTallStackUsableBoundsMm(params);
    const bottomLimitMm = Math.max(
      0,
      Math.min(metrics.chain.hostHeightMm, usable.bottomMm),
    );
    const topLimitMm = Math.max(
      bottomLimitMm,
      Math.min(metrics.chain.hostHeightMm, usable.topMm),
    );
    const previewHeight = Math.min(
      tallInsertPreviewHeightMm(type),
      Math.max(0, topLimitMm - bottomLimitMm),
    );
    return Math.max(bottomLimitMm, Math.min(topLimitMm - previewHeight, yMm));
  };

  const resolveTallInsertCollisionBottomMm = (
    inst: LayoutInstance,
    metrics: ReturnType<typeof resolveTallStackScreenMetrics>,
    type: TallStackInsertType,
    cursorMm: number,
  ) => {
    const previewHeight = Math.min(
      tallInsertPreviewHeightMm(type),
      metrics.chain.hostHeightMm,
    );
    let best: { bottomMm: number; edgeMm: number; distanceMm: number } | null =
      null;
    for (const segment of metrics.chain.segments) {
      if (segment.slotIndex <= 0 || segment.type === "empty") continue;
      const visualBounds = resolveTallSlotVisualBoundsMm(
        inst,
        segment.slotIndex,
      );
      const bottomMm = visualBounds?.bottomMm ?? segment.bottomMm;
      const topMm = visualBounds?.topMm ?? segment.topMm;
      if (cursorMm < bottomMm || cursorMm > topMm) continue;
      const distanceToBottom = Math.abs(cursorMm - bottomMm);
      const distanceToTop = Math.abs(cursorMm - topMm);
      const nextBottomMm =
        distanceToBottom <= distanceToTop ? bottomMm - previewHeight : topMm;
      const edgeMm = distanceToBottom <= distanceToTop ? bottomMm : topMm;
      const distanceMm = Math.min(distanceToBottom, distanceToTop);
      if (!best || distanceMm < best.distanceMm)
        best = { bottomMm: nextBottomMm, edgeMm, distanceMm };
    }
    if (!best) return null;
    const clampedBottom = clampTallInsertBottomMm(
      metrics,
      type,
      best.bottomMm,
      inst.params,
    );
    args.updateHoverCursor(
      new THREE.Vector2(metrics.centerX, metrics.yForMm(best.edgeMm)),
      "edge",
    );
    return clampedBottom;
  };

  const commitTallSubmoduleSlotMove = (slotIndex: number, deltaMm: number) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || slotIndex <= 0) return false;
    const previousParams = structuredClone(inst.params);
    const result = moveTallStackSlot(inst.params, slotIndex, deltaMm);
    if (!result.ok) {
      console.warn(`Tall stack submodule move failed: ${result.reason}`);
      return false;
    }
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return false;
    }
    if (typeof result.slotIndex === "number")
      selectTallSubmoduleBySlot(inst, result.slotIndex);
    commitHistory(args.S);
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const readTallSubmoduleOffset = (inst: LayoutInstance, slotIndex: number) => {
    const value = inst.params[`tallSlot${slotIndex}OffsetMm`];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : 0;
  };

  const applyTallSubmoduleMovePreview = (
    deltaMm: number,
    opts?: { commit?: boolean },
  ) => {
    const inst = activeTallStackEditorInstance();
    const selection = activeTallSubmoduleSelection;
    if (!inst || !selection || selection.hostInstanceId !== inst.id)
      return false;
    if (tallSubmoduleMoveState.operation === "copy") {
      const originalParams =
        tallSubmoduleMoveState.originalParams ?? structuredClone(inst.params);
      tallSubmoduleMoveState.originalParams = originalParams;
      inst.params = structuredClone(originalParams);
      const sourceSlotIndex =
        tallSubmoduleMoveState.copySourceSlotIndex ?? selection.slotIndex;
      const result = copyTallStackSlot(inst.params, sourceSlotIndex, deltaMm);
      if (!result.ok) {
        inst.params = structuredClone(originalParams);
        args.rebuildInstance(inst, { skipLayoutValidation: true });
        console.warn(`Tall stack submodule copy failed: ${result.reason}`);
        return false;
      }
      const rebuilt = args.rebuildInstance(inst, {
        skipLayoutValidation: true,
      });
      if (!rebuilt) {
        inst.params = structuredClone(originalParams);
        args.rebuildInstance(inst, { skipLayoutValidation: true });
        return false;
      }
      if (typeof result.slotIndex !== "number") return false;
      selectTallSubmoduleBySlot(inst, result.slotIndex);
      tallSubmoduleMoveState.previewApplied = true;
      tallSubmoduleMoveState.previewSlotIndex = result.slotIndex;
      if (opts?.commit) {
        commitHistory(args.S);
        args.setSelectedModule(null);
        args.refreshProps();
        tallSubmoduleMoveState.originalParams = null;
      }
      renderModuleCatalog();
      renderTallDimensionOverlay();
      return true;
    }
    const originalOffset =
      tallSubmoduleMoveState.originalOffsetMm ??
      readTallSubmoduleOffset(inst, selection.slotIndex);
    const nextOffset = Math.round(originalOffset + deltaMm);
    const key = `tallSlot${selection.slotIndex}OffsetMm`;
    if (inst.params[key] === nextOffset && !opts?.commit) return true;
    const previousParams = structuredClone(inst.params);
    inst.params[key] = nextOffset;
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return false;
    }
    selectTallSubmoduleBySlot(inst, selection.slotIndex);
    tallSubmoduleMoveState.previewApplied = true;
    tallSubmoduleMoveState.previewSlotIndex = selection.slotIndex;
    if (opts?.commit) {
      commitHistory(args.S);
      args.setSelectedModule(null);
      args.refreshProps();
    }
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const restoreTallSubmoduleMovePreview = () => {
    if (!tallSubmoduleMoveState.previewApplied) return;
    const inst = activeTallStackEditorInstance();
    if (
      inst &&
      tallSubmoduleMoveState.operation === "copy" &&
      tallSubmoduleMoveState.originalParams
    ) {
      inst.params = structuredClone(tallSubmoduleMoveState.originalParams);
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      if (tallSubmoduleMoveState.copySourceSlotIndex)
        selectTallSubmoduleBySlot(
          inst,
          tallSubmoduleMoveState.copySourceSlotIndex,
        );
      else clearTallSubmoduleSelectionState();
      renderModuleCatalog();
      renderTallDimensionOverlay();
      return;
    }
    const slotIndex = tallSubmoduleMoveState.previewSlotIndex;
    const originalOffset = tallSubmoduleMoveState.originalOffsetMm;
    if (!inst || slotIndex == null || originalOffset == null) return;
    inst.params[`tallSlot${slotIndex}OffsetMm`] = originalOffset;
    args.rebuildInstance(inst, { skipLayoutValidation: true });
    selectTallSubmoduleBySlot(inst, slotIndex);
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const resetTallSubmoduleMove = (opts?: { restorePreview?: boolean }) => {
    if (opts?.restorePreview) restoreTallSubmoduleMovePreview();
    tallSubmoduleMoveState.active = false;
    tallSubmoduleMoveState.step = "selectObject";
    tallSubmoduleMoveState.baseYMm = null;
    tallSubmoduleMoveState.baseScreenX = null;
    tallSubmoduleMoveState.currentYMm = null;
    tallSubmoduleMoveState.currentScreenX = null;
    tallSubmoduleMoveState.lastDirection = 1;
    tallSubmoduleMoveState.typedMm = "";
    tallSubmoduleMoveState.snap = null;
    tallSubmoduleMoveState.originalOffsetMm = null;
    tallSubmoduleMoveState.originalParams = null;
    tallSubmoduleMoveState.copySourceSlotIndex = null;
    tallSubmoduleMoveState.previewSlotIndex = null;
    tallSubmoduleMoveState.previewApplied = false;
    args.hideHoverCursor();
    renderTallDimensionOverlay();
  };

  const resetTallSubmoduleAlign = () => {
    tallSubmoduleAlignActive = false;
    tallSubmoduleAlignReference = null;
    tallSubmoduleAlignHoverYMm = null;
    tallSubmoduleMoveState.snap = null;
    args.hideHoverCursor();
  };

  const restoreTallSubmoduleInsertPreview = () => {
    if (
      !tallSubmoduleInsertState.previewApplied ||
      !tallSubmoduleInsertState.originalParams
    )
      return;
    const inst = activeTallStackEditorInstance();
    if (!inst) return;
    inst.params = structuredClone(tallSubmoduleInsertState.originalParams);
    args.rebuildInstance(inst, { skipLayoutValidation: true });
    clearTallSubmoduleSelectionState();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const resetTallSubmoduleInsert = (opts?: { restorePreview?: boolean }) => {
    if (opts?.restorePreview !== false) restoreTallSubmoduleInsertPreview();
    tallSubmoduleInsertState.active = false;
    tallSubmoduleInsertState.step = "pickBottom";
    tallSubmoduleInsertState.type = null;
    tallSubmoduleInsertState.bottomMm = null;
    tallSubmoduleInsertState.yMm = null;
    tallSubmoduleInsertState.screenX = null;
    tallSubmoduleInsertState.snap = null;
    tallSubmoduleInsertState.originalParams = null;
    tallSubmoduleInsertState.previewSlotIndex = null;
    tallSubmoduleInsertState.previewApplied = false;
    args.hideHoverCursor();
    renderTallDimensionOverlay();
  };

  const setTallInsertStatus = () => {
    if (!tallSubmoduleInsertState.active || !tallSubmoduleInsertState.type)
      return;
    const tool = TALL_STACK_INSERT_TOOLS.find(
      (item) => item.type === tallSubmoduleInsertState.type,
    );
    if (tallSubmoduleInsertState.type === "door") {
      args.setUnderlayStatus(
        tallSubmoduleInsertState.step === "pickTop"
          ? "Dvierka: zvol vrchnu liniu, kde maju koncit."
          : "Dvierka: zvol spodnu liniu, kde maju zacinat.",
      );
      return;
    }
    args.setUnderlayStatus(
      `${tool?.label ?? "Submodule"}: namier miesto v module a klikni lavym tlacidlom.`,
    );
  };

  const startTallSubmoduleInsert = (type: TallStackInsertType) => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    resetTallSubmoduleInsert();
    resetTallSubmoduleMove({ restorePreview: true });
    resetTallSubmoduleAlign();
    tallSubmoduleInsertState.active = true;
    tallSubmoduleInsertState.step = "pickBottom";
    tallSubmoduleInsertState.type = type;
    tallSubmoduleInsertState.bottomMm = null;
    tallSubmoduleInsertState.yMm = null;
    tallSubmoduleInsertState.screenX = null;
    tallSubmoduleInsertState.snap = null;
    tallSubmoduleInsertState.originalParams = null;
    tallSubmoduleInsertState.previewSlotIndex = null;
    tallSubmoduleInsertState.previewApplied = false;
    clearTallSubmoduleSelectionState();
    activeTallDimensionBoundaryIndex = null;
    activeTallDimensionInputSegmentIndex = null;
    setTallInsertStatus();
    renderTallDimensionOverlay();
    return true;
  };

  const applyTallSubmoduleInsertPreview = (
    inst: LayoutInstance,
    type: TallStackInsertType,
    bottomMm: number,
    heightMm?: number,
  ) => {
    const originalParams =
      tallSubmoduleInsertState.originalParams ?? structuredClone(inst.params);
    tallSubmoduleInsertState.originalParams = originalParams;
    inst.params = structuredClone(originalParams);
    const result = insertTallStackSlotAt(inst.params, type, bottomMm, heightMm);
    if (!result.ok || typeof result.slotIndex !== "number") {
      inst.params = structuredClone(originalParams);
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      if (!result.ok)
        console.warn(`Tall stack insert preview failed: ${result.reason}`);
      return false;
    }
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = structuredClone(originalParams);
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return false;
    }
    tallSubmoduleInsertState.previewSlotIndex = result.slotIndex;
    tallSubmoduleInsertState.previewApplied = true;
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const commitTallSubmoduleInsertAt = (
    inst: LayoutInstance,
    type: TallStackInsertType,
    bottomMm: number,
    heightMm?: number,
  ) => {
    const previousParams = structuredClone(inst.params);
    const result = insertTallStackSlotAt(inst.params, type, bottomMm, heightMm);
    if (!result.ok) {
      console.warn(`Tall stack insert failed: ${result.reason}`);
      return false;
    }
    const slotIndex = result.slotIndex;
    if (typeof slotIndex !== "number") {
      inst.params = previousParams;
      return false;
    }
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return false;
    }
    selectTallSubmoduleBySlot(inst, slotIndex);
    commitHistory(args.S);
    args.setSelectedModule(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    renderModuleCatalog();
    args.refreshProps();
    renderTallDimensionOverlay();
    return true;
  };

  const startTallSubmoduleMove = (operation: "move" | "copy" = "move") => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    resetTallSubmoduleInsert();
    resetTallSubmoduleAlign();
    tallSubmoduleMoveState.active = true;
    tallSubmoduleMoveState.operation = operation;
    tallSubmoduleMoveState.step =
      activeTallSubmoduleSelection?.hostInstanceId === inst.id
        ? "pickBase"
        : "selectObject";
    tallSubmoduleMoveState.baseYMm = null;
    tallSubmoduleMoveState.baseScreenX = null;
    tallSubmoduleMoveState.currentYMm = null;
    tallSubmoduleMoveState.currentScreenX = null;
    tallSubmoduleMoveState.lastDirection = 1;
    tallSubmoduleMoveState.typedMm = "";
    tallSubmoduleMoveState.snap = null;
    tallSubmoduleMoveState.originalOffsetMm = null;
    tallSubmoduleMoveState.originalParams = null;
    tallSubmoduleMoveState.copySourceSlotIndex = null;
    tallSubmoduleMoveState.previewSlotIndex = null;
    tallSubmoduleMoveState.previewApplied = false;
    setTallMoveStatus();
    return true;
  };

  const startTallSubmoduleAlign = () => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    resetTallSubmoduleMove({ restorePreview: true });
    tallSubmoduleAlignActive = true;
    tallSubmoduleAlignReference = null;
    setTallAlignStatus();
    return true;
  };

  const isTextEntryTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  };

  const handleTallStackEditorKeyDown = (ev: KeyboardEvent) => {
    if (!activeTallStackEditorInstance()) return false;
    if (tallSubmoduleInsertState.active) {
      if (ev.key === "Escape") {
        resetTallSubmoduleInsert();
        args.setUnderlayStatus("Vkladanie submodulu: zrusene.");
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      return false;
    }
    if (tallSubmoduleMoveState.active) {
      const activeTool =
        tallSubmoduleMoveState.operation === "copy" ? "Copy" : "Move";
      if (ev.key === "Escape") {
        resetTallSubmoduleMove({ restorePreview: true });
        args.setUnderlayStatus(`${activeTool}: zrusene.`);
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      if (ev.key === "Enter") {
        const value = parseDimensionMillimeters(tallSubmoduleMoveState.typedMm);
        if (value != null && tallSubmoduleMoveState.step === "pickTarget") {
          applyTallSubmoduleMovePreview(
            Math.abs(value) * tallSubmoduleMoveState.lastDirection,
            { commit: true },
          );
          resetTallSubmoduleMove();
          args.setUnderlayStatus(`${activeTool}: hotovo.`);
        }
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      if (ev.key === "Backspace") {
        tallSubmoduleMoveState.typedMm = tallSubmoduleMoveState.typedMm.slice(
          0,
          -1,
        );
        setTallMoveStatus();
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      if (/^[0-9.,-]$/.test(ev.key)) {
        tallSubmoduleMoveState.typedMm += ev.key;
        setTallMoveStatus();
        ev.preventDefault();
        ev.stopPropagation();
        return true;
      }
      return false;
    }
    if (tallSubmoduleAlignActive && ev.key === "Escape") {
      resetTallSubmoduleAlign();
      args.setUnderlayStatus("Align: zrusene.");
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    if (
      ev.key === "Escape" &&
      (activeTallSubmoduleSelection ||
        activeTallDimensionBoundaryIndex != null ||
        activeTallDimensionInputSegmentIndex != null)
    ) {
      clearTallSubmoduleSelection();
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    if (
      !isTextEntryTarget(ev.target) &&
      ev.key.toLowerCase() === "m" &&
      startTallSubmoduleMove()
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    if (
      !isTextEntryTarget(ev.target) &&
      ev.key.toLowerCase() === "c" &&
      startTallSubmoduleMove("copy")
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    if (
      !isTextEntryTarget(ev.target) &&
      ev.key.toLowerCase() === "a" &&
      startTallSubmoduleAlign()
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    return false;
  };

  const handleTallSubmoduleMovePointerDown = (ev: PointerEvent) => {
    if (!tallSubmoduleMoveState.active) return false;
    if (!isPrimaryPointerButton(ev.button)) return false;
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    if (tallSubmoduleMoveState.step === "selectObject") return false;
    const metrics = resolveTallStackScreenMetrics(inst);
    const yMm = resolveTallVerticalSnap(inst, metrics, ev);
    if (tallSubmoduleMoveState.step === "pickBase") {
      tallSubmoduleMoveState.baseYMm = yMm;
      tallSubmoduleMoveState.baseScreenX =
        ev.clientX - args.viewerEl.getBoundingClientRect().left;
      tallSubmoduleMoveState.currentYMm = yMm;
      tallSubmoduleMoveState.currentScreenX =
        ev.clientX - args.viewerEl.getBoundingClientRect().left;
      tallSubmoduleMoveState.step = "pickTarget";
      tallSubmoduleMoveState.typedMm = "";
      tallSubmoduleMoveState.snap = null;
      tallSubmoduleMoveState.originalOffsetMm = readTallSubmoduleOffset(
        inst,
        activeTallSubmoduleSelection?.slotIndex ?? 0,
      );
      tallSubmoduleMoveState.originalParams =
        tallSubmoduleMoveState.operation === "copy"
          ? structuredClone(inst.params)
          : null;
      tallSubmoduleMoveState.copySourceSlotIndex =
        tallSubmoduleMoveState.operation === "copy"
          ? (activeTallSubmoduleSelection?.slotIndex ?? null)
          : null;
      tallSubmoduleMoveState.previewSlotIndex =
        activeTallSubmoduleSelection?.slotIndex ?? null;
      setTallMoveStatus();
      renderTallDimensionOverlay();
      return true;
    }
    const base = tallSubmoduleMoveState.baseYMm;
    if (base == null) return true;
    const deltaMm = Math.round(yMm - base);
    applyTallSubmoduleMovePreview(deltaMm, { commit: true });
    const completedTool =
      tallSubmoduleMoveState.operation === "copy" ? "Copy" : "Move";
    resetTallSubmoduleMove();
    args.setUnderlayStatus(`${completedTool}: hotovo.`);
    return true;
  };

  const handleTallSubmoduleInsertPointerDown = (ev: PointerEvent) => {
    if (!tallSubmoduleInsertState.active || !tallSubmoduleInsertState.type)
      return false;
    if (!isPrimaryPointerButton(ev.button)) return false;
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    const metrics = resolveTallStackScreenMetrics(inst);
    const isDoorInsert = tallSubmoduleInsertState.type === "door";
    const resolved = resolveTallInsertSnapResult(
      inst,
      metrics,
      ev,
      isDoorInsert ? { linesOnly: true } : undefined,
    );

    if (isDoorInsert && tallSubmoduleInsertState.step === "pickBottom") {
      restoreTallSubmoduleInsertPreview();
      const range = resolveTallDoorInsertRange(
        metrics,
        resolved.yMm,
        resolved.yMm + 60,
        inst.params,
      );
      tallSubmoduleInsertState.bottomMm = range.bottomMm;
      tallSubmoduleInsertState.yMm = range.bottomMm;
      tallSubmoduleInsertState.screenX =
        ev.clientX - args.viewerEl.getBoundingClientRect().left;
      tallSubmoduleInsertState.step = "pickTop";
      activeTallDimensionBoundaryIndex =
        nearestTallStackBoundary(ev.clientY, metrics)?.boundaryIndex ?? null;
      setTallInsertStatus();
      renderTallDimensionOverlay();
      return true;
    }

    restoreTallSubmoduleInsertPreview();
    if (
      isDoorInsert &&
      tallSubmoduleInsertState.step === "pickTop" &&
      tallSubmoduleInsertState.bottomMm != null
    ) {
      const range = resolveTallDoorInsertRange(
        metrics,
        tallSubmoduleInsertState.bottomMm,
        resolved.yMm,
        inst.params,
      );
      if (
        commitTallSubmoduleInsertAt(
          inst,
          "door",
          range.bottomMm,
          range.heightMm,
        )
      ) {
        resetTallSubmoduleInsert({ restorePreview: false });
        args.setUnderlayStatus("Dvierka vlozene.");
      }
      return true;
    }

    const cursorMm = metrics.mmForClientY(ev.clientY);
    const collisionBottomMm = resolveTallInsertCollisionBottomMm(
      inst,
      metrics,
      tallSubmoduleInsertState.type,
      cursorMm,
    );
    const bottomMm = clampTallInsertBottomMm(
      metrics,
      tallSubmoduleInsertState.type,
      collisionBottomMm ?? resolved.yMm,
      inst.params,
    );
    if (
      commitTallSubmoduleInsertAt(inst, tallSubmoduleInsertState.type, bottomMm)
    ) {
      resetTallSubmoduleInsert({ restorePreview: false });
      args.setUnderlayStatus("Submodule vlozeny.");
    }
    return true;
  };

  const handleTallSubmoduleMovePointerMove = (ev: PointerEvent) => {
    if (
      !tallSubmoduleMoveState.active ||
      tallSubmoduleMoveState.step === "selectObject"
    )
      return;
    const inst = activeTallStackEditorInstance();
    if (!inst) return;
    const metrics = resolveTallStackScreenMetrics(inst);
    const yMm = resolveTallVerticalSnap(inst, metrics, ev, {
      snapDistancePx: TALL_MOVE_PREVIEW_SNAP_DISTANCE_PX,
      stickyDistancePx: 0,
    });
    if (
      tallSubmoduleMoveState.step !== "pickTarget" ||
      tallSubmoduleMoveState.baseYMm == null
    )
      return;
    tallSubmoduleMoveState.currentYMm = yMm;
    tallSubmoduleMoveState.currentScreenX =
      ev.clientX - args.viewerEl.getBoundingClientRect().left;
    tallSubmoduleMoveState.lastDirection =
      yMm >= tallSubmoduleMoveState.baseYMm ? 1 : -1;
    applyTallSubmoduleMovePreview(
      Math.round(yMm - tallSubmoduleMoveState.baseYMm),
    );
    renderTallDimensionOverlay();
  };

  const handleTallSubmoduleInsertPointerMove = (ev: PointerEvent) => {
    if (!tallSubmoduleInsertState.active || !tallSubmoduleInsertState.type)
      return;
    const inst = activeTallStackEditorInstance();
    if (!inst) return;
    const metrics = resolveTallStackScreenMetrics(inst);
    const isDoorInsert = tallSubmoduleInsertState.type === "door";
    const resolved = resolveTallInsertSnapResult(
      inst,
      metrics,
      ev,
      isDoorInsert ? { linesOnly: true } : undefined,
    );
    if (
      isDoorInsert &&
      tallSubmoduleInsertState.step === "pickTop" &&
      tallSubmoduleInsertState.bottomMm != null
    ) {
      const range = resolveTallDoorInsertRange(
        metrics,
        tallSubmoduleInsertState.bottomMm,
        resolved.yMm,
        inst.params,
      );
      tallSubmoduleInsertState.yMm = range.topMm;
      tallSubmoduleInsertState.screenX =
        ev.clientX - args.viewerEl.getBoundingClientRect().left;
      activeTallDimensionBoundaryIndex =
        nearestTallStackBoundary(ev.clientY, metrics)?.boundaryIndex ?? null;
      applyTallSubmoduleInsertPreview(
        inst,
        "door",
        range.bottomMm,
        range.heightMm,
      );
      setTallInsertStatus();
      renderTallDimensionOverlay();
      return;
    }
    if (isDoorInsert) {
      tallSubmoduleInsertState.yMm = resolved.yMm;
      tallSubmoduleInsertState.screenX =
        ev.clientX - args.viewerEl.getBoundingClientRect().left;
      activeTallDimensionBoundaryIndex =
        nearestTallStackBoundary(ev.clientY, metrics)?.boundaryIndex ?? null;
      setTallInsertStatus();
      renderTallDimensionOverlay();
      return;
    }
    const cursorMm = metrics.mmForClientY(ev.clientY);
    const collisionBottomMm = resolveTallInsertCollisionBottomMm(
      inst,
      metrics,
      tallSubmoduleInsertState.type,
      cursorMm,
    );
    tallSubmoduleInsertState.yMm = clampTallInsertBottomMm(
      metrics,
      tallSubmoduleInsertState.type,
      collisionBottomMm ?? resolved.yMm,
      inst.params,
    );
    tallSubmoduleInsertState.screenX =
      ev.clientX - args.viewerEl.getBoundingClientRect().left;
    setTallInsertStatus();
    renderTallDimensionOverlay();
  };

  const handleTallSubmoduleAlignPointerDown = (ev: PointerEvent) => {
    if (!tallSubmoduleAlignActive) return false;
    if (!isPrimaryPointerButton(ev.button)) return false;
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    const metrics = resolveTallStackScreenMetrics(inst);
    const resolved = resolveTallVerticalSnapResult(inst, metrics, ev, {
      linesOnly: true,
    });
    const yMm = resolved.yMm;
    tallSubmoduleAlignHoverYMm = resolved.snap?.yMm ?? yMm;
    const boundary = nearestTallStackBoundary(ev.clientY, metrics);
    if (tallSubmoduleAlignReference == null) {
      tallSubmoduleAlignReference = {
        yMm,
        slotIndex: resolved.snap?.slotIndex,
      };
      activeTallDimensionBoundaryIndex = boundary?.boundaryIndex ?? null;
      tallSubmoduleMoveState.snap = null;
      setTallAlignStatus();
      renderTallDimensionOverlay();
      return true;
    }
    const slotIndex =
      resolved.snap?.slotIndex ?? activeTallSubmoduleSelection?.slotIndex ?? 0;
    if (slotIndex <= 0) {
      args.setUnderlayStatus("Align: druha linia musi patrit submodulu.");
      return true;
    }
    const deltaMm = Math.round(tallSubmoduleAlignReference.yMm - yMm);
    if (deltaMm !== 0) commitTallSubmoduleSlotMove(slotIndex, deltaMm);
    resetTallSubmoduleAlign();
    args.setUnderlayStatus("Align: hotovo.");
    return true;
  };

  const handleTallSubmoduleAlignPointerMove = (ev: PointerEvent) => {
    if (!tallSubmoduleAlignActive) return;
    const inst = activeTallStackEditorInstance();
    if (!inst) return;
    const metrics = resolveTallStackScreenMetrics(inst);
    const resolved = resolveTallVerticalSnapResult(inst, metrics, ev, {
      linesOnly: true,
    });
    tallSubmoduleAlignHoverYMm = resolved.snap?.yMm ?? resolved.yMm;
    const boundary = nearestTallStackBoundary(ev.clientY, metrics);
    activeTallDimensionBoundaryIndex = boundary?.boundaryIndex ?? null;
    void resolved;
    renderTallDimensionOverlay();
  };

  const handleTallEditorPointerDown = (ev: PointerEvent) => {
    if (
      handleTallSubmoduleInsertPointerDown(ev) ||
      handleTallSubmoduleMovePointerDown(ev) ||
      handleTallSubmoduleAlignPointerDown(ev)
    ) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  };

  const handleTallEditorPointerMove = (ev: PointerEvent) => {
    handleTallSubmoduleInsertPointerMove(ev);
    handleTallSubmoduleMovePointerMove(ev);
    handleTallSubmoduleAlignPointerMove(ev);
  };

  const renderTallDimensionOverlay = () => {
    if (!shouldShowTallDimensionOverlay()) {
      hideTallDimensionOverlay();
      return;
    }
    const inst = activeTallStackEditorInstance();
    if (!inst) {
      hideTallDimensionOverlay();
      return;
    }
    const dimensionParams =
      tallSubmoduleInsertState.active && tallSubmoduleInsertState.originalParams
        ? tallSubmoduleInsertState.originalParams
        : inst.params;
    const metrics = resolveTallStackScreenMetrics(inst);
    const {
      chain,
      widthPx,
      heightPx,
      moduleScreenBounds,
      scale,
      centerX,
      moduleWidthPx,
      moduleLeftX,
      yForMm,
    } = metrics;
    if (chain.segments.length === 0) {
      hideTallDimensionOverlay();
      return;
    }

    const overlay = ensureTallDimensionOverlay();
    const signature = [
      inst.id,
      args.getViewMode?.() ?? "3d",
      args.getActiveViewerTab?.() ?? "3d",
      widthPx,
      heightPx,
      moduleScreenBounds
        ? `${Math.round(moduleScreenBounds.minX)}:${Math.round(moduleScreenBounds.maxX)}:${Math.round(moduleScreenBounds.minY)}:${Math.round(moduleScreenBounds.maxY)}`
        : "no-bounds",
      activeTallDimensionBoundaryIndex ?? "none",
      tallSubmoduleInsertState.active
        ? (tallSubmoduleInsertState.type ?? "insert")
        : "no-insert",
      tallSubmoduleInsertState.active
        ? tallSubmoduleInsertState.step
        : "no-insert-step",
      tallSubmoduleInsertState.bottomMm == null
        ? "no-insert-bottom"
        : Math.round(tallSubmoduleInsertState.bottomMm),
      tallSubmoduleInsertState.yMm == null
        ? "no-insert-y"
        : Math.round(tallSubmoduleInsertState.yMm),
      tallSubmoduleInsertState.screenX == null
        ? "no-insert-x"
        : Math.round(tallSubmoduleInsertState.screenX),
      tallSubmoduleMoveState.active
        ? tallSubmoduleMoveState.operation
        : "no-move",
      tallSubmoduleMoveState.step,
      tallSubmoduleMoveState.baseYMm == null
        ? "no-base"
        : Math.round(tallSubmoduleMoveState.baseYMm),
      tallSubmoduleMoveState.currentYMm == null
        ? "no-current"
        : Math.round(tallSubmoduleMoveState.currentYMm),
      tallSubmoduleMoveState.baseScreenX == null
        ? "no-base-x"
        : Math.round(tallSubmoduleMoveState.baseScreenX),
      tallSubmoduleMoveState.currentScreenX == null
        ? "no-current-x"
        : Math.round(tallSubmoduleMoveState.currentScreenX),
      tallSubmoduleMoveState.previewSlotIndex ?? "no-preview-slot",
      tallSubmoduleAlignActive
        ? Math.round(tallSubmoduleAlignHoverYMm ?? -1)
        : "no-align-hover",
      activeTallSubmoduleSelection?.hostInstanceId === inst.id
        ? activeTallSubmoduleSelection.slotIndex
        : "no-selected-slot",
      Math.round(chain.hostHeightMm),
      ...chain.segments.map(
        (segment) =>
          `${segment.slotIndex}:${segment.type}:${Math.round(segment.heightMm)}:${Math.round(segment.bottomMm)}:${Math.round(segment.topMm)}`,
      ),
    ].join("|");
    if (
      tallDimensionOverlaySignature === signature &&
      overlay.style.display === "block"
    )
      return;
    tallDimensionOverlaySignature = signature;

    const input = tallDimensionInputEl;
    overlay.replaceChildren();
    if (input) overlay.appendChild(input);
    overlay.style.display = "block";
    const dimensionOffsetPx = Math.max(10, TALL_DIMENSION_OFFSET_MM * scale);
    const textOffsetPx = Math.max(4, TALL_DIMENSION_TEXT_OFFSET_MM * scale);
    const textFontPx = Math.max(5, TALL_DIMENSION_TEXT_HEIGHT_MM * scale);
    const boundaryTickPx = Math.max(3, TALL_DIMENSION_BOUNDARY_TICK_MM * scale);
    const extensionOverhangPx = Math.max(
      2,
      TALL_DIMENSION_EXTENSION_OVERHANG_MM * scale,
    );
    const lineWidthPx = Math.max(0.45, 6 * scale);
    const activeLineWidthPx = Math.max(lineWidthPx * 1.45, lineWidthPx + 0.35);
    const dimX = Math.max(8, moduleLeftX - dimensionOffsetPx);
    const extensionEndX = Math.max(
      dimX + Math.max(10, TALL_DIMENSION_EXTENSION_GAP_MM * scale),
      moduleLeftX,
    );
    const labelX = Math.max(4, dimX - textOffsetPx);
    const activeBoundary =
      chain.boundaries.find(
        (boundary) =>
          boundary.boundaryIndex === activeTallDimensionBoundaryIndex,
      ) ?? null;
    const selectedSubmoduleSegment =
      activeTallSubmoduleSelection?.hostInstanceId === inst.id
        ? (chain.segments.find(
            (segment) =>
              segment.slotIndex === activeTallSubmoduleSelection?.slotIndex &&
              segment.type !== "empty",
          ) ?? null)
        : null;
    const placementBoundaryForSegment = (
      segment: TallStackDimensionSegment,
    ) => {
      if (!selectedSubmoduleSegment || segment.type !== "empty") return null;
      return (
        chain.boundaries.find((boundary) => {
          const lowerIndex = boundary.lowerSegmentIndex;
          const upperIndex = boundary.upperSegmentIndex;
          return (
            (lowerIndex === segment.segmentIndex &&
              upperIndex === selectedSubmoduleSegment.segmentIndex) ||
            (upperIndex === segment.segmentIndex &&
              lowerIndex === selectedSubmoduleSegment.segmentIndex)
          );
        }) ?? null
      );
    };
    const isSelectedPlacementSegment = (segment: TallStackDimensionSegment) =>
      !!placementBoundaryForSegment(segment);
    const isSelectedPlacementBoundary = (
      boundary: TallStackDimensionBoundary,
    ) => {
      if (!selectedSubmoduleSegment) return false;
      return (
        boundary.lowerSegmentIndex === selectedSubmoduleSegment.segmentIndex ||
        boundary.upperSegmentIndex === selectedSubmoduleSegment.segmentIndex
      );
    };
    const baseDimensionColor = "#333333";
    const activeDimensionColor = "#000fff";
    const selectedPlacementDimensionColor = "#d24b4b";

    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvas = tallDimensionCanvasEl ?? document.createElement("canvas");
    tallDimensionCanvasEl = canvas;
    canvas.width = Math.round(widthPx * devicePixelRatio);
    canvas.height = Math.round(heightPx * devicePixelRatio);
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
    canvas.style.pointerEvents = "none";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const strokeSegment = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      color = baseDimensionColor,
      lineWidth = 1.2,
    ) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    };

    const drawDimensionText = (
      textValue: string,
      x: number,
      y: number,
      color: string,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      ctx.font = `${textFontPx}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(1.5, textFontPx * 0.28);
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.strokeText(textValue, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(textValue, 0, 0);
      ctx.restore();
    };

    const drawBoundaryTick = (
      x: number,
      y: number,
      color: string,
      lineWidth: number,
    ) => {
      const size = boundaryTickPx;
      strokeSegment(
        { x: x - size * 0.55, y: y + size },
        { x: x + size * 0.55, y: y - size },
        color,
        lineWidth,
      );
    };

    const drawTallMovePreview = () => {
      if (
        !tallSubmoduleMoveState.active ||
        tallSubmoduleMoveState.step !== "pickTarget" ||
        tallSubmoduleMoveState.baseYMm == null
      )
        return;
      const selection = activeTallSubmoduleSelection;
      if (!selection || selection.hostInstanceId !== inst.id) return;
      const currentYMm =
        tallSubmoduleMoveState.currentYMm ?? tallSubmoduleMoveState.baseYMm;
      const segmentBounds =
        chain.segments.find(
          (segment) => segment.slotIndex === selection.slotIndex,
        ) ?? null;
      const visualBounds = resolveTallSlotVisualBoundsMm(
        inst,
        selection.slotIndex,
      );
      const bottomMm =
        visualBounds?.bottomMm ??
        segmentBounds?.bottomMm ??
        tallSubmoduleMoveState.baseYMm;
      const topMm =
        visualBounds?.topMm ??
        segmentBounds?.topMm ??
        tallSubmoduleMoveState.baseYMm + 80;
      const yTop = yForMm(topMm);
      const yBottom = yForMm(bottomMm);
      const x = Math.max(moduleLeftX, 0);
      const w = Math.max(20, moduleWidthPx);
      const cursorX = Math.max(
        0,
        Math.min(widthPx, tallSubmoduleMoveState.currentScreenX ?? centerX),
      );
      const baseX = Math.max(
        0,
        Math.min(widthPx, tallSubmoduleMoveState.baseScreenX ?? cursorX),
      );
      const baseY = yForMm(tallSubmoduleMoveState.baseYMm);
      const currentY = yForMm(currentYMm);

      ctx.save();
      ctx.fillStyle = "rgba(0, 15, 255, 0.10)";
      ctx.strokeStyle = "#000fff";
      ctx.lineWidth = Math.max(1.2, activeLineWidthPx);
      ctx.setLineDash([7, 5]);
      ctx.fillRect(
        x,
        Math.min(yTop, yBottom),
        w,
        Math.max(4, Math.abs(yBottom - yTop)),
      );
      ctx.strokeRect(
        x,
        Math.min(yTop, yBottom),
        w,
        Math.max(4, Math.abs(yBottom - yTop)),
      );
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(cursorX, currentY);
      ctx.stroke();
      ctx.fillStyle = "#000fff";
      ctx.beginPath();
      ctx.arc(baseX, baseY, Math.max(4, 8 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cursorX, currentY, Math.max(3, 6 * scale), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawTallInsertPreview = () => {
      if (
        !tallSubmoduleInsertState.active ||
        !tallSubmoduleInsertState.type ||
        tallSubmoduleInsertState.yMm == null
      )
        return;
      const usable = resolveTallStackUsableBoundsMm(dimensionParams);
      const bottomLimitMm = Math.max(
        0,
        Math.min(chain.hostHeightMm, usable.bottomMm),
      );
      const topLimitMm = Math.max(
        bottomLimitMm,
        Math.min(chain.hostHeightMm, usable.topMm),
      );
      const doorRange =
        tallSubmoduleInsertState.type === "door" &&
        tallSubmoduleInsertState.step === "pickTop" &&
        tallSubmoduleInsertState.bottomMm != null
          ? resolveTallDoorInsertRange(
              metrics,
              tallSubmoduleInsertState.bottomMm,
              tallSubmoduleInsertState.yMm,
              dimensionParams,
            )
          : null;
      const previewHeightMm = doorRange
        ? doorRange.heightMm
        : Math.max(
            tallSubmoduleInsertState.type === "shelf" ? 8 : 60,
            tallInsertDefaultHeightMm(tallSubmoduleInsertState.type) || 360,
          );
      const bottomMm = doorRange
        ? doorRange.bottomMm
        : Math.max(
            bottomLimitMm,
            Math.min(topLimitMm, tallSubmoduleInsertState.yMm),
          );
      const topMm = doorRange
        ? doorRange.topMm
        : Math.max(
            bottomLimitMm,
            Math.min(topLimitMm, bottomMm + previewHeightMm),
          );
      const yTop = yForMm(topMm);
      const yBottom = yForMm(bottomMm);
      const x = Math.max(moduleLeftX, 0);
      const w = Math.max(20, moduleWidthPx);
      const cursorX = Math.max(
        0,
        Math.min(widthPx, tallSubmoduleInsertState.screenX ?? centerX),
      );
      const cursorY = yForMm(bottomMm);
      ctx.save();
      ctx.fillStyle = "rgba(88, 64, 255, 0.13)";
      ctx.strokeStyle = "#5840ff";
      ctx.lineWidth = Math.max(1.2, activeLineWidthPx);
      ctx.setLineDash([8, 5]);
      ctx.fillRect(
        x,
        Math.min(yTop, yBottom),
        w,
        Math.max(4, Math.abs(yBottom - yTop)),
      );
      ctx.strokeRect(
        x,
        Math.min(yTop, yBottom),
        w,
        Math.max(4, Math.abs(yBottom - yTop)),
      );
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, Math.max(4, 7 * scale), 0, Math.PI * 2);
      ctx.fillStyle = "#5840ff";
      ctx.fill();
      ctx.restore();
    };

    const drawTallAlignSnapLine = () => {
      if (!tallSubmoduleAlignActive || tallSubmoduleAlignHoverYMm == null)
        return;
      const y = yForMm(tallSubmoduleAlignHoverYMm);
      const lineStartX = Math.max(0, moduleLeftX - Math.max(8, 24 * scale));
      const lineEndX = Math.min(
        widthPx,
        moduleLeftX + moduleWidthPx + Math.max(8, 24 * scale),
      );
      strokeSegment(
        { x: lineStartX, y },
        { x: lineEndX, y },
        activeDimensionColor,
        activeLineWidthPx,
      );
    };

    drawTallInsertPreview();
    drawTallMovePreview();
    drawTallAlignSnapLine();

    const hitSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    hitSvg.setAttribute("width", String(widthPx));
    hitSvg.setAttribute("height", String(heightPx));
    hitSvg.style.position = "absolute";
    hitSvg.style.inset = "0";
    hitSvg.style.pointerEvents = "none";
    hitSvg.setAttribute("aria-hidden", "true");

    for (const segment of chain.segments) {
      const selectedPlacement = isSelectedPlacementSegment(segment);
      const highlighted =
        isBoundaryAdjacentToSegment(activeBoundary, segment) ||
        selectedPlacement;
      const color = selectedPlacement
        ? selectedPlacementDimensionColor
        : highlighted
          ? activeDimensionColor
          : baseDimensionColor;
      const yBottom = yForMm(segment.bottomMm);
      const yTop = yForMm(segment.topMm);
      const yMid = (yBottom + yTop) / 2;
      const lineWidth = highlighted ? activeLineWidthPx : lineWidthPx;
      strokeSegment(
        { x: dimX, y: yBottom },
        { x: dimX, y: yTop },
        color,
        lineWidth,
      );
      drawDimensionText(
        String(Math.round(segment.heightMm)),
        labelX,
        yMid,
        color,
      );

      const boundary =
        placementBoundaryForSegment(segment) ??
        boundaryForSegmentLabel(segment, chain.boundaries);
      const lowerSegment =
        boundary?.lowerSegmentIndex != null
          ? (chain.segments[boundary.lowerSegmentIndex] ?? null)
          : null;
      const upperSegment =
        boundary?.upperSegmentIndex != null
          ? (chain.segments[boundary.upperSegmentIndex] ?? null)
          : null;
      const editableLabel =
        !!boundary &&
        ((boundary.isTop &&
          (segment.type !== "empty" ||
            boundary.lowerSegmentIndex === segment.segmentIndex)) ||
          segment.type === "empty" ||
          (!!lowerSegment &&
            !!upperSegment &&
            lowerSegment.type !== "empty" &&
            upperSegment.type !== "empty"));
      const editableBoundary = boundary;
      if (!editableLabel || !editableBoundary) continue;
      const labelHit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      labelHit.setAttribute(
        "x",
        (labelX - TALL_DIMENSION_TEXT_HIT_WIDTH_PX / 2).toFixed(1),
      );
      labelHit.setAttribute(
        "y",
        (yMid - TALL_DIMENSION_TEXT_HIT_HEIGHT_PX / 2).toFixed(1),
      );
      labelHit.setAttribute("width", String(TALL_DIMENSION_TEXT_HIT_WIDTH_PX));
      labelHit.setAttribute(
        "height",
        String(TALL_DIMENSION_TEXT_HIT_HEIGHT_PX),
      );
      labelHit.setAttribute("fill", "transparent");
      labelHit.style.pointerEvents = "auto";
      labelHit.style.cursor = "text";
      labelHit.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showTallDimensionInput(ev, segment, editableBoundary);
      });
      hitSvg.appendChild(labelHit);
    }

    for (const boundary of chain.boundaries) {
      const y = yForMm(boundary.yMm);
      const selectedPlacement = isSelectedPlacementBoundary(boundary);
      const highlighted =
        boundary.boundaryIndex === activeTallDimensionBoundaryIndex ||
        selectedPlacement;
      const color = selectedPlacement
        ? selectedPlacementDimensionColor
        : highlighted
          ? activeDimensionColor
          : baseDimensionColor;
      strokeSegment(
        { x: dimX - extensionOverhangPx, y },
        { x: extensionEndX, y },
        color,
        highlighted ? activeLineWidthPx : lineWidthPx,
      );
      drawBoundaryTick(
        dimX,
        y,
        color,
        highlighted ? activeLineWidthPx : lineWidthPx,
      );
      const hit = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      hit.setAttribute(
        "x1",
        (dimX - TALL_DIMENSION_BOUNDARY_HIT_OVERHANG_PX).toFixed(1),
      );
      hit.setAttribute("y1", y.toFixed(1));
      hit.setAttribute(
        "x2",
        (
          extensionEndX +
          TALL_DIMENSION_BOUNDARY_HIT_OVERHANG_PX * 0.75
        ).toFixed(1),
      );
      hit.setAttribute("y2", y.toFixed(1));
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute(
        "stroke-width",
        String(TALL_DIMENSION_BOUNDARY_HIT_WIDTH_PX),
      );
      hit.setAttribute("vector-effect", "non-scaling-stroke");
      hit.style.pointerEvents = "auto";
      hit.style.cursor = "pointer";
      hit.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        activeTallDimensionBoundaryIndex = boundary.boundaryIndex;
        renderTallDimensionOverlay();
      });
      hitSvg.appendChild(hit);
    }

    overlay.appendChild(canvas);
    overlay.appendChild(hitSvg);
    if (input) overlay.appendChild(input);
  };

  const readTallSubmodulePick = (
    object: THREE.Object3D | null | undefined,
  ): Omit<TallSubmoduleSelection, "hostInstanceId"> | null => {
    let current: THREE.Object3D | null | undefined = object;
    while (current) {
      const rawId = current.userData.selectableSubmoduleId;
      const rawSlotIndex = current.userData.hostSlotIndex;
      if (typeof rawId === "string" && rawId.trim()) {
        const slotIndex =
          typeof rawSlotIndex === "number" && Number.isFinite(rawSlotIndex)
            ? Math.round(rawSlotIndex)
            : 0;
        if (slotIndex > 0) {
          return {
            submoduleId: rawId,
            label:
              typeof current.userData.selectableSubmoduleLabel === "string"
                ? current.userData.selectableSubmoduleLabel
                : rawId,
            kind:
              typeof current.userData.selectableSubmoduleKind === "string"
                ? current.userData.selectableSubmoduleKind
                : "submodule",
            slotIndex,
          };
        }
      }
      current = current.parent;
    }
    return null;
  };

  const clearTallSubmoduleSelectionState = () => {
    activeTallSubmoduleSelection = null;
    activeTallSubmoduleSelections.clear();
  };

  const setSingleTallSubmoduleSelection = (
    selection: TallSubmoduleSelection | null,
  ) => {
    activeTallSubmoduleSelection = selection;
    activeTallSubmoduleSelections.clear();
    if (selection)
      activeTallSubmoduleSelections.set(selection.slotIndex, selection);
  };

  const toggleTallSubmoduleSelectionState = (
    selection: TallSubmoduleSelection,
  ) => {
    if (activeTallSubmoduleSelections.has(selection.slotIndex)) {
      activeTallSubmoduleSelections.delete(selection.slotIndex);
      activeTallSubmoduleSelection =
        Array.from(activeTallSubmoduleSelections.values()).at(-1) ?? null;
      return;
    }
    activeTallSubmoduleSelections.set(selection.slotIndex, selection);
    activeTallSubmoduleSelection = selection;
  };

  const activeTallSubmoduleSelectionList = (inst: LayoutInstance) => {
    return Array.from(activeTallSubmoduleSelections.values()).filter(
      (selection) => selection.hostInstanceId === inst.id,
    );
  };

  const clearTallSubmoduleSelection = () => {
    const inst = activeTallStackEditorInstance();
    const hasHostSelection =
      !!inst &&
      args.S.selectedKind === "module" &&
      args.S.selectedInstanceId === inst.id;
    const hasSelection =
      activeTallSubmoduleSelections.size > 0 ||
      !!activeTallSubmoduleSelection ||
      activeTallDimensionBoundaryIndex != null ||
      activeTallDimensionInputSegmentIndex != null ||
      hasHostSelection;
    if (
      !hasSelection &&
      !tallSubmoduleMoveState.active &&
      !tallSubmoduleAlignActive &&
      !tallSubmoduleInsertState.active
    )
      return;
    clearTallSubmoduleSelectionState();
    activeTallDimensionBoundaryIndex = null;
    activeTallDimensionInputSegmentIndex = null;
    if (tallDimensionInputEl) {
      tallDimensionInputEl.style.display = "none";
      tallDimensionInputEl.blur();
    }
    resetTallSubmoduleMove({ restorePreview: true });
    resetTallSubmoduleAlign();
    resetTallSubmoduleInsert();
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const selectTallSubmoduleFromObject = (
    instanceId: string | null,
    object: THREE.Object3D | null | undefined,
    options?: { additive?: boolean },
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || (instanceId && inst.id !== instanceId)) return false;
    const pick = readTallSubmodulePick(object);
    if (!pick) return false;
    const selection = {
      hostInstanceId: inst.id,
      ...pick,
    };
    if (options?.additive) toggleTallSubmoduleSelectionState(selection);
    else setSingleTallSubmoduleSelection(selection);
    if (
      tallSubmoduleMoveState.active &&
      tallSubmoduleMoveState.step === "selectObject"
    ) {
      tallSubmoduleMoveState.step = "pickBase";
      tallSubmoduleMoveState.baseYMm = null;
      tallSubmoduleMoveState.typedMm = "";
      setTallMoveStatus();
    }
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const selectTallSubmodulesFromObjects = (
    instanceId: string | null,
    objects: THREE.Object3D[],
    options?: { additive?: boolean },
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || (instanceId && inst.id !== instanceId)) return false;

    const selections = new Map<number, TallSubmoduleSelection>();
    for (const object of objects) {
      const pick = readTallSubmodulePick(object);
      if (!pick) continue;
      selections.set(pick.slotIndex, {
        hostInstanceId: inst.id,
        ...pick,
      });
    }

    if (!options?.additive) {
      activeTallSubmoduleSelections.clear();
      activeTallSubmoduleSelection = null;
    }

    for (const selection of selections.values()) {
      activeTallSubmoduleSelections.set(selection.slotIndex, selection);
      activeTallSubmoduleSelection = selection;
    }

    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const selectTallSubmoduleBySlot = (
    inst: LayoutInstance,
    slotIndex: number,
  ) => {
    let match: THREE.Object3D | null = null;
    inst.module.traverse((object) => {
      if (match) return;
      const rawSlotIndex = object.userData.hostSlotIndex;
      if (
        typeof rawSlotIndex !== "number" ||
        Math.round(rawSlotIndex) !== slotIndex
      )
        return;
      if (
        typeof object.userData.selectableSubmoduleId === "string" &&
        object.userData.selectableSubmoduleId.trim()
      )
        match = object;
    });
    const pick = readTallSubmodulePick(match);
    if (!pick) {
      clearTallSubmoduleSelectionState();
      return;
    }
    setSingleTallSubmoduleSelection({
      hostInstanceId: inst.id,
      ...pick,
    });
  };

  const getTallSubmoduleHighlightTargetFromObject = (
    instanceId: string,
    object: THREE.Object3D | null | undefined,
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || inst.id !== instanceId) return null;
    const pick = readTallSubmodulePick(object);
    return pick
      ? {
          kind: "submodule" as const,
          id: pick.submoduleId,
          hostInstanceId: inst.id,
        }
      : null;
  };

  const getSelectedTallSubmoduleHighlightTarget = () => {
    const selection = activeTallSubmoduleSelection;
    const inst = activeTallStackEditorInstance();
    if (!selection || !inst || selection.hostInstanceId !== inst.id)
      return null;
    return {
      kind: "submodule" as const,
      id: selection.submoduleId,
      hostInstanceId: selection.hostInstanceId,
    };
  };

  const getSelectedTallSubmoduleHighlightTargets = () => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return [];
    return activeTallSubmoduleSelectionList(inst).map((selection) => ({
      kind: "submodule" as const,
      id: selection.submoduleId,
      hostInstanceId: selection.hostInstanceId,
    }));
  };

  const commitTallSubmoduleParam = (
    key: string,
    value: string | number | boolean | null,
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || activeTallSubmoduleSelection?.hostInstanceId !== inst.id)
      return;
    if (inst.params[key] === value) return;
    const previousParams = structuredClone(inst.params);
    inst.params[key] = value;
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return;
    }
    commitHistory(args.S);
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const commitTallSubmoduleParams = (
    updates: Array<{ key: string; value: string | number | boolean | null }>,
  ) => {
    const inst = activeTallStackEditorInstance();
    if (!inst || updates.length === 0) return;
    const changed = updates.filter(
      (update) => inst.params[update.key] !== update.value,
    );
    if (changed.length === 0) return;
    const previousParams = structuredClone(inst.params);
    for (const update of changed) inst.params[update.key] = update.value;
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return;
    }
    commitHistory(args.S);
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const deleteActiveTallSubmodule = () => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    const selections = activeTallSubmoduleSelectionList(inst);
    if (selections.length === 0) {
      return true;
    }
    const previousParams = structuredClone(inst.params);
    for (const slotIndex of selections
      .map((selection) => selection.slotIndex)
      .sort((a, b) => b - a)) {
      const result = removeTallStackSlot(inst.params, slotIndex);
      if (!result.ok) {
        console.warn(`Tall stack delete failed: ${result.reason}`);
        return true;
      }
    }
    const rebuilt = args.rebuildInstance(inst, { skipLayoutValidation: true });
    if (!rebuilt) {
      inst.params = previousParams;
      args.rebuildInstance(inst, { skipLayoutValidation: true });
      return true;
    }
    clearTallSubmoduleSelectionState();
    activeTallDimensionBoundaryIndex = null;
    activeTallDimensionInputSegmentIndex = null;
    commitHistory(args.S);
    args.setSelectedModule(null);
    args.refreshProps();
    renderModuleCatalog();
    renderTallDimensionOverlay();
    return true;
  };

  const mountTallStackTools = (row: HTMLElement) => {
    const tools = args.tb.addGroup(t("Tall builder"), { row });
    for (const tool of TALL_STACK_INSERT_TOOLS) {
      args.tb.toolButton(tools, {
        title: tool.label,
        iconSvg: args.icons.cabinet,
        label: tool.label,
        onClick: () => startTallSubmoduleInsert(tool.type),
      });
    }
    args.tb.toolButton(tools, {
      title: t("Move selected submodule"),
      iconSvg: args.icons.cabinet,
      label: t("Move"),
      onClick: () => startTallSubmoduleMove(),
    });
    args.tb.toolButton(tools, {
      title: t("Copy selected submodule"),
      iconSvg: args.icons.cabinet,
      label: t("Copy"),
      onClick: () => startTallSubmoduleMove("copy"),
    });
    args.tb.toolButton(tools, {
      title: t("Align selected submodule vertically"),
      iconSvg: args.icons.cabinet,
      label: t("Align"),
      onClick: () => startTallSubmoduleAlign(),
    });
  };

  const setActiveModuleEditLayer = (next: KitchenModuleEditLayer) => {
    if (activeModuleEditLayer === next) return;
    activeModuleEditLayer = next;
    selectedWorktopSegment = null;
    args.cancelPlacementIfActive();
    args.setToolSelect();
    args.setSelectedModule(null);
    kitchenRunDimensionOverlay?.hide();
    syncKitchenPlanPresentation();
    args.buildClassicTopbar();
    args.refreshProps();
    args.setUnderlayStatus(
      next === "base"
        ? "Kitchen: editing lower modules. Upper modules are reference lines only."
        : "Kitchen: editing upper modules. Lower modules are reference lines only."
    );
  };

  const mountKitchenModuleLayerTools = (row: HTMLElement) => {
    const tools = args.tb.addGroup(t("Upravovať moduly"), { row });
    const addLayerButton = (layer: KitchenModuleEditLayer, label: string, title: string) => {
      const button = args.tb.toolButton(tools, {
        title: t(title),
        iconSvg: args.icons.cabinet,
        label: t(label),
        onClick: () => setActiveModuleEditLayer(layer)
      });
      const active = activeModuleEditLayer === layer;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    };
    addLayerButton("base", "Spodné", "Upravovať spodné moduly");
    addLayerButton("upper", "Vrchné", "Upravovať vrchné moduly");
  };

  const mountKitchenGroupEditorTools = (row: HTMLElement) => {
    const tools = args.tb.addGroup(t("Editor tools"), { row });
    args.tb.toolButton(tools, {
      title: t("Move selected module (M)"),
      iconSvg: args.icons.move,
      label: t("Move"),
      onClick: () => args.startTransformFromSelection("move", { sticky: true, toggle: true }),
    });
    args.tb.toolButton(tools, {
      title: t("Align module (A)"),
      iconSvg: args.icons.align,
      label: t("Align"),
      onClick: args.setToolAlign,
    });
  };

  const mountTopbar = (row: HTMLElement) => {
    const groupTools = args.tb.addGroup(t("Kitchen group"), { row });
    const runTopbarIntent = (intent: "accept" | "discard") => {
      const action = resolveKitchenEditTopbarAction({
        moduleEditorActive: !!activeTallStackEditorInstance(),
        intent,
      });
      if (action.type === "exit-module-editor") {
        exitModuleEditor({ discard: action.discard });
      } else if (action.discard) {
        exitDiscard();
      } else {
        exitFinish();
      }
    };
    if (args.S.kitchenEditMode) {
      const moduleEditorActive = !!activeTallStackEditorInstance();
      if (moduleEditorActive) {
        args.tb.toolButton(groupTools, {
          title: t("Back to kitchen"),
          iconSvg: args.icons.cancel,
          label: t("Back"),
          onClick: () => exitModuleEditor(),
        });
      }
      args.tb.toolButton(groupTools, {
        title: moduleEditorActive ? t("Confirm module") : t("Accept group"),
        iconSvg: args.icons.done,
        label: moduleEditorActive ? t("Confirm") : t("Accept"),
        variant: "success",
        onClick: () => runTopbarIntent("accept"),
      });
      args.tb.toolButton(groupTools, {
        title: moduleEditorActive ? t("Cancel module") : t("Discard"),
        iconSvg: args.icons.cancel,
        label: moduleEditorActive ? t("Cancel") : t("Discard"),
        variant: "danger",
        onClick: () => runTopbarIntent("discard"),
      });
      if (activeTallStackEditorInstance()) mountTallStackTools(row);
      else {
        mountKitchenModuleLayerTools(row);
        mountKitchenGroupEditorTools(row);
      }
    } else {
      const selectedGroupId = args.getSelectedKitchenGroupId();
      if (selectedGroupId && findKitchenGroup(selectedGroupId)) {
        args.tb.toolButton(groupTools, {
          title: t("Edit group"),
          iconSvg: args.icons.done,
          label: t("Edit"),
          onClick: () => enterExisting(selectedGroupId),
        });
      }
      args.tb.toolButton(groupTools, {
        title: t("New group"),
        iconSvg: args.icons.cabinet,
        label: t("New"),
        onClick: () => enterNew(),
      });
    }

    renderModuleCatalog();
  };

  const beginEdit = (
    groupId: string,
    name: string,
    ctx: KitchenContext,
    existingGroupId: string | null,
    focusInstanceId: string | null = null,
  ) => {
    args.ensureLayoutMode();
    args.cancelPlacementIfActive();
    args.setToolSelect();

    activeName = name;
    const focusInstance = focusInstanceId ? args.findInstance(focusInstanceId) : null;
    activeModuleEditLayer = focusInstance && getKitchenModuleRole(focusInstance.params as Record<string, unknown>) === "upper"
      ? "upper"
      : "base";
    snapshotName = name;
    editingExistingGroupId = existingGroupId;
    activeTallEditorInstanceId = null;
    activeTallEditorSnapshot = null;
    clearTallSubmoduleSelectionState();
    selectedWorktopSegment = null;
    kitchenCtxSnapshot = structuredClone(ctx);
    instanceSnapshots = captureGroupInstances(groupId);
    worktopSnapshots = captureGroupWorktops(groupId);

    args.S.kitchenCtx = resolveContext(structuredClone(ctx));
    args.S.kitchenEditMode = true;
    args.S.activeKitchenGroupId = groupId;

    syncInactiveModulePreviews();
    ensureOverlay();
    args.showKitchenTab();
    addEscapeHandler();
    attachTallEditorPointerHandlers();
    args.setSelectedModule(focusInstanceId);
    args.setUnderlayStatus(
      "Kitchen: click a dimension to edit width or position. M = Move, A = Align; snapping is active and modules stay inside the worktop.",
    );
    if (activeTallStackEditorInstance()) args.buildClassicTopbar();
    renderModuleCatalog();
    renderTallDimensionOverlay();
  };

  const enterNew = () => {
    beginEdit(
      "kg_" + Date.now(),
      getNextKitchenName(),
      args.S.kitchenCtx,
      null,
    );
  };

  const enterExisting = (
    groupId: string,
    focusInstanceId: string | null = null,
  ) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    beginEdit(group.id, group.name, group.ctx, group.id, focusInstanceId);
  };

  const enterModuleEditor = (instanceId: string) => {
    const inst = tallStackInstanceById(instanceId);
    if (!inst) return false;
    if (
      !args.S.kitchenEditMode ||
      inst.kitchenGroupId !== args.S.activeKitchenGroupId
    ) {
      if (inst.kitchenGroupId) {
        enterExisting(inst.kitchenGroupId, inst.id);
        const focusedInst = tallStackInstanceById(inst.id);
        if (focusedInst) {
          activeTallEditorInstanceId = focusedInst.id;
          activeTallEditorSnapshot = {
            instanceId: focusedInst.id,
            params: structuredClone(focusedInst.params),
          };
        }
        args.buildClassicTopbar();
        args.setSelectedModule(null);
        renderModuleCatalog();
        args.refreshProps();
        renderTallDimensionOverlay();
      }
      return true;
    }
    activeTallEditorInstanceId = inst.id;
    activeTallEditorSnapshot = {
      instanceId: inst.id,
      params: structuredClone(inst.params),
    };
    clearTallSubmoduleSelectionState();
    args.cancelPlacementIfActive();
    args.setToolSelect();
    args.setSelectedModule(null);
    renderModuleCatalog();
    args.showKitchenTab();
    args.refreshProps();
    renderTallDimensionOverlay();
    return true;
  };

  const exitModuleEditor = (opts: { discard?: boolean } = {}) => {
    const inst = activeTallStackEditorInstance();
    const hostInstanceId = inst?.id ?? activeTallEditorInstanceId;
    if (
      opts.discard &&
      inst &&
      activeTallEditorSnapshot?.instanceId === inst.id
    ) {
      inst.params = structuredClone(activeTallEditorSnapshot.params);
      args.rebuildInstance(inst, { skipLayoutValidation: true });
    }
    activeTallEditorInstanceId = null;
    activeTallEditorSnapshot = null;
    clearTallSubmoduleSelectionState();
    resetTallSubmoduleMove();
    resetTallSubmoduleAlign();
    resetTallSubmoduleInsert();
    args.setSelectedModule(hostInstanceId);
    renderModuleCatalog();
    args.showKitchenTab();
    args.buildClassicTopbar();
    args.refreshProps();
    renderTallDimensionOverlay();
  };

  const exitCommon = () => {
    flushPendingCtx();
    clearInactiveModulePreviews();
    args.S.kitchenEditMode = false;
    args.S.activeKitchenGroupId = null;
    activeTallEditorInstanceId = null;
    activeTallEditorSnapshot = null;
    clearTallSubmoduleSelectionState();
    selectedWorktopSegment = null;
    activeName = "";
    snapshotName = "";
    editingExistingGroupId = null;
    activeTallDimensionBoundaryIndex = null;
    activeTallDimensionInputSegmentIndex = null;
    resetTallSubmoduleMove();
    resetTallSubmoduleAlign();
    resetTallSubmoduleInsert();
    hideTallDimensionOverlay();
    kitchenRunDimensionOverlay?.hide();
    restoreKitchenPlanPresentation();
    kitchenCtxSnapshot = null;
    instanceSnapshots = [];
    worktopSnapshots = [];
    args.cancelWorktopDraw({ silent: true });
    removeOverlay();
    removeEscapeHandler();
    detachTallEditorPointerHandlers();
    renderModuleCatalog();
    args.restoreStandardTopbar();
    args.setSelectedModule(null);
  };

  const exitFinish = () => {
    if (!args.S.kitchenEditMode) return;

    args.handleWorktopEscape();
    args.cancelPlacementIfActive();

    const groupId = args.S.activeKitchenGroupId;
    if (!groupId) {
      exitCommon();
      return;
    }

    const nextGroup: KitchenGroup = {
      id: groupId,
      name: activeName || "Kuchyňa",
      ctx: structuredClone(args.S.kitchenCtx),
      instanceIds: getGroupInstanceIds(groupId),
    };

    const existing = editingExistingGroupId
      ? findKitchenGroup(editingExistingGroupId)
      : null;
    if (existing) {
      existing.name = nextGroup.name;
      existing.ctx = nextGroup.ctx;
      existing.instanceIds = nextGroup.instanceIds;
    } else {
      args.S.kitchenGroups.push(nextGroup);
    }

    args.updateLayoutPanel();
    exitCommon();
    args.setSelectedKitchenGroup(groupId);
  };

  const restoreExistingInstances = (groupId: string) => {
    const snapshotIds = new Set(
      instanceSnapshots.map((snapshot) => snapshot.id),
    );

    for (let i = args.S.instances.length - 1; i >= 0; i--) {
      const inst = args.S.instances[i];
      if (inst.kitchenGroupId !== groupId) continue;
      if (snapshotIds.has(inst.id)) continue;
      args.layoutRoot.remove(inst.root);
      args.disposeObject3D(inst.root);
      args.S.instances.splice(i, 1);
    }

    for (const snapshot of instanceSnapshots) {
      let inst = args.findInstance(snapshot.id);
      if (!inst) {
        inst = args.createInstance(structuredClone(snapshot.params), {
          id: snapshot.id,
        });
        inst.kitchenGroupId = groupId;
        inst.root.position.set(
          snapshot.position.x,
          snapshot.position.y,
          snapshot.position.z,
        );
        inst.root.rotation.y = snapshot.rotationY;
        args.layoutRoot.add(inst.root);
        args.S.instances.push(inst);
      }
      inst.params = structuredClone(snapshot.params);
      inst.kitchenGroupId = groupId;
      inst.root.position.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z,
      );
      inst.root.rotation.y = snapshot.rotationY;
      args.rebuildInstance(inst);
      inst.root.position.set(
        snapshot.position.x,
        snapshot.position.y,
        snapshot.position.z,
      );
      inst.root.rotation.y = snapshot.rotationY;
    }
  };

  const exitDiscard = () => {
    if (!args.S.kitchenEditMode) return;

    args.cancelPlacementIfActive();

    const groupId = args.S.activeKitchenGroupId;
    if (!groupId) {
      exitCommon();
      return;
    }

    if (editingExistingGroupId) {
      const group = findKitchenGroup(editingExistingGroupId);
      if (group && kitchenCtxSnapshot) {
        group.name = snapshotName;
        group.ctx = resolveContext(structuredClone(kitchenCtxSnapshot));
        group.instanceIds = instanceSnapshots.map((snapshot) => snapshot.id);
      }
      if (kitchenCtxSnapshot) {
        args.S.kitchenCtx = resolveContext(structuredClone(kitchenCtxSnapshot));
      }
      restoreExistingInstances(groupId);
      args.replaceGroupWorktops(groupId, worktopSnapshots, {
        skipHistory: true,
      });
    } else {
      if (kitchenCtxSnapshot) {
        args.S.kitchenCtx = resolveContext(structuredClone(kitchenCtxSnapshot));
      }
      for (let i = args.S.instances.length - 1; i >= 0; i--) {
        const inst = args.S.instances[i];
        if (inst.kitchenGroupId !== groupId) continue;
        args.layoutRoot.remove(inst.root);
        args.disposeObject3D(inst.root);
        args.S.instances.splice(i, 1);
      }
      args.replaceGroupWorktops(groupId, [], { skipHistory: true });
    }

    args.updateLayoutPanel();
    exitCommon();
  };

  const buildKitchenRunGapBadges = (groupId: string) => {
    const grouped = new Map<string, Array<{ start: number; end: number }>>();
    for (const inst of args.S.instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      const role =
        getKitchenModuleRole(inst.params as Record<string, unknown>) ?? "free";
      const rotation = inst.root.rotation.y;
      const widthDir = new THREE.Vector3(
        Math.cos(rotation),
        0,
        -Math.sin(rotation),
      ).normalize();
      const frontDir = new THREE.Vector3(
        Math.sin(rotation),
        0,
        Math.cos(rotation),
      ).normalize();
      const centerAlong = inst.root.position.dot(widthDir);
      const centerFront = inst.root.position.dot(frontDir);
      const widthMm = Math.max(
        1,
        Number(
          (inst.params as Record<string, unknown>).width ??
            (inst.params as Record<string, unknown>).widthMm ??
            0,
        ),
      );
      const key = [
        role,
        Math.round(rotation * 100) / 100,
        Math.round(centerFront * 100),
        Math.round(inst.root.position.y * 100),
      ].join("|");
      const list = grouped.get(key) ?? [];
      list.push({
        start: centerAlong - widthMm / 2000,
        end: centerAlong + widthMm / 2000,
      });
      grouped.set(key, list);
    }

    return Array.from(grouped.entries()).map(([key, intervals], index) => {
      intervals.sort((a, b) => a.start - b.start);
      let maxGapMm = 0;
      let maxOverlapMm = 0;
      for (let itemIndex = 1; itemIndex < intervals.length; itemIndex += 1) {
        const deltaMm = Math.round(
          (intervals[itemIndex]!.start - intervals[itemIndex - 1]!.end) * 1000,
        );
        if (deltaMm > maxGapMm) maxGapMm = deltaMm;
        if (deltaMm < 0)
          maxOverlapMm = Math.max(maxOverlapMm, Math.abs(deltaMm));
      }
      const role = key.split("|")[0] ?? "run";
      return {
        label: `${role} ${index + 1}`,
        state:
          maxOverlapMm > 1
            ? `overlap ${maxOverlapMm} mm`
            : maxGapMm > 1
              ? `gap ${maxGapMm} mm`
              : "OK",
        ok: maxOverlapMm <= 1 && maxGapMm <= 1,
      };
    });
  };

  const mountTallSubmoduleProps = () => {
    const inst = activeTallStackEditorInstance();
    if (!inst) return false;
    const selections = activeTallSubmoduleSelectionList(inst);
    const selection =
      selections.length === 1 ? selections[0] : activeTallSubmoduleSelection;
    if (
      selections.length === 0 ||
      !selection ||
      selection.hostInstanceId !== inst.id
    )
      return false;

    const primarySlotTypeKey = `tallSlot${selection.slotIndex}Type`;
    const primarySlotHeightKey = `tallSlot${selection.slotIndex}HeightMm`;
    const primarySlotOffsetKey = `tallSlot${selection.slotIndex}OffsetMm`;
    const slotTypeKey = primarySlotTypeKey;
    const slotHeightKey = primarySlotHeightKey;
    const slotOffsetKey = primarySlotOffsetKey;
    const currentSlotType = String(inst.params[slotTypeKey] ?? selection.kind);
    const currentSlotHeight = Number(inst.params[slotHeightKey] ?? 0);
    const currentSlotOffset = Number(inst.params[slotOffsetKey] ?? 0);
    const isMulti = selections.length > 1;
    const valueForSlots = (suffix: "Type" | "HeightMm" | "OffsetMm") => {
      const values = selections.map(
        (item) => inst.params[`tallSlot${item.slotIndex}${suffix}`],
      );
      const first = values[0];
      return {
        value: first,
        mixed: values.some((value) => value !== first),
      };
    };
    const commitForSlots = (
      suffix: "Type" | "HeightMm" | "OffsetMm",
      value: string | number,
    ) => {
      commitTallSubmoduleParams(
        selections.map((item) => ({
          key: `tallSlot${item.slotIndex}${suffix}`,
          value,
        })),
      );
    };

    args.props.setTitle(
      isMulti ? `Submodules (${selections.length})` : selection.label,
    );
    const section = args.props.section();

    const readonly = (value: string) => {
      const span = document.createElement("span");
      span.className = "muted";
      span.textContent = value;
      return span;
    };

    args.props.row(
      section,
      "Submodule",
      readonly(
        isMulti
          ? selections.map((item) => item.submoduleId).join(", ")
          : selection.submoduleId,
      ),
    );
    args.props.row(
      section,
      "Slot",
      readonly(
        isMulti
          ? selections.map((item) => String(item.slotIndex)).join(", ")
          : String(selection.slotIndex),
      ),
    );

    const slotTypeSelect = document.createElement("select");
    const mixedTypeOption = document.createElement("option");
    mixedTypeOption.value = "";
    mixedTypeOption.textContent = "rozdielne";
    slotTypeSelect.appendChild(mixedTypeOption);
    for (const [value, label] of [
      ["drawer", "Suflik"],
      ["shelf", "Policka"],
      ["oven", "Rura"],
      ["sink", "Drez"],
      ["microwave", "Mikrovlnka"],
      ["door", "Dvierka"],
      ["empty", "Empty"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      slotTypeSelect.appendChild(option);
    }
    const typeState = valueForSlots("Type");
    slotTypeSelect.value = typeState.mixed
      ? ""
      : String(typeState.value ?? currentSlotType);
    slotTypeSelect.title = typeState.mixed ? "rozdielne" : "";
    slotTypeSelect.addEventListener("change", () => {
      if (isMulti) commitForSlots("Type", slotTypeSelect.value);
      else commitTallSubmoduleParam(slotTypeKey, slotTypeSelect.value);
    });
    args.props.row(section, "Slot type", slotTypeSelect);

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.step = "1";
    const heightState = valueForSlots("HeightMm");
    heightInput.value = heightState.mixed
      ? ""
      : Number.isFinite(Number(heightState.value))
        ? String(Math.round(Number(heightState.value)))
        : Number.isFinite(currentSlotHeight)
          ? String(Math.round(currentSlotHeight))
          : "0";
    heightInput.placeholder = heightState.mixed ? "rozdielne" : "";
    const commitHeight = () => {
      const next = Number(String(heightInput.value).trim().replace(",", "."));
      if (!Number.isFinite(next)) return;
      const rounded = Math.max(0, Math.round(next));
      heightInput.value = String(rounded);
      if (isMulti) commitForSlots("HeightMm", rounded);
      else commitTallSubmoduleParam(slotHeightKey, rounded);
    };
    heightInput.addEventListener("change", commitHeight);
    heightInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commitHeight();
    });
    args.props.row(section, "Slot height", heightInput);

    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.step = "1";
    const offsetState = valueForSlots("OffsetMm");
    offsetInput.value = offsetState.mixed
      ? ""
      : Number.isFinite(Number(offsetState.value))
        ? String(Math.round(Number(offsetState.value)))
        : Number.isFinite(currentSlotOffset)
          ? String(Math.round(currentSlotOffset))
          : "0";
    offsetInput.placeholder = offsetState.mixed ? "rozdielne" : "";
    const commitOffset = () => {
      const next = Number(String(offsetInput.value).trim().replace(",", "."));
      if (!Number.isFinite(next)) return;
      const rounded = Math.round(next);
      offsetInput.value = String(rounded);
      if (isMulti) commitForSlots("OffsetMm", rounded);
      else commitTallSubmoduleParam(slotOffsetKey, rounded);
    };
    offsetInput.addEventListener("change", commitOffset);
    offsetInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commitOffset();
    });
    args.props.row(section, "Slot offset", offsetInput);

    const doorSelections = selections.filter(
      (item) =>
        String(inst.params[`tallSlot${item.slotIndex}Type`] ?? item.kind) ===
        "door",
    );
    if (doorSelections.length > 0) {
      const valueForDoorSlots = (
        suffix: "DoorLeafCount" | "DoorOpeningMode",
      ) => {
        const values = doorSelections.map(
          (item) => inst.params[`tallSlot${item.slotIndex}${suffix}`],
        );
        const first = values[0];
        return {
          value: first,
          mixed: values.some((value) => value !== first),
        };
      };
      const commitForDoorSlots = (
        suffix: "DoorLeafCount" | "DoorOpeningMode",
        value: string | number,
      ) => {
        commitTallSubmoduleParams(
          doorSelections.map((item) => ({
            key: `tallSlot${item.slotIndex}${suffix}`,
            value,
          })),
        );
      };

      const leafSelect = document.createElement("select");
      for (const [value, label] of [
        ["", "rozdielne"],
        ["1", "1 kridlo"],
        ["2", "2 kridla"],
      ] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        leafSelect.appendChild(option);
      }
      const leafState = valueForDoorSlots("DoorLeafCount");
      leafSelect.value = leafState.mixed ? "" : String(leafState.value ?? 1);
      leafSelect.addEventListener("change", () => {
        if (!leafSelect.value) return;
        commitForDoorSlots("DoorLeafCount", Number(leafSelect.value));
      });
      args.props.row(section, "Pocet kridel", leafSelect);

      const openingSelect = document.createElement("select");
      for (const [value, label] of [
        ["", "rozdielne"],
        ["hinged", "Otvarave"],
        ["lift_up", "Vrchne otvaranie"],
      ] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        openingSelect.appendChild(option);
      }
      const openingState = valueForDoorSlots("DoorOpeningMode");
      openingSelect.value = openingState.mixed
        ? ""
        : String(openingState.value ?? "hinged");
      openingSelect.addEventListener("change", () => {
        if (!openingSelect.value) return;
        commitForDoorSlots("DoorOpeningMode", openingSelect.value);
      });
      args.props.row(section, "Otvaranie", openingSelect);
    }

    if (
      selections.some(
        (item) =>
          String(inst.params[`tallSlot${item.slotIndex}Type`] ?? item.kind) ===
          "drawer",
      )
    ) {
      const brandSelect = document.createElement("select");
      for (const brand of FWM_DRAWER_SYSTEM_BRAND_OPTIONS) {
        const option = document.createElement("option");
        option.value = brand.value;
        option.textContent = brand.label;
        brandSelect.appendChild(option);
      }
      brandSelect.value = String(
        inst.params.drawerSystemBrand ??
          inst.params.drawerSystem ??
          "merivobox",
      );
      brandSelect.addEventListener("change", () => {
        commitTallSubmoduleParam("drawerSystemBrand", brandSelect.value);
      });
      args.props.row(
        section,
        translateParamLabel("drawerSystemBrand"),
        brandSelect,
      );

      const sizeSelect = document.createElement("select");
      const sizeValueForSlot = (item: TallSubmoduleSelection) =>
        String(inst.params[`tallSlot${item.slotIndex}DrawerSystemSize`] ?? "");
      const sizeValues = selections.map(sizeValueForSlot);
      const firstSizeValue = sizeValues[0] ?? "";
      const mixedSize = sizeValues.some((value) => value !== firstSizeValue);
      const derivedSizeForPrimarySlot =
        resolveFwmDrawerSystemPresetForFrontHeight(
          brandSelect.value,
          Number(
            inst.params[`tallSlot${selection.slotIndex}HeightMm`] ??
              currentSlotHeight,
          ),
        ).size;
      const autoOption = document.createElement("option");
      autoOption.value = "";
      autoOption.textContent = mixedSize
        ? "rozdielne"
        : `Auto (${derivedSizeForPrimarySlot})`;
      sizeSelect.appendChild(autoOption);
      for (const preset of listFwmDrawerSystemPresetsForBrand(
        brandSelect.value,
      )) {
        const option = document.createElement("option");
        option.value = preset.size;
        option.textContent = preset.label;
        sizeSelect.appendChild(option);
      }
      sizeSelect.value = mixedSize ? "" : firstSizeValue;
      sizeSelect.title = mixedSize ? "rozdielne" : "";
      sizeSelect.addEventListener("change", () => {
        commitTallSubmoduleParams(
          selections.map((item) => ({
            key: `tallSlot${item.slotIndex}DrawerSystemSize`,
            value: sizeSelect.value,
          })),
        );
      });
      args.props.row(section, "Drawer size", sizeSelect);
      args.props.row(
        section,
        "Drawer front height",
        readonly(
          `${Math.round(Number.isFinite(currentSlotHeight) ? currentSlotHeight : 0)} mm`,
        ),
      );
    }

    args.props.row(
      section,
      "Host opening",
      readonly(
        `${Math.round(Number(inst.params.width ?? 0))} x ${Math.round(Number(inst.params.depth ?? 0))} mm`,
      ),
    );
    return true;
  };

  const mountKitchenGroupProps = (groupId: string) => {
    const isEditingActive =
      args.S.kitchenEditMode && args.S.activeKitchenGroupId === groupId;
    const group = findKitchenGroup(groupId);
    const ctx = isEditingActive ? args.S.kitchenCtx : (group?.ctx ?? null);
    const currentName = isEditingActive ? activeName : (group?.name ?? "");
    if (!ctx) return false;

    const selectedWing = isEditingActive && selectedWorktopSegment
      ? args.getGroupWorktops(groupId).find((worktop) =>
          worktop.id === selectedWorktopSegment?.worktopId &&
          selectedWorktopSegment.segmentIndex >= 0 &&
          selectedWorktopSegment.segmentIndex < worktop.params.path.length - 1
        ) ?? null
      : null;
    const selectedWingIndex = selectedWing ? selectedWorktopSegment!.segmentIndex : null;
    args.props.setTitle(selectedWing ? `${t("Kitchen")} - Worktop ${selectedWingIndex! + 1}` : t("Kitchen"));
    const section = args.props.section();

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = currentName;
    args.props.row(section, t("Name"), nameInput);
    const commitName = () => {
      const nextName = nameInput.value.trim() || "Kuchyňa";
      nameInput.value = nextName;
      if (isEditingActive) {
        activeName = nextName;
      } else if (group) {
        group.name = nextName;
      }
    };
    nameInput.addEventListener("change", commitName);
    nameInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commitName();
    });

    const commitCtx = (
      buildNext: (base: KitchenContext) => KitchenContext,
      opts?: { refreshProps?: boolean },
    ) => {
      if (isEditingActive) {
        pendingActiveCtx = resolveContext(
          buildNext(pendingActiveCtx ?? args.S.kitchenCtx),
        );
        schedulePendingCtxFlush();
        return;
      }
      if (!group) return;
      pendingNormalCtx.set(
        group.id,
        resolveContext(buildNext(pendingNormalCtx.get(group.id) ?? group.ctx)),
      );
      schedulePendingCtxFlush();
    };

    const addNumberRow = (
      label: string,
      value: number,
      onCommit: (value: number, refreshProps: boolean) => void,
    ) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.value = String(Math.round(value));
      args.props.row(section, label, input);
      const applyValue = (refreshProps: boolean) => {
        const next = Number(String(input.value).trim().replace(",", "."));
        if (!Number.isFinite(next)) return;
        onCommit(Math.round(next), refreshProps);
        input.value = String(Math.round(next));
      };
      input.addEventListener("change", () => applyValue(false));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") applyValue(false);
      });
    };

    addNumberRow(
      translateParamLabel("heightMm"),
      ctx.heightMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, heightMm: value }), { refreshProps }),
    );
    addNumberRow(
      translateParamLabel("worktopDepthMm"),
      selectedWing && selectedWingIndex != null
        ? getKitchenWorktopSegmentDepthMm(selectedWing.params, selectedWingIndex)
        : ctx.worktopDepthMm,
      (value, refreshProps) => {
        if (selectedWing && selectedWingIndex != null) {
          const result = args.editKitchenWorktopSegment({
            worktopId: selectedWing.id,
            segmentIndex: selectedWingIndex,
            depthMm: value
          });
          if (result.ok && refreshProps) args.refreshProps();
          return;
        }
        commitCtx((base) => ({ ...base, worktopDepthMm: value }), { refreshProps });
      },
    );
    addNumberRow(
      translateParamLabel("worktopFrontOffsetMm"),
      ctx.worktopFrontOffsetMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, worktopFrontOffsetMm: value }), {
          refreshProps,
        }),
    );
    addNumberRow(
      translateParamLabel("worktopBackOffsetMm"),
      ctx.worktopBackOffsetMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, worktopBackOffsetMm: value }), {
          refreshProps,
        }),
    );
    addNumberRow(
      translateParamLabel("upperStartHeightMm"),
      ctx.upperStartHeightMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, upperStartHeightMm: value }), {
          refreshProps,
        }),
    );
    addNumberRow(
      translateParamLabel("upperDepthMm"),
      ctx.upperDepthMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, upperDepthMm: value }), {
          refreshProps,
        }),
    );
    addNumberRow(
      translateParamLabel("upperHeightMm"),
      ctx.upperHeightMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, upperHeightMm: value }), {
          refreshProps,
        }),
    );

    const gapBadges = document.createElement("div");
    gapBadges.style.display = "flex";
    gapBadges.style.flexWrap = "wrap";
    gapBadges.style.gap = "4px";
    for (const badge of buildKitchenRunGapBadges(groupId)) {
      const chip = document.createElement("span");
      chip.textContent = `${badge.label}: ${badge.state}`;
      chip.style.borderRadius = "999px";
      chip.style.padding = "2px 7px";
      chip.style.fontSize = "11px";
      chip.style.fontWeight = "700";
      chip.style.background = badge.ok ? "#e8f7ef" : "#fff1d6";
      chip.style.color = badge.ok ? "#166534" : "#92400e";
      gapBadges.appendChild(chip);
    }
    args.props.row(section, "Module gaps", gapBadges);

    const makeMaterialLookupInput = (
      family: KitchenMaterialLookupFamily,
      value: string,
      onChange: (id: string) => void,
    ) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "3px";
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.placeholder = "Exact material ID";
      input.autocomplete = "off";
      input.spellcheck = false;
      const status = document.createElement("div");
      status.className = "muted";
      status.style.fontSize = "11px";
      const renderStatus = () => {
        const material = findKitchenMaterialByExactId(
          args.catalog,
          family,
          input.value,
        );
        status.textContent = material
          ? material.displayName
          : "Type exact catalog material ID.";
        status.style.color = material ? "" : "#92400e";
      };
      const commit = async () => {
        status.textContent = "Looking up exact catalog ID...";
        status.style.color = "";
        const material = await lookupKitchenMaterialByExactId(
          args.catalog,
          family,
          input.value,
        );
        if (!material) {
          renderStatus();
          return;
        }
        input.value = material.id;
        onChange(material.id);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
      });
      input.addEventListener("input", renderStatus);
      renderStatus();
      wrap.append(input, status);
      return wrap;
    };

    const makeHandleLookupInput = (
      value: string,
      onChange: (id: string) => void,
    ) => {
      const wrap = document.createElement("div");
      wrap.style.display = "grid";
      wrap.style.gap = "3px";
      const input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.placeholder = "Exact handle component ID";
      input.autocomplete = "off";
      input.spellcheck = false;
      const status = document.createElement("div");
      status.className = "muted";
      status.style.fontSize = "11px";
      const renderStatus = () => {
        const component = findKitchenHandleByExactId(args.catalog, input.value);
        status.textContent = component
          ? component.displayName
          : "Type exact catalog handle ID.";
        status.style.color = component ? "" : "#92400e";
      };
      const commit = async () => {
        status.textContent = "Looking up exact catalog ID...";
        status.style.color = "";
        const component = await lookupKitchenHandleByExactId(
          args.catalog,
          input.value,
        );
        if (!component) {
          renderStatus();
          return;
        }
        input.value = component.id;
        onChange(component.id);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
      });
      input.addEventListener("input", renderStatus);
      renderStatus();
      wrap.append(input, status);
      return wrap;
    };

    args.props.row(
      section,
      translateParamLabel("frontsMaterialId"),
      makeMaterialLookupInput("front", ctx.frontsMaterialId, (id) =>
        commitCtx((base) => ({ ...base, frontsMaterialId: id })),
      ),
    );
    args.props.row(
      section,
      translateParamLabel("corpusMaterialId"),
      makeMaterialLookupInput("body", ctx.corpusMaterialId, (id) =>
        commitCtx((base) => ({ ...base, corpusMaterialId: id })),
      ),
    );
    args.props.row(
      section,
      translateParamLabel("backMaterialId"),
      makeMaterialLookupInput("back", ctx.backMaterialId, (id) =>
        commitCtx((base) => ({ ...base, backMaterialId: id })),
      ),
    );
    args.props.row(
      section,
      translateParamLabel("drawerBottomMaterialId"),
      makeMaterialLookupInput(
        "drawer_bottom",
        ctx.drawerBottomMaterialId,
        (id) => commitCtx((base) => ({ ...base, drawerBottomMaterialId: id })),
      ),
    );
    args.props.row(
      section,
      translateParamLabel("worktopMaterialId"),
      makeMaterialLookupInput("worktop", ctx.worktopMaterialId, (id) =>
        commitCtx((base) => ({
          ...base,
          worktopMaterialId: id,
          worktopThicknessMm: resolveKitchenWorktopThickness(
            id,
            base.worktopThicknessMm,
            args.catalog,
          ),
        })),
      ),
    );
    args.props.row(
      section,
      translateParamLabel("handleComponentId"),
      makeHandleLookupInput(ctx.handleComponentId, (id) =>
        commitCtx((base) => ({ ...base, handleComponentId: id })),
      ),
    );

    const worktopThicknessSelect = document.createElement("select");
    const worktopThicknessOptions = getKitchenWorktopThicknessOptions(
      ctx.worktopMaterialId,
      args.catalog,
    );
    const resolvedWorktopThickness = resolveKitchenWorktopThickness(
      ctx.worktopMaterialId,
      ctx.worktopThicknessMm,
      args.catalog,
    );
    worktopThicknessSelect.innerHTML = worktopThicknessOptions
      .map((value) => `<option value="${value}">${value} mm</option>`)
      .join("");
    worktopThicknessSelect.value = String(resolvedWorktopThickness);
    worktopThicknessSelect.addEventListener("change", () => {
      const next = Number(worktopThicknessSelect.value);
      if (!Number.isFinite(next)) return;
      commitCtx((base) => ({
        ...base,
        worktopThicknessMm: resolveKitchenWorktopThickness(
          base.worktopMaterialId,
          next,
          args.catalog,
        ),
      }));
    });
    args.props.row(
      section,
      translateParamLabel("worktopThicknessMm"),
      worktopThicknessSelect,
    );
    addNumberRow(
      translateParamLabel("plinthHeightMm"),
      ctx.plinthHeightMm,
      (value, refreshProps) =>
        commitCtx((base) => ({ ...base, plinthHeightMm: value }), {
          refreshProps,
        }),
    );

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = t("Edit kitchen");
    editBtn.disabled = isEditingActive;
    editBtn.style.marginTop = "10px";
    editBtn.addEventListener("click", () => {
      if (isEditingActive) return;
      enterExisting(groupId);
    });
    section.appendChild(editBtn);

    return true;
  };

  return {
    enterNew,
    enterExisting,
    enterModuleEditor,
    exitFinish,
    exitDiscard,
    mountTopbar,
    mountModuleCatalog,
    findKitchenGroup,
    getGroupForInstance(instanceId: string) {
      const inst = args.findInstance(instanceId);
      if (!inst?.kitchenGroupId) return null;
      return findKitchenGroup(inst.kitchenGroupId);
    },
    filterSelectableInstanceId(id: string | null) {
      if (!id) return null;
      if (!args.S.kitchenEditMode) return id;
      const activeGroupId = args.S.activeKitchenGroupId;
      if (!activeGroupId) return null;
      const inst = args.findInstance(id);
      if (!inst) return null;
      if (inst.kitchenGroupId !== activeGroupId) return null;
      const tallHost = activeTallStackEditorInstance();
      if (tallHost) return tallHost.id === id ? id : null;
      return isKitchenModuleInEditLayer(
        inst.params as Record<string, unknown>,
        activeModuleEditLayer
      ) ? id : null;
    },
    selectTallSubmoduleFromObject,
    selectTallSubmodulesFromObjects,
    getTallSubmoduleHighlightTargetFromObject,
    getSelectedTallSubmoduleHighlightTarget,
    getSelectedTallSubmoduleHighlightTargets,
    isTallModuleEditorActive: () => !!activeTallStackEditorInstance(),
    getActiveTallEditorInstanceId: () =>
      activeTallStackEditorInstance()?.id ?? null,
    clearTallSubmoduleSelection,
    deleteActiveTallSubmodule,
    refreshTallDimensionOverlay: refreshKitchenDimensionOverlays,
    syncPlanPresentation: syncKitchenPlanPresentation,
    getActiveModuleEditLayer: () => activeModuleEditLayer,
    selectWorktopSegment(worktopId: string, segmentIndex: number) {
      const groupId = args.S.activeKitchenGroupId;
      const worktop = groupId ? args.getGroupWorktops(groupId).find((item) => item.id === worktopId) ?? null : null;
      if (!worktop || segmentIndex < 0 || segmentIndex >= worktop.params.path.length - 1) return false;
      selectedWorktopSegment = { worktopId, segmentIndex };
      args.setSelectedModule(null);
      kitchenRunDimensionOverlay?.hide();
      args.refreshProps();
      return true;
    },
    clearWorktopSegmentSelection() {
      if (!selectedWorktopSegment) return;
      selectedWorktopSegment = null;
      kitchenRunDimensionOverlay?.hide();
    },
    getSelectedWorktopSegment: () => selectedWorktopSegment,
    refreshModuleCatalog: renderModuleCatalog,
    mountKitchenGroupProps,
    tryMountActiveTallSubmoduleProps: mountTallSubmoduleProps,
    tryMountActiveKitchenGroupProps() {
      const groupId = args.S.activeKitchenGroupId;
      if (!args.S.kitchenEditMode || !groupId) return false;
      return mountKitchenGroupProps(groupId);
    },
    flushPendingContext: flushPendingCtx,
  };
}
