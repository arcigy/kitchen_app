import { describe, expect, it, vi } from "vitest";
import {
  executeFallbackPickSelection,
  executeFloorplanSelectionActions,
  handleEmptyFallbackPickSelection,
  handleFloorplanSelection,
  resolveFloorplanModulePickCandidates,
  resolveFloorplanSelectionActions
} from "./pointerFloorplanSelection";

const baseArgs = {
  pickedDoor: false,
  pickedWindow: false,
  sectionId: null,
  columnId: null,
  selectableModuleId: null,
  fallbackModuleId: null,
  fallbackModulePickable: false,
  worktopId: null,
  floorId: null,
  polygonWallId: null,
  axisWallId: null,
  transformSelectElements: false
};

describe("resolveFloorplanSelectionActions", () => {
  it("resolves direct module picks through the current kitchen mode filter", () => {
    const filterSelectableModuleId = vi.fn((id: string | null) => (id === "module-child" ? "module-parent" : id));

    expect(
      resolveFloorplanModulePickCandidates({
        directModuleId: "module-child",
        fallbackModuleId: null,
        filterSelectableModuleId,
        isFallbackModulePickable: vi.fn(() => false)
      })
    ).toEqual({
      selectableModuleId: "module-parent",
      fallbackModuleId: null,
      fallbackModulePickable: false
    });

    expect(filterSelectableModuleId).toHaveBeenCalledExactlyOnceWith("module-child");
  });

  it("keeps fallback module pickability separate from direct module filtering", () => {
    const isFallbackModulePickable = vi.fn((id: string) => id === "module-fallback");

    expect(
      resolveFloorplanModulePickCandidates({
        directModuleId: null,
        fallbackModuleId: "module-fallback",
        filterSelectableModuleId: vi.fn(() => "unused"),
        isFallbackModulePickable
      })
    ).toEqual({
      selectableModuleId: null,
      fallbackModuleId: "module-fallback",
      fallbackModulePickable: true
    });

    expect(isFallbackModulePickable).toHaveBeenCalledExactlyOnceWith("module-fallback");
  });

  it("preserves the current top-level floorplan selection priority", () => {
    expect(
      resolveFloorplanSelectionActions({
        ...baseArgs,
        pickedWindow: true,
        pickedDoor: true,
        sectionId: "section-1",
        columnId: "column-1",
        selectableModuleId: "module-1",
        fallbackModuleId: "module-fallback",
        fallbackModulePickable: true,
        worktopId: "worktop-1",
        floorId: "floor-1",
        polygonWallId: "wall-poly",
        axisWallId: "wall-axis"
      }).map((action) => action.kind)
    ).toEqual(["window", "door", "section", "column", "module-select", "module-select", "worktop-select", "floor", "wall", "wall"]);
  });

  it("adds transform selection before module selection when move tool is selecting elements", () => {
    expect(
      resolveFloorplanSelectionActions({
        ...baseArgs,
        selectableModuleId: "module-1",
        transformSelectElements: true
      })
    ).toEqual([
      { kind: "module-transform", id: "module-1" },
      { kind: "module-select", id: "module-1" }
    ]);
  });

  it("keeps fallback module actions after direct module actions and before worktops", () => {
    expect(
      resolveFloorplanSelectionActions({
        ...baseArgs,
        selectableModuleId: "module-direct",
        fallbackModuleId: "module-fallback",
        fallbackModulePickable: true,
        worktopId: "worktop-1",
        transformSelectElements: true
      })
    ).toEqual([
      { kind: "module-transform", id: "module-direct" },
      { kind: "module-select", id: "module-direct" },
      { kind: "module-transform", id: "module-fallback" },
      { kind: "module-select", id: "module-fallback" },
      { kind: "worktop-select", id: "worktop-1" }
    ]);
  });

  it("ignores unpickable fallback modules", () => {
    expect(
      resolveFloorplanSelectionActions({
        ...baseArgs,
        fallbackModuleId: "module-fallback",
        fallbackModulePickable: false
      })
    ).toEqual([]);
  });

  it("keeps polygon wall before axis wall", () => {
    expect(
      resolveFloorplanSelectionActions({
        ...baseArgs,
        polygonWallId: "wall-poly",
        axisWallId: "wall-axis"
      })
    ).toEqual([
      { kind: "wall", id: "wall-poly" },
      { kind: "wall", id: "wall-axis" }
    ]);
  });

  function executionArgs(overrides: Partial<Parameters<typeof executeFloorplanSelectionActions<string, string, string>>[0]> = {}) {
    return {
      actions: [],
      beginModuleSelection: vi.fn(() => false),
      beginWorktopSelection: vi.fn(() => false),
      cancelPendingMarquee: vi.fn(),
      continueMoveAfterSelection: vi.fn(() => false),
      hitPoint: "hit-point",
      pickedDoor: "door-pick",
      pickedWindow: "window-pick",
      selectColumn: vi.fn(),
      selectDoor: vi.fn(),
      selectFloor: vi.fn(),
      selectModule: vi.fn(),
      selectSection: vi.fn(),
      selectWall: vi.fn(),
      selectWindow: vi.fn(),
      ...overrides
    };
  }

  it("executes window and door actions with the current selection and continue-move behavior", () => {
    const windowArgs = executionArgs({
      actions: [{ kind: "window" }],
      continueMoveAfterSelection: vi.fn(() => true)
    });

    expect(executeFloorplanSelectionActions(windowArgs)).toBe(true);

    expect(windowArgs.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(windowArgs.selectWindow).toHaveBeenCalledExactlyOnceWith("window-pick");
    expect(windowArgs.continueMoveAfterSelection).toHaveBeenCalledExactlyOnceWith("hit-point");

    const doorArgs = executionArgs({
      actions: [{ kind: "window" }, { kind: "door" }],
      pickedWindow: null
    });

    expect(executeFloorplanSelectionActions(doorArgs)).toBe(true);

    expect(doorArgs.selectWindow).not.toHaveBeenCalled();
    expect(doorArgs.selectDoor).toHaveBeenCalledExactlyOnceWith("door-pick");
  });

  it("handles floorplan selection by resolving actions before executing them", () => {
    const execution = executionArgs({
      beginModuleSelection: vi.fn(() => true),
      pickedDoor: null,
      pickedWindow: null
    });

    expect(
      handleFloorplanSelection({
        execution,
        selection: {
          ...baseArgs,
          selectableModuleId: "module-1"
        }
      })
    ).toBe(true);

    expect(execution.beginModuleSelection).toHaveBeenCalledExactlyOnceWith("module-1");
    expect(execution.selectModule).not.toHaveBeenCalled();
  });

  it("executes section and column actions before later actions", () => {
    const args = executionArgs({
      actions: [{ kind: "section", id: "section-1" }, { kind: "column", id: "column-1" }]
    });

    expect(executeFloorplanSelectionActions(args)).toBe(true);

    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.selectSection).toHaveBeenCalledExactlyOnceWith("section-1");
    expect(args.selectColumn).not.toHaveBeenCalled();
  });

  it("keeps module-transform fallback to module-select when continue move does not handle", () => {
    const args = executionArgs({
      actions: [{ kind: "module-transform", id: "module-1" }, { kind: "module-select", id: "module-1" }],
      beginModuleSelection: vi.fn(() => true)
    });

    expect(executeFloorplanSelectionActions(args)).toBe(true);

    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.selectModule).toHaveBeenCalledExactlyOnceWith("module-1");
    expect(args.continueMoveAfterSelection).toHaveBeenCalledExactlyOnceWith("hit-point");
    expect(args.beginModuleSelection).toHaveBeenCalledExactlyOnceWith("module-1");
  });

  it("keeps module and worktop selection fallthrough when handlers decline", () => {
    const args = executionArgs({
      actions: [{ kind: "module-select", id: "module-1" }, { kind: "worktop-select", id: "worktop-1" }, { kind: "floor", id: "floor-1" }]
    });

    expect(executeFloorplanSelectionActions(args)).toBe(true);

    expect(args.beginModuleSelection).toHaveBeenCalledExactlyOnceWith("module-1");
    expect(args.beginWorktopSelection).toHaveBeenCalledExactlyOnceWith("worktop-1");
    expect(args.selectFloor).toHaveBeenCalledExactlyOnceWith("floor-1");
  });

  it("executes wall action with current continue-move behavior", () => {
    const args = executionArgs({
      actions: [{ kind: "wall", id: "wall-1" }]
    });

    expect(executeFloorplanSelectionActions(args)).toBe(true);

    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.selectWall).toHaveBeenCalledExactlyOnceWith("wall-1");
    expect(args.continueMoveAfterSelection).toHaveBeenCalledExactlyOnceWith("hit-point");
  });

  it("returns false when no action handles selection", () => {
    expect(
      executeFloorplanSelectionActions(
        executionArgs({
          actions: [{ kind: "module-select", id: "module-1" }]
        })
      )
    ).toBe(false);
  });

  function fallbackArgs(overrides: Partial<Parameters<typeof executeFallbackPickSelection>[0]> = {}) {
    return {
      activeViewerTab: "floorplan",
      beginModuleSelection: vi.fn(() => false),
      beginWorktopSelection: vi.fn(() => false),
      cancelPendingMarquee: vi.fn(),
      clearNonFloorplanFloorSelection: vi.fn(),
      clearWindowLightIfMissing: vi.fn(),
      columnId: null,
      continueMoveAfterSelection: vi.fn(() => false),
      filterSelectableId: vi.fn((id: string) => id),
      firstHitPoint: "hit-point",
      floorId: null,
      id: null,
      kind: "module",
      setDoorInstNull: vi.fn(),
      selectColumn: vi.fn(),
      selectFloor: vi.fn(),
      selectModule: vi.fn(),
      selectWall: vi.fn(),
      transformSelectElements: false,
      viewMode: "2d",
      wallId: null,
      worktopId: null,
      ...overrides
    };
  }

  it("keeps current fallback worktop handling before no-id fallthrough", () => {
    const handled = fallbackArgs({
      beginWorktopSelection: vi.fn(() => true),
      worktopId: "worktop-1"
    });

    expect(executeFallbackPickSelection(handled)).toBe(true);
    expect(handled.beginWorktopSelection).toHaveBeenCalledExactlyOnceWith("worktop-1");

    const declined = fallbackArgs({
      beginWorktopSelection: vi.fn(() => false),
      worktopId: "worktop-1"
    });

    expect(executeFallbackPickSelection(declined)).toBe(false);
  });

  it("keeps current fallback column selection behavior", () => {
    const args = fallbackArgs({ columnId: "column-1", kind: "column" });

    expect(executeFallbackPickSelection(args)).toBe(true);

    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.selectColumn).toHaveBeenCalledExactlyOnceWith("column-1");

    const missing = fallbackArgs({ kind: "column" });
    expect(executeFallbackPickSelection(missing)).toBe(true);
    expect(missing.selectColumn).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("keeps current fallback floor selection and non-floorplan clearing behavior", () => {
    const nonFloorplan = fallbackArgs({
      activeViewerTab: "elevation",
      floorId: "floor-1",
      kind: "floor",
      viewMode: "2d"
    });

    expect(executeFallbackPickSelection(nonFloorplan)).toBe(true);
    expect(nonFloorplan.clearNonFloorplanFloorSelection).toHaveBeenCalledOnce();

    const floor = fallbackArgs({ floorId: "floor-1", kind: "floor" });
    expect(executeFallbackPickSelection(floor)).toBe(true);
    expect(floor.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(floor.selectFloor).toHaveBeenCalledExactlyOnceWith("floor-1");
  });

  it("keeps current fallback wall selection and continue-move behavior", () => {
    const args = fallbackArgs({
      continueMoveAfterSelection: vi.fn(() => true),
      kind: "wall",
      wallId: "wall-1"
    });

    expect(executeFallbackPickSelection(args)).toBe(true);

    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.selectWall).toHaveBeenCalledExactlyOnceWith("wall-1");
    expect(args.continueMoveAfterSelection).toHaveBeenCalledExactlyOnceWith("hit-point");
  });

  it("keeps current fallback module transform and module selection behavior", () => {
    const args = fallbackArgs({
      beginModuleSelection: vi.fn(() => true),
      continueMoveAfterSelection: vi.fn(() => false),
      id: "module-1",
      transformSelectElements: true
    });

    expect(executeFallbackPickSelection(args)).toBe(true);

    expect(args.selectModule).toHaveBeenCalledExactlyOnceWith("module-1");
    expect(args.continueMoveAfterSelection).toHaveBeenCalledExactlyOnceWith("hit-point");
    expect(args.beginModuleSelection).toHaveBeenCalledExactlyOnceWith("module-1");
  });

  it("keeps current fallback filtered-module cleanup behavior", () => {
    const args = fallbackArgs({
      filterSelectableId: vi.fn(() => null),
      id: "module-1"
    });

    expect(executeFallbackPickSelection(args)).toBe(true);

    expect(args.selectModule).toHaveBeenCalledExactlyOnceWith(null);
    expect(args.setDoorInstNull).toHaveBeenCalledOnce();
    expect(args.clearWindowLightIfMissing).toHaveBeenCalledOnce();
  });

  function emptyFallbackArgs(overrides: Partial<Parameters<typeof handleEmptyFallbackPickSelection<{ x: number }>>[0]> = {}) {
    return {
      clearWindowLightIfMissing: vi.fn(),
      continueMoveWithCurrentSelection: vi.fn(() => false),
      cloneMovePoint: vi.fn((point: { x: number }) => ({ ...point })),
      getCurrentMoveHitPoint: vi.fn(() => null),
      hasPendingMarqueeForPointer: false,
      setDoorInstNull: vi.fn(),
      selectFloor: vi.fn(),
      selectModule: vi.fn(),
      selectWall: vi.fn(),
      ...overrides
    };
  }

  it("keeps current empty fallback pending marquee behavior", () => {
    const args = emptyFallbackArgs({ hasPendingMarqueeForPointer: true });

    expect(handleEmptyFallbackPickSelection(args)).toBe(true);

    expect(args.getCurrentMoveHitPoint).not.toHaveBeenCalled();
    expect(args.selectFloor).not.toHaveBeenCalled();
    expect(args.selectWall).not.toHaveBeenCalled();
    expect(args.selectModule).not.toHaveBeenCalled();
    expect(args.setDoorInstNull).not.toHaveBeenCalled();
    expect(args.clearWindowLightIfMissing).not.toHaveBeenCalled();
  });

  it("keeps current empty fallback continue-move behavior with cloned hit point", () => {
    const hitPoint = { x: 1 };
    const clonedPoint = { x: 2 };
    const args = emptyFallbackArgs({
      continueMoveWithCurrentSelection: vi.fn(() => true),
      cloneMovePoint: vi.fn(() => clonedPoint),
      getCurrentMoveHitPoint: vi.fn(() => hitPoint)
    });

    expect(handleEmptyFallbackPickSelection(args)).toBe(true);

    expect(args.cloneMovePoint).toHaveBeenCalledExactlyOnceWith(hitPoint);
    expect(args.continueMoveWithCurrentSelection).toHaveBeenCalledExactlyOnceWith(clonedPoint);
    expect(args.selectFloor).not.toHaveBeenCalled();
    expect(args.selectWall).not.toHaveBeenCalled();
    expect(args.selectModule).not.toHaveBeenCalled();
  });

  it("keeps current empty fallback clear selection behavior", () => {
    const args = emptyFallbackArgs({
      continueMoveWithCurrentSelection: vi.fn(() => false),
      getCurrentMoveHitPoint: vi.fn(() => ({ x: 1 }))
    });

    expect(handleEmptyFallbackPickSelection(args)).toBe(true);

    expect(args.selectFloor).toHaveBeenCalledExactlyOnceWith(null);
    expect(args.selectWall).toHaveBeenCalledExactlyOnceWith(null);
    expect(args.selectModule).toHaveBeenCalledExactlyOnceWith(null);
    expect(args.setDoorInstNull).toHaveBeenCalledOnce();
    expect(args.clearWindowLightIfMissing).toHaveBeenCalledOnce();
  });
});
