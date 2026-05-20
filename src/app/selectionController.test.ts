import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createSelectionController } from "./selectionController";

const createContext = () => {
  const scene = new THREE.Scene();
  const wallRoot = new THREE.Group();
  wallRoot.name = "wall_wall";
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
    walls: [{ id: "wall", root: wallRoot }]
  } as any;
};

describe("createSelectionController", () => {
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
});
