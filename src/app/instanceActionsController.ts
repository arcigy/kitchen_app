import * as THREE from "three";
import { buildModule } from "../geometry/buildModule";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ModuleParams } from "../model/cabinetTypes";
import type { AppState } from "../layout/appState";
import { disposeObject3D } from "../core/dispose";
import type { KitchenPlacementBinding, LayoutInstance } from "./localTypes";
import { moduleRootLocalBox, tagModuleGeometry } from "./moduleVisualGeometry";

type InstanceActionsContext = {
  S: AppState;
  instances: LayoutInstance[];
  layoutRoot: THREE.Group;
  clientCatalog: ClientCatalog;
  getMode: () => "build" | "layout";
  getInstanceCounter: () => number;
  setInstanceCounter: (next: number) => void;
  findInstance: (id: string) => LayoutInstance | null;
  getSelectedInstanceId: () => string | null;
  ensurePickAndOutline: (inst: LayoutInstance) => void;
  placeWithoutOverlap: (inst: LayoutInstance) => void;
  inferKitchenPlacementBinding: (
    inst: LayoutInstance,
    groupId: string,
    worktopBackOffsetMm: number
  ) => KitchenPlacementBinding | null;
  setSelectedModule: (id: string | null) => void;
  updateLayoutPanel: () => void;
};

export function createInstanceActionsController(ctx: InstanceActionsContext) {
  const reserveInstanceId = (requestedId?: string) => {
    const currentCounter = ctx.getInstanceCounter();
    const id = requestedId ?? `m${currentCounter}`;
    ctx.setInstanceCounter(currentCounter + (requestedId ? 0 : 1));

    if (requestedId) {
      const match = /^m(\d+)$/.exec(id);
      const numericId = match ? Number(match[1]) : NaN;
      if (Number.isFinite(numericId) && numericId >= ctx.getInstanceCounter()) {
        ctx.setInstanceCounter(numericId + 1);
      }
    }

    return id;
  };

  const createEmptyGeometry = () =>
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);

  const createInstance = (nextParams: ModuleParams, opts?: { id?: string }) => {
    const id = reserveInstanceId(opts?.id);
    const root = new THREE.Group();
    root.name = `module_${id}`;

    const module = buildModule(nextParams, ctx.clientCatalog);
    module.name = `moduleGeom_${id}`;
    tagModuleGeometry(module, id);
    root.add(module);

    const localBox = moduleRootLocalBox(root, module);

    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), pickMat);
    pick.name = `pick_${id}`;
    pick.userData.kind = "module";
    pick.userData.instanceId = id;
    root.add(pick);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x525c70,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false
    });
    const outline = new THREE.LineSegments(createEmptyGeometry(), lineMat);
    outline.name = `outline_${id}`;
    outline.visible = true;
    outline.userData.kind = "modulePlan";
    outline.userData.instanceId = id;
    outline.renderOrder = 58;
    root.add(outline);

    const inst: LayoutInstance = {
      id,
      params: nextParams,
      kitchenGroupId: null,
      kitchenPlacement: null,
      root,
      module,
      localBox,
      pick,
      outline
    };
    ctx.ensurePickAndOutline(inst);
    return inst;
  };

  const duplicateInstance = (id: string) => {
    if (ctx.getMode() !== "layout") return;
    const inst = ctx.findInstance(id);
    if (!inst) return;
    const clonedParams = structuredClone(inst.params) as ModuleParams;
    const next = createInstance(clonedParams);
    next.kitchenGroupId = ctx.S.kitchenEditMode ? ctx.S.activeKitchenGroupId : null;
    next.root.position.copy(inst.root.position).add(new THREE.Vector3(0.2, 0, 0.2));
    ctx.layoutRoot.add(next.root);
    ctx.instances.push(next);
    ctx.placeWithoutOverlap(next);
    if (next.kitchenGroupId) {
      const group = ctx.S.kitchenGroups.find((item) => item.id === next.kitchenGroupId) ?? null;
      next.kitchenPlacement = ctx.inferKitchenPlacementBinding(
        next,
        next.kitchenGroupId,
        group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm
      );
    }
    ctx.setSelectedModule(next.id);
    ctx.updateLayoutPanel();
  };

  const deleteInstance = (id: string) => {
    if (ctx.getMode() !== "layout") return;
    const idx = ctx.instances.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const inst = ctx.instances[idx];
    if (ctx.getSelectedInstanceId() === id) ctx.setSelectedModule(null);
    ctx.layoutRoot.remove(inst.root);
    disposeObject3D(inst.root);
    ctx.instances.splice(idx, 1);
    ctx.updateLayoutPanel();
  };

  return {
    createInstance,
    duplicateInstance,
    deleteInstance
  };
}
