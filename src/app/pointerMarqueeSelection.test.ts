import { describe, expect, it, vi } from "vitest";
import {
  applyResolvedMarqueeSelection,
  boundsContainedInRect,
  boundsFromPoints,
  boundsOverlapsRect,
  beginPointerMarquee,
  cancelPendingPointerMarqueeHit,
  clearPointerMarquee,
  finishActivePointerMarquee,
  finishPendingPointerMarquee,
  makeMarqueeRect,
  polygonTouchesRect,
  updatePointerMarqueePointerMove,
  updatePointerMarqueeDrag,
  resolveMarqueeSelection
} from "./pointerMarqueeSelection";

describe("pointer marquee selection helpers", () => {
  function makeState() {
    return {
      active: false,
      hitSomething: true,
      mode: "touch" as const,
      pending: false,
      pointerId: null,
      startX: 0,
      startY: 0
    };
  }

  function makeElement() {
    return {
      style: {
        background: "",
        border: "",
        display: "",
        height: "",
        left: "",
        top: "",
        width: ""
      }
    };
  }

  it("begins pending marquee selection with hidden DOM box", () => {
    const state = makeState();
    const element = makeElement();

    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });

    expect(state).toEqual({
      active: false,
      hitSomething: false,
      mode: "contain",
      pending: true,
      pointerId: 7,
      startX: 12,
      startY: 34
    });
    expect(element.style.display).toBe("none");
  });

  it("activates pending marquee only after threshold and initializes contain style", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });

    expect(updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 14, y: 35 })).toBe(false);
    expect(state.active).toBe(false);

    expect(updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 20, y: 35 })).toBe(true);
    expect(state.active).toBe(true);
    expect(element.style.display).toBe("block");
    expect(element.style.left).toBe("12px");
    expect(element.style.top).toBe("34px");
    expect(element.style.width).toBe("0px");
    expect(element.style.height).toBe("0px");
    expect(element.style.border).toBe("1px solid rgba(92, 140, 255, 0.95)");
  });

  it("updates active marquee geometry and switches touch style when dragged left", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 50, y: 20 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 60, y: 30 });

    expect(updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 10, y: 40 })).toBe(true);

    expect(state.mode).toBe("touch");
    expect(element.style.left).toBe("10px");
    expect(element.style.top).toBe("20px");
    expect(element.style.width).toBe("40px");
    expect(element.style.height).toBe("20px");
    expect(element.style.border).toBe("1px solid rgba(61, 220, 151, 0.95)");
    expect(element.style.background).toBe("rgba(61, 220, 151, 0.10)");
  });

  it("updates active marquee pointermove without requiring matching pointer id", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 50, y: 20 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 60, y: 30 });

    expect(updatePointerMarqueePointerMove(state, element, { pointerId: 99, x: 10, y: 40 })).toBe(true);

    expect(state.mode).toBe("touch");
    expect(element.style.left).toBe("10px");
    expect(element.style.width).toBe("40px");
  });

  it("updates pending marquee pointermove only for matching pointer id", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });

    expect(updatePointerMarqueePointerMove(state, element, { pointerId: 8, x: 40, y: 50 })).toBe(false);
    expect(state.active).toBe(false);

    expect(updatePointerMarqueePointerMove(state, element, { pointerId: 7, x: 40, y: 50 })).toBe(true);
    expect(state.active).toBe(true);
    expect(element.style.display).toBe("block");
  });

  it("clears marquee state and hides the DOM box", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 20, y: 35 });

    clearPointerMarquee(state, element);

    expect(state.active).toBe(false);
    expect(state.pending).toBe(false);
    expect(state.pointerId).toBeNull();
    expect(element.style.display).toBe("none");
  });

  it("cancels a pending marquee after a hit without clearing pointer id", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });

    expect(cancelPendingPointerMarqueeHit(state, element, 7)).toBe(true);

    expect(state.active).toBe(false);
    expect(state.pending).toBe(false);
    expect(state.hitSomething).toBe(true);
    expect(state.pointerId).toBe(7);
    expect(element.style.display).toBe("none");
  });

  it("does not cancel a pending marquee for a different pointer", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 12, y: 34 });

    expect(cancelPendingPointerMarqueeHit(state, element, 8)).toBe(false);

    expect(state.pending).toBe(true);
    expect(state.pointerId).toBe(7);
  });

  it("normalizes marquee rectangles regardless of drag direction", () => {
    expect(makeMarqueeRect(20, 30, 5, 10)).toEqual({ x0: 5, y0: 10, x1: 20, y1: 30 });
  });

  it("checks contained and overlapping bounds", () => {
    const rect = makeMarqueeRect(10, 10, 50, 50);

    expect(boundsContainedInRect({ minX: 20, minY: 20, maxX: 40, maxY: 40 }, rect)).toBe(true);
    expect(boundsContainedInRect({ minX: 5, minY: 20, maxX: 40, maxY: 40 }, rect)).toBe(false);
    expect(boundsOverlapsRect({ minX: 45, minY: 45, maxX: 80, maxY: 80 }, rect)).toBe(true);
    expect(boundsOverlapsRect({ minX: 60, minY: 60, maxX: 80, maxY: 80 }, rect)).toBe(false);
  });

  it("builds bounds from screen points", () => {
    expect(boundsFromPoints([{ x: 20, y: 40 }, { x: 5, y: 30 }, { x: 12, y: 3 }])).toEqual({
      minX: 5,
      maxX: 20,
      minY: 3,
      maxY: 40
    });
    expect(boundsFromPoints([])).toBeNull();
  });

  it("detects polygons that touch a marquee rectangle", () => {
    const rect = makeMarqueeRect(10, 10, 50, 50);

    expect(polygonTouchesRect([{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }], rect)).toBe(true);
    expect(polygonTouchesRect([{ x: 0, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 25 }, { x: 0, y: 25 }], rect)).toBe(true);
    expect(polygonTouchesRect([{ x: 60, y: 60 }, { x: 70, y: 60 }, { x: 70, y: 70 }], rect)).toBe(false);
  });

  it("replaces selection and prefers wall primary over module primary", () => {
    expect(
      resolveMarqueeSelection({
        additive: false,
        currentInstanceId: "m-old",
        currentWallId: "w-old",
        hitInstanceIds: ["m1"],
        hitWallIds: ["w1"],
        selectedInstanceIds: ["m-old"],
        selectedWallIds: ["w-old"]
      })
    ).toEqual({
      primaryInstanceId: null,
      primaryWallId: "w1",
      selectedInstanceIds: ["m1"],
      selectedWallIds: ["w1"]
    });
  });

  it("adds to selection and keeps current primary when it remains selected", () => {
    expect(
      resolveMarqueeSelection({
        additive: true,
        currentInstanceId: "m-current",
        currentWallId: null,
        hitInstanceIds: ["m2"],
        hitWallIds: [],
        selectedInstanceIds: ["m-current"],
        selectedWallIds: ["w-existing"]
      })
    ).toEqual({
      primaryInstanceId: "m-current",
      primaryWallId: null,
      selectedInstanceIds: ["m-current", "m2"],
      selectedWallIds: ["w-existing"]
    });
  });

  it("applies resolved wall-primary marquee selection to selection state", () => {
    const selectedWallIds = new Set(["old-wall"]);
    const selectedInstanceIds = new Set(["old-module"]);
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();
    const updateSelectionHighlights = vi.fn();
    const mountProps = vi.fn();

    applyResolvedMarqueeSelection({
      mountProps,
      resolvedSelection: {
        primaryInstanceId: null,
        primaryWallId: "w1",
        selectedInstanceIds: ["m1"],
        selectedWallIds: ["w1", "w2"]
      },
      selectedInstanceIds,
      selectedWallIds,
      setSelectedModule,
      setSelectedWall,
      updateSelectionHighlights
    });

    expect(setSelectedWall).toHaveBeenCalledExactlyOnceWith("w1");
    expect(setSelectedModule).not.toHaveBeenCalled();
    expect(Array.from(selectedWallIds)).toEqual(["w1", "w2"]);
    expect(Array.from(selectedInstanceIds)).toEqual(["m1"]);
    expect(updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(mountProps).toHaveBeenCalledTimes(1);
  });

  it("applies resolved module-primary marquee selection to selection state", () => {
    const selectedWallIds = new Set(["old-wall"]);
    const selectedInstanceIds = new Set(["old-module"]);
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();

    applyResolvedMarqueeSelection({
      mountProps: vi.fn(),
      resolvedSelection: {
        primaryInstanceId: "m1",
        primaryWallId: null,
        selectedInstanceIds: ["m1", "m2"],
        selectedWallIds: []
      },
      selectedInstanceIds,
      selectedWallIds,
      setSelectedModule,
      setSelectedWall,
      updateSelectionHighlights: vi.fn()
    });

    expect(setSelectedWall).not.toHaveBeenCalled();
    expect(setSelectedModule).toHaveBeenCalledExactlyOnceWith("m1");
    expect(Array.from(selectedWallIds)).toEqual([]);
    expect(Array.from(selectedInstanceIds)).toEqual(["m1", "m2"]);
  });

  it("clears primary selection when resolved marquee selection has no primary", () => {
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();

    applyResolvedMarqueeSelection({
      mountProps: vi.fn(),
      resolvedSelection: {
        primaryInstanceId: null,
        primaryWallId: null,
        selectedInstanceIds: [],
        selectedWallIds: []
      },
      selectedInstanceIds: new Set(["old-module"]),
      selectedWallIds: new Set(["old-wall"]),
      setSelectedModule,
      setSelectedWall,
      updateSelectionHighlights: vi.fn()
    });

    expect(setSelectedWall).toHaveBeenCalledExactlyOnceWith(null);
    expect(setSelectedModule).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("finishes active marquee pointerup by resolving hits, applying selection, and releasing capture", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 10, y: 10 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 30, y: 30 });
    const selectedWallIds = new Set<string>();
    const selectedInstanceIds = new Set<string>();
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();
    const releasePointerCapture = vi.fn();
    const collectHitIds = vi.fn(() => ({ hitInstanceIds: ["m1"], hitWallIds: ["w1"] }));
    const updateSelectionHighlights = vi.fn();
    const mountProps = vi.fn();

    finishActivePointerMarquee({
      additive: false,
      collectHitIds,
      currentInstanceId: null,
      currentWallId: null,
      endPoint: { x: 40, y: 50 },
      layoutTool: "select",
      marquee: state,
      marqueeEl: element,
      mountProps,
      pointerId: 7,
      releasePointerCapture,
      selectedInstanceIds,
      selectedWallIds,
      setSelectedModule,
      setSelectedWall,
      updateSelectionHighlights
    });

    expect(state.active).toBe(false);
    expect(state.pending).toBe(false);
    expect(state.pointerId).toBeNull();
    expect(element.style.display).toBe("none");
    expect(collectHitIds).toHaveBeenCalledExactlyOnceWith({ x0: 10, y0: 10, x1: 40, y1: 50 });
    expect(setSelectedWall).toHaveBeenCalledExactlyOnceWith("w1");
    expect(setSelectedModule).not.toHaveBeenCalled();
    expect(Array.from(selectedWallIds)).toEqual(["w1"]);
    expect(Array.from(selectedInstanceIds)).toEqual(["m1"]);
    expect(updateSelectionHighlights).toHaveBeenCalledTimes(1);
    expect(mountProps).toHaveBeenCalledTimes(1);
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("lets an active editor scope apply custom marquee selection before module and wall hits", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 10, y: 10 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 30, y: 30 });
    const applyCustomSelection = vi.fn(() => true);
    const collectHitIds = vi.fn(() => ({ hitInstanceIds: ["m1"], hitWallIds: ["w1"] }));
    const releasePointerCapture = vi.fn();

    finishActivePointerMarquee({
      additive: true,
      applyCustomSelection,
      collectHitIds,
      currentInstanceId: null,
      currentWallId: null,
      endPoint: { x: 40, y: 50 },
      layoutTool: "select",
      marquee: state,
      marqueeEl: element,
      mountProps: vi.fn(),
      pointerId: 7,
      releasePointerCapture,
      selectedInstanceIds: new Set(),
      selectedWallIds: new Set(),
      setSelectedModule: vi.fn(),
      setSelectedWall: vi.fn(),
      updateSelectionHighlights: vi.fn()
    });

    expect(applyCustomSelection).toHaveBeenCalledExactlyOnceWith({ x0: 10, y0: 10, x1: 40, y1: 50 }, true);
    expect(collectHitIds).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("finishes active marquee without applying selection for click-sized drags", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 10, y: 10 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 20, y: 20 });
    const collectHitIds = vi.fn(() => ({ hitInstanceIds: ["m1"], hitWallIds: ["w1"] }));
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();
    const releasePointerCapture = vi.fn();

    finishActivePointerMarquee({
      additive: false,
      collectHitIds,
      currentInstanceId: null,
      currentWallId: null,
      endPoint: { x: 15, y: 15 },
      layoutTool: "select",
      marquee: state,
      marqueeEl: element,
      mountProps: vi.fn(),
      pointerId: 7,
      releasePointerCapture,
      selectedInstanceIds: new Set(),
      selectedWallIds: new Set(),
      setSelectedModule,
      setSelectedWall,
      updateSelectionHighlights: vi.fn()
    });

    expect(collectHitIds).not.toHaveBeenCalled();
    expect(setSelectedWall).not.toHaveBeenCalled();
    expect(setSelectedModule).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("finishes active marquee without applying selection outside select tool", () => {
    const state = makeState();
    const element = makeElement();
    beginPointerMarquee(state, element, { pointerId: 7, x: 10, y: 10 });
    updatePointerMarqueeDrag(state, element, { pointerId: 7, x: 30, y: 30 });
    const collectHitIds = vi.fn(() => ({ hitInstanceIds: ["m1"], hitWallIds: ["w1"] }));
    const releasePointerCapture = vi.fn();

    finishActivePointerMarquee({
      additive: false,
      collectHitIds,
      currentInstanceId: null,
      currentWallId: null,
      endPoint: { x: 40, y: 50 },
      layoutTool: "move",
      marquee: state,
      marqueeEl: element,
      mountProps: vi.fn(),
      pointerId: 7,
      releasePointerCapture,
      selectedInstanceIds: new Set(),
      selectedWallIds: new Set(),
      setSelectedModule: vi.fn(),
      setSelectedWall: vi.fn(),
      updateSelectionHighlights: vi.fn()
    });

    expect(collectHitIds).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("finishes pending marquee pointerup and clears selection for empty select click", () => {
    const state = makeState();
    beginPointerMarquee(state, makeElement(), { pointerId: 7, x: 10, y: 10 });
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();
    const releasePointerCapture = vi.fn();

    const handled = finishPendingPointerMarquee({
      button: 0,
      clientX: 100,
      clientY: 200,
      layoutTool: "select",
      marquee: state,
      pointerId: 7,
      releasePointerCapture,
      setSelectedModule,
      setSelectedWall,
      viewMode: "2d"
    });

    expect(handled).toBe(true);
    expect(state.pending).toBe(false);
    expect(state.pointerId).toBeNull();
    expect(setSelectedWall).toHaveBeenCalledExactlyOnceWith(null);
    expect(setSelectedModule).toHaveBeenCalledExactlyOnceWith(null);
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("finishes pending marquee pointerup without clearing selection after a hit", () => {
    const state = makeState();
    beginPointerMarquee(state, makeElement(), { pointerId: 7, x: 10, y: 10 });
    state.hitSomething = true;
    const setSelectedWall = vi.fn();
    const setSelectedModule = vi.fn();

    const handled = finishPendingPointerMarquee({
      button: 0,
      clientX: 100,
      clientY: 200,
      layoutTool: "select",
      marquee: state,
      pointerId: 7,
      releasePointerCapture: vi.fn(),
      setSelectedModule,
      setSelectedWall,
      viewMode: "2d"
    });

    expect(handled).toBe(true);
    expect(setSelectedWall).not.toHaveBeenCalled();
    expect(setSelectedModule).not.toHaveBeenCalled();
  });

  it("opens quick action menu for pending right-click pointerup", () => {
    const state = makeState();
    beginPointerMarquee(state, makeElement(), { pointerId: 7, x: 10, y: 10 });
    const openQuickActionMenu = vi.fn();

    const handled = finishPendingPointerMarquee({
      button: 2,
      clientX: 100,
      clientY: 200,
      layoutTool: "move",
      marquee: state,
      openQuickActionMenu,
      pointerId: 7,
      releasePointerCapture: vi.fn(),
      setSelectedModule: vi.fn(),
      setSelectedWall: vi.fn(),
      viewMode: "2d"
    });

    expect(handled).toBe(true);
    expect(openQuickActionMenu).toHaveBeenCalledExactlyOnceWith(100, 200);
  });

  it("does not finish pending marquee for inactive, active, or mismatched pointer state", () => {
    const inactive = makeState();
    const active = makeState();
    beginPointerMarquee(active, makeElement(), { pointerId: 7, x: 10, y: 10 });
    active.active = true;
    const mismatched = makeState();
    beginPointerMarquee(mismatched, makeElement(), { pointerId: 8, x: 10, y: 10 });
    const releasePointerCapture = vi.fn();
    const args = {
      button: 0,
      clientX: 100,
      clientY: 200,
      layoutTool: "select",
      pointerId: 7,
      releasePointerCapture,
      setSelectedModule: vi.fn(),
      setSelectedWall: vi.fn(),
      viewMode: "2d"
    };

    expect(finishPendingPointerMarquee({ ...args, marquee: inactive })).toBe(false);
    expect(finishPendingPointerMarquee({ ...args, marquee: active })).toBe(false);
    expect(finishPendingPointerMarquee({ ...args, marquee: mismatched })).toBe(false);
    expect(releasePointerCapture).not.toHaveBeenCalled();
  });
});
