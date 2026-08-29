import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { FloorBoundaryPoint, SelectedKind } from "./localTypes";
import type { PlanSnapResult } from "./planSnap";
import { reportEditorToolEntryStatus } from "./editorToolEntryController";

export type WallDrawState = {
  active: boolean;
  a: FloorBoundaryPoint | null;
  chainStart: FloorBoundaryPoint | null;
  segments: number;
  hoverB: FloorBoundaryPoint | null;
  typedMm: string;
  preview: THREE.Mesh | null;
};

export type WallDrawStateCleanupContext = {
  hideHoverCursor: () => void;
  layoutRoot: THREE.Object3D;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  showWallSnapMarkersFor: (wallId: string | null) => void;
  wallDraw: WallDrawState;
  wallDrawSnap: PlanSnapResult | null;
  wallTypedHud: HTMLElement;
};

export type WallToolActivationContext = {
  S: AppState;
  clearSelectionBoxes: () => void;
  clearSelectionForDrawingTool: () => void;
  ensureFloorplanViewerTab: () => void;
  enterWallTool: () => void;
  mountProps: () => void;
  setUnderlayStatus: (message: string) => void;
};

export function resetWallDrawState(ctx: WallDrawStateCleanupContext) {
  ctx.wallDraw.active = false;
  ctx.wallDraw.a = null;
  ctx.wallDraw.chainStart = null;
  ctx.wallDraw.segments = 0;
  ctx.wallDraw.hoverB = null;
  ctx.wallDraw.typedMm = "";
  ctx.wallTypedHud.textContent = "";
  if (ctx.wallDraw.preview) {
    ctx.layoutRoot.remove(ctx.wallDraw.preview);
    ctx.wallDraw.preview.geometry.dispose();
    (ctx.wallDraw.preview.material as THREE.Material).dispose();
    ctx.wallDraw.preview = null;
  }
  ctx.wallDrawSnap = null;
  ctx.hideHoverCursor();
  ctx.showWallSnapMarkersFor(ctx.selectedKind === "wall" ? ctx.selectedWallId : null);
  ctx.wallTypedHud.style.display = "none";
}

export function activateWallToolState(ctx: WallToolActivationContext) {
  if (ctx.S.kitchenEditMode) {
    reportEditorToolEntryStatus(ctx, "Wall: v kitchen edit mode sa steny nekreslia.");
    return "blocked-kitchen-edit" as const;
  }

  ctx.enterWallTool();
  ctx.ensureFloorplanViewerTab();
  ctx.clearSelectionForDrawingTool();
  ctx.clearSelectionBoxes();
  ctx.mountProps();
  return "activated" as const;
}
