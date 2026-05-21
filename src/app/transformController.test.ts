import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createTransformController } from "./transformController";
import type { DoorParams, SelectedKind, WallInstance, WallParams, WindowParams } from "./localTypes";

function makeTransformState() {
  return {
    kind: null as null | "move" | "rotate",
    step: null as null | "selectElements" | "pickBase" | "pickTarget" | "pickPivot" | "rotating",
    stickyMove: false,
    moveSnapDisabled: false,
    base: null as THREE.Vector3 | null,
    pivot: null as THREE.Vector3 | null,
    typed: "",
    lastAngleSign: 1,
    lastPointerPx: { x: 0, y: 0 },
    selectedWallIds: [] as string[],
    selectedInstanceIds: [] as string[],
    selectedSectionIds: [] as string[],
    selectedWindowIds: [] as string[],
    selectedDoorIds: [] as string[],
    startWalls: new Map<string, WallParams>(),
    startInstances: new Map<string, { pos: THREE.Vector3; rotY: number }>(),
    startInstanceAdjacency: new Map<string, string | null>(),
    startSections: new Map(),
    startWindows: new Map<string, WindowParams>(),
    startDoors: new Map<string, DoorParams>(),
    startPointerAngle: 0,
    lastValidDelta: new THREE.Vector3(0, 0, 0),
    lastValidAngle: 0
  };
}

describe("transform move tool", () => {
  it("enters Revit-style selection step when Move starts with no selection", () => {
    const transformState = makeTransformState();
    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "3d"; },
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

    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
    const window = {
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

    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
    const door = {
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

    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
