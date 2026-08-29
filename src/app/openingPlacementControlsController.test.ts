import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createDoorControlsController } from "./doorControlsController";
import type { DoorInstance, DoorParams, WallInstance, WindowInstance, WindowParams } from "./localTypes";
import { createWindowControlsController } from "./windowControlsController";

type WindowControlsContext = Parameters<typeof createWindowControlsController>[0];
type DoorControlsContext = Parameters<typeof createDoorControlsController>[0];

function createWall(): WallInstance {
  return {
    id: "wall-1",
    params: {
      aMm: { x: 0, z: 0 },
      bMm: { x: 3000, z: 0 },
      heightMm: 2600,
      thicknessMm: 180,
      justification: "center",
      exteriorSign: 1,
      materialId: "wall"
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  };
}

function createWindowContext(overrides: Partial<WindowControlsContext> = {}): WindowControlsContext {
  const wall = createWall();
  return {
    clampWindowParams: vi.fn((params: WindowParams) => params),
    commitHistory: vi.fn(),
    createWindow: vi.fn(() => ({ id: "window-1" }) as WindowInstance),
    ensureFloorplanViewerTab: vi.fn(),
    getActiveViewerTab: vi.fn(() => "floorplan"),
    getSelectedWallId: vi.fn(() => wall.id),
    getViewMode: vi.fn((): "2d" => "2d"),
    layoutRoot: new THREE.Group(),
    mode: "layout",
    mountProps: vi.fn(),
    rebuildWall: vi.fn(),
    rebuildWallPlanMesh: vi.fn(),
    scene: new THREE.Scene(),
    setSelectedWindow: vi.fn(),
    setToolSelect: vi.fn(),
    setUnderlayStatus: vi.fn(),
    setWindowCutout: vi.fn(),
    setWindowOpening: vi.fn(),
    wallDefs: {
      back: { plane: new THREE.Plane(), inwardNormal: new THREE.Vector3(), axis: "x", fixedPos: new THREE.Vector3(), axisHalf: 1 },
      left: { plane: new THREE.Plane(), inwardNormal: new THREE.Vector3(), axis: "z", fixedPos: new THREE.Vector3(), axisHalf: 1 },
      right: { plane: new THREE.Plane(), inwardNormal: new THREE.Vector3(), axis: "z", fixedPos: new THREE.Vector3(), axisHalf: 1 }
    },
    walls: [wall],
    windowEditorHost: { innerHTML: "" } as HTMLElement,
    windows: [],
    doors: [],
    windowInst: null,
    ...overrides
  };
}

function createDoorContext(overrides: Partial<DoorControlsContext> = {}): DoorControlsContext {
  const wall = createWall();
  return {
    clampDoorParams: vi.fn((params: DoorParams) => params),
    commitHistory: vi.fn(),
    createDoor: vi.fn(() => ({ id: "door-1" }) as DoorInstance),
    ensureFloorplanViewerTab: vi.fn(),
    getActiveViewerTab: vi.fn(() => "floorplan"),
    getSelectedWallId: vi.fn(() => wall.id),
    getViewMode: vi.fn((): "2d" => "2d"),
    layoutRoot: new THREE.Group(),
    mode: "layout",
    mountProps: vi.fn(),
    rebuildWall: vi.fn(),
    rebuildWallPlanMesh: vi.fn(),
    setSelectedDoor: vi.fn(),
    setToolSelect: vi.fn(),
    setUnderlayStatus: vi.fn(),
    walls: [wall],
    doors: [],
    windows: [],
    doorInst: null,
    ...overrides
  };
}

describe("opening placement controls", () => {
  it("marks a window preview invalid when it overlaps a door or fills its host wall", () => {
    const placedDoor = {
      id: "door-1",
      params: {
        wall: "back",
        wallId: "wall-1",
        centerMm: 1500,
        widthMm: 900
      }
    } as DoorInstance;
    const ctx = createWindowContext({ doors: [placedDoor] });
    const controller = createWindowControlsController(ctx);

    controller.addOrSelectWindow();

    expect(controller.updateWindowPlacementPreview("wall-1", { x: 1500, z: 0 })).toBe(false);
    controller.updateWindowPlacementParams({ widthMm: 3000 });
    expect(controller.updateWindowPlacementPreview("wall-1", { x: 1500, z: 0 })).toBe(false);
  });

  it("keeps current window placement entry and cancel status refresh behavior", () => {
    const ctx = createWindowContext();
    const controller = createWindowControlsController(ctx);

    controller.addOrSelectWindow();

    expect(controller.isWindowPlacementActive()).toBe(true);
    expect(ctx.setToolSelect).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Window: uprav parametre a klikni miesto na vybratej stene.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();

    expect(controller.cancelWindowPlacement()).toBe(true);

    expect(controller.isWindowPlacementActive()).toBe(false);
    expect(ctx.setUnderlayStatus).toHaveBeenLastCalledWith("");
    expect(ctx.mountProps).toHaveBeenCalledTimes(2);
  });

  it("keeps current door placement entry and cancel status refresh behavior", () => {
    const ctx = createDoorContext();
    const controller = createDoorControlsController(ctx);

    controller.addOrSelectDoor();

    expect(controller.isDoorPlacementActive()).toBe(true);
    expect(ctx.setToolSelect).toHaveBeenCalledOnce();
    expect(ctx.ensureFloorplanViewerTab).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith(
      "Door: uprav parametre a klikni miesto na vybratej stene. Space = lave/prave, Shift+Space = dnu/von."
    );
    expect(ctx.mountProps).toHaveBeenCalledOnce();

    expect(controller.cancelDoorPlacement()).toBe(true);

    expect(controller.isDoorPlacementActive()).toBe(false);
    expect(ctx.setUnderlayStatus).toHaveBeenLastCalledWith("");
    expect(ctx.mountProps).toHaveBeenCalledTimes(2);
  });
});
