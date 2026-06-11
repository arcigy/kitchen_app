import * as THREE from "three";
import type { AppState, KitchenPlacementBinding, LayoutInstance } from "./appState";
import type { ModuleParams } from "../model/cabinetTypes";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { getEnabledModulePackageDefinitions } from "../core/catalog/module-catalog";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import {
  createModulePackageDefaultParams
} from "../core/module-package/runtime/module-runtime-adapter";
import type { ModuleAdjacencyLink } from "../app/moduleAdjacency";
import { commitHistory } from "./historyManager";
import { applyKitchenContextToModuleParams } from "./kitchenMaterialSync";
import type { EditorPropsApi } from "../app/editorModeApis";

function makeGhostMaterial(material: THREE.Material) {
  const ghostMaterial = material.clone();
  ghostMaterial.transparent = true;
  ghostMaterial.opacity = Math.min(ghostMaterial.opacity, 0.48);
  ghostMaterial.depthWrite = false;
  ghostMaterial.needsUpdate = true;
  return ghostMaterial;
}

function showGhostModulePreview(ghost: LayoutInstance) {
  ghost.module.visible = true;
  ghost.module.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(makeGhostMaterial)
      : makeGhostMaterial(object.material);
    object.renderOrder = Math.max(object.renderOrder, 40);
  });
}

export interface PlacementHelpers {
  props: EditorPropsApi;
  layoutRoot: THREE.Object3D;
  setUnderlayStatus: (text: string) => void;
  getBuildParams: (type: ModuleParams["type"]) => ModuleParams | null;
  createInstance: (params: ModuleParams, opts?: { id?: string }) => LayoutInstance;
  disposeObject3D: (obj: THREE.Object3D) => void;
  updateLayoutPanel: () => void;
  mountProps: () => void;
  setSelectedModule: (id: string | null) => void;

  applyWallConstraints: (moving: LayoutInstance, desired: THREE.Vector3) => THREE.Vector3;
  roomContainsBoxXZ: (box: THREE.Box3) => boolean;
  instanceWorldBox: (inst: LayoutInstance) => THREE.Box3;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (moving: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (moving: LayoutInstance) => boolean;
  autoOrientModuleToRoomWallIfSnapped: (inst: LayoutInstance) => void;
  resolveModuleAdjacencySnap?: (
    moving: LayoutInstance,
    desired: THREE.Vector3,
    opts?: { stickyNeighborId?: string | null; preferredKitchenPlacement?: KitchenPlacementBinding | null }
  ) => {
    position: THREE.Vector3;
    rotationY?: number;
    link: ModuleAdjacencyLink | null;
    kitchenPlacement?: KitchenPlacementBinding | null;
  } | null;
  setPlacementAdjacencyPreview?: (link: ModuleAdjacencyLink | null) => void;
  finalizePlacedInstance?: (inst: LayoutInstance) => void;
  syncPlacedInstancePresentation?: (inst: LayoutInstance) => void;
  catalog: ClientCatalog;
  modulePackages?: readonly FurnQuoteModulePackage[];
  resolvePlacementConstraint?: (
    ghost: LayoutInstance,
    cursorWorld: THREE.Vector3
  ) => {
    position: THREE.Vector3;
    rotationY: number;
    valid: boolean;
    kitchenPlacement?: KitchenPlacementBinding | null;
    statusText?: string;
    enforceRoomBounds?: boolean;
    enforceWallOverlap?: boolean;
  } | null;
}

export const cancelPlacement = (S: AppState, helpers: PlacementHelpers) => {
  if (!S.placement.active) return;

  helpers.setPlacementAdjacencyPreview?.(null);

  if (S.placement.ghost) {
    helpers.layoutRoot.remove(S.placement.ghost.root);
    helpers.disposeObject3D(S.placement.ghost.root);
  }
  S.placement.active = false;
  S.placement.params = null;
  S.placement.ghost = null;
  S.placement.ghostValid = false;
  S.placement.lastCursor.set(0, 0, 0);
  helpers.setUnderlayStatus("Placement: canceled.");
  helpers.mountProps();
};

export const rebuildGhost = (S: AppState, helpers: PlacementHelpers, cursorWorld: THREE.Vector3) => {
  if (!S.placement.active || !S.placement.params) return;

  S.placement.lastCursor.copy(cursorWorld);

  if (!S.placement.ghost) {
    const ghost = helpers.createInstance(structuredClone(S.placement.params) as ModuleParams, { id: "ghost" });
    ghost.root.name = "placementGhost";
    showGhostModulePreview(ghost);
    (ghost.pick.material as THREE.Material).transparent = true;
    (ghost.pick.material as THREE.Material).opacity = 0;
    (ghost.pick.material as THREE.Material).depthWrite = false;
    ghost.pick.visible = false;
    ghost.outline.visible = true;
    (ghost.outline.material as THREE.Material).transparent = true;
    (ghost.outline.material as THREE.Material).opacity = 0.9;
    (ghost.outline.material as THREE.Material).depthTest = false;
    helpers.layoutRoot.add(ghost.root);
    S.placement.ghost = ghost;
  }

  const g = S.placement.ghost;
  if (!g) return;
  const constrainedPlacement = helpers.resolvePlacementConstraint?.(g, cursorWorld) ?? null;
  let placementKitchenBinding = constrainedPlacement?.kitchenPlacement ?? null;
  if (constrainedPlacement) {
    g.root.rotation.y = constrainedPlacement.rotationY;
    g.root.position.copy(constrainedPlacement.position);
    g.root.updateMatrixWorld(true);
  } else {
    const placeWithBottomLeftAtCursor = () => {
      g.root.position.copy(cursorWorld);
      g.root.updateMatrixWorld(true);
      const box = helpers.instanceWorldBox(g);
      const desired = cursorWorld.clone();
      desired.x += cursorWorld.x - box.min.x;
      desired.z += cursorWorld.z - box.max.z;
      g.root.position.copy(desired);
      g.root.updateMatrixWorld(true);
    };

    placeWithBottomLeftAtCursor();
    helpers.autoOrientModuleToRoomWallIfSnapped(g);
    placeWithBottomLeftAtCursor();
  }
  g.kitchenPlacement = placementKitchenBinding ?? null;

  const adjacencySnap =
    helpers.resolveModuleAdjacencySnap?.(g, g.root.position.clone(), {
      preferredKitchenPlacement: placementKitchenBinding ?? g.kitchenPlacement ?? null
    }) ?? null;
  if (adjacencySnap) {
    g.root.position.copy(adjacencySnap.position);
    if (typeof adjacencySnap.rotationY === "number") g.root.rotation.y = adjacencySnap.rotationY;
    g.root.updateMatrixWorld(true);
    placementKitchenBinding = adjacencySnap.kitchenPlacement ?? placementKitchenBinding;
    helpers.setPlacementAdjacencyPreview?.(adjacencySnap.link);
  } else {
    helpers.setPlacementAdjacencyPreview?.(null);
  }

  const shouldCheckRoomBounds = constrainedPlacement?.enforceRoomBounds ?? true;
  const enforceRoomBounds = constrainedPlacement ? shouldCheckRoomBounds : false;
  const shouldCheckWallOverlap = constrainedPlacement?.enforceWallOverlap ?? true;
  const inRoom = enforceRoomBounds ? helpers.roomContainsBoxXZ(helpers.instanceWorldBox(g)) : true;
  const overlaps =
    helpers.anyOverlap(g, null) ||
    helpers.moduleOverlapsKitchenWorktops(g) ||
    (shouldCheckWallOverlap ? helpers.moduleOverlapsWalls(g) : false);
  const ok = inRoom && !overlaps && (constrainedPlacement?.valid ?? true);
  S.placement.ghostValid = ok;

  (g.outline.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x3ddc97 : 0xff6b6b);
  if (constrainedPlacement?.statusText) {
    helpers.setUnderlayStatus(constrainedPlacement.statusText);
  }
};

export const commitPlacement = (S: AppState, helpers: PlacementHelpers) => {
  if (!S.placement.active || !S.placement.params || !S.placement.ghost) return false;
  if (!S.placement.ghostValid) {
    helpers.setUnderlayStatus("Placement: invalid (overlap/constraint). Move cursor.");
    return false;
  }

  const ghost = S.placement.ghost;
  const nextParams = structuredClone(S.placement.params) as ModuleParams;
  const constrainedPlacement = helpers.resolvePlacementConstraint?.(ghost, S.placement.lastCursor) ?? null;

  const inst = helpers.createInstance(nextParams);
  inst.kitchenGroupId = S.kitchenEditMode ? S.activeKitchenGroupId : null;
  inst.kitchenPlacement = ghost.kitchenPlacement ?? constrainedPlacement?.kitchenPlacement ?? null;
  inst.root.position.copy(ghost.root.position);
  inst.root.rotation.y = ghost.root.rotation.y;
  helpers.finalizePlacedInstance?.(inst);

  inst.module.visible = true;
  inst.outline.visible = false;
  helpers.syncPlacedInstancePresentation?.(inst);

  helpers.layoutRoot.add(inst.root);
  S.instances.push(inst);

  cancelPlacement(S, helpers);

  helpers.setSelectedModule(inst.id);
  helpers.updateLayoutPanel();
  commitHistory(S);
  helpers.setUnderlayStatus("Placement: placed.");
  return true;
};

export const mountPlacementControls = (S: AppState, helpers: PlacementHelpers) => {
  if (!S.placement.active || !S.placement.params) return;

  helpers.props.setTitle("Place module");
  const s = helpers.props.section();

  const kind = document.createElement("div");
  kind.className = "muted";
  kind.textContent = `Type: ${S.placement.params.type}`;
  s.appendChild(kind);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.style.marginTop = "10px";
  s.appendChild(actions);

  const rotL = document.createElement("button");
  rotL.type = "button";
  rotL.textContent = "Rotate -90°";
  actions.appendChild(rotL);

  const rotR = document.createElement("button");
  rotR.type = "button";
  rotR.textContent = "Rotate +90°";
  actions.appendChild(rotR);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel (Esc)";
  actions.appendChild(cancel);

  const commit = document.createElement("button");
  commit.type = "button";
  commit.textContent = "Place (Click plan)";
  actions.appendChild(commit);

  const hint = document.createElement("div");
  hint.className = "muted";
  hint.style.marginTop = "8px";
  hint.textContent = "Move cursor in 2D plan. Click to place. Esc to cancel.";
  s.appendChild(hint);

  const applyRot = (delta: number) => {
    const g = S.placement.ghost;
    if (!g) return;
    g.root.rotation.y += delta;
    rebuildGhost(S, helpers, S.placement.lastCursor);
  };

  rotL.addEventListener("click", () => applyRot(-Math.PI / 2));
  rotR.addEventListener("click", () => applyRot(Math.PI / 2));
  cancel.addEventListener("click", () => cancelPlacement(S, helpers));
  commit.addEventListener("click", () => commitPlacement(S, helpers));
};

export const addInstance = (S: AppState, helpers: PlacementHelpers, type: ModuleParams["type"]) => {
  if (S.placement.active) cancelPlacement(S, helpers);

  const modulePackage = getEnabledModulePackageDefinitions(helpers.catalog, helpers.modulePackages ?? [])
    .find((candidate) => candidate.module.moduleType === type) ?? null;
  if (!modulePackage) {
    helpers.setUnderlayStatus(`Placement: module package missing or disabled for ${type}.`);
    return;
  }

  const defaults = createModulePackageDefaultParams({ modulePackage, catalog: helpers.catalog }) as ModuleParams;
  const nextParams = structuredClone(helpers.getBuildParams(type) ?? defaults) as ModuleParams;

  if (S.kitchenEditMode && S.activeKitchenGroupId) {
    applyKitchenContextToModuleParams(nextParams, S.kitchenCtx, helpers.catalog, modulePackage);
  }

  helpers.setSelectedModule(null);
  S.placement.active = true;
  S.placement.params = nextParams;
  S.placement.ghostValid = false;

  helpers.setUnderlayStatus("Placement: move cursor, click to place. Esc cancels.");
  rebuildGhost(S, helpers, S.placement.lastCursor);
  mountPlacementControls(S, helpers);
};
