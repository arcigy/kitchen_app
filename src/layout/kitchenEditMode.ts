import * as THREE from "three";
import { getAllMaterials } from "../data/materials";
import type { AppState, LayoutInstance, KitchenGroup } from "./appState";
import { resolveContext, type KitchenContext } from "./kitchenContext";

type TopbarApi = {
  clear: () => void;
  addGroup: (title?: string) => HTMLElement;
  addSpacer: () => void;
  toolButton: (toolsEl: HTMLElement, args: { title: string; iconSvg: string; onClick?: () => void }) => HTMLButtonElement;
};

type PropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};

type CreateKitchenEditModeArgs = {
  S: AppState;
  scene: THREE.Scene;
  layoutRoot: THREE.Group;
  propertiesEl: HTMLElement;
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
  addInstance: (type: any) => void;
  rebuildInstance: (inst: LayoutInstance) => void;
  disposeObject3D: (obj: THREE.Object3D) => void;
  findInstance: (id: string) => LayoutInstance | null;
  setSelectedModule: (id: string | null) => void;
  updateLayoutPanel: () => void;
  restoreStandardTopbar: () => void;
};

export function createKitchenEditMode(args: CreateKitchenEditModeArgs) {
  let overlayEl: HTMLDivElement | null = null;
  let kitchenCtxSnapshot: KitchenContext | null = null;
  let activeName: string | null = null;
  let escapeHandler: ((ev: KeyboardEvent) => void) | null = null;

  const rebuildActiveGroupModules = () => {
    const id = args.S.activeKitchenGroupId;
    if (!id) return;
    for (const inst of args.S.instances) {
      if (inst.kitchenGroupId !== id) continue;
      inst.params.depth = args.S.kitchenCtx.moduleDepthMm;
      inst.params.height = args.S.kitchenCtx.moduleHeightMm;
      args.rebuildInstance(inst);
    }
  };

  const mountKitchenContextProps = () => {
    args.props.setTitle("Kitchen");
    const s = args.props.section();

    const numberRow = (label: string, value: number, onCommit: (next: number) => void) => {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.step = "1";
      inp.value = String(Math.round(value));
      args.props.row(s, label, inp);
      const commit = () => {
        const n = Number(String(inp.value).trim().replace(",", "."));
        if (!Number.isFinite(n)) return;
        onCommit(Math.round(n));
        inp.value = String(Math.round(n));
      };
      inp.addEventListener("change", commit);
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
      });
    };

    const applyCtx = (next: KitchenContext) => {
      args.S.kitchenCtx = resolveContext(next);
      rebuildActiveGroupModules();
    };

    numberRow("Height (mm)", args.S.kitchenCtx.heightMm, (v) => applyCtx({ ...args.S.kitchenCtx, heightMm: v }));
    numberRow("Worktop depth (mm)", args.S.kitchenCtx.worktopDepthMm, (v) => applyCtx({ ...args.S.kitchenCtx, worktopDepthMm: v }));
    numberRow("Worktop front offset (mm)", args.S.kitchenCtx.worktopFrontOffsetMm, (v) => applyCtx({ ...args.S.kitchenCtx, worktopFrontOffsetMm: v }));
    numberRow("Worktop back offset (mm)", args.S.kitchenCtx.worktopBackOffsetMm, (v) => applyCtx({ ...args.S.kitchenCtx, worktopBackOffsetMm: v }));
    numberRow("Worktop thickness (mm)", args.S.kitchenCtx.worktopThicknessMm, (v) => applyCtx({ ...args.S.kitchenCtx, worktopThicknessMm: v }));

    const materials = getAllMaterials();
    const makeMatSelect = (value: string, onChange: (id: string) => void) => {
      const sel = document.createElement("select");
      sel.innerHTML = materials.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
      sel.value = value;
      sel.addEventListener("change", () => onChange(sel.value));
      return sel;
    };

    args.props.row(
      s,
      "Face material",
      makeMatSelect(args.S.kitchenCtx.faceMaterialId, (id) => applyCtx({ ...args.S.kitchenCtx, faceMaterialId: id }))
    );
    args.props.row(
      s,
      "Corpus material",
      makeMatSelect(args.S.kitchenCtx.corpusMaterialId, (id) => applyCtx({ ...args.S.kitchenCtx, corpusMaterialId: id }))
    );
  };

  const removeOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };

  const removeKitchenEscapeHandler = () => {
    if (!escapeHandler) return;
    window.removeEventListener("keydown", escapeHandler, { capture: true } as any);
    escapeHandler = null;
  };

  const addKitchenEscapeHandler = () => {
    removeKitchenEscapeHandler();
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

    const gModules = args.tb.addGroup();
    const add = (title: string, type: any) => {
      args.tb.toolButton(gModules, {
        title,
        iconSvg: args.icons.cabinet,
        onClick: () => {
          args.ensureLayoutMode();
          args.setToolSelect();
          args.addInstance(type);
        }
      });
    };

    add("drawer", "drawer_low");
    add("nestedDrawer", "nested_drawer_low");
    add("shelves", "shelves");
    add("cornerShelf", "corner_shelf_lower");
    add("fridgeTall", "fridge_tall");
    add("flapShelves", "flap_shelves_low");
    add("swingShelves", "swing_shelves_low");
    add("ovenBase", "oven_base_low");
    add("microwaveOvenTall", "microwave_oven_tall");
    add("topDrawersDoors", "top_drawers_doors_low");

    args.tb.addSpacer();

    const gExit = args.tb.addGroup();
    const finishBtn = args.tb.toolButton(gExit, { title: "Dokončiť kuchyňu", iconSvg: args.icons.done, onClick: () => exitFinish() });
    finishBtn.style.color = "#22c55e";
    finishBtn.style.borderColor = "rgba(34,197,94,0.55)";
    finishBtn.style.background = "rgba(34,197,94,0.10)";
    const cancelBtn = args.tb.toolButton(gExit, { title: "Zrušiť", iconSvg: args.icons.cancel, onClick: () => exitDiscard() });
    cancelBtn.style.color = "#ef4444";
    cancelBtn.style.borderColor = "rgba(239,68,68,0.55)";
    cancelBtn.style.background = "rgba(239,68,68,0.10)";
  };

  const createOverlay = () => {
    removeOverlay();
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.background = "rgba(59,130,246,0.08)";
    el.style.pointerEvents = "none";
    el.style.zIndex = "10";
    document.body.appendChild(el);
    overlayEl = el;
  };

  const enter = () => {
    const name = prompt("Názov kuchyne:", "Kuchyňa 1");
    if (name === null) return;

    const id = "kg_" + Date.now();

    args.ensureLayoutMode();
    args.cancelPlacementIfActive();
    args.setToolSelect();

    kitchenCtxSnapshot = structuredClone(args.S.kitchenCtx);
    activeName = name;
    args.S.kitchenEditMode = true;
    args.S.activeKitchenGroupId = id;

    createOverlay();
    buildKitchenTopbar();
    addKitchenEscapeHandler();
    args.setSelectedModule(null);
  };

  const finishGroupBoundingBox = (kitchenGroupId: string) => {
    const groupInstances = args.S.instances.filter((i) => i.kitchenGroupId === kitchenGroupId);
    if (groupInstances.length === 0) return;

    const box = new THREE.Box3();
    for (const inst of groupInstances) box.expandByObject(inst.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const geo = new THREE.BoxGeometry(Math.max(0.001, size.x), Math.max(0.001, size.y), Math.max(0.001, size.z));
    const mat = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.visible = false;
    mesh.userData.kind = "kitchenGroup";
    mesh.userData.kitchenGroupId = kitchenGroupId;
    args.scene.add(mesh);
  };

  const exitCommon = () => {
    args.S.kitchenEditMode = false;
    args.S.activeKitchenGroupId = null;
    activeName = null;
    kitchenCtxSnapshot = null;
    removeOverlay();
    removeKitchenEscapeHandler();
    args.restoreStandardTopbar();
    args.setSelectedModule(null);
    args.propertiesEl.innerHTML = "";
  };

  const exitFinish = () => {
    if (!args.S.kitchenEditMode) return;

    args.cancelPlacementIfActive();

    const id = args.S.activeKitchenGroupId;
    if (id) {
      const name = activeName ?? "Kuchyňa";
      const group: KitchenGroup = {
        id,
        name,
        ctx: structuredClone(args.S.kitchenCtx),
        instanceIds: args.S.instances.filter((i) => i.kitchenGroupId === id).map((i) => i.id)
      };
      args.S.kitchenGroups.push(group);
      finishGroupBoundingBox(id);
    }

    exitCommon();
  };

  const exitDiscard = () => {
    if (!args.S.kitchenEditMode) return;

    args.cancelPlacementIfActive();

    if (kitchenCtxSnapshot) {
      args.S.kitchenCtx = resolveContext(structuredClone(kitchenCtxSnapshot));
    }

    const id = args.S.activeKitchenGroupId;
    if (id) {
      for (const inst of args.S.instances.filter((i) => i.kitchenGroupId === id)) {
        args.layoutRoot.remove(inst.root);
        args.disposeObject3D(inst.root);
      }
      for (let i = args.S.instances.length - 1; i >= 0; i--) {
        if (args.S.instances[i].kitchenGroupId === id) args.S.instances.splice(i, 1);
      }
      args.updateLayoutPanel();
    }

    exitCommon();
  };

  const filterSelectableInstanceId = (id: string | null) => {
    if (!id) return null;
    if (!args.S.kitchenEditMode) return id;
    const activeId = args.S.activeKitchenGroupId;
    if (!activeId) return null;
    const inst = args.findInstance(id);
    if (!inst) return null;
    return inst.kitchenGroupId === activeId ? id : null;
  };

  return {
    enter,
    exitFinish,
    exitDiscard,
    filterSelectableInstanceId,
    tryMountKitchenContextProps() {
      if (!args.S.kitchenEditMode) return false;
      if (!args.S.activeKitchenGroupId) return false;
      mountKitchenContextProps();
      return true;
    }
  };
}
