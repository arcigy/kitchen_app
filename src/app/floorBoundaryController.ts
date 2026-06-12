import * as THREE from "three";
import {
  floorBoundaryToSegments,
  floorOrthoPoint as computeFloorOrthoPoint,
  floorPointDistMm,
  floorSegmentsToBoundary,
  moveFloorEditSegment as moveFloorEditSegmentBase,
  moveFloorEditVertex as moveFloorEditVertexBase
} from "./floorBoundaryEdit";
import {
  clearFloorBoundaryGroup as clearFloorBoundaryGroupBase,
  pickFloorEditElement as pickFloorEditElementBase,
  renderFloorBoundaryEdit as renderFloorBoundaryEditBase
} from "./floorBoundaryVisuals";
import type { AppArgs } from "./bootstrap";
import type {
  FloorBoundaryPoint,
  FloorBoundarySegment,
  FloorBoundaryTool,
  FloorEditDrag,
  FloorEditVertexRef,
  FloorInstance,
  FloorParams,
  SelectedKind
} from "./localTypes";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import { reportEditorToolEntryStatus } from "./editorToolEntryController";
import { clearDrawingToolSelection } from "./selectionController";

type FloorEditState = {
  active: boolean;
  floorId: string | null;
  params: FloorParams | null;
  snapshot: FloorParams | null;
  segments: FloorBoundarySegment[];
  tool: FloorBoundaryTool;
  ortho: boolean;
  first: FloorBoundaryPoint | null;
  hover: FloorBoundaryPoint | null;
  selectedSegmentIndex: number | null;
  selectedVertex: FloorEditVertexRef | null;
  drag: FloorEditDrag | null;
  error: string;
  overlayEl: HTMLDivElement | null;
};

type FloorBoundaryToolbar = {
  clear: () => void;
  addRow: (opts?: { title?: string; className?: string }) => HTMLElement;
  addGroup: (title: string, opts?: { row?: HTMLElement }) => HTMLElement;
  addSpacer: (opts?: { row?: HTMLElement }) => void;
  toolButton: (
    group: HTMLElement,
    opts: {
      title: string;
      iconSvg: string;
      label: string;
      variant?: "success" | "danger";
      onClick: () => void;
    }
  ) => HTMLButtonElement;
};

type FloorBoundaryControllerContext = {
  I_ALIGN: string;
  I_CANCEL: string;
  I_DIM: string;
  I_DONE: string;
  I_GRID2D: string;
  I_VIEW: string;
  S: AppState;
  args: AppArgs & { viewerEl: HTMLElement };
  buildClassicTopbar: () => void;
  cam: () => THREE.Camera;
  cancelPlacement: (S: AppState, helpers: PlacementHelpers) => void;
  clearToolHud: () => void;
  cloneFloorParams: (params: FloorParams) => FloorParams;
  commitHistory: (S: AppState) => void;
  createFloor: (params: FloorParams, opts?: { id?: string; skipHistory?: boolean }) => FloorInstance;
  drawOrthoEnabled: boolean;
  drawOrthoToggleEl: HTMLButtonElement | null;
  ensureFloorplanViewerTab: () => void;
  ensureLayoutMode: () => void;
  floorBoundaryGroup: THREE.Group;
  floorCounter: number;
  floorDefault: Pick<FloorParams, "heightMm" | "thicknessMm" | "materialId">;
  floorEdit: FloorEditState;
  floors: FloorInstance[];
  kitchenWorktopDraw: { active: boolean; points: FloorBoundaryPoint[] };
  mountProps: () => void;
  placement: { active: boolean };
  placementHelpers: PlacementHelpers;
  rebuildFloor: (floor: FloorInstance) => void;
  rebuildStandardTopbar: () => void;
  scheduleKitchenWorktopPreviewUpdate: () => void;
  selectedFloorId: string | null;
  selectedInstanceIds: Set<string>;
  selectedKind: SelectedKind;
  selectedWallId: string | null;
  selectedWallIds: Set<string>;
  setInstanceSelected: (id: string | null) => void;
  setSelectedFloor: (id: string | null) => void;
  setToolSelect: () => void;
  setUnderlayStatus: (message: string) => void;
  tb: FloorBoundaryToolbar;
};

export function createFloorBoundaryController(ctx: FloorBoundaryControllerContext) {
  const syncDrawOrthoUi = () => {
    ctx.floorEdit.ortho = ctx.drawOrthoEnabled;
    if (ctx.drawOrthoToggleEl) {
      ctx.drawOrthoToggleEl.textContent = `Ortho ${ctx.drawOrthoEnabled ? "ON" : "OFF"}`;
      ctx.drawOrthoToggleEl.style.background = ctx.drawOrthoEnabled ? "rgba(16,42,60,0.96)" : "rgba(22,24,29,0.96)";
      ctx.drawOrthoToggleEl.style.borderColor = ctx.drawOrthoEnabled ? "#53c6ff" : "rgba(255,255,255,0.14)";
      ctx.drawOrthoToggleEl.style.color = ctx.drawOrthoEnabled ? "#dff6ff" : "#d7dde6";
    }
  };

  const toggleDrawOrthoMode = () => {
    ctx.drawOrthoEnabled = !ctx.drawOrthoEnabled;
    syncDrawOrthoUi();
    if (ctx.floorEdit.active) {
      buildFloorBoundaryTopbar();
      renderFloorBoundaryEdit();
    }
    if (ctx.kitchenWorktopDraw.active && ctx.kitchenWorktopDraw.points.length > 0) {
      ctx.scheduleKitchenWorktopPreviewUpdate();
      ctx.mountProps();
    }
  };

  const floorOrthoPoint = (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => {
    return computeFloorOrthoPoint(start, raw, ctx.drawOrthoEnabled);
  };

  const moveFloorEditVertex = (startSegments: FloorBoundarySegment[], startPoint: FloorBoundaryPoint, nextPoint: FloorBoundaryPoint) => {
    ctx.floorEdit.segments = moveFloorEditVertexBase(startSegments, startPoint, nextPoint);
  };

  const moveFloorEditSegment = (
    startSegments: FloorBoundarySegment[],
    segmentIndex: number,
    startWorld: FloorBoundaryPoint,
    nextWorld: FloorBoundaryPoint
  ) => {
    ctx.floorEdit.segments = moveFloorEditSegmentBase(startSegments, segmentIndex, startWorld, nextWorld);
  };

  const pickFloorEditElement = (mousePx: { x: number; y: number }, rect: DOMRect) =>
    pickFloorEditElementBase({ floorEdit: ctx.floorEdit, mousePx, rect, camera: ctx.cam() });

  const clearFloorBoundaryGroup = () => clearFloorBoundaryGroupBase(ctx.floorBoundaryGroup);

  const renderFloorBoundaryEdit = () => renderFloorBoundaryEditBase({ group: ctx.floorBoundaryGroup, floorEdit: ctx.floorEdit });

  const setFloorBoundaryTool = (tool: FloorBoundaryTool) => {
    ctx.floorEdit.tool = tool;
    ctx.floorEdit.first = null;
    ctx.floorEdit.hover = null;
    ctx.clearToolHud();
    renderFloorBoundaryEdit();
    reportEditorToolEntryStatus(ctx,
      tool === "pickLines"
        ? "Floor boundary: Pick Lines - klikni hranu steny."
        : tool === "rectangle"
          ? "Floor boundary: Rectangle - klikni prvy a druhy roh."
          : tool === "circle"
            ? "Floor boundary: Circle - klikni stred a polomer."
            : "Floor boundary: Line - klikaj body boundary line."
    );
  };

  const buildFloorBoundaryTopbar = () => {
    ctx.tb.clear();
    ctx.buildClassicTopbar();
    const row = ctx.tb.addRow({ title: "Floor boundary", className: "topbar-floor-ribbon" });
    const draw = ctx.tb.addGroup("Draw", { row });
    ctx.tb.toolButton(draw, { title: "Line", iconSvg: ctx.I_DIM, label: "Line", onClick: () => setFloorBoundaryTool("line") });
    ctx.tb.toolButton(draw, { title: "Rectangle", iconSvg: ctx.I_GRID2D, label: "Rectangle", onClick: () => setFloorBoundaryTool("rectangle") });
    ctx.tb.toolButton(draw, { title: "Circle", iconSvg: ctx.I_VIEW, label: "Circle", onClick: () => setFloorBoundaryTool("circle") });
    ctx.tb.toolButton(draw, { title: "Pick Lines", iconSvg: ctx.I_ALIGN, label: "Pick Lines", onClick: () => setFloorBoundaryTool("pickLines") });
    ctx.tb.toolButton(draw, {
      title: "Ortho kreslenie",
      iconSvg: ctx.I_ALIGN,
      label: ctx.drawOrthoEnabled ? "Ortho ON" : "Ortho OFF",
      onClick: () => {
        toggleDrawOrthoMode();
        buildFloorBoundaryTopbar();
        ctx.mountProps();
      }
    });
    ctx.tb.addSpacer({ row });
    const finish = ctx.tb.addGroup("Boundary", { row });
    ctx.tb.toolButton(finish, { title: "Dokoncit podlahu", iconSvg: ctx.I_DONE, label: "Dokoncit", variant: "success", onClick: () => finishFloorBoundaryEdit() });
    ctx.tb.toolButton(finish, { title: "Zrusit", iconSvg: ctx.I_CANCEL, label: "Zrusit", variant: "danger", onClick: () => discardFloorBoundaryEdit() });
  };

  const ensureFloorOverlay = () => {
    ctx.floorEdit.overlayEl?.remove();
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(255,255,255,0.14)";
    overlay.style.mixBlendMode = "screen";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "9";
    ctx.args.viewerEl.appendChild(overlay);
    ctx.floorEdit.overlayEl = overlay;
  };

  const enterFloorBoundaryEdit = (floorId?: string) => {
    ctx.ensureLayoutMode();
    ctx.ensureFloorplanViewerTab();
    if (ctx.placement.active) ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
    ctx.setToolSelect();

    const existing = floorId ? ctx.floors.find((floor) => floor.id === floorId) ?? null : null;
    const params = existing
      ? ctx.cloneFloorParams(existing.params)
      : {
          name: `Podlaha ${ctx.floorCounter}`,
          heightMm: ctx.floorDefault.heightMm,
          thicknessMm: ctx.floorDefault.thicknessMm,
          materialId: ctx.floorDefault.materialId,
          boundary: []
        };

    ctx.floorEdit.active = true;
    ctx.floorEdit.floorId = existing?.id ?? null;
    ctx.floorEdit.params = params;
    ctx.floorEdit.snapshot = existing ? ctx.cloneFloorParams(existing.params) : null;
    ctx.floorEdit.segments = floorBoundaryToSegments(params.boundary);
    ctx.floorEdit.tool = "line";
    ctx.floorEdit.first = null;
    ctx.floorEdit.hover = null;
    ctx.floorEdit.selectedSegmentIndex = null;
    ctx.floorEdit.selectedVertex = null;
    ctx.floorEdit.drag = null;
    ctx.floorEdit.error = "";
    clearDrawingToolSelection(ctx);
    ensureFloorOverlay();
    buildFloorBoundaryTopbar();
    renderFloorBoundaryEdit();
    reportEditorToolEntryStatus(ctx, "Floor boundary: Line - kresli boundary line alebo pouzi Pick Lines.");
  };

  const exitFloorBoundaryEditCommon = () => {
    ctx.floorEdit.active = false;
    ctx.floorEdit.floorId = null;
    ctx.floorEdit.params = null;
    ctx.floorEdit.snapshot = null;
    ctx.floorEdit.segments = [];
    ctx.floorEdit.first = null;
    ctx.floorEdit.hover = null;
    ctx.floorEdit.selectedSegmentIndex = null;
    ctx.floorEdit.selectedVertex = null;
    ctx.floorEdit.drag = null;
    ctx.floorEdit.error = "";
    ctx.floorEdit.overlayEl?.remove();
    ctx.floorEdit.overlayEl = null;
    clearFloorBoundaryGroup();
    ctx.clearToolHud();
    ctx.rebuildStandardTopbar();
    ctx.mountProps();
  };

  const finishFloorBoundaryEdit = () => {
    if (!ctx.floorEdit.active || !ctx.floorEdit.params) return;
    const boundary = floorSegmentsToBoundary(ctx.floorEdit.segments);
    if (!boundary || boundary.length < 3) {
      ctx.floorEdit.error = "Boundary line nie je uzavreta. Uzavri loop alebo dopln chybajuce ciary.";
      reportEditorToolEntryStatus(ctx, "Floor boundary: boundary musi mat aspon 3 ciary.");
      return;
    }
    ctx.floorEdit.error = "";
    ctx.floorEdit.params.boundary = boundary;
    let floor = ctx.floorEdit.floorId ? ctx.floors.find((item) => item.id === ctx.floorEdit.floorId) ?? null : null;
    if (floor) {
      floor.params = ctx.cloneFloorParams(ctx.floorEdit.params);
      ctx.rebuildFloor(floor);
    } else {
      floor = ctx.createFloor(ctx.cloneFloorParams(ctx.floorEdit.params), { skipHistory: true });
    }
    ctx.selectedFloorId = floor.id;
    ctx.selectedKind = "floor";
    exitFloorBoundaryEditCommon();
    ctx.setSelectedFloor(floor.id);
    ctx.commitHistory(ctx.S);
    ctx.setUnderlayStatus("Floor boundary: ulozene.");
  };

  const discardFloorBoundaryEdit = () => {
    if (!ctx.floorEdit.active) return;
    const existing = ctx.floorEdit.floorId ? ctx.floors.find((floor) => floor.id === ctx.floorEdit.floorId) ?? null : null;
    if (existing && ctx.floorEdit.snapshot) {
      existing.params = ctx.cloneFloorParams(ctx.floorEdit.snapshot);
      ctx.rebuildFloor(existing);
    }
    exitFloorBoundaryEditCommon();
    ctx.setUnderlayStatus("Floor boundary: zrusene.");
  };

  const addFloorEditSegment = (a: FloorBoundaryPoint, b: FloorBoundaryPoint) => {
    if (floorPointDistMm(a, b) < 2) return;
    ctx.floorEdit.error = "";
    ctx.floorEdit.segments.push({ a: { ...a }, b: { ...b } });
    renderFloorBoundaryEdit();
  };

  return {
    addFloorEditSegment,
    buildFloorBoundaryTopbar,
    clearFloorBoundaryGroup,
    discardFloorBoundaryEdit,
    enterFloorBoundaryEdit,
    floorOrthoPoint,
    moveFloorEditSegment,
    moveFloorEditVertex,
    pickFloorEditElement,
    renderFloorBoundaryEdit,
    setFloorBoundaryTool,
    syncDrawOrthoUi,
    toggleDrawOrthoMode
  };
}
