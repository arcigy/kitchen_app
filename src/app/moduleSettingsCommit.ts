import * as THREE from "three";
import type { AppState, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { t } from "../i18n";

type CommitContext = {
  state: AppState;
  findInstance: (id: string) => LayoutInstance | null;
  rebuildInstance: (instance: LayoutInstance, options: { previousParams: ModuleParams; preserveBackAnchor: boolean }) => boolean;
  commitHistory: (state: AppState) => void;
};

/** Preserve both domain data and affected scene objects if a downstream rebuild fails. */
export function commitModuleSettingsToLayout(ctx: CommitContext, id: string, candidate: ModuleParams, baseline: ModuleParams): ModuleParams {
  const instance = ctx.findInstance(id);
  if (!instance || JSON.stringify(instance.params) !== JSON.stringify(baseline)) {
    throw new Error(t("The module changed outside this window. Reopen its settings."));
  }
  const instances = [...ctx.state.instances];
  const worktops = [...ctx.state.kitchenWorktops];
  const groups = structuredClone(ctx.state.kitchenGroups);
  const modules = instances.map((item) => ({ item, params: structuredClone(item.params), module: item.module,
    kitchenPlacement: structuredClone(item.kitchenPlacement), localBox: item.localBox.clone(), pick: item.pick, outline: item.outline }));
  const tops = worktops.map((item) => ({ item, params: structuredClone(item.params), mesh: item.mesh, outline: item.outline }));
  const roots = [...instances.map((item) => item.root), ...worktops.map((item) => item.root)];
  const parents = new Map(roots.map((root) => [root, root.parent]));
  const nodes = new Map<THREE.Object3D, {
    children: THREE.Object3D[]; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
    geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[];
  }>();
  for (const root of roots) root.traverse((node) => {
    nodes.set(node, { children: [...node.children], position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
      ...(node instanceof THREE.Mesh || node instanceof THREE.Line ? { geometry: node.geometry, material: node.material } : {}) });
  });
  try {
    instance.params = structuredClone(candidate);
    if (!ctx.rebuildInstance(instance, { previousParams: baseline, preserveBackAnchor: true })) {
      throw new Error(t("The module does not fit here. Adjust its dimensions and try again."));
    }
  } catch (error) {
    for (const current of [...ctx.state.instances, ...ctx.state.kitchenWorktops]) if (!parents.has(current.root)) current.root.removeFromParent();
    ctx.state.instances.splice(0, ctx.state.instances.length, ...instances);
    ctx.state.kitchenWorktops.splice(0, ctx.state.kitchenWorktops.length, ...worktops);
    ctx.state.kitchenGroups.splice(0, ctx.state.kitchenGroups.length, ...groups);
    for (const snapshot of modules) Object.assign(snapshot.item, { params: snapshot.params, module: snapshot.module,
      kitchenPlacement: snapshot.kitchenPlacement, localBox: snapshot.localBox, pick: snapshot.pick, outline: snapshot.outline });
    for (const snapshot of tops) Object.assign(snapshot.item, { params: snapshot.params, mesh: snapshot.mesh, outline: snapshot.outline });
    for (const [node, snapshot] of nodes) {
      node.clear(); if (snapshot.children.length) node.add(...snapshot.children);
      node.position.copy(snapshot.position); node.quaternion.copy(snapshot.quaternion); node.scale.copy(snapshot.scale);
      if ((node instanceof THREE.Mesh || node instanceof THREE.Line) && snapshot.geometry && snapshot.material) {
        node.geometry = snapshot.geometry; node.material = snapshot.material;
      }
    }
    for (const [root, parent] of parents) { if (parent) parent.add(root); root.updateMatrixWorld(true); }
    throw error;
  }
  ctx.commitHistory(ctx.state);
  return structuredClone(instance.params);
}
