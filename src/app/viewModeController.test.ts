import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createViewModeController } from "./viewModeController";
import type { AppState } from "../layout/appState";
import type { MeasureState } from "./measureTools";

function makeContext(overrides: Partial<Parameters<typeof createViewModeController>[0]> = {}) {
  const calls: string[] = [];
  const ctx = {
    S: { viewMode: "3d", kitchenEditMode: false } as AppState,
    activeDetailClipPlanes: [],
    activeViewerTab: "3d",
    args: {
      measureBtn: { textContent: "" } as HTMLButtonElement,
      measureReadoutEl: { textContent: "" } as HTMLElement,
      propertiesEl: { hidden: false } as HTMLElement
    },
    buildUi: { style: { display: "" } } as HTMLElement,
    cabinetGroup: null,
    cancelPlacement: vi.fn(),
    clearAllMeasurements: vi.fn(),
    clearOverlapHighlight: vi.fn(),
    clearWallDrawState: vi.fn(),
    columns: [],
    doors: [],
    drawOrthoToggleEl: null,
    drawSnapOverlay: { hide: vi.fn(() => calls.push("drawSnapOverlay.hide")) },
    ensurePickAndOutline: vi.fn(),
    floors: [],
    handleKitchenWorktopEscape: vi.fn(),
    hideHoverCursor: vi.fn(() => calls.push("hideHoverCursor")),
    instanceEditorHost: { style: { display: "" } } as HTMLElement,
    instances: [],
    kitchenWorktopDraw: { active: false },
    kitchenWorktops: [],
    layoutRoot: new THREE.Group(),
    layoutTool: "select",
    layoutUi: { style: { display: "" } } as HTMLElement,
    makeKitchenWorktopOutlineGeometry: vi.fn(() => new THREE.BufferGeometry()),
    measureState: { enabled: false, measures: [] } as unknown as MeasureState,
    mode: "layout",
    mountControls: vi.fn(),
    mountProps: vi.fn(() => calls.push("mountProps")),
    partsBuildHost: { style: { display: "" } } as HTMLElement,
    partsLayoutHost: { style: { display: "" } } as HTMLElement,
    placement: { active: false },
    placementHelpers: {},
    rebuild: vi.fn(),
    rebuildWallPlanMesh: vi.fn(() => calls.push("rebuildWallPlanMesh")),
    selectMesh: vi.fn(),
    selectedFloorId: null,
    selectedColumnId: null,
    selectedInstanceId: null,
    selectedKind: null,
    selectedSectionId: null,
    selectedWallId: null,
    setInstanceSelected: vi.fn(),
    setPlanPresentation: vi.fn(),
    setSelectedFloor: vi.fn(),
    setSelectedColumn: vi.fn(),
    setSelectedDoor: vi.fn(),
    setSelectedModule: vi.fn(),
    setSelectedSection: vi.fn(),
    setSelectedWall: vi.fn(),
    setSelectedWindow: vi.fn(),
    setViewMode: vi.fn(() => calls.push("setViewMode")),
    showNoProps: vi.fn(),
    syncDetailClippingAndMaterials: vi.fn(() => calls.push("syncDetailClippingAndMaterials")),
    syncColumnPresentation: vi.fn(() => calls.push("syncColumnPresentation")),
    syncDoorSelectionVisuals: vi.fn(() => calls.push("syncDoorSelectionVisuals")),
    syncViewerTabs: vi.fn(() => calls.push("syncViewerTabs")),
    syncWindowSelectionVisuals: vi.fn(() => calls.push("syncWindowSelectionVisuals")),
    updateAllSectionVisuals: vi.fn(() => calls.push("updateAllSectionVisuals")),
    updateDetailSliceOverlay: vi.fn(() => calls.push("updateDetailSliceOverlay")),
    updateLayoutPanel: vi.fn(),
    updateSelectionHighlights: vi.fn(() => calls.push("updateSelectionHighlights")),
    view2d: { checked: true } as HTMLInputElement,
    viewMode: "3d",
    viewNavigation: { syncControls: vi.fn(() => calls.push("viewNavigation.syncControls")) },
    wallPlanGroup: new THREE.Group(),
    wallSnapMarkers: new THREE.Group(),
    walls: [],
    windowEditorHost: { style: { display: "" } } as HTMLElement,
    windows: [],
    windowInst: null,
    doorInst: null,
    ...overrides
  } as unknown as Parameters<typeof createViewModeController>[0];
  return { calls, ctx };
}

describe("createViewModeController", () => {
  it("refreshes selection highlights in the current setView2d side-effect order", () => {
    const { calls, ctx } = makeContext();
    const controller = createViewModeController(ctx);

    controller.setView2d(true);

    expect(ctx.updateSelectionHighlights).toHaveBeenCalledExactlyOnceWith();
    expect(calls).toEqual([
      "setViewMode",
      "syncViewerTabs",
      "viewNavigation.syncControls",
      "syncWindowSelectionVisuals",
      "syncDoorSelectionVisuals",
      "syncColumnPresentation",
      "updateSelectionHighlights",
      "updateAllSectionVisuals",
      "updateDetailSliceOverlay",
      "rebuildWallPlanMesh",
      "syncDetailClippingAndMaterials"
    ]);
  });
});
