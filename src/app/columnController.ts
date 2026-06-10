import * as THREE from "three";
import { disposeObject3D } from "../core/dispose";
import type { AppState } from "../layout/appState";
import { commitHistory } from "../layout/historyManager";
import type { ColumnInstance, ColumnJustifyX, ColumnJustifyY, ColumnParams, ColumnShape } from "./localTypes";

type ColumnControllerContext = {
  S: AppState;
  layoutRoot: THREE.Group;
  columns: ColumnInstance[];
  wallDefault: Pick<ColumnParams, "heightMm" | "materialId">;
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  getColumnCounter: () => number;
  setColumnCounter: (next: number) => void;
  getSelectedColumnId: () => string | null;
  setSelectedColumnId: (next: string | null) => void;
};

const COLUMN_COLOR = 0xb9c0c8;
const OUTLINE_COLOR = 0x4e5866;
const SELECTED_COLOR = 0x3ddc97;

const cloneColumnParams = (params: ColumnParams): ColumnParams => JSON.parse(JSON.stringify(params)) as ColumnParams;

const isColumnShape = (value: unknown): value is ColumnShape =>
  value === "square" || value === "rectangular" || value === "round";
const isColumnJustifyX = (value: unknown): value is ColumnJustifyX =>
  value === "left" || value === "center" || value === "right";
const isColumnJustifyY = (value: unknown): value is ColumnJustifyY =>
  value === "up" || value === "center" || value === "down";

function normalizeColumnParams(params: Partial<ColumnParams>, defaults: Pick<ColumnParams, "heightMm" | "materialId">): ColumnParams {
  const positive = (value: unknown, fallback: number) => {
    const next = Math.round(Number(value));
    return Number.isFinite(next) ? Math.max(1, next) : fallback;
  };
  const finite = (value: unknown, fallback: number) => {
    const next = Math.round(Number(value));
    return Number.isFinite(next) ? next : fallback;
  };
  const shape = isColumnShape(params.shape) ? params.shape : "square";
  const widthMm = positive(params.widthMm, params.diameterMm ?? 300);
  const depthMm = shape === "square" ? widthMm : positive(params.depthMm, widthMm);
  const diameterMm = positive(params.diameterMm, widthMm);
  return {
    name: String(params.name ?? "Stlp").trim() || "Stlp",
    shape,
    xMm: finite(params.xMm, 0),
    zMm: finite(params.zMm, 0),
    justifyX: isColumnJustifyX(params.justifyX) ? params.justifyX : "center",
    justifyY: isColumnJustifyY(params.justifyY) ? params.justifyY : "center",
    widthMm,
    depthMm,
    diameterMm,
    heightMm: positive(params.heightMm, defaults.heightMm),
    materialId: String(params.materialId ?? defaults.materialId ?? "default")
  };
}

function getColumnFootprintMm(params: ColumnParams) {
  if (params.shape === "round") return { widthMm: params.diameterMm, depthMm: params.diameterMm };
  if (params.shape === "square") return { widthMm: params.widthMm, depthMm: params.widthMm };
  return { widthMm: params.widthMm, depthMm: params.depthMm };
}

function getColumnCenterMm(params: ColumnParams) {
  const footprint = getColumnFootprintMm(params);
  const offsetX = params.justifyX === "left" ? footprint.widthMm / 2 : params.justifyX === "right" ? -footprint.widthMm / 2 : 0;
  const offsetZ = params.justifyY === "up" ? footprint.depthMm / 2 : params.justifyY === "down" ? -footprint.depthMm / 2 : 0;
  return { x: params.xMm + offsetX, z: params.zMm + offsetZ };
}

function makeColumnGeometry(params: ColumnParams) {
  const heightM = Math.max(0.001, params.heightMm / 1000);
  if (params.shape === "round") {
    return new THREE.CylinderGeometry(Math.max(0.001, params.diameterMm / 2000), Math.max(0.001, params.diameterMm / 2000), heightM, 48);
  }
  const widthM = Math.max(0.001, params.widthMm / 1000);
  const depthM = Math.max(0.001, (params.shape === "square" ? params.widthMm : params.depthMm) / 1000);
  return new THREE.BoxGeometry(widthM, heightM, depthM);
}

export function createColumnController(ctx: ColumnControllerContext) {
  let placementPreview: ColumnInstance | null = null;
  let placementPreviewAnchorMm: { x: number; z: number } | null = null;

  const syncColumnCounter = (next: number) => {
    ctx.setColumnCounter(next);
    ctx.S.columnCounter = next;
  };

  const updateCounterFromId = (id: string) => {
    const match = /^c(\d+)$/.exec(id);
    if (!match) return;
    syncColumnCounter(Math.max(ctx.getColumnCounter(), Number(match[1]) + 1));
  };

  const syncColumnPresentation = () => {
    const isFloorplanView = ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan";
    for (const column of ctx.columns) {
      column.mesh.visible = true;
      column.pick.visible = true;
      column.outline.visible = true;
      (column.mesh.material as THREE.MeshBasicMaterial).depthTest = !isFloorplanView;
      (column.outline.material as THREE.LineBasicMaterial).depthTest = !isFloorplanView;
    }
  };

  const syncColumnSelectionVisuals = () => {
    const selectedId = ctx.getSelectedColumnId();
    for (const column of ctx.columns) {
      const selected = selectedId === column.id;
      (column.outline.material as THREE.LineBasicMaterial).color.setHex(selected ? SELECTED_COLOR : OUTLINE_COLOR);
      (column.outline.material as THREE.LineBasicMaterial).opacity = selected ? 1 : 0.9;
    }
  };

  const applyColumnGeometry = (column: ColumnInstance) => {
    Object.assign(column.params, normalizeColumnParams(column.params, ctx.wallDefault));
    const center = getColumnCenterMm(column.params);
    column.root.position.set(center.x / 1000, 0, center.z / 1000);

    const geometry = makeColumnGeometry(column.params);
    column.mesh.geometry.dispose();
    column.mesh.geometry = geometry;
    column.mesh.position.y = column.params.heightMm / 2000;

    column.outline.geometry.dispose();
    column.outline.geometry = new THREE.EdgesGeometry(geometry);
    column.outline.position.copy(column.mesh.position);

    column.pick.geometry.dispose();
    column.pick.geometry = makeColumnGeometry(column.params);
    column.pick.position.copy(column.mesh.position);
  };

  const rebuildColumn = (column: ColumnInstance) => {
    applyColumnGeometry(column);
    syncColumnPresentation();
    syncColumnSelectionVisuals();
  };

  const createPlacementPreview = () => {
    const id = "__columnPlacementPreview";
    const normalized = normalizeColumnParams({}, ctx.wallDefault);
    const root = new THREE.Group();
    root.name = "columnPlacementPreview";
    root.userData.kind = "columnPlacementPreview";

    const mesh = new THREE.Mesh(
      makeColumnGeometry(normalized),
      new THREE.MeshBasicMaterial({
        color: SELECTED_COLOR,
        transparent: true,
        opacity: 0.28,
        depthTest: false,
        depthWrite: false
      })
    );
    mesh.name = "columnPlacementPreviewMesh";
    mesh.userData.kind = "columnPlacementPreview";
    mesh.renderOrder = 70;
    root.add(mesh);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: SELECTED_COLOR, transparent: true, opacity: 1, depthTest: false, depthWrite: false })
    );
    outline.name = "columnPlacementPreviewOutline";
    outline.userData.kind = "columnPlacementPreview";
    outline.renderOrder = 71;
    root.add(outline);

    const pick = new THREE.Mesh(makeColumnGeometry(normalized), new THREE.MeshBasicMaterial({ visible: false }));
    pick.visible = false;
    root.add(pick);

    placementPreview = { id, params: cloneColumnParams(normalized), root, mesh, outline, pick };
    ctx.layoutRoot.add(root);
    return placementPreview;
  };

  const updateColumnPlacementPreview = (params: Partial<ColumnParams>, anchorMm?: { x: number; z: number } | null) => {
    if (anchorMm !== undefined) placementPreviewAnchorMm = anchorMm;
    const preview = placementPreview ?? createPlacementPreview();
    if (!placementPreviewAnchorMm) {
      preview.root.visible = false;
      return false;
    }
    Object.assign(preview.params, normalizeColumnParams({ ...params, xMm: placementPreviewAnchorMm.x, zMm: placementPreviewAnchorMm.z }, ctx.wallDefault));
    applyColumnGeometry(preview);
    preview.root.visible = true;
    preview.pick.visible = false;
    return true;
  };

  const clearColumnPlacementPreview = () => {
    placementPreviewAnchorMm = null;
    if (!placementPreview) return;
    ctx.layoutRoot.remove(placementPreview.root);
    disposeObject3D(placementPreview.root);
    placementPreview = null;
  };

  const createColumn = (params?: Partial<ColumnParams>, opts?: { id?: string; skipHistory?: boolean }) => {
    const currentCounter = ctx.getColumnCounter();
    const id = opts?.id ?? `c${currentCounter}`;
    syncColumnCounter(opts?.id ? currentCounter : currentCounter + 1);
    if (opts?.id) updateCounterFromId(id);

    const root = new THREE.Group();
    root.name = `column_${id}`;
    root.userData.kind = "column";
    root.userData.columnId = id;

    const normalized = normalizeColumnParams(params ?? {}, ctx.wallDefault);
    const mesh = new THREE.Mesh(
      makeColumnGeometry(normalized),
      new THREE.MeshBasicMaterial({ color: COLUMN_COLOR, depthTest: true, depthWrite: true })
    );
    mesh.name = `columnMesh_${id}`;
    mesh.userData.kind = "column";
    mesh.userData.columnId = id;
    mesh.renderOrder = 8;
    root.add(mesh);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, transparent: true, opacity: 0.9, depthTest: true, depthWrite: false })
    );
    outline.name = `columnOutline_${id}`;
    outline.userData.kind = "column";
    outline.userData.columnId = id;
    outline.renderOrder = 58;
    root.add(outline);

    const pick = new THREE.Mesh(
      makeColumnGeometry(normalized),
      new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0 })
    );
    pick.name = `columnPick_${id}`;
    pick.userData.kind = "column";
    pick.userData.columnId = id;
    root.add(pick);

    const column: ColumnInstance = { id, params: cloneColumnParams(normalized), root, mesh, outline, pick };
    ctx.layoutRoot.add(root);
    ctx.columns.push(column);
    rebuildColumn(column);
    if (!opts?.skipHistory) commitHistory(ctx.S);
    return column;
  };

  const deleteColumn = (id: string, opts?: { skipHistory?: boolean }) => {
    const index = ctx.columns.findIndex((column) => column.id === id);
    if (index < 0) return false;
    const column = ctx.columns[index]!;
    ctx.layoutRoot.remove(column.root);
    disposeObject3D(column.root);
    ctx.columns.splice(index, 1);
    if (ctx.getSelectedColumnId() === id) ctx.setSelectedColumnId(null);
    syncColumnSelectionVisuals();
    if (!opts?.skipHistory) commitHistory(ctx.S);
    return true;
  };

  const restoreColumnsFromSnapshot = (columns: Array<{ id: string; params: ColumnParams }>, nextCounter?: number) => {
    for (const column of ctx.columns.splice(0, ctx.columns.length)) {
      ctx.layoutRoot.remove(column.root);
      disposeObject3D(column.root);
    }
    syncColumnCounter(nextCounter ?? 1);
    for (const column of columns) {
      createColumn(cloneColumnParams(column.params), { id: column.id, skipHistory: true });
    }
  };

  return {
    cloneColumnParams,
    createColumn,
    deleteColumn,
    defaultColumnParams: (params?: Partial<ColumnParams>) => normalizeColumnParams(params ?? {}, ctx.wallDefault),
    normalizeColumnParams: (params: Partial<ColumnParams>) => normalizeColumnParams(params, ctx.wallDefault),
    rebuildColumn,
    updateColumnPlacementPreview,
    clearColumnPlacementPreview,
    restoreColumnsFromSnapshot,
    syncColumnPresentation,
    syncColumnSelectionVisuals
  };
}
