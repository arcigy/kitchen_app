import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  clearDrawingToolSelection,
  clearNonFloorplanFloorSelection,
  clearSelectionIdSet,
  clearSectionToolSelection,
  clearWallAndUnderlaySelectionBoxes,
  createSelectionController,
  getSelectionSideEffects,
  replaceSelectionIdSet,
  resolveMergedSelectionIdSet,
  resolveSelectedIds,
  refreshSelectionHighlights,
  refreshSelectionVisualState,
  runApplySelectionCommand,
  runClearDrawingToolSelectionCommand,
  runClearSectionToolSelectionCommand,
  runClearSelectionCommand,
  runSelectColumnCommand,
  runSelectFloorCommand,
  runSelectKitchenGroupCommand,
  runSelectModuleCommand,
  runSelectOpeningCommand,
  runSelectSectionCommand,
  runSelectUnderlayCommand,
  runSelectWallCommand,
  type DrawingToolSelectionState,
  type SectionToolSelectionState,
  type SelectionControllerContext
} from "./selectionController";
import type { WallInstance } from "./localTypes";

const createContext = (): SelectionControllerContext => {
  const scene = new THREE.Scene();
  const wallRoot = new THREE.Group();
  wallRoot.name = "wall_wall";
  const wall: WallInstance = {
    id: "wall",
    params: {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 0 }
    },
    heightMm: 2600,
    root: wallRoot,
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
  };
  return {
    instances: [],
    kitchenMode: null,
    layoutPanel: { setSelected: vi.fn() },
    layoutTool: "select",
    mountProps: vi.fn(),
    pinnedInstanceIds: new Set<string>(),
    pinnedWallIds: new Set<string>(),
    rebuildWallPlanMesh: vi.fn(),
    scene,
    selectedColumnId: null,
    selectedFloorId: null,
    selectedInstanceBox: null,
    selectedInstanceId: null,
    selectedInstanceIds: new Set<string>(),
    selectedKind: null,
    selectedKitchenGroupId: null,
    selectedSectionId: null,
    selectedUnderlayBox: null,
    selectedWallBox: null,
    selectedWallId: null,
    selectedWallIds: new Set<string>(),
    showWallSnapMarkersFor: vi.fn(),
    syncColumnSelectionVisuals: vi.fn(),
    syncDoorSelectionVisuals: vi.fn(),
    syncWindowSelectionVisuals: vi.fn(),
    syncSelectionState: vi.fn(),
    hasUnderlaySource: () => false,
    underlayMesh: Object.assign(new THREE.Group(), { visible: false }),
    underlayState: { pinned: false },
    updateAllSectionVisuals: vi.fn(),
    updateSelectionHighlights: vi.fn(),
    walls: [wall]
  };
};

const seedDirtySelection = (ctx: SelectionControllerContext) => {
  ctx.selectedKind = "kitchenGroup";
  ctx.selectedInstanceId = "m1";
  ctx.selectedInstanceIds.add("m1");
  ctx.selectedWallId = "w1";
  ctx.selectedWallIds.add("w1");
  ctx.selectedColumnId = "c1";
  ctx.selectedSectionId = "s1";
  ctx.selectedKitchenGroupId = "kg1";
  ctx.selectedFloorId = "f1";
};

const seedSelectionBoxes = (ctx: SelectionControllerContext) => {
  const instanceTarget = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const wallTarget = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const underlayTarget = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  ctx.selectedInstanceBox = new THREE.BoxHelper(instanceTarget);
  ctx.selectedWallBox = new THREE.BoxHelper(wallTarget);
  ctx.selectedUnderlayBox = new THREE.BoxHelper(underlayTarget);
  ctx.selectedInstanceBox.name = "selectedInstanceBox";
  ctx.selectedWallBox.name = "selectedWallBox";
  ctx.selectedUnderlayBox.name = "selectedUnderlayBox";
  const boxes = [ctx.selectedInstanceBox, ctx.selectedWallBox, ctx.selectedUnderlayBox];
  boxes.forEach((box) => {
    vi.spyOn(box.geometry, "dispose");
    vi.spyOn(box.material as THREE.Material, "dispose");
    ctx.scene.add(box);
  });
  return boxes;
};

const createDrawingToolSelectionState = (): DrawingToolSelectionState => ({
  selectedFloorId: "floor-1",
  selectedInstanceIds: new Set(["module-1", "module-2"]),
  selectedKind: "module",
  selectedWallId: "wall-1",
  selectedWallIds: new Set(["wall-1", "wall-2"]),
  setInstanceSelected: vi.fn()
});

const createSectionToolSelectionState = (): SectionToolSelectionState => ({
  ...createDrawingToolSelectionState(),
  selectedKitchenGroupId: "kitchen-group-1",
  selectedSectionId: "section-1"
});

describe("createSelectionController", () => {
  it("preserves current drawing tool selection clearing behavior", () => {
    const state = createDrawingToolSelectionState();

    clearDrawingToolSelection(state);

    expect(state.selectedKind).toBeNull();
    expect(state.selectedWallId).toBeNull();
    expect(state.selectedFloorId).toBeNull();
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(state.setInstanceSelected).toHaveBeenCalledWith(null);
    expect(state.setInstanceSelected).toHaveBeenCalledTimes(1);
  });

  it("runs the named drawing tool clear selection command with the same behavior", () => {
    const state = createDrawingToolSelectionState();

    runClearDrawingToolSelectionCommand(state);

    expect(state.selectedKind).toBeNull();
    expect(state.selectedWallId).toBeNull();
    expect(state.selectedFloorId).toBeNull();
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(state.setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("clears section tool selection state including section and kitchen group ids", () => {
    const state = createSectionToolSelectionState();

    clearSectionToolSelection(state);

    expect(state.selectedKind).toBeNull();
    expect(state.selectedWallId).toBeNull();
    expect(state.selectedFloorId).toBeNull();
    expect(state.selectedSectionId).toBeNull();
    expect(state.selectedKitchenGroupId).toBeNull();
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(state.setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("runs the named section clear selection command with the same behavior", () => {
    const state = createSectionToolSelectionState();

    runClearSectionToolSelectionCommand(state);

    expect(state.selectedKind).toBeNull();
    expect(state.selectedWallId).toBeNull();
    expect(state.selectedFloorId).toBeNull();
    expect(state.selectedSectionId).toBeNull();
    expect(state.selectedKitchenGroupId).toBeNull();
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(state.setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("runs the named global clear selection command through the current apply selection path", () => {
    const applySelection = vi.fn();

    runClearSelectionCommand(applySelection);

    expect(applySelection).toHaveBeenCalledExactlyOnceWith({ kind: null });
  });

  it("runs the named apply selection command in the current order with current side effects", () => {
    const events: string[] = [];
    const afterSelectionChanged = vi.fn((opts) => {
      events.push(`after:${JSON.stringify(opts)}`);
    });

    runApplySelectionCommand(
      {
        afterSelectionChanged,
        clearObjectSelectionVisuals: () => events.push("cleanupVisuals"),
        clearSelectedEntityIds: () => events.push("clearIds"),
        ensureSelectableTool: () => events.push("ensureTool"),
        setSelectedKind: (kind) => events.push(`setKind:${kind}`)
      },
      {
        kind: "wall",
        sideEffectKind: "wall",
        sideEffectId: "wall-1",
        assignIds: () => events.push("assignIds"),
        cleanupVisuals: () => events.push("customCleanup")
      }
    );

    expect(events).toEqual([
      "ensureTool",
      "setKind:wall",
      "clearIds",
      "assignIds",
      "customCleanup",
      "after:{\"wallSnapId\":\"wall-1\"}"
    ]);
    expect(afterSelectionChanged).toHaveBeenCalledExactlyOnceWith({ wallSnapId: "wall-1" });
  });

  it("runs the named module selection command with current kitchen filter behavior", () => {
    const selectedInstanceIds = new Set<string>();
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
      args.cleanupVisuals?.();
    });
    const setInstanceSelected = vi.fn();
    const clearUnderlayBox = vi.fn();

    runSelectModuleCommand(
      {
        applySelection,
        clearUnderlayBox,
        kitchenMode: { filterSelectableInstanceId: () => "module-filtered" },
        pinnedInstanceIds: new Set<string>(),
        selectedInstanceIds,
        setInstanceSelected
      },
      "module-raw"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0].kind).toBe("module");
    expect([...selectedInstanceIds]).toEqual(["module-filtered"]);
    expect(setInstanceSelected).toHaveBeenCalledExactlyOnceWith("module-filtered");
    expect(clearUnderlayBox).toHaveBeenCalledOnce();
  });

  it("runs the named module selection command with current pinned module behavior", () => {
    const selectedInstanceIds = new Set<string>(["old-module"]);
    const applySelection = vi.fn((args) => {
      selectedInstanceIds.clear();
      args.assignIds?.();
      args.cleanupVisuals?.();
    });
    const setInstanceSelected = vi.fn();

    runSelectModuleCommand(
      {
        applySelection,
        clearUnderlayBox: vi.fn(),
        kitchenMode: null,
        pinnedInstanceIds: new Set(["module-locked"]),
        selectedInstanceIds,
        setInstanceSelected
      },
      "module-locked"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0].kind).toBeNull();
    expect([...selectedInstanceIds]).toEqual([]);
    expect(setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("runs the named wall selection command with current wall snap side effects", () => {
    const selectedWallIds = new Set<string>();
    let selectedWallId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectWallCommand(
      {
        applySelection,
        pinnedWallIds: new Set<string>(),
        selectedWallIds,
        setSelectedWallId: (id) => {
          selectedWallId = id;
        },
        walls: [{ id: "wall-1" } as SelectionControllerContext["walls"][number]]
      },
      "wall-1"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "wall",
      sideEffectKind: "wall",
      sideEffectId: "wall-1"
    });
    expect(selectedWallId).toBe("wall-1");
    expect([...selectedWallIds]).toEqual(["wall-1"]);
  });

  it("runs the named wall selection command with current missing wall side effect behavior", () => {
    const selectedWallIds = new Set<string>();
    let selectedWallId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectWallCommand(
      {
        applySelection,
        pinnedWallIds: new Set<string>(),
        selectedWallIds,
        setSelectedWallId: (id) => {
          selectedWallId = id;
        },
        walls: []
      },
      "missing-wall"
    );

    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "wall",
      sideEffectKind: "wall",
      sideEffectId: null
    });
    expect(selectedWallId).toBe("missing-wall");
    expect([...selectedWallIds]).toEqual(["missing-wall"]);
  });

  it("runs the named wall selection command with current pinned wall behavior", () => {
    const selectedWallIds = new Set<string>(["old-wall"]);
    let selectedWallId: string | null = "old-wall";
    const applySelection = vi.fn((args) => {
      selectedWallIds.clear();
      args.assignIds?.();
    });

    runSelectWallCommand(
      {
        applySelection,
        pinnedWallIds: new Set(["wall-locked"]),
        selectedWallIds,
        setSelectedWallId: (id) => {
          selectedWallId = id;
        },
        walls: [{ id: "wall-locked" } as SelectionControllerContext["walls"][number]]
      },
      "wall-locked"
    );

    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: null,
      sideEffectKind: "wall",
      sideEffectId: null
    });
    expect(selectedWallId).toBeNull();
    expect([...selectedWallIds]).toEqual([]);
  });

  it("runs the named kitchen group selection command with current member ordering", () => {
    const selectedInstanceIds = new Set<string>();
    let selectedKitchenGroupId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectKitchenGroupCommand(
      {
        applySelection,
        instances: [
          { id: "m-group-1", kitchenGroupId: "kg" } as SelectionControllerContext["instances"][number],
          { id: "m-other", kitchenGroupId: "other" } as SelectionControllerContext["instances"][number],
          { id: "m-group-2", kitchenGroupId: "kg" } as SelectionControllerContext["instances"][number]
        ],
        selectedInstanceIds,
        setSelectedKitchenGroupId: (id) => {
          selectedKitchenGroupId = id;
        }
      },
      "kg"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "kitchenGroup",
      sideEffectKind: "kitchenGroup"
    });
    expect(selectedKitchenGroupId).toBe("kg");
    expect([...selectedInstanceIds]).toEqual(["m-group-1", "m-group-2"]);
  });

  it("runs the named opening selection command with current cleanup behavior", () => {
    const applySelection = vi.fn((args) => {
      args.cleanupVisuals?.();
    });
    const clearUnderlayBox = vi.fn();
    const setInstanceSelected = vi.fn();

    runSelectOpeningCommand({ applySelection, clearUnderlayBox, setInstanceSelected }, "window");

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0].kind).toBe("window");
    expect(setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
    expect(clearUnderlayBox).toHaveBeenCalledOnce();
  });

  it("runs the named section selection command with current side effects", () => {
    let selectedSectionId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectSectionCommand(
      {
        applySelection,
        setSelectedSectionId: (id) => {
          selectedSectionId = id;
        }
      },
      "section-1"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "section",
      sideEffectKind: "section"
    });
    expect(selectedSectionId).toBe("section-1");
  });

  it("runs the named floor selection command with current side effects", () => {
    let selectedFloorId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectFloorCommand(
      {
        applySelection,
        setSelectedFloorId: (id) => {
          selectedFloorId = id;
        }
      },
      "floor-1"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "floor",
      sideEffectKind: "floor"
    });
    expect(selectedFloorId).toBe("floor-1");
  });

  it("runs the named column selection command with current side effects", () => {
    let selectedColumnId: string | null = null;
    const applySelection = vi.fn((args) => {
      args.assignIds?.();
    });

    runSelectColumnCommand(
      {
        applySelection,
        setSelectedColumnId: (id) => {
          selectedColumnId = id;
        }
      },
      "column-1"
    );

    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0]).toMatchObject({
      kind: "column",
      sideEffectKind: "column"
    });
    expect(selectedColumnId).toBe("column-1");
  });

  it("runs the named underlay selection command with current guard and cleanup behavior", () => {
    const applySelection = vi.fn((args) => {
      args.cleanupVisuals?.();
    });
    const createUnderlaySelectionBox = vi.fn();
    const ensureSelectableTool = vi.fn();

    const selected = runSelectUnderlayCommand({
      applySelection,
      createUnderlaySelectionBox,
      ensureSelectableTool,
      hasUnderlaySource: () => true,
      isUnderlayPinned: () => false,
      isUnderlayVisible: () => true
    });

    expect(selected).toBe(true);
    expect(ensureSelectableTool).toHaveBeenCalledOnce();
    expect(applySelection).toHaveBeenCalledOnce();
    expect(applySelection.mock.calls[0]?.[0].kind).toBe("underlay");
    expect(createUnderlaySelectionBox).toHaveBeenCalledOnce();
  });

  it("runs the named underlay selection command with current unavailable behavior", () => {
    const applySelection = vi.fn();
    const ensureSelectableTool = vi.fn();

    const selected = runSelectUnderlayCommand({
      applySelection,
      createUnderlaySelectionBox: vi.fn(),
      ensureSelectableTool,
      hasUnderlaySource: () => false,
      isUnderlayPinned: () => false,
      isUnderlayVisible: () => true
    });

    expect(selected).toBe(false);
    expect(ensureSelectableTool).toHaveBeenCalledOnce();
    expect(applySelection).not.toHaveBeenCalled();
  });

  it("clears wall and underlay selection boxes without touching the instance box", () => {
    const ctx = createContext();
    const [instanceBox, wallBox, underlayBox] = seedSelectionBoxes(ctx);

    clearWallAndUnderlaySelectionBoxes(ctx);

    expect(ctx.selectedInstanceBox).toBe(instanceBox);
    expect(ctx.selectedWallBox).toBeNull();
    expect(ctx.selectedUnderlayBox).toBeNull();
    expect(ctx.scene.children).toContain(instanceBox);
    expect(ctx.scene.children).not.toContain(wallBox);
    expect(ctx.scene.children).not.toContain(underlayBox);
    expect(instanceBox.geometry.dispose).not.toHaveBeenCalled();
    expect((instanceBox.material as THREE.Material).dispose).not.toHaveBeenCalled();
    expect(wallBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((wallBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    expect(underlayBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((underlayBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
  });

  it("replaces selection id sets while preserving insertion order and Set dedupe behavior", () => {
    const ids = new Set(["old-1", "old-2"]);

    replaceSelectionIdSet(ids, ["new-1", "new-2", "new-1"]);

    expect([...ids]).toEqual(["new-1", "new-2"]);
  });

  it("clears selection id sets through the shared helper", () => {
    const ids = new Set(["id-1", "id-2"]);

    clearSelectionIdSet(ids);

    expect([...ids]).toEqual([]);
  });

  it("resolves selected ids with multi-selection priority before single selection fallback", () => {
    expect(
      resolveSelectedIds({
        selectedIds: new Set(["multi-1", "multi-2"]),
        selectedKind: "module",
        selectedId: "single-1",
        singleKind: "module"
      })
    ).toEqual(["multi-1", "multi-2"]);
    expect(
      resolveSelectedIds({
        selectedIds: new Set(),
        selectedKind: "wall",
        selectedId: "wall-1",
        singleKind: "wall"
      })
    ).toEqual(["wall-1"]);
    expect(
      resolveSelectedIds({
        selectedIds: new Set(),
        selectedKind: "section",
        selectedId: "wall-1",
        singleKind: "wall"
      })
    ).toEqual([]);
  });

  it("resolves merged selection id sets for additive and replacing marquee selection", () => {
    expect([
      ...resolveMergedSelectionIdSet({
        additive: true,
        currentIds: ["existing-1", "existing-2"],
        hitIds: ["hit-1", "existing-1"]
      })
    ]).toEqual(["existing-1", "existing-2", "hit-1"]);
    expect([
      ...resolveMergedSelectionIdSet({
        additive: false,
        currentIds: ["existing-1"],
        hitIds: ["hit-1"]
      })
    ]).toEqual(["hit-1"]);
  });

  it("refreshes selection visuals through the shared sync/highlight helper", () => {
    const calls: string[] = [];
    const ctx = {
      syncSelectionState: vi.fn(() => calls.push("syncSelectionState")),
      updateSelectionHighlights: vi.fn(() => calls.push("updateSelectionHighlights"))
    };

    refreshSelectionVisualState(ctx);

    expect(calls).toEqual(["syncSelectionState", "updateSelectionHighlights"]);
  });

  it("skips selection highlight refresh when selection side effects disable highlights", () => {
    const ctx = {
      syncSelectionState: vi.fn(),
      updateSelectionHighlights: vi.fn()
    };

    refreshSelectionVisualState(ctx, { highlights: false });

    expect(ctx.syncSelectionState).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.updateSelectionHighlights).not.toHaveBeenCalled();
  });

  it("refreshes selection highlights through the shared optional helper", () => {
    const ctx = { updateSelectionHighlights: vi.fn() };

    refreshSelectionHighlights(ctx);
    refreshSelectionHighlights(ctx, { highlights: false });

    expect(ctx.updateSelectionHighlights).toHaveBeenCalledExactlyOnceWith();
  });

  it("maps selected kinds to existing selection side effects", () => {
    expect(getSelectionSideEffects("window")).toEqual({ highlights: false });
    expect(getSelectionSideEffects("door")).toEqual({ highlights: false });
    expect(getSelectionSideEffects("underlay")).toEqual({ highlights: false });
    expect(getSelectionSideEffects("wall", "wall")).toEqual({ wallSnapId: "wall" });
    expect(getSelectionSideEffects("wall", null)).toEqual({ wallSnapId: null });
    expect(getSelectionSideEffects("section")).toEqual({ wallSnapId: null });
    expect(getSelectionSideEffects("floor")).toEqual({ wallSnapId: null });
    expect(getSelectionSideEffects("column")).toEqual({ wallSnapId: null });
    expect(getSelectionSideEffects("module")).toEqual({});
  });

  it("does not create a bounding BoxHelper for selected walls", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);

    controller.setSelectedWall("wall");

    expect(ctx.selectedWallId).toBe("wall");
    expect(ctx.selectedWallIds.has("wall")).toBe(true);
    expect(ctx.selectedWallBox).toBeNull();
    expect(ctx.scene.getObjectByName("wallSelectionBox")).toBeUndefined();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalled();
  });

  it("clears previous entity ids when selecting a window", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedWindow();

    expect(ctx.selectedKind).toBe("window");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.syncWindowSelectionVisuals).toHaveBeenCalledWith(true);
    expect(ctx.updateSelectionHighlights).not.toHaveBeenCalled();
  });

  it("clears previous entity ids when selecting a door", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedDoor();

    expect(ctx.selectedKind).toBe("door");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.syncDoorSelectionVisuals).toHaveBeenCalledWith(true);
    expect(ctx.updateSelectionHighlights).not.toHaveBeenCalled();
  });

  it("keeps only module ids when selecting a module", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedModule("m2");

    expect(ctx.selectedKind).toBe("module");
    expect(ctx.selectedInstanceId).toBe("m2");
    expect(Array.from(ctx.selectedInstanceIds)).toEqual(["m2"]);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.layoutPanel.setSelected).toHaveBeenCalledWith("m2");
  });

  it("clears module selection when selecting no module", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedModule(null);

    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.layoutPanel.setSelected).toHaveBeenCalledWith(null);
    expect(ctx.showWallSnapMarkersFor).not.toHaveBeenCalled();
  });

  it("clears all selected entity ids and selection boxes through the shared clearSelection command", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);
    const boxes = seedSelectionBoxes(ctx);

    controller.clearSelection();

    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.layoutPanel.setSelected).toHaveBeenCalledWith(null);
    expect(ctx.selectedInstanceBox).toBeNull();
    expect(ctx.selectedWallBox).toBeNull();
    expect(ctx.selectedUnderlayBox).toBeNull();
    for (const box of boxes) {
      expect(ctx.scene.children).not.toContain(box);
      expect(box.geometry.dispose).toHaveBeenCalledTimes(1);
      expect((box.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    }
    expect(ctx.syncWindowSelectionVisuals).toHaveBeenCalledWith(false);
    expect(ctx.syncDoorSelectionVisuals).toHaveBeenCalledWith(false);
    expect(ctx.syncSelectionState).toHaveBeenCalledTimes(1);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("keeps only wall ids when selecting a wall", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedWall("wall");

    expect(ctx.selectedKind).toBe("wall");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBe("wall");
    expect(Array.from(ctx.selectedWallIds)).toEqual(["wall"]);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.layoutPanel.setSelected).toHaveBeenCalledWith(null);
  });

  it("clears wall snap markers when clearing a wall selection", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    ctx.selectedKind = "wall";
    ctx.selectedWallId = "wall";
    ctx.selectedWallIds.add("wall");

    controller.setSelectedWall(null);

    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledWith(null);
  });

  it("clears previous selection boxes when selecting a wall", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    const boxes = seedSelectionBoxes(ctx);

    controller.setSelectedWall("wall");

    expect(ctx.selectedInstanceBox).toBeNull();
    expect(ctx.selectedWallBox).toBeNull();
    expect(ctx.selectedUnderlayBox).toBeNull();
    for (const box of boxes) {
      expect(ctx.scene.children).not.toContain(box);
      expect(box.geometry.dispose).toHaveBeenCalledTimes(1);
      expect((box.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    }
  });

  it("selects visible unpinned underlay through the shared apply selection path", () => {
    const ctx = createContext();
    ctx.layoutTool = "trim";
    ctx.underlayMesh.visible = true;
    ctx.hasUnderlaySource = () => true;
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedUnderlay();

    expect(ctx.layoutTool).toBe("select");
    expect(ctx.selectedKind).toBe("underlay");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedUnderlayBox?.name).toBe("underlaySelectionBox");
    expect(ctx.selectedUnderlayBox).not.toBeNull();
    expect(ctx.scene.children).toContain(ctx.selectedUnderlayBox);
    expect(ctx.syncWindowSelectionVisuals).toHaveBeenCalledWith(false);
    expect(ctx.syncDoorSelectionVisuals).toHaveBeenCalledWith(false);
    expect(ctx.updateSelectionHighlights).not.toHaveBeenCalled();
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("keeps current underlay guard behavior after forcing a selectable tool", () => {
    const ctx = createContext();
    ctx.layoutTool = "trim";
    ctx.underlayMesh.visible = false;
    ctx.hasUnderlaySource = () => true;
    const controller = createSelectionController(ctx);

    controller.setSelectedUnderlay();

    expect(ctx.layoutTool).toBe("select");
    expect(ctx.selectedKind).toBeNull();
    expect(ctx.selectedUnderlayBox).toBeNull();
    expect(ctx.syncSelectionState).not.toHaveBeenCalled();
    expect(ctx.mountProps).not.toHaveBeenCalled();
  });

  it("clears instance and underlay boxes but keeps the wall box when selecting a window", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    const [instanceBox, wallBox, underlayBox] = seedSelectionBoxes(ctx);

    controller.setSelectedWindow();

    expect(ctx.selectedInstanceBox).toBeNull();
    expect(ctx.selectedWallBox).toBe(wallBox);
    expect(ctx.selectedUnderlayBox).toBeNull();
    expect(ctx.scene.children).not.toContain(instanceBox);
    expect(ctx.scene.children).toContain(wallBox);
    expect(ctx.scene.children).not.toContain(underlayBox);
    expect(instanceBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((instanceBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    expect(wallBox.geometry.dispose).not.toHaveBeenCalled();
    expect((wallBox.material as THREE.Material).dispose).not.toHaveBeenCalled();
    expect(underlayBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((underlayBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
  });

  it("clears instance and underlay boxes but keeps the wall box when selecting a door", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    const [instanceBox, wallBox, underlayBox] = seedSelectionBoxes(ctx);

    controller.setSelectedDoor();

    expect(ctx.selectedInstanceBox).toBeNull();
    expect(ctx.selectedWallBox).toBe(wallBox);
    expect(ctx.selectedUnderlayBox).toBeNull();
    expect(ctx.scene.children).not.toContain(instanceBox);
    expect(ctx.scene.children).toContain(wallBox);
    expect(ctx.scene.children).not.toContain(underlayBox);
    expect(instanceBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((instanceBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
    expect(wallBox.geometry.dispose).not.toHaveBeenCalled();
    expect((wallBox.material as THREE.Material).dispose).not.toHaveBeenCalled();
    expect(underlayBox.geometry.dispose).toHaveBeenCalledTimes(1);
    expect((underlayBox.material as THREE.Material).dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps only section id when selecting a section", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedSection("s2");

    expect(ctx.selectedKind).toBe("section");
    expect(ctx.selectedSectionId).toBe("s2");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledWith(null);
  });

  it("keeps only floor id when selecting a floor", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedFloor("f2");

    expect(ctx.selectedKind).toBe("floor");
    expect(ctx.selectedFloorId).toBe("f2");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledWith(null);
  });

  it("keeps only column id when selecting a column", () => {
    const ctx = createContext();
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedColumn("c2");

    expect(ctx.selectedKind).toBe("column");
    expect(ctx.selectedColumnId).toBe("c2");
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedInstanceIds.size).toBe(0);
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedKitchenGroupId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledWith(null);
  });

  it("keeps kitchen group id and member instance ids when selecting a kitchen group", () => {
    const ctx = createContext();
    ctx.instances.push(
      { id: "m-group-1", kitchenGroupId: "kg2" } as SelectionControllerContext["instances"][number],
      { id: "m-other", kitchenGroupId: "kg-other" } as SelectionControllerContext["instances"][number],
      { id: "m-group-2", kitchenGroupId: "kg2" } as SelectionControllerContext["instances"][number]
    );
    const controller = createSelectionController(ctx);
    seedDirtySelection(ctx);

    controller.setSelectedKitchenGroup("kg2");

    expect(ctx.selectedKind).toBe("kitchenGroup");
    expect(ctx.selectedKitchenGroupId).toBe("kg2");
    expect(Array.from(ctx.selectedInstanceIds)).toEqual(["m-group-1", "m-group-2"]);
    expect(ctx.selectedInstanceId).toBeNull();
    expect(ctx.selectedWallId).toBeNull();
    expect(ctx.selectedWallIds.size).toBe(0);
    expect(ctx.selectedColumnId).toBeNull();
    expect(ctx.selectedSectionId).toBeNull();
    expect(ctx.selectedFloorId).toBeNull();
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledWith(null);
  });

  it("keeps wall tool active while selecting an entity", () => {
    const ctx = createContext();
    ctx.layoutTool = "wall";
    const controller = createSelectionController(ctx);

    controller.setSelectedModule("m2");

    expect(ctx.layoutTool).toBe("wall");
  });

  it("switches non-wall tools back to select while selecting an entity", () => {
    const ctx = createContext();
    ctx.layoutTool = "trim";
    const controller = createSelectionController(ctx);

    controller.setSelectedModule("m2");

    expect(ctx.layoutTool).toBe("select");
  });

  it("keeps current non-floorplan floor selection cleanup behavior", () => {
    const ctx = createContext();
    seedDirtySelection(ctx);
    const setInstanceSelected = vi.fn();
    const cleanupCtx = {
      mountProps: ctx.mountProps,
      selectedColumnId: ctx.selectedColumnId,
      selectedFloorId: ctx.selectedFloorId,
      selectedInstanceId: ctx.selectedInstanceId,
      selectedInstanceIds: ctx.selectedInstanceIds,
      selectedKind: ctx.selectedKind,
      selectedKitchenGroupId: ctx.selectedKitchenGroupId,
      selectedSectionId: ctx.selectedSectionId,
      selectedWallId: ctx.selectedWallId,
      selectedWallIds: ctx.selectedWallIds,
      setInstanceSelected,
      showWallSnapMarkersFor: ctx.showWallSnapMarkersFor,
      syncSelectionState: ctx.syncSelectionState,
      updateAllSectionVisuals: ctx.updateAllSectionVisuals,
      updateSelectionHighlights: ctx.updateSelectionHighlights
    };

    clearNonFloorplanFloorSelection(cleanupCtx);

    expect(cleanupCtx.selectedKind).toBeNull();
    expect(cleanupCtx.selectedColumnId).toBeNull();
    expect(cleanupCtx.selectedSectionId).toBeNull();
    expect(cleanupCtx.selectedKitchenGroupId).toBeNull();
    expect(cleanupCtx.selectedFloorId).toBeNull();
    expect(cleanupCtx.selectedWallId).toBeNull();
    expect(cleanupCtx.selectedInstanceId).toBeNull();
    expect(cleanupCtx.selectedInstanceIds.size).toBe(0);
    expect(cleanupCtx.selectedWallIds.size).toBe(0);
    expect(setInstanceSelected).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.showWallSnapMarkersFor).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.syncSelectionState).toHaveBeenCalledOnce();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.updateAllSectionVisuals).toHaveBeenCalledOnce();
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
