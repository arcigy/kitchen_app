import * as THREE from "three";
import type { AppState, LayoutSnapshot, DimensionParams, WallParams, ModuleParams, WallInstance, DimensionInstance } from "./appState";

export interface HistoryHelpers {
  setSelectedWall: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  setSelectedDimension: (id: string | null) => void;
  updateSelectionHighlights: () => void;
  updateDimensionSelectionHighlights: () => void;
  disposeDimensionInstance: (d: DimensionInstance) => void;
  disposeObject3D: (obj: THREE.Object3D) => void;
  createInstance: (params: ModuleParams, opts: { id?: string }) => any; // Return type to match your LayoutInstance
  createWallMesh: (a: THREE.Vector3, b: THREE.Vector3, thickness: number) => THREE.Mesh;
  rebuildWall: (inst: WallInstance) => void;
  createDimension: (a: any, b: any, offset: number, opts: { id?: string; skipHistory?: boolean }) => void;
  rebuildWallPlanMesh: () => void;
  updateAllDimensions: () => void;
  clearToolHud: () => void;
  mountProps: () => void;
  updateLayoutPanel: () => void;
  layoutRoot: THREE.Group;
}

export const snapshotSignature = (s: LayoutSnapshot) => {
  // Compact-ish signature to skip duplicates
  const w = s.walls
    .map((x) => `${x.id}:${x.params.aMm.x},${x.params.aMm.z}-${x.params.bMm.x},${x.params.bMm.z}:${x.params.thicknessMm}:${(x.params as any).justification ?? "center"}:${x.params.exteriorSign ?? 1}`)
    .join("|");
  const mods = (s.instances ?? [])
    .map((m) => `${m.id}:${m.params?.type ?? "?"}:${m.kitchenGroupId ?? ""}:${m.positionMm.x},${m.positionMm.z}:${Math.round((m.rotationYDeg ?? 0) * 10)}`)
    .join("|");
  const dims = (s.dimensions ?? [])
    .map((d) => `${d.id}:${d.a.wallId}:${d.a.wallLine}:${Math.round(d.a.t * 1000)}-${d.b.wallId}:${d.b.wallLine}:${Math.round(d.b.t * 1000)}:${Math.round(d.offsetM * 1000)}`)
    .join("|");
  const pins = `${s.pinnedWallIds.slice().sort().join(",")}#${s.pinnedInstanceIds.slice().sort().join(",")}#${s.underlayPinned ? 1 : 0}`;
  return `${s.wallCounter}:${s.instanceCounter}:${s.dimensionCounter}::${pins}::${w}::${mods}::${dims}`;
};

export const updateUndoRedoUi = (S: AppState) => {
  if (S.undoBtnEl) S.undoBtnEl.disabled = S.history.past.length === 0;
  if (S.redoBtnEl) S.redoBtnEl.disabled = S.history.future.length === 0;
};

export const restoreLayoutSnapshot = (S: AppState, helpers: HistoryHelpers, snap: LayoutSnapshot) => {
  // Clear selection visuals first
  helpers.setSelectedWall(null);
  helpers.setSelectedModule(null);
  helpers.setSelectedDimension(null);
  S.selectedWallIds.clear();
  S.selectedInstanceIds.clear();
  helpers.updateSelectionHighlights();

  // Clear dimensions
  for (const d of S.dimensions.splice(0, S.dimensions.length)) {
    helpers.layoutRoot.remove(d.root);
    helpers.disposeDimensionInstance(d);
  }

  // Clear wall roots
  for (const w of S.walls.splice(0, S.walls.length)) {
    helpers.layoutRoot.remove(w.root);
    helpers.disposeObject3D(w.root);
  }

  S.wallCounter = snap.wallCounter;
  S.instanceCounter = snap.instanceCounter ?? S.instanceCounter;
  S.dimensionCounter = snap.dimensionCounter ?? S.dimensionCounter;

  S.pinnedWallIds.clear();
  for (const id of snap.pinnedWallIds) S.pinnedWallIds.add(id);
  S.pinnedInstanceIds.clear();
  for (const id of snap.pinnedInstanceIds) S.pinnedInstanceIds.add(id);
  
  if(S.underlayState) {
     S.underlayState.pinned = !!snap.underlayPinned;
  }

  // Clear modules
  for (const inst of S.instances.splice(0, S.instances.length)) {
    helpers.layoutRoot.remove(inst.root);
    helpers.disposeObject3D(inst.root);
  }

  // Restore modules
  if (snap.instances && snap.instances.length > 0) {
    for (const m of snap.instances) {
      const inst = helpers.createInstance(JSON.parse(JSON.stringify(m.params)) as ModuleParams, { id: m.id });
      inst.kitchenGroupId = m.kitchenGroupId ?? null;
      inst.root.position.set(m.positionMm.x / 1000, 0, m.positionMm.z / 1000);
      inst.root.rotation.y = ((m.rotationYDeg ?? 0) * Math.PI) / 180;
      helpers.layoutRoot.add(inst.root);
      S.instances.push(inst);
    }
    helpers.updateLayoutPanel();
  }

  for (const w of snap.walls) {
    const id = w.id;
    const root = new THREE.Group();
    root.name = `wall_${id}`;
    const refA = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
    const refB = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
    const mesh = helpers.createWallMesh(refA, refB, w.params.thicknessMm);
    mesh.name = `wallMesh_${id}`;
    mesh.userData.kind = "wall";
    mesh.userData.wallId = id;
    root.add(mesh);
    const inst: WallInstance = { id, params: JSON.parse(JSON.stringify(w.params)) as WallParams, root, mesh };
    helpers.layoutRoot.add(root);
    S.walls.push(inst);
    helpers.rebuildWall(inst);
  }

  if (snap.dimensions && snap.dimensions.length > 0) {
    for (const dp of snap.dimensions) {
      helpers.createDimension(dp.a, dp.b, dp.offsetM, { id: dp.id, skipHistory: true });
    }
  }

  helpers.rebuildWallPlanMesh();
  helpers.updateAllDimensions();
  helpers.clearToolHud();

  // Restore selection (best-effort)
  for (const id of snap.selected.wallIds) if (S.walls.some((w) => w.id === id)) S.selectedWallIds.add(id);
  for (const id of snap.selected.instIds) if (S.instances.some((i) => i.id === id)) S.selectedInstanceIds.add(id);
  if (snap.selected.kind === "wall" && snap.selected.wallId && S.walls.some((w) => w.id === snap.selected.wallId)) {
    helpers.setSelectedWall(snap.selected.wallId);
  } else if (snap.selected.kind === "module" && snap.selected.instId && S.instances.some((i) => i.id === snap.selected.instId)) {
    helpers.setSelectedModule(snap.selected.instId);
  } else if (snap.selected.kind === "dimension" && snap.selected.dimensionId) {
    helpers.setSelectedDimension(snap.selected.dimensionId);
  } else {
    helpers.setSelectedWall(null);
    helpers.setSelectedModule(null);
  }
  helpers.updateSelectionHighlights();
  helpers.updateDimensionSelectionHighlights();
  helpers.mountProps();
};

export const captureLayoutSnapshot = (S: AppState): LayoutSnapshot => {
  const copyParams = (p: WallParams) => JSON.parse(JSON.stringify(p)) as WallParams;
  return {
    wallCounter: S.wallCounter,
    walls: S.walls.map((w) => ({ id: w.id, params: copyParams(w.params) })),
    instanceCounter: S.instanceCounter,
    instances: S.instances.map((i) => ({
      id: i.id,
      params: JSON.parse(JSON.stringify(i.params)) as ModuleParams,
      kitchenGroupId: i.kitchenGroupId ?? null,
      positionMm: { x: Math.round(i.root.position.x * 1000), z: Math.round(i.root.position.z * 1000) },
      rotationYDeg: (i.root.rotation.y * 180) / Math.PI
    })),
    dimensionCounter: S.dimensionCounter,
    dimensions: S.dimensions.map((d) => JSON.parse(JSON.stringify(d.params)) as DimensionParams),
    pinnedWallIds: Array.from(S.pinnedWallIds),
    pinnedInstanceIds: Array.from(S.pinnedInstanceIds),
    underlayPinned: !!S.underlayState?.pinned,
    selected: {
      kind: S.selectedKind,
      wallId: S.selectedWallId,
      wallIds: Array.from(S.selectedWallIds),
      instId: S.selectedInstanceId,
      instIds: Array.from(S.selectedInstanceIds),
      dimensionId: S.selectedDimensionId
    }
  };
};

export const commitHistory = (S: AppState) => {
  if (S.mode !== "layout") return;
  if (S.viewMode !== "2d" && S.viewMode !== "3d") return;
  const next = captureLayoutSnapshot(S);
  if (!S.history.current) {
    S.history.current = next;
    S.history.past = [];
    S.history.future = [];
    updateUndoRedoUi(S);
    return;
  }
  const a = snapshotSignature(S.history.current);
  const b = snapshotSignature(next);
  if (a === b) return;
  S.history.past.push(S.history.current);
  if (S.history.past.length > S.history.max) S.history.past.splice(0, S.history.past.length - S.history.max);
  S.history.current = next;
  S.history.future = [];
  updateUndoRedoUi(S);
};

export const undo = (S: AppState, helpers: HistoryHelpers) => {
  if (!S.history.current) return;
  const prev = S.history.past.pop() ?? null;
  if (!prev) return;
  S.history.future.push(S.history.current);
  S.history.current = prev;
  restoreLayoutSnapshot(S, helpers, prev);
  updateUndoRedoUi(S);
};

export const redo = (S: AppState, helpers: HistoryHelpers) => {
  if (!S.history.current) return;
  const next = S.history.future.pop() ?? null;
  if (!next) return;
  S.history.past.push(S.history.current);
  S.history.current = next;
  restoreLayoutSnapshot(S, helpers, next);
  updateUndoRedoUi(S);
};
