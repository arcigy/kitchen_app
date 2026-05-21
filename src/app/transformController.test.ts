import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createTransformController } from "./transformController";
import type { SelectedKind, WallInstance, WallParams } from "./localTypes";

function makeTransformState() {
  return {
    kind: null as null | "move" | "rotate",
    step: null as null | "selectElements" | "pickBase" | "pickTarget" | "pickPivot" | "rotating",
    base: null as THREE.Vector3 | null,
    pivot: null as THREE.Vector3 | null,
    typed: "",
    lastAngleSign: 1,
    lastPointerPx: { x: 0, y: 0 },
    selectedWallIds: [] as string[],
    selectedInstanceIds: [] as string[],
    selectedSectionIds: [] as string[],
    startWalls: new Map<string, WallParams>(),
    startInstances: new Map<string, { pos: THREE.Vector3; rotY: number }>(),
    startInstanceAdjacency: new Map<string, string | null>(),
    startSections: new Map(),
    startPointerAngle: 0,
    lastValidDelta: new THREE.Vector3(0, 0, 0),
    lastValidAngle: 0
  };
}

describe("transform move tool", () => {
  it("enters Revit-style selection step when Move starts with no selection", () => {
    const transformState = makeTransformState();
    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn()
    });

    expect(controller.startTransformFromSelection("move")).toBe(true);
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("selectElements");
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

    const controller = createTransformController({
      S: { kitchenCtx: {} as any, kitchenGroups: [] },
      get mode() { return "layout"; },
      get viewMode() { return "2d"; },
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
      instances: [],
      sections: [],
      transformState,
      setUnderlayStatus: vi.fn(),
      mountProps: vi.fn(),
      instanceWorldBox: vi.fn(),
      detectModuleAdjacency: vi.fn()
    });

    selectedKind = "wall";
    selectedWallId = "w1";

    expect(controller.startTransformFromSelection("move")).toBe(true);
    expect(transformState.kind).toBe("move");
    expect(transformState.step).toBe("pickBase");
    expect(transformState.selectedWallIds).toEqual(["w1"]);
    expect(transformState.startWalls.get("w1")).toEqual(wall.params);
  });
});
