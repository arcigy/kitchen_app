import type { Group, Object3D } from "three";
import type { ModuleParams } from "../model/cabinetTypes";
import { getAllMaterials } from "../data/materials";
import type { AppState, KitchenGroup, LayoutInstance } from "./appState";
import { resolveContext, type KitchenContext } from "./kitchenContext";

type TopbarApi = {
  clear: () => void;
  addRow: (args?: { title?: string; className?: string }) => HTMLElement;
  addGroup: (title?: string, args?: { row?: HTMLElement }) => HTMLElement;
  addSpacer: (args?: { row?: HTMLElement }) => void;
  toolButton: (
    toolsEl: HTMLElement,
    args: { title: string; iconSvg: string; label?: string; variant?: "success" | "danger"; onClick?: () => void }
  ) => HTMLButtonElement;
};

type PropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};

type GroupInstanceSnapshot = {
  id: string;
  params: ModuleParams;
  position: { x: number; y: number; z: number };
  rotationY: number;
};

type CreateKitchenEditModeArgs = {
  S: AppState;
  layoutRoot: Group;
  viewerEl: HTMLElement;
  tb: TopbarApi;
  props: PropsApi;

  icons: {
    cabinet: string;
    done: string;
    cancel: string;
  };

  ensureLayoutMode: () => void;
  setToolSelect: () => void;
  cancelPlacementIfActive: () => void;
  addInstance: (type: ModuleParams["type"]) => void;
  rebuildInstance: (inst: LayoutInstance) => void;
  disposeObject3D: (obj: Object3D) => void;
  createInstance: (params: ModuleParams, opts?: { id?: string }) => LayoutInstance;
  findInstance: (id: string) => LayoutInstance | null;
  setSelectedModule: (id: string | null) => void;
  updateLayoutPanel: () => void;
  buildClassicTopbar: () => void;
  restoreStandardTopbar: () => void;
};

export function createKitchenEditMode(args: CreateKitchenEditModeArgs) {
  let overlayEl: HTMLDivElement | null = null;
  let escapeHandler: ((ev: KeyboardEvent) => void) | null = null;

  let activeName = "";
  let snapshotName = "";
  let editingExistingGroupId: string | null = null;
  let kitchenCtxSnapshot: KitchenContext | null = null;
  let instanceSnapshots: GroupInstanceSnapshot[] = [];

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

  const rebuildGroupModules = (groupId: string, ctx: KitchenContext) => {
    for (const inst of args.S.instances) {
      if (inst.kitchenGroupId !== groupId) continue;
      inst.params.depth = ctx.moduleDepthMm;
      inst.params.height = ctx.moduleHeightMm;
      args.rebuildInstance(inst);
    }
    args.updateLayoutPanel();
  };

  const applyNormalGroupCtx = (groupId: string, next: KitchenContext) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    group.ctx = resolveContext(next);
    rebuildGroupModules(groupId, group.ctx);
  };

  const applyActiveGroupCtx = (next: KitchenContext) => {
    const groupId = args.S.activeKitchenGroupId;
    if (!groupId) return;
    args.S.kitchenCtx = resolveContext(next);
    rebuildGroupModules(groupId, args.S.kitchenCtx);
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
      if (!args.S.kitchenEditMode) return;
      ev.preventDefault();
      ev.stopPropagation();
      exitDiscard();
    };
    window.addEventListener("keydown", escapeHandler, { capture: true });
  };

  const buildKitchenTopbar = () => {
    args.tb.clear();
    args.buildClassicTopbar();

    const row = args.tb.addRow({ title: "Kitchen settings", className: "topbar-kitchen-ribbon" });
    const modulesGroup = args.tb.addGroup("Modules", { row });
    const addModule = (title: string, label: string, type: ModuleParams["type"]) => {
      args.tb.toolButton(modulesGroup, {
        title,
        iconSvg: args.icons.cabinet,
        label,
        onClick: () => {
          args.ensureLayoutMode();
          args.setToolSelect();
          args.addInstance(type);
        }
      });
    };

    addModule("drawer", "Drawer", "drawer_low");
    addModule("nestedDrawer", "Nested", "nested_drawer_low");
    addModule("shelves", "Shelves", "shelves");
    addModule("cornerShelf", "Corner", "corner_shelf_lower");
    addModule("fridgeTall", "Fridge tall", "fridge_tall");
    addModule("flapShelves", "Flap", "flap_shelves_low");
    addModule("swingShelves", "Swing", "swing_shelves_low");
    addModule("ovenBase", "Oven base", "oven_base_low");
    addModule("microwaveOvenTall", "Micro tall", "microwave_oven_tall");
    addModule("topDrawersDoors", "Top doors", "top_drawers_doors_low");

    args.tb.addSpacer({ row });

    const exitGroup = args.tb.addGroup("Group", { row });
    const finishBtn = args.tb.toolButton(exitGroup, {
      title: "Dokončiť kuchyňu",
      iconSvg: args.icons.done,
      label: "Finish",
      variant: "success",
      onClick: () => exitFinish()
    });
    void finishBtn;

    const cancelBtn = args.tb.toolButton(exitGroup, {
      title: "Zrušiť",
      iconSvg: args.icons.cancel,
      label: "Discard",
      variant: "danger",
      onClick: () => exitDiscard()
    });
    void cancelBtn;
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

    args.S.kitchenCtx = resolveContext(structuredClone(ctx));
    args.S.kitchenEditMode = true;
    args.S.activeKitchenGroupId = groupId;

    ensureOverlay();
    buildKitchenTopbar();
    addEscapeHandler();
    args.setSelectedModule(null);
  };

  const enterNew = () => {
    const name = prompt("Názov kuchyne:", "Kuchyňa 1");
    if (name === null) return;
    beginEdit("kg_" + Date.now(), name, args.S.kitchenCtx, null);
  };

  const enterExisting = (groupId: string) => {
    const group = findKitchenGroup(groupId);
    if (!group) return;
    beginEdit(group.id, group.name, group.ctx, group.id);
  };

  const exitCommon = () => {
    args.S.kitchenEditMode = false;
    args.S.activeKitchenGroupId = null;
    activeName = "";
    snapshotName = "";
    editingExistingGroupId = null;
    kitchenCtxSnapshot = null;
    instanceSnapshots = [];
    removeOverlay();
    removeEscapeHandler();
    args.restoreStandardTopbar();
    args.setSelectedModule(null);
  };

  const exitFinish = () => {
    if (!args.S.kitchenEditMode) return;

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

    args.props.setTitle("Kitchen");
    const section = args.props.section();

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = currentName;
    args.props.row(section, "Name", nameInput);
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

    const commitCtx = (buildNext: (base: KitchenContext) => KitchenContext) => {
      if (isEditingActive) {
        applyActiveGroupCtx(buildNext(args.S.kitchenCtx));
        return;
      }
      if (!group) return;
      applyNormalGroupCtx(group.id, buildNext(group.ctx));
    };

    const addNumberRow = (label: string, value: number, onCommit: (value: number) => void) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.value = String(Math.round(value));
      args.props.row(section, label, input);
      const commit = () => {
        const next = Number(String(input.value).trim().replace(",", "."));
        if (!Number.isFinite(next)) return;
        onCommit(Math.round(next));
        input.value = String(Math.round(next));
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
      });
    };

    addNumberRow("Height (mm)", ctx.heightMm, (value) => commitCtx((base) => ({ ...base, heightMm: value })));
    addNumberRow("Worktop depth (mm)", ctx.worktopDepthMm, (value) => commitCtx((base) => ({ ...base, worktopDepthMm: value })));
    addNumberRow("Worktop front offset (mm)", ctx.worktopFrontOffsetMm, (value) => commitCtx((base) => ({ ...base, worktopFrontOffsetMm: value })));
    addNumberRow("Worktop back offset (mm)", ctx.worktopBackOffsetMm, (value) => commitCtx((base) => ({ ...base, worktopBackOffsetMm: value })));
    addNumberRow("Worktop thickness (mm)", ctx.worktopThicknessMm, (value) => commitCtx((base) => ({ ...base, worktopThicknessMm: value })));

    const materials = getAllMaterials();
    const makeMaterialSelect = (value: string, onChange: (id: string) => void) => {
      const select = document.createElement("select");
      select.innerHTML = materials.map((material) => `<option value="${material.id}">${material.name}</option>`).join("");
      select.value = value;
      select.addEventListener("change", () => onChange(select.value));
      return select;
    };

    args.props.row(
      section,
      "Face material",
      makeMaterialSelect(ctx.faceMaterialId, (id) => commitCtx((base) => ({ ...base, faceMaterialId: id })))
    );
    args.props.row(
      section,
      "Corpus material",
      makeMaterialSelect(ctx.corpusMaterialId, (id) => commitCtx((base) => ({ ...base, corpusMaterialId: id })))
    );

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Upraviť kuchyňu";
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
