import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { applyOpeningSwingControlAction, applyOpeningSwingControlEdit, handleOpeningSelectionControlClick } from "./pointerOpeningSwingControls";

describe("pointer opening swing controls", () => {
  it("toggles handedness using the current left/right behavior", () => {
    const params = { swingDirection: "right" as const, swingSide: "outward" as const };

    applyOpeningSwingControlAction(params, "toggleHandedness");
    expect(params).toEqual({ swingDirection: "left", swingSide: "outward" });

    applyOpeningSwingControlAction(params, "toggleHandedness");
    expect(params).toEqual({ swingDirection: "right", swingSide: "outward" });
  });

  it("toggles swing side using the current inward/outward behavior", () => {
    const params = { swingDirection: "right" as const, swingSide: "outward" as const };

    applyOpeningSwingControlAction(params, "toggleSwingSide");
    expect(params).toEqual({ swingDirection: "right", swingSide: "inward" });

    applyOpeningSwingControlAction(params, "toggleSwingSide");
    expect(params).toEqual({ swingDirection: "right", swingSide: "outward" });
  });

  it("applies swing edit and runs the current update/select/history flow", () => {
    const instance = {
      params: {
        swingDirection: "right" as const,
        swingSide: "outward" as const
      }
    };
    const updateTransform = vi.fn();
    const selectOpening = vi.fn();
    const mountProps = vi.fn();
    const commitHistory = vi.fn();

    expect(
      applyOpeningSwingControlEdit({
        action: "toggleHandedness",
        instance,
        updateTransform,
        selectOpening,
        mountProps,
        commitHistory
      })
    ).toBe(true);

    expect(instance.params.swingDirection).toBe("left");
    expect(updateTransform).toHaveBeenCalledExactlyOnceWith(instance);
    expect(selectOpening).toHaveBeenCalledOnce();
    expect(mountProps).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
  });

  it("does not run update flow without an opening instance", () => {
    const updateTransform = vi.fn();
    const selectOpening = vi.fn();
    const mountProps = vi.fn();
    const commitHistory = vi.fn();

    expect(
      applyOpeningSwingControlEdit({
        action: "toggleSwingSide",
        instance: null,
        updateTransform,
        selectOpening,
        mountProps,
        commitHistory
      })
    ).toBe(false);

    expect(updateTransform).not.toHaveBeenCalled();
    expect(selectOpening).not.toHaveBeenCalled();
    expect(mountProps).not.toHaveBeenCalled();
    expect(commitHistory).not.toHaveBeenCalled();
  });

  function openingClickHandlers(overrides: Partial<Parameters<typeof handleOpeningSelectionControlClick<string, string>>[0]> = {}) {
    return {
      applyDoorSwingControlAction: vi.fn(() => false),
      applyWindowSwingControlAction: vi.fn(() => false),
      beginDoorDimensionEdit: vi.fn(() => false),
      beginWindowDimensionEdit: vi.fn(() => false),
      button: 0,
      cancelPendingMarquee: vi.fn(),
      pickDoorDimensionParam: vi.fn(() => null),
      pickDoorSwingControlAction: vi.fn(() => null),
      pickWindowDimensionParam: vi.fn(() => null),
      pickWindowSwingControlAction: vi.fn(() => null),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...overrides
    };
  }

  it("handles window swing controls before other opening controls", () => {
    const args = openingClickHandlers({
      applyWindowSwingControlAction: vi.fn(() => true),
      pickWindowSwingControlAction: vi.fn(() => "toggleHandedness" as const),
      pickDoorSwingControlAction: vi.fn(() => "toggleSwingSide" as const)
    });

    expect(handleOpeningSelectionControlClick(args)).toBe(true);

    expect(args.applyWindowSwingControlAction).toHaveBeenCalledExactlyOnceWith("toggleHandedness");
    expect(args.pickDoorSwingControlAction).not.toHaveBeenCalled();
    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.preventDefault).toHaveBeenCalledOnce();
    expect(args.stopPropagation).toHaveBeenCalledOnce();
  });

  it("falls through from swing controls to window then door dimension controls", () => {
    const args = openingClickHandlers({
      pickWindowDimensionParam: vi.fn(() => "widthMm"),
      beginWindowDimensionEdit: vi.fn(() => true),
      pickDoorDimensionParam: vi.fn(() => "heightMm")
    });

    expect(handleOpeningSelectionControlClick(args)).toBe(true);

    expect(args.beginWindowDimensionEdit).toHaveBeenCalledExactlyOnceWith("widthMm");
    expect(args.pickDoorDimensionParam).not.toHaveBeenCalled();
    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.preventDefault).toHaveBeenCalledOnce();
    expect(args.stopPropagation).toHaveBeenCalledOnce();
  });

  it("handles door dimension controls when earlier opening controls do not handle", () => {
    const args = openingClickHandlers({
      pickDoorDimensionParam: vi.fn(() => "heightMm"),
      beginDoorDimensionEdit: vi.fn(() => true)
    });

    expect(handleOpeningSelectionControlClick(args)).toBe(true);

    expect(args.beginDoorDimensionEdit).toHaveBeenCalledExactlyOnceWith("heightMm");
    expect(args.cancelPendingMarquee).toHaveBeenCalledOnce();
    expect(args.preventDefault).toHaveBeenCalledOnce();
    expect(args.stopPropagation).toHaveBeenCalledOnce();
  });

  it("ignores non-left clicks for opening selection controls", () => {
    const args = openingClickHandlers({
      button: 2,
      pickWindowSwingControlAction: vi.fn(() => "toggleHandedness" as const)
    });

    expect(handleOpeningSelectionControlClick(args)).toBe(false);

    expect(args.pickWindowSwingControlAction).not.toHaveBeenCalled();
    expect(args.cancelPendingMarquee).not.toHaveBeenCalled();
    expect(args.preventDefault).not.toHaveBeenCalled();
    expect(args.stopPropagation).not.toHaveBeenCalled();
  });
});
