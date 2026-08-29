import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  activateMeasureToolState,
  clearMeasureDraft,
  deactivateMeasureToolState,
  handleGlobalMeasurementClearState,
  stopMeasureToolFromEscape,
  type MeasureGlobalClearContext,
  type MeasureGlobalClearEvent,
  type MeasureToolActivationContext,
  type MeasureToolDeactivationContext
} from "./measureToolStateController";
import type { AppState } from "../layout/appState";
import type { PlacementHelpers } from "../layout/placementManager";

const createContext = (): MeasureToolDeactivationContext => ({
  clearAllMeasurements: vi.fn(),
  clearPreview: vi.fn(),
  clearToolHud: vi.fn(),
  hideHoverCursor: vi.fn(),
  measurePlanSnap: {} as MeasureToolDeactivationContext["measurePlanSnap"],
  measureState: {
    enabled: true,
    measures: ["measure-1"],
    firstPoint: new THREE.Vector3(1, 2, 3),
    firstBinding: { id: "binding-1" },
    hoverPoint: new THREE.Vector3(4, 5, 6),
    hoverSnap: "wall"
  },
  resetMeasureSnapCycle: vi.fn(),
  setFirstPointMarker: vi.fn()
});

const createGlobalClearContext = (): MeasureGlobalClearContext => ({
  ...createContext(),
  args: { measureReadoutEl: { textContent: "Measure: active" } },
  isEscapeKey: vi.fn(() => true),
  setUnderlayStatus: vi.fn()
});

const createKeyboardEvent = (shiftKey: boolean): MeasureGlobalClearEvent => ({
  shiftKey,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn()
});

describe("measureToolStateController", () => {
  it("clears the active measure draft without changing saved measurements", () => {
    const ctx = createContext();

    clearMeasureDraft(ctx);

    expect(ctx.measureState.enabled).toBe(true);
    expect(ctx.measureState.measures).toEqual(["measure-1"]);
    expect(ctx.measureState.firstPoint).toBeNull();
    expect(ctx.measureState.firstBinding).toBeNull();
    expect(ctx.measureState.hoverPoint).toBeNull();
    expect(ctx.measureState.hoverSnap).toBe("none");
  });

  it("preserves current measure tool deactivation behavior", () => {
    const ctx = createContext();

    deactivateMeasureToolState(ctx, { clearSaved: true });

    expect(ctx.measureState.enabled).toBe(false);
    expect(ctx.measureState.firstPoint).toBeNull();
    expect(ctx.measureState.firstBinding).toBeNull();
    expect(ctx.measureState.hoverPoint).toBeNull();
    expect(ctx.measureState.hoverSnap).toBe("none");
    expect(ctx.measurePlanSnap).toBeNull();
    expect(ctx.clearPreview).toHaveBeenCalledOnce();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.resetMeasureSnapCycle).toHaveBeenCalledOnce();
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.setFirstPointMarker).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.clearAllMeasurements).toHaveBeenCalledOnce();
  });

  it("preserves current Measure Escape stop behavior", () => {
    const ctx = {
      ...createContext(),
      setUnderlayStatus: vi.fn(),
      stopMeasureTool: vi.fn()
    };

    stopMeasureToolFromEscape(ctx);

    expect(ctx.measureState.enabled).toBe(false);
    expect(ctx.measureState.firstPoint).toBeNull();
    expect(ctx.measureState.firstBinding).toBeNull();
    expect(ctx.measureState.hoverPoint).toBeNull();
    expect(ctx.measureState.hoverSnap).toBe("none");
    expect(ctx.clearPreview).toHaveBeenCalledOnce();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.setFirstPointMarker).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.stopMeasureTool).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Measure: stopped.");
  });

  it("preserves current measure tool activation behavior", () => {
    const ctx: MeasureToolActivationContext = {
      ...createContext(),
      S: { kitchenEditMode: false } as AppState,
      args: {
        measureBtn: { textContent: "" },
        measureReadoutEl: { textContent: "" }
      },
      cancelKitchenWorktopDraw: vi.fn(),
      cancelPlacement: vi.fn(),
      cancelSectionDraw: vi.fn(),
      clearSelectionForDrawingTool: vi.fn(),
      clearWallDrawState: vi.fn(),
      ensureLayoutMode: vi.fn(),
      mountProps: vi.fn(),
      placement: { active: true },
      placementHelpers: {} as PlacementHelpers,
      resetDimensionDraft: vi.fn(),
      setLayoutTool: vi.fn(),
      setUnderlayStatus: vi.fn(),
      syncSelectionState: vi.fn(),
      updateSelectionHighlights: vi.fn()
    };

    activateMeasureToolState(ctx);

    expect(ctx.ensureLayoutMode).toHaveBeenCalledOnce();
    expect(ctx.cancelPlacement).toHaveBeenCalledExactlyOnceWith(ctx.S, ctx.placementHelpers);
    expect(ctx.setLayoutTool).toHaveBeenCalledExactlyOnceWith("measure");
    expect(ctx.measureState.enabled).toBe(true);
    expect(ctx.resetDimensionDraft).toHaveBeenCalledOnce();
    expect(ctx.measureState.firstPoint).toBeNull();
    expect(ctx.measureState.firstBinding).toBeNull();
    expect(ctx.measureState.hoverPoint).toBeNull();
    expect(ctx.measureState.hoverSnap).toBe("none");
    expect(ctx.clearPreview).toHaveBeenCalledOnce();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.resetMeasureSnapCycle).toHaveBeenCalledOnce();
    expect(ctx.setFirstPointMarker).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.clearWallDrawState).toHaveBeenCalledOnce();
    expect(ctx.cancelSectionDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.cancelKitchenWorktopDraw).toHaveBeenCalledExactlyOnceWith({ silent: true });
    expect(ctx.clearSelectionForDrawingTool).toHaveBeenCalledOnce();
    expect(ctx.syncSelectionState).toHaveBeenCalledOnce();
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.args.measureBtn.textContent).toBe("Measure: On");
    expect(ctx.args.measureReadoutEl.textContent).toBe("Measure: klikni prvy bod.");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Measure: klikni prvy roh alebo hranu.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("ignores global measurement clear when Shift+Escape is not pressed", () => {
    const ctx = createGlobalClearContext();
    const ev = createKeyboardEvent(false);

    const result = handleGlobalMeasurementClearState(ctx, ev);

    expect(result).toBe(false);
    expect(ctx.clearAllMeasurements).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
  });

  it("ignores global measurement clear when there is no measurement state to clear", () => {
    const ctx = createGlobalClearContext();
    ctx.measureState.measures = [];
    ctx.measureState.firstPoint = null;
    ctx.measureState.hoverPoint = null;
    const ev = createKeyboardEvent(true);

    const result = handleGlobalMeasurementClearState(ctx, ev);

    expect(result).toBe(false);
    expect(ctx.clearAllMeasurements).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.stopPropagation).not.toHaveBeenCalled();
  });

  it("preserves current global measurement clear behavior", () => {
    const ctx = createGlobalClearContext();
    const ev = createKeyboardEvent(true);

    const result = handleGlobalMeasurementClearState(ctx, ev);

    expect(result).toBe(true);
    expect(ctx.clearAllMeasurements).toHaveBeenCalledOnce();
    expect(ctx.measureState.firstPoint).toBeNull();
    expect(ctx.measureState.firstBinding).toBeNull();
    expect(ctx.measureState.hoverPoint).toBeNull();
    expect(ctx.measureState.hoverSnap).toBe("none");
    expect(ctx.measurePlanSnap).toBeNull();
    expect(ctx.clearPreview).toHaveBeenCalledOnce();
    expect(ctx.clearToolHud).toHaveBeenCalledOnce();
    expect(ctx.resetMeasureSnapCycle).toHaveBeenCalledOnce();
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.setFirstPointMarker).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.args.measureReadoutEl.textContent).toBe("Measure: klikni prvy bod.");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Measurements cleared.");
    expect(ev.preventDefault).toHaveBeenCalledOnce();
    expect(ev.stopPropagation).toHaveBeenCalledOnce();
  });
});
