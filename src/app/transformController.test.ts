import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createTransformController, type TransformControllerContext } from "./transformController";
import type { DoorParams, LayoutInstance, SectionInstance, SelectedKind, WallInstance, WindowParams } from "./localTypes";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { createInitialTransformState } from "./transformStateFactory";

function makeTransformState() {
  return createInitialTransformState();
}

function makeTransformContext(overrides: Partial<TransformControllerContext> = {}): TransformControllerContext {
  const base: TransformControllerContext = {
    S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
    mode: "layout",
    viewMode: "2d",
    layoutTool: "select",
    measureState: { enabled: false },
    dragState: { active: false },
    windowDragState: { active: false },
    doorDragState: { active: false },
    wallEditHud: { drag: null },
    marquee: { active: false },
    underlayCal: { active: false },
    selectedWallIds: new Set<string>(),
    selectedInstanceIds: new Set<string>(),
    selectedKind: null,
    selectedWallId: null,
    selectedInstanceId: null,
    selectedSectionId: null,
    windowInst: null,
    doorInst: null,
    walls: [],
    windows: [],
    doors: [],
    instances: [],
    sections: [],
    pinnedWallIds: new Set<string>(),
    wallJoinTolMm: 1,
    transformState: makeTransformState(),
    setUnderlayStatus: vi.fn(),
    mountProps: vi.fn(),
    rebuildWall: vi.fn(),
    rebuildWallPlanMesh: vi.fn(),
    updateLayoutPanel: vi.fn(),
    updateSelectionHighlights: vi.fn(),
    cloneSectionParams: (params: SectionInstance["params"]) => structuredClone(params),
    updateSectionVisual: vi.fn(),
    updateWindowTransform: vi.fn(),
    updateDoorTransform: vi.fn(),
    instanceWorldBox: () => new THREE.Box3(),
    detectModuleAdjacency: () => null,
    mmDist: (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
    findInstance: (id) => base.instances.find((instance) => instance.id === id) ?? null,
    applyWallConstraints: (_instance, desired) => desired.clone(),
    snapPositionDetailed: (_instance, desired) => ({ position: desired.clone() }),
    autoOrientModuleToRoomWallIfSnapped: vi.fn(),
    nudgePinnedModuleChain: vi.fn(),
    instanceFitsRoom: () => true,
    anyOverlapIgnoring: () => false,
    anyOverlap: () => false,
    moduleOverlapsWalls: () => false,
    moduleOverlapsKitchenWorktops: () => false,
    inferKitchenPlacementBinding: (instance: LayoutInstance) => instance.kitchenPlacement,
    fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
    toMmPoint: (point) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) })
  };
  Object.defineProperties(base, Object.getOwnPropertyDescriptors(overrides));
  return base;
}

function createTestTransformController(overrides: Partial<TransformControllerContext>) {
  return createTransformController(makeTransformContext(overrides));
}

describe("transform move tool", () => {
  it("enters Revit-style selection step when Move starts with no selection", () => {
    const transformState = makeTransformState();
    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      selectedKind: null,
      selectedWallId: null,
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [],
      windows: [],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform: vi.fn()
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("selectElements");
  });

  it("keeps sticky move active after a completed move until toggled off", () => {
    const transformState = makeTransformState();
    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      selectedKind: null,
      selectedWallId: null,
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [],
      windows: [],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform: vi.fn()
    });

    expect(controller.startTransformFromSelection("move", { sticky: true, toggle: true })).toBe(true);
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("selectElements");
    expect(transformState.stickyMove).toBe(true);

    transformState.moveSnapDisabled = true;
    controller.clearTransform({ continueMove: true, status: "Move: done." });
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("selectElements");
    expect(transformState.stickyMove).toBe(true);
    expect(transformState.moveSnapDisabled).toBe(true);

    expect(controller.startTransformFromSelection("move", { sticky: true, toggle: true })).toBe(true);
    expect(transformState.kind).toBeNull();
    expect(transformState.stickyMove).toBe(false);
    expect(transformState.moveSnapDisabled).toBe(false);
  });

  it("can toggle sticky move off outside the floorplan view", () => {
    const transformState = makeTransformState();
    transformState.kind = "move";
    transformState.step = "selectElements";
    transformState.stickyMove = true;
    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "3d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      selectedKind: null,
      selectedWallId: null,
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [],
      windows: [],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform: vi.fn()
    });

    expect(controller.startTransformFromSelection("move", { sticky: true, toggle: true })).toBe(true);
    expect(transformState.kind).toBeNull();
    expect(transformState.stickyMove).toBe(false);
  });

  it("starts from a single wall selected after controller creation", () => {
    let selectedKind: SelectedKind = null;
    let selectedWallId: string | null = null;
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 },
        thicknessMm: 150,
        heightMm: 2600,
        materialId: "wall"
      }
    } as WallInstance;
    const transformState = makeTransformState();

    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      get selectedKind() { return selectedKind; },
      get selectedWallId() { return selectedWallId; },
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [wall],
      windows: [],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform: vi.fn()
    });

    selectedKind = "wall";
    selectedWallId = "w1";

    expect(controller.startTransformFromSelection("move")).toBe(true);
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("pickBase");
    expect(transformState.selectedWallIds).toEqual(["w1"]);
    expect(transformState.startWalls.get("w1")).toEqual(wall.params);
  });

  it("moves selected window openings along their host wall", () => {
    let selectedKind: SelectedKind = "window";
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 2000, z: 0 },
        thicknessMm: 150,
        heightMm: 2600,
        materialId: "wall"
      }
    } as WallInstance;
    const window: { id: string; params: WindowParams } = {
      id: "win1",
      params: {
        wall: "back",
        wallId: "w1",
        widthMm: 600,
        heightMm: 900,
        sillHeightMm: 900,
        centerMm: 500,
        frameWidthMm: 70,
        offsetFromInteriorMm: 0,
        sashWidthMm: 50,
        sashProfileDepthMm: 50,
        frameProfileDepthMm: 70,
        swingDirection: "right",
        swingSide: "inward",
        swingAngleDeg: 90,
        handleType: "lever",
        handleOffsetMm: 70,
        handleHeightMm: 450,
        materialId: "window"
      }
    };
    const transformState = makeTransformState();
    const updateWindowTransform = vi.fn();

    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      get selectedKind() { return selectedKind; },
      selectedWallId: null,
      get windowInst() { return window; },
      doorInst: null,
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [wall],
      windows: [window],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform,
      updateDoorTransform: vi.fn(),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      updateLayoutPanel: vi.fn()
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    controller.applyMoveDelta(new THREE.Vector3(0.25, 0, 0));

    expect(transformState.selectedWindowIds).toEqual(["win1"]);
    expect(window.params.centerMm).toBe(750);
    expect(updateWindowTransform).toHaveBeenCalledWith(window);
  });

  it("keeps selected window openings inside their host wall while moving", () => {
    let selectedKind: SelectedKind = "window";
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 },
        thicknessMm: 150,
        heightMm: 2600,
        materialId: "wall"
      }
    } as WallInstance;
    const window: { id: string; params: WindowParams } = {
      id: "win1",
      params: {
        wall: "back",
        wallId: "w1",
        widthMm: 600,
        heightMm: 900,
        sillHeightMm: 900,
        centerMm: 500,
        frameWidthMm: 70,
        offsetFromInteriorMm: 0,
        sashWidthMm: 50,
        sashProfileDepthMm: 50,
        frameProfileDepthMm: 70,
        swingDirection: "right",
        swingSide: "inward",
        swingAngleDeg: 90,
        handleType: "lever",
        handleOffsetMm: 70,
        handleHeightMm: 450,
        materialId: "window"
      }
    };
    const transformState = makeTransformState();
    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      get selectedKind() { return selectedKind; },
      selectedWallId: null,
      get windowInst() { return window; },
      doorInst: null,
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [wall],
      windows: [window],
      doors: [],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform: vi.fn(),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      updateLayoutPanel: vi.fn()
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    controller.applyMoveDelta(new THREE.Vector3(-1, 0, 0));
    expect(window.params.centerMm).toBe(300);

    controller.applyMoveDelta(new THREE.Vector3(1, 0, 0));
    expect(window.params.centerMm).toBe(700);
  });

  it("moves selected door openings along their host wall", () => {
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 0, z: 3000 },
        thicknessMm: 150,
        heightMm: 2600,
        materialId: "wall"
      }
    } as WallInstance;
    const door: { id: string; params: DoorParams } = {
      id: "door1",
      params: {
        wall: "back",
        wallId: "w1",
        widthMm: 900,
        heightMm: 2100,
        centerMm: 800,
        frameWidthMm: 70,
        offsetFromInteriorMm: 0,
        panelThicknessMm: 42,
        swingDirection: "right",
        swingSide: "inward",
        swingAngleDeg: 90,
        handleType: "lever",
        handleOffsetMm: 80,
        handleHeightMm: 1000,
        materialId: "door"
      }
    };
    const transformState = makeTransformState();
    const updateDoorTransform = vi.fn();

    const controller = createTestTransformController({
      S: { kitchenCtx: makeDefaultKitchenContext(), kitchenGroups: [] },
      get mode() { return "layout" as const; },
      get viewMode() { return "2d" as const; },
      get layoutTool() { return "select"; },
      measureState: { enabled: false },
      dragState: { active: false },
      windowDragState: { active: false },
      doorDragState: { active: false },
      wallEditHud: { drag: null },
      marquee: { active: false },
      underlayCal: { active: false },
      selectedWallIds: new Set<string>(),
      selectedInstanceIds: new Set<string>(),
      selectedKind: "door",
      selectedWallId: null,
      windowInst: null,
      get doorInst() { return door; },
      selectedInstanceId: null,
      selectedSectionId: null,
      walls: [wall],
      windows: [],
      doors: [door],
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn(),
      updateWindowTransform: vi.fn(),
      updateDoorTransform,
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      updateLayoutPanel: vi.fn()
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    controller.applyMoveDelta(new THREE.Vector3(0, 0, 0.4));

    expect(transformState.selectedDoorIds).toEqual(["door1"]);
    expect(door.params.centerMm).toBe(1200);
    expect(updateDoorTransform).toHaveBeenCalledWith(door);
  });
});
