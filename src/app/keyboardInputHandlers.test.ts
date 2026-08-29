import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  canRunKeyboardNudgeSelectionCommand,
  handleGlobalUndoRedoShortcut,
  installKeyboardInputHandlers,
  nudgeSelectedModulesByDeltaMm,
  nudgeSelectedSectionByDeltaMm,
  nudgeSelectedWallsByDeltaMm,
  resolveArrowNudgeDeltaM,
  resolveKeyboardNudgeStepM,
  runActivePlacementEscapeCommand,
  runClearSelectionShortcutCommand,
  runDeleteSelectionShortcutCommand,
  runDrawingSpaceShortcutCommand,
  runFloorEditEscapeCommand,
  runKitchenWorktopTypedInputCommand,
  runKeyboardInputCommand,
  runKeyboardMoveSelectionShortcutCommand,
  runKeyboardNudgeSelectionCommand,
  resolveKeyboardMoveSelectionShortcutDeltaM,
  runLayoutKeyboardCommand,
  runLayoutTransformKeyboardCommand,
  runLayoutSpaceShortcutCommand,
  runLayoutToolShortcutCommand,
  runPlacementShortcutCommand,
  runTransformEscapeCommand,
  runTransformMoveSelectElementsCommand,
  runTransformMoveTypedDistanceCommand,
  runTransformMoveSnapToggleCommand,
  runTransformRotateTypedAngleCommand,
  runWallTypedLengthCommand
} from "./keyboardInputHandlers";
import type { LayoutInstance, SectionInstance, WallInstance } from "./localTypes";

function shortcutEvent(key: string, opts: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...opts
  } as unknown as KeyboardEvent;
}

function plainKeyEvent(key: string, opts: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...opts
  } as KeyboardEvent;
}

function keyboardContext(ctx: unknown) {
  return ctx as Parameters<typeof handleGlobalUndoRedoShortcut>[0];
}

function installKeyboardContext(ctx: unknown) {
  return ctx as Parameters<typeof installKeyboardInputHandlers>[0];
}

function typedHud() {
  return {
    textContent: null,
    style: {
      display: "",
      left: "",
      top: ""
    }
  };
}

function wall(id: string, aMm: { x: number; z: number }, bMm: { x: number; z: number }) {
  return {
    id,
    params: {
      typeId: null,
      thicknessMm: 100,
      heightMm: 2600,
      materialId: "wall",
      aMm,
      bMm
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  } as WallInstance;
}

function endpointAtPoint(testWall: WallInstance, point: { x: number; z: number }, tolMm: number) {
  const dist = (item: { x: number; z: number }) => Math.hypot(item.x - point.x, item.z - point.z);
  if (dist(testWall.params.aMm) <= tolMm) return "a";
  if (dist(testWall.params.bMm) <= tolMm) return "b";
  return null;
}

function moduleInstance(id: string, position: { x: number; y?: number; z: number }, kitchenGroupId: string | null = null) {
  const root = new THREE.Group();
  root.position.set(position.x, position.y ?? 0, position.z);
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

function moduleNudgeArgs(overrides: Partial<Parameters<typeof nudgeSelectedModulesByDeltaMm>[0]>) {
  const instances = overrides.instances ?? [];
  return {
    instances,
    selectedKind: "module",
    selectedInstanceId: null,
    selectedInstanceIds: new Set<string>(),
    dxMm: 0,
    dzMm: 0,
    findInstance: (id: string) => instances.find((item) => item.id === id) ?? null,
    applyWallConstraints: (_instance: LayoutInstance, desired: THREE.Vector3) => desired,
    getKitchenPlacementConstraint: () => null,
    snapPositionDetailed: (_instance: LayoutInstance, desired: THREE.Vector3) => ({ position: desired }),
    anyOverlap: () => false,
    moduleOverlapsWalls: () => false,
    moduleOverlapsKitchenWorktops: () => false,
    autoOrientModuleToRoomWallIfSnapped: vi.fn(),
    nudgePinnedModuleChain: vi.fn(),
    kitchenGroups: [],
    defaultWorktopBackOffsetMm: 20,
    inferKitchenPlacementBinding: (_instance: LayoutInstance, _kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: "wt",
      segmentIndex: 0,
      offsetAlongM: backOffsetMm / 1000
    }),
    updateLayoutPanel: vi.fn(),
    ...overrides
  } satisfies Parameters<typeof nudgeSelectedModulesByDeltaMm>[0];
}

function keyboardNudgeCommandContext(overrides: Partial<Parameters<typeof runKeyboardNudgeSelectionCommand>[0]>) {
  const walls = overrides.walls ?? [];
  const instances = overrides.instances ?? [];
  const ctx = {
    anyOverlap: () => false,
    applyWallConstraints: (_instance: LayoutInstance, desired: THREE.Vector3) => desired,
    autoOrientModuleToRoomWallIfSnapped: vi.fn(),
    commitHistory: vi.fn(),
    doorDragState: { active: false },
    dragState: { active: false },
    findInstance: (id: string) => instances.find((item) => item.id === id) ?? null,
    applyKitchenPlacementBinding: vi.fn(() => true),
    getKitchenPlacementConstraint: () => null,
    inferKitchenPlacementBinding: (_instance: LayoutInstance, _kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: "wt",
      segmentIndex: 0,
      offsetAlongM: backOffsetMm / 1000
    }),
    instanceFitsRoom: () => true,
    instances,
    layoutTool: "select",
    marquee: { active: false },
    measureState: { enabled: false },
    moduleOverlapsKitchenWorktops: () => false,
    moduleOverlapsWalls: () => false,
    mountProps: vi.fn(),
    nudgePinnedModuleChain: vi.fn(),
    pinnedWallIds: new Set<string>(),
    rebuildInstance: vi.fn(() => true),
    rebuildWall: vi.fn(),
    rebuildWallPlanMesh: vi.fn(),
    S: {
      kitchenCtx: { worktopBackOffsetMm: 20 },
      kitchenGroups: []
    },
    sections: [],
    selectedInstanceId: null,
    selectedInstanceIds: new Set<string>(),
    selectedKind: null,
    selectedSectionId: null,
    selectedWallId: null,
    selectedWallIds: new Set<string>(),
    snapPositionDetailed: (_instance: LayoutInstance, desired: THREE.Vector3) => ({ position: desired }),
    underlayCal: { active: false },
    updateLayoutPanel: vi.fn(),
    updateSectionVisual: vi.fn(),
    viewMode: "2d",
    wallEditHud: { drag: null },
    wallEndpointWhich: endpointAtPoint,
    wallJoinTolMm: 2,
    walls,
    windowDragState: { active: false },
    ...overrides
  };
  return ctx as Parameters<typeof runKeyboardNudgeSelectionCommand>[0];
}

describe("global undo redo keyboard shortcuts", () => {
  it("handles undo and redo before active tools or typing targets can block them", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const ctx = {
      S: { kitchenEditMode: true },
      helpers: {},
      undo,
      redo,
      isTypingTarget: () => true,
      floorEdit: { active: true }
    };

    const undoEvent = shortcutEvent("z");
    const redoEvent = shortcutEvent("z", { shiftKey: true });
    const redoYEvent = shortcutEvent("y");

    expect(handleGlobalUndoRedoShortcut(keyboardContext(ctx), undoEvent)).toBe(true);
    expect(handleGlobalUndoRedoShortcut(keyboardContext(ctx), redoEvent)).toBe(true);
    expect(handleGlobalUndoRedoShortcut(keyboardContext(ctx), redoYEvent)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
    expect(undoEvent.preventDefault).toHaveBeenCalled();
    expect(undoEvent.stopImmediatePropagation).toHaveBeenCalled();
  });

  it("ignores non undo redo shortcuts", () => {
    const ctx = { S: {}, helpers: {}, undo: vi.fn(), redo: vi.fn() };
    expect(handleGlobalUndoRedoShortcut(keyboardContext(ctx), shortcutEvent("s"))).toBe(false);
  });

  it("lets active custom furniture boundary edits consume undo before project history", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    const undoActiveEdit = vi.fn(() => true);
    const ctx = { S: {}, helpers: {}, undo, redo, customFurnitureMode: { undoActiveEdit } };

    expect(handleGlobalUndoRedoShortcut(keyboardContext(ctx), shortcutEvent("z"))).toBe(true);
    expect(undoActiveEdit).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("registers one bubble dispatcher so focused inputs keep native undo and redo", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener });

    const undo = vi.fn();
    const redo = vi.fn();
    installKeyboardInputHandlers(installKeyboardContext({
      S: { kitchenEditMode: true, kitchenCtx: {}, kitchenGroups: [] },
      helpers: {},
      walls: [],
      instances: [],
      sections: [],
      undo,
      redo,
      isTypingTarget: () => true
    }));

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    const keydownHandler = addEventListener.mock.calls[0][1] as (ev: KeyboardEvent) => void;
    keydownHandler(shortcutEvent("z", { target: { nodeName: "INPUT" } as unknown as EventTarget }));
    expect(undo).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe("keyboard nudge helpers", () => {
  it("resolves zoom-sensitive 2d nudge steps for orthographic cameras", () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10);

    camera.zoom = 1;
    expect(resolveKeyboardNudgeStepM("2d", camera)).toBe(1);

    camera.zoom = 2;
    expect(resolveKeyboardNudgeStepM("2d", camera)).toBe(0.25);

    camera.zoom = 6;
    expect(resolveKeyboardNudgeStepM("2d", camera)).toBe(0.05);

    expect(resolveKeyboardNudgeStepM("3d", camera)).toBe(0);
    expect(resolveKeyboardNudgeStepM("2d", new THREE.PerspectiveCamera())).toBe(0);
  });

  it("maps arrow keys to layout nudge deltas", () => {
    expect(resolveArrowNudgeDeltaM("ArrowLeft", 0.5)).toEqual({ dx: -0.5, dz: 0 });
    expect(resolveArrowNudgeDeltaM("ArrowRight", 0.5)).toEqual({ dx: 0.5, dz: 0 });
    expect(resolveArrowNudgeDeltaM("ArrowUp", 0.5)).toEqual({ dx: 0, dz: -0.5 });
    expect(resolveArrowNudgeDeltaM("ArrowDown", 0.5)).toEqual({ dx: 0, dz: 0.5 });
    expect(resolveArrowNudgeDeltaM("Enter", 0.5)).toBeNull();
    expect(resolveArrowNudgeDeltaM("ArrowLeft", 0)).toBeNull();
  });

  it("keeps the keyboard nudge guard limited to idle 2d select mode", () => {
    const base = keyboardNudgeCommandContext({});

    expect(canRunKeyboardNudgeSelectionCommand(base)).toBe(true);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, viewMode: "3d" })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, layoutTool: "wall" })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, measureState: { enabled: true } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, dragState: { active: true } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, windowDragState: { active: true } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, doorDragState: { active: true } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, wallEditHud: { drag: {} } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, marquee: { active: true } })).toBe(false);
    expect(canRunKeyboardNudgeSelectionCommand({ ...base, underlayCal: { active: true } })).toBe(false);
  });

  it("resolves keyboard move shortcut deltas before running the nudge command", () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10);
    camera.zoom = 2;
    const ctx = {
      cam: () => camera,
      viewMode: "2d"
    } as Parameters<typeof resolveKeyboardMoveSelectionShortcutDeltaM>[0];

    expect(resolveKeyboardMoveSelectionShortcutDeltaM(ctx, "ArrowRight")).toEqual({ dx: 0.25, dz: 0 });
    expect(resolveKeyboardMoveSelectionShortcutDeltaM(ctx, "ArrowUp")).toEqual({ dx: 0, dz: -0.25 });
    expect(resolveKeyboardMoveSelectionShortcutDeltaM(ctx, "Enter")).toBeNull();
    expect(resolveKeyboardMoveSelectionShortcutDeltaM({ ...ctx, viewMode: "3d" }, "ArrowRight")).toBeNull();
  });

  it("runs arrow key move selection shortcut through the nudge command", () => {
    const section = {
      id: "section-1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 }
      }
    } as SectionInstance;
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10);
    camera.zoom = 2;
    const preventDefault = vi.fn();
    const ctx = {
      ...keyboardNudgeCommandContext({
        sections: [section],
        selectedKind: "section",
        selectedSectionId: "section-1"
      }),
      cam: () => camera
    } as Parameters<typeof runKeyboardMoveSelectionShortcutCommand>[0];

    expect(runKeyboardMoveSelectionShortcutCommand(ctx, plainKeyEvent("ArrowRight", { preventDefault }))).toBe(true);

    expect(section.params.aMm).toEqual({ x: 250, z: 0 });
    expect(section.params.bMm).toEqual({ x: 1250, z: 0 });
    expect(preventDefault).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.commitHistory).toHaveBeenCalledExactlyOnceWith(ctx.S);
  });

  it("does not consume arrow key move selection shortcuts when no nudge can run", () => {
    const preventDefault = vi.fn();
    const ctx = {
      ...keyboardNudgeCommandContext({ measureState: { enabled: true } }),
      cam: () => new THREE.OrthographicCamera(-10, 10, 10, -10)
    } as Parameters<typeof runKeyboardMoveSelectionShortcutCommand>[0];

    expect(runKeyboardMoveSelectionShortcutCommand(ctx, plainKeyEvent("ArrowLeft", { preventDefault }))).toBe(false);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(ctx.commitHistory).not.toHaveBeenCalled();
  });

  it("nudges the selected section line and refreshes its visual once", () => {
    const section = {
      id: "section-1",
      params: {
        aMm: { x: 100, z: 200 },
        bMm: { x: 500, z: 600 }
      }
    } as SectionInstance;
    const updateSectionVisual = vi.fn();

    expect(
      nudgeSelectedSectionByDeltaMm({
        sections: [section],
        selectedKind: "section",
        selectedSectionId: "section-1",
        dxMm: 25,
        dzMm: -50,
        updateSectionVisual
      })
    ).toBe(true);

    expect(section.params.aMm).toEqual({ x: 125, z: 150 });
    expect(section.params.bMm).toEqual({ x: 525, z: 550 });
    expect(updateSectionVisual).toHaveBeenCalledExactlyOnceWith(section);
  });

  it("does not nudge sections when section selection is inactive or missing", () => {
    const section = {
      id: "section-1",
      params: {
        aMm: { x: 100, z: 200 },
        bMm: { x: 500, z: 600 }
      }
    } as SectionInstance;
    const updateSectionVisual = vi.fn();

    expect(
      nudgeSelectedSectionByDeltaMm({
        sections: [section],
        selectedKind: "module",
        selectedSectionId: "section-1",
        dxMm: 25,
        dzMm: -50,
        updateSectionVisual
      })
    ).toBe(false);
    expect(
      nudgeSelectedSectionByDeltaMm({
        sections: [section],
        selectedKind: "section",
        selectedSectionId: "missing",
        dxMm: 25,
        dzMm: -50,
        updateSectionVisual
      })
    ).toBe(false);

    expect(section.params.aMm).toEqual({ x: 100, z: 200 });
    expect(section.params.bMm).toEqual({ x: 500, z: 600 });
    expect(updateSectionVisual).not.toHaveBeenCalled();
  });

  it("nudges the selected wall and connected unpinned endpoints", () => {
    const selected = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });
    const connected = wall("w2", { x: 1000, z: 0 }, { x: 1000, z: 800 });
    const separate = wall("w3", { x: 3000, z: 0 }, { x: 3000, z: 800 });
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();

    expect(
      nudgeSelectedWallsByDeltaMm({
        walls: [selected, connected, separate],
        selectedKind: "wall",
        selectedWallId: "w1",
        selectedWallIds: new Set<string>(),
        pinnedWallIds: new Set<string>(),
        wallJoinTolMm: 2,
        dxMm: 25,
        dzMm: -50,
        wallEndpointWhich: endpointAtPoint,
        rebuildWall,
        rebuildWallPlanMesh
      })
    ).toBe(true);

    expect(selected.params.aMm).toEqual({ x: 25, z: -50 });
    expect(selected.params.bMm).toEqual({ x: 1025, z: -50 });
    expect(connected.params.aMm).toEqual({ x: 1025, z: -50 });
    expect(connected.params.bMm).toEqual({ x: 1000, z: 800 });
    expect(separate.params.aMm).toEqual({ x: 3000, z: 0 });
    expect(rebuildWall).toHaveBeenCalledTimes(2);
    expect(rebuildWall).toHaveBeenCalledWith(selected);
    expect(rebuildWall).toHaveBeenCalledWith(connected);
    expect(rebuildWallPlanMesh).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not nudge pinned selected walls", () => {
    const selected = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();

    expect(
      nudgeSelectedWallsByDeltaMm({
        walls: [selected],
        selectedKind: "wall",
        selectedWallId: "w1",
        selectedWallIds: new Set<string>(),
        pinnedWallIds: new Set<string>(["w1"]),
        wallJoinTolMm: 2,
        dxMm: 25,
        dzMm: -50,
        wallEndpointWhich: endpointAtPoint,
        rebuildWall,
        rebuildWallPlanMesh
      })
    ).toBe(false);

    expect(selected.params.aMm).toEqual({ x: 0, z: 0 });
    expect(selected.params.bMm).toEqual({ x: 1000, z: 0 });
    expect(rebuildWall).not.toHaveBeenCalled();
    expect(rebuildWallPlanMesh).not.toHaveBeenCalled();
  });

  it("nudges the selected module through wall constraints and snapping", () => {
    const instance = moduleInstance("m1", { x: 1, z: 2 });
    const snapPositionDetailed = vi.fn((_item: LayoutInstance, desired: THREE.Vector3) => ({
      position: desired.clone().add(new THREE.Vector3(0.05, 0, 0))
    }));
    const autoOrientModuleToRoomWallIfSnapped = vi.fn();
    const nudgePinnedModuleChain = vi.fn();
    const updateLayoutPanel = vi.fn();

    expect(
      nudgeSelectedModulesByDeltaMm(
        moduleNudgeArgs({
          instances: [instance],
          selectedInstanceId: "m1",
          dxMm: 100,
          dzMm: -50,
          snapPositionDetailed,
          autoOrientModuleToRoomWallIfSnapped,
          nudgePinnedModuleChain,
          updateLayoutPanel
        })
      )
    ).toBe(true);

    expect(instance.root.position.x).toBeCloseTo(1.15);
    expect(instance.root.position.z).toBeCloseTo(1.95);
    expect(snapPositionDetailed).toHaveBeenCalledWith(instance, expect.any(THREE.Vector3), {
      stickyNeighborId: null,
      snapDistanceM: undefined
    });
    expect(autoOrientModuleToRoomWallIfSnapped).toHaveBeenCalledExactlyOnceWith(instance);
    expect(nudgePinnedModuleChain).toHaveBeenCalledTimes(1);
    expect(nudgePinnedModuleChain.mock.calls[0][1].x).toBeCloseTo(0.15);
    expect(nudgePinnedModuleChain.mock.calls[0][1].z).toBeCloseTo(-0.05);
    expect(updateLayoutPanel).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not nudge a module locked by align", () => {
    const instance = moduleInstance("m1", { x: 1, z: 2 });
    const updateLayoutPanel = vi.fn();

    expect(
      nudgeSelectedModulesByDeltaMm(
        moduleNudgeArgs({
          instances: [instance],
          selectedInstanceId: "m1",
          dxMm: 100,
          dzMm: -50,
          alignLocks: [
            {
              id: "lock-1",
              locked: true,
              a: { targetKind: "module", targetId: "m1", lineRole: "edge", moduleSide: "right" },
              b: { targetKind: "module", targetId: "m2", lineRole: "edge", moduleSide: "left" },
              pointMm: { x: 0, z: 0 }
            }
          ],
          updateLayoutPanel
        })
      )
    ).toBe(false);

    expect(instance.root.position.x).toBeCloseTo(1);
    expect(instance.root.position.z).toBeCloseTo(2);
    expect(updateLayoutPanel).not.toHaveBeenCalled();
  });

  it("rebinds moved kitchen modules with the current kitchen back offset", () => {
    const instance = moduleInstance("m1", { x: 0, z: 0 }, "kg1");
    const inferKitchenPlacementBinding = vi.fn((_item: LayoutInstance, kitchenGroupId: string, backOffsetMm: number) => ({
      worktopId: `${kitchenGroupId}-worktop-${backOffsetMm}`,
      segmentIndex: 0,
      offsetAlongM: 0
    }));

    expect(
      nudgeSelectedModulesByDeltaMm(
        moduleNudgeArgs({
          instances: [instance],
          selectedInstanceId: "m1",
          dxMm: 100,
          dzMm: 0,
          kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }],
          inferKitchenPlacementBinding
        })
      )
    ).toBe(true);

    expect(inferKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(instance, "kg1", 45);
    expect(instance.kitchenPlacement).toEqual({ worktopId: "kg1-worktop-45", segmentIndex: 0, offsetAlongM: 0 });
  });

  it("reverts module nudge when overlap validation fails", () => {
    const instance = moduleInstance("m1", { x: 1, z: 2 }, "kg1");
    instance.root.rotation.y = 0.25;
    instance.kitchenPlacement = { worktopId: "original", segmentIndex: 1, offsetAlongM: 0.4 };
    const originalPlacement = structuredClone(instance.kitchenPlacement);
    const autoOrientModuleToRoomWallIfSnapped = vi.fn();
    const nudgePinnedModuleChain = vi.fn();
    const updateLayoutPanel = vi.fn();

    expect(
      nudgeSelectedModulesByDeltaMm(
        moduleNudgeArgs({
          instances: [instance],
          selectedInstanceId: "m1",
          dxMm: 100,
          dzMm: 50,
          getKitchenPlacementConstraint: () => ({
            position: new THREE.Vector3(10, 0, 10),
            rotationY: 1,
            kitchenPlacement: { worktopId: "changed", segmentIndex: 0, offsetAlongM: 0 }
          }),
          anyOverlap: () => true,
          autoOrientModuleToRoomWallIfSnapped,
          nudgePinnedModuleChain,
          updateLayoutPanel
        })
      )
    ).toBe(false);

    expect(instance.root.position.x).toBeCloseTo(1);
    expect(instance.root.position.z).toBeCloseTo(2);
    expect(instance.root.rotation.y).toBeCloseTo(0.25);
    expect(instance.kitchenPlacement).toEqual(originalPlacement);
    expect(autoOrientModuleToRoomWallIfSnapped).not.toHaveBeenCalled();
    expect(nudgePinnedModuleChain).not.toHaveBeenCalled();
    expect(updateLayoutPanel).not.toHaveBeenCalled();
  });

  it("runs keyboard nudge as one command and commits once after mount", () => {
    const section = {
      id: "section-1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 }
      }
    } as SectionInstance;
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const updateSectionVisual = vi.fn();
    const ctx = keyboardNudgeCommandContext({
      sections: [section],
      selectedKind: "section",
      selectedSectionId: "section-1",
      mountProps,
      commitHistory,
      updateSectionVisual
    });

    expect(runKeyboardNudgeSelectionCommand(ctx, 0.1, -0.05)).toBe(true);

    expect(section.params.aMm).toEqual({ x: 100, z: -50 });
    expect(section.params.bMm).toEqual({ x: 1100, z: -50 });
    expect(updateSectionVisual).toHaveBeenCalledExactlyOnceWith(section);
    expect(mountProps).toHaveBeenCalledExactlyOnceWith();
    expect(commitHistory).toHaveBeenCalledExactlyOnceWith(ctx.S);
    expect(mountProps.mock.invocationCallOrder[0]).toBeLessThan(commitHistory.mock.invocationCallOrder[0]);
  });

  it("does not run keyboard nudge while measure mode is enabled", () => {
    const section = {
      id: "section-1",
      params: {
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 }
      }
    } as SectionInstance;
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const updateSectionVisual = vi.fn();
    const ctx = keyboardNudgeCommandContext({
      measureState: { enabled: true },
      sections: [section],
      selectedKind: "section",
      selectedSectionId: "section-1",
      mountProps,
      commitHistory,
      updateSectionVisual
    });

    expect(runKeyboardNudgeSelectionCommand(ctx, 0.1, -0.05)).toBe(false);

    expect(section.params.aMm).toEqual({ x: 0, z: 0 });
    expect(section.params.bMm).toEqual({ x: 1000, z: 0 });
    expect(updateSectionVisual).not.toHaveBeenCalled();
    expect(mountProps).not.toHaveBeenCalled();
    expect(commitHistory).not.toHaveBeenCalled();
  });

  it("reverts wall and module state without committing when keyboard nudge creates an invalid module state", () => {
    const selectedWall = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });
    const instance = moduleInstance("m1", { x: 1, z: 2 });
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();
    const updateLayoutPanel = vi.fn();
    const ctx = keyboardNudgeCommandContext({
      walls: [selectedWall],
      instances: [instance],
      selectedKind: "wall",
      selectedWallId: "w1",
      instanceFitsRoom: () => false,
      mountProps,
      commitHistory,
      rebuildWall,
      rebuildWallPlanMesh,
      updateLayoutPanel
    });

    expect(runKeyboardNudgeSelectionCommand(ctx, 0.1, -0.05)).toBe(false);

    expect(selectedWall.params.aMm).toEqual({ x: 0, z: 0 });
    expect(selectedWall.params.bMm).toEqual({ x: 1000, z: 0 });
    expect(instance.root.position.x).toBeCloseTo(1);
    expect(instance.root.position.z).toBeCloseTo(2);
    expect(rebuildWall).toHaveBeenCalledWith(selectedWall);
    expect(rebuildWallPlanMesh).toHaveBeenCalled();
    expect(updateLayoutPanel).toHaveBeenCalled();
    expect(mountProps).toHaveBeenCalledExactlyOnceWith();
    expect(commitHistory).not.toHaveBeenCalled();
  });
});

describe("layout tool keyboard shortcuts", () => {
  it("routes move and rotate shortcuts through transform selection", () => {
    const startTransformFromSelection = vi.fn(() => true);
    const ctx = {
      setToolAlign: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      startTransformFromSelection
    };

    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("m"))).toBe(true);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("R"))).toBe(true);

    expect(startTransformFromSelection).toHaveBeenNthCalledWith(1, "move", { sticky: true, toggle: true });
    expect(startTransformFromSelection).toHaveBeenNthCalledWith(2, "rotate");
    expect(ctx.setToolWall).not.toHaveBeenCalled();
    expect(ctx.setToolAlign).not.toHaveBeenCalled();
    expect(ctx.setToolTrim).not.toHaveBeenCalled();
  });

  it("returns false for move shortcut when transform cannot start", () => {
    const ctx = {
      setToolAlign: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      startTransformFromSelection: vi.fn(() => false)
    };

    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("m"))).toBe(false);
    expect(ctx.startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("move", { sticky: true, toggle: true });
  });

  it("routes wall align and trim tool shortcuts", () => {
    const ctx = {
      setToolAlign: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      startTransformFromSelection: vi.fn()
    };

    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("w"))).toBe(true);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("A"))).toBe(true);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("t"))).toBe(true);

    expect(ctx.setToolWall).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolAlign).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolTrim).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.startTransformFromSelection).not.toHaveBeenCalled();
  });

  it("ignores tool shortcuts with command modifiers", () => {
    const ctx = {
      setToolAlign: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      startTransformFromSelection: vi.fn()
    };

    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("w", { ctrlKey: true }))).toBe(false);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("a", { metaKey: true }))).toBe(false);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("t", { altKey: true }))).toBe(false);
    expect(runLayoutToolShortcutCommand(ctx, plainKeyEvent("x"))).toBe(false);

    expect(ctx.setToolWall).not.toHaveBeenCalled();
    expect(ctx.setToolAlign).not.toHaveBeenCalled();
    expect(ctx.setToolTrim).not.toHaveBeenCalled();
    expect(ctx.startTransformFromSelection).not.toHaveBeenCalled();
  });
});

describe("kitchen worktop typed input command", () => {
  it("updates worktop typed value, HUD, and status for digit input", () => {
    const hud = typedHud();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      commitKitchenWorktopTypedLength: vi.fn(),
      kitchenWorktopDraw: {
        active: true,
        typedMm: "",
        lastPointerPx: { x: 12, y: 34 }
      },
      mode: "layout",
      S: { kitchenEditMode: true },
      setUnderlayStatus,
      viewMode: "2d",
      wallTypedHud: hud
    } as unknown as Parameters<typeof runKitchenWorktopTypedInputCommand>[0];

    expect(runKitchenWorktopTypedInputCommand(ctx, plainKeyEvent("7"))).toBe(true);

    expect(ctx.kitchenWorktopDraw.typedMm).toBe("7");
    expect(hud.textContent).toBe("7 mm");
    expect(hud.style.display).toBe("block");
    expect(hud.style.left).toBe("12px");
    expect(hud.style.top).toBe("34px");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Worktop: 7 mm (Enter = add point, Backspace = edit, Esc = confirm)");
  });

  it("clears worktop typed value and hides HUD on Backspace to empty", () => {
    const hud = typedHud();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      commitKitchenWorktopTypedLength: vi.fn(),
      kitchenWorktopDraw: {
        active: true,
        typedMm: "4",
        lastPointerPx: { x: 1, y: 2 }
      },
      mode: "layout",
      S: { kitchenEditMode: true },
      setUnderlayStatus,
      viewMode: "2d",
      wallTypedHud: hud
    } as unknown as Parameters<typeof runKitchenWorktopTypedInputCommand>[0];

    expect(runKitchenWorktopTypedInputCommand(ctx, plainKeyEvent("Backspace"))).toBe(true);

    expect(ctx.kitchenWorktopDraw.typedMm).toBe("");
    expect(hud.style.display).toBe("none");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Worktop: click points or type mm + Enter. Esc = confirm.");
  });

  it("returns the current worktop typed commit result on Enter", () => {
    const commitKitchenWorktopTypedLength = vi.fn(() => false);
    const ctx = {
      commitKitchenWorktopTypedLength,
      kitchenWorktopDraw: {
        active: true,
        typedMm: "1200",
        lastPointerPx: { x: 0, y: 0 }
      },
      mode: "layout",
      S: { kitchenEditMode: true },
      setUnderlayStatus: vi.fn(),
      viewMode: "2d",
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runKitchenWorktopTypedInputCommand>[0];

    expect(runKitchenWorktopTypedInputCommand(ctx, plainKeyEvent("Enter"))).toBe(false);
    commitKitchenWorktopTypedLength.mockReturnValue(true);
    expect(runKitchenWorktopTypedInputCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(commitKitchenWorktopTypedLength).toHaveBeenCalledTimes(2);
  });

  it("ignores typed input outside active 2d kitchen worktop drawing", () => {
    const ctx = {
      commitKitchenWorktopTypedLength: vi.fn(),
      kitchenWorktopDraw: {
        active: false,
        typedMm: "",
        lastPointerPx: { x: 0, y: 0 }
      },
      mode: "layout",
      S: { kitchenEditMode: true },
      setUnderlayStatus: vi.fn(),
      viewMode: "2d",
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runKitchenWorktopTypedInputCommand>[0];

    expect(runKitchenWorktopTypedInputCommand(ctx, plainKeyEvent("7"))).toBe(false);

    expect(ctx.kitchenWorktopDraw.typedMm).toBe("");
    expect(ctx.commitKitchenWorktopTypedLength).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).not.toHaveBeenCalled();
  });
});

describe("wall typed length command", () => {
  function wallTypedContext(overrides: Partial<Parameters<typeof runWallTypedLengthCommand>[0]> = {}) {
    const preview = new THREE.Mesh();
    const base = {
      addWall: vi.fn((a: THREE.Vector3, b: THREE.Vector3, thicknessMm: number) =>
        wall("typed-wall", { x: Math.round(a.x * 1000), z: Math.round(a.z * 1000) }, { x: Math.round(b.x * 1000), z: Math.round(b.z * 1000) })
      ),
      autoJoinAtMmPoint: vi.fn(),
      clearWallDrawState: vi.fn(),
      layoutTool: "wall",
      mountProps: vi.fn(),
      selectedKind: null,
      selectedWallId: null,
      setUnderlayStatus: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      viewMode: "2d",
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: true,
        a: new THREE.Vector3(0, 0, 0),
        chainStart: new THREE.Vector3(0, 0, 0),
        hoverB: new THREE.Vector3(1, 0, 0),
        lastPointerPx: { x: 10, y: 20 },
        preview,
        segments: 0,
        typedMm: ""
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runWallTypedLengthCommand>[0];
    return Object.assign(base, overrides) as Parameters<typeof runWallTypedLengthCommand>[0];
  }

  it("updates wall typed value, HUD, and status for digit input", () => {
    const ctx = wallTypedContext();

    expect(runWallTypedLengthCommand(ctx, plainKeyEvent("8"))).toBe(true);

    expect(ctx.wallDraw.typedMm).toBe("8");
    expect(ctx.wallTypedHud.textContent).toBe("8 mm");
    expect(ctx.wallTypedHud.style.display).toBe("block");
    expect(ctx.wallTypedHud.style.left).toBe("10px");
    expect(ctx.wallTypedHud.style.top).toBe("20px");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Wall: 8 mm (Enter = place, Backspace = edit)");
  });

  it("clears wall typed value and hides HUD on Backspace to empty", () => {
    const ctx = wallTypedContext();
    ctx.wallDraw.typedMm = "4";

    expect(runWallTypedLengthCommand(ctx, plainKeyEvent("Backspace"))).toBe(true);

    expect(ctx.wallDraw.typedMm).toBe("");
    expect(ctx.wallTypedHud.style.display).toBe("none");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Wall: second point... (type mm + Enter, Shift = no axis snap, N = precision 1 mm, Esc = stop)");
  });

  it("adds typed wall length and prepares the next wall segment on Enter", () => {
    const ctx = wallTypedContext();
    ctx.wallDraw.typedMm = "1200";

    expect(runWallTypedLengthCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(ctx.addWall).toHaveBeenCalledOnce();
    expect(ctx.addWall).toHaveBeenCalledWith(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, 0, 0), 100);
    expect(ctx.autoJoinAtMmPoint).toHaveBeenCalledTimes(2);
    expect(ctx.wallDraw.typedMm).toBe("");
    expect(ctx.wallDraw.a).toEqual(new THREE.Vector3(1.2, 0, 0));
    expect(ctx.selectedKind).toBe("wall");
    expect(ctx.selectedWallId).toBe("typed-wall");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenLastCalledWith("Wall: next point... (type mm + Enter, Shift = no axis snap, N = precision 1 mm, Esc = stop)");
  });

  it("returns false for unresolved typed wall endpoint without adding a wall", () => {
    const ctx = wallTypedContext();
    ctx.wallDraw.typedMm = ".";

    expect(runWallTypedLengthCommand(ctx, plainKeyEvent("Enter"))).toBe(false);

    expect(ctx.addWall).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).not.toHaveBeenCalled();
  });

  it("ignores typed wall length outside active 2d wall drawing", () => {
    const ctx = wallTypedContext({
      layoutTool: "select"
    } as Partial<Parameters<typeof runWallTypedLengthCommand>[0]>);

    expect(runWallTypedLengthCommand(ctx, plainKeyEvent("8"))).toBe(false);

    expect(ctx.wallDraw.typedMm).toBe("");
    expect(ctx.addWall).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).not.toHaveBeenCalled();
  });
});

describe("layout space keyboard shortcut", () => {
  it("mirrors the active wall draw side and refreshes the preview", () => {
    const preview = new THREE.Mesh();
    const a = new THREE.Vector3(1, 0, 2);
    const hoverB = new THREE.Vector3(3, 0, 4);
    const updateWallMeshWithJustification = vi.fn();
    const mountProps = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      commitHistory: vi.fn(),
      findInstance: vi.fn(() => null),
      layoutTool: "wall",
      mountProps,
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      rebuildInstance: vi.fn(() => true),
      S: {} as Parameters<typeof runLayoutSpaceShortcutCommand>[0]["S"],
      selectedInstanceId: null,
      selectedKind: null,
      selectedWallId: null,
      setToolSelect: vi.fn(),
      setUnderlayStatus,
      updateWallMeshWithJustification,
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: true,
        a,
        chainStart: null,
        hoverB,
        lastPointerPx: { x: 0, y: 0 },
        preview,
        segments: 0,
        typedMm: ""
      },
      walls: []
    } as Parameters<typeof runLayoutSpaceShortcutCommand>[0];

    expect(runLayoutSpaceShortcutCommand(ctx)).toBe(true);

    expect(ctx.wallDefault.exteriorSign).toBe(-1);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Wall: exterior right of A->B.");
    expect(updateWallMeshWithJustification).toHaveBeenCalledExactlyOnceWith(preview, a, hoverB, 100, "center", -1);
    expect(mountProps).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolSelect).not.toHaveBeenCalled();
  });

  it("mirrors the selected wall side and rebuilds wall visuals", () => {
    const selected = wall("w1", { x: 0, z: 0 }, { x: 1000, z: 0 });
    const other = wall("w2", { x: 1000, z: 0 }, { x: 1000, z: 800 });
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();
    const mountProps = vi.fn();
    const ctx = {
      commitHistory: vi.fn(),
      findInstance: vi.fn(() => null),
      layoutTool: "select",
      mountProps,
      rebuildWall,
      rebuildWallPlanMesh,
      rebuildInstance: vi.fn(() => true),
      S: {} as Parameters<typeof runLayoutSpaceShortcutCommand>[0]["S"],
      selectedInstanceId: null,
      selectedKind: "wall",
      selectedWallId: "w1",
      setToolSelect: vi.fn(),
      setUnderlayStatus: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: false,
        a: null,
        chainStart: null,
        hoverB: null,
        lastPointerPx: { x: 0, y: 0 },
        preview: null,
        segments: 0,
        typedMm: ""
      },
      walls: [selected, other]
    } as Parameters<typeof runLayoutSpaceShortcutCommand>[0];

    expect(runLayoutSpaceShortcutCommand(ctx)).toBe(true);

    expect(selected.params.exteriorSign).toBe(-1);
    expect(rebuildWall).toHaveBeenCalledTimes(2);
    expect(rebuildWall).toHaveBeenCalledWith(selected);
    expect(rebuildWall).toHaveBeenCalledWith(other);
    expect(rebuildWallPlanMesh).toHaveBeenCalledExactlyOnceWith();
    expect(mountProps).toHaveBeenCalledExactlyOnceWith();
    expect(ctx.setToolSelect).not.toHaveBeenCalled();
  });

  it("falls back to select tool when space has no wall-specific target", () => {
    const setToolSelect = vi.fn();
    const mountProps = vi.fn();
    const ctx = {
      commitHistory: vi.fn(),
      findInstance: vi.fn(() => null),
      layoutTool: "select",
      mountProps,
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      rebuildInstance: vi.fn(() => true),
      S: {} as Parameters<typeof runLayoutSpaceShortcutCommand>[0]["S"],
      selectedInstanceId: null,
      selectedKind: null,
      selectedWallId: null,
      setToolSelect,
      setUnderlayStatus: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: false,
        a: null,
        chainStart: null,
        hoverB: null,
        lastPointerPx: { x: 0, y: 0 },
        preview: null,
        segments: 0,
        typedMm: ""
      },
      walls: []
    } as Parameters<typeof runLayoutSpaceShortcutCommand>[0];

    expect(runLayoutSpaceShortcutCommand(ctx)).toBe(true);

    expect(setToolSelect).toHaveBeenCalledExactlyOnceWith();
    expect(mountProps).not.toHaveBeenCalled();
  });
});

describe("delete selection keyboard shortcut", () => {
  it("routes Delete and Backspace through deleteSelected", () => {
    const deleteSelected = vi.fn(() => true);
    const ctx = { deleteSelected };

    expect(runDeleteSelectionShortcutCommand(ctx, plainKeyEvent("Delete"))).toBe(true);
    expect(runDeleteSelectionShortcutCommand(ctx, plainKeyEvent("Backspace"))).toBe(true);

    expect(deleteSelected).toHaveBeenCalledTimes(2);
  });

  it("returns false when deleteSelected does not handle the shortcut", () => {
    const deleteSelected = vi.fn(() => false);
    const ctx = { deleteSelected };

    expect(runDeleteSelectionShortcutCommand(ctx, plainKeyEvent("Delete"))).toBe(false);

    expect(deleteSelected).toHaveBeenCalledExactlyOnceWith();
  });

  it("ignores non-delete keys", () => {
    const deleteSelected = vi.fn(() => true);
    const ctx = { deleteSelected };

    expect(runDeleteSelectionShortcutCommand(ctx, plainKeyEvent("Enter"))).toBe(false);

    expect(deleteSelected).not.toHaveBeenCalled();
  });

  it("does not delete selection from typing targets", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener });
    const deleteSelected = vi.fn(() => true);
    installKeyboardInputHandlers(installKeyboardContext({
      S: { kitchenEditMode: false },
      helpers: {},
      mode: "layout",
      layoutTool: "select",
      viewMode: "2d",
      activeViewerTab: "floorplan",
      floorEdit: { active: false, first: null, hover: null },
      placement: { active: false },
      transformState: { kind: null },
      isTypingTarget: () => true,
      deleteSelected,
      undo: vi.fn(),
      redo: vi.fn()
    }));

    const handler = addEventListener.mock.calls[0][1] as (ev: KeyboardEvent) => void;
    const ev = {
      ...plainKeyEvent("Delete"),
      defaultPrevented: false,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent;
    handler(ev);

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe("clear selection keyboard shortcut", () => {
  it("routes Escape through clearSelection", () => {
    const clearSelection = vi.fn();

    expect(runClearSelectionShortcutCommand({ clearSelection }, plainKeyEvent("Escape"))).toBe(true);

    expect(clearSelection).toHaveBeenCalledExactlyOnceWith();
  });

  it("ignores non-Escape keys", () => {
    const clearSelection = vi.fn();

    expect(runClearSelectionShortcutCommand({ clearSelection }, plainKeyEvent("Delete"))).toBe(false);

    expect(clearSelection).not.toHaveBeenCalled();
  });
});

describe("top-level keyboard input command dispatcher", () => {
  function topLevelKeyboardContext(overrides: Record<string, unknown> = {}) {
    const ctx = {
      ...keyboardNudgeCommandContext({}),
      activeViewerTab: "floorplan",
      addWall: vi.fn(),
      applyMoveDelta: vi.fn(),
      applyRotateAngle: vi.fn(),
      cancelDoorPlacement: vi.fn(),
      cancelPlacement: vi.fn(),
      cancelWindowPlacement: vi.fn(),
      clearSelection: vi.fn(),
      clearTransform: vi.fn(),
      clearWallDrawState: vi.fn(),
      commitKitchenWorktopTypedLength: vi.fn(() => false),
      customFurnitureMode: undefined,
      deleteSelected: vi.fn(() => false),
      discardFloorBoundaryEdit: vi.fn(),
      drawSnapOverlay: { hide: vi.fn() },
      floorEdit: {
        active: false,
        first: null,
        hover: null
      },
      flipDoorPlacementSwingSide: vi.fn(() => false),
      cancelActiveViewerTool: vi.fn(() => false),
      handleCustomFurnitureEscape: vi.fn(() => false),
      handleGlobalMeasurementClear: vi.fn(() => false),
      handleLayoutEscape: vi.fn(() => false),
      helpers: {},
      hideHoverCursor: vi.fn(),
      hudHoverLine: null,
      isDoorPlacementActive: vi.fn(() => false),
      isTypingTarget: vi.fn(() => false),
      isWindowPlacementActive: vi.fn(() => false),
      kitchenWorktopDraw: {
        active: false,
        typedMm: "",
        lastPointerPx: { x: 0, y: 0 }
      },
      mirrorKitchenWorktopDraw: vi.fn(),
      mode: "layout",
      placement: { active: false },
      placementHelpers: {},
      redo: vi.fn(),
      renderFloorBoundaryEdit: vi.fn(),
      rotateDoorPlacement: vi.fn(() => false),
      sectionDraw: { mirrored: false },
      setToolAlign: vi.fn(),
      setToolSelect: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      setUnderlayStatus: vi.fn(),
      startTransformFromSelection: vi.fn(),
      transformState: {
        kind: null,
        lastAngleSign: 1,
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        moveSnapDisabled: false,
        step: null,
        stickyMove: false,
        typed: ""
      },
      undo: vi.fn(),
      updateSectionDrawPreview: vi.fn(),
      updateWallMeshWithJustification: vi.fn(),
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: false,
        a: null,
        chainStart: null,
        hoverB: null,
        lastPointerPx: { x: 0, y: 0 },
        preview: null,
        segments: 0,
        typedMm: ""
      },
      wallTypedHud: typedHud(),
      ...overrides
    };
    return ctx as unknown as Parameters<typeof runKeyboardInputCommand>[0];
  }

  it("leaves all keys at typing targets without preventing default", () => {
    const ev = plainKeyEvent("Delete", { preventDefault: vi.fn(), target: { nodeName: "INPUT" } as unknown as EventTarget });
    const deleteSelected = vi.fn(() => true);
    const ctx = topLevelKeyboardContext({
      deleteSelected,
      isTypingTarget: vi.fn(() => true)
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(false);

    expect(deleteSelected).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("leaves Escape and Undo at typing targets instead of cancelling editor state", () => {
    const handleLayoutEscape = vi.fn(() => true);
    const undo = vi.fn();
    const escape = plainKeyEvent("Escape", { target: { nodeName: "INPUT" } as unknown as EventTarget });
    const undoEvent = shortcutEvent("z", { target: { nodeName: "INPUT" } as unknown as EventTarget });
    const ctx = topLevelKeyboardContext({
      handleLayoutEscape,
      isTypingTarget: vi.fn(() => true),
      undo
    });

    expect(runKeyboardInputCommand(ctx, escape)).toBe(false);
    expect(runKeyboardInputCommand(ctx, undoEvent)).toBe(false);

    expect(handleLayoutEscape).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it("runs global Escape owners before placement and layout commands", () => {
    const handleGlobalMeasurementClear = vi.fn(() => true);
    const cancelDoorPlacement = vi.fn();
    const ctx = topLevelKeyboardContext({
      handleGlobalMeasurementClear,
      cancelDoorPlacement,
      isDoorPlacementActive: vi.fn(() => true)
    });

    expect(runKeyboardInputCommand(ctx, plainKeyEvent("Escape"))).toBe(true);

    expect(handleGlobalMeasurementClear).toHaveBeenCalledOnce();
    expect(cancelDoorPlacement).not.toHaveBeenCalled();
  });

  it("routes placement shortcuts before drawing and layout commands", () => {
    const ev = {
      ...plainKeyEvent("Escape"),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent;
    const cancelDoorPlacement = vi.fn();
    const deleteSelected = vi.fn(() => true);
    const ctx = topLevelKeyboardContext({
      cancelDoorPlacement,
      deleteSelected,
      isDoorPlacementActive: vi.fn(() => true)
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(cancelDoorPlacement).toHaveBeenCalledOnce();
    expect(deleteSelected).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    expect(ev.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("routes Delete through global delete before kitchen edit mode swallows layout keys", () => {
    const ev = {
      ...plainKeyEvent("Delete", { preventDefault: vi.fn() }),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent;
    const deleteSelected = vi.fn(() => true);
    const ctx = topLevelKeyboardContext({
      deleteSelected,
      S: {
        kitchenEditMode: true,
        kitchenCtx: { worktopBackOffsetMm: 20 },
        kitchenGroups: []
      }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(deleteSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
    expect(ev.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it("mirrors selected side-aware modules on Space before kitchen edit mode swallows layout keys", () => {
    const ev = plainKeyEvent(" ", { code: "Space", preventDefault: vi.fn() });
    const previousKitchenPlacement = { kind: "corner" as const, worktopId: "wt", segmentIndex: 1, offsetAlongM: 0.5, cornerIndex: 2 };
    const inst = {
      id: "m1",
      params: { type: "fwm_catalog_base_corner", variant: "corner_1d", side: "left" },
      kitchenGroupId: "kg1",
      kitchenPlacement: structuredClone(previousKitchenPlacement),
      root: new THREE.Group(),
      module: new THREE.Group()
    } as unknown as LayoutInstance;
    const applyKitchenPlacementBinding = vi.fn(() => true);
    const rebuildInstance = vi.fn(() => {
      inst.kitchenPlacement = null;
      return true;
    });
    const commitHistory = vi.fn();
    const mountProps = vi.fn();
    const ctx = topLevelKeyboardContext({
      applyKitchenPlacementBinding,
      commitHistory,
      findInstance: vi.fn((id: string) => (id === "m1" ? inst : null)),
      instances: [inst],
      mountProps,
      rebuildInstance,
      selectedInstanceId: "m1",
      selectedKind: "module",
      S: {
        kitchenEditMode: true,
        kitchenCtx: { worktopBackOffsetMm: 20 },
        kitchenGroups: [{ id: "kg1", ctx: { worktopBackOffsetMm: 45 } }]
      }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(inst.params.side).toBe("right");
    expect(rebuildInstance).toHaveBeenCalledWith(inst, {
      preserveBackAnchor: true,
      previousParams: { type: "fwm_catalog_base_corner", variant: "corner_1d", side: "left" }
    });
    expect(applyKitchenPlacementBinding).toHaveBeenCalledExactlyOnceWith(inst, previousKitchenPlacement, 45);
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(mountProps).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("mirrors selected side-aware modules even when viewer navigation already consumed Space", () => {
    const ev = plainKeyEvent(" ", { code: "Space", defaultPrevented: true });
    const inst = {
      id: "m1",
      params: { type: "fwm_catalog_base_corner", variant: "corner_1d", side: "left" },
      kitchenPlacement: { worktopId: "wt", segmentIndex: 1, offsetAlongM: 0.5 },
      root: new THREE.Group(),
      module: new THREE.Group()
    } as unknown as LayoutInstance;
    const rebuildInstance = vi.fn(() => true);
    const ctx = topLevelKeyboardContext({
      findInstance: vi.fn((id: string) => (id === "m1" ? inst : null)),
      instances: [inst],
      rebuildInstance,
      selectedInstanceId: "m1",
      selectedKind: "module"
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(inst.params.side).toBe("right");
    expect(rebuildInstance).toHaveBeenCalledOnce();
  });

  it("routes active placement Space even when viewer navigation already consumed Space", () => {
    const layoutRoot = new THREE.Group();
    const oldRoot = new THREE.Group();
    layoutRoot.add(oldRoot);
    const nextGhost = {
      kitchenPlacement: null,
      root: new THREE.Group(),
      module: new THREE.Group(),
      pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
      outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
      localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
    };
    const ev = {
      ...plainKeyEvent(" ", { code: "Space", defaultPrevented: true }),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent;
    const ctx = topLevelKeyboardContext({
      S: {
        placement: {
          active: true,
          ghost: {
            kitchenPlacement: { worktopId: "wt", segmentIndex: 1, offsetAlongM: 0.5 },
            root: oldRoot,
            module: new THREE.Group(),
            pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
            outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
            localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
          },
          ghostValid: false,
          params: { type: "fwm_catalog_base_corner", variant: "corner_1d", side: "left" },
          lastCursor: new THREE.Vector3(0.2, 0, 0.3),
          lastGhostCursor: new THREE.Vector3(0.2, 0, 0.3),
          pendingCursor: null,
          ghostFrame: null
        }
      },
      placement: { active: true },
      placementHelpers: {
        anyOverlap: vi.fn(() => false),
        autoOrientModuleToRoomWallIfSnapped: vi.fn(),
        createInstance: vi.fn(() => nextGhost),
        disposeObject3D: vi.fn(),
        instanceWorldBox: vi.fn(() => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))),
        layoutRoot,
        moduleOverlapsKitchenWorktops: vi.fn(() => false),
        moduleOverlapsWalls: vi.fn(() => false),
        mountProps: vi.fn(),
        roomContainsBoxXZ: vi.fn(() => true),
        setPlacementAdjacencyPreview: vi.fn(),
        setUnderlayStatus: vi.fn()
      }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect((ctx.S.placement.params as unknown as { side: string }).side).toBe("right");
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
    expect(ev.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("clears selected objects on Escape even when viewer navigation already consumed the key", () => {
    const ev = plainKeyEvent("Escape", { defaultPrevented: true });
    const clearSelection = vi.fn();
    const ctx = topLevelKeyboardContext({
      clearSelection,
      selectedInstanceId: "m1",
      selectedKind: "module"
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(clearSelection).toHaveBeenCalledOnce();
  });

  it("routes Delete through global delete before active floor edit handling", () => {
    const ev = {
      ...plainKeyEvent("Delete", { preventDefault: vi.fn() }),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn()
    } as unknown as KeyboardEvent;
    const deleteSelected = vi.fn(() => true);
    const discardFloorBoundaryEdit = vi.fn();
    const ctx = topLevelKeyboardContext({
      deleteSelected,
      discardFloorBoundaryEdit,
      floorEdit: { active: true, first: null, hover: null }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(deleteSelected).toHaveBeenCalledExactlyOnceWith();
    expect(discardFloorBoundaryEdit).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
    expect(ev.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it("routes Escape through global clear selection before kitchen edit mode swallows layout keys", () => {
    const ev = plainKeyEvent("Escape", { preventDefault: vi.fn() });
    const clearSelection = vi.fn();
    const ctx = topLevelKeyboardContext({
      clearSelection,
      S: {
        kitchenEditMode: true,
        kitchenCtx: { worktopBackOffsetMm: 20 },
        kitchenGroups: []
      }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(clearSelection).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("routes active Move typed distance before kitchen edit mode swallows layout keys", () => {
    const ev = plainKeyEvent("2", { preventDefault: vi.fn() });
    const clearSelection = vi.fn();
    const ctx = topLevelKeyboardContext({
      clearSelection,
      S: {
        kitchenEditMode: true,
        kitchenCtx: { worktopBackOffsetMm: 20 },
        kitchenGroups: []
      },
      transformState: {
        kind: "move",
        lastAngleSign: 1,
        lastPointerPx: { x: 15, y: 25 },
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        moveSnapDisabled: false,
        step: "pickTarget",
        stickyMove: false,
        typed: ""
      }
    });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(ctx.transformState.typed).toBe("2");
    expect(ctx.wallTypedHud.textContent).toBe("2 mm");
    expect(ctx.wallTypedHud.style.display).toBe("block");
    expect(clearSelection).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("delegates layout Delete through the layout dispatcher", () => {
    const ev = plainKeyEvent("Delete", { preventDefault: vi.fn() });
    const deleteSelected = vi.fn(() => true);
    const ctx = topLevelKeyboardContext({ deleteSelected });

    expect(runKeyboardInputCommand(ctx, ev)).toBe(true);

    expect(deleteSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });
});

describe("layout keyboard command dispatcher", () => {
  function layoutDispatcherContext(overrides: Record<string, unknown> = {}) {
    const ctx = {
      ...keyboardNudgeCommandContext({}),
      addWall: vi.fn(),
      applyMoveDelta: vi.fn(),
      applyRotateAngle: vi.fn(),
      cancelPlacement: vi.fn(),
      clearSelection: vi.fn(),
      clearTransform: vi.fn(),
      clearWallDrawState: vi.fn(),
      deleteSelected: vi.fn(() => false),
      drawSnapOverlay: { hide: vi.fn() },
      handleLayoutEscape: vi.fn(() => false),
      hideHoverCursor: vi.fn(),
      hudHoverLine: null,
      mode: "layout",
      placement: { active: false },
      placementHelpers: {},
      selectPlanSnap: null,
      setToolAlign: vi.fn(),
      setToolSelect: vi.fn(),
      setToolTrim: vi.fn(),
      setToolWall: vi.fn(),
      setUnderlayStatus: vi.fn(),
      startTransformFromSelection: vi.fn(),
      transformState: {
        kind: null,
        lastAngleSign: 1,
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        moveSnapDisabled: false,
        step: null,
        stickyMove: false,
        typed: ""
      },
      updateWallMeshWithJustification: vi.fn(),
      wallDefault: {
        exteriorSign: 1,
        heightMm: 2600,
        justification: "center",
        materialId: "wall",
        thicknessMm: 100,
        typeId: null
      },
      wallDraw: {
        active: false,
        a: null,
        chainStart: null,
        hoverB: null,
        lastPointerPx: { x: 0, y: 0 },
        preview: null,
        segments: 0,
        typedMm: ""
      },
      wallTypedHud: typedHud(),
      ...overrides
    };
    return ctx as unknown as Parameters<typeof runLayoutKeyboardCommand>[0];
  }

  it("ignores non-layout mode", () => {
    const ev = plainKeyEvent("Delete", { preventDefault: vi.fn() });
    const ctx = layoutDispatcherContext({
      mode: "build",
      deleteSelected: vi.fn(() => true)
    });

    expect(runLayoutKeyboardCommand(ctx, ev)).toBe(false);

    expect(ctx.deleteSelected).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("routes Delete after layout-specific handlers and prevents default when handled", () => {
    const ev = plainKeyEvent("Delete", { preventDefault: vi.fn() });
    const deleteSelected = vi.fn(() => true);
    const ctx = layoutDispatcherContext({ deleteSelected });

    expect(runLayoutKeyboardCommand(ctx, ev)).toBe(true);

    expect(deleteSelected).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("prevents Space in layout mode even when no space command target changes", () => {
    const ev = plainKeyEvent(" ", { code: "Space", preventDefault: vi.fn() });
    const ctx = layoutDispatcherContext({
      layoutTool: "select",
      selectedKind: null,
      selectedWallId: null
    });

    expect(runLayoutKeyboardCommand(ctx, ev)).toBe(true);

    expect(ctx.setToolSelect).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("delegates Escape to layout escape handler without forcing preventDefault", () => {
    const ev = plainKeyEvent("Escape", { preventDefault: vi.fn() });
    const handleLayoutEscape = vi.fn(() => true);
    const ctx = layoutDispatcherContext({ handleLayoutEscape });

    expect(runLayoutKeyboardCommand(ctx, ev)).toBe(true);

    expect(handleLayoutEscape).toHaveBeenCalledExactlyOnceWith(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it("routes unhandled Escape through global clear selection", () => {
    const ev = plainKeyEvent("Escape", { preventDefault: vi.fn() });
    const clearSelection = vi.fn();
    const ctx = layoutDispatcherContext({
      clearSelection,
      handleLayoutEscape: vi.fn(() => false)
    });

    expect(runLayoutKeyboardCommand(ctx, ev)).toBe(true);

    expect(clearSelection).toHaveBeenCalledExactlyOnceWith();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });
});

describe("drawing space keyboard shortcut", () => {
  function drawingSpaceContext(overrides: Record<string, unknown> = {}) {
    return {
      activeViewerTab: "floorplan",
      kitchenWorktopDraw: {
        active: false,
        lastPointerPx: { x: 0, y: 0 },
        typedMm: ""
      },
      layoutTool: "select",
      mirrorKitchenWorktopDraw: vi.fn(),
      mode: "layout",
      S: { kitchenEditMode: false },
      sectionDraw: { mirrored: false },
      setUnderlayStatus: vi.fn(),
      updateSectionDrawPreview: vi.fn(),
      viewMode: "2d",
      ...overrides
    } as unknown as Parameters<typeof runDrawingSpaceShortcutCommand>[0];
  }

  it("mirrors active kitchen worktop drawing before other drawing shortcuts", () => {
    const mirrorKitchenWorktopDraw = vi.fn();
    const updateSectionDrawPreview = vi.fn();
    const ctx = drawingSpaceContext({
      kitchenWorktopDraw: {
        active: true,
        lastPointerPx: { x: 0, y: 0 },
        typedMm: ""
      },
      layoutTool: "section",
      mirrorKitchenWorktopDraw,
      S: { kitchenEditMode: true },
      updateSectionDrawPreview
    });

    expect(runDrawingSpaceShortcutCommand(ctx, plainKeyEvent(" "))).toBe(true);

    expect(mirrorKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith();
    expect(updateSectionDrawPreview).not.toHaveBeenCalled();
  });

  it("toggles section drawing mirror on floorplan Space", () => {
    const updateSectionDrawPreview = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = drawingSpaceContext({
      layoutTool: "section",
      sectionDraw: { mirrored: false },
      setUnderlayStatus,
      updateSectionDrawPreview
    });

    expect(runDrawingSpaceShortcutCommand(ctx, plainKeyEvent(" "))).toBe(true);

    expect(ctx.sectionDraw.mirrored).toBe(true);
    expect(updateSectionDrawPreview).toHaveBeenCalledExactlyOnceWith();
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Section: smer mirrored.");
  });

  it("ignores non-space keys and inactive drawing contexts", () => {
    const mirrorKitchenWorktopDraw = vi.fn();
    const updateSectionDrawPreview = vi.fn();
    const ctx = drawingSpaceContext({
      mirrorKitchenWorktopDraw,
      updateSectionDrawPreview
    });

    expect(runDrawingSpaceShortcutCommand(ctx, plainKeyEvent("Enter"))).toBe(false);
    expect(runDrawingSpaceShortcutCommand(ctx, plainKeyEvent(" "))).toBe(false);

    expect(mirrorKitchenWorktopDraw).not.toHaveBeenCalled();
    expect(updateSectionDrawPreview).not.toHaveBeenCalled();
  });
});

describe("placement keyboard shortcuts", () => {
  function placementCtx(overrides: Record<string, unknown> = {}) {
    return {
      cancelDoorPlacement: vi.fn(),
      cancelWindowPlacement: vi.fn(),
      flipDoorPlacementSwingSide: vi.fn(() => false),
      isDoorPlacementActive: vi.fn(() => false),
      isWindowPlacementActive: vi.fn(() => false),
      rotateDoorPlacement: vi.fn(() => false),
      ...overrides
    } as Parameters<typeof runPlacementShortcutCommand>[0];
  }

  it("cancels active door placement on Escape before window placement", () => {
    const cancelDoorPlacement = vi.fn();
    const cancelWindowPlacement = vi.fn();
    const ctx = placementCtx({
      cancelDoorPlacement,
      cancelWindowPlacement,
      isDoorPlacementActive: vi.fn(() => true),
      isWindowPlacementActive: vi.fn(() => true)
    });

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent("Escape"), shiftKey: false })).toBe(true);

    expect(cancelDoorPlacement).toHaveBeenCalledExactlyOnceWith();
    expect(cancelWindowPlacement).not.toHaveBeenCalled();
  });

  it("cancels active window placement on Escape when door placement is inactive", () => {
    const cancelWindowPlacement = vi.fn();
    const ctx = placementCtx({
      cancelWindowPlacement,
      isDoorPlacementActive: vi.fn(() => false),
      isWindowPlacementActive: vi.fn(() => true)
    });

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent("Escape"), shiftKey: false })).toBe(true);

    expect(cancelWindowPlacement).toHaveBeenCalledExactlyOnceWith();
  });

  it("routes active door placement Space shortcuts to swing flip or rotate", () => {
    const flipDoorPlacementSwingSide = vi.fn(() => true);
    const rotateDoorPlacement = vi.fn(() => true);
    const ctx = placementCtx({
      flipDoorPlacementSwingSide,
      isDoorPlacementActive: vi.fn(() => true),
      rotateDoorPlacement
    });

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent(" "), shiftKey: true })).toBe(true);
    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent(" "), shiftKey: false })).toBe(true);

    expect(flipDoorPlacementSwingSide).toHaveBeenCalledExactlyOnceWith();
    expect(rotateDoorPlacement).toHaveBeenCalledExactlyOnceWith();
  });

  it("rotates active free module placement on Space", () => {
    const ghost = {
      kitchenPlacement: null,
      root: {
        rotation: { y: 0 }
      }
    };
    const setUnderlayStatus = vi.fn();
    const ctx = placementCtx({
      S: {
        placement: {
          active: true,
          ghost,
          params: null,
          lastCursor: new THREE.Vector3()
        }
      },
      placement: { active: true },
      placementHelpers: {
        setUnderlayStatus
      }
    });

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent(" "), shiftKey: false })).toBe(true);
    expect(ghost.root.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(setUnderlayStatus).toHaveBeenCalledWith("Placement: rotacia 90°. Space = +90°.");
  });

  it("mirrors active side-aware module placement on Space instead of rotating it", () => {
    const layoutRoot = new THREE.Group();
    const oldRoot = new THREE.Group();
    layoutRoot.add(oldRoot);
    const ghost = {
      kitchenPlacement: { worktopId: "wt", segmentIndex: 1, offsetAlongM: 0.5 },
      root: oldRoot,
      module: new THREE.Group(),
      pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
      outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
      localBox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
    };
    const nextGhost = {
      ...ghost,
      kitchenPlacement: null,
      root: new THREE.Group(),
      pick: new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 1), new THREE.MeshBasicMaterial()),
      outline: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
    };
    const disposeObject3D = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = placementCtx({
      S: {
        placement: {
          active: true,
          ghost,
          ghostValid: false,
          params: { type: "fwm_catalog_base_corner", variant: "corner_1d", side: "left" },
          lastCursor: new THREE.Vector3(0.2, 0, 0.3),
          lastGhostCursor: new THREE.Vector3(0.2, 0, 0.3),
          pendingCursor: null,
          ghostFrame: null
        }
      },
      placement: { active: true },
      placementHelpers: {
        anyOverlap: vi.fn(() => false),
        autoOrientModuleToRoomWallIfSnapped: vi.fn(),
        createInstance: vi.fn(() => nextGhost),
        disposeObject3D,
        instanceWorldBox: vi.fn(() => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))),
        layoutRoot,
        moduleOverlapsKitchenWorktops: vi.fn(() => false),
        moduleOverlapsWalls: vi.fn(() => false),
        mountProps: vi.fn(),
        roomContainsBoxXZ: vi.fn(() => true),
        setPlacementAdjacencyPreview: vi.fn(),
        setUnderlayStatus
      }
    });

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent(" "), shiftKey: false })).toBe(true);

    const placementState = ctx.S!.placement;
    expect((placementState.params as unknown as { side: string }).side).toBe("right");
    expect(disposeObject3D).toHaveBeenCalledWith(oldRoot);
    expect(nextGhost.root.rotation.y).toBe(0);
    expect(setUnderlayStatus).toHaveBeenLastCalledWith("Placement: zrkadlene na right. Space = druha strana.");
  });

  it("ignores inactive placement shortcuts", () => {
    const ctx = placementCtx();

    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent("Escape"), shiftKey: false })).toBe(false);
    expect(runPlacementShortcutCommand(ctx, { ...plainKeyEvent(" "), shiftKey: false })).toBe(false);

    expect(ctx.cancelDoorPlacement).not.toHaveBeenCalled();
    expect(ctx.cancelWindowPlacement).not.toHaveBeenCalled();
    expect(ctx.flipDoorPlacementSwingSide).not.toHaveBeenCalled();
    expect(ctx.rotateDoorPlacement).not.toHaveBeenCalled();
  });
});

describe("floor edit keyboard shortcuts", () => {
  it("clears the first floor boundary point on Escape and rerenders the edit", () => {
    const renderFloorBoundaryEdit = vi.fn();
    const discardFloorBoundaryEdit = vi.fn();
    const ctx = {
      floorEdit: {
        active: true,
        first: { x: 1, z: 2 },
        hover: { x: 3, z: 4 }
      },
      renderFloorBoundaryEdit,
      discardFloorBoundaryEdit
    };

    expect(runFloorEditEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(true);

    expect(ctx.floorEdit.first).toBeNull();
    expect(ctx.floorEdit.hover).toBeNull();
    expect(renderFloorBoundaryEdit).toHaveBeenCalledExactlyOnceWith();
    expect(discardFloorBoundaryEdit).not.toHaveBeenCalled();
  });

  it("discards floor boundary edit on Escape when no first point is active", () => {
    const renderFloorBoundaryEdit = vi.fn();
    const discardFloorBoundaryEdit = vi.fn();
    const ctx = {
      floorEdit: {
        active: true,
        first: null,
        hover: null
      },
      renderFloorBoundaryEdit,
      discardFloorBoundaryEdit
    };

    expect(runFloorEditEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(true);

    expect(discardFloorBoundaryEdit).toHaveBeenCalledExactlyOnceWith();
    expect(renderFloorBoundaryEdit).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys and inactive floor edit state", () => {
    const renderFloorBoundaryEdit = vi.fn();
    const discardFloorBoundaryEdit = vi.fn();
    const ctx = {
      floorEdit: {
        active: true,
        first: { x: 1, z: 2 },
        hover: { x: 3, z: 4 }
      },
      renderFloorBoundaryEdit,
      discardFloorBoundaryEdit
    };

    expect(runFloorEditEscapeCommand(ctx, plainKeyEvent("Enter"))).toBe(false);
    ctx.floorEdit.active = false;
    expect(runFloorEditEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(false);

    expect(ctx.floorEdit.first).toEqual({ x: 1, z: 2 });
    expect(ctx.floorEdit.hover).toEqual({ x: 3, z: 4 });
    expect(renderFloorBoundaryEdit).not.toHaveBeenCalled();
    expect(discardFloorBoundaryEdit).not.toHaveBeenCalled();
  });
});

describe("active placement keyboard shortcuts", () => {
  it("cancels active placement on Escape", () => {
    const cancelPlacement = vi.fn();
    const state = { id: "state" };
    const placementHelpers = { id: "helpers" };
    const ctx = {
      cancelPlacement,
      placement: { active: true },
      placementHelpers,
      S: state
    } as unknown as Parameters<typeof runActivePlacementEscapeCommand>[0];

    expect(runActivePlacementEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(true);

    expect(cancelPlacement).toHaveBeenCalledExactlyOnceWith(state, placementHelpers);
  });

  it("ignores Escape when placement is inactive", () => {
    const cancelPlacement = vi.fn();
    const ctx = {
      cancelPlacement,
      placement: { active: false },
      placementHelpers: {},
      S: {}
    } as unknown as Parameters<typeof runActivePlacementEscapeCommand>[0];

    expect(runActivePlacementEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(false);

    expect(cancelPlacement).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys while placement is active", () => {
    const cancelPlacement = vi.fn();
    const ctx = {
      cancelPlacement,
      placement: { active: true },
      placementHelpers: {},
      S: {}
    } as unknown as Parameters<typeof runActivePlacementEscapeCommand>[0];

    expect(runActivePlacementEscapeCommand(ctx, plainKeyEvent("Enter"))).toBe(false);

    expect(cancelPlacement).not.toHaveBeenCalled();
  });
});

describe("transform keyboard shortcuts", () => {
  it("routes transform Escape first and prevents default", () => {
    const clearTransform = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ev = plainKeyEvent("Escape", { preventDefault: vi.fn() });
    const ctx = {
      applyMoveDelta: vi.fn(),
      applyRotateAngle: vi.fn(),
      clearTransform,
      commitHistory: vi.fn(),
      drawSnapOverlay: { hide: vi.fn() },
      hideHoverCursor: vi.fn(),
      hudHoverLine: { visible: true },
      mountProps: vi.fn(),
      S: {},
      selectPlanSnap: { id: "snap-1" },
      setUnderlayStatus,
      startTransformFromSelection: vi.fn(),
      transformState: {
        kind: "move",
        lastAngleSign: 1,
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        moveSnapDisabled: false,
        step: "pickTarget",
        stickyMove: false,
        typed: "100"
      }
    } as unknown as Parameters<typeof runLayoutTransformKeyboardCommand>[0];

    expect(runLayoutTransformKeyboardCommand(ctx, ev)).toBe(true);

    expect(clearTransform).toHaveBeenCalledExactlyOnceWith({ restore: true, status: "Canceled." });
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ctx.transformState.moveSnapDisabled).toBe(false);
    expect(setUnderlayStatus).not.toHaveBeenCalled();
  });

  it("routes transform typed move distance and prevents default", () => {
    const commitHistory = vi.fn();
    const clearTransform = vi.fn();
    const ev = plainKeyEvent("Enter", { preventDefault: vi.fn() });
    const ctx = {
      applyMoveDelta: vi.fn((requestedDelta: THREE.Vector3) => {
        ctx.transformState.lastValidDelta = requestedDelta.clone();
      }),
      applyRotateAngle: vi.fn(),
      clearTransform,
      commitHistory,
      mountProps: vi.fn(),
      S: {},
      setUnderlayStatus: vi.fn(),
      startTransformFromSelection: vi.fn(),
      transformState: {
        kind: "move",
        lastPointerPx: { x: 0, y: 0 },
        lastAngleSign: 1,
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        moveSnapDisabled: false,
        step: "pickTarget",
        stickyMove: false,
        typed: "100"
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runLayoutTransformKeyboardCommand>[0];

    expect(runLayoutTransformKeyboardCommand(ctx, ev)).toBe(true);

    expect(ctx.applyMoveDelta).toHaveBeenCalledExactlyOnceWith(new THREE.Vector3(0.1, 0, 0));
    expect(commitHistory).toHaveBeenCalledExactlyOnceWith(ctx.S);
    expect(clearTransform).toHaveBeenCalledExactlyOnceWith({ continueMove: false, status: "Move: done." });
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("ignores transform dispatcher when no transform is active", () => {
    const ev = plainKeyEvent("n", { preventDefault: vi.fn() });
    const ctx = {
      clearTransform: vi.fn(),
      setUnderlayStatus: vi.fn(),
      transformState: {
        kind: null
      }
    } as unknown as Parameters<typeof runLayoutTransformKeyboardCommand>[0];

    expect(runLayoutTransformKeyboardCommand(ctx, ev)).toBe(false);

    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ctx.clearTransform).not.toHaveBeenCalled();
    expect(ctx.setUnderlayStatus).not.toHaveBeenCalled();
  });

  it("cancels active transform on Escape with restore", () => {
    const clearTransform = vi.fn();
    const ctx = {
      clearTransform,
      transformState: { kind: "move" }
    } as unknown as Parameters<typeof runTransformEscapeCommand>[0];

    expect(runTransformEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(true);

    expect(clearTransform).toHaveBeenCalledExactlyOnceWith({ restore: true, status: "Canceled." });
  });

  it("ignores Escape when transform is inactive", () => {
    const clearTransform = vi.fn();
    const ctx = {
      clearTransform,
      transformState: { kind: null }
    } as unknown as Parameters<typeof runTransformEscapeCommand>[0];

    expect(runTransformEscapeCommand(ctx, plainKeyEvent("Escape"))).toBe(false);

    expect(clearTransform).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys while transform is active", () => {
    const clearTransform = vi.fn();
    const ctx = {
      clearTransform,
      transformState: { kind: "rotate" }
    } as unknown as Parameters<typeof runTransformEscapeCommand>[0];

    expect(runTransformEscapeCommand(ctx, plainKeyEvent("Enter"))).toBe(false);

    expect(clearTransform).not.toHaveBeenCalled();
  });

  it("toggles move snapping off and clears snap hover visuals", () => {
    const drawSnapOverlay = { hide: vi.fn() };
    const hideHoverCursor = vi.fn();
    const hudHoverLine = { visible: true };
    const setUnderlayStatus = vi.fn();
    const ctx = {
      drawSnapOverlay,
      hideHoverCursor,
      hudHoverLine,
      selectPlanSnap: { id: "snap-1" },
      setUnderlayStatus,
      transformState: {
        kind: "move",
        moveSnapDisabled: false,
        step: "pickTarget"
      }
    } as unknown as Parameters<typeof runTransformMoveSnapToggleCommand>[0];

    expect(runTransformMoveSnapToggleCommand(ctx, plainKeyEvent("n"))).toBe(true);

    expect(ctx.transformState.moveSnapDisabled).toBe(true);
    expect(ctx.selectPlanSnap).toBeNull();
    expect(drawSnapOverlay.hide).toHaveBeenCalledOnce();
    expect(hideHoverCursor).toHaveBeenCalledOnce();
    expect(hudHoverLine.visible).toBe(false);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move: free movement in 1 mm steps. Snapping off. N = snapping on.");
  });

  it("toggles move snapping on with pick target status", () => {
    const setUnderlayStatus = vi.fn();
    const ctx = {
      setUnderlayStatus,
      transformState: {
        kind: "move",
        moveSnapDisabled: true,
        step: "pickTarget"
      }
    } as unknown as Parameters<typeof runTransformMoveSnapToggleCommand>[0];

    expect(runTransformMoveSnapToggleCommand(ctx, plainKeyEvent("N"))).toBe(true);

    expect(ctx.transformState.moveSnapDisabled).toBe(false);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move: snapping on. Zvol cielovy bod, alebo namier smer a napis vzdialenost. N = free movement.");
  });

  it("ignores move snap toggle outside plain active move transform", () => {
    const setUnderlayStatus = vi.fn();
    const ctx = {
      setUnderlayStatus,
      transformState: {
        kind: "rotate",
        moveSnapDisabled: false,
        step: "rotating"
      }
    } as unknown as Parameters<typeof runTransformMoveSnapToggleCommand>[0];

    expect(runTransformMoveSnapToggleCommand(ctx, plainKeyEvent("n"))).toBe(false);
    expect(runTransformMoveSnapToggleCommand(ctx, plainKeyEvent("n", { ctrlKey: true }))).toBe(false);

    expect(ctx.transformState.moveSnapDisabled).toBe(false);
    expect(setUnderlayStatus).not.toHaveBeenCalled();
  });

  it("starts move target picking from selected elements on Enter", () => {
    const startTransformFromSelection = vi.fn(() => true);
    const ctx = {
      startTransformFromSelection,
      transformState: {
        kind: "move",
        step: "selectElements"
      }
    } as unknown as Parameters<typeof runTransformMoveSelectElementsCommand>[0];

    expect(runTransformMoveSelectElementsCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("move");
  });

  it("ignores move select elements command outside Enter on selectElements", () => {
    const startTransformFromSelection = vi.fn(() => true);
    const ctx = {
      startTransformFromSelection,
      transformState: {
        kind: "move",
        step: "pickTarget"
      }
    } as unknown as Parameters<typeof runTransformMoveSelectElementsCommand>[0];

    expect(runTransformMoveSelectElementsCommand(ctx, plainKeyEvent("Enter"))).toBe(false);
    ctx.transformState.step = "selectElements";
    expect(runTransformMoveSelectElementsCommand(ctx, plainKeyEvent("Space"))).toBe(false);

    expect(startTransformFromSelection).not.toHaveBeenCalled();
  });

  it("appends move typed distance numbers and normalizes comma decimal separator", () => {
    const hud = typedHud();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      setUnderlayStatus,
      transformState: {
        kind: "move",
        lastPointerPx: { x: 11, y: 22 },
        step: "pickTarget",
        typed: "12"
      },
      wallTypedHud: hud
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent(","))).toBe(true);
    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("5"))).toBe(true);

    expect(ctx.transformState.typed).toBe("12.5");
    expect(hud.textContent).toBe("12.5 mm");
    expect(hud.style.display).toBe("block");
    expect(hud.style.left).toBe("11px");
    expect(hud.style.top).toBe("22px");
    expect(setUnderlayStatus).toHaveBeenLastCalledWith("Move: 12.5 mm (Enter)");
  });

  it("backs up move typed distance and restores empty typed status", () => {
    const hud = typedHud();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      setUnderlayStatus,
      transformState: {
        kind: "move",
        lastPointerPx: { x: 1, y: 2 },
        step: "pickTarget",
        typed: "5"
      },
      wallTypedHud: hud
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("Backspace"))).toBe(true);

    expect(ctx.transformState.typed).toBe("");
    expect(hud.style.display).toBe("none");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move: zvol cielovy bod, alebo namier smer a napis vzdialenost v mm.");
  });

  it("rejects non-positive move typed distance without mutating history", () => {
    const commitHistory = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyMoveDelta: vi.fn(),
      clearTransform: vi.fn(),
      commitHistory,
      mountProps: vi.fn(),
      S: {},
      setUnderlayStatus,
      transformState: {
        kind: "move",
        lastPointerPx: { x: 0, y: 0 },
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        step: "pickTarget",
        stickyMove: false,
        typed: "0"
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(ctx.transformState.typed).toBe("");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move: type a positive distance in mm.");
    expect(commitHistory).not.toHaveBeenCalled();
    expect(ctx.applyMoveDelta).not.toHaveBeenCalled();
    expect(ctx.clearTransform).not.toHaveBeenCalled();
  });

  it("requires move direction before applying typed distance", () => {
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyMoveDelta: vi.fn(),
      clearTransform: vi.fn(),
      commitHistory: vi.fn(),
      mountProps: vi.fn(),
      S: {},
      setUnderlayStatus,
      transformState: {
        kind: "move",
        lastPointerPx: { x: 0, y: 0 },
        lastValidDelta: new THREE.Vector3(0, 0, 0),
        step: "pickTarget",
        stickyMove: false,
        typed: "100"
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(ctx.transformState.typed).toBe("100");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Move: move mouse for direction, then type distance.");
    expect(ctx.applyMoveDelta).not.toHaveBeenCalled();
    expect(ctx.commitHistory).not.toHaveBeenCalled();
    expect(ctx.clearTransform).not.toHaveBeenCalled();
  });

  it("restores transform without history when typed move is blocked", () => {
    const applyMoveDelta = vi.fn();
    const clearTransform = vi.fn();
    const commitHistory = vi.fn();
    const mountProps = vi.fn();
    const ctx = {
      applyMoveDelta,
      clearTransform,
      commitHistory,
      mountProps,
      S: {},
      setUnderlayStatus: vi.fn(),
      transformState: {
        kind: "move",
        lastPointerPx: { x: 0, y: 0 },
        lastValidDelta: new THREE.Vector3(1, 0, 0),
        step: "pickTarget",
        stickyMove: true,
        typed: "100"
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(applyMoveDelta).toHaveBeenCalledExactlyOnceWith(new THREE.Vector3(0.1, 0, 0));
    expect(clearTransform).toHaveBeenCalledExactlyOnceWith({
      restore: true,
      continueMove: true,
      status: "Move: blocked. Select next element, or click Move again to exit."
    });
    expect(mountProps).toHaveBeenCalledOnce();
    expect(commitHistory).not.toHaveBeenCalled();
  });

  it("commits history and clears transform when typed move succeeds", () => {
    const clearTransform = vi.fn();
    const commitHistory = vi.fn();
    const mountProps = vi.fn();
    const state = {};
    const ctx = {
      applyMoveDelta: vi.fn((requestedDelta: THREE.Vector3) => {
        ctx.transformState.lastValidDelta = requestedDelta.clone();
      }),
      clearTransform,
      commitHistory,
      mountProps,
      S: state,
      setUnderlayStatus: vi.fn(),
      transformState: {
        kind: "move",
        lastPointerPx: { x: 0, y: 0 },
        lastValidDelta: new THREE.Vector3(0, 0, 1),
        step: "pickTarget",
        stickyMove: false,
        typed: "250"
      },
      wallTypedHud: typedHud()
    } as unknown as Parameters<typeof runTransformMoveTypedDistanceCommand>[0];

    expect(runTransformMoveTypedDistanceCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(ctx.applyMoveDelta).toHaveBeenCalledExactlyOnceWith(new THREE.Vector3(0, 0, 0.25));
    expect(commitHistory).toHaveBeenCalledExactlyOnceWith(state);
    expect(clearTransform).toHaveBeenCalledExactlyOnceWith({ continueMove: false, status: "Move: done." });
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("appends rotate typed digits up to six characters", () => {
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyRotateAngle: vi.fn(),
      setUnderlayStatus,
      transformState: {
        kind: "rotate",
        step: "rotating",
        typed: "12345"
      }
    } as unknown as Parameters<typeof runTransformRotateTypedAngleCommand>[0];

    expect(runTransformRotateTypedAngleCommand(ctx, plainKeyEvent("6"))).toBe(true);
    expect(runTransformRotateTypedAngleCommand(ctx, plainKeyEvent("7"))).toBe(true);

    expect(ctx.transformState.typed).toBe("123456");
    expect(setUnderlayStatus).toHaveBeenLastCalledWith("Rotate: 123456 deg (Enter)");
  });

  it("backs up rotate typed angle and restores empty typed status", () => {
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyRotateAngle: vi.fn(),
      setUnderlayStatus,
      transformState: {
        kind: "rotate",
        step: "rotating",
        typed: "5"
      }
    } as unknown as Parameters<typeof runTransformRotateTypedAngleCommand>[0];

    expect(runTransformRotateTypedAngleCommand(ctx, plainKeyEvent("Backspace"))).toBe(true);

    expect(ctx.transformState.typed).toBe("");
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Rotate: move mouse for direction, or type degrees + Enter.");
  });

  it("applies rotate typed angle using current angle sign and clears typed value", () => {
    const applyRotateAngle = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyRotateAngle,
      setUnderlayStatus,
      transformState: {
        kind: "rotate",
        lastAngleSign: -1,
        step: "rotating",
        typed: "90"
      }
    } as unknown as Parameters<typeof runTransformRotateTypedAngleCommand>[0];

    expect(runTransformRotateTypedAngleCommand(ctx, plainKeyEvent("Enter"))).toBe(true);

    expect(applyRotateAngle).toHaveBeenCalledExactlyOnceWith(-Math.PI / 2);
    expect(setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Rotate: CW 90 deg (click to finish)");
    expect(ctx.transformState.typed).toBe("");
  });

  it("ignores rotate typed angle keys outside rotating transform", () => {
    const applyRotateAngle = vi.fn();
    const setUnderlayStatus = vi.fn();
    const ctx = {
      applyRotateAngle,
      setUnderlayStatus,
      transformState: {
        kind: "move",
        step: "pickTarget",
        typed: ""
      }
    } as unknown as Parameters<typeof runTransformRotateTypedAngleCommand>[0];

    expect(runTransformRotateTypedAngleCommand(ctx, plainKeyEvent("1"))).toBe(false);

    expect(ctx.transformState.typed).toBe("");
    expect(applyRotateAngle).not.toHaveBeenCalled();
    expect(setUnderlayStatus).not.toHaveBeenCalled();
  });
});
