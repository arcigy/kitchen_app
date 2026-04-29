import * as THREE from "three";
import type { AppState } from "../layout/appState";
import { kitchenWorktopPointToWorld } from "../layout/worktopGeometry";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./localTypes";

type KitchenWorktopDrawState = {
  active: boolean;
  points: FloorBoundaryPoint[];
  hoverPoint: FloorBoundaryPoint | null;
  typedMm: string;
  mirrored: boolean;
  justification: KitchenWorktopParams["justification"];
};

type KitchenWorktopDrawContext = {
  S: AppState;
  kitchenWorktopDraw: KitchenWorktopDrawState;
  wallTypedHud: HTMLElement;
  getWorktopCounter: () => number;
  setWorktopDrawSnap: (next: null) => void;
  cancelKitchenWorktopDraw: (opts?: { silent?: boolean }) => void;
  cancelPlacement: () => void;
  isPlacementActive: () => boolean;
  ensureFloorplanViewerTab: () => void;
  clearSelectionForDraw: () => void;
  syncSelectionState: () => void;
  updateSelectionHighlights: () => void;
  setUnderlayStatus: (text: string) => void;
  mountProps: () => void;
  scheduleKitchenWorktopPreviewUpdate: () => void;
  updateKitchenWorktopPreview: () => void;
  floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => FloorBoundaryPoint;
  makeKitchenWorktopParamsFromPath: (path: FloorBoundaryPoint[]) => KitchenWorktopParams;
  getKitchenGroupWorktops: (groupId: string) => Array<{ id: string }>;
  replaceKitchenGroupWorktops: (
    groupId: string,
    worktops: Array<{ id: string; params: KitchenWorktopParams }>,
    opts?: { skipHistory?: boolean }
  ) => void;
};

export function createKitchenWorktopDrawController(ctx: KitchenWorktopDrawContext) {
  const startKitchenWorktopDraw = () => {
    if (!ctx.S.kitchenEditMode || !ctx.S.activeKitchenGroupId) return;
    ctx.cancelKitchenWorktopDraw({ silent: true });
    if (ctx.isPlacementActive()) ctx.cancelPlacement();
    ctx.ensureFloorplanViewerTab();
    ctx.kitchenWorktopDraw.active = true;
    ctx.kitchenWorktopDraw.mirrored = false;
    ctx.setWorktopDrawSnap(null);
    ctx.clearSelectionForDraw();
    ctx.syncSelectionState();
    ctx.updateSelectionHighlights();
    ctx.setUnderlayStatus("Worktop: click shape points. Type mm + Enter for segment length. Esc confirms the shape.");
    ctx.mountProps();
  };

  const appendKitchenWorktopPoint = (point: FloorBoundaryPoint) => {
    const draw = ctx.kitchenWorktopDraw;
    const prev = draw.points[draw.points.length - 1] ?? null;
    if (prev && Math.hypot(point.x - prev.x, point.z - prev.z) < 5) return false;

    draw.points = [...draw.points, point];
    draw.hoverPoint = point;
    draw.typedMm = "";

    if (draw.points.length === 1) {
      ctx.scheduleKitchenWorktopPreviewUpdate();
      ctx.setUnderlayStatus("Worktop: second click adds the next point. Type mm + Enter.");
      return true;
    }

    ctx.wallTypedHud.style.display = "none";
    if (draw.points.length === 2) {
      ctx.scheduleKitchenWorktopPreviewUpdate();
      ctx.setUnderlayStatus("Worktop: continue with the next point or press Esc to confirm.");
      return true;
    }

    if (draw.points.length === 3) {
      ctx.updateKitchenWorktopPreview();
      ctx.setUnderlayStatus("Worktop: continue with the next corner or press Esc to confirm.");
      return true;
    }

    ctx.scheduleKitchenWorktopPreviewUpdate();
    ctx.setUnderlayStatus("Worktop: next click adds another corner. Esc confirms the finished shape.");
    return true;
  };

  const commitKitchenWorktopTypedLength = () => {
    const draw = ctx.kitchenWorktopDraw;
    if (!draw.active || draw.points.length === 0) return false;
    const mm = Math.max(1, Math.round(Number(draw.typedMm)));
    if (!Number.isFinite(mm)) return false;

    const start = draw.points[draw.points.length - 1];
    if (!start) return false;
    const startWorld = kitchenWorktopPointToWorld(start);
    const hover = draw.hoverPoint ?? { x: start.x + 1000, z: start.z };
    const hoverWorld = kitchenWorktopPointToWorld(hover);
    const dir = hoverWorld.clone().sub(startWorld);
    if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
    dir.normalize();
    const endWorld = startWorld.clone().addScaledVector(dir, mm / 1000);
    const rawPoint = { x: Math.round(endWorld.x * 1000), z: Math.round(endWorld.z * 1000) };
    return appendKitchenWorktopPoint(ctx.floorOrthoPoint(start, rawPoint));
  };

  const mirrorKitchenWorktopDraw = () => {
    const draw = ctx.kitchenWorktopDraw;
    draw.mirrored = !draw.mirrored;
    ctx.scheduleKitchenWorktopPreviewUpdate();
    ctx.setUnderlayStatus(`Worktop: mirroring ${draw.mirrored ? "ON" : "OFF"} around ${draw.justification.toUpperCase()} line.`);
  };

  const handleKitchenWorktopEscape = () => {
    const draw = ctx.kitchenWorktopDraw;
    if (!draw.active) return false;
    if (draw.points.length < 2) {
      ctx.cancelKitchenWorktopDraw({ silent: true });
      ctx.setUnderlayStatus("Worktop: canceled.");
      ctx.mountProps();
      return true;
    }
    const groupId = ctx.S.activeKitchenGroupId;
    if (!groupId) {
      ctx.cancelKitchenWorktopDraw({ silent: true });
      ctx.mountProps();
      return true;
    }
    const params = ctx.makeKitchenWorktopParamsFromPath(draw.points);
    if (params.path.length < 2) {
      ctx.cancelKitchenWorktopDraw({ silent: true });
      ctx.mountProps();
      return true;
    }
    const existingId = ctx.getKitchenGroupWorktops(groupId)[0]?.id ?? `wt${ctx.getWorktopCounter()}`;
    ctx.replaceKitchenGroupWorktops(groupId, [{ id: existingId, params }], { skipHistory: false });
    ctx.cancelKitchenWorktopDraw({ silent: true });
    ctx.setUnderlayStatus(params.path.length >= 3 ? "Corner worktop created." : "Worktop created.");
    ctx.mountProps();
    return true;
  };

  return {
    startKitchenWorktopDraw,
    appendKitchenWorktopPoint,
    commitKitchenWorktopTypedLength,
    mirrorKitchenWorktopDraw,
    handleKitchenWorktopEscape
  };
}
