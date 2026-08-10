import * as THREE from "three";
import type {
  AppState,
  LayoutSnapshot,
  WallParams,
  ModuleParams,
  WallInstance,
  LayoutInstance,
  KitchenWorktopParams,
  KitchenPlacementBinding,
  SectionParams,
  ColumnParams
} from "./appState";
import { cloneLedStripGroup, type LedStripGroup } from "./ledStripTypes";
import type { CustomFurnitureSnapshotItem } from "./customFurnitureTypes";
import type { WardrobeEditSaveState } from "./wardrobeEditMode";
import { getKitchenModuleRole } from "./kitchenModuleRules";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";

const historyRevisions = new WeakMap<AppState, number>();

function bumpHistoryRevision(S: AppState): void {
  historyRevisions.set(S, (historyRevisions.get(S) ?? 0) + 1);
}

export function getLayoutHistoryRevision(S: AppState): number {
  return historyRevisions.get(S) ?? 0;
}

export interface HistoryHelpers {
  setSelectedWall: (id: string | null) => void;
  setSelectedFloor?: (id: string | null) => void;
  setSelectedColumn?: (id: string | null) => void;
  setSelectedModule: (id: string | null) => void;
  updateSelectionHighlights: () => void;
  disposeObject3D: (obj: THREE.Object3D) => void;
  createInstance: (params: ModuleParams, opts: { id?: string }) => LayoutInstance;
  createWallMesh: (a: THREE.Vector3, b: THREE.Vector3, thickness: number, heightMm?: number) => THREE.Mesh;
  createWallOutline: (geometry: THREE.BufferGeometry, wallId?: string) => THREE.LineSegments;
  rebuildWall: (inst: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  restoreFloors?: (floors: NonNullable<LayoutSnapshot["floors"]>, floorCounter?: number) => void;
  restoreColumns?: (columns: NonNullable<LayoutSnapshot["columns"]>, columnCounter?: number) => void;
  restoreSections?: (sections: NonNullable<LayoutSnapshot["sections"]>, sectionCounter?: number) => void;
  restoreWorktops?: (
    worktops: NonNullable<LayoutSnapshot["worktops"]>,
    worktopCounter?: number
  ) => void;
  restoreCustomFurniture?: (items: CustomFurnitureSnapshotItem[], customFurnitureCounter?: number) => void;
  restoreLedStripGroups?: (groups: LedStripGroup[], ledStripCounter?: number) => void;
  restoreWardrobe?: (state: WardrobeEditSaveState | null | undefined) => void;
  restoreProjectMaterialAssignments?: (state: ProjectMaterialAssignmentsState | undefined) => void;
  clearToolHud: () => void;
  mountProps: () => void;
  updateLayoutPanel: () => void;
  layoutRoot: THREE.Group;
  setSelectedSection?: (id: string | null) => void;
}

const stableJson = (value: unknown): string => {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
};

export const snapshotSignature = (s: LayoutSnapshot) => {
  // Compact-ish signature to skip duplicates
  const w = s.walls
    .map((x) => `${x.id}:${x.params.aMm.x},${x.params.aMm.z}-${x.params.bMm.x},${x.params.bMm.z}:${x.params.typeId ?? ""}:${x.params.thicknessMm}:${x.params.heightMm}:${x.params.materialId ?? ""}:${x.params.justification ?? "center"}:${x.params.exteriorSign ?? 1}:${JSON.stringify(x.params.joinEnds ?? {})}`)
    .join("|");
  const mods = (s.instances ?? [])
    .map(
      (m) =>
        `${m.id}:${stableJson(m.params ?? {})}:${m.kitchenGroupId ?? ""}:${m.kitchenPlacement?.worktopId ?? ""}:${m.kitchenPlacement?.kind ?? "segment"}:${m.kitchenPlacement?.segmentIndex ?? -1}:${m.kitchenPlacement?.cornerIndex ?? -1}:${Math.round((m.kitchenPlacement?.offsetAlongM ?? -1) * 1000)}:${m.positionMm.x},${m.positionMm.y ?? 0},${m.positionMm.z}:${Math.round((m.rotationYDeg ?? 0) * 10)}`
    )
    .join("|");
  const floors = (s.floors ?? [])
    .map((f) => `${f.id}:${f.params.name}:${f.params.heightMm}:${f.params.thicknessMm}:${f.params.materialId ?? ""}:${f.params.boundary.map((p) => `${p.x},${p.z}`).join(";")}`)
    .join("|");
  const columns = (s.columns ?? [])
    .map((c) => `${c.id}:${c.params.name}:${c.params.shape}:${c.params.xMm},${c.params.zMm}:${c.params.widthMm}:${c.params.depthMm}:${c.params.diameterMm}:${c.params.heightMm}:${c.params.materialId}`)
    .join("|");
  const sections = (s.sections ?? [])
    .map((section) => `${section.id}:${section.params.name}:${section.params.aMm.x},${section.params.aMm.z}-${section.params.bMm.x},${section.params.bMm.z}:${section.params.mirrored ? 1 : 0}`)
    .join("|");
  const worktops = (s.worktops ?? [])
    .map(
      (w) =>
        `${w.id}:${w.kitchenGroupId}:${w.params.justification}:${w.params.mirrored ? 1 : 0}:${w.params.depthMm}:${w.params.thicknessMm}:${w.params.heightMm}:${w.params.overhangSideMm}:${w.params.materialId}:${w.params.path
          .map((p) => `${p.x},${p.z}`)
          .join(";")}`
    )
    .join("|");
  const alignLocks = (s.alignLocks ?? [])
    .map(
      (lock) =>
        `${lock.id}:${lock.locked ? 1 : 0}:${JSON.stringify(lock.a)}:${JSON.stringify(lock.b)}:${lock.pointMm.x},${lock.pointMm.z}`
    )
    .join("|");
  const customFurniture = (s.customFurniture ?? [])
    .map((item) => `${item.id}:${JSON.stringify(item.params)}`)
    .join("|");
  const ledStrips = (s.ledStripGroups ?? []).map((group) => JSON.stringify(group)).join("|");
  const wardrobe = s.wardrobe ? JSON.stringify(s.wardrobe) : "";
  const pins = `${s.pinnedWallIds.slice().sort().join(",")}#${s.pinnedInstanceIds.slice().sort().join(",")}#${s.underlayPinned ? 1 : 0}`;
  return `${s.wallCounter}:${s.floorCounter ?? 1}:${s.columnCounter ?? 1}:${s.sectionCounter ?? 1}:${s.worktopCounter ?? 1}:${s.alignLockCounter ?? 1}:${s.customFurnitureCounter ?? 1}:${s.ledStripCounter ?? 1}:${s.instanceCounter}::${pins}::${w}::${floors}::${columns}::${sections}::${worktops}::${alignLocks}::${customFurniture}::${ledStrips}::${wardrobe}::${stableJson(s.materialAssignments ?? null)}::${mods}`;
};

export const updateUndoRedoUi = (S: AppState) => {
  if (S.undoBtnEl) S.undoBtnEl.disabled = S.history.past.length === 0;
  if (S.redoBtnEl) S.redoBtnEl.disabled = S.history.future.length === 0;
};

const getRestoredInstanceY = (S: AppState, m: LayoutSnapshot["instances"][number]) => {
  if (typeof m.positionMm.y === "number") return m.positionMm.y / 1000;
  if (getKitchenModuleRole(m.params as Record<string, unknown>) === "upper" && m.kitchenGroupId) {
    const group = S.kitchenGroups.find((g) => g.id === m.kitchenGroupId);
    return (group?.ctx.upperStartHeightMm ?? S.kitchenCtx.upperStartHeightMm) / 1000;
  }
  return 0;
};

export const clearSelectionBeforeSnapshotRestore = (S: AppState, helpers: Pick<HistoryHelpers, "setSelectedWall" | "setSelectedModule" | "setSelectedColumn" | "setSelectedSection" | "updateSelectionHighlights">) => {
  helpers.setSelectedWall(null);
  helpers.setSelectedModule(null);
  helpers.setSelectedColumn?.(null);
  helpers.setSelectedSection?.(null);
  S.selectedWallIds.clear();
  S.selectedInstanceIds.clear();
  helpers.updateSelectionHighlights();
};

export const restoreLayoutSnapshot = (S: AppState, helpers: HistoryHelpers, snap: LayoutSnapshot) => {
  // Clear selection visuals first
  clearSelectionBeforeSnapshotRestore(S, helpers);

  // Clear wall roots
  for (const w of S.walls.splice(0, S.walls.length)) {
    helpers.layoutRoot.remove(w.root);
    helpers.disposeObject3D(w.root);
  }

  S.wallCounter = snap.wallCounter;
  S.floorCounter = snap.floorCounter ?? S.floorCounter;
  S.columnCounter = snap.columnCounter ?? S.columnCounter;
  S.sectionCounter = snap.sectionCounter ?? S.sectionCounter;
  S.worktopCounter = snap.worktopCounter ?? S.worktopCounter;
  S.alignLockCounter = snap.alignLockCounter ?? S.alignLockCounter;
  S.alignLocks = structuredClone(snap.alignLocks ?? []);
  S.customFurnitureCounter = snap.customFurnitureCounter ?? S.customFurnitureCounter;
  S.ledStripCounter = snap.ledStripCounter ?? S.ledStripCounter;
  S.instanceCounter = snap.instanceCounter ?? S.instanceCounter;

  S.pinnedWallIds.clear();
  for (const id of snap.pinnedWallIds) S.pinnedWallIds.add(id);
  S.pinnedInstanceIds.clear();
  for (const id of snap.pinnedInstanceIds) S.pinnedInstanceIds.add(id);
  
  if(S.underlayState) {
     S.underlayState.pinned = !!snap.underlayPinned;
  }

  helpers.restoreSections?.(snap.sections ?? [], snap.sectionCounter);
  helpers.restoreColumns?.(snap.columns ?? [], snap.columnCounter);

  if (helpers.restoreWorktops) {
    helpers.restoreWorktops(snap.worktops ?? [], snap.worktopCounter);
  }
  helpers.restoreCustomFurniture?.(snap.customFurniture ?? [], snap.customFurnitureCounter);
  helpers.restoreLedStripGroups?.((snap.ledStripGroups ?? []).map(cloneLedStripGroup), snap.ledStripCounter);
  helpers.restoreWardrobe?.(snap.wardrobe ?? null);
  helpers.restoreProjectMaterialAssignments?.(snap.materialAssignments);

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
      inst.kitchenPlacement = m.kitchenPlacement ? (JSON.parse(JSON.stringify(m.kitchenPlacement)) as KitchenPlacementBinding) : null;
      inst.root.position.set(m.positionMm.x / 1000, getRestoredInstanceY(S, m), m.positionMm.z / 1000);
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
    const params = JSON.parse(JSON.stringify(w.params)) as WallParams;
    params.heightMm = Math.max(1, Math.round(params.heightMm ?? 2600));
    const mesh = helpers.createWallMesh(refA, refB, params.thicknessMm, params.heightMm);
    mesh.name = `wallMesh_${id}`;
    mesh.userData.kind = "wall";
    mesh.userData.wallId = id;
    const outline = helpers.createWallOutline(mesh.geometry as THREE.BufferGeometry, id);
    mesh.add(outline);
    root.add(mesh);
    const inst: WallInstance = { id, params, heightMm: params.heightMm, root, mesh, outline };
    helpers.layoutRoot.add(root);
    S.walls.push(inst);
    helpers.rebuildWall(inst);
  }

  helpers.restoreFloors?.(snap.floors ?? [], snap.floorCounter);

  helpers.rebuildWallPlanMesh();
  helpers.clearToolHud();

  // Restore selection (best-effort)
  for (const id of snap.selected.wallIds) if (S.walls.some((w) => w.id === id)) S.selectedWallIds.add(id);
  for (const id of snap.selected.instIds) if (S.instances.some((i) => i.id === id)) S.selectedInstanceIds.add(id);
  if (snap.selected.kind === "wall" && snap.selected.wallId && S.walls.some((w) => w.id === snap.selected.wallId)) {
    helpers.setSelectedWall(snap.selected.wallId);
  } else if (snap.selected.kind === "floor" && snap.selected.floorId && S.floors.some((f) => f.id === snap.selected.floorId)) {
    helpers.setSelectedFloor?.(snap.selected.floorId);
  } else if (snap.selected.kind === "column" && snap.selected.columnId && S.columns.some((c) => c.id === snap.selected.columnId)) {
    helpers.setSelectedColumn?.(snap.selected.columnId);
  } else if (snap.selected.kind === "section" && snap.selected.sectionId && S.sections.some((section) => section.id === snap.selected.sectionId)) {
    helpers.setSelectedSection?.(snap.selected.sectionId);
  } else if (snap.selected.kind === "module" && snap.selected.instId && S.instances.some((i) => i.id === snap.selected.instId)) {
    helpers.setSelectedModule(snap.selected.instId);
  } else {
    helpers.setSelectedWall(null);
    helpers.setSelectedModule(null);
    helpers.setSelectedColumn?.(null);
  }
  helpers.updateSelectionHighlights();
  helpers.mountProps();
};

export const captureLayoutSnapshot = (S: AppState): LayoutSnapshot => {
  const copyParams = (p: WallParams) => JSON.parse(JSON.stringify(p)) as WallParams;
  const copyWorktopParams = (p: KitchenWorktopParams) => JSON.parse(JSON.stringify(p)) as KitchenWorktopParams;
  const copySectionParams = (p: SectionParams) => JSON.parse(JSON.stringify(p)) as SectionParams;
  const copyColumnParams = (p: ColumnParams) => JSON.parse(JSON.stringify(p)) as ColumnParams;
  return {
    materialAssignments: structuredClone(S.projectMaterialAssignments),
    wallCounter: S.wallCounter,
    walls: S.walls.map((w) => ({ id: w.id, params: copyParams(w.params) })),
    floorCounter: S.floorCounter,
    floors: S.floors.map((floor) => ({ id: floor.id, params: JSON.parse(JSON.stringify(floor.params)) })),
    columnCounter: S.columnCounter,
    columns: S.columns.map((column) => ({ id: column.id, params: copyColumnParams(column.params) })),
    sectionCounter: S.sectionCounter,
    sections: S.sections.map((section) => ({ id: section.id, params: copySectionParams(section.params) })),
    worktopCounter: S.worktopCounter,
    worktops: S.kitchenWorktops.map((worktop) => ({
      id: worktop.id,
      kitchenGroupId: worktop.kitchenGroupId,
      params: copyWorktopParams(worktop.params)
    })),
    alignLockCounter: S.alignLockCounter,
    alignLocks: structuredClone(S.alignLocks),
    customFurnitureCounter: S.customFurnitureCounter,
    customFurniture: S.customFurniture.map((item) => ({ id: item.id, params: JSON.parse(JSON.stringify(item.params)) })),
    // Older in-memory/test states predate LED strips. Treat them as an empty
    // collection so history remains backward compatible while a project loads.
    ledStripCounter: S.ledStripCounter ?? 1,
    ledStripGroups: (S.ledStripGroups ?? []).map(cloneLedStripGroup),
    wardrobe: S.wardrobeHistory?.getSaveState() ?? null,
    instanceCounter: S.instanceCounter,
    instances: S.instances.map((i) => ({
      id: i.id,
      params: JSON.parse(JSON.stringify(i.params)) as ModuleParams,
      kitchenGroupId: i.kitchenGroupId ?? null,
      kitchenPlacement: i.kitchenPlacement ? (JSON.parse(JSON.stringify(i.kitchenPlacement)) as KitchenPlacementBinding) : null,
      positionMm: {
        x: Math.round(i.root.position.x * 1000),
        y: Math.round(i.root.position.y * 1000),
        z: Math.round(i.root.position.z * 1000)
      },
      rotationYDeg: (i.root.rotation.y * 180) / Math.PI
    })),
    pinnedWallIds: Array.from(S.pinnedWallIds),
    pinnedInstanceIds: Array.from(S.pinnedInstanceIds),
    underlayPinned: !!S.underlayState?.pinned,
    selected: {
      kind: S.selectedKind,
      wallId: S.selectedWallId,
      wallIds: Array.from(S.selectedWallIds),
      floorId: S.selectedFloorId,
      columnId: S.selectedColumnId,
      sectionId: S.selectedSectionId,
      instId: S.selectedInstanceId,
      instIds: Array.from(S.selectedInstanceIds)
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
  bumpHistoryRevision(S);
  updateUndoRedoUi(S);
};

export const undo = (S: AppState, helpers: HistoryHelpers) => {
  if (!S.history.current) return;
  const prev = S.history.past.pop() ?? null;
  if (!prev) return;
  S.history.future.push(S.history.current);
  S.history.current = prev;
  restoreLayoutSnapshot(S, helpers, prev);
  bumpHistoryRevision(S);
  updateUndoRedoUi(S);
};

export const redo = (S: AppState, helpers: HistoryHelpers) => {
  if (!S.history.current) return;
  const next = S.history.future.pop() ?? null;
  if (!next) return;
  S.history.past.push(S.history.current);
  S.history.current = next;
  restoreLayoutSnapshot(S, helpers, next);
  bumpHistoryRevision(S);
  updateUndoRedoUi(S);
};
