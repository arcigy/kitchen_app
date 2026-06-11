import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  handleColumnPlacementPreviewPointerMove,
  handleFloorplanPlacementClick,
  handleOpeningPlacementClick,
  handleOpeningPlacementPreviewPointerMove,
  handlePlacementCommitPointerDown,
  handlePlacementPreviewPointerMove,
  handleSelectOpeningPlacementPreviewPointerMove
} from "./pointerPlacementFlow";

describe("pointerPlacementFlow", () => {
  it("does not resolve hit point when placement commit flow is inactive", () => {
    const getHitPoint = vi.fn(() => new Vector3(1, 0, 2));

    expect(
      handlePlacementCommitPointerDown({
        button: 0,
        commitPlacement: vi.fn(),
        getHitPoint,
        helpers: {},
        isActive: false,
        preventDefault: vi.fn(),
        rebuildGhost: vi.fn(),
        state: {},
        stopPropagation: vi.fn()
      })
    ).toBe(false);

    expect(getHitPoint).not.toHaveBeenCalled();
  });

  it("consumes non-left click in active placement commit flow without mutation", () => {
    const rebuildGhost = vi.fn();
    const commitPlacement = vi.fn();

    expect(
      handlePlacementCommitPointerDown({
        button: 2,
        commitPlacement,
        getHitPoint: vi.fn(() => new Vector3(1, 0, 2)),
        helpers: {},
        isActive: true,
        preventDefault: vi.fn(),
        rebuildGhost,
        state: {},
        stopPropagation: vi.fn()
      })
    ).toBe(true);

    expect(rebuildGhost).not.toHaveBeenCalled();
    expect(commitPlacement).not.toHaveBeenCalled();
  });

  it("consumes active placement commit flow when ground hit is missing", () => {
    const rebuildGhost = vi.fn();
    const commitPlacement = vi.fn();

    expect(
      handlePlacementCommitPointerDown({
        button: 0,
        commitPlacement,
        getHitPoint: vi.fn(() => null),
        helpers: {},
        isActive: true,
        preventDefault: vi.fn(),
        rebuildGhost,
        state: {},
        stopPropagation: vi.fn()
      })
    ).toBe(true);

    expect(rebuildGhost).not.toHaveBeenCalled();
    expect(commitPlacement).not.toHaveBeenCalled();
  });

  it("rebuilds ghost, commits placement, and stops event for valid placement click", () => {
    const state = { id: "state" };
    const helpers = { id: "helpers" };
    const hitPoint = new Vector3(1, 0, 2);
    const rebuildGhost = vi.fn();
    const commitPlacement = vi.fn(() => true);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    expect(
      handlePlacementCommitPointerDown({
        button: 0,
        commitPlacement,
        getHitPoint: vi.fn(() => hitPoint),
        helpers,
        isActive: true,
        preventDefault,
        rebuildGhost,
        state,
        stopPropagation
      })
    ).toBe(true);

    expect(rebuildGhost).toHaveBeenCalledExactlyOnceWith(state, helpers, hitPoint);
    expect(commitPlacement).toHaveBeenCalledExactlyOnceWith(state, helpers);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it("keeps current placement preview move behavior", () => {
    const state = { id: "state" };
    const helpers = { id: "helpers" };
    const hitPoint = new Vector3(3, 0, 4);
    const rebuildGhost = vi.fn();

    expect(
      handlePlacementPreviewPointerMove({
        helpers,
        hitPoint,
        isActive: true,
        rebuildGhost,
        state
      })
    ).toBe(true);

    expect(rebuildGhost).toHaveBeenCalledExactlyOnceWith(state, helpers, hitPoint);

    expect(
      handlePlacementPreviewPointerMove({
        helpers,
        hitPoint: null,
        isActive: true,
        rebuildGhost,
        state
      })
    ).toBe(true);

    expect(rebuildGhost).toHaveBeenCalledOnce();
  });

  it("keeps current column placement click behavior", () => {
    const cancelPendingMarquee = vi.fn();
    const insertColumnAtPoint = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const pickWallId = vi.fn(() => "wall-1");

    expect(
      handleFloorplanPlacementClick({
        cancelPendingMarquee,
        insertColumnAtPoint,
        insertDoorAtWallPoint: vi.fn(),
        insertWindowAtWallPoint: vi.fn(),
        isColumnPlacementActive: true,
        isDoorPlacementActive: true,
        isWindowPlacementActive: true,
        pickWallId,
        preventDefault,
        setStatus: vi.fn(),
        stopPropagation
      })
    ).toBe(true);

    expect(cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(insertColumnAtPoint).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(pickWallId).not.toHaveBeenCalled();
  });

  it("keeps current window and door placement click routing", () => {
    const setStatus = vi.fn();
    const insertWindowAtWallPoint = vi.fn();
    const insertDoorAtWallPoint = vi.fn();

    expect(
      handleFloorplanPlacementClick({
        cancelPendingMarquee: vi.fn(),
        insertColumnAtPoint: vi.fn(),
        insertDoorAtWallPoint,
        insertWindowAtWallPoint,
        isColumnPlacementActive: false,
        isDoorPlacementActive: true,
        isWindowPlacementActive: true,
        pickWallId: vi.fn(() => "wall-1"),
        preventDefault: vi.fn(),
        setStatus,
        stopPropagation: vi.fn()
      })
    ).toBe(true);

    expect(insertWindowAtWallPoint).toHaveBeenCalledExactlyOnceWith("wall-1");
    expect(insertDoorAtWallPoint).not.toHaveBeenCalled();

    expect(
      handleFloorplanPlacementClick({
        cancelPendingMarquee: vi.fn(),
        insertColumnAtPoint: vi.fn(),
        insertDoorAtWallPoint,
        insertWindowAtWallPoint,
        isColumnPlacementActive: false,
        isDoorPlacementActive: true,
        isWindowPlacementActive: false,
        pickWallId: vi.fn(() => null),
        preventDefault: vi.fn(),
        setStatus,
        stopPropagation: vi.fn()
      })
    ).toBe(true);

    expect(setStatus).toHaveBeenCalledExactlyOnceWith("Door: klikni priamo na stenu.");
    expect(insertDoorAtWallPoint).not.toHaveBeenCalled();
  });

  it("handles opening placement click through wall pick and missing wall status", () => {
    const insertAtWallPoint = vi.fn();
    const setStatus = vi.fn();

    expect(
      handleOpeningPlacementClick({
        insertAtWallPoint,
        missingWallStatus: "Opening: klikni priamo na stenu.",
        pickWallId: vi.fn(() => "wall-1"),
        setStatus
      })
    ).toBe(true);

    expect(insertAtWallPoint).toHaveBeenCalledExactlyOnceWith("wall-1");
    expect(setStatus).not.toHaveBeenCalled();

    expect(
      handleOpeningPlacementClick({
        insertAtWallPoint,
        missingWallStatus: "Opening: klikni priamo na stenu.",
        pickWallId: vi.fn(() => null),
        setStatus
      })
    ).toBe(true);

    expect(insertAtWallPoint).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenCalledExactlyOnceWith("Opening: klikni priamo na stenu.");
  });

  it("keeps current opening placement preview behavior", () => {
    const hitPoint = new Vector3(1, 0, 2);
    const pointMm = { x: 1000, z: 2000 };
    const clearPreview = vi.fn();
    const updatePreview = vi.fn();

    expect(
      handleOpeningPlacementPreviewPointerMove({
        clearPreview,
        hitPoint,
        isActive: true,
        pickWallId: vi.fn(() => "wall-1"),
        pointFromHit: vi.fn(() => pointMm),
        updatePreview
      })
    ).toBe(true);

    expect(updatePreview).toHaveBeenCalledExactlyOnceWith("wall-1", pointMm);
    expect(clearPreview).not.toHaveBeenCalled();

    expect(
      handleOpeningPlacementPreviewPointerMove({
        clearPreview,
        hitPoint: null,
        isActive: true,
        pickWallId: vi.fn(() => "wall-1"),
        pointFromHit: vi.fn(() => pointMm),
        updatePreview
      })
    ).toBe(true);

    expect(clearPreview).toHaveBeenCalledOnce();
  });

  it("routes select opening placement preview to window before door", () => {
    const hitPoint = new Vector3(1, 0, 2);
    const pointMm = { x: 1000, z: 2000 };
    const updateWindowPreview = vi.fn();
    const updateDoorPreview = vi.fn();
    const clearWindowPreview = vi.fn();
    const clearDoorPreview = vi.fn();

    expect(
      handleSelectOpeningPlacementPreviewPointerMove({
        clearDoorPreview,
        clearWindowPreview,
        hitPoint,
        isDoorActive: true,
        isWindowActive: true,
        pickWallId: vi.fn(() => "wall-1"),
        pointFromHit: vi.fn(() => pointMm),
        updateDoorPreview,
        updateWindowPreview
      })
    ).toBe(true);

    expect(updateWindowPreview).toHaveBeenCalledExactlyOnceWith("wall-1", pointMm);
    expect(updateDoorPreview).not.toHaveBeenCalled();
    expect(clearWindowPreview).not.toHaveBeenCalled();
    expect(clearDoorPreview).not.toHaveBeenCalled();
  });

  it("routes select opening placement preview to door when window placement is inactive", () => {
    const pointMm = { x: 1000, z: 2000 };
    const updateDoorPreview = vi.fn();
    const clearDoorPreview = vi.fn();

    expect(
      handleSelectOpeningPlacementPreviewPointerMove({
        clearDoorPreview,
        clearWindowPreview: vi.fn(),
        hitPoint: new Vector3(1, 0, 2),
        isDoorActive: true,
        isWindowActive: false,
        pickWallId: vi.fn(() => null),
        pointFromHit: vi.fn(() => pointMm),
        updateDoorPreview,
        updateWindowPreview: vi.fn()
      })
    ).toBe(true);

    expect(updateDoorPreview).toHaveBeenCalledExactlyOnceWith(null, pointMm);

    expect(
      handleSelectOpeningPlacementPreviewPointerMove({
        clearDoorPreview,
        clearWindowPreview: vi.fn(),
        hitPoint: null,
        isDoorActive: true,
        isWindowActive: false,
        pickWallId: vi.fn(),
        pointFromHit: vi.fn(() => pointMm),
        updateDoorPreview,
        updateWindowPreview: vi.fn()
      })
    ).toBe(true);

    expect(clearDoorPreview).toHaveBeenCalledOnce();
  });

  it("does not handle select opening placement preview when both opening placements are inactive", () => {
    expect(
      handleSelectOpeningPlacementPreviewPointerMove({
        clearDoorPreview: vi.fn(),
        clearWindowPreview: vi.fn(),
        hitPoint: new Vector3(1, 0, 2),
        isDoorActive: false,
        isWindowActive: false,
        pickWallId: vi.fn(),
        pointFromHit: vi.fn(),
        updateDoorPreview: vi.fn(),
        updateWindowPreview: vi.fn()
      })
    ).toBe(false);
  });

  it("keeps current column placement preview behavior", () => {
    const hitPoint = new Vector3(1, 0, 2);
    const placementPoint = new Vector3(3, 0, 4);
    const pointMm = { x: 3000, z: 4000 };
    const updatePreview = vi.fn();
    const clearPlanSnap = vi.fn();
    const hideHoverCursor = vi.fn();

    expect(
      handleColumnPlacementPreviewPointerMove({
        clearPlanSnap,
        hideHoverCursor,
        hitPoint,
        isActive: true,
        pointFromPlacementPoint: vi.fn(() => pointMm),
        resolvePlacementPoint: vi.fn(() => placementPoint),
        updatePreview
      })
    ).toBe(true);

    expect(updatePreview).toHaveBeenCalledExactlyOnceWith(pointMm);
    expect(clearPlanSnap).not.toHaveBeenCalled();
    expect(hideHoverCursor).not.toHaveBeenCalled();

    expect(
      handleColumnPlacementPreviewPointerMove({
        clearPlanSnap,
        hideHoverCursor,
        hitPoint: null,
        isActive: true,
        pointFromPlacementPoint: vi.fn(() => pointMm),
        resolvePlacementPoint: vi.fn(() => placementPoint),
        updatePreview
      })
    ).toBe(true);

    expect(updatePreview).toHaveBeenCalledWith(null);
    expect(clearPlanSnap).toHaveBeenCalledOnce();
    expect(hideHoverCursor).toHaveBeenCalledOnce();
  });
});
