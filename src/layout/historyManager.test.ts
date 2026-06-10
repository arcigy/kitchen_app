import { describe, expect, it, vi } from "vitest";
import { captureLayoutSnapshot, clearSelectionBeforeSnapshotRestore, snapshotSignature } from "./historyManager";
import type { AppState } from "./appState";
import type { WardrobeEditSaveState } from "./wardrobeEditMode";

const createWardrobeState = (widthMm: number): WardrobeEditSaveState => ({
  activeGroupId: "wardrobe-1",
  groups: [
    {
      id: "wardrobe-1",
      name: "Wardrobe",
      params: {
        widthMm,
        heightMm: 2200,
        depthMm: 600,
        corpusMaterialId: "mat.body",
        corpusThicknessMm: 18,
        backMaterialId: "mat.back",
        backThicknessMm: 6,
        innerMaterialId: "mat.inner",
        innerThicknessMm: 18,
        innerJointPriority: "horizontal"
      },
      parts: [],
      nextPartIndex: 1,
      selectedPartId: null
    }
  ]
});

const createState = (wardrobe: WardrobeEditSaveState | null): AppState =>
  ({
    mode: "layout",
    viewMode: "2d",
    wallCounter: 1,
    walls: [],
    floorCounter: 1,
    floors: [],
    columnCounter: 1,
    columns: [],
    sectionCounter: 1,
    sections: [],
    worktopCounter: 1,
    kitchenWorktops: [],
    customFurnitureCounter: 1,
    customFurniture: [],
    instanceCounter: 1,
    instances: [],
    pinnedWallIds: new Set<string>(),
    pinnedInstanceIds: new Set<string>(),
    underlayState: { pinned: false },
    selectedKind: null,
    selectedWallId: null,
    selectedWallIds: new Set<string>(),
    selectedFloorId: null,
    selectedColumnId: null,
    selectedSectionId: null,
    selectedInstanceId: null,
    selectedInstanceIds: new Set<string>(),
    wardrobeHistory: { getSaveState: () => wardrobe }
  }) as unknown as AppState;

describe("layout history wardrobe snapshots", () => {
  it("captures wardrobe state and includes it in the snapshot signature", () => {
    const first = captureLayoutSnapshot(createState(createWardrobeState(1000)));
    const second = captureLayoutSnapshot(createState(createWardrobeState(1200)));

    expect(first.wardrobe?.groups[0]?.params.widthMm).toBe(1000);
    expect(second.wardrobe?.groups[0]?.params.widthMm).toBe(1200);
    expect(snapshotSignature(first)).not.toBe(snapshotSignature(second));
  });
});

describe("layout history restore selection cleanup", () => {
  it("clears current selection before restoring a snapshot", () => {
    const state = createState(null);
    state.selectedWallIds.add("wall-1");
    state.selectedWallIds.add("wall-2");
    state.selectedInstanceIds.add("module-1");
    state.selectedInstanceIds.add("module-2");
    const helpers = {
      setSelectedWall: vi.fn(),
      setSelectedModule: vi.fn(),
      setSelectedColumn: vi.fn(),
      setSelectedSection: vi.fn(),
      updateSelectionHighlights: vi.fn()
    };

    clearSelectionBeforeSnapshotRestore(state, helpers);

    expect(helpers.setSelectedWall).toHaveBeenCalledExactlyOnceWith(null);
    expect(helpers.setSelectedModule).toHaveBeenCalledExactlyOnceWith(null);
    expect(helpers.setSelectedColumn).toHaveBeenCalledExactlyOnceWith(null);
    expect(helpers.setSelectedSection).toHaveBeenCalledExactlyOnceWith(null);
    expect([...state.selectedWallIds]).toEqual([]);
    expect([...state.selectedInstanceIds]).toEqual([]);
    expect(helpers.updateSelectionHighlights).toHaveBeenCalledOnce();
  });
});
