import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  canStartTransformFromSelection,
  captureTransformStartState,
  createTransformController,
  enterMoveSelectElementsWithoutSelection,
  isTransformModuleMoveValid,
  resolveMovedOpeningCenterMm,
  resolveMovedSectionParams,
  resolveTransformSelectionIds,
  resetTransformStateForClear,
  updateMovedModuleKitchenPlacements,
  type TransformControllerContext
} from "./transformController";
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

function moduleInstance(id: string, position: THREE.Vector3, kitchenGroupId: string | null = null) {
  const root = new THREE.Group();
  root.position.copy(position);
  return {
    id,
    params: {} as LayoutInstance["params"],
    kitchenGroupId,
    kitchenPlacement: null,
    root,
    module: new THREE.Group(),
    localBox: new THREE.Box3(),
    pick: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as LayoutInstance;
}

describe("transform move tool", () => {
  it("resets transform state for clear without replacing vector and map containers", () => {
    const transformState = makeTransformState();
    const lastValidDelta = transformState.lastValidDelta;
    const startWalls = transformState.startWalls;
    transformState.kind = "move";
    transformState.step = "pickTarget";
    transformState.stickyMove = true;
    transformState.moveSnapDisabled = true;
    transformState.base = new THREE.Vector3(1, 0, 2);
    transformState.pivot = new THREE.Vector3(3, 0, 4);
    transformState.typed = "123";
    transformState.lastAngleSign = -1;
    transformState.selectedWallIds = ["w1"];
    transformState.selectedInstanceIds = ["m1"];
    transformState.selectedSectionIds = ["s1"];
    transformState.selectedWindowIds = ["win1"];
    transformState.selectedDoorIds = ["door1"];
    transformState.startWalls.set("w1", { aMm: { x: 0, z: 0 }, bMm: { x: 1, z: 1 }, thicknessMm: 1, heightMm: 1, materialId: "wall" });
    transformState.startInstances.set("m1", { pos: new THREE.Vector3(1, 0, 1), rotY: 0.5 });
    transformState.startInstanceAdjacency.set("m1", "m2");
    transformState.startSections.set("s1", { aMm: { x: 0, z: 0 }, bMm: { x: 1, z: 1 } } as SectionInstance["params"]);
    transformState.startWindows.set("win1", { wallId: "w1", widthMm: 500 } as WindowParams);
    transformState.startDoors.set("door1", { wallId: "w1", widthMm: 800 } as DoorParams);
    transformState.startPointerAngle = 0.75;
    transformState.lastValidDelta.set(1, 2, 3);
    transformState.lastValidAngle = 0.5;

    resetTransformStateForClear(transformState);

    expect(transformState.kind).toBeNull();
    expect(transformState.step).toBeNull();
    expect(transformState.stickyMove).toBe(false);
    expect(transformState.moveSnapDisabled).toBe(false);
    expect(transformState.base).toBeNull();
    expect(transformState.pivot).toBeNull();
    expect(transformState.typed).toBe("");
    expect(transformState.lastAngleSign).toBe(1);
    expect(transformState.selectedWallIds).toEqual([]);
    expect(transformState.selectedInstanceIds).toEqual([]);
    expect(transformState.selectedSectionIds).toEqual([]);
    expect(transformState.selectedWindowIds).toEqual([]);
    expect(transformState.selectedDoorIds).toEqual([]);
    expect(transformState.startWalls).toBe(startWalls);
    expect(transformState.startWalls.size).toBe(0);
    expect(transformState.startInstances.size).toBe(0);
    expect(transformState.startInstanceAdjacency.size).toBe(0);
    expect(transformState.startSections.size).toBe(0);
    expect(transformState.startWindows.size).toBe(0);
    expect(transformState.startDoors.size).toBe(0);
    expect(transformState.startPointerAngle).toBe(0);
    expect(transformState.lastValidDelta).toBe(lastValidDelta);
    expect(transformState.lastValidDelta.toArray()).toEqual([0, 0, 0]);
    expect(transformState.lastValidAngle).toBe(0);
  });

  it("keeps start transform guard limited to idle layout 2d select mode", () => {
    const base = makeTransformContext();

    expect(canStartTransformFromSelection(base)).toBe(true);
    expect(canStartTransformFromSelection({ ...base, mode: "build" })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, viewMode: "3d" })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, layoutTool: "wall" })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, measureState: { enabled: true } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, dragState: { active: true } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, windowDragState: { active: true } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, doorDragState: { active: true } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, wallEditHud: { drag: {} } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, marquee: { active: true } })).toBe(false);
    expect(canStartTransformFromSelection({ ...base, underlayCal: { active: true } })).toBe(false);
  });

  it("captures transform start snapshots for geometry and selected module adjacency", () => {
    const wall = {
      id: "w1",
      params: { aMm: { x: 0, z: 0 }, bMm: { x: 1000, z: 0 }, thicknessMm: 100, heightMm: 2600, materialId: "wall" }
    } as WallInstance;
    const selected = moduleInstance("m1", new THREE.Vector3(1, 0, 2), "kg1");
    selected.root.rotation.y = 0.5;
    const neighbor = moduleInstance("m2", new THREE.Vector3(3, 0, 4), "kg1");
    const otherGroup = moduleInstance("m3", new THREE.Vector3(5, 0, 6), "kg2");
    const section = { id: "s1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 10, z: 10 } } } as SectionInstance;
    const window = { id: "win1", params: { wallId: "w1", widthMm: 500 } as WindowParams };
    const door = { id: "door1", params: { wallId: "w1", widthMm: 800 } as DoorParams };
    const detectModuleAdjacency = vi.fn((_box: THREE.Box3, _otherBox: THREE.Box3, otherId: string) => otherId === "m2");
    const transformState = makeTransformState();
    const ctx = makeTransformContext({
      walls: [wall],
      instances: [selected, neighbor, otherGroup],
      sections: [section],
      windows: [window],
      doors: [door],
      transformState,
      instanceWorldBox: vi.fn(() => new THREE.Box3()),
      detectModuleAdjacency
    });

    captureTransformStartState(ctx, ["m1"]);

    expect(transformState.startWalls.get("w1")).toEqual(wall.params);
    expect(transformState.startWalls.get("w1")).not.toBe(wall.params);
    expect(transformState.startInstances.get("m1")?.pos.toArray()).toEqual([1, 0, 2]);
    expect(transformState.startInstances.get("m1")?.rotY).toBe(0.5);
    expect(transformState.startInstanceAdjacency.get("m1")).toBe("m2");
    expect(detectModuleAdjacency).toHaveBeenCalledTimes(1);
    expect(transformState.startSections.get("s1")).toEqual(section.params);
    expect(transformState.startSections.get("s1")).not.toBe(section.params);
    expect(transformState.startWindows.get("win1")).toEqual(window.params);
    expect(transformState.startWindows.get("win1")).not.toBe(window.params);
    expect(transformState.startDoors.get("door1")).toEqual(door.params);
    expect(transformState.startDoors.get("door1")).not.toBe(door.params);
  });

  it("enters no-selection Move select-elements state with current statuses and side-effect order", () => {
    const transformState = makeTransformState();
    const clearTransform = vi.fn();
    const mountProps = vi.fn();
    const setUnderlayStatus = vi.fn();

    enterMoveSelectElementsWithoutSelection({
      clearTransform,
      mountProps,
      moveSnapDisabled: false,
      setUnderlayStatus,
      stickyMove: false,
      transformState
    });

    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("selectElements");
    expect(transformState.stickyMove).toBe(false);
    expect(transformState.moveSnapDisabled).toBe(false);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move (M): select elements, then press Enter. N = free movement.");
    expect(mountProps).toHaveBeenCalledExactlyOnceWith();
    expect(clearTransform.mock.invocationCallOrder[0]).toBeLessThan(setUnderlayStatus.mock.invocationCallOrder[0]);
    expect(setUnderlayStatus.mock.invocationCallOrder[0]).toBeLessThan(mountProps.mock.invocationCallOrder[0]);

    enterMoveSelectElementsWithoutSelection({
      clearTransform,
      mountProps,
      moveSnapDisabled: true,
      setUnderlayStatus,
      stickyMove: true,
      transformState
    });

    expect(transformState.stickyMove).toBe(true);
    expect(transformState.moveSnapDisabled).toBe(true);
    expect(setUnderlayStatus).toHaveBeenLastCalledWith("Move: select element to move. Click Move again to exit. N = free movement.");
  });

  it("resolves transform ids with current multi-selection priority", () => {
    expect(
      resolveTransformSelectionIds({
        kind: "move",
        selectedWallIds: new Set(["w1", "w2"]),
        selectedInstanceIds: new Set(["m1", "m2"]),
        selectedKind: "wall",
        selectedWallId: "w-single",
        selectedInstanceId: "m-single",
        selectedSectionId: null
      })
    ).toEqual({
      wallIds: ["w1", "w2"],
      instIds: ["m1", "m2"],
      sectionIds: [],
      windowIds: [],
      doorIds: []
    });
  });

  it("resolves transform ids from current single selection fallback", () => {
    expect(
      resolveTransformSelectionIds({
        kind: "move",
        selectedWallIds: new Set(),
        selectedInstanceIds: new Set(),
        selectedKind: "module",
        selectedWallId: null,
        selectedInstanceId: "m-single",
        selectedSectionId: null
      })
    ).toEqual({
      wallIds: [],
      instIds: ["m-single"],
      sectionIds: [],
      windowIds: [],
      doorIds: []
    });

    expect(
      resolveTransformSelectionIds({
        kind: "move",
        selectedWallIds: new Set(),
        selectedInstanceIds: new Set(),
        selectedKind: "section",
        selectedWallId: null,
        selectedInstanceId: null,
        selectedSectionId: "s1"
      })
    ).toMatchObject({ sectionIds: ["s1"] });
  });

  it("resolves opening transform ids only for move", () => {
    expect(
      resolveTransformSelectionIds({
        kind: "move",
        selectedWallIds: new Set(),
        selectedInstanceIds: new Set(),
        selectedKind: "window",
        selectedWallId: null,
        selectedInstanceId: null,
        selectedSectionId: null,
        windowInst: { id: "win1" }
      }).windowIds
    ).toEqual(["win1"]);

    expect(
      resolveTransformSelectionIds({
        kind: "rotate",
        selectedWallIds: new Set(),
        selectedInstanceIds: new Set(),
        selectedKind: "door",
        selectedWallId: null,
        selectedInstanceId: null,
        selectedSectionId: null,
        doorInst: { id: "door1" }
      }).doorIds
    ).toEqual([]);
  });

  it("resolves moved opening center along and inside the host wall", () => {
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
    const start = {
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
    } as WindowParams;

    expect(resolveMovedOpeningCenterMm({ delta: new THREE.Vector3(0.25, 0, 0), start, wall })).toBe(700);
    expect(resolveMovedOpeningCenterMm({ delta: new THREE.Vector3(-1, 0, 0), start, wall })).toBe(300);
  });

  it("does not resolve moved opening center without a valid host wall", () => {
    const start = {
      wall: "back",
      wallId: "",
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
    } as WindowParams;

    expect(resolveMovedOpeningCenterMm({ delta: new THREE.Vector3(0.25, 0, 0), start, wall: null })).toBeNull();
  });

  it("resolves moved section params from captured start params", () => {
    const start = {
      aMm: { x: 100, z: 200 },
      bMm: { x: 700, z: 800 },
      name: "A",
      mirrored: false
    };

    expect(resolveMovedSectionParams(start, { dxMm: 50, dzMm: -25 })).toMatchObject({
      aMm: { x: 150, z: 175 },
      bMm: { x: 750, z: 775 },
      name: "A",
      mirrored: false
    });
  });

  it("validates selected and global module move constraints", () => {
    const selected = moduleInstance("m1", new THREE.Vector3());
    const other = moduleInstance("m2", new THREE.Vector3());

    expect(
      isTransformModuleMoveValid({
        instances: [selected, other],
        selectedInstanceIds: ["m1"],
        ignoreIds: new Set(["m1"]),
        findInstance: (id) => (id === "m1" ? selected : null),
        instanceFitsRoom: () => true,
        anyOverlapIgnoring: () => false,
        anyOverlap: () => false,
        moduleOverlapsWalls: () => false,
        moduleOverlapsKitchenWorktops: () => false
      })
    ).toBe(true);

    expect(
      isTransformModuleMoveValid({
        instances: [selected, other],
        selectedInstanceIds: ["m1"],
        ignoreIds: new Set(["m1"]),
        findInstance: (id) => (id === "m1" ? selected : null),
        instanceFitsRoom: () => true,
        anyOverlapIgnoring: () => true,
        anyOverlap: () => false,
        moduleOverlapsWalls: () => false,
        moduleOverlapsKitchenWorktops: () => false
      })
    ).toBe(false);
  });

  it("keeps current global module validation after selected modules pass", () => {
    const selected = moduleInstance("m1", new THREE.Vector3());
    const other = moduleInstance("m2", new THREE.Vector3());

    expect(
      isTransformModuleMoveValid({
        instances: [selected, other],
        selectedInstanceIds: ["m1"],
        ignoreIds: new Set(["m1"]),
        findInstance: (id) => (id === "m1" ? selected : null),
        instanceFitsRoom: () => true,
        anyOverlapIgnoring: () => false,
        anyOverlap: (instance) => instance.id === "m2",
        moduleOverlapsWalls: () => false,
        moduleOverlapsKitchenWorktops: () => false
      })
    ).toBe(false);
  });

  it("updates moved module kitchen placements from group or default kitchen context", () => {
    const inGroup = moduleInstance("m1", new THREE.Vector3(), "kg1");
    const fallbackGroup = moduleInstance("m2", new THREE.Vector3(), "missing-group");
    const loose = moduleInstance("m3", new THREE.Vector3(), null);
    const inferKitchenPlacementBinding = vi.fn((instance: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: `${instance.id}-${kitchenGroupId}-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));

    updateMovedModuleKitchenPlacements({
      selectedInstanceIds: ["m1", "m2", "m3"],
      kitchenCtx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 30 },
      kitchenGroups: [{ id: "kg1", ctx: { ...makeDefaultKitchenContext(), worktopBackOffsetMm: 55 } }],
      findInstance: (id) => [inGroup, fallbackGroup, loose].find((item) => item.id === id) ?? null,
      inferKitchenPlacementBinding
    });

    expect(inferKitchenPlacementBinding).toHaveBeenCalledTimes(2);
    expect(inferKitchenPlacementBinding).toHaveBeenNthCalledWith(1, inGroup, "kg1", 55);
    expect(inferKitchenPlacementBinding).toHaveBeenNthCalledWith(2, fallbackGroup, "missing-group", 30);
    expect(inGroup.kitchenPlacement).toEqual({ worktopId: "m1-kg1-55", segmentIndex: 0, offsetAlongM: 0 });
    expect(fallbackGroup.kitchenPlacement).toEqual({ worktopId: "m2-missing-group-30", segmentIndex: 0, offsetAlongM: 0 });
    expect(loose.kitchenPlacement).toBeNull();
  });

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

  it("clearTransform restores captured wall and module start state", () => {
    const wall = {
      id: "w1",
      params: {
        aMm: { x: 100, z: 0 },
        bMm: { x: 1100, z: 0 },
        thicknessMm: 150,
        heightMm: 2600,
        materialId: "wall"
      }
    } as WallInstance;
    const instance = {
      id: "m1",
      root: new THREE.Object3D()
    } as LayoutInstance;
    instance.root.position.set(2, 0, 3);
    instance.root.rotation.y = 0.5;

    const transformState = makeTransformState();
    transformState.kind = "move";
    transformState.step = "pickTarget";
    transformState.startWalls.set("w1", {
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 0 },
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "wall"
    });
    transformState.startInstances.set("m1", { pos: new THREE.Vector3(1, 0, 1), rotY: 0.25 });

    const ctx = makeTransformContext({
      walls: [wall],
      instances: [instance],
      transformState
    });
    const controller = createTransformController(ctx);

    controller.clearTransform({ restore: true, status: "Canceled." });

    expect(wall.params.aMm).toEqual({ x: 0, z: 0 });
    expect(instance.root.position.toArray()).toEqual([1, 0, 1]);
    expect(instance.root.rotation.y).toBe(0.25);
    expect(transformState.kind).toBeNull();
    expect(ctx.rebuildWall).toHaveBeenCalledWith(wall);
    expect(ctx.rebuildWallPlanMesh).toHaveBeenCalledTimes(1);
    expect(ctx.updateLayoutPanel).toHaveBeenCalledTimes(1);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(ctx.mountProps).toHaveBeenCalledTimes(1);
    expect(ctx.setUnderlayStatus).toHaveBeenCalledWith("Canceled.");
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

  it("moves selected section lines from captured start params", () => {
    const section = {
      id: "section1",
      params: {
        aMm: { x: 100, z: 200 },
        bMm: { x: 700, z: 800 },
        name: "A",
        mirrored: false
      },
      root: new THREE.Group(),
      line: new THREE.Line(),
      arrows: new THREE.LineSegments(),
      pick: new THREE.Mesh()
    } as SectionInstance;
    const transformState = makeTransformState();
    const updateSectionVisual = vi.fn();

    const controller = createTestTransformController({
      selectedKind: "section",
      selectedSectionId: "section1",
      sections: [section],
      transformState,
      updateSectionVisual
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    controller.applyMoveDelta(new THREE.Vector3(0.05, 0, -0.025));

    expect(section.params.aMm).toEqual({ x: 150, z: 175 });
    expect(section.params.bMm).toEqual({ x: 750, z: 775 });
    expect(updateSectionVisual).toHaveBeenCalledWith(section);
  });

  it("moves selected modules through the current snap and pinned-chain path", () => {
    const instance = moduleInstance("m1", new THREE.Vector3(1, 0, 1));
    const transformState = makeTransformState();
    const snapPositionDetailed = vi.fn((_item: LayoutInstance, desired: THREE.Vector3) => ({ position: desired.clone() }));
    const autoOrientModuleToRoomWallIfSnapped = vi.fn();
    const nudgePinnedModuleChain = vi.fn();
    const updateLayoutPanel = vi.fn();

    const controller = createTestTransformController({
      selectedKind: "module",
      selectedInstanceId: "m1",
      instances: [instance],
      transformState,
      snapPositionDetailed,
      autoOrientModuleToRoomWallIfSnapped,
      nudgePinnedModuleChain,
      updateLayoutPanel
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    controller.applyMoveDelta(new THREE.Vector3(0.2, 0, 0.3));

    expect(instance.root.position.toArray()).toEqual([1.2, 0, 1.3]);
    expect(snapPositionDetailed).toHaveBeenCalledTimes(1);
    expect(autoOrientModuleToRoomWallIfSnapped).toHaveBeenCalledWith(instance, new Set(["m1"]));
    expect(nudgePinnedModuleChain).toHaveBeenCalledTimes(1);
    expect(nudgePinnedModuleChain.mock.calls[0]?.[0]).toBe(instance);
    expect(nudgePinnedModuleChain.mock.calls[0]?.[1].toArray()).toEqual([
      expect.closeTo(0.2),
      0,
      expect.closeTo(0.3)
    ]);
    expect(transformState.lastValidDelta.toArray()).toEqual([0.2, 0, 0.3]);
    expect(updateLayoutPanel).toHaveBeenCalled();
  });
});
