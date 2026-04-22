import type { AppState, KitchenPlacementBinding, LayoutInstance } from "./appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { getModuleDescriptorOrThrow } from "../modules/registry";
import { commitHistory } from "./historyManager";
import { applyKitchenContextToModuleParams } from "./kitchenMaterialSync";

type PropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};

export interface PlacementHelpers {
  props: PropsApi;
  layoutRoot: any;
  setUnderlayStatus: (text: string) => void;
  getBuildParams: (type: ModuleParams["type"]) => ModuleParams | null;
  createInstance: (params: ModuleParams, opts?: { id?: string }) => LayoutInstance;
  disposeObject3D: (obj: any) => void;
  updateLayoutPanel: () => void;
  mountProps: () => void;
  setSelectedModule: (id: string | null) => void;

  applyWallConstraints: (moving: LayoutInstance, desired: any) => any;
  roomContainsBoxXZ: (box: any) => boolean;
  instanceWorldBox: (inst: LayoutInstance) => any;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (moving: LayoutInstance) => boolean;
  autoOrientModuleToRoomWallIfSnapped: (inst: LayoutInstance) => void;
  resolvePlacementConstraint?: (
    ghost: LayoutInstance,
    cursorWorld: any
  ) => {
    position: any;
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

export const rebuildGhost = (S: AppState, helpers: PlacementHelpers, cursorWorld: any) => {
  if (!S.placement.active || !S.placement.params) return;

  S.placement.lastCursor.copy(cursorWorld);

  if (!S.placement.ghost) {
    const ghost = helpers.createInstance(structuredClone(S.placement.params) as ModuleParams, { id: "ghost" });
    ghost.root.name = "placementGhost";
    ghost.module.visible = false;
    (ghost.pick.material as any).transparent = true;
    (ghost.pick.material as any).opacity = 0;
    (ghost.pick.material as any).depthWrite = false;
    ghost.pick.visible = false;
    ghost.outline.visible = true;
    (ghost.outline.material as any).transparent = true;
    (ghost.outline.material as any).opacity = 0.9;
    helpers.layoutRoot.add(ghost.root);
    S.placement.ghost = ghost;
  }

  const g = S.placement.ghost;
  if (!g) return;

  const constrainedPlacement = helpers.resolvePlacementConstraint?.(g, cursorWorld) ?? null;
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
      g.root.position.copy(helpers.applyWallConstraints(g, desired));
      g.root.updateMatrixWorld(true);
    };

    placeWithBottomLeftAtCursor();
    helpers.autoOrientModuleToRoomWallIfSnapped(g);
    placeWithBottomLeftAtCursor();
  }

  const shouldCheckRoomBounds = constrainedPlacement?.enforceRoomBounds ?? true;
  const shouldCheckWallOverlap = constrainedPlacement?.enforceWallOverlap ?? true;
  const inRoom = shouldCheckRoomBounds ? helpers.roomContainsBoxXZ(helpers.instanceWorldBox(g)) : true;
  const overlaps =
    helpers.anyOverlap(g, null) || (shouldCheckWallOverlap ? helpers.moduleOverlapsWalls(g) : false);
  const ok = inRoom && !overlaps && (constrainedPlacement?.valid ?? true);
  S.placement.ghostValid = ok;

  (g.outline.material as any).color.setHex(ok ? 0x3ddc97 : 0xff6b6b);
  if (constrainedPlacement?.statusText) {
    helpers.setUnderlayStatus(constrainedPlacement.statusText);
  }
};

export const commitPlacement = (S: AppState, helpers: PlacementHelpers) => {
  if (!S.placement.active || !S.placement.params || !S.placement.ghost) return false;
  if (!S.placement.ghostValid) {
    helpers.setUnderlayStatus("Placement: invalid (overlap/outside). Move cursor.");
    return false;
  }

  const ghost = S.placement.ghost;
  const nextParams = structuredClone(S.placement.params) as ModuleParams;
  const constrainedPlacement = helpers.resolvePlacementConstraint?.(ghost, S.placement.lastCursor) ?? null;

  const inst = helpers.createInstance(nextParams);
  inst.kitchenGroupId = S.kitchenEditMode ? S.activeKitchenGroupId : null;
  inst.kitchenPlacement = constrainedPlacement?.kitchenPlacement ?? null;
  inst.root.position.copy(ghost.root.position);
  inst.root.rotation.y = ghost.root.rotation.y;

  inst.module.visible = true;
  inst.outline.visible = false;

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

  const nextParams = structuredClone(
    helpers.getBuildParams(type) ?? getModuleDescriptorOrThrow(type).defaultParams()
  ) as ModuleParams;

  if (S.kitchenEditMode && S.activeKitchenGroupId) {
    applyKitchenContextToModuleParams(nextParams, S.kitchenCtx);
  }

  S.placement.active = true;
  S.placement.params = nextParams;
  S.placement.ghostValid = false;

  helpers.setUnderlayStatus("Placement: move cursor, click to place. Esc cancels.");
  helpers.setSelectedModule(null);
  rebuildGhost(S, helpers, S.placement.lastCursor);
  mountPlacementControls(S, helpers);
};
