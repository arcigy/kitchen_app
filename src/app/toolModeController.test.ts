import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  clearDrawingToolSelection,
  createToolModeController,
  type DrawingToolSelectionState,
  type ToolModeControllerContext
} from "./toolModeController";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";

const createSelectionState = (): DrawingToolSelectionState => ({
  selectedFloorId: "floor-1",
  selectedInstanceIds: new Set(["module-1", "module-2"]),
  selectedKind: "module",
  selectedWallId: "wall-1",
  selectedWallIds: new Set(["wall-1", "wall-2"]),
  setInstanceSelected: vi.fn()
});

describe("clearDrawingToolSelection", () => {
  it("preserves current drawing tool selection clearing behavior", () => {
    const state = createSelectionState();

    clearDrawingToolSelection(state);

    expect(state.selectedKind).toBeNull();
    expect(state.selectedWallId).toBeNull();
    expect(state.selectedFloorId).toBeNull();
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(state.setInstanceSelected).toHaveBeenCalledWith(null);
    expect(state.setInstanceSelected).toHaveBeenCalledTimes(1);
  });
});

const createToolModeContext = (): ToolModeControllerContext => ({
  S: { kitchenEditMode: false } as AppState,
  alignState: { ref: null, hover: null, lastA: null, lastB: null, lastUntilMs: 0 },
  args: {
    measureBtn: { textContent: "" } as HTMLButtonElement,
    measureReadoutEl: { textContent: "" } as HTMLElement
  } as ToolModeControllerContext["args"],
  cancelKitchenWorktopDraw: vi.fn(),
  cancelColumnPlacement: vi.fn(),
  cancelPlacement: vi.fn(),
  cancelSectionDraw: vi.fn(),
  clearAllMeasurements: vi.fn(),
  clearPreview: vi.fn(),
  clearToolHud: vi.fn(),
  clearTransform: vi.fn(),
  dimensionState: { picked: [] },
  drawSnapOverlay: { hide: vi.fn() },
  ensureFloorplanViewerTab: vi.fn(),
  ensureLayoutMode: vi.fn(),
  hideHoverCursor: vi.fn(),
  isColumnPlacementActive: () => false,
  isEscapeKey: () => false,
  isTypingTarget: () => false,
  layoutRoot: new THREE.Group(),
  layoutTool: "select",
  measurePlanSnap: null,
  measureState: { enabled: false, measures: [], firstPoint: null, firstBinding: null, hoverPoint: null, hoverSnap: "none" },
  mode: "layout",
  mountProps: vi.fn(),
  placement: { active: false },
  placementHelpers: {} as PlacementHelpers,
  resetMeasureSnapCycle: vi.fn(),
  scene: new THREE.Scene(),
  sectionDraw: { active: false, a: null, hoverPoint: null },
  selectedFloorId: "floor-1",
  selectedInstanceIds: new Set(["module-1", "module-2"]),
  selectedKind: "module",
  selectedKitchenGroupId: null,
  selectedSectionId: null,
  selectedUnderlayBox: null,
  selectedWallBox: null,
  selectedWallId: "wall-1",
  selectedWallIds: new Set(["wall-1", "wall-2"]),
  setFirstPointMarker: vi.fn(),
  setInstanceSelected: vi.fn(),
  setUnderlayStatus: vi.fn(),
  showWallSnapMarkersFor: vi.fn(),
  syncSelectionState: vi.fn(),
  technicalDimensions: { resetDraft: vi.fn() },
  transformState: { kind: null, step: null },
  trimState: {
    step: "pickTarget",
    targetWallId: null,
    targetPick: null,
    targetClick: null,
    hover: null,
    lastTarget: null,
    lastCutter: null,
    lastUntilMs: 0
  },
  updateAllSectionVisuals: vi.fn(),
  updateSectionDrawPreview: vi.fn(),
  updateSelectionHighlights: vi.fn(),
  wallDraw: {
    active: true,
    a: null,
    chainStart: null,
    segments: 0,
    hoverB: null,
    typedMm: "1200",
    preview: null
  },
  wallDrawSnap: null,
  wallTypedHud: { textContent: "", style: { display: "block" } } as unknown as HTMLElement
});

describe("createToolModeController", () => {
  it("setToolWall clears stale multi-selection state through the drawing selection command", () => {
    const ctx = createToolModeContext();
    const controller = createToolModeController(ctx);

    controller.setToolWall();

    expect(ctx.layoutTool).toBe("wall");
    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect([...ctx.selectedWallIds]).toEqual([]);
    expect([...ctx.selectedInstanceIds]).toEqual([]);
    expect(ctx.setInstanceSelected).toHaveBeenCalledWith(null);
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledTimes(1);
    expect(ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("setToolSection clears stale section and kitchen group selection state", () => {
    const ctx = createToolModeContext();
    ctx.selectedKind = "section";
    ctx.selectedSectionId = "section-1";
    ctx.selectedKitchenGroupId = "kitchen-group-1";
    const controller = createToolModeController(ctx);

    controller.setToolSection();

    expect(ctx.layoutTool).toBe("section");
    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.sectionDraw.active).toBe(true);
    expect(ctx.syncSelectionState).toHaveBeenCalledTimes(1);
    expect(ctx.updateAllSectionVisuals).toHaveBeenCalledTimes(1);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(ctx.mountProps).toHaveBeenCalledTimes(1);
  });
});
