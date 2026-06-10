import { describe, expect, it } from "vitest";
import {
  alignCustomFurnitureBoundarySegmentToReference,
  applyCustomFurnitureBoundaryCut,
  applyCustomFurnitureBoundaryFillet,
  cloneCustomFurnitureBoundaryEditState,
  customFurniturePlanPathLengthMm,
  customFurnitureBoundarySegmentsToBoundary,
  getCustomFurnitureBoundarySegmentPieces,
  getCustomFurniturePlanSegmentsForParams,
  getCustomFurnitureSegmentPathPoints,
  getCustomFurnitureSharedDrawToolIds,
  makeCustomFurnitureCircleBoundary,
  makeCustomFurniturePolygonBoundary,
  makeCustomFurnitureRectBoundary,
  makeCustomFurnitureVerticalBoardProfile,
  makeCustomFurnitureVerticalBoardDraftPreview,
  moveCustomFurnitureBoundaryCut,
  moveCustomFurnitureBoundarySegmentToParallelDistance,
  nextCustomFurnitureVerticalBoardDraftPoints,
  offsetCustomFurniturePlanPath,
  popCustomFurnitureBoundaryRedoState,
  popCustomFurnitureBoundaryUndoState,
  releaseCustomFurnitureButtonMagnetCapture,
  resolveCustomFurnitureActiveFurnitureId,
  resolveCustomFurnitureParallelBoundaryDimension,
  resolveCustomFurnitureCombinedAxisSnap,
  resolveCustomFurnitureBoundaryEscapeAction,
  selectCustomFurnitureBoundarySegmentsInRect,
  shouldCommitCustomFurnitureDraftBeforeLeaving,
  shouldStayInCustomFurnitureEditorAfterAccept,
  resolveCustomFurnitureTrackedAxisSnap,
  shouldCustomFurnitureBoundaryDrawFromPickedPoint,
  shouldCustomFurnitureSelectToolPassThroughEmptyPointer,
  shouldStopCustomFurnitureLineChainOnSnap,
  trimExtendCustomFurnitureBoundarySegmentsToCorner
} from "./customFurnitureController";
import type { CustomFurnitureBoundaryEditState } from "./customFurnitureController";

describe("custom furniture boundary tracking snap", () => {
  it("aligns a free point to the remembered boundary point on vertical and horizontal axes", () => {
    const tracked = { x: 1000, z: 500 };

    expect(resolveCustomFurnitureTrackedAxisSnap({ x: 1035, z: 860 }, tracked, 60)).toEqual({
      point: { x: 1000, z: 860 },
      axis: "x"
    });
    expect(resolveCustomFurnitureTrackedAxisSnap({ x: 1420, z: 545 }, tracked, 60)).toEqual({
      point: { x: 1420, z: 500 },
      axis: "z"
    });
  });

  it("does not align when the cursor is outside the guide tolerance", () => {
    expect(resolveCustomFurnitureTrackedAxisSnap({ x: 1130, z: 650 }, { x: 1000, z: 500 }, 60)).toBeNull();
  });

  it("combines remembered point tracking with the main horizontal and vertical direction snap", () => {
    const tracked = { x: 1000, z: 500 };
    const base = { x: 0, z: 0 };

    expect(resolveCustomFurnitureCombinedAxisSnap({ x: 1035, z: 35 }, tracked, base, 60)?.point).toEqual({
      x: 1000,
      z: 0
    });
    expect(resolveCustomFurnitureCombinedAxisSnap({ x: 35, z: 545 }, tracked, base, 60)?.point).toEqual({
      x: 0,
      z: 500
    });
  });

  it("undoes and redoes the last in-progress boundary line before furniture is finished", () => {
    const undoStack = [
      cloneCustomFurnitureBoundaryEditState({
        segments: [],
        first: null,
        hover: null,
        draftPoints: [],
        selectedSegmentIndex: null,
        selectedVertex: null
      }),
      cloneCustomFurnitureBoundaryEditState({
        segments: [{ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } }],
        first: { x: 1000, z: 0 },
        hover: { x: 1000, z: 0 },
        draftPoints: [],
        selectedSegmentIndex: 0,
        selectedVertex: null
      })
    ];
    const redoStack: CustomFurnitureBoundaryEditState[] = [];
    const current = {
      segments: [
        { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
        { a: { x: 1000, z: 0 }, b: { x: 1000, z: 700 } }
      ],
      first: { x: 1000, z: 700 },
      hover: { x: 1000, z: 700 },
      draftPoints: [],
      selectedSegmentIndex: 1,
      selectedVertex: null
    };

    const undone = popCustomFurnitureBoundaryUndoState(current, undoStack, redoStack);
    expect(undone?.segments).toHaveLength(1);
    expect(redoStack).toHaveLength(1);

    const redone = popCustomFurnitureBoundaryRedoState(undone!, undoStack, redoStack);
    expect(redone?.segments).toHaveLength(2);
    expect(redone?.segments[1]).toEqual({ a: { x: 1000, z: 0 }, b: { x: 1000, z: 700 } });
  });
});

describe("custom furniture boundary draw tools", () => {
  it("keeps the custom furniture editor open after accepting the boundary phase", () => {
    expect(shouldStayInCustomFurnitureEditorAfterAccept(true, null)).toBe(true);
    expect(shouldStayInCustomFurnitureEditorAfterAccept(false, "cf1")).toBe(true);
    expect(shouldStayInCustomFurnitureEditorAfterAccept(false, null)).toBe(false);
  });

  it("releases magnetic button cursor capture when a boundary tool takes over the canvas", () => {
    const activeButton = {
      classList: {
        classes: new Set(["button-magnet-active"]),
        remove(value: string) {
          this.classes.delete(value);
        }
      },
      style: {
        removed: [] as string[],
        removeProperty(value: string) {
          this.removed.push(value);
        }
      }
    };
    const doc = {
      body: {
        classList: {
          classes: new Set(["button-magnet-capturing"]),
          contains(value: string) {
            return this.classes.has(value);
          },
          remove(value: string) {
            this.classes.delete(value);
          }
        }
      },
      querySelectorAll() {
        return [activeButton];
      }
    } as unknown as Document;

    expect(releaseCustomFurnitureButtonMagnetCapture(doc)).toBe(true);
    expect(doc.body.classList.contains("button-magnet-capturing")).toBe(false);
    expect(activeButton.classList.classes.has("button-magnet-active")).toBe(false);
    expect(activeButton.style.removed).toContain("--button-magnet-x");
  });

  it("uses double Escape to leave line drawing in select mode without deleting finished lines", () => {
    expect(resolveCustomFurnitureBoundaryEscapeAction("line", true)).toBe("cancelDraft");
    expect(resolveCustomFurnitureBoundaryEscapeAction("line", false)).toBe("selectTool");
    expect(resolveCustomFurnitureBoundaryEscapeAction("select", false)).toBe("clearSelection");
  });

  it("lets line tools start from picked existing endpoints while select passes empty drags through", () => {
    expect(shouldCustomFurnitureBoundaryDrawFromPickedPoint("line", false)).toBe(true);
    expect(shouldCustomFurnitureBoundaryDrawFromPickedPoint("boundaryLine", false)).toBe(true);
    expect(shouldCustomFurnitureBoundaryDrawFromPickedPoint("select", false)).toBe(false);
    expect(shouldCustomFurnitureBoundaryDrawFromPickedPoint("line", true)).toBe(false);

    expect(shouldCustomFurnitureSelectToolPassThroughEmptyPointer("select", false, false)).toBe(true);
    expect(shouldCustomFurnitureSelectToolPassThroughEmptyPointer("select", true, false)).toBe(false);
    expect(shouldCustomFurnitureSelectToolPassThroughEmptyPointer("line", false, false)).toBe(false);
  });

  it("selects multiple boundary lines fully inside a rectangle", () => {
    const segments = [
      { a: { x: 10, z: 10 }, b: { x: 90, z: 10 } },
      { a: { x: 10, z: 30 }, b: { x: 90, z: 30 } },
      { a: { x: 10, z: 130 }, b: { x: 90, z: 130 } }
    ];

    expect(
      selectCustomFurnitureBoundarySegmentsInRect(
        segments,
        { x0: 0, y0: 0, x1: 100, y1: 100 },
        (point) => ({ x: point.x, y: point.z })
      )
    ).toEqual([0, 1]);
  });

  it("matches the base marquee behavior: contain left-to-right and touch right-to-left", () => {
    const segments = [
      { a: { x: 10, z: 10 }, b: { x: 90, z: 10 } },
      { a: { x: -20, z: 50 }, b: { x: 50, z: 50 } }
    ];
    const toScreen = (point: { x: number; z: number }) => ({ x: point.x, y: point.z });

    expect(selectCustomFurnitureBoundarySegmentsInRect(segments, { x0: 0, y0: 0, x1: 100, y1: 100 }, toScreen, "contain")).toEqual([0]);
    expect(selectCustomFurnitureBoundarySegmentsInRect(segments, { x0: 100, y0: 0, x1: 0, y1: 100 }, toScreen, "touch")).toEqual([0, 1]);
  });

  it("uses temporary dimensions as perpendicular distance to the nearest parallel line and moves the selected line", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 0, z: 500 }, b: { x: 1000, z: 500 } },
      { a: { x: 1000, z: 0 }, b: { x: 1000, z: 700 } }
    ];

    const dimension = resolveCustomFurnitureParallelBoundaryDimension(segments, 0);
    expect(dimension?.referenceSegmentIndex).toBe(1);
    expect(Math.round(dimension?.distanceMm ?? 0)).toBe(500);

    const moved = moveCustomFurnitureBoundarySegmentToParallelDistance(segments, 0, 1, 700);
    expect(moved[0]).toEqual({ a: { x: 0, z: -200 }, b: { x: 1000, z: -200 } });
    expect(moved[2]?.a).toEqual({ x: 1000, z: -200 });
    expect(moved[2]?.b).toEqual({ x: 1000, z: 700 });
  });

  it("trims or extends two non-parallel boundary lines to a shared corner", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 800, z: 0 } },
      { a: { x: 1000, z: 300 }, b: { x: 1000, z: 900 } }
    ];

    const trimmed = trimExtendCustomFurnitureBoundarySegmentsToCorner(segments, 0, 1);
    expect(trimmed[0]).toEqual({ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } });
    expect(trimmed[1]).toEqual({ a: { x: 1000, z: 0 }, b: { x: 1000, z: 900 } });
  });

  it("aligns the second boundary line to the first parallel reference line", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 100, z: 500 }, b: { x: 900, z: 500 } }
    ];

    const aligned = alignCustomFurnitureBoundarySegmentToReference(segments, 0, 1);
    expect(aligned[0]).toEqual(segments[0]);
    expect(aligned[1]).toEqual({ a: { x: 100, z: 0 }, b: { x: 900, z: 0 } });
  });

  it("extends or trims a non-parallel second boundary line to the first reference line", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 500, z: 300 }, b: { x: 500, z: 900 } }
    ];

    const aligned = alignCustomFurnitureBoundarySegmentToReference(segments, 0, 1);
    expect(aligned[0]).toEqual(segments[0]);
    expect(aligned[1]).toEqual({ a: { x: 500, z: 0 }, b: { x: 500, z: 900 } });
  });

  it("creates a mathematically bounded fillet only when two lines already share a corner", () => {
    const segments = [
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 0, z: 0 }, b: { x: 0, z: 1000 } }
    ];

    const filleted = applyCustomFurnitureBoundaryFillet(segments, 0, 1, 100, "f1");
    expect(filleted).toHaveLength(3);
    expect(filleted.every((segment) => segment.fillet?.id === "f1")).toBe(true);
    expect(filleted[0]?.filletRole).toBe("leg");
    expect(filleted.at(-1)?.filletRole).toBe("leg");
    expect(filleted[1]?.filletRole).toBe("arc");
    expect(filleted[1]?.arcPoints?.length).toBeGreaterThan(3);
    expect(filleted[0]?.b).toEqual({ x: 100, z: 0 });
    expect(filleted.at(-1)?.a).toEqual({ x: 0, z: 100 });
    expect(filleted.some((segment) => segment.a.x === 0 && segment.a.z === 0)).toBe(false);
    expect(filleted.some((segment) => segment.b.x === 0 && segment.b.z === 0)).toBe(false);

    const closedFillet = applyCustomFurnitureBoundaryFillet(
      [
        { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
        { a: { x: 0, z: 0 }, b: { x: 0, z: 1000 } },
        { a: { x: 0, z: 1000 }, b: { x: 1000, z: 1000 } },
        { a: { x: 1000, z: 1000 }, b: { x: 1000, z: 0 } }
      ],
      0,
      1,
      100,
      "f3"
    );
    const savedBoundary = customFurnitureBoundarySegmentsToBoundary(closedFillet);
    expect(savedBoundary?.some((point) => point.x === 0 && point.z === 0)).toBe(false);
    expect(savedBoundary?.length).toBeGreaterThan(filleted.length);

    const tooLarge = applyCustomFurnitureBoundaryFillet(segments, 0, 1, 1200, "f2");
    expect(tooLarge).toEqual(segments);
  });

  it("cuts one boundary line into two with a small gap and can move the cut by dimension", () => {
    const segments = [{ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } }];

    const cut = applyCustomFurnitureBoundaryCut(segments, 0, { x: 400, z: 0 }, 20, "c1");
    expect(cut).toHaveLength(2);
    expect(cut[0]?.b).toEqual({ x: 390, z: 0 });
    expect(cut[1]?.a).toEqual({ x: 410, z: 0 });

    const moved = moveCustomFurnitureBoundaryCut(cut, "c1", 600);
    const movedCutSegments = moved.filter((segment) => segment.cut?.id === "c1");
    expect(movedCutSegments[0]?.b).toEqual({ x: 590, z: 0 });
    expect(movedCutSegments[1]?.a).toEqual({ x: 610, z: 0 });
  });

  it("stops line chaining when the second point snaps onto an existing boundary", () => {
    expect(shouldStopCustomFurnitureLineChainOnSnap(true, true, "endpoint")).toBe(true);
    expect(shouldStopCustomFurnitureLineChainOnSnap(true, true, "edge")).toBe(true);
    expect(shouldStopCustomFurnitureLineChainOnSnap(false, true, "endpoint")).toBe(false);
    expect(shouldStopCustomFurnitureLineChainOnSnap(true, false, "axis")).toBe(false);
  });

  it("creates rectangle, polygon, and circle boundaries from two points", () => {
    expect(makeCustomFurnitureRectBoundary({ x: 0, z: 0 }, { x: 1000, z: 500 })).toEqual([
      { x: 0, z: 0 },
      { x: 1000, z: 0 },
      { x: 1000, z: 500 },
      { x: 0, z: 500 }
    ]);

    const polygon = makeCustomFurniturePolygonBoundary({ x: 0, z: 0 }, { x: 1000, z: 0 });
    expect(polygon).toHaveLength(6);
    expect(polygon[0]).toEqual({ x: 1000, z: 0 });

    const circle = makeCustomFurnitureCircleBoundary({ x: 0, z: 0 }, { x: 1000, z: 0 });
    expect(circle).toHaveLength(40);
    expect(circle[0]).toEqual({ x: 1000, z: 0 });
    expect(circle[10]).toEqual({ x: 0, z: 1000 });
  });

  it("keeps vertical board as a two-point draft until Accept creates the board", () => {
    const start = { x: 0, z: 0 };
    const hover = { x: 1000, z: 0 };
    const end = { x: 1200, z: 300 };

    const onePoint = nextCustomFurnitureVerticalBoardDraftPoints([], start);
    expect(makeCustomFurnitureVerticalBoardDraftPreview(onePoint, hover)).toEqual([start, hover]);

    const ready = nextCustomFurnitureVerticalBoardDraftPoints(onePoint, end);
    expect(ready).toEqual([start, end]);
    expect(makeCustomFurnitureVerticalBoardDraftPreview(ready, { x: 1800, z: 700 })).toEqual([start, end]);
  });

  it("accepts board tools into the open custom furniture editor even if selection was cleared", () => {
    expect(resolveCustomFurnitureActiveFurnitureId("cf_editor", null)).toBe("cf_editor");
    expect(resolveCustomFurnitureActiveFurnitureId("cf_editor", "cf_selected")).toBe("cf_editor");
    expect(resolveCustomFurnitureActiveFurnitureId(null, "cf_selected")).toBe("cf_selected");
  });

  it("commits an active board draft before closing or saving custom furniture", () => {
    expect(shouldCommitCustomFurnitureDraftBeforeLeaving("verticalBoard", false)).toBe(true);
    expect(shouldCommitCustomFurnitureDraftBeforeLeaving("horizontalBoard", false)).toBe(true);
    expect(shouldCommitCustomFurnitureDraftBeforeLeaving("boundary", true)).toBe(false);
    expect(shouldCommitCustomFurnitureDraftBeforeLeaving(null, false)).toBe(false);
  });

  it("uses one shared draw toolbar order for every custom furniture drawing mode", () => {
    expect(getCustomFurnitureSharedDrawToolIds()).toEqual([
      "boundaryLine",
      "line",
      "rectangle",
      "polygon",
      "circle",
      "arc",
      "spline",
      "pickLines"
    ]);
  });

  it("offsets drawn paths perpendicular to the draw direction and flips with direction", () => {
    const line = [
      { x: 0, z: 0 },
      { x: 1000, z: 0 }
    ];

    expect(offsetCustomFurniturePlanPath(line, 100, 1)).toEqual([
      { x: 0, z: 100 },
      { x: 1000, z: 100 }
    ]);
    expect(offsetCustomFurniturePlanPath(line, 100, -1)).toEqual([
      { x: 0, z: -100 },
      { x: 1000, z: -100 }
    ]);
  });

  it("creates vertical board profile from picked or drawn plan line using draft constraints", () => {
    const profile = makeCustomFurnitureVerticalBoardProfile(
      { baseOffsetMm: 100, topOffsetMm: 900 },
      { x: 0, z: 0 },
      { x: 300, z: 400 },
      { baseConstraint: "furnitureBase", baseOffsetMm: 20, topConstraint: "furnitureTop", topOffsetMm: -30 }
    );

    expect(profile).toEqual([
      { x: 0, y: 120 },
      { x: 500, y: 120 },
      { x: 500, y: 870 },
      { x: 0, y: 870 }
    ]);
  });

  it("exposes accepted furniture boundary and boards as pick-line plan segments", () => {
    const segments = getCustomFurniturePlanSegmentsForParams({
      boundary: [
        { x: 0, z: 0 },
        { x: 1000, z: 0 },
        { x: 1000, z: 500 },
        { x: 0, z: 500 }
      ],
      boards: [
        {
          id: "b1",
          name: "Board",
          kind: "vertical",
          workplane: { type: "vertical", aMm: { x: 100, z: 100 }, bMm: { x: 900, z: 100 }, mirrored: false },
          profile: [],
          thicknessMm: 18,
          materialId: "board",
          baseConstraint: "furnitureBase",
          baseOffsetMm: 0,
          topConstraint: "furnitureTop",
          topOffsetMm: 0,
          justification: "center",
          edgeBanding: []
        }
      ]
    });

    expect(segments).toHaveLength(5);
    expect(segments.at(-1)).toEqual({ a: { x: 100, z: 100 }, b: { x: 900, z: 100 } });
  });

  it("keeps one rounded boundary segment as one pick-line path", () => {
    const segment = {
      a: { x: 0, z: 0 },
      b: { x: 100, z: 100 },
      arcPoints: [
        { x: 0, z: 0 },
        { x: 50, z: 10 },
        { x: 100, z: 100 }
      ]
    };

    expect(getCustomFurnitureSegmentPathPoints(segment)).toEqual(segment.arcPoints);
    expect(getCustomFurnitureBoundarySegmentPieces(segment)).toHaveLength(2);
    expect(Math.round(customFurniturePlanPathLengthMm(getCustomFurnitureSegmentPathPoints(segment)))).toBe(154);
  });

  it("preserves rounded boundary segments for later pick-line board creation", () => {
    const segments = getCustomFurniturePlanSegmentsForParams({
      boundary: [
        { x: 0, z: 0 },
        { x: 100, z: 0 }
      ],
      boundarySegments: [
        {
          a: { x: 0, z: 0 },
          b: { x: 100, z: 100 },
          arcPoints: [
            { x: 0, z: 0 },
            { x: 50, z: 10 },
            { x: 100, z: 100 }
          ]
        }
      ],
      boards: []
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]?.arcPoints).toHaveLength(3);
  });
});
