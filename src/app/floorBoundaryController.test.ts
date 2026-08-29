import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";
import type { AppArgs } from "./bootstrap";
import { createFloorBoundaryController } from "./floorBoundaryController";
import type { FloorBoundaryTool, FloorInstance, FloorParams } from "./localTypes";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

type FloorBoundaryContext = Parameters<typeof createFloorBoundaryController>[0];

function floorParams(overrides: Partial<FloorParams> = {}): FloorParams {
  return {
    name: "Podlaha 1",
    heightMm: 0,
    thicknessMm: 120,
    materialId: "floor",
    boundary: [],
    ...overrides
  };
}

function createToolbar() {
  const buttons: Array<{ label: string; onClick: () => void }> = [];
  return {
    buttons,
    clear: vi.fn(),
    addRow: vi.fn(() => new FakeElement() as FakeElement & HTMLElement),
    addGroup: vi.fn(() => new FakeElement() as FakeElement & HTMLElement),
    addSpacer: vi.fn(),
    toolButton: vi.fn((_group: HTMLElement, opts: { label: string; onClick: () => void }) => {
      buttons.push({ label: opts.label, onClick: opts.onClick });
      return new FakeElement() as FakeElement & HTMLButtonElement;
    })
  };
}

function createContext(overrides: Partial<FloorBoundaryContext> = {}): FloorBoundaryContext {
  const viewerEl = new FakeElement() as FakeElement & HTMLElement;
  return {
    I_ALIGN: "align",
    I_CANCEL: "cancel",
    I_DIM: "dim",
    I_DONE: "done",
    I_GRID2D: "grid",
    I_VIEW: "view",
    S: {} as AppState,
    args: { viewerEl } as unknown as AppArgs & { viewerEl: HTMLElement },
    buildClassicTopbar: vi.fn(),
    cam: vi.fn(() => new THREE.OrthographicCamera()),
    cancelPlacement: vi.fn(),
    clearToolHud: vi.fn(),
    cloneFloorParams: vi.fn((params: FloorParams) => structuredClone(params)),
    commitHistory: vi.fn(),
    createFloor: vi.fn((params: FloorParams) => ({ id: "floor-1", params }) as FloorInstance),
    drawOrthoEnabled: false,
    drawOrthoToggleEl: null,
    ensureFloorplanViewerTab: vi.fn(),
    ensureLayoutMode: vi.fn(),
    floorBoundaryGroup: new THREE.Group(),
    floorCounter: 1,
    floorDefault: { heightMm: 0, thicknessMm: 120, materialId: "floor" },
    floorEdit: {
      active: false,
      floorId: null,
      params: null,
      snapshot: null,
      segments: [],
      tool: "line" as FloorBoundaryTool,
      ortho: false,
      first: null,
      hover: null,
      selectedSegmentIndex: null,
      selectedVertex: null,
      drag: null,
      error: "",
      overlayEl: null
    },
    floors: [],
    kitchenWorktopDraw: { active: false, points: [] },
    mountProps: vi.fn(),
    placement: { active: false },
    placementHelpers: {} as PlacementHelpers,
    rebuildFloor: vi.fn(),
    rebuildStandardTopbar: vi.fn(),
    scheduleKitchenWorktopPreviewUpdate: vi.fn(),
    selectedFloorId: null,
    selectedInstanceIds: new Set(),
    selectedKind: null,
    selectedWallId: null,
    selectedWallIds: new Set(),
    setInstanceSelected: vi.fn(),
    setSelectedFloor: vi.fn(),
    setToolSelect: vi.fn(),
    setUnderlayStatus: vi.fn(),
    tb: createToolbar(),
    ...overrides
  };
}

describe("floorBoundaryController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enters floor boundary editing with current status and props refresh behavior", () => {
    installFakeDocument();
    const ctx = createContext();
    const controller = createFloorBoundaryController(ctx);

    controller.enterFloorBoundaryEdit();

    expect(ctx.ensureLayoutMode).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.setToolSelect).toHaveBeenCalledOnce();
    expect(ctx.floorEdit.active).toBe(true);
    expect(ctx.floorEdit.params).toEqual(floorParams());
    expect(ctx.floorEdit.overlayEl).not.toBeNull();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Floor boundary: Line - kresli boundary line alebo pouzi Pick Lines.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("changes floor boundary tool with current status and props refresh behavior", () => {
    const ctx = createContext();
    const controller = createFloorBoundaryController(ctx);

    controller.setFloorBoundaryTool("rectangle");

    expect(ctx.floorEdit.tool).toBe("rectangle");
    expect(ctx.floorEdit.first).toBeNull();
    expect(ctx.floorEdit.hover).toBeNull();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Floor boundary: Rectangle - klikni prvy a druhy roh.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("keeps invalid floor boundary finish status and props refresh behavior", () => {
    installFakeDocument();
    const toolbar = createToolbar();
    const ctx = createContext({ tb: toolbar });
    const controller = createFloorBoundaryController(ctx);

    controller.enterFloorBoundaryEdit();
    vi.mocked(ctx.setUnderlayStatus).mockClear();
    vi.mocked(ctx.mountProps).mockClear();

    toolbar.buttons.find((button) => button.label === "Dokoncit")?.onClick();

    expect(ctx.floorEdit.active).toBe(true);
    expect(ctx.floorEdit.error).toBe("Boundary line nie je uzavreta. Uzavri loop alebo dopln chybajuce ciary.");
    expect(ctx.createFloor).not.toHaveBeenCalled();
    expect(ctx.commitHistory).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Floor boundary: boundary musi mat aspon 3 ciary.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
