import { describe, expect, it, vi } from "vitest";
import { Mesh, Vector3 } from "three";
import {
  cloneFloorSegments,
  floorBoundaryToSegments,
  finishFloorBoundaryEditDragPointerUp,
  floorOrthoPoint,
  floorPointDistMm,
  floorPointEq,
  floorPointToWorld,
  floorSegmentsToBoundary,
  handleFloorBoundaryEditPointerDown,
  makeFloorCirclePoints,
  moveFloorEditSegment,
  moveFloorEditVertex,
  updateFloorBoundaryEditPointerMove,
  worldToFloorPoint
} from "./floorBoundaryEdit";
import type { FloorBoundaryPoint, FloorBoundarySegment, FloorBoundaryTool } from "./localTypes";

const boundary: FloorBoundaryPoint[] = [
  { x: 0, z: 0 },
  { x: 1000, z: 0 },
  { x: 1000, z: 800 },
  { x: 0, z: 800 }
];

function floorEditState(overrides: Partial<Parameters<typeof handleFloorBoundaryEditPointerDown>[0]["floorEdit"]> = {}) {
  return {
    drag: null,
    error: "",
    first: null,
    hover: null,
    ortho: false,
    selectedSegmentIndex: null,
    selectedVertex: null,
    segments: [] as FloorBoundarySegment[],
    tool: "line" as FloorBoundaryTool,
    ...overrides
  };
}

function pointerDownArgs(overrides: Partial<Parameters<typeof handleFloorBoundaryEditPointerDown>[0]> = {}) {
  return {
    addFloorEditSegment: vi.fn(),
    button: 0,
    cloneFloorSegments,
    floorEdit: floorEditState(),
    floorOrthoPoint: (start: FloorBoundaryPoint, raw: FloorBoundaryPoint) => floorOrthoPoint(start, raw, true),
    floorPointEq,
    makeFloorCirclePoints,
    mountProps: vi.fn(),
    pickedEdit: null,
    point: { x: 100, z: 200 },
    pointerId: 7,
    renderFloorBoundaryEdit: vi.fn(),
    resolvePickedLineSegment: vi.fn(() => null),
    setPointerCapture: vi.fn(),
    setUnderlayStatus: vi.fn(),
    ...overrides
  };
}

describe("floorBoundaryEdit", () => {
  it("converts points and measures in millimetres", () => {
    expect(floorPointDistMm({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(floorPointEq({ x: 0, z: 0 }, { x: 2, z: 2 })).toBe(true);
    expect(worldToFloorPoint(new Vector3(1.234, 9, -0.456))).toEqual({ x: 1234, z: -456 });
    expect(floorPointToWorld({ x: 500, z: 250 }).toArray()).toEqual([0.5, 0.055, 0.25]);
  });

  it("applies ortho lock only when enabled", () => {
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 900, z: 400 }, true)).toEqual({ x: 900, z: 0 });
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 300, z: 700 }, true)).toEqual({ x: 0, z: 700 });
    expect(floorOrthoPoint({ x: 0, z: 0 }, { x: 300, z: 700 }, false)).toEqual({ x: 300, z: 700 });
  });

  it("round-trips closed floor boundaries through segments", () => {
    const segments = floorBoundaryToSegments(boundary);
    const restored = floorSegmentsToBoundary(segments);

    expect(restored).toEqual(boundary);
    expect(segments[0].a).not.toBe(boundary[0]);
  });

  it("rejects open or disconnected segment sets", () => {
    expect(floorSegmentsToBoundary(floorBoundaryToSegments(boundary).slice(0, 2))).toBeNull();
    expect(
      floorSegmentsToBoundary([
        { a: { x: 0, z: 0 }, b: { x: 100, z: 0 } },
        { a: { x: 200, z: 0 }, b: { x: 300, z: 0 } },
        { a: { x: 300, z: 0 }, b: { x: 200, z: 0 } }
      ])
    ).toBeNull();
  });

  it("moves linked vertices and complete picked segments", () => {
    const segments = floorBoundaryToSegments(boundary);
    const movedVertex = moveFloorEditVertex(segments, { x: 1000, z: 0 }, { x: 1200, z: 50 });
    const movedSegment = moveFloorEditSegment(segments, 1, { x: 1000, z: 0 }, { x: 1100, z: 100 });

    expect(movedVertex[0].b).toEqual({ x: 1200, z: 50 });
    expect(movedVertex[1].a).toEqual({ x: 1200, z: 50 });
    expect(movedSegment[1]).toEqual({ a: { x: 1100, z: 100 }, b: { x: 1100, z: 900 } });
    expect(movedSegment[0].b).toEqual({ x: 1100, z: 100 });
    expect(movedSegment[2].a).toEqual({ x: 1100, z: 900 });
  });

  it("clones segments and builds circle points", () => {
    const segments: FloorBoundarySegment[] = floorBoundaryToSegments(boundary);
    const cloned = cloneFloorSegments(segments);
    const circle = makeFloorCirclePoints({ x: 0, z: 0 }, { x: 1000, z: 0 }, 8);

    expect(cloned).toEqual(segments);
    expect(cloned[0]).not.toBe(segments[0]);
    expect(circle).toHaveLength(8);
    expect(circle[0]).toEqual({ x: 1000, z: 0 });
    expect(circle[2]).toEqual({ x: 0, z: 1000 });
  });

  it("starts the current floor boundary vertex drag flow", () => {
    const segments = floorBoundaryToSegments(boundary);
    const floorEdit = floorEditState({ first: { x: 1, z: 2 }, hover: { x: 3, z: 4 }, error: "old", segments });
    const args = pointerDownArgs({
      floorEdit,
      pickedEdit: { kind: "vertex", ref: { segmentIndex: 0, endpoint: "b" } }
    });

    expect(handleFloorBoundaryEditPointerDown(args)).toBe(true);

    expect(floorEdit.first).toBeNull();
    expect(floorEdit.hover).toBeNull();
    expect(floorEdit.error).toBe("");
    expect(floorEdit.selectedVertex).toEqual({ segmentIndex: 0, endpoint: "b" });
    expect(floorEdit.selectedSegmentIndex).toBeNull();
    expect(floorEdit.drag).toMatchObject({ pointerId: 7, kind: "vertex", startPoint: { x: 1000, z: 0 } });
    expect(args.renderFloorBoundaryEdit).toHaveBeenCalledOnce();
    expect(args.setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(args.mountProps).toHaveBeenCalledOnce();
  });

  it("uses the current pickLines miss and success behavior", () => {
    const missArgs = pointerDownArgs({
      floorEdit: floorEditState({ tool: "pickLines", selectedSegmentIndex: 1, selectedVertex: { segmentIndex: 0, endpoint: "a" } })
    });

    expect(handleFloorBoundaryEditPointerDown(missArgs)).toBe(true);

    expect(missArgs.floorEdit.selectedSegmentIndex).toBeNull();
    expect(missArgs.floorEdit.selectedVertex).toBeNull();
    expect(missArgs.addFloorEditSegment).not.toHaveBeenCalled();
    expect(missArgs.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Floor boundary: edge was not found.");

    const picked = { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } };
    const hitArgs = pointerDownArgs({
      floorEdit: floorEditState({ tool: "pickLines" }),
      resolvePickedLineSegment: vi.fn(() => picked)
    });

    expect(handleFloorBoundaryEditPointerDown(hitArgs)).toBe(true);

    expect(hitArgs.addFloorEditSegment).toHaveBeenCalledExactlyOnceWith(picked.a, picked.b);
    expect(hitArgs.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Floor boundary: edge added.");
  });

  it("keeps the current first point and rectangle drawing behavior", () => {
    const firstArgs = pointerDownArgs();

    expect(handleFloorBoundaryEditPointerDown(firstArgs)).toBe(true);

    expect(firstArgs.floorEdit.first).toEqual({ x: 100, z: 200 });
    expect(firstArgs.floorEdit.hover).toEqual({ x: 100, z: 200 });
    expect(firstArgs.renderFloorBoundaryEdit).toHaveBeenCalledOnce();

    const rectangleEdit = floorEditState({
      first: { x: 0, z: 0 },
      ortho: true,
      tool: "rectangle"
    });

    expect(handleFloorBoundaryEditPointerDown(pointerDownArgs({ floorEdit: rectangleEdit, point: { x: 1000, z: 400 } }))).toBe(true);

    expect(rectangleEdit.segments).toEqual([
      { a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 1000, z: 0 }, b: { x: 1000, z: 0 } },
      { a: { x: 1000, z: 0 }, b: { x: 0, z: 0 } },
      { a: { x: 0, z: 0 }, b: { x: 0, z: 0 } }
    ]);
    expect(rectangleEdit.first).toBeNull();
    expect(rectangleEdit.hover).toBeNull();
  });

  it("keeps the current line continuation and closing behavior", () => {
    const floorEdit = floorEditState({
      first: { x: 1000, z: 0 },
      segments: [{ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } }]
    });
    const args = pointerDownArgs({
      floorEdit,
      point: { x: 1000, z: 800 }
    });

    expect(handleFloorBoundaryEditPointerDown(args)).toBe(true);

    expect(args.addFloorEditSegment).toHaveBeenCalledExactlyOnceWith({ x: 1000, z: 0 }, { x: 1000, z: 800 });
    expect(floorEdit.first).toEqual({ x: 1000, z: 800 });
    expect(floorEdit.hover).toEqual({ x: 1000, z: 800 });

    const closingEdit = floorEditState({
      first: { x: 0, z: 800 },
      segments: floorBoundaryToSegments(boundary).slice(0, 3)
    });
    const closingArgs = pointerDownArgs({
      floorEdit: closingEdit,
      point: { x: 4, z: 5 }
    });

    expect(handleFloorBoundaryEditPointerDown(closingArgs)).toBe(true);

    expect(closingArgs.addFloorEditSegment).toHaveBeenCalledExactlyOnceWith({ x: 0, z: 800 }, { x: 0, z: 0 });
    expect(closingEdit.first).toBeNull();
    expect(closingEdit.hover).toBeNull();
  });

  it("finishes the current floor boundary drag on matching pointerup", () => {
    const floorEdit = floorEditState({
      drag: {
        pointerId: 7,
        kind: "vertex",
        startPoint: { x: 1000, z: 0 },
        startSegments: floorBoundaryToSegments(boundary)
      }
    });
    const renderFloorBoundaryEdit = vi.fn();
    const mountProps = vi.fn();
    const releasePointerCapture = vi.fn();

    expect(
      finishFloorBoundaryEditDragPointerUp({
        floorEdit,
        mountProps,
        pointerId: 7,
        releasePointerCapture,
        renderFloorBoundaryEdit
      })
    ).toBe(true);

    expect(floorEdit.drag).toBeNull();
    expect(renderFloorBoundaryEdit).toHaveBeenCalledOnce();
    expect(mountProps).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("does not finish floor boundary drag for missing or mismatched pointerup", () => {
    const floorEdit = floorEditState({
      drag: {
        pointerId: 7,
        kind: "segment",
        segmentIndex: 0,
        startWorld: { x: 0, z: 0 },
        startSegments: floorBoundaryToSegments(boundary)
      }
    });
    const renderFloorBoundaryEdit = vi.fn();
    const mountProps = vi.fn();
    const releasePointerCapture = vi.fn();

    expect(
      finishFloorBoundaryEditDragPointerUp({
        floorEdit,
        mountProps,
        pointerId: 8,
        releasePointerCapture,
        renderFloorBoundaryEdit
      })
    ).toBe(false);
    expect(floorEdit.drag).not.toBeNull();

    floorEdit.drag = null;
    expect(
      finishFloorBoundaryEditDragPointerUp({
        floorEdit,
        mountProps,
        pointerId: 7,
        releasePointerCapture,
        renderFloorBoundaryEdit
      })
    ).toBe(false);

    expect(renderFloorBoundaryEdit).not.toHaveBeenCalled();
    expect(mountProps).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();
  });

  it("updates current floor boundary vertex drag on matching pointermove", () => {
    const floorEdit = floorEditState({
      drag: {
        pointerId: 7,
        kind: "vertex",
        startPoint: { x: 1000, z: 0 },
        startSegments: floorBoundaryToSegments(boundary)
      },
      error: "old"
    });
    const moveFloorEditVertexMock = vi.fn();
    const renderFloorBoundaryEdit = vi.fn();

    expect(
      updateFloorBoundaryEditPointerMove({
        floorEdit,
        floorPoint: { x: 1200, z: 50 },
        hitPoint: new Vector3(1.2, 0, 0.05),
        pointerId: 7,
        rect: {} as DOMRect,
        mouse: null,
        camera: {} as never,
        hudHoverLine: new Mesh(),
        floorOrthoPoint: vi.fn(),
        moveFloorEditVertex: moveFloorEditVertexMock,
        moveFloorEditSegment: vi.fn(),
        pickWallLine2D: vi.fn(),
        pickAlignLineAt: vi.fn(),
        updateHudLine: vi.fn(),
        hudLineThickness: 2,
        renderFloorBoundaryEdit
      })
    ).toBe(true);

    expect(moveFloorEditVertexMock).toHaveBeenCalledExactlyOnceWith(floorEdit.drag?.startSegments, { x: 1000, z: 0 }, { x: 1200, z: 50 });
    expect(floorEdit.error).toBe("");
    expect(renderFloorBoundaryEdit).toHaveBeenCalledOnce();
  });

  it("updates floor boundary pickLines hover from picked wall line before align fallback", () => {
    const floorEdit = floorEditState({ tool: "pickLines" });
    const hudHoverLine = new Mesh();
    const wallLine = {
      wallId: "wall-1",
      kind: "center" as const,
      p: new Vector3(0, 0, 0),
      dir: new Vector3(1, 0, 0),
      a: new Vector3(0, 0, 0),
      b: new Vector3(1, 0, 0),
      label: "wall"
    };
    const alignLine = { segA: new Vector3(0, 0, 1), segB: new Vector3(1, 0, 1) };
    const updateHudLine = vi.fn();

    updateFloorBoundaryEditPointerMove({
      floorEdit,
      floorPoint: { x: 100, z: 200 },
      hitPoint: new Vector3(0.1, 0, 0.2),
      pointerId: 7,
      rect: {} as DOMRect,
      mouse: { x: 1, y: 2 },
      camera: {} as never,
      hudHoverLine,
      floorOrthoPoint: vi.fn(),
      moveFloorEditVertex: vi.fn(),
      moveFloorEditSegment: vi.fn(),
      pickWallLine2D: vi.fn(() => wallLine),
      pickAlignLineAt: vi.fn(() => alignLine as never),
      updateHudLine,
      hudLineThickness: 3,
      renderFloorBoundaryEdit: vi.fn()
    });

    expect(updateHudLine).toHaveBeenCalledExactlyOnceWith(hudHoverLine, wallLine.a, wallLine.b, 3);
  });

  it("updates floor boundary first-point hover with ortho and hides non-pickLines HUD", () => {
    const floorEdit = floorEditState({ first: { x: 0, z: 0 }, ortho: true, tool: "line" });
    const hudHoverLine = new Mesh();
    hudHoverLine.visible = true;
    const renderFloorBoundaryEdit = vi.fn();

    updateFloorBoundaryEditPointerMove({
      floorEdit,
      floorPoint: { x: 900, z: 400 },
      hitPoint: new Vector3(0.9, 0, 0.4),
      pointerId: 7,
      rect: {} as DOMRect,
      mouse: null,
      camera: {} as never,
      hudHoverLine,
      floorOrthoPoint: (start, raw) => floorOrthoPoint(start, raw, true),
      moveFloorEditVertex: vi.fn(),
      moveFloorEditSegment: vi.fn(),
      pickWallLine2D: vi.fn(),
      pickAlignLineAt: vi.fn(),
      updateHudLine: vi.fn(),
      hudLineThickness: 2,
      renderFloorBoundaryEdit
    });

    expect(hudHoverLine.visible).toBe(false);
    expect(floorEdit.hover).toEqual({ x: 900, z: 0 });
    expect(renderFloorBoundaryEdit).toHaveBeenCalledOnce();
  });
});
