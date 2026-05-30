import { describe, expect, it, vi } from "vitest";
import { createLayoutActionsController } from "./layoutActionsController";
import type { SelectedKind } from "./localTypes";

function makeController(overrides: Partial<Parameters<typeof createLayoutActionsController>[0]> = {}) {
  let selectedKind: SelectedKind = null;
  let selectedInstanceId: string | null = null;
  let selectedWallId: string | null = null;
  let selectedKitchenGroupId: string | null = null;
  let selectedSectionId: string | null = null;
  let selectedFloorId: string | null = null;
  let selectedColumnId: string | null = null;
  const selectedInstanceIds = new Set<string>();
  const selectedWallIds = new Set<string>();

  const ctx: Parameters<typeof createLayoutActionsController>[0] = {
    view2d: { checked: false } as HTMLInputElement,
    ensureLayoutMode: vi.fn(),
    cancelPlacementIfActive: vi.fn(),
    setToolSelect: vi.fn(),
    isVisibleUnpinnedUnderlay: () => false,
    getSelectedKind: () => selectedKind,
    setSelectedKind: (kind) => {
      selectedKind = kind;
    },
    getSelectedInstanceId: () => selectedInstanceId,
    getSelectedKitchenGroupId: () => selectedKitchenGroupId,
    getSelectedSectionId: () => selectedSectionId,
    getSelectedFloorId: () => selectedFloorId,
    getSelectedColumnId: () => selectedColumnId,
    getSelectedWallId: () => selectedWallId,
    getSelectedInstanceIds: () => selectedInstanceIds,
    getSelectedWallIds: () => selectedWallIds,
    setSelectedUnderlay: vi.fn(),
    setSelectedWall: (id) => {
      selectedWallId = id;
      selectedKind = id ? "wall" : null;
    },
    setSelectedModule: (id) => {
      selectedInstanceId = id;
      selectedKind = id ? "module" : null;
    },
    setSelectedSection: (id) => {
      selectedSectionId = id;
      selectedKind = id ? "section" : null;
    },
    setSelectedFloor: (id) => {
      selectedFloorId = id;
      selectedKind = id ? "floor" : null;
    },
    setSelectedColumn: (id) => {
      selectedColumnId = id;
      selectedKind = id ? "column" : null;
    },
    mountProps: vi.fn(),
    duplicateInstance: vi.fn(),
    duplicateWall: vi.fn((id: string) => ({ id: `${id}_copy` })),
    deleteInstance: vi.fn(),
    deleteWall: vi.fn(),
    deleteSectionInstance: vi.fn(),
    deleteFloor: vi.fn(),
    deleteColumn: vi.fn(() => true),
    deleteKitchenGroup: vi.fn(() => true),
    deleteWindow: vi.fn(() => true),
    deleteDoor: vi.fn(() => true),
    deleteUnderlay: vi.fn(() => true),
    deleteWardrobeSelection: vi.fn(() => false),
    commitHistory: vi.fn(),
    setView2d: vi.fn(),
    ...overrides
  };

  return {
    controller: createLayoutActionsController(ctx),
    ctx,
    selectedInstanceIds,
    selectedWallIds,
    setSelection(next: {
      kind: SelectedKind;
      instanceId?: string | null;
      wallId?: string | null;
      kitchenGroupId?: string | null;
      sectionId?: string | null;
      floorId?: string | null;
      columnId?: string | null;
    }) {
      selectedKind = next.kind;
      selectedInstanceId = next.instanceId ?? null;
      selectedWallId = next.wallId ?? null;
      selectedKitchenGroupId = next.kitchenGroupId ?? null;
      selectedSectionId = next.sectionId ?? null;
      selectedFloorId = next.floorId ?? null;
      selectedColumnId = next.columnId ?? null;
    }
  };
}

describe("layout delete action", () => {
  it("duplicates selected walls from the shared edit action", () => {
    const harness = makeController();
    harness.setSelection({ kind: "wall", wallId: "w1" });

    harness.controller.duplicateSelected();

    expect(harness.ctx.duplicateWall).toHaveBeenCalledWith("w1");
    expect(harness.selectedWallIds.has("w1_copy")).toBe(true);
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
    expect(harness.ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("deletes kitchen groups as one selected object", () => {
    const harness = makeController();
    harness.setSelection({ kind: "kitchenGroup", kitchenGroupId: "kg1" });

    expect(harness.controller.deleteSelected()).toBe(true);
    expect(harness.ctx.deleteKitchenGroup).toHaveBeenCalledWith("kg1");
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("deletes single-selected modules and walls even when multi sets are empty", () => {
    const modules = makeController();
    modules.setSelection({ kind: "module", instanceId: "m1" });
    expect(modules.controller.deleteSelected()).toBe(true);
    expect(modules.ctx.deleteInstance).toHaveBeenCalledWith("m1");

    const walls = makeController();
    walls.setSelection({ kind: "wall", wallId: "w1" });
    expect(walls.controller.deleteSelected()).toBe(true);
    expect(walls.ctx.deleteWall).toHaveBeenCalledWith("w1");

    const columns = makeController();
    columns.setSelection({ kind: "column", columnId: "c1" });
    expect(columns.controller.deleteSelected()).toBe(true);
    expect(columns.ctx.deleteColumn).toHaveBeenCalledWith("c1");
  });

  it("deleteSelected deletes selected module and commits once", () => {
    const harness = makeController();
    harness.setSelection({ kind: "module", instanceId: "m1" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteInstance).toHaveBeenCalledExactlyOnceWith("m1");
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.getSelectedInstanceId()).toBe(null);
    expect(harness.selectedInstanceIds.size).toBe(0);
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected deletes multi-selected modules as one command", () => {
    const harness = makeController();
    harness.setSelection({ kind: "module", instanceId: "m-primary" });
    harness.selectedInstanceIds.add("m1");
    harness.selectedInstanceIds.add("m2");

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteInstance).toHaveBeenCalledTimes(2);
    expect(harness.ctx.deleteInstance).toHaveBeenNthCalledWith(1, "m1");
    expect(harness.ctx.deleteInstance).toHaveBeenNthCalledWith(2, "m2");
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.getSelectedInstanceId()).toBe(null);
    expect(harness.selectedInstanceIds.size).toBe(0);
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected deletes selected wall when multi wall selection is empty", () => {
    const harness = makeController();
    harness.setSelection({ kind: "wall", wallId: "w1" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteWall).toHaveBeenCalledExactlyOnceWith("w1");
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.getSelectedWallId()).toBe(null);
    expect(harness.selectedWallIds.size).toBe(0);
    expect(harness.ctx.commitHistory).not.toHaveBeenCalled();
  });

  it("deleteSelected deletes multi-selected walls as one command", () => {
    const harness = makeController();
    harness.setSelection({ kind: "wall", wallId: "w-primary" });
    harness.selectedWallIds.add("w1");
    harness.selectedWallIds.add("w2");

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteWall).toHaveBeenCalledTimes(2);
    expect(harness.ctx.deleteWall).toHaveBeenNthCalledWith(1, "w1");
    expect(harness.ctx.deleteWall).toHaveBeenNthCalledWith(2, "w2");
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.getSelectedWallId()).toBe(null);
    expect(harness.selectedWallIds.size).toBe(0);
    expect(harness.ctx.commitHistory).not.toHaveBeenCalled();
  });

  it("deleteSelected routes selected window deletion", () => {
    const harness = makeController();
    harness.setSelection({ kind: "window" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteWindow).toHaveBeenCalledTimes(1);
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
    expect(harness.ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected routes selected door deletion", () => {
    const harness = makeController();
    harness.setSelection({ kind: "door" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteDoor).toHaveBeenCalledTimes(1);
    expect(harness.ctx.getSelectedKind()).toBe(null);
    expect(harness.ctx.commitHistory).toHaveBeenCalledTimes(1);
    expect(harness.ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected delegates custom furniture deletion before global selection", () => {
    const deleteCustomFurnitureSelection = vi.fn(() => true);
    const harness = makeController({ deleteCustomFurnitureSelection });
    harness.setSelection({ kind: "wall", wallId: "w1" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteWardrobeSelection).toHaveBeenCalledTimes(1);
    expect(deleteCustomFurnitureSelection).toHaveBeenCalledTimes(1);
    expect(harness.ctx.deleteWall).not.toHaveBeenCalled();
    expect(harness.ctx.deleteInstance).not.toHaveBeenCalled();
    expect(harness.ctx.commitHistory).not.toHaveBeenCalled();
    expect(harness.ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected delegates wardrobe deletion before global selection", () => {
    const deleteCustomFurnitureSelection = vi.fn(() => true);
    const harness = makeController({
      deleteWardrobeSelection: vi.fn(() => true),
      deleteCustomFurnitureSelection
    });
    harness.setSelection({ kind: "module", instanceId: "m1" });

    expect(harness.controller.deleteSelected()).toBe(true);

    expect(harness.ctx.deleteWardrobeSelection).toHaveBeenCalledTimes(1);
    expect(deleteCustomFurnitureSelection).not.toHaveBeenCalled();
    expect(harness.ctx.deleteInstance).not.toHaveBeenCalled();
    expect(harness.ctx.deleteWall).not.toHaveBeenCalled();
    expect(harness.ctx.commitHistory).not.toHaveBeenCalled();
    expect(harness.ctx.mountProps).toHaveBeenCalledTimes(1);
  });

  it("deleteSelected returns false without mutating state when there is no supported selection", () => {
    const harness = makeController();

    expect(harness.controller.deleteSelected()).toBe(false);

    expect(harness.ctx.deleteInstance).not.toHaveBeenCalled();
    expect(harness.ctx.deleteWall).not.toHaveBeenCalled();
    expect(harness.ctx.deleteWindow).not.toHaveBeenCalled();
    expect(harness.ctx.deleteDoor).not.toHaveBeenCalled();
    expect(harness.ctx.deleteKitchenGroup).not.toHaveBeenCalled();
    expect(harness.ctx.deleteSectionInstance).not.toHaveBeenCalled();
    expect(harness.ctx.deleteFloor).not.toHaveBeenCalled();
    expect(harness.ctx.deleteColumn).not.toHaveBeenCalled();
    expect(harness.ctx.deleteUnderlay).not.toHaveBeenCalled();
    expect(harness.ctx.commitHistory).not.toHaveBeenCalled();
    expect(harness.ctx.mountProps).not.toHaveBeenCalled();
  });

  it("routes window, door, underlay, and wardrobe deletion through the shared action", () => {
    const windowHarness = makeController();
    windowHarness.setSelection({ kind: "window" });
    expect(windowHarness.controller.deleteSelected()).toBe(true);
    expect(windowHarness.ctx.deleteWindow).toHaveBeenCalledTimes(1);

    const doorHarness = makeController();
    doorHarness.setSelection({ kind: "door" });
    expect(doorHarness.controller.deleteSelected()).toBe(true);
    expect(doorHarness.ctx.deleteDoor).toHaveBeenCalledTimes(1);

    const underlayHarness = makeController();
    underlayHarness.setSelection({ kind: "underlay" });
    expect(underlayHarness.controller.deleteSelected()).toBe(true);
    expect(underlayHarness.ctx.deleteUnderlay).toHaveBeenCalledTimes(1);

    const wardrobeHarness = makeController({ deleteWardrobeSelection: vi.fn(() => true) });
    expect(wardrobeHarness.controller.deleteSelected()).toBe(true);
    expect(wardrobeHarness.ctx.deleteWardrobeSelection).toHaveBeenCalledTimes(1);
  });
});
