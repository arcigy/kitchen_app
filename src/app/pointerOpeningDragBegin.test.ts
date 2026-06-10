import { describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  beginDoorDragFromPick,
  beginWindowDragFromPick,
  handleOpeningDragPointerMove,
  resolveOpeningCustomWallDragCenter,
  resolveOpeningCustomWallDragOffset,
  resolveOpeningLegacyWallDragCenter,
  resolveOpeningLegacyWallDragOffset,
  updateDoorDragFromPointerMove,
  updateWindowDragFromPointerMove
} from "./pointerOpeningDragBegin";

const wall = {
  id: "wall-1",
  params: {
    aMm: { x: 0, z: 0 },
    bMm: { x: 4000, z: 0 }
  }
};

function opening(overrides: Partial<{ centerMm: number; wall: string; wallId: string | null }> = {}) {
  return {
    id: "opening-1",
    params: {
      centerMm: 1500,
      wall: "back",
      wallId: null,
      ...overrides
    }
  };
}

describe("pointerOpeningDragBegin", () => {
  it("calculates custom wall opening drag offset with current axis projection behavior", () => {
    expect(
      resolveOpeningCustomWallDragOffset({
        centerMm: 1500,
        groundHitPoint: new Vector3(1, 0, 0),
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        wall
      })
    ).toBe(500);

    expect(
      resolveOpeningCustomWallDragOffset({
        centerMm: 1500,
        groundHitPoint: null,
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(),
        wall
      })
    ).toBeNull();
  });

  it("calculates legacy wall opening drag offset using wall hit before ground hit", () => {
    expect(
      resolveOpeningLegacyWallDragOffset({
        centerMm: 1500,
        groundHitPoint: new Vector3(9, 0, 3),
        wallAxis: "x",
        wallHitPoint: new Vector3(1, 0, 2)
      })
    ).toBe(500);

    expect(
      resolveOpeningLegacyWallDragOffset({
        centerMm: 1500,
        groundHitPoint: new Vector3(9, 0, 3),
        wallAxis: "z",
        wallHitPoint: null
      })
    ).toBe(-1500);
  });

  it("calculates current drag centers for custom and legacy walls", () => {
    expect(
      resolveOpeningCustomWallDragCenter({
        groundHitPoint: new Vector3(1, 0, 0),
        offsetMm: 500,
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        wall
      })
    ).toBe(1500);

    expect(
      resolveOpeningLegacyWallDragCenter({
        groundHitPoint: new Vector3(9, 0, 3),
        offsetMm: 500,
        wallAxis: "x",
        wallHitPoint: new Vector3(1, 0, 2)
      })
    ).toBe(1500);
  });

  it("starts current custom wall window drag flow", () => {
    const state = { active: false, offsetMm: 0, wall: null as string | null };
    const setPointerCapture = vi.fn();

    expect(
      beginWindowDragFromPick({
        cancelPendingMarquee: vi.fn(),
        continueMoveAfterSelection: vi.fn(() => false),
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        getLegacyWallHitPoint: vi.fn(() => null),
        getLegacyWallMeta: vi.fn(() => null),
        opening: opening({ wallId: "wall-1" }),
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        selectOpening: vi.fn(),
        setPointerCapture,
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        windowDragState: state
      })
    ).toBe(true);

    expect(state).toEqual({ active: true, offsetMm: 500, wall: "wall-1" });
    expect(setPointerCapture).toHaveBeenCalledOnce();
  });

  it("starts current legacy wall window drag flow", () => {
    const state = { active: false, offsetMm: 0, wall: null as string | null };

    expect(
      beginWindowDragFromPick({
        cancelPendingMarquee: vi.fn(),
        continueMoveAfterSelection: vi.fn(() => false),
        findCustomWall: vi.fn(() => null),
        getGroundHitPoint: vi.fn(() => new Vector3(9, 0, 3)),
        getLegacyWallHitPoint: vi.fn(() => new Vector3(1, 0, 2)),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        opening: opening({ wall: "back", wallId: null }),
        pointOnWallAxisMm: vi.fn(),
        selectOpening: vi.fn(),
        setPointerCapture: vi.fn(),
        toMmPoint: vi.fn(),
        windowDragState: state
      })
    ).toBe(true);

    expect(state).toEqual({ active: true, offsetMm: 500, wall: "back" });
  });

  it("keeps current selection-before-missing-hit behavior", () => {
    const state = { active: false, offsetMm: 0, wall: null as string | null };
    const selectOpening = vi.fn();
    const setPointerCapture = vi.fn();

    expect(
      beginWindowDragFromPick({
        cancelPendingMarquee: vi.fn(),
        continueMoveAfterSelection: vi.fn(() => false),
        findCustomWall: vi.fn(() => null),
        getGroundHitPoint: vi.fn(() => null),
        getLegacyWallHitPoint: vi.fn(() => null),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        opening: opening(),
        pointOnWallAxisMm: vi.fn(),
        selectOpening,
        setPointerCapture,
        toMmPoint: vi.fn(),
        windowDragState: state
      })
    ).toBe(true);

    expect(selectOpening).toHaveBeenCalledOnce();
    expect(state).toEqual({ active: true, offsetMm: 0, wall: "back" });
    expect(setPointerCapture).not.toHaveBeenCalled();
  });

  it("keeps current door drag behavior for custom and legacy wall ids", () => {
    const customState = { active: false, offsetMm: 0, wall: null as string | null };
    const customCapture = vi.fn();

    expect(
      beginDoorDragFromPick({
        cancelPendingMarquee: vi.fn(),
        continueMoveAfterSelection: vi.fn(() => false),
        doorDragState: customState,
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        opening: opening({ wallId: "wall-1" }),
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        selectOpening: vi.fn(),
        setPointerCapture: customCapture,
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 }))
      })
    ).toBe(true);

    expect(customState).toEqual({ active: true, offsetMm: 500, wall: "wall-1" });
    expect(customCapture).toHaveBeenCalledOnce();

    const legacyState = { active: false, offsetMm: 0, wall: null as string | null };
    expect(
      beginDoorDragFromPick({
        cancelPendingMarquee: vi.fn(),
        continueMoveAfterSelection: vi.fn(() => false),
        doorDragState: legacyState,
        findCustomWall: vi.fn(() => null),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        opening: opening({ wallId: null }),
        pointOnWallAxisMm: vi.fn(),
        selectOpening: vi.fn(),
        setPointerCapture: vi.fn(),
        toMmPoint: vi.fn()
      })
    ).toBe(true);

    expect(legacyState).toEqual({ active: true, offsetMm: 0, wall: null });
  });

  it("updates current custom wall window drag center", () => {
    const item = opening({ centerMm: 0, wallId: "wall-1" });
    const updateOpeningTransform = vi.fn();
    const mountProps = vi.fn();

    expect(
      updateWindowDragFromPointerMove({
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        getLegacyWallHitPoint: vi.fn(() => null),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        mountProps,
        opening: item,
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        updateOpeningTransform,
        windowDragState: { active: true, offsetMm: 500, wall: "wall-1" }
      })
    ).toBe(true);

    expect(item.params.centerMm).toBe(1500);
    expect(updateOpeningTransform).toHaveBeenCalledExactlyOnceWith(item);
    expect(mountProps).toHaveBeenCalledOnce();
  });

  it("updates current legacy wall window drag center using wall hit before ground hit", () => {
    const item = opening({ centerMm: 0, wall: "back", wallId: null });
    const updateOpeningTransform = vi.fn();

    expect(
      updateWindowDragFromPointerMove({
        findCustomWall: vi.fn(() => null),
        getGroundHitPoint: vi.fn(() => new Vector3(9, 0, 3)),
        getLegacyWallHitPoint: vi.fn(() => new Vector3(1, 0, 2)),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        mountProps: vi.fn(),
        opening: item,
        pointOnWallAxisMm: vi.fn(),
        toMmPoint: vi.fn(),
        updateOpeningTransform,
        windowDragState: { active: true, offsetMm: 500, wall: "back" }
      })
    ).toBe(true);

    expect(item.params.centerMm).toBe(1500);
    expect(updateOpeningTransform).toHaveBeenCalledExactlyOnceWith(item);
  });

  it("updates current custom wall door drag center", () => {
    const item = opening({ centerMm: 0, wallId: "wall-1" });
    const updateOpeningTransform = vi.fn();

    expect(
      updateDoorDragFromPointerMove({
        doorDragState: { active: true, offsetMm: 500, wall: "wall-1" },
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        mountProps: vi.fn(),
        opening: item,
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        updateOpeningTransform
      })
    ).toBe(true);

    expect(item.params.centerMm).toBe(1500);
    expect(updateOpeningTransform).toHaveBeenCalledExactlyOnceWith(item);
  });

  it("keeps current missing-hit update behavior without transform refresh", () => {
    const item = opening({ centerMm: 10, wallId: "wall-1" });
    const updateOpeningTransform = vi.fn();

    expect(
      updateDoorDragFromPointerMove({
        doorDragState: { active: true, offsetMm: 500, wall: "wall-1" },
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => null),
        mountProps: vi.fn(),
        opening: item,
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(),
        updateOpeningTransform
      })
    ).toBe(true);

    expect(item.params.centerMm).toBe(10);
    expect(updateOpeningTransform).not.toHaveBeenCalled();
  });

  it("routes active opening drag pointermove to window before door", () => {
    const windowItem = opening({ centerMm: 0, wallId: "wall-1" });
    const doorItem = opening({ centerMm: 0, wallId: "wall-1" });
    const updateWindowTransform = vi.fn();
    const updateDoorTransform = vi.fn();

    expect(
      handleOpeningDragPointerMove({
        doorDragState: { active: true, offsetMm: 900, wall: "wall-1" },
        doorOpening: doorItem,
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        getLegacyWallHitPoint: vi.fn(() => null),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        mountProps: vi.fn(),
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        updateDoorTransform,
        updateWindowTransform,
        windowDragState: { active: true, offsetMm: 500, wall: "wall-1" },
        windowOpening: windowItem
      })
    ).toBe(true);

    expect(windowItem.params.centerMm).toBe(1500);
    expect(doorItem.params.centerMm).toBe(0);
    expect(updateWindowTransform).toHaveBeenCalledExactlyOnceWith(windowItem);
    expect(updateDoorTransform).not.toHaveBeenCalled();
  });

  it("routes active opening drag pointermove to door when window drag is not active", () => {
    const doorItem = opening({ centerMm: 0, wallId: "wall-1" });
    const updateDoorTransform = vi.fn();

    expect(
      handleOpeningDragPointerMove({
        doorDragState: { active: true, offsetMm: 500, wall: "wall-1" },
        doorOpening: doorItem,
        findCustomWall: vi.fn(() => wall),
        getGroundHitPoint: vi.fn(() => new Vector3(1, 0, 0)),
        getLegacyWallHitPoint: vi.fn(() => null),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        mountProps: vi.fn(),
        pointOnWallAxisMm: vi.fn(() => ({ t: 0.25 })),
        toMmPoint: vi.fn(() => ({ x: 1000, z: 0 })),
        updateDoorTransform,
        updateWindowTransform: vi.fn(),
        windowDragState: { active: false, offsetMm: 0, wall: null },
        windowOpening: null
      })
    ).toBe(true);

    expect(doorItem.params.centerMm).toBe(1500);
    expect(updateDoorTransform).toHaveBeenCalledExactlyOnceWith(doorItem);
  });

  it("does not handle opening drag pointermove when no active opening drag matches", () => {
    expect(
      handleOpeningDragPointerMove({
        doorDragState: { active: true, offsetMm: 500, wall: null },
        doorOpening: opening({ wallId: "wall-1" }),
        findCustomWall: vi.fn(),
        getGroundHitPoint: vi.fn(),
        getLegacyWallHitPoint: vi.fn(),
        getLegacyWallMeta: vi.fn(() => ({ axis: "x" as const })),
        mountProps: vi.fn(),
        pointOnWallAxisMm: vi.fn(),
        toMmPoint: vi.fn(),
        updateDoorTransform: vi.fn(),
        updateWindowTransform: vi.fn(),
        windowDragState: { active: false, offsetMm: 0, wall: null },
        windowOpening: null
      })
    ).toBe(false);
  });
});
