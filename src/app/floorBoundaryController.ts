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
import type { FloorBoundaryPoint, FloorBoundarySegment, FloorBoundaryTool } from "./localTypes";

export function createFloorBoundaryController(ctx: any) {
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
    ctx.setUnderlayStatus(
      tool === "pickLines"
        ? "Floor boundary: Pick Lines - klikni hranu steny."
        : tool === "rectangle"
          ? "Floor boundary: Rectangle - klikni prvy a druhy roh."
          : tool === "circle"
            ? "Floor boundary: Circle - klikni stred a polomer."
            : "Floor boundary: Line - klikaj body boundary line."
    );
    ctx.mountProps();
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

    const existing = floorId ? ctx.floors.find((floor: any) => floor.id === floorId) ?? null : null;
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
    ctx.selectedKind = null;
    ctx.selectedFloorId = null;
    ctx.selectedWallId = null;
    ctx.selectedWallIds.clear();
    ctx.selectedInstanceIds.clear();
    ctx.setInstanceSelected(null);
    ensureFloorOverlay();
    buildFloorBoundaryTopbar();
    renderFloorBoundaryEdit();
    ctx.setUnderlayStatus("Floor boundary: Line - kresli boundary line alebo pouzi Pick Lines.");
    ctx.mountProps();
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
      ctx.setUnderlayStatus("Floor boundary: boundary musi mat aspon 3 ciary.");
      ctx.mountProps();
      return;
    }
    ctx.floorEdit.error = "";
    ctx.floorEdit.params.boundary = boundary;
    let floor = ctx.floorEdit.floorId ? ctx.floors.find((item: any) => item.id === ctx.floorEdit.floorId) ?? null : null;
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
    const existing = ctx.floorEdit.floorId ? ctx.floors.find((floor: any) => floor.id === ctx.floorEdit.floorId) ?? null : null;
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
