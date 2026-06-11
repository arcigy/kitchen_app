import * as THREE from "three";
import type { Group, Object3D } from "three";
import type { ModuleParams } from "../model/cabinetTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { AppState, KitchenGroup, KitchenWorktopParams, LayoutInstance } from "./appState";
import { resolveContext, type KitchenContext } from "./kitchenContext";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import { getPackageDefaultValue } from "../core/module-package/module-package-catalog";
import {
  getKitchenBoardMaterialSelectOptions,
  getKitchenWorktopThicknessOptions,
  resolveKitchenWorktopThickness
} from "./kitchenMaterialSync";
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

const inactiveMaterialKey = "__kitchenInactiveOriginalMaterial";
const inactiveCloneKey = "__kitchenInactiveClone";
const inactivePreviewColor = new THREE.Color(0xf4f7fa);
const inactivePreviewOpacity = 0.24;

type MeshMaterial = THREE.Material | THREE.Material[];
type MaterialObject = Object3D & { material: MeshMaterial };

const getMaterialObject = (object: Object3D): MaterialObject | null => {
  const material = (object as { material?: unknown }).material;
  const hasMaterial =
    material instanceof THREE.Material ||
    (Array.isArray(material) && material.every((item) => item instanceof THREE.Material));
  return hasMaterial ? (object as MaterialObject) : null;
};

const cloneInactiveMaterial = (material: THREE.Material) => {
  const clone = material.clone();
  clone.transparent = true;
  clone.opacity = Math.min(material.opacity, inactivePreviewOpacity);
  clone.depthWrite = false;
  clone.userData[inactiveCloneKey] = true;
  const colorMaterial = clone as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
  if (colorMaterial.color instanceof THREE.Color) colorMaterial.color.lerp(inactivePreviewColor, 0.78);
  if (colorMaterial.emissive instanceof THREE.Color) colorMaterial.emissive.lerp(inactivePreviewColor, 0.5);
  clone.needsUpdate = true;
  return clone;
};

const forEachMaterial = (material: MeshMaterial, visit: (material: THREE.Material) => void) => {
  if (Array.isArray(material)) {
    material.forEach(visit);
    return;
  }
  visit(material);
};

const makeInactiveMaterial = (material: MeshMaterial): MeshMaterial =>
  Array.isArray(material) ? material.map(cloneInactiveMaterial) : cloneInactiveMaterial(material);

const disposeInactiveClones = (material: MeshMaterial) => {
  forEachMaterial(material, (item) => {
    if (item.userData[inactiveCloneKey]) item.dispose();
  });
};

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
  rebuildInstance: (inst: LayoutInstance, opts?: { skipLayoutValidation?: boolean }) => boolean;
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
    inst.root.userData.kitchenInactivePickDisabled = inactive || undefined;
    const setObjectInactivePreview = (object: Object3D) => {
      const target = getMaterialObject(object);
      if (!target) return;
      if (inactive) {
        if (target.userData[inactiveMaterialKey]) return;
        target.userData[inactiveMaterialKey] = target.material;
        target.material = makeInactiveMaterial(target.material);
        target.userData.kitchenInactivePreview = true;
        return;
      }

      const original = target.userData[inactiveMaterialKey] as MeshMaterial | undefined;
      if (!original) return;
      disposeInactiveClones(target.material);
      target.material = original;
      delete target.userData[inactiveMaterialKey];
      delete target.userData.kitchenInactivePreview;
    };
    inst.module.traverse(setObjectInactivePreview);
    setObjectInactivePreview(inst.outline);
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
    for (const modulePackage of getEnabledModulePackageDefinitions(args.catalog, args.modulePackages ?? [])) {
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

    rebuildGroupModules(groupId, args.S.kitchenCtx);
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
        applyActiveGroupCtx(buildNext(args.S.kitchenCtx), opts);
        return;
      }
      if (!group) return;
      applyNormalGroupCtx(group.id, buildNext(group.ctx), opts);
    };

    const addNumberRow = (label: string, value: number, onCommit: (value: number, refreshProps: boolean) => void) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.value = String(Math.round(value));
      args.props.row(section, label, input);
      const applyLive = (refreshProps: boolean) => {
        const next = Number(String(input.value).trim().replace(",", "."));
        if (!Number.isFinite(next)) return;
        onCommit(Math.round(next), refreshProps);
        if (refreshProps) input.value = String(Math.round(next));
      };
      input.addEventListener("input", () => applyLive(false));
      input.addEventListener("change", () => applyLive(true));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") applyLive(true);
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

    const makeMaterialSelect = (
      family: "front" | "body" | "back" | "drawer_bottom" | "worktop",
      value: string,
      onChange: (id: string) => void
    ) => {
      const select = document.createElement("select");
      const options = getKitchenBoardMaterialSelectOptions(family, args.catalog);
      select.innerHTML = options.map((material) => `<option value="${material.id}">${material.label}</option>`).join("");
      const selectedOption = options.find((material) => material.id === value);
      select.value = selectedOption?.id ?? options[0]?.id ?? "";
      select.addEventListener("change", () => onChange(select.value));
      return select;
    };

    const makeHandleSelect = (value: string, onChange: (id: string) => void) => {
      const select = document.createElement("select");
      const options = args.catalog.components.filter((component) => component.componentType === "handle" && component.isActive);
      select.innerHTML = options.map((handle) => `<option value="${handle.id}">${handle.displayName}</option>`).join("");
      select.value = options.find((handle) => handle.id === value)?.id ?? options[0]?.id ?? "";
      select.addEventListener("change", () => onChange(select.value));
      return select;
    };

    args.props.row(
      section,
      translateParamLabel("frontsMaterialId"),
      makeMaterialSelect("front", ctx.frontsMaterialId, (id) => commitCtx((base) => ({ ...base, frontsMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("corpusMaterialId"),
      makeMaterialSelect("body", ctx.corpusMaterialId, (id) => commitCtx((base) => ({ ...base, corpusMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("backMaterialId"),
      makeMaterialSelect("back", ctx.backMaterialId, (id) => commitCtx((base) => ({ ...base, backMaterialId: id })))
    );
    args.props.row(
      section,
      translateParamLabel("drawerBottomMaterialId"),
      makeMaterialSelect(
        "drawer_bottom",
        ctx.drawerBottomMaterialId,
        (id) => commitCtx((base) => ({ ...base, drawerBottomMaterialId: id }))
      )
    );
    args.props.row(
      section,
      translateParamLabel("worktopMaterialId"),
      makeMaterialSelect(
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
      makeHandleSelect(ctx.handleComponentId, (id) => commitCtx((base) => ({ ...base, handleComponentId: id })))
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
    }
  };
}
