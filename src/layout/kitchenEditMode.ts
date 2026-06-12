import * as THREE from "three";
import type { Group, Object3D } from "three";
import type { ModuleParams } from "../model/cabinetTypes";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { AppState, KitchenGroup, KitchenWorktopParams, LayoutInstance } from "./appState";
import { resolveContext, type KitchenContext } from "./kitchenContext";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import { getPackageDefaultValue } from "../core/module-package/module-package-catalog";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import {
  getKitchenWorktopThicknessOptions,
  resolveKitchenWorktopThickness
} from "./kitchenMaterialSync";
import { getKitchenModuleRole } from "./kitchenModuleRules";
import { t, translateParamLabel } from "../i18n";
import type { EditorPropsApi, EditorTopbarApi } from "../app/editorModeApis";

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

type KitchenMaterialLookupFamily = "front" | "body" | "back" | "drawer_bottom" | "worktop";

function isKitchenRibbonModule(modulePackage: FurnQuoteModulePackage) {
  const tags = new Set((modulePackage.module.tags ?? []).map((tag) => tag.toLowerCase()));
  if (tags.has("kitchen")) return true;
  if (modulePackage.behavior?.contextBindings?.some((binding) => binding.contextType === "kitchenGroup")) return true;
  return (
    modulePackage.module.category === "base_cabinet" ||
    modulePackage.module.category === "wall_cabinet" ||
    modulePackage.module.category === "tall_cabinet" ||
    modulePackage.module.category === "corner_cabinet"
  );
}

function matchesKitchenMaterialFamily(material: MaterialDefinition, family: KitchenMaterialLookupFamily) {
  return material.materialType === "board" && material.isActive && material.boardFamily === family;
}

function findKitchenMaterialByExactId(catalog: ClientCatalog, family: KitchenMaterialLookupFamily, id: string) {
  const wanted = id.trim();
  if (!wanted) return null;
  const material = catalog.materials.find((item) => item.id === wanted) ?? null;
  return material && matchesKitchenMaterialFamily(material, family) ? material : null;
}

function findKitchenHandleByExactId(catalog: ClientCatalog, id: string) {
  const wanted = id.trim();
  if (!wanted) return null;
  const component = catalog.components.find((item) => item.id === wanted) ?? null;
  return component?.componentType === "handle" && component.isActive ? component : null;
}

async function lookupKitchenMaterialByExactId(catalog: ClientCatalog, family: KitchenMaterialLookupFamily, id: string) {
  const wanted = id.trim();
  if (!wanted) return null;
  try {
    const response = await fetch(`/api/catalog/lookup?kind=material&family=${encodeURIComponent(family)}&id=${encodeURIComponent(wanted)}`, {
      credentials: "same-origin"
    });
    if (response.ok) {
      const body = (await response.json()) as { material?: MaterialDefinition | null };
      if (body.material && matchesKitchenMaterialFamily(body.material, family)) return body.material;
    }
  } catch {
    // Local fallback keeps static/dev builds usable when the worker endpoint is not present.
  }
  return findKitchenMaterialByExactId(catalog, family, wanted);
}

async function lookupKitchenHandleByExactId(catalog: ClientCatalog, id: string) {
  const wanted = id.trim();
  if (!wanted) return null;
  try {
    const response = await fetch(`/api/catalog/lookup?kind=component&componentType=handle&id=${encodeURIComponent(wanted)}`, {
      credentials: "same-origin"
    });
    if (response.ok) {
      const body = (await response.json()) as { component?: ReturnType<typeof findKitchenHandleByExactId> };
      if (body.component?.componentType === "handle" && body.component.isActive) return body.component;
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
  };

  ensureLayoutMode: () => void;
  ensureFloorplanViewerTab: () => void;
  setToolSelect: () => void;
  cancelPlacementIfActive: () => void;
  addInstance: (type: ModuleParams["type"]) => void;
  rebuildInstance: (inst: LayoutInstance, opts?: { skipLayoutValidation?: boolean; skipLayoutPanelUpdate?: boolean }) => boolean;
  rebuildKitchenGroupLayout: (groupId: string, nextCtx: KitchenContext, prevCtx?: KitchenContext) => void;
  disposeObject3D: (obj: Object3D) => void;
  createInstance: (params: ModuleParams, opts?: { id?: string }) => LayoutInstance;
  findInstance: (id: string) => LayoutInstance | null;
  setSelectedModule: (id: string | null) => void;
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
    opts?: { skipHistory?: boolean }
  ) => void;
  rebuildGroupWorktops: (groupId: string, ctx: KitchenContext) => void;
  buildClassicTopbar: () => void;
  showKitchenTab: () => void;
  restoreStandardTopbar: () => void;
  refreshProps: () => void;
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

  let activeName = "";
  let snapshotName = "";
  let editingExistingGroupId: string | null = null;
  let kitchenCtxSnapshot: KitchenContext | null = null;
  let instanceSnapshots: GroupInstanceSnapshot[] = [];
  let worktopSnapshots: GroupWorktopSnapshot[] = [];

  const findKitchenGroup = (groupId: string | null) => {
    if (!groupId) return null;
    return args.S.kitchenGroups.find((group) => group.id === groupId) ?? null;
  };

  const getGroupInstanceIds = (groupId: string) => {
    return args.S.instances.filter((inst) => inst.kitchenGroupId === groupId).map((inst) => inst.id);
  };

  const captureGroupInstances = (groupId: string) => {
    return args.S.instances
      .filter((inst) => inst.kitchenGroupId === groupId)
      .map((inst) => ({
        id: inst.id,
        params: structuredClone(inst.params),
        position: { x: inst.root.position.x, y: inst.root.position.y, z: inst.root.position.z },
        rotationY: inst.root.rotation.y
      }));
  };

  const captureGroupWorktops = (groupId: string) => {
    return args.getGroupWorktops(groupId).map((worktop) => ({
      id: worktop.id,
      params: structuredClone(worktop.params)
    }));
  };

  const getNextKitchenName = () => {
    const base = "Kuchyňa";
    const used = new Set(args.S.kitchenGroups.map((group) => group.name.trim()).filter(Boolean));
    let index = 1;
    while (used.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
  };

  const rebuildGroupModules = (groupId: string, nextCtx: KitchenContext, prevCtx?: KitchenContext) => {
    args.rebuildKitchenGroupLayout(groupId, nextCtx, prevCtx);
  };

  const setInstanceInactivePreview = (inst: LayoutInstance, inactive: boolean) => {
    if (!!inst.root.userData.kitchenInactivePickDisabled === inactive) return;
    inst.root.userData.kitchenInactivePickDisabled = inactive || undefined;
  };

  const syncInactiveModulePreviews = () => {
    const activeGroupId = args.S.kitchenEditMode ? args.S.activeKitchenGroupId : null;
    for (const inst of args.S.instances) {
      setInstanceInactivePreview(inst, !!activeGroupId && inst.kitchenGroupId !== activeGroupId);
    }
  };

  const clearInactiveModulePreviews = () => {
    for (const inst of args.S.instances) setInstanceInactivePreview(inst, false);
  };

  const applyNormalGroupCtx = (groupId: string, next: KitchenContext, opts?: { refreshProps?: boolean }) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    const prevCtx = resolveContext(structuredClone(group.ctx));
    group.ctx = resolveContext(next);
    rebuildGroupModules(groupId, group.ctx, prevCtx);
    if (opts?.refreshProps !== false) args.refreshProps();
  };

  const applyActiveGroupCtx = (next: KitchenContext, opts?: { refreshProps?: boolean }) => {
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
    window.removeEventListener("keydown", escapeHandler, { capture: true } as AddEventListenerOptions);
    escapeHandler = null;
  };

  const addEscapeHandler = () => {
    removeEscapeHandler();
    escapeHandler = (ev: KeyboardEvent) => {
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

  const ensureKitchenEditSession = () => {
    if (args.S.kitchenEditMode) return;
    const selectedGroupId = args.getSelectedKitchenGroupId();
    if (selectedGroupId && findKitchenGroup(selectedGroupId)) {
      enterExisting(selectedGroupId);
      return;
    }
    enterNew();
  };

  const scheduleKitchenModulePrewarm = (modulePackages: readonly FurnQuoteModulePackage[]) => {
    const queue = modulePackages.filter((modulePackage) => !prewarmedModuleTypes.has(modulePackage.module.moduleType));
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
          type: modulePackage.module.moduleType
        } as ModuleParams;
        const inst = args.createInstance(params, { id: `prewarm_${modulePackage.module.moduleType}` });
        args.disposeObject3D(inst.root);
      } catch {
        // Prewarm should never interfere with normal editing.
      }
      prewarmTimer = window.setTimeout(runNext, 40);
    };

    prewarmTimer = window.setTimeout(runNext, 40);
  };

  const mountTopbar = (row: HTMLElement) => {
    const groupTools = args.tb.addGroup(t("Kitchen group"), { row });
    if (args.S.kitchenEditMode) {
      args.tb.toolButton(groupTools, {
        title: t("Accept group"),
        iconSvg: args.icons.done,
        label: t("Accept"),
        variant: "success",
        onClick: () => exitFinish()
      });
      args.tb.toolButton(groupTools, {
        title: t("Discard"),
        iconSvg: args.icons.cancel,
        label: t("Discard"),
        variant: "danger",
        onClick: () => exitDiscard()
      });
    } else {
      const selectedGroupId = args.getSelectedKitchenGroupId();
      if (selectedGroupId && findKitchenGroup(selectedGroupId)) {
        args.tb.toolButton(groupTools, {
          title: t("Edit group"),
          iconSvg: args.icons.done,
          label: t("Edit"),
          onClick: () => enterExisting(selectedGroupId)
        });
      }
      args.tb.toolButton(groupTools, {
        title: t("New group"),
        iconSvg: args.icons.cabinet,
        label: t("New"),
        onClick: () => enterNew()
      });
    }

    const modulesByVisualRole = {
      low: [] as FurnQuoteModulePackage[],
      top: [] as FurnQuoteModulePackage[],
      tall: [] as FurnQuoteModulePackage[]
    };
    const kitchenModulePackages: FurnQuoteModulePackage[] = [];
    for (const modulePackage of getEnabledModulePackageDefinitions(args.catalog, args.modulePackages ?? [])) {
      if (!isKitchenRibbonModule(modulePackage)) continue;
      kitchenModulePackages.push(modulePackage);
      const defaultRole = getPackageDefaultValue(modulePackage, "kitchenModuleRole");
      const rawRole = typeof defaultRole === "string" ? defaultRole.trim().toLowerCase() : "";
      if (rawRole === "tall") {
        modulesByVisualRole.tall.push(modulePackage);
        continue;
      }
      if (rawRole === "top" || rawRole === "upper" || rawRole === "wall" || modulePackage.module.category === "wall_cabinet") {
        modulesByVisualRole.top.push(modulePackage);
        continue;
      }
      if (modulePackage.module.category === "tall_cabinet") {
        modulesByVisualRole.tall.push(modulePackage);
        continue;
      }
      modulesByVisualRole.low.push(modulePackage);
    }

    const addModule = (title: string, label: string, type: ModuleParams["type"]) => {
      return (toolsEl: HTMLElement) =>
        args.tb.toolButton(toolsEl, {
        title,
        iconSvg: args.icons.cabinet,
        label,
        onClick: () => {
          ensureKitchenEditSession();
          args.ensureLayoutMode();
          args.ensureFloorplanViewerTab();
          args.handleWorktopEscape();
          args.setToolSelect();
          args.addInstance(type);
        }
        });
    };

    const addModuleGroup = (groupLabel: string, modulePackages: FurnQuoteModulePackage[]) => {
      if (modulePackages.length === 0) return;
      const groupEl = args.tb.addGroup(groupLabel, { row });
      for (const modulePackage of modulePackages) {
        addModule(
          modulePackage.module.moduleType,
          modulePackage.module.displayName,
          modulePackage.module.moduleType as ModuleParams["type"]
        )(groupEl);
      }
    };

    addModuleGroup(t("Low"), modulesByVisualRole.low);
    addModuleGroup(t("Top"), modulesByVisualRole.top);
    addModuleGroup(t("Tall"), modulesByVisualRole.tall);

    const worktopsGroup = args.tb.addGroup(t("Worktops"), { row });
    args.tb.toolButton(worktopsGroup, {
      title: t("Draw worktop"),
      iconSvg: args.icons.worktop,
      label: t("Draw"),
      onClick: () => {
        ensureKitchenEditSession();
        args.ensureLayoutMode();
        args.cancelPlacementIfActive();
        args.startWorktopDraw();
      }
    });
    scheduleKitchenModulePrewarm(kitchenModulePackages);
  };

  const beginEdit = (groupId: string, name: string, ctx: KitchenContext, existingGroupId: string | null) => {
    args.ensureLayoutMode();
    args.cancelPlacementIfActive();
    args.setToolSelect();

    activeName = name;
    snapshotName = name;
    editingExistingGroupId = existingGroupId;
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
    args.setSelectedModule(null);
  };

  const enterNew = () => {
    beginEdit("kg_" + Date.now(), getNextKitchenName(), args.S.kitchenCtx, null);
  };

  const enterExisting = (groupId: string) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    beginEdit(group.id, group.name, group.ctx, group.id);
  };

  const exitCommon = () => {
    flushPendingCtx();
    clearInactiveModulePreviews();
    args.S.kitchenEditMode = false;
    args.S.activeKitchenGroupId = null;
    activeName = "";
    snapshotName = "";
    editingExistingGroupId = null;
    kitchenCtxSnapshot = null;
    instanceSnapshots = [];
    worktopSnapshots = [];
    args.cancelWorktopDraw({ silent: true });
    removeOverlay();
    removeEscapeHandler();
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
      instanceIds: getGroupInstanceIds(groupId)
    };

    const existing = editingExistingGroupId ? findKitchenGroup(editingExistingGroupId) : null;
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
    const snapshotIds = new Set(instanceSnapshots.map((snapshot) => snapshot.id));

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
        inst = args.createInstance(structuredClone(snapshot.params), { id: snapshot.id });
        inst.kitchenGroupId = groupId;
        inst.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
        inst.root.rotation.y = snapshot.rotationY;
        args.layoutRoot.add(inst.root);
        args.S.instances.push(inst);
      }
      inst.params = structuredClone(snapshot.params);
      inst.kitchenGroupId = groupId;
      inst.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      inst.root.rotation.y = snapshot.rotationY;
      args.rebuildInstance(inst);
      inst.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
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
      args.replaceGroupWorktops(groupId, worktopSnapshots, { skipHistory: true });
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
      const role = getKitchenModuleRole(inst.params as Record<string, unknown>) ?? "free";
      const rotation = inst.root.rotation.y;
      const widthDir = new THREE.Vector3(Math.cos(rotation), 0, -Math.sin(rotation)).normalize();
      const frontDir = new THREE.Vector3(Math.sin(rotation), 0, Math.cos(rotation)).normalize();
      const centerAlong = inst.root.position.dot(widthDir);
      const centerFront = inst.root.position.dot(frontDir);
      const widthMm = Math.max(1, Number((inst.params as Record<string, unknown>).width ?? (inst.params as Record<string, unknown>).widthMm ?? 0));
      const key = [
        role,
        Math.round(rotation * 100) / 100,
        Math.round(centerFront * 100),
        Math.round(inst.root.position.y * 100)
      ].join("|");
      const list = grouped.get(key) ?? [];
      list.push({
        start: centerAlong - widthMm / 2000,
        end: centerAlong + widthMm / 2000
      });
      grouped.set(key, list);
    }

    return Array.from(grouped.entries()).map(([key, intervals], index) => {
      intervals.sort((a, b) => a.start - b.start);
      let maxGapMm = 0;
      let maxOverlapMm = 0;
      for (let itemIndex = 1; itemIndex < intervals.length; itemIndex += 1) {
        const deltaMm = Math.round((intervals[itemIndex]!.start - intervals[itemIndex - 1]!.end) * 1000);
        if (deltaMm > maxGapMm) maxGapMm = deltaMm;
        if (deltaMm < 0) maxOverlapMm = Math.max(maxOverlapMm, Math.abs(deltaMm));
      }
      const role = key.split("|")[0] ?? "run";
      return {
        label: `${role} ${index + 1}`,
        state: maxOverlapMm > 1 ? `overlap ${maxOverlapMm} mm` : maxGapMm > 1 ? `gap ${maxGapMm} mm` : "OK",
        ok: maxOverlapMm <= 1 && maxGapMm <= 1
      };
    });
  };

  const mountKitchenGroupProps = (groupId: string) => {
    const isEditingActive = args.S.kitchenEditMode && args.S.activeKitchenGroupId === groupId;
    const group = findKitchenGroup(groupId);
    const ctx = isEditingActive ? args.S.kitchenCtx : group?.ctx ?? null;
    const currentName = isEditingActive ? activeName : group?.name ?? "";
    if (!ctx) return false;

    args.props.setTitle(t("Kitchen"));
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

    const commitCtx = (buildNext: (base: KitchenContext) => KitchenContext, opts?: { refreshProps?: boolean }) => {
      if (isEditingActive) {
        pendingActiveCtx = resolveContext(buildNext(pendingActiveCtx ?? args.S.kitchenCtx));
        schedulePendingCtxFlush();
        return;
      }
      if (!group) return;
      pendingNormalCtx.set(group.id, resolveContext(buildNext(pendingNormalCtx.get(group.id) ?? group.ctx)));
      schedulePendingCtxFlush();
    };

    const addNumberRow = (label: string, value: number, onCommit: (value: number, refreshProps: boolean) => void) => {
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

    addNumberRow(translateParamLabel("heightMm"), ctx.heightMm, (value, refreshProps) => commitCtx((base) => ({ ...base, heightMm: value }), { refreshProps }));
    addNumberRow(translateParamLabel("worktopDepthMm"), ctx.worktopDepthMm, (value, refreshProps) => commitCtx((base) => ({ ...base, worktopDepthMm: value }), { refreshProps }));
    addNumberRow(
      translateParamLabel("worktopFrontOffsetMm"),
      ctx.worktopFrontOffsetMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, worktopFrontOffsetMm: value }), { refreshProps })
    );
    addNumberRow(
      translateParamLabel("worktopBackOffsetMm"),
      ctx.worktopBackOffsetMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, worktopBackOffsetMm: value }), { refreshProps })
    );
    addNumberRow(
      translateParamLabel("upperStartHeightMm"),
      ctx.upperStartHeightMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, upperStartHeightMm: value }), { refreshProps })
    );
    addNumberRow(
      translateParamLabel("upperDepthMm"),
      ctx.upperDepthMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, upperDepthMm: value }), { refreshProps })
    );
    addNumberRow(
      translateParamLabel("upperHeightMm"),
      ctx.upperHeightMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, upperHeightMm: value }), { refreshProps })
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
      onChange: (id: string) => void
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
        const material = findKitchenMaterialByExactId(args.catalog, family, input.value);
        status.textContent = material ? material.displayName : "Type exact catalog material ID.";
        status.style.color = material ? "" : "#92400e";
      };
      const commit = async () => {
        status.textContent = "Looking up exact catalog ID...";
        status.style.color = "";
        const material = await lookupKitchenMaterialByExactId(args.catalog, family, input.value);
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

    const makeHandleLookupInput = (value: string, onChange: (id: string) => void) => {
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
        status.textContent = component ? component.displayName : "Type exact catalog handle ID.";
        status.style.color = component ? "" : "#92400e";
      };
      const commit = async () => {
        status.textContent = "Looking up exact catalog ID...";
        status.style.color = "";
        const component = await lookupKitchenHandleByExactId(args.catalog, input.value);
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
      makeMaterialLookupInput("front", ctx.frontsMaterialId, (id) => commitCtx((base) => ({ ...base, frontsMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("corpusMaterialId"),
      makeMaterialLookupInput("body", ctx.corpusMaterialId, (id) => commitCtx((base) => ({ ...base, corpusMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("backMaterialId"),
      makeMaterialLookupInput("back", ctx.backMaterialId, (id) => commitCtx((base) => ({ ...base, backMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("drawerBottomMaterialId"),
      makeMaterialLookupInput(
        "drawer_bottom",
        ctx.drawerBottomMaterialId,
        (id) => commitCtx((base) => ({ ...base, drawerBottomMaterialId: id }))
      )
    );
    args.props.row(
      section,
      translateParamLabel("worktopMaterialId"),
      makeMaterialLookupInput(
        "worktop",
        ctx.worktopMaterialId,
        (id) =>
          commitCtx((base) => ({
            ...base,
            worktopMaterialId: id,
            worktopThicknessMm: resolveKitchenWorktopThickness(id, base.worktopThicknessMm, args.catalog)
          }))
      )
    );
    args.props.row(
      section,
      translateParamLabel("handleComponentId"),
      makeHandleLookupInput(ctx.handleComponentId, (id) => commitCtx((base) => ({ ...base, handleComponentId: id })))
    );

    const worktopThicknessSelect = document.createElement("select");
    const worktopThicknessOptions = getKitchenWorktopThicknessOptions(ctx.worktopMaterialId, args.catalog);
    const resolvedWorktopThickness = resolveKitchenWorktopThickness(ctx.worktopMaterialId, ctx.worktopThicknessMm, args.catalog);
    worktopThicknessSelect.innerHTML = worktopThicknessOptions
      .map((value) => `<option value="${value}">${value} mm</option>`)
      .join("");
    worktopThicknessSelect.value = String(resolvedWorktopThickness);
    worktopThicknessSelect.addEventListener("change", () => {
      const next = Number(worktopThicknessSelect.value);
      if (!Number.isFinite(next)) return;
      commitCtx((base) => ({
        ...base,
        worktopThicknessMm: resolveKitchenWorktopThickness(base.worktopMaterialId, next, args.catalog)
      }));
    });
    args.props.row(section, translateParamLabel("worktopThicknessMm"), worktopThicknessSelect);
    addNumberRow(
      translateParamLabel("plinthHeightMm"),
      ctx.plinthHeightMm,
      (value, refreshProps) => commitCtx((base) => ({ ...base, plinthHeightMm: value }), { refreshProps })
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
    exitFinish,
    exitDiscard,
    mountTopbar,
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
      return inst.kitchenGroupId === activeGroupId ? id : null;
    },
    mountKitchenGroupProps,
    tryMountActiveKitchenGroupProps() {
      const groupId = args.S.activeKitchenGroupId;
      if (!args.S.kitchenEditMode || !groupId) return false;
      return mountKitchenGroupProps(groupId);
    },
    flushPendingContext: flushPendingCtx
  };
}
